import { NAV_KEYS, loadNavigationState } from '../../src/storage/db_nav.js';
import { tableStoreKeys } from '../../src/modules/table_store.js';

function toColumnsFromPayload(payload) {
  if (!Array.isArray(payload?.sheet?.columns)) return [];
  return payload.sheet.columns.map((c) => c?.name || c?.key).filter(Boolean);
}

function recordsFromRowsV2(rowsV2, columns) {
  return (rowsV2 || []).map((r) => {
    const cells = {};
    for (let i = 0; i < columns.length; i += 1) cells[columns[i]] = r.cells?.[i] ?? '';
    return {
      id: r.id || crypto.randomUUID(),
      cells,
      subrows: Array.isArray(r.subrows) ? r.subrows : [],
      createdAt: r.createdAt || null,
      updatedAt: r.updatedAt || null
    };
  });
}

function recordsFromLegacyRows(rows) {
  return (rows || []).map((r) => {
    const src = r?.exportData || r?.data || {};
    return {
      id: r?.id || crypto.randomUUID(),
      cells: { ...src },
      subrows: Array.isArray(r?.subrows) ? r.subrows : [],
      createdAt: r?.createdAt || null,
      updatedAt: r?.updatedAt || null
    };
  });
}

/**
 * Create source/target adapter for newversion storage.
 * This ensures backup/export reads from the primary source (storage), not UI-rendered tables.
 */
export function createNewversionSourceAdapter(storage, { tableDatasetPrefix = 'tableStore:dataset:' } = {}) {
  if (!storage || typeof storage.get !== 'function' || typeof storage.set !== 'function') {
    throw new Error('storage with get/set is required');
  }

  async function listJournals() {
    const nav = await loadNavigationState(storage);
    return Array.isArray(nav.journals) ? nav.journals : [];
  }

  async function resolveJournal(journalKeyOrId) {
    const journals = await listJournals();
    return journals.find((j) => (j.key === journalKeyOrId || j.id === journalKeyOrId)) || null;
  }

  function datasetKey(journalId) {
    return `${tableDatasetPrefix}${journalId}`;
  }

  async function loadDatasetV2(journalId) {
    const meta = await storage.get(tableStoreKeys.meta(journalId));
    if (!meta) return null;
    const rawOrder = await storage.get(tableStoreKeys.order(journalId));
    const order = Array.isArray(rawOrder) ? rawOrder : [];
    const records = [];
    for (const rid of order) {
      const rec = await storage.get(tableStoreKeys.record(journalId, rid));
      if (rec) records.push(rec);
    }
    return { journalId, meta, records };
  }

  async function saveDatasetV2(journalId, incomingRecords, { mode = 'merge' } = {}) {
    const current = await loadDatasetV2(journalId);
    const currentRecords = Array.isArray(current?.records) ? current.records : [];

    let records;
    if (mode === 'replace') {
      records = incomingRecords;
    } else {
      const byId = new Map(currentRecords.map((r) => [r.id, r]));
      for (const r of incomingRecords) byId.set(r.id, r);
      records = [...byId.values()];
    }

    const order = records.map((r) => r.id);
    const rawPrevOrder = await storage.get(tableStoreKeys.order(journalId));
    const prevOrder = Array.isArray(rawPrevOrder) ? rawPrevOrder : [];
    const keep = new Set(order.map(String));

    await storage.set(tableStoreKeys.meta(journalId), {
      ...(current?.meta || {}),
      updatedAt: new Date().toISOString(),
      revision: Number(current?.meta?.revision ?? 0) + 1
    });
    await storage.set(tableStoreKeys.order(journalId), order);
    for (const r of records) await storage.set(tableStoreKeys.record(journalId, r.id), r);
    for (const rid of prevOrder) {
      if (!keep.has(String(rid))) await storage.del(tableStoreKeys.record(journalId, rid));
    }

    const rawIndex = await storage.get(tableStoreKeys.index);
    const idx = Array.isArray(rawIndex) ? rawIndex : [];
    const ids = idx
      .map((item) => (typeof item === 'string' ? item : item?.journalId))
      .filter(Boolean);
    if (!ids.includes(journalId)) {
      await storage.set(tableStoreKeys.index, [...ids, journalId]);
    }
  }

  async function saveRecordsToJournal(journalId, incomingRecords, { mode = 'merge' } = {}) {
    await saveDatasetV2(journalId, incomingRecords, { mode });

    // Backward-compat mirror for old exports that still read tableStore:dataset:*.
    const key = datasetKey(journalId);
    const legacyCurrent = await storage.get(key);
    const persisted = await loadDatasetV2(journalId);
    await storage.set(key, {
      ...(legacyCurrent || {}),
      journalId,
      schema: legacyCurrent?.schema || null,
      records: Array.isArray(persisted?.records) ? persisted.records : incomingRecords,
      merges: Array.isArray(legacyCurrent?.merges) ? legacyCurrent.merges : []
    });
  }

  return {
    listJournals() {
      return listJournals();
    },

    async loadJournalSchema(journalId) {
      const dataset = await loadDatasetV2(journalId) || await storage.get(datasetKey(journalId));
      return dataset?.schema || { fields: [] };
    },

    async loadJournalRecords(journalId) {
      const dataset = await loadDatasetV2(journalId) || await storage.get(datasetKey(journalId));
      return Array.isArray(dataset?.records) ? dataset.records : [];
    },

    async loadJournalExportProfile(journalId) {
      return await storage.get(`@sdo/module-table-renderer:settings:${journalId}`) || null;
    },

    async loadSettings() {
      return {
        core: await storage.get(NAV_KEYS.coreSettings),
        tableGlobal: await storage.get('@sdo/module-table-renderer:settings')
      };
    },

    async loadNavigation() {
      return await loadNavigationState(storage);
    },

    async loadTransfer() {
      return {
        templates: await storage.get('transfer:templates:v1')
      };
    },

    async saveJournalPayload(journalKey, payload, { mode = 'merge' } = {}) {
      const journal = await resolveJournal(journalKey);
      const journalId = journal?.id || journalKey;

      const rowsV2 = Array.isArray(payload?.rowsV2) ? payload.rowsV2 : [];
      const columns = toColumnsFromPayload(payload);

      let incomingRecords = recordsFromRowsV2(rowsV2, columns);
      if (!incomingRecords.length && Array.isArray(payload?.rows)) {
        incomingRecords = recordsFromLegacyRows(payload.rows);
      }

      await saveRecordsToJournal(journalId, incomingRecords, { mode });
    },

    async saveJournalRecords(journalKeyOrId, records, { mode = 'merge' } = {}) {
      const journal = await resolveJournal(journalKeyOrId);
      const journalId = journal?.id || journalKeyOrId;
      const incoming = Array.isArray(records) ? records : [];
      await saveRecordsToJournal(journalId, incoming, { mode });
    },

    async saveSettings(payload, { mode = 'merge' } = {}) {
      if (mode === 'replace') {
        await storage.set(NAV_KEYS.coreSettings, payload?.core || {});
        await storage.set('@sdo/module-table-renderer:settings', payload?.tableGlobal || {});
        return;
      }
      const core = (await storage.get(NAV_KEYS.coreSettings)) || {};
      const table = (await storage.get('@sdo/module-table-renderer:settings')) || {};
      await storage.set(NAV_KEYS.coreSettings, { ...core, ...(payload?.core || {}) });
      await storage.set('@sdo/module-table-renderer:settings', { ...table, ...(payload?.tableGlobal || {}) });
    },

    async saveNavigation(payload) {
      if (!payload) return;
      await storage.set(NAV_KEYS.spaces, payload.spaces || []);
      await storage.set(NAV_KEYS.journals, payload.journals || []);
      await storage.set(NAV_KEYS.lastLoc, payload.lastLoc || null);
      await storage.set(NAV_KEYS.history, payload.history || []);
    },

    async saveTransfer(payload, { mode = 'merge' } = {}) {
      const key = 'transfer:templates:v1';
      if (mode === 'replace') {
        await storage.set(key, payload?.templates || []);
        return;
      }
      const cur = (await storage.get(key)) || [];
      const byId = new Map((Array.isArray(cur) ? cur : []).map((x) => [x.id, x]));
      for (const t of (payload?.templates || [])) {
        if (t?.id) byId.set(t.id, { ...(byId.get(t.id) || {}), ...t });
      }
      await storage.set(key, [...byId.values()]);
    }
  };
}
