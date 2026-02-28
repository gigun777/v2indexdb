import { canGoBackJournal, canGoBackSpace } from '../core/navigation_core.js';
import { createSpace, addSpace, deleteSpaceSubtree } from '../core/spaces_tree_core.js';
import { deleteJournalSubtree } from '../core/journal_tree_core.js';
function ensureArray(x){ return Array.isArray(x)?x:(x==null?[]:[x]); }

import { h } from './ui_primitives.js';
import { createModalManager } from './ui_modal.js';
import './theme.js';
import './ui_manager.js';
import './ui_backup.js';
import './ui_toast.js';
import './settings/settings_registry.js';
import './settings/settings_state.js';
import './settings/features_table_settings.js';
import './settings/features_uxui_settings.js';
import './settings/settings_init.js';
// Legacy settings shell modal removed (SWS v2 is the only settings UI)

function findById(items, id) {
  return items.find((item) => item.id === id) ?? null;
}


// Opens QuickNav as its own modal root (SettingsWindow v2), using the same SWSQuickNav screen 1:1.
// SWS-based modal screen for adding a journal (index + template picker).
// Opens on top of QuickNav, focuses index, Enter=add, Esc=back.
async function openAddJournalModal({ sdo, parentId, noNavigate = false }) {
  const SW = window.SettingsWindow;
  if (!SW) { console.warn('SettingsWindow not loaded'); return; }
  const templates = await (sdo.journalTemplates?.listTemplateEntities?.() ?? Promise.resolve([]));
  if (!templates || templates.length === 0) {
    if (window.UI?.toast?.show) window.UI.toast.show('Оберіть шаблон: список шаблонів порожній', { type: 'warning' });
    return;
  }

  let selectedTpl = null;

  const body = document.createElement('div');
  body.className = 'sws-body';

  const card = document.createElement('div');
  card.className = 'sws-card';

  const rowIdx = document.createElement('div');
  rowIdx.className = 'sws-row';
  const idxLabel = document.createElement('div');
  idxLabel.className = 'sws-label';
  idxLabel.textContent = 'Індекс журналу';
  const idxInput = document.createElement('input');
  idxInput.className = 'sws-input';
  idxInput.type = 'text';
  idxInput.inputMode = 'text';
  idxInput.placeholder = 'наприклад: A1, 1.1, Кадри';
  rowIdx.append(idxLabel, idxInput);

  const rowSearch = document.createElement('div');
  rowSearch.className = 'sws-row';
  const tplLabel = document.createElement('div');
  tplLabel.className = 'sws-label';
  tplLabel.textContent = 'Шаблон журналу';
  const tplSearch = document.createElement('input');
  tplSearch.className = 'sws-input';
  tplSearch.placeholder = 'Пошук шаблонів…';
  rowSearch.append(tplLabel, tplSearch);

  const warn = document.createElement('div');
  warn.className = 'sws-hint';
  warn.style.color = 'var(--sws-danger, #b00020)';
  warn.style.display = 'none';

  const rowList = document.createElement('div');
  rowList.className = 'sws-row';
  const listLabel = document.createElement('div');
  listLabel.className = 'sws-label';
  listLabel.textContent = 'Шаблони (список)';

  const listWrap = document.createElement('div');
  listWrap.className = 'sws-list';
  // Only the list scrolls, not the whole modal.
  listWrap.style.maxHeight = '260px';
  listWrap.style.overflow = 'auto';
  listWrap.style.border = '1px solid rgba(0,0,0,0.12)';
  listWrap.style.borderRadius = '10px';
  listWrap.style.padding = '6px';
  listWrap.style.background = 'rgba(255,255,255,0.6)';

  const addBtn = document.createElement('button');
  addBtn.className = 'sws-btn sws-primary';
  addBtn.textContent = 'Додати';
  addBtn.style.width = '100%';
  addBtn.style.marginTop = '12px';
  addBtn.disabled = true;

  function templateMatches(t, q){
    const hay = ((t.title||'') + ' ' + (t.id||'')).toLowerCase();
    return hay.includes(q);
  }

  function renderList() {
    const qRaw = (tplSearch.value || '');
    const q = qRaw.trim().toLowerCase();
    const filtered = (q.length >= 1)
      ? templates.filter((t) => templateMatches(t, q))
      : templates;

    listWrap.innerHTML = '';
    for (const tpl of filtered) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'sws-btn';
      b.style.width = '100%';
      b.style.textAlign = 'left';
      b.style.margin = '4px 0';
      b.textContent = tpl.title || tpl.id;
      if (selectedTpl && selectedTpl.id === tpl.id) {
        b.classList.add('sws-primary');
      }
      b.onclick = async () => {
        selectedTpl = tpl;
        warn.style.display = 'none';
        addBtn.disabled = false;
        renderList();
      };
      listWrap.appendChild(b);
    }

    if (!selectedTpl) addBtn.disabled = true;
  }

  tplSearch.addEventListener('input', () => renderList());

  // Initial list render: show all templates by default.
  renderList();

  rowList.append(listLabel, listWrap);

async function doAdd() {
    if (!selectedTpl) {
      warn.textContent = 'Оберіть шаблон журналу';
      warn.style.display = 'block';
      tplSearch.focus();
      return;
    }
    const idxLabelText = (idxInput.value || '').trim();

    await sdo.commit((next) => {
      const node = {
        id: crypto.randomUUID(),
        spaceId: next.activeSpaceId,
        parentId,
        templateId: selectedTpl.id,
        title: (selectedTpl.title || 'Новий журнал') + (idxLabelText ? (' ' + idxLabelText) : ''),
        childCount: 0,
      };
      next.journals = [...(next.journals || []), node];
      if(!noNavigate) next.activeJournalId = node.id;
    }, ['journals_nodes_v2', 'nav_last_loc_v2']);

    try { SW.pop(); } catch (_) {}
  }

  addBtn.onclick = doAdd;

  const onKey = (ev) => {
    if (ev.key === 'Escape') {
      ev.preventDefault();
      try { SW.pop(); } catch (_) {}
    }
    if (ev.key === 'Enter') {
      ev.preventDefault();
      doAdd();
    }
  };

  card.append(rowIdx, rowSearch, rowList, warn, addBtn);
  body.append(card);

  SW.push({
    title: 'Додати журнал',
    subtitle: 'Вкажіть індекс та шаблон',
    saveLabel: 'Додати',
    content: () => body,
    onSave: doAdd,
    onMount: () => {
      rebuildSelect();
      document.addEventListener('keydown', onKey, true);
      setTimeout(() => idxInput.focus(), 0);
      rebuildSelect();
    },
    onUnmount: () => {
      document.removeEventListener('keydown', onKey, true);
    },
  });
};

function openQuickNavRoot({ sdo }) {
  const SW = window.SettingsWindow;
  const QN = window.SWSQuickNav;
  if (!SW || !QN) {
    console.warn('QuickNav: SettingsWindow or SWSQuickNav not loaded');
    return;
  }

  const buildJTreeSnapshot = (st) => {
    const nodes = {};
    const topIds = [];
    const list = Array.isArray(st.journals)
      ? st.journals.filter((j) => j && j.spaceId === st.activeSpaceId)
      : [];

    // Index journals by id and keep original ordering hints
    const meta = {};
    for (const j of list) {
      meta[j.id] = { idx: typeof j.index === 'number' ? j.index : 1e9, title: String(j.title || j.name || '') };
      nodes[j.id] = {
        id: j.id,
        title: j.title || j.name || j.id,
        key: j.key || j.id,
        parentId: j.parentId || null,
        children: [],
      };
    }

    // Build children arrays + topIds
    for (const j of list) {
      const pid = j.parentId || st.activeSpaceId;
      if (nodes[pid]) nodes[pid].children.push(j.id);
      else topIds.push(j.id);
    }

    const sortIds = (ids) => {
      ids.sort((a, b) => {
        const A = meta[a] || { idx: 1e9, title: '' };
        const B = meta[b] || { idx: 1e9, title: '' };
        if (A.idx !== B.idx) return A.idx - B.idx;
        return A.title.localeCompare(B.title);
      });
    };

    sortIds(topIds);
    for (const id of Object.keys(nodes)) {
      sortIds(nodes[id].children);
    }

    return { nodes, topIds };
  };

  

  const open = async () => {
    SW.openCustomRoot(() => {
      QN.openQuickNavScreen({
        getData: async () => {
          const st = sdo.getState();
          const spaces = Array.isArray(st.spaces) ? st.spaces : [];
          // Map spaces to the shape expected by QuickNav
          const mappedSpaces = spaces.map((sp) => ({
            id: sp.id,
            name: sp.name || sp.title || sp.id,
            title: sp.title || sp.name || sp.id,
            parentId: sp.parentId || null,
            kind: 'space',
          }));
          return {
            spaces: mappedSpaces,
            activeSpaceId: st.activeSpaceId || (mappedSpaces[0]?.id ?? null),
            jtree: buildJTreeSnapshot(st),
            activeJournalId: st.activeJournalId || null,
          };
        },
        // Event-driven sync for QuickNav (no polling): re-render when SDO state changes.
        subscribe: (handler) => {
          try {
            return sdo.on('state:changed', () => {
              try { handler(); } catch (_) {}
            });
          } catch (e) {
            return null;
          }
        },
        onGoSpace: async (spaceId) => {
          const stNow = sdo.getState();
          sdo.commit((next) => {
            next.activeSpaceId = spaceId;
            // When switching space, pick first root journal in that space (if any)
            const roots = (Array.isArray(stNow.journals) ? stNow.journals : [])
              .filter((j) => j && j.spaceId === spaceId && (!j.parentId || j.parentId === spaceId));
            next.activeJournalId = roots[0]?.id ?? null;
          });
        },
        onGoJournalPath: async (pathIds) => {
          const targetId = Array.isArray(pathIds) ? pathIds[pathIds.length - 1] : null;
          if (!targetId) return;
          sdo.commit((next) => {
            next.activeJournalId = targetId;
          });
          // Close QuickNav after choosing
          try { SW.close(); } catch (e) {}
        },
        allowAdd: true,
        allowDelete: true,
        onAddSpace: async (arg) => {
          const parentSpaceId = (arg && typeof arg === "object") ? (arg.parentSpaceId ?? null) : (arg ?? null);
          const noNavigate = (arg && typeof arg === "object") ? !!arg.noNavigate : false;
          const title = window.prompt('Назва підпростору:', 'Новий простір');
          if (!title) return;
          await sdo.commit((next) => {
            const node = createSpace(title, parentSpaceId || null);
            next.spaces = addSpace(next.spaces, node);
            if(!noNavigate){
              next.activeSpaceId = node.id;
              next.activeJournalId = null;
            }
          }, ['spaces_nodes_v2', 'nav_last_loc_v2']);
        },
        onDeleteSpace: async (spaceId) => {
          await sdo.commit((next) => {
            const res = deleteSpaceSubtree(next.spaces, spaceId);
            next.spaces = res.nodes;
            // Remove journals that belong to removed spaces
            next.journals = next.journals.filter((j) => j && !res.removedIds.has(j.spaceId));
            // Fix active
            if (res.removedIds.has(next.activeSpaceId)) {
              next.activeSpaceId = next.spaces[0]?.id ?? null;
              const roots = next.journals.filter((j) => j && j.spaceId === next.activeSpaceId && (!j.parentId || j.parentId === next.activeSpaceId));
              next.activeJournalId = roots[0]?.id ?? null;
            }
            if (next.activeJournalId && !next.journals.some((j) => j.id === next.activeJournalId)) {
              next.activeJournalId = null;
            }
          }, ['spaces_nodes_v2', 'journals_nodes_v2', 'nav_last_loc_v2']);
        },
        onAddJournalCurrentLevel: async ({ activeJournalId, activeSpaceId, focusJournalId, focusSpaceId }) => {
          const stNow = sdo.getState();
          const spaceId = focusSpaceId || activeSpaceId || stNow.activeSpaceId || null;
          if(!spaceId) return;
          let parentId = spaceId;
          const basisJournalId = focusJournalId || activeJournalId || null;
          if(basisJournalId){
            const j = (stNow.journals||[]).find(x=>x && x.id===basisJournalId);
            parentId = j?.parentId || spaceId;
          }
          await openAddJournalModal({ sdo, parentId, noNavigate: true });
        },
        onAddJournalChild: async (pathIds) => {
          const parentId = Array.isArray(pathIds) && pathIds.length ? pathIds[pathIds.length - 1] : (sdo.getState().activeSpaceId || null);
          await openAddJournalModal({ sdo, parentId: parentId, noNavigate: true });
        },
        onDeleteJournal: async (journalId) => {
          await sdo.commit((next) => {
            const res = deleteJournalSubtree(next.journals, journalId);
            next.journals = res.nodes;
            if (res.removedIds.has(next.activeJournalId)) next.activeJournalId = null;
          }, ['journals_nodes_v2', 'nav_last_loc_v2']);
        },
      });
    });
  };

  open();
}

export function createModuleManagerUI({ sdo, mount, api }) {
  if (!mount) return null;

  function setStatus(message) {
    if (window.UI?.toast?.show) {
      window.UI.toast.show(message, { type: 'info' });
    }
  }
  const navigationHost = h('div', { class: 'sdo-navigation' });
  const toolbar = h('div', { class: 'sdo-toolbar' });
  const tableToolbarHost = h('div', { class: 'sdo-table-toolbar-host' });
  const panelsHost = h('div', { class: 'sdo-panels' });
  const settingsHost = h('div', { class: 'sdo-settings' });
  settingsHost.style.display = 'none';
  const modalLayer = h('div', { class: 'sdo-modal-layer' });
  const modal = createModalManager(modalLayer);

  function ensureGlobalUIBridge() {
    const UI = (window.UI = window.UI || {});
    UI.settings = UI.settings || {};

    if (!UI.modal || typeof UI.modal.open !== 'function' || typeof UI.modal.close !== 'function') {
      let modalSeq = 0;
      const modalStack = [];

      function closeModalRecord(record) {
        if (!record) return;
        record.cleanup?.();
        record.overlay.remove();
        const idx = modalStack.findIndex((item) => item.id === record.id);
        if (idx >= 0) modalStack.splice(idx, 1);
        try { record.onClose?.(); } catch (_) {}
      }

      function getTopRecord() {
        return modalStack[modalStack.length - 1] || null;
      }

      UI.modal = {
        open(options = {}) {
          modalSeq += 1;
          const modalId = String(modalSeq);

          const overlay = document.createElement('div');
          overlay.className = 'sdo-ui-modal-overlay ui-modal';
          overlay.dataset.modalId = modalId;
          // Ensure the modal is ALWAYS above any other UI layers (incl. SWS v2).
          // Use a very high z-index and increment per modal.
          overlay.style.position = 'fixed';
          overlay.style.inset = '0';
          overlay.style.zIndex = String(999000 + modalSeq);

          const windowNode = document.createElement('div');
          windowNode.className = 'sdo-ui-modal-window';

          const wrapper = h('div', { class: 'ui-modal-content' });
          if (options.title) {
            wrapper.append(h('h3', { class: 'ui-modal-title' }, [options.title]));
          }
          if (options.contentNode) wrapper.append(options.contentNode);
          else if (options.html) {
            const htmlHost = h('div', { class: 'ui-modal-html' });
            htmlHost.innerHTML = options.html;
            wrapper.append(htmlHost);
          }

          windowNode.append(wrapper);
          overlay.append(windowNode);
          document.body.appendChild(overlay);

          const onKeydown = (event) => {
            if (event.key !== 'Escape') return;
            if (options.escClose === false) return;
            const top = getTopRecord();
            if (top?.id !== modalId) return;
            event.preventDefault();
            this.close(modalId);
          };

          const onOverlayMouseDown = (event) => {
            if (options.closeOnOverlay === false) return;
            if (event.target !== overlay) return;
            const top = getTopRecord();
            if (top?.id !== modalId) return;
            this.close(modalId);
          };

          document.addEventListener('keydown', onKeydown);
          overlay.addEventListener('mousedown', onOverlayMouseDown);

          const record = {
            id: modalId,
            overlay,
            onClose: typeof options.onClose === 'function' ? options.onClose : null,
            cleanup() {
              document.removeEventListener('keydown', onKeydown);
              overlay.removeEventListener('mousedown', onOverlayMouseDown);
            }
          };

          modalStack.push(record);
          return modalId;
        },
        close(modalId) {
          if (modalId) {
            const target = modalStack.find((item) => item.id === String(modalId));
            closeModalRecord(target);
            return;
          }
          closeModalRecord(getTopRecord());
        },
        alert(text, opts = {}) {
          const node = h('div', { class: 'ui-modal-content' }, [h('p', {}, [String(text || '')])]);
          return this.open({ title: opts.title || 'Увага', contentNode: node, onClose: opts.onClose });
        },
        confirm(text, opts = {}) {
          return new Promise((resolve) => {
            let settled = false;
            const finalize = async (value) => {
              if (settled) return;
              settled = true;
              resolve(value);
            };

            const content = h('div', { class: 'ui-modal-content' }, [
              h('p', {}, [String(text || opts.title || 'Підтвердити дію?')])
            ]);
            const actions = h('div', { class: 'ui-modal-footer' }, [
              h('button', {
                class: 'btn',
                onClick: () => {
                  UI.modal.close(modalId);
                  finalize(false);
                }
              }, [opts.cancelText || 'Скасувати']),
              h('button', {
                class: 'btn btn-primary',
                onClick: () => {
                  UI.modal.close(modalId);
                  finalize(true);
                }
              }, [opts.okText || 'Підтвердити'])
            ]);
            content.append(actions);

            const modalId = UI.modal.open({
              title: opts.title || 'Підтвердження',
              contentNode: content,
              closeOnOverlay: false,
              onClose: () => finalize(false)
            });
          });
        }
      };
    }

    if (!UI.toast || typeof UI.toast.show !== 'function') {
      UI.toast = {
        async show(message) {
          console.info('[UI.toast]', message);
        }
      };
    }
  }

  ensureGlobalUIBridge();

  const addModuleButton = h('button', {
    class: 'sdo-add-module',
    onClick: async () => {
      const url = window.prompt('Module ESM URL:');
      if (!url) return;
      try {
        await sdo.loadModuleFromUrl(url);
        setStatus(`Module loaded: ${url}`);
      } catch (error) {
        setStatus(`Load failed: ${error.message}`);
      }
    }
  }, ['+ Додати модуль']);

  const templatesButton = h('button', {
    class: 'sdo-add-module',
    onClick: () => openTemplatesManager()
  }, ['Шаблони']);

  const settingsButton = h('button', {
    class: 'sdo-icon-btn sdo-settings-gear',
    onClick: () => openSettingsModal()
  }, ['⚙']);

  // Backup / Import-Export button (next to Settings)
  const backupButton = h('button', {
    class: 'sdo-icon-btn sdo-backup-btn',
    title: 'Backup / Імпорт / Експорт',
    onClick: () => openBackupModal()
  }, ['💾']);

  const themeButton = h('button', {
    class: 'sdo-icon-btn sdo-theme-toggle',
    title: 'День/Ніч',
    onClick: () => { try { window.UITheme?.toggleTheme?.(); } catch (_) {} }
  }, ['◐']);

  function closeModal() { modal.close(); }

  function openPicker({ title, kind, items, currentId, getId, onSelect, onAddCurrentLevel, getLabel, getLeftNeighbor, getRightNeighbor }) {
    const idOf = typeof getId === 'function' ? getId : (x) => x?.id;
    let selectedId = currentId ?? (items && items[0] ? idOf(items[0]) : null);

    const header = h('div', { class: 'sdo-picker-header' });
    const titleEl = h('div', { class: 'sdo-picker-title' });

    const navRow = h('div', { class: 'sdo-picker-navrow' });
    const leftBtn = h('button', { class: 'sdo-picker-navbtn' }, ['←']);
    const rightBtn = h('button', { class: 'sdo-picker-navbtn' }, ['→']);
    navRow.append(leftBtn, rightBtn);

    const list = h('div', { class: 'sdo-picker-list' });

    function getSelectedItem() {
      return (items || []).find((it) => idOf(it) === selectedId) || (items && items[0]) || null;
    }

    function renderHeader() {
      const cur = getSelectedItem();
      const label = cur ? getLabel(cur) : '';
      if (kind) titleEl.textContent = `${kind}: ${label}`;
      else titleEl.textContent = title || '';
      const hasCustom = (typeof getLeftNeighbor === 'function') || (typeof getRightNeighbor === 'function');
      if (hasCustom) {
        const left = typeof getLeftNeighbor === 'function' ? getLeftNeighbor(cur) : null;
        const right = typeof getRightNeighbor === 'function' ? getRightNeighbor(cur) : null;
        leftBtn.disabled = !left;
        rightBtn.disabled = !right;
      } else {
        leftBtn.disabled = !items || items.length < 2;
        rightBtn.disabled = !items || items.length < 2;
      }
    }

    async function selectByOffset(delta) {
      if (!items || items.length === 0) return;
      const idx = Math.max(0, items.findIndex((it) => idOf(it) === selectedId));
      const nextIdx = (idx + delta + items.length) % items.length;
      const next = items[nextIdx];
      if (!next) return;
      selectedId = idOf(next);
      await onSelect(next);
      renderAll(); // keep picker open
    }

    leftBtn.onclick = async () => {
      const cur = getSelectedItem();
      if (typeof getLeftNeighbor === 'function') {
        const left = getLeftNeighbor(cur);
        if (!left) return;
        await onSelect(left);
        closeModal();
        return;
      }
      await selectByOffset(-1);
    };
    rightBtn.onclick = async () => {
      const cur = getSelectedItem();
      if (typeof getRightNeighbor === 'function') {
        const right = getRightNeighbor(cur);
        if (!right) return;
        await onSelect(right);
        closeModal();
        return;
      }
      await selectByOffset(1);
    };

    async function renderList() {
      list.innerHTML = '';
      for (const item of items || []) {
        const row = h('button', {
          class: `sdo-picker-row ${idOf(item) === selectedId ? 'is-selected' : ''}`,
          onClick: async () => {
            await onSelect(item);
            closeModal();
          }
        }, [getLabel(item)]);
        list.append(row);
      }
    }

    async function renderAll() {
      renderHeader();
      rebuildSelect();
    }

    const modalChildren = [
      header,
      list
    ];
    header.append(titleEl);
    header.append(navRow);

    if (typeof onAddCurrentLevel === 'function') {
      modalChildren.push(h('button', {
        class: 'sdo-picker-add',
        onClick: async () => {
          closeModal();
          await onAddCurrentLevel();
        }
      }, ['+ Додати на цей рівень']));
    }

    modalChildren.push(h('button', { class: 'sdo-picker-close', onClick: closeModal }, ['Закрити']));
    modal.open(h('div', { class: 'sdo-picker-modal' }, modalChildren), { closeOnOverlay: true });
    renderAll();
  }

  // Tree picker for selecting current Space/Journal at any level.
  // Arrows always enabled:
  //   ← goes to parent (if none: shows notice)
  //   → goes to first child (if none: shows notice)
  // Picker stays open on arrow navigation, closes only when selecting an item from the list or pressing Close.
  function openTreePicker({ kind, getCurrent, getSiblings, getParent, getFirstChild, getId, getLabel, onSelect, onAddCurrentLevel, noticeNoParent, noticeNoChildren }) {
    const idOf = typeof getId === 'function' ? getId : (x) => x?.id;

    // Persistent overlay appended to <body> so it doesn't disappear on app re-renders/state commits
    const overlay = document.createElement('div');
    overlay.className = 'sdo-picker-overlay';
    const host = document.createElement('div');
    host.className = 'sdo-picker-modal';
    overlay.appendChild(host);

    const closePicker = async () => {
      try { overlay.remove(); } catch (_) {}
      try { document.body.classList.remove('sdo-modal-open'); } catch (_) {}
    };

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closePicker();
    });

    document.body.appendChild(overlay);
    document.body.classList.add('sdo-modal-open');

    const header = h('div', { class: 'sdo-picker-header' });
    const titleEl = h('div', { class: 'sdo-picker-title' });
    const navRow = h('div', { class: 'sdo-picker-navrow' });
    const leftBtn = h('button', { class: 'sdo-picker-navbtn' }, ['←']);
    const rightBtn = h('button', { class: 'sdo-picker-navbtn' }, ['→']);
    navRow.append(leftBtn, rightBtn);

    const noticeEl = h('div', { class: 'sdo-picker-notice', style: 'display:none;' });
    const list = h('div', { class: 'sdo-picker-list' });

    let current = (typeof getCurrent === 'function' ? getCurrent() : null) || null;
    let selectedId = current ? idOf(current) : null;

    function showNotice(msg) {
      if (!msg) return;
      noticeEl.textContent = msg;
      noticeEl.style.display = '';
      clearTimeout(showNotice._t);
      showNotice._t = setTimeout(() => {
        noticeEl.style.display = 'none';
        noticeEl.textContent = '';
      }, 1600);
    }

    async function render() {
      current = (typeof getCurrent === 'function' ? getCurrent() : current) || current || null;
      selectedId = current ? idOf(current) : selectedId;

      const label = current ? getLabel(current) : '';
      titleEl.textContent = `${kind}: ${label}`;

      // Always active by requirement
      leftBtn.disabled = false;
      rightBtn.disabled = false;

      const siblings = ensureArray(typeof getSiblings === 'function' ? getSiblings(current) : []);
      list.innerHTML = '';
      if (siblings.length === 0) {
        list.append(h('div', { class: 'sdo-picker-empty' }, ['— Немає елементів на цьому рівні —']));
      } else {
        for (const item of siblings) {
          const row = h('button', {
            class: `sdo-picker-row ${idOf(item) === selectedId ? 'is-selected' : ''}`,
            onClick: async () => {
              await onSelect(item);
              closePicker(); // closes on selecting space/journal
            }
          }, [getLabel(item)]);
          list.append(row);
        }
      }
    }

    async function goParent() {
      const p = typeof getParent === 'function' ? getParent(current) : null;
      if (!p) {
        showNotice(noticeNoParent || `Цей ${kind.toLowerCase()} не має батьківського рівня`);
        return;
      }
      await onSelect(p);
      requestAnimationFrame(() => { if (!document.body.contains(overlay)) document.body.appendChild(overlay); });
      render();
    }

    async function goFirstChild() {
      const ch = typeof getFirstChild === 'function' ? getFirstChild(current) : null;
      if (!ch) {
        showNotice(noticeNoChildren || `Цей ${kind.toLowerCase()} не має дочірніх`);
        return;
      }
      await onSelect(ch);
      requestAnimationFrame(() => { if (!document.body.contains(overlay)) document.body.appendChild(overlay); });
      render();
    }

    leftBtn.onclick = (e) => { try{e?.stopPropagation?.(); e?.preventDefault?.();}catch(_){} goParent(); };
    rightBtn.onclick = (e) => { try{e?.stopPropagation?.(); e?.preventDefault?.();}catch(_){} goFirstChild(); };

    header.append(titleEl, navRow, noticeEl);
    const footer = h('div', { class: 'sdo-picker-footer' });
    if (typeof onAddCurrentLevel === 'function') {
      footer.append(h('button', {
        class: 'sdo-picker-add',
        onClick: async () => {
          try { await onAddCurrentLevel(current); } catch (e) { console.error(e); }
          render();
        }
      }, ['+ Додати на цей рівень']));
    }
    footer.append(h('button', { class: 'sdo-picker-close', onClick: closePicker }, ['Закрити']));

    host.append(header, list, footer);
    render();
  }


  // Picker for selecting a CHILD of the current parent, with left/right switching the PARENT
  // and auto-selecting the first child of the neighboring parent.
  
function openChildPicker({ kind, parents, currentParentId, getParentId, getParentLabel, getChildren, getChildId, getChildLabel, onSelectChild }) {
    const pid = typeof getParentId === 'function' ? getParentId : (x) => x?.id;
    const cid = typeof getChildId === 'function' ? getChildId : (x) => x?.id;

    // Persistent overlay appended to <body> so it doesn't disappear on app re-renders/state commits
    const overlay = document.createElement('div');
    overlay.className = 'sdo-picker-overlay';
    const host = document.createElement('div');
    host.className = 'sdo-picker-modal';
    overlay.appendChild(host);

    const closePicker = async () => {
      try { overlay.remove(); } catch (_) {}
      try { document.body.classList.remove('sdo-modal-open'); } catch (_) {}
    };

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closePicker();
    });

    document.body.appendChild(overlay);
    document.body.classList.add('sdo-modal-open');

    let parentIdx = Math.max(0, (parents || []).findIndex((p) => pid(p) === currentParentId));
    if (!Number.isFinite(parentIdx) || parentIdx < 0) parentIdx = 0;

    let children = ensureArray(getChildren?.((parents || [])[parentIdx]));
    let selectedChildId = children?.[0] ? cid(children[0]) : null;

    const header = h('div', { class: 'sdo-picker-header' });
    const titleEl = h('div', { class: 'sdo-picker-title' });
    const navRow = h('div', { class: 'sdo-picker-navrow' });
    const leftBtn = h('button', { class: 'sdo-picker-navbtn' }, ['←']);
    const rightBtn = h('button', { class: 'sdo-picker-navbtn' }, ['→']);
    navRow.append(leftBtn, rightBtn);

    const list = h('div', { class: 'sdo-picker-list' });

    function renderHeader() {
      const parent = parents?.[parentIdx] || null;
      const label = parent ? getParentLabel(parent) : '';
      titleEl.textContent = `${kind}: ${label}`;
      leftBtn.disabled = !parents || parents.length < 2;
      rightBtn.disabled = !parents || parents.length < 2;
    }

    async function renderList() {
      list.innerHTML = '';
      if (!children || children.length === 0) {
        list.append(h('div', { class: 'sdo-picker-empty' }, ['— Немає елементів на цьому рівні —']));
        return;
      }
      for (const ch of children) {
        list.append(h('button', {
          class: `sdo-picker-row ${cid(ch) === selectedChildId ? 'is-selected' : ''}`,
          onClick: async () => {
            selectedChildId = cid(ch);
            await onSelectChild(ch);
            closePicker();
          }
        }, [getChildLabel(ch)]));
      }
    }

    async function switchParent(delta) {
      if (!parents || parents.length === 0) return;
      parentIdx = (parentIdx + delta + parents.length) % parents.length;
      const parent = parents[parentIdx];
      children = ensureArray(getChildren?.(parent));
      const first = children?.[0] || null;
      selectedChildId = first ? cid(first) : null;

      // Switch selection immediately but KEEP picker open
      if (first) {
        await onSelectChild(first);
        // Ensure picker overlay stays mounted even if app rerender replaces DOM
        requestAnimationFrame(()=>{
          if(!document.body.contains(overlay)) document.body.appendChild(overlay);
        });
      }
      renderAll();
    }

    leftBtn.onclick = (e) => { try{e?.stopPropagation?.(); e?.preventDefault?.();}catch(_){} switchParent(-1); };
    rightBtn.onclick = (e) => { try{e?.stopPropagation?.(); e?.preventDefault?.();}catch(_){} switchParent(1); };

    async function renderAll() {
      renderHeader();
      rebuildSelect();
    }

    header.append(titleEl, navRow);
    const footer = h('div', { class: 'sdo-picker-footer' });
    if (typeof onAddCurrentLevel === 'function') {
      footer.append(h('button', {
        class: 'sdo-picker-add',
        onClick: async () => {
          try { await onAddCurrentLevel(current); } catch (e) { console.error(e); }
          render();
        }
      }, ['+ Додати на цей рівень']));
    }
    footer.append(h('button', { class: 'sdo-picker-close', onClick: closePicker }, ['Закрити']));

    host.append(header, list, footer);
    renderAll();
  }

async function openTemplatesManager() {
    let selectedId = null;
    let deleteArmed = false;

    const title = h('div', { class: 'sdo-picker-title' }, ['Шаблони журналів']);
    const listHost = h('div', { class: 'sdo-picker-list' });
    const detailsHost = h('div', { class: 'sdo-template-details' }, ['Оберіть шаблон']);
    const actions = h('div', { class: 'sdo-template-actions' });

    async function refresh() {
      const templates = await sdo.journalTemplates.listTemplateEntities();
      if (!selectedId && templates[0]) selectedId = templates[0].id;
      if (selectedId && !templates.some((t) => t.id === selectedId)) selectedId = templates[0]?.id ?? null;

      listHost.innerHTML = '';
      for (const tpl of templates) {
        listHost.append(h('button', {
          class: `sdo-picker-row ${tpl.id === selectedId ? 'is-selected' : ''}`,
          onClick: () => {
            selectedId = tpl.id;
            deleteArmed = false;
            refresh();
          }
        }, [`${tpl.title} (${tpl.columns.length})`]));
      }

      const selected = templates.find((x) => x.id === selectedId) ?? null;
      if (!selected) {
        detailsHost.innerHTML = 'Немає шаблонів';
      } else {
        detailsHost.innerHTML = '';
        detailsHost.append(h('div', { class: 'sdo-template-title' }, [`ID: ${selected.id}`]));
        for (const col of selected.columns) {
          detailsHost.append(h('div', { class: 'sdo-template-col' }, [`• ${col.label} (${col.key})`]));
        }
      }

      actions.innerHTML = '';
      actions.append(
        h('button', {
          class: 'sdo-picker-add',
          onClick: async () => {
            const id = window.prompt('ID шаблону (без пробілів):', 'new-template');
            if (!id) return;
            const titleValue = window.prompt('Назва шаблону:', id) ?? id;
            const colsRaw = window.prompt('Назви колонок через кому:', '1,2,3');
            if (!colsRaw) return;
            const labels = colsRaw.split(',').map((x) => x.trim()).filter(Boolean);
            await sdo.journalTemplates.addTemplate({
              id,
              title: titleValue,
              columns: labels.map((label, idx) => ({ key: `c${idx + 1}`, label }))
            });
            selectedId = id;
            deleteArmed = false;
            await refresh();
          }
        }, ['Додати шаблон']),
        h('button', {
          class: 'sdo-picker-close',
          onClick: async () => {
            if (!selectedId) return;
            if (!deleteArmed) {
              deleteArmed = true;
              await refresh();
              return;
            }
            await sdo.journalTemplates.deleteTemplate(selectedId);
            selectedId = null;
            deleteArmed = false;
            await refresh();
          }
        }, [deleteArmed ? 'Так, видалити' : 'Видалити шаблон']),
        h('button', {
          class: 'sdo-picker-close',
          onClick: () => {
            deleteArmed = false;
            closeModal();
          }
        }, [deleteArmed ? 'Ні' : 'Закрити'])
      );
    }

    const modalEl = h('div', { class: 'sdo-picker-modal' }, [title, listHost, detailsHost, actions]);
    modal.open(modalEl, { closeOnOverlay: true });
    await refresh();
  }

  async function openSettingsModal() {
    const SW = window.SettingsWindow;
    if (!SW || typeof SW.openRoot !== 'function') {
      const msg = 'SettingsWindow v2 не підключено: перевірте index.html (sws_modal.js/css/html).';
      if (window.UI?.toast?.error) window.UI.toast.error(msg);
      else window.alert(msg);
      return;
    }

    // Ensure initialized once
    try { SW.init?.(); } catch (_) {}

    const uiToast = window.UI?.toast;

    const slugify = (s) => String(s || '').toLowerCase()
      .trim()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_\u0400-\u04FF]+/g, '')
      .replace(/^_+|_+$/g, '');

    // NOTE: must be synchronous. TransferCore expects a plain object with get/set/del.
    // If this becomes async, callers MUST await it, otherwise TransferCore will
    // receive a Promise and crash with "storage.get is not a function".
    const kvStorage = (base) => {
      if (!base || typeof base.get !== 'function' || typeof base.set !== 'function' || typeof base.del !== 'function') {
        throw new Error('UI.storage must be provided (IndexedDB storage adapter).');
      }
      return base;
    };


    // Build list of "sheets" for transfer templates settings. In template-oriented transfer this list must
    // represent JOURNAL TEMPLATES (not concrete journals).
    async function buildSheets() {
      const sheets = [];
      let entities = [];
      try {
        entities = await sdo.journalTemplates.listTemplateEntities();
      } catch (_) {
        entities = [];
      }
      for (const ent of Array.isArray(entities) ? entities : []) {
        const tplId = ent.id;
        if (!tplId) continue;
        let tpl = null;
        try {
          tpl = await sdo.journalTemplates.getTemplate(tplId);
        } catch (_) {
          tpl = null;
        }
        let columns = [];
        if (tpl && Array.isArray(tpl.columns) && tpl.columns.length) {
          columns = tpl.columns.map(c => ({ id: c.key, name: c.label ?? c.key }));
        } else {
          columns = [{ id: 'c1', name: 'Колонка 1' }];
        }
        const name = ent.title || ent.name || tpl?.title || tplId;
        sheets.push({ key: tplId, name, columns });
      }
      if (!sheets.length) sheets.push({ key: 'default', name: 'Default', columns: [{ id: 'c1', name: 'Колонка 1' }] });
      return sheets;
    }

    function openAddJournalTemplateScreen() {
      let title = '';
      let count = 5;
      let colNames = Array(count).fill('').map((_,i)=>`Колонка ${i+1}`);

      const computeCanSave = () => title.trim().length > 0 && count > 0 && colNames.every(n => String(n||'').trim().length>0);

      SW.push({
        title: 'Додати шаблон журналу',
        subtitle: 'Назва шаблону, кількість колонок та їх назви',
        saveLabel: 'Створити',
        canSave: () => computeCanSave(),
        onSave: async () => {
          const baseId = 'custom_' + (slugify(title) || 'template');
          let id = baseId;
          let n = 2;
          const existing = await sdo.journalTemplates.listTemplateEntities();
          const ids = new Set(existing.map(t => t.id));
          while (ids.has(id)) { id = baseId + '_' + (n++); }
          const columns = Array.from({length: count}).map((_,i)=>({ key: `c${i+1}`, label: colNames[i].trim() }));
          await sdo.journalTemplates.addTemplate({ id, title: title.trim(), columns });
          if (uiToast?.success) uiToast.success(`Шаблон створено: ${title.trim()}`);
          else if (uiToast?.show) uiToast.show(`Шаблон створено: ${title.trim()}`);
          else window.alert(`Шаблон створено: ${title.trim()}`);
          SW.pop();
        },
        content: (ctx) => {
          const ui = ctx.ui;
          const wrap = ui.el('div','');

          const syncSave = async () => {
            try { ctx.setSaveEnabled(!!computeCanSave()); } catch (_) {}
          };

          const titleInput = ui.input({
            value: title,
            placeholder: 'Напр.: Вхідні документи',
            onChange: (v) => { title = v; syncSave(); }
          });
          wrap.appendChild(ui.controlRow({ label: 'Назва шаблону', help: '', controlEl: titleInput }));

          const countInput = ui.input({
            value: String(count),
            type: 'number',
            placeholder: '5',
            onChange: (v) => {
              const next = Math.max(1, Math.min(50, parseInt(v||'0',10) || 1));
              if (next === count) return;
              count = next;
              const nextArr = Array(count).fill('');
              for (let i=0;i<Math.min(colNames.length,count);i++) nextArr[i]=colNames[i];
              for (let i=0;i<count;i++) if (!nextArr[i]) nextArr[i]=`Колонка ${i+1}`;
              colNames = nextArr;
              renderCols();
              syncSave();
            }
          });
          countInput.min = '1';
          countInput.max = '50';
          wrap.appendChild(ui.controlRow({ label: 'Кількість колонок', help: '1–50', controlEl: countInput }));

          const colsCardBody = ui.el('div','');
          const colsCard = ui.card({ title: 'Назви колонок', description: '', children: [colsCardBody] });
          wrap.appendChild(colsCard);

          function renderCols(){
            colsCardBody.innerHTML='';
            for (let i=0;i<count;i++){
              const inp = ui.input({
                value: colNames[i] || '',
                placeholder: `Колонка ${i+1}`,
                onChange: (v)=>{ colNames[i]=v; syncSave(); }
              });
              colsCardBody.appendChild(ui.controlRow({ label: `${i+1}.`, help: '', controlEl: inp }));
            }
          }
          renderCols();

          // Initialize save state on first render
          syncSave();

          return wrap;
        }
      });
    }

    async function openJournalTemplatesListScreen(){
      let templates = await sdo.journalTemplates.listTemplateEntities();
      let deleteArmedId = null;

      const makeTplLabel = (t) => t?.title || t?.name || t?.id || 'Без назви';

      SW.push({
        title: 'Шаблони журналів',
        subtitle: 'Перелік шаблонів журналів та видалення',
        content: (ctx) => {
          const ui = ctx.ui;
          const wrap = ui.el('div','');
          const list = ui.el('div','sws-list');
          wrap.appendChild(list);

          const render = async () => {
            list.innerHTML = '';
            (templates || []).forEach((t) => {
              const row = ui.el('div','sws-item');
              const left = ui.el('div','sws-item-left');
              left.appendChild(ui.el('div','sws-item-label', makeTplLabel(t)));
              left.appendChild(ui.el('div','sws-item-desc', `${t?.columns?.length||0} колонок • ${t?.id||''}`.trim()));

              const actions = ui.el('div','sws-item-actions');
              const delBtn = ui.el('button', `sws-mini-btn sws-mini-danger ${deleteArmedId===t.id?'is-armed':''}`, deleteArmedId===t.id ? 'Підтв' : '🗑');
              delBtn.title = deleteArmedId===t.id ? 'Підтвердити видалення' : 'Видалити шаблон';
              delBtn.onclick = async (ev) => {
                ev.stopPropagation();
                if (!t?.id) return;
                if (deleteArmedId !== t.id) {
                  deleteArmedId = t.id;
                  render();
                  return;
                }
                if (!window.confirm(`Видалити шаблон журналу “${makeTplLabel(t)}”?`)) {
                  deleteArmedId = null;
                  render();
                  return;
                }
                await sdo.journalTemplates.deleteTemplate(t.id);
                templates = await sdo.journalTemplates.listTemplateEntities();
                deleteArmedId = null;
                uiToast?.success?.('Шаблон видалено') ?? uiToast?.show?.('Шаблон видалено');
                render();
              };

              actions.appendChild(delBtn);
              row.appendChild(left);
              row.appendChild(actions);
              row.appendChild(ui.el('div','sws-chevron','›'));

              row.onclick = async () => {
                deleteArmedId = null;
                const tpl = await sdo.journalTemplates.getTemplate(t.id);
                SW.push({
                  title: makeTplLabel(t),
                  subtitle: `ID: ${t.id}`,
                  content: (ctx2) => {
                    const ui2 = ctx2.ui;
                    const w = ui2.el('div','');
                    const colsBody = ui2.el('div','');
                    (tpl?.columns||[]).forEach(c => colsBody.appendChild(ui2.el('div','sws-muted', `• ${c.label} (${c.key})`)));
                    w.appendChild(ui2.card({ title: 'Колонки', description: '', children: [colsBody] }));
                    return w;
                  }
                });
              };

              list.appendChild(row);
            });
          };

          render();
          return wrap;
        }
      });
    }

    const { createTransferCore } = await import('../core/transfer_core.js');
    const transferCore = createTransferCore({ storage: kvStorage(window.UI?.storage) });

    
    async function openTransferTemplatesScreen(){
      const sheets = await buildSheets();
      let templates = await transferCore.loadTemplates();
      let deleteArmedId = null;

      const makeTplLabel = (t) => t?.name || t?.title || t?.id || 'Без назви';

      const refresh = async (ctx) => {
        templates = await transferCore.loadTemplates();
        if (ctx && typeof ctx.render === 'function') ctx.render();
      };

      SW.push({
        title: 'Перенесення',
        subtitle: 'Шаблони перенесення',
        content: (ctx) => {
          const ui = ctx.ui;
          const wrap = ui.el('div','');
          const list = ui.el('div','sws-list');
          wrap.appendChild(list);

          const render = async () => {
            list.innerHTML = '';

            templates.forEach((t, i) => {
              const row = ui.el('div','sws-item');
              const left = ui.el('div','sws-item-left');
              left.appendChild(ui.el('div','sws-item-label', makeTplLabel(t)));
              left.appendChild(ui.el('div','sws-item-desc', `${t?.routes?.length||0} маршрут(ів)`));

              const actions = ui.el('div','sws-item-actions');

              const delBtn = ui.el('button', `sws-mini-btn sws-mini-danger ${deleteArmedId===t.id?'is-armed':''}`, deleteArmedId===t.id ? 'Підтв' : '🗑');
              delBtn.title = deleteArmedId===t.id ? 'Підтвердити видалення' : 'Видалити шаблон';
              delBtn.onclick = async (ev) => {
                ev.stopPropagation();
                if (deleteArmedId !== t.id) {
                  deleteArmedId = t.id;
                  render();
                  return;
                }
                if (!window.confirm(`Видалити шаблон перенесення “${makeTplLabel(t)}”?`)) {
                  deleteArmedId = null;
                  render();
                  return;
                }
                templates.splice(i, 1);
                await transferCore.saveTemplates(templates);
                deleteArmedId = null;
                uiToast?.success?.('Шаблон видалено') ?? uiToast?.show?.('Шаблон видалено');
                await refresh({ render });
              };

              const che = ui.el('div','sws-chevron','›');

              actions.appendChild(delBtn);
              row.appendChild(left);
              row.appendChild(actions);
              row.appendChild(che);

              row.onclick = async () => {
                deleteArmedId = null;
                templates = await transferCore.loadTemplates();
                const tpl = templates[i];
                if (!tpl) return;
                openTransferTemplateEditor({ sheets, templates, idx: i });
              };

              list.appendChild(row);
            });

            const addBtn = ui.el('button','sws-btn-primary','+ Додати шаблон');
            addBtn.onclick = async () => {
              templates = await transferCore.loadTemplates();
              const next = { id: crypto.randomUUID(), name: 'Новий шаблон', fromSheetKey: sheets[0]?.key, toSheetKey: sheets[0]?.key, routes: [] };
              templates.push(next);
              await transferCore.saveTemplates(templates);
              uiToast?.success?.('Шаблон додано') ?? uiToast?.show?.('Шаблон додано');
              await refresh({ render });
            };
            list.appendChild(addBtn);
          };

          render();
          return wrap;
        }
      });
    }

    
    async function openTransferTemplateEditor({ sheets, templates, idx }){
      const t = templates[idx];
      let name = t.name || 'Шаблон';
      let fromSheetKey = t.fromSheetKey || sheets[0]?.key;
      let toSheetKey = t.toSheetKey || sheets[0]?.key;

      const sheetOptions = sheets.map(s=>({ value: s.key, label: s.name }));

      SW.push({
        title: name,
        subtitle: 'Маршрути перенесення',
        saveLabel: 'Зберегти',
        canSave: ()=> true,
        onSave: async ()=>{
          t.name = name;
          t.fromSheetKey = fromSheetKey;
          t.toSheetKey = toSheetKey;
          await transferCore.saveTemplates(templates);
          uiToast?.success?.('Шаблон збережено') ?? uiToast?.show?.('Шаблон збережено');
        },
        content: (ctx)=>{
          const ui=ctx.ui;
          const wrap=ui.el('div','');

          const nameInp = ui.input({ value: name, placeholder: 'Назва шаблону', onChange:(v)=>{ name=v; } });
          wrap.appendChild(ui.controlRow({ label:'Назва', help:'', controlEl:nameInp }));

          const fromSel = ui.select({ value: fromSheetKey, options: sheetOptions, onChange:(v)=>{ fromSheetKey=v; } });
          wrap.appendChild(ui.controlRow({ label:'З листа', help:'', controlEl: fromSel }));

          const toSel = ui.select({ value: toSheetKey, options: sheetOptions, onChange:(v)=>{ toSheetKey=v; } });
          wrap.appendChild(ui.controlRow({ label:'У лист', help:'', controlEl: toSel }));

          const routesCardBody = ui.el('div','');
          const routesCard = ui.card({ title:'Маршрути', description:'Кожен маршрут пише в одну цільову колонку', children:[routesCardBody] });
          wrap.appendChild(routesCard);

          const renderRoutes = ()=>{
            routesCardBody.innerHTML='';
            const routes = Array.isArray(t.routes)?t.routes: (t.routes=[]);
            const toSheet = sheets.find(s=>s.key===toSheetKey) || sheets[0];

            const moveRoute = (fromIdx, toIdx) => {
              if (toIdx < 0) toIdx = 0;
              if (toIdx >= routes.length) toIdx = routes.length - 1;
              if (fromIdx === toIdx) return;
              const [it] = routes.splice(fromIdx, 1);
              routes.splice(toIdx, 0, it);
            };

            for(let i=0;i<routes.length;i++){
              const rr=routes[i];
              const tgt = Number.isFinite(+rr.targetCol)?(+rr.targetCol):0;
              const tgtName = toSheet?.columns?.[tgt]?.name || `Колонка ${tgt+1}`;

              const row = ui.el('div','sws-item');
              const left = ui.el('div','sws-item-left');

              const labelRow = ui.el('div','sws-route-row');
              const orderBtn = ui.el('button','sws-mini-btn sws-mini-order', String(i+1));
              orderBtn.title = 'Змінити номер (перемістити)';
              orderBtn.onclick = (ev)=>{
                ev.stopPropagation();
                const raw = window.prompt('Новий номер (1…'+routes.length+'):', String(i+1));
                if (!raw) return;
                const n = Math.max(1, Math.min(routes.length, parseInt(raw,10)|| (i+1)));
                moveRoute(i, n-1);
                renderRoutes();
              };

              const label = ui.el('div','sws-item-label', `→ ${tgtName}`);
              labelRow.appendChild(orderBtn);
              labelRow.appendChild(label);
              left.appendChild(labelRow);

              left.appendChild(ui.el('div','sws-item-desc', `${(rr.sources||[]).length} джерел, op=${rr.op||'concat'}`));

              const actions = ui.el('div','sws-item-actions');

              const upBtn = ui.el('button','sws-mini-btn', '▲');
              upBtn.title = 'Вгору';
              upBtn.disabled = i===0;
              upBtn.onclick = (ev)=>{ ev.stopPropagation(); moveRoute(i, i-1); renderRoutes(); };

              const downBtn = ui.el('button','sws-mini-btn', '▼');
              downBtn.title = 'Вниз';
              downBtn.disabled = i===routes.length-1;
              downBtn.onclick = (ev)=>{ ev.stopPropagation(); moveRoute(i, i+1); renderRoutes(); };

              const delBtn = ui.el('button','sws-mini-btn sws-mini-danger','🗑');
              delBtn.title = 'Видалити маршрут';
              delBtn.onclick = (ev)=>{
                ev.stopPropagation();
                if (!window.confirm('Видалити маршрут #'+(i+1)+'?')) return;
                routes.splice(i,1);
                renderRoutes();
              };

              const che = ui.el('div','sws-chevron','›');

              actions.appendChild(upBtn);
              actions.appendChild(downBtn);
              actions.appendChild(delBtn);

              row.appendChild(left);
              row.appendChild(actions);
              row.appendChild(che);

              row.onclick=()=> openTransferRouteEditor({ sheets, templates, tplIdx: idx, routeIdx: i });
              routesCardBody.appendChild(row);
            }

            const addBtn = ui.el('button','sws-btn-primary','+ Додати маршрут');
            addBtn.onclick=()=>{ routes.push({ sources: [], op:'concat', delimiter:' ', targetCol: 0 }); renderRoutes(); };
            routesCardBody.appendChild(addBtn);
          };

          renderRoutes();

          return wrap;
        }
      });
    }

    function openTransferRouteEditor({ sheets, templates, tplIdx, routeIdx }){
      const tpl = templates[tplIdx];
      const rr = tpl.routes[routeIdx];
      const fromSheet = sheets.find(s=>s.key===tpl.fromSheetKey) || sheets[0];
      const toSheet = sheets.find(s=>s.key===tpl.toSheetKey) || sheets[0];

      let op = rr.op || 'concat';
      let delimiter = rr.delimiter ?? ' ';
      let targetCol = Number.isFinite(+rr.targetCol)?(+rr.targetCol):0;
      let sources = Array.isArray(rr.sources)?rr.sources.slice():[];

      const opOptions = [
        { value:'concat', label:'concat (з розділювачем)' },
        { value:'seq', label:'seq (без розділювача)' },
        { value:'newline', label:'newline (з нової строки)' },
        { value:'sum', label:'sum (сума чисел)' }
      ];

      const tgtOptions = (toSheet?.columns||[]).map((c,i)=>({ value:String(i), label:`${i+1}. ${c.name}` }));

      SW.push({
        title: 'Маршрут',
        subtitle: `З ${fromSheet?.name||''} → ${toSheet?.name||''}`,
        saveLabel: 'Зберегти',
        canSave: ()=> true,
        onSave: async ()=>{
          rr.op = op;
          rr.delimiter = delimiter;
          rr.targetCol = targetCol;
          rr.sources = sources.slice();
          await transferCore.saveTemplates(templates);
          uiToast?.success?.('Маршрут збережено') ?? uiToast?.show?.('Маршрут збережено');
        },
        content: (ctx)=>{
          const ui=ctx.ui;
          const wrap=ui.el('div','');

          const tgtSel = ui.select({ value:String(targetCol), options:tgtOptions, onChange:(v)=>{ targetCol=parseInt(v,10)||0; } });
          wrap.appendChild(ui.controlRow({ label:'Цільова колонка', help:'', controlEl:tgtSel }));

          const srcCardBody = ui.el('div','');
          const srcCard = ui.card({ title:'Джерела (колонки)', description:'Вибери одну або декілька колонок-джерел', children:[srcCardBody] });
          wrap.appendChild(srcCard);

          const renderSources = async ()=>{
            srcCardBody.innerHTML='';
            (fromSheet?.columns||[]).forEach((c,i)=>{
              const on = sources.includes(i);
              const tgl = ui.toggle({ value:on, onChange:(v)=>{
                if(v){ if(!sources.includes(i)) sources.push(i); }
                else { sources = sources.filter(x=>x!==i); }
              }});
              srcCardBody.appendChild(ui.controlRow({ label:`${i+1}. ${c.name}`, help:'', controlEl: tgl }));
            });
          };
          renderSources();

          const opSel = ui.select({ value: op, options: opOptions, onChange:(v)=>{ op=v; delRow.style.display = (op==='concat') ? '' : 'none'; } });
          wrap.appendChild(ui.controlRow({ label:'Операція', help:'', controlEl: opSel }));

          const delInp = ui.input({ value: delimiter, placeholder:'пробіл', onChange:(v)=>{ delimiter=v; } });
          const delRow = ui.controlRow({ label:'Розділювач', help:'Тільки для concat', controlEl: delInp });
          delRow.style.display = (op==='concat') ? '' : 'none';
          wrap.appendChild(delRow);

          const delBtn = ui.el('button','sws-btn-danger','🗑 Видалити маршрут');
          delBtn.onclick = async ()=>{
            if (!window.confirm('Видалити цей маршрут?')) return;
            tpl.routes.splice(routeIdx,1);
            await transferCore.saveTemplates(templates);
            uiToast?.success?.('Маршрут видалено') ?? uiToast?.show?.('Маршрут видалено');
            SW.pop();
          };
          wrap.appendChild(delBtn);

          return wrap;
        }
      });
    }

    function openJournalsMenu(){
      function openJournalColumnsScreen(){
        let templates = [];
        let selectedTplId = null;
        let tpl = null;

        const typeOptions = [
          { value: 'any', label: 'Будь-які' },
          { value: 'text', label: 'Текст' },
          { value: 'date', label: 'Лише дата' },
          { value: 'number', label: 'Лише числа' },
          { value: 'boolean', label: 'Лише boolean' },
        ];

        const ensureLoaded = async ()=>{
          templates = await sdo.journalTemplates.listTemplateEntities();
          if (!selectedTplId) selectedTplId = templates[0]?.id ?? null;
          if (selectedTplId && !templates.some(t=>t.id===selectedTplId)) selectedTplId = templates[0]?.id ?? null;
          tpl = selectedTplId ? await sdo.journalTemplates.getTemplate(selectedTplId) : null;
        };

        SW.push({
          title: 'Колонки',
          subtitle: 'Тип даних для кожної колонки (пер шаблон)',
          content: (ctx)=>{
            const ui = ctx.ui;
            const wrap = ui.el('div','');
            const top = ui.el('div','');
            const body = ui.el('div','');
            wrap.appendChild(top);
            wrap.appendChild(body);

            const render = async ()=>{
              await ensureLoaded();
              // Overlay draft changes if they exist for this template.
              try{
                const patch = ctx.draft?.journalTemplates?.[selectedTplId];
                if(tpl && patch && patch.columns) tpl = { ...tpl, columns: patch.columns };
              }catch(_){ }
              top.innerHTML='';
              body.innerHTML='';

              const tplOptions = (templates||[]).map(t=>({ value: t.id, label: t.title || t.id }));
              const sel = ui.select({
                value: selectedTplId || '',
                options: tplOptions,
                onChange: async (v)=>{
                  selectedTplId = v;
                  tpl = await sdo.journalTemplates.getTemplate(selectedTplId);
                  await render();
                }
              });
              top.appendChild(ui.controlRow({ label:'Шаблон журналу', help:'', controlEl: sel }));

              if (!tpl) {
                body.appendChild(ui.el('div','sws-muted','Немає шаблонів. Створіть шаблон журналу.'));
                return;
              }

              const colsBody = ui.el('div','');
              const card = ui.card({ title:'Колонки', description:'Оберіть, які дані дозволені у кожній колонці', children:[colsBody] });
              body.appendChild(card);

              (tpl.columns||[]).forEach((c, idx)=>{
                const currentType = (c.dataType==='date'||c.dataType==='number'||c.dataType==='boolean'||c.dataType==='text') ? c.dataType : 'any';
                const selType = ui.select({
                  value: currentType,
                  options: typeOptions,
                  onChange: async (v)=>{
                    // Draft-only: persist via the global Save button so it works from any stack.
                    const nextCols = (tpl.columns||[]).map((cc)=>({ ...cc }));
                    nextCols[idx].dataType = v;
                    ctx.draft.journalTemplates = ctx.draft.journalTemplates || {};
                    ctx.draft.journalTemplates[tpl.id] = ctx.draft.journalTemplates[tpl.id] || {};
                    ctx.draft.journalTemplates[tpl.id].columns = nextCols;
                    ctx.setGlobalDirty(true);
                    tpl = { ...tpl, columns: nextCols };
                    await render();
                  }
                });
                colsBody.appendChild(ui.controlRow({ label: `${idx+1}. ${c.label}`, help: c.key, controlEl: selType }));
              });

              // Register global saver once for journal template drafts.
              ctx.registerGlobalSaver('journalTemplates:saveAll', async ()=>{
                const patches = ctx.draft?.journalTemplates;
                if(!patches || Object.keys(patches).length===0) return;
                try{
                  for(const [tplId, patch] of Object.entries(patches)){
                    await sdo.journalTemplates.updateTemplate(tplId, patch);
                  }
                  // Clear drafts
                  ctx.draft.journalTemplates = {};
                  ctx.setGlobalDirty(false);
                  uiToast?.success?.('Збережено') ?? uiToast?.show?.('Збережено');
                }catch(e){
                  console.error(e);
                  uiToast?.error?.('Помилка збереження') ?? uiToast?.show?.('Помилка збереження');
                }
              });
            };

            render();
            return wrap;
          }
        });
      }

      SW.pushList({
        title: 'Журнали',
        subtitle: '',
        items: [
          { label: 'Шаблони журналів', description: 'Перегляд та видалення', onOpen: ()=>openJournalTemplatesListScreen() },
          { label: 'Додати шаблон журналу', description: '', onOpen: ()=>openAddJournalTemplateScreen() },
          { label: 'Колонки', description: 'Тип даних для колонок', onOpen: ()=> openJournalColumnsScreen() },
          { label: 'Поля “+Додати”', description: 'Скоро', onOpen: ()=> SW.push({ title:'Поля “+Додати”', subtitle:'', content: (ctx)=>ctx.ui.card({title:'Поля', description:'В розробці'}) }) },
        ]
      });
    }

    SW.openRoot({
      title: 'Налаштування',
      subtitle: '',
      items: [
        { label: 'Журнали', description: 'Шаблони, колонки, поля', onOpen: ()=>openJournalsMenu() },
        { label: 'UX|UI', description: '', onOpen: ()=> SW.push({ title:'UX|UI', subtitle:'', content: (ctx)=>ctx.ui.card({title:'UX|UI', description:'В розробці'}) }) },
        { label: 'Перенесення', description: 'Шаблони перенесення', onOpen: ()=> openTransferTemplatesScreen() },
      ]
    });
  }

  // -----------------------------
  // Backup / Import / Export modal
  // -----------------------------
  function openBackupModal() {
    const sdoInst = sdo || window.sdo;
    if (!sdoInst) {
      window.UI?.toast?.show?.('SDO instance not found (window.sdo)', { type: 'error' });
      return;
    }

    // Use SettingsWindow (sws_v2) stack modal to avoid z-index/viewport issues
    // that can make legacy modal dialogs appear "behind" the app.
    if (!window.SettingsWindow || typeof window.SettingsWindow.openCustomRoot !== 'function') {
      window.UI?.toast?.show?.('SettingsWindow (sws_v2) не ініціалізовано.', { type: 'error' });
      return;
    }

    const getActiveJournalId = () => {
      try {
        return sdoInst.getState?.().activeJournalId || null;
      } catch {
        return null;
      }
    };

    const getActiveJournalTitle = () => {
      const st = sdoInst.getState?.() || {};
      const id = st.activeJournalId;
      const j = (st.journals || []).find((x) => x && x.id === id) || null;
      return j?.title || j?.name || (id ? String(id) : '—');
    };

    // --- minimal ZIP (STORE) helpers ---
    // Supports: a handful of files, ASCII names. Enough for backup.json.
    const enc = new TextEncoder();
    const dec = new TextDecoder();

    const crcTable = (() => {
      const table = new Uint32Array(256);
      for (let i = 0; i < 256; i++) {
        let c = i;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        table[i] = c >>> 0;
      }
      return table;
    })();
    function crc32(u8) {
      let c = 0xFFFFFFFF;
      for (let i = 0; i < u8.length; i++) c = crcTable[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
      return (c ^ 0xFFFFFFFF) >>> 0;
    }
    function u16(v) { const a = new Uint8Array(2); new DataView(a.buffer).setUint16(0, v, true); return a; }
    function u32(v) { const a = new Uint8Array(4); new DataView(a.buffer).setUint32(0, v >>> 0, true); return a; }

    function zipStore(files) {
      // files: [{name, dataU8}]
      let offset = 0;
      const localParts = [];
      const centralParts = [];

      for (const f of files) {
        const nameU8 = enc.encode(f.name);
        const dataU8 = f.dataU8;
        const crc = crc32(dataU8);

        // Local file header
        const local = [
          u32(0x04034b50), // sig
          u16(20), // ver
          u16(0), // flags
          u16(0), // method=store
          u16(0), // mtime
          u16(0), // mdate
          u32(crc),
          u32(dataU8.length),
          u32(dataU8.length),
          u16(nameU8.length),
          u16(0),
          nameU8,
          dataU8,
        ];
        localParts.push(new Blob(local));

        // Central directory header
        const central = [
          u32(0x02014b50),
          u16(20),
          u16(20),
          u16(0),
          u16(0),
          u16(0),
          u16(0),
          u32(crc),
          u32(dataU8.length),
          u32(dataU8.length),
          u16(nameU8.length),
          u16(0),
          u16(0),
          u16(0),
          u16(0),
          u32(0),
          u32(offset),
          nameU8,
        ];
        centralParts.push(new Blob(central));

        // Update offset by local header+name+data lengths
        offset += 30 + nameU8.length + dataU8.length;
      }

      const centralSize = centralParts.reduce((sum, b) => sum + b.size, 0);
      const centralOffset = offset;

      const end = new Blob([
        u32(0x06054b50),
        u16(0),
        u16(0),
        u16(files.length),
        u16(files.length),
        u32(centralSize),
        u32(centralOffset),
        u16(0),
      ]);

      return new Blob([...localParts, ...centralParts, end], { type: 'application/zip' });
    }

    async function unzipStoreGetFile(ab, wantedName) {
      const u8 = new Uint8Array(ab);
      // Find End of Central Directory signature from end
      for (let i = u8.length - 22; i >= 0 && i >= u8.length - 66000; i--) {
        if (u8[i] === 0x50 && u8[i + 1] === 0x4b && u8[i + 2] === 0x05 && u8[i + 3] === 0x06) {
          const dv = new DataView(u8.buffer, u8.byteOffset + i);
          const cdSize = dv.getUint32(12, true);
          const cdOff = dv.getUint32(16, true);
          let p = cdOff;
          const cdEnd = cdOff + cdSize;
          while (p + 46 <= cdEnd) {
            if (u8[p] !== 0x50 || u8[p + 1] !== 0x4b || u8[p + 2] !== 0x01 || u8[p + 3] !== 0x02) break;
            const dvh = new DataView(u8.buffer, u8.byteOffset + p);
            const nameLen = dvh.getUint16(28, true);
            const extraLen = dvh.getUint16(30, true);
            const commentLen = dvh.getUint16(32, true);
            const lfhOff = dvh.getUint32(42, true);
            const name = dec.decode(u8.slice(p + 46, p + 46 + nameLen));
            if (name === wantedName) {
              // Read local file header
              const dvlfh = new DataView(u8.buffer, u8.byteOffset + lfhOff);
              const lnameLen = dvlfh.getUint16(26, true);
              const lextraLen = dvlfh.getUint16(28, true);
              const compMethod = dvlfh.getUint16(8, true);
              const compSize = dvlfh.getUint32(18, true);
              const dataStart = lfhOff + 30 + lnameLen + lextraLen;
              const data = u8.slice(dataStart, dataStart + compSize);
              if (compMethod !== 0) throw new Error('ZIP: unsupported compression method');
              return data;
            }
            p += 46 + nameLen + extraLen + commentLen;
          }
        }
      }
      return null;
    }

    function downloadBlob(blob, filename) {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    }

    // Robust file picker.
    // Key issue: on some platforms the native file dialog does NOT blur the document.
    // If we auto-resolve on "hasFocus" polling, we may resolve NULL *before* the user picks a file.
    // Strategy:
    //  - Always resolve on input.onchange
    //  - Additionally, resolve NULL only after we observed a blur (dialog likely opened)
    //    and then focus was regained (dialog closed)
    function pickFile({ accept }) {
      return new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = accept || '*/*';
        input.style.position = 'fixed';
        input.style.left = '-10000px';
        input.style.top = '0';
        input.style.width = '1px';
        input.style.height = '1px';
        input.style.opacity = '0';
        input.style.zIndex = '1000000';
        document.body.appendChild(input);

        let done = false;
        let poll = null;
        let sawBlur = false;
        const onBlur = () => { sawBlur = true; };
        // Use capture to catch blur even if focus is inside modals/overlays.
        window.addEventListener('blur', onBlur, true);

        const finish = async (file) => {
          if (done) return;
          done = true;
          if (poll) { try { clearInterval(poll); } catch (_) {} poll = null; }
          try { window.removeEventListener('blur', onBlur, true); } catch (_) {}
          try { input.remove(); } catch (_) {}
          resolve(file || null);
        };

        input.onchange = async () => {
          const file = (input.files && input.files[0]) ? input.files[0] : null;
          finish(file);
        };

        // Poll for focus regain + selection; this covers cases where 'focus' event doesn't fire.
        poll = setInterval(() => {
          if (done) return;
          // Only consider auto-resolving after we saw a blur (dialog likely opened).
          if (!sawBlur) return;
          // If user is still in the dialog, document usually isn't focused.
          if (!document.hasFocus()) return;
          const file = (input.files && input.files[0]) ? input.files[0] : null;
          // If dialog was closed, we will be focused again.
          // Resolve with file if chosen, or null if canceled.
          finish(file);
        }, 200);

        input.click();
      });
    }


    async function forceTableRerender() {
      if (typeof sdoInst?.commit !== 'function') return;
      await sdoInst.commit((next) => {
        next.activeSpaceId = next.activeSpaceId;
        next.activeJournalId = next.activeJournalId;
      }, []);
    }

    async function exportCurrentJournalJson() {
      const id = getActiveJournalId();
      if (!id) return window.UI?.toast?.show?.('Не обрано журнал (activeJournalId пустий)', { type: 'warning' });
      const bundle = await sdoInst.api.tableStore.exportTableData({ journalIds: [id], includeFormatting: true });
      const json = JSON.stringify(bundle, null, 2);
      const fname = `journal_${getActiveJournalTitle()}_${new Date().toISOString().replace(/[:\.]/g, '-')}.json`;
      downloadBlob(new Blob([json], { type: 'application/json' }), fname);
      window.UI?.toast?.show?.('Експорт JSON виконано', { type: 'success' });
    }

    async function importCurrentJournalJson(mode = 'replace') {
      const id = getActiveJournalId();
      if (!id) return window.UI?.toast?.show?.('Не обрано журнал (activeJournalId пустий)', { type: 'warning' });
      const file = await pickFile({ accept: 'application/json,.json' });
      if (!file) return;
      const text = await file.text();
      let parsed;
      try { parsed = JSON.parse(text); } catch { window.UI?.toast?.show?.('JSON пошкоджений', { type: 'error' }); return; }

      // Force import into active journal: take the first dataset.
      const ds0 = parsed?.datasets?.[0] || null;
      const normalized = (parsed?.format === 'sdo-table-data') ? parsed : null;
      let bundle = normalized;
      if (!bundle && ds0) {
        bundle = { format: 'sdo-table-data', formatVersion: 1, exportedAt: new Date().toISOString(), datasets: [ds0] };
      }
      if (!bundle || !Array.isArray(bundle.datasets) || bundle.datasets.length === 0) {
        window.UI?.toast?.show?.('Невідомий формат JSON для таблиці', { type: 'error' });
        return;
      }
      // Rewrite journalId
      bundle.datasets = bundle.datasets.map((d) => ({ ...d, journalId: id }));

      const res = await sdoInst.api.tableStore.importTableData(bundle, { mode });
      if (res?.applied) {
        await forceTableRerender();
        const count = Array.isArray(res?.datasets) ? res.datasets.length : 0;
        window.UI?.toast?.show?.(`Імпорт JSON виконано (${mode})${count ? `, datasets: ${count}` : ''}`, { type: 'success' });
      }
      else window.UI?.toast?.show?.(`Імпорт JSON не виконано: ${(res?.errors || []).join(', ')}`, { type: 'error' });
    }

    async function exportCurrentJournalXlsx(subrowsMode = 'subrow_per_row') {
      const id = getActiveJournalId();
      if (!id) return window.UI?.toast?.show?.('Не обрано журнал (activeJournalId пустий)', { type: 'warning' });
      await sdoInst.exportXlsx({ journalIds: [id], filename: `journal_${getActiveJournalTitle()}`, subrowsMode });
      window.UI?.toast?.show?.('Експорт XLSX виконано', { type: 'success' });
    }

    async function importCurrentJournalXlsx() {
      const id = getActiveJournalId();
      if (!id) return window.UI?.toast?.show?.('Не обрано журнал (activeJournalId пустий)', { type: 'warning' });
      const file = await pickFile({ accept: '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      if (!file) return;

      let res;
      try {
        // Import into current journal regardless of sheet names.
        res = await sdoInst.importXlsx(file, { mode: 'merge', targetJournalId: id });
      } catch (e) {
        window.UI?.toast?.show?.('XLSX імпорт помилка: ' + (e?.message || e), { type: 'error' });
        return;
      }

      await forceTableRerender();
      const cnt = (res?.sheets || []).reduce((a, x) => a + (x?.imported || 0), 0);
      window.UI?.toast?.show?.('Імпорт XLSX виконано' + (cnt ? (', рядків: ' + cnt) : ''), { type: 'success' });
    }

    async function exportAllZip() {
      const bundle = await sdoInst.exportBackup({ scope: 'all', includeUserData: true });
      const json = JSON.stringify(bundle, null, 2);
      const zipBlob = zipStore([{ name: 'backup.json', dataU8: enc.encode(json) }]);
      const fname = `backup_all_${new Date().toISOString().replace(/[:\.]/g, '-')}.zip`;
      downloadBlob(zipBlob, fname);
      window.UI?.toast?.show?.('Експорт ZIP виконано', { type: 'success' });
    }

    async function importAllZip(mode = 'replace') {
      const file = await pickFile({ accept: '.zip,application/zip' });
      if (!file) return;
      const ab = await file.arrayBuffer();
      let dataU8;
      try {
        dataU8 = await unzipStoreGetFile(ab, 'backup.json');
      } catch (e) {
        window.UI?.toast?.show?.(`ZIP помилка: ${e.message || e}`, { type: 'error' });
        return;
      }
      if (!dataU8) {
        window.UI?.toast?.show?.('У ZIP не знайдено backup.json', { type: 'error' });
        return;
      }
      let parsed;
      try { parsed = JSON.parse(dec.decode(dataU8)); } catch {
        window.UI?.toast?.show?.('backup.json пошкоджений', { type: 'error' });
        return;
      }
      try {
        await sdoInst.importBackup(parsed, { mode, includeUserData: true });
        // Ensure UI refresh without manual page reload.
        await forceTableRerender();
        window.UI?.toast?.show?.(`Імпорт ZIP виконано (${mode})`, { type: 'success' });
      } catch (e) {
        window.UI?.toast?.show?.(`Імпорт ZIP помилка: ${e.message || e}`, { type: 'error' });
      }
    }

    // -----------------------------
    // New SWS (stack) modal UI
    // -----------------------------

    const runAction = async (label, fn) => {
      try {
        await fn();
      } catch (e) {
        console.error('[Import/Export action failed]', label, e);
        const msg = (e && (e.message || e.toString)) ? (e.message || String(e)) : String(e);
        window.UI?.toast?.show?.(`${label}: помилка: ${msg}`, { type: 'error' });
      }
    };

    const pushModeScreen = ({ title, subtitle, onRun }) => {
      window.SettingsWindow.push({
        title,
        subtitle,
        saveLabel: 'Назад',
        onSave: () => window.SettingsWindow.pop(),
        content: (ctx) => {
          const ui = ctx.ui;
          const wrap = ui.el('div', '');

          wrap.appendChild(ui.card({
            title,
            description: 'Оберіть режим імпорту. Replace — повністю замінює. Merge — об’єднує/оновлює.',
            children: []
          }));

          const row = ui.el('div', '');
          row.style.display = 'flex';
          row.style.gap = '10px';
          row.style.marginTop = '10px';

          const mk = (text, mode, primary) => {
            const b = document.createElement('button');
            b.className = primary ? 'sws-save' : 'sws-btn';
            b.textContent = text;
            b.style.flex = '1 1 0';
            b.style.height = '54px';
            b.style.borderRadius = '12px';
            b.style.fontSize = '16px';
            b.onclick = async () => {
              b.disabled = true;
              await runAction(`${title} (${mode})`, () => onRun(mode));
              b.disabled = false;
              window.SettingsWindow.close();
            };
            return b;
          };

          row.appendChild(mk('Replace', 'replace', true));
          row.appendChild(mk('Merge', 'merge', false));
          wrap.appendChild(row);
          return wrap;
        }
      });
    };

    
    const pushExcelImportScreen = () => {
      window.SettingsWindow.push({
        title: 'Імпорт Excel',
        subtitle: 'XLSX → журнали',
        saveLabel: 'Назад',
        onSave: () => window.SettingsWindow.pop(),
        content: (ctx) => {// fixed: SettingsWindow uses content

          const ui = ctx.ui;
          const wrap = ui.el('div', '');

          const scopeRow = ui.el('div', '');
          scopeRow.style.display = 'flex';
          scopeRow.style.gap = '10px';
          scopeRow.style.alignItems = 'center';

          const scopeLabel = ui.el('div', '');
          scopeLabel.textContent = 'Куди імпортувати:';
          scopeLabel.style.minWidth = '150px';

          const scopeSel = document.createElement('select');
          scopeSel.className = 'sws-input';
          const optSheets = document.createElement('option');
          optSheets.value = 'sheets';
          optSheets.textContent = 'По листах (створювати журнали)';
          const optCurrent = document.createElement('option');
          optCurrent.value = 'current';
          optCurrent.textContent = 'Поточний журнал';
          scopeSel.append(optSheets, optCurrent);

          scopeRow.append(scopeLabel, scopeSel);

          const modeRow = ui.el('div', '');
          modeRow.style.display = 'flex';
          modeRow.style.gap = '10px';
          modeRow.style.alignItems = 'center';
          const modeLabel = ui.el('div', '');
          modeLabel.textContent = 'Режим:';
          modeLabel.style.minWidth = '150px';
          const modeSel = document.createElement('select');
          modeSel.className = 'sws-input';
          const m1 = document.createElement('option'); m1.value = 'merge'; m1.textContent = 'Додати/Оновити (merge)';
          const m2 = document.createElement('option'); m2.value = 'replace'; m2.textContent = 'Замінити (replace)';
          modeSel.append(m1, m2);
          modeRow.append(modeLabel, modeSel);

          const subrowsModeRow = ui.el('div', '');
          subrowsModeRow.style.display = 'flex';
          subrowsModeRow.style.gap = '10px';
          subrowsModeRow.style.alignItems = 'center';
          const subrowsModeLabel = ui.el('div', '');
          subrowsModeLabel.textContent = 'Підстроки Excel:';
          subrowsModeLabel.style.minWidth = '150px';
          const subrowsModeSel = document.createElement('select');
          subrowsModeSel.className = 'sws-input';
          const sm0 = document.createElement('option'); sm0.value = 'auto'; sm0.textContent = 'Авто (якщо файл з СЕДО)';
          const sm1 = document.createElement('option'); sm1.value = 'subrow_per_row'; sm1.textContent = 'Підстрока = нова строка (legacy)';
          const sm2 = document.createElement('option'); sm2.value = 'row_with_subrows'; sm2.textContent = 'Строка з підстроками (\n в комірці)';
          subrowsModeSel.append(sm0, sm1, sm2);
          subrowsModeRow.append(subrowsModeLabel, subrowsModeSel);

          const grid = ui.el('div', '');
          grid.style.display = 'grid';
          grid.style.gridTemplateColumns = '150px 1fr';
          grid.style.gap = '10px';
          grid.style.marginTop = '10px';

          const mkNum = (label, def) => {
            const l = ui.el('div', '');
            l.textContent = label;
            const inp = document.createElement('input');
            inp.type = 'number';
            inp.min = '1';
            inp.value = String(def);
            inp.className = 'sws-input';
            grid.append(l, inp);
            return inp;
          };

          const headerRowInp = mkNum('Рядок заголовків', 1);
          const fromRowInp = mkNum('Почати з рядка', 2);
          const toRowInp = mkNum('Закінчити на рядку', '');

          // Action button
          const runBtn = document.createElement('button');
          runBtn.className = 'sws-save';
          runBtn.textContent = 'Обрати XLSX і імпортувати';
          runBtn.style.marginTop = '14px';
          runBtn.style.height = '54px';
          runBtn.style.borderRadius = '12px';
          const status = ui.el('div', '');
          status.style.marginTop = '10px';
          status.style.fontSize = '14px';
          status.style.opacity = '0.85';
          
// Hidden file input kept in DOM for Android WebView/Chrome stability
const fileInp = document.createElement('input');
fileInp.type = 'file';
fileInp.accept = '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
fileInp.style.display = 'none';

const startImport = async (file) => {
  runBtn.disabled = true;
  try {
    if (!file) {
      status.textContent = 'Файл не обрано.';
      return;
    }
    status.textContent = 'Файл обрано: ' + (file.name || 'xlsx') + '. Читання...';

    const headerRow = Number(headerRowInp.value || 1);
    const fromRow = fromRowInp.value === '' ? undefined : Number(fromRowInp.value);
    const toRow = toRowInp.value === '' ? undefined : Number(toRowInp.value);

    const scope = scopeSel.value;
    const mode = modeSel.value || 'merge';

    const opts = { mode, headerRow, fromRow, toRow, subrowsMode: (subrowsModeSel.value || 'auto') };
    if (scope === 'current') {
      const id = getActiveJournalId();
      if (!id) {
        status.textContent = 'Помилка: не обрано активний журнал.';
        try { window.alert('Не обрано журнал (activeJournalId пустий)'); } catch (_) {}
        return;
      }
      opts.targetJournalId = id;
    } else {
      opts.createMissingJournals = true;
    }

    status.textContent = 'Імпорт... (це може зайняти час для великих файлів)';
    const res = await sdoInst.importXlsx(file, opts);
    status.textContent = 'Оновлення інтерфейсу...';
    await forceTableRerender();
    const cnt = (res?.sheets || []).reduce((a, x) => a + (x?.imported || 0), 0);
    status.textContent = 'Готово. Рядків: ' + cnt;

    try { window.UI?.toast?.show?.('Імпорт XLSX виконано' + (cnt ? (', рядків: ' + cnt) : ''), { type: 'success' }); } catch (_) {}
    try { window.alert('Імпорт XLSX виконано' + (cnt ? ('\nРядків: ' + cnt) : '')); } catch (_) {}
    window.SettingsWindow.close();
  } catch (e) {
    const msg = 'XLSX імпорт помилка: ' + (e?.message || e);
    status.textContent = msg;
    try { window.UI?.toast?.show?.(msg, { type: 'error' }); } catch (_) {}
    try { window.alert(msg); } catch (_) {}
  } finally {
    runBtn.disabled = false;
  }
};

// Button only opens picker; import runs in onchange (reliable for Android WebView)
runBtn.onclick = () => {
  status.textContent = 'Вибір файлу...';
  try { fileInp.value = ''; } catch (_) {}
  fileInp.click();
};

fileInp.onchange = () => {
  const file = fileInp.files && fileInp.files[0] ? fileInp.files[0] : null;
  startImport(file);
};

// ensure input stays in DOM
wrap.appendChild(fileInp);

wrap.appendChild(ui.card({
            title: 'Параметри імпорту XLSX',
            description: 'Підтримка Excel, де заголовки можуть бути не в 1-му рядку. Рядки вказуються як в Excel (1..n).',
            children: []
          }));

          wrap.append(scopeRow, modeRow, subrowsModeRow, grid, runBtn, status);
          return wrap;
        }
      });
    };

    const pushExcelExportScreen = () => {
      window.SettingsWindow.push({
        title: 'Експорт Excel',
        subtitle: 'Журнал → XLSX',
        saveLabel: 'Назад',
        onSave: () => window.SettingsWindow.pop(),
        content: (ctx) => {
          const ui = ctx.ui;
          const wrap = ui.el('div', '');

          wrap.appendChild(ui.card({
            title: 'Параметри експорту XLSX',
            description: 'Оберіть модель підстрок. Новий режим зберігає 1:1 відповідність (рядок з підстроками → одна Excel-строка з переносами в комірці).',
            children: []
          }));

          const subrowsModeRow = ui.el('div', '');
          subrowsModeRow.style.display = 'flex';
          subrowsModeRow.style.gap = '10px';
          subrowsModeRow.style.alignItems = 'center';
          subrowsModeRow.style.marginTop = '10px';

          const subrowsModeLabel = ui.el('div', '');
          subrowsModeLabel.textContent = 'Підстроки Excel:';
          subrowsModeLabel.style.minWidth = '150px';

          const subrowsModeSel = document.createElement('select');
          subrowsModeSel.className = 'sws-input';
          const sm1 = document.createElement('option'); sm1.value = 'subrow_per_row'; sm1.textContent = 'Підстрока = нова строка (legacy)';
          const sm2 = document.createElement('option'); sm2.value = 'row_with_subrows'; sm2.textContent = 'Строка з підстроками (\n в комірці)';
          subrowsModeSel.append(sm1, sm2);

          subrowsModeRow.append(subrowsModeLabel, subrowsModeSel);

          const runBtn = document.createElement('button');
          runBtn.className = 'sws-save';
          runBtn.textContent = 'Експортувати XLSX';
          runBtn.style.marginTop = '14px';
          runBtn.style.height = '54px';
          runBtn.style.borderRadius = '12px';

          const status = ui.el('div', '');
          status.style.marginTop = '10px';
          status.style.fontSize = '14px';
          status.style.opacity = '0.85';

          runBtn.onclick = async () => {
            const id = getActiveJournalId();
            if (!id) {
              status.textContent = 'Помилка: не обрано активний журнал.';
              try { window.alert('Не обрано журнал (activeJournalId пустий)'); } catch (_) {}
              return;
            }
            const mode = subrowsModeSel.value || 'subrow_per_row';
            status.textContent = 'Експорт...';
            runBtn.disabled = true;
            try {
              await exportCurrentJournalXlsx(mode);
              status.textContent = 'Готово.';
              window.SettingsWindow.close();
            } catch (e) {
              status.textContent = 'Помилка: ' + (e?.message || e);
              window.UI?.toast?.show?.('Експорт XLSX помилка: ' + (e?.message || e), { type: 'error' });
            } finally {
              runBtn.disabled = false;
            }
          };

          wrap.append(subrowsModeRow, runBtn, status);
          return wrap;
        }
      });
    };



// -----------------------------
// ZIP / JSON import screens (event-driven file input, works in Android WebView)
// -----------------------------
const importAllZipFromFile = async (file, mode = 'replace', setStatus) => {
  if (!file) { setStatus?.('Файл не обрано'); return; }
  setStatus?.('Читання файлу...');
  const ab = await file.arrayBuffer();
  let dataU8;
  try {
    dataU8 = await unzipStoreGetFile(ab, 'backup.json');
  } catch (e) {
    const msg = `ZIP помилка: ${e?.message || e}`;
    setStatus?.(msg);
    window.UI?.toast?.show?.(msg, { type: 'error' });
    return;
  }
  if (!dataU8) {
    const msg = 'У ZIP не знайдено backup.json';
    setStatus?.(msg);
    window.UI?.toast?.show?.(msg, { type: 'error' });
    return;
  }
  let parsed;
  try { parsed = JSON.parse(dec.decode(dataU8)); } catch {
    const msg = 'backup.json пошкоджений';
    setStatus?.(msg);
    window.UI?.toast?.show?.(msg, { type: 'error' });
    return;
  }
  try {
    setStatus?.('Імпорт...');
    await sdoInst.importBackup(parsed, { mode, includeUserData: true });
    await forceTableRerender();
    const ok = `Імпорт ZIP виконано (${mode})`;
    setStatus?.(ok);
    window.UI?.toast?.show?.(ok, { type: 'success' });
  } catch (e) {
    const msg = `Імпорт ZIP помилка: ${e?.message || e}`;
    setStatus?.(msg);
    window.UI?.toast?.show?.(msg, { type: 'error' });
  }
};

const importCurrentJournalJsonFromFile = async (file, mode = 'replace', setStatus) => {
  const id = getActiveJournalId();
  if (!id) {
    const msg = 'Не обрано журнал (activeJournalId пустий)';
    setStatus?.(msg);
    window.UI?.toast?.show?.(msg, { type: 'warning' });
    return;
  }
  if (!file) { setStatus?.('Файл не обрано'); return; }

  setStatus?.('Читання файлу...');
  const text = await file.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch {
    const msg = 'JSON пошкоджений';
    setStatus?.(msg);
    window.UI?.toast?.show?.(msg, { type: 'error' });
    return;
  }

  const ds0 = parsed?.datasets?.[0] || null;
  const normalized = (parsed?.format === 'sdo-table-data') ? parsed : null;
  let bundle = normalized;
  if (!bundle && ds0) {
    bundle = { format: 'sdo-table-data', formatVersion: 1, exportedAt: new Date().toISOString(), datasets: [ds0] };
  }
  if (!bundle || !Array.isArray(bundle.datasets) || bundle.datasets.length === 0) {
    const msg = 'Невідомий формат JSON для таблиці';
    setStatus?.(msg);
    window.UI?.toast?.show?.(msg, { type: 'error' });
    return;
  }
  bundle.datasets = bundle.datasets.map((d) => ({ ...d, journalId: id }));

  try {
    setStatus?.('Імпорт...');
    const res = await sdoInst.api.tableStore.importTableData(bundle, { mode });
    if (res?.applied) {
      await forceTableRerender();
      const ok = `Імпорт JSON виконано (${mode})`;
      setStatus?.(ok);
      window.UI?.toast?.show?.(ok, { type: 'success' });
    } else {
      const msg = `Імпорт JSON не виконано: ${(res?.errors || []).join(', ')}`;
      setStatus?.(msg);
      window.UI?.toast?.show?.(msg, { type: 'error' });
    }
  } catch (e) {
    const msg = `Імпорт JSON помилка: ${e?.message || e}`;
    setStatus?.(msg);
    window.UI?.toast?.show?.(msg, { type: 'error' });
  }
};

const pushZipImportScreen = () => {
  window.SettingsWindow.push({
    title: 'Імпорт ZIP',
    subtitle: 'Всі журнали/шаблони',
    saveLabel: 'Назад',
    onSave: () => window.SettingsWindow.pop(),
    content: (ctx) => {
      const ui = ctx.ui;
      const wrap = ui.el('div', '');

      const status = ui.el('div', '');
      status.style.marginTop = '10px';
      status.style.fontSize = '14px';
      status.style.opacity = '0.85';

      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.zip,application/zip';
      input.style.display = 'none';

      let pendingMode = null;
      const setStatus = (t) => { status.textContent = t || ''; };

      input.onchange = async () => {
        const file = input.files && input.files[0] ? input.files[0] : null;
        if (!file) { setStatus('Файл не обрано'); pendingMode = null; return; }
        const mode = pendingMode || 'replace';
        pendingMode = null;
        setStatus(`Файл обрано: ${file.name}`);
        await importAllZipFromFile(file, mode, setStatus);
      };

      const row = ui.el('div', '');
      row.style.display = 'flex';
      row.style.gap = '10px';
      row.style.marginTop = '10px';

      const mk = (text, mode, primary) => {
        const b = document.createElement('button');
        b.className = primary ? 'sws-save' : 'sws-btn';
        b.textContent = text;
        b.style.flex = '1 1 0';
        b.style.height = '54px';
        b.style.borderRadius = '12px';
        b.style.fontSize = '16px';
        b.onclick = () => {
          pendingMode = mode;
          setStatus('Вибір файлу...');
          input.value = '';
          input.click();
        };
        return b;
      };

      wrap.appendChild(ui.card({
        title: 'Імпорт ZIP',
        description: 'Оберіть режим імпорту, потім виберіть файл backup_all_*.zip (всередині backup.json).',
        children: []
      }));

      row.appendChild(mk('Replace', 'replace', true));
      row.appendChild(mk('Merge', 'merge', false));

      wrap.appendChild(row);
      wrap.appendChild(status);
      wrap.appendChild(input);
      return wrap;
    }
  });
};

const pushJsonImportScreen = () => {
  window.SettingsWindow.push({
    title: 'Імпорт JSON',
    subtitle: 'Поточний журнал',
    saveLabel: 'Назад',
    onSave: () => window.SettingsWindow.pop(),
    content: (ctx) => {
      const ui = ctx.ui;
      const wrap = ui.el('div', '');

      const status = ui.el('div', '');
      status.style.marginTop = '10px';
      status.style.fontSize = '14px';
      status.style.opacity = '0.85';

      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'application/json,.json';
      input.style.display = 'none';

      let pendingMode = null;
      const setStatus = (t) => { status.textContent = t || ''; };

      input.onchange = async () => {
        const file = input.files && input.files[0] ? input.files[0] : null;
        if (!file) { setStatus('Файл не обрано'); pendingMode = null; return; }
        const mode = pendingMode || 'replace';
        pendingMode = null;
        setStatus(`Файл обрано: ${file.name}`);
        await importCurrentJournalJsonFromFile(file, mode, setStatus);
      };

      const row = ui.el('div', '');
      row.style.display = 'flex';
      row.style.gap = '10px';
      row.style.marginTop = '10px';

      const mk = (text, mode, primary) => {
        const b = document.createElement('button');
        b.className = primary ? 'sws-save' : 'sws-btn';
        b.textContent = text;
        b.style.flex = '1 1 0';
        b.style.height = '54px';
        b.style.borderRadius = '12px';
        b.style.fontSize = '16px';
        b.onclick = () => {
          pendingMode = mode;
          setStatus('Вибір файлу...');
          input.value = '';
          input.click();
        };
        return b;
      };

      wrap.appendChild(ui.card({
        title: 'Імпорт JSON',
        description: 'Оберіть режим імпорту, потім виберіть JSON (експортований з поточного журналу).',
        children: []
      }));

      row.appendChild(mk('Replace', 'replace', true));
      row.appendChild(mk('Merge', 'merge', false));

      wrap.appendChild(row);
      wrap.appendChild(status);
      wrap.appendChild(input);
      return wrap;
    }
  });
};

const pushRoot = () => {
      window.SettingsWindow.push({
        title: 'Імпорт / Експорт',
        subtitle: `Поточний журнал: ${getActiveJournalTitle()}`,
        saveLabel: 'Закрити',
        onSave: () => window.SettingsWindow.close(),
        content: (ctx) => {
          const ui = ctx.ui;
          const wrap = ui.el('div', '');

          wrap.appendChild(ui.card({
            title: 'Дії',
            description: 'Ліва колонка — імпорт, права — експорт. 3 формати: ZIP / Excel / JSON.',
            children: []
          }));

          const grid = ui.el('div', '');
          grid.style.display = 'flex';
          grid.style.flexDirection = 'column';
          grid.style.gap = '10px';

          const mkRow = (leftLabel, leftFn, rightLabel, rightFn) => {
            const row = ui.el('div', '');
            row.style.display = 'flex';
            row.style.justifyContent = 'space-between';
            row.style.gap = '10px';

            const mkBtn = (label, fn, primary) => {
              const b = document.createElement('button');
              b.className = primary ? 'sws-save' : 'sws-btn';
              b.textContent = label;
              // requirement: 40% width each
              b.style.width = '40%';
              // requirement: comfy click height
              b.style.height = '54px';
              b.style.borderRadius = '12px';
              b.style.fontSize = '16px';
              b.style.whiteSpace = 'normal';
              b.style.lineHeight = '1.2';
              b.style.padding = '10px 12px';
              b.onclick = async () => {
                b.disabled = true;
                await fn();
                b.disabled = false;
              };
              return b;
            };

            row.appendChild(mkBtn(leftLabel, leftFn, true));
            row.appendChild(mkBtn(rightLabel, rightFn, false));
            return row;
          };

          // 1) ZIP (all)
          grid.appendChild(mkRow(
            'Імпорт ZIP',
            async () => pushZipImportScreen(),
            'Експорт ZIP',
            async () => { await runAction('Експорт ZIP', exportAllZip); window.SettingsWindow.close(); }
          ));

          // 2) Excel (current journal)
          grid.appendChild(mkRow(
            'Імпорт Excel',
            async () => pushExcelImportScreen(),
            'Експорт Excel',
            async () => pushExcelExportScreen()
          ));

          // 3) JSON (current journal)
          grid.appendChild(mkRow(
            'Імпорт JSON',
            async () => pushJsonImportScreen(),
            'Експорт JSON',
            async () => { await runAction('Експорт JSON', exportCurrentJournalJson); window.SettingsWindow.close(); }
          ));

          wrap.appendChild(grid);
          return wrap;
        }
      });
    };

    window.SettingsWindow.openCustomRoot(() => pushRoot());
  }


  function evaluateGuard(fn, fallback = true) {
    if (typeof fn !== 'function') return fallback;
    return Boolean(fn({ api, sdo }));
  }

  async function ensureRootSpace() {
    const state = sdo.getState();
    if (state.spaces.length > 0) return;
    await sdo.commit((next) => {
      const rootId = crypto.randomUUID();
      next.spaces = [{ id: rootId, title: 'Простір 1', parentId: null, childCount: 0 }];
      next.activeSpaceId = rootId;
      next.activeJournalId = null;
    }, ['spaces_nodes_v2', 'nav_last_loc_v2']);
  }

  function getJournalLabel(journal) {
    return formatJournalLabel(journal, sdo.getState());
  }

  function getSiblingIndex(nodes, nodeId, parentId) {
    const siblings = nodes.filter((n) => (n.parentId ?? null) === (parentId ?? null));
    const idx = siblings.findIndex((n) => n.id === nodeId);
    return idx >= 0 ? idx + 1 : 1;
  }

  function formatSpaceLabel(space, state) {
    if (!space) return '';
    const parts = [];
    let cur = space;
    while (cur) {
      const i = getSiblingIndex(state.spaces, cur.id, cur.parentId);
      parts.push(String(i));
      cur = cur.parentId ? findById(state.spaces, cur.parentId) : null;
    }
    const prefix = parts.reverse().join('.') + '.';
    return `${prefix} ${space.title}`;
  }

  function formatJournalLabel(journal, state) {
    if (!journal) return '';
    const parts = [];
    let cur = journal;
    // Root journals have parentId === spaceId.
    while (cur) {
      const parentId = cur.parentId;
      const siblings = state.journals.filter((j) => j.spaceId === cur.spaceId && j.parentId === parentId);
      const idx = siblings.findIndex((j) => j.id === cur.id);
      parts.push(String((idx >= 0 ? idx : 0) + 1));
      if (!parentId || parentId === cur.spaceId) break;
      cur = findById(state.journals, parentId);
    }
    const prefix = parts.reverse().join('.') + '.';
    return `${prefix} ${journal.title}`;
  }

  async function createJournalWithTemplate({ state, parentId, titlePrompt }) {
    const templates = await sdo.journalTemplates.listTemplateEntities();
    if (templates.length === 0) {
      setStatus('Немає доступних шаблонів');
      return;
    }

    // Template picker with search + SELECT (default shows all templates; filtering starts after 1+ chars)
    let query = '';
    let selectedTpl = null;

    const input = h('input', {
      class: 'sdo-picker-search',
      placeholder: 'Пошук шаблону…',
      value: '',
      onInput: () => {
        query = (input.value || '').trim().toLowerCase();
        rebuildSelect();
      }
    });

    const select = h('select', {
      class: 'sdo-picker-select',
      onChange: () => {
        const id = select.value;
        selectedTpl = templates.find(t => t.id === id) || null;
        warn.style.display = 'none';
      }
    });

    const warn = h('div', { class: 'sdo-picker-warn' }, ['Оберіть шаблон журналу']);
    warn.style.display = 'none';

    function rebuildSelect() {
      const q = query;
      const filtered = (!q || q.length < 1)
        ? templates
        : templates.filter((t) => (` `).toLowerCase().includes(q));

      const prev = select.value;
      select.innerHTML = '';

      const opt0 = document.createElement('option');
      opt0.value = '';
      opt0.textContent = '— Оберіть шаблон журналу —';
      select.appendChild(opt0);

      for (const tpl of filtered) {
        const opt = document.createElement('option');
        opt.value = tpl.id;
        opt.textContent = tpl.title;
        select.appendChild(opt);
      }

      if (prev && Array.from(select.options).some(o => o.value === prev)) {
        select.value = prev;
      } else {
        select.value = '';
      }
      selectedTpl = templates.find(t => t.id === select.value) || null;
      warn.style.display = 'none';
    }

    const addBtn = h('button', {
      class: 'sdo-picker-row sdo-picker-primary',
      onClick: async () => {
        if (!selectedTpl) {
          warn.style.display = 'block';
          select.focus();
          return;
        }
        closeModal();
        const title = window.prompt('Назва журналу:', titlePrompt);
        if (!title) return;
        await sdo.commit((next) => {
          const node = {
            id: crypto.randomUUID(),
            spaceId: state.activeSpaceId,
            parentId,
            templateId: selectedTpl.id,
            title,
            childCount: 0
          };
          next.journals = [...next.journals, node];
          next.activeJournalId = node.id;
        }, ['journals_nodes_v2', 'nav_last_loc_v2']);
      }
    }, ['Додати']);

    const modalEl = h('div', { class: 'sdo-picker-modal' }, [
      h('div', { class: 'sdo-picker-title' }, ['Оберіть шаблон журналу']),
      input,
      select,
      warn,
      addBtn,
      h('button', { class: 'sdo-picker-close', onClick: closeModal }, ['Закрити'])
    ]);

    modal.open(modalEl, { closeOnOverlay: true });
    rebuildSelect();
  }

  async function renderNavigation() {
    await ensureRootSpace();
    const state = sdo.getState();
    const activeSpace = findById(state.spaces, state.activeSpaceId);
    const activeJournal = findById(state.journals, state.activeJournalId);

    const spaceSiblings = state.spaces.filter((x) => x.parentId === (activeSpace?.parentId ?? null));
    const spaceChildren = state.spaces.filter((x) => x.parentId === activeSpace?.id);

    const journalSiblings = activeJournal
      ? state.journals.filter((j) => j.spaceId === state.activeSpaceId && j.parentId === activeJournal.parentId)
      : state.journals.filter((j) => j.spaceId === state.activeSpaceId && j.parentId === state.activeSpaceId);
    const journalChildren = activeJournal
      ? state.journals.filter((j) => j.spaceId === state.activeSpaceId && j.parentId === activeJournal.id)
      : [];

    const spaceBackBtn = h('button', {
      class: 'sdo-nav-btn sdo-nav-back',
      disabled: canGoBackSpace(activeSpace) ? null : 'disabled',
      onClick: async () => {
        if (!activeSpace?.parentId) return;
        await sdo.commit((next) => {
          next.activeSpaceId = activeSpace.parentId;
          next.activeJournalId = null;
        }, ['nav_last_loc_v2']);
      }
    }, ['←']);

    const spaceCurrentBtn = h('button', {
      class: 'sdo-nav-btn sdo-nav-main is-active',
      onClick: () => openTreePicker({
        kind: 'Простір',
        getCurrent: () => findById(sdo.getState().spaces, sdo.getState().activeSpaceId) || (ensureArray(sdo.getState().spaces).find(s=>s.parentId==null) || null),
        getSiblings: (cur) => {
          const st = sdo.getState();
          const pid = cur?.parentId ?? null;
          return st.spaces.filter(x => (x.parentId ?? null) === pid);
        },
        getParent: (cur) => {
          const st = sdo.getState();
          if (!cur?.parentId) return null;
          return findById(st.spaces, cur.parentId) || null;
        },
        getFirstChild: (cur) => {
          const st = sdo.getState();
          if (!cur?.id) return null;
          return st.spaces.find(x => x.parentId === cur.id) || null;
        },
        getId: (item) => item.id,
        getLabel: (item) => formatSpaceLabel(item, sdo.getState()),
        noticeNoChildren: 'Цей простір не має дочірніх просторів',
        onSelect: async (item) => {
          await sdo.commit((next) => {
            next.activeSpaceId = item.id;
            next.activeJournalId = null;
          }, ['nav_last_loc_v2']);
        },
        onAddCurrentLevel: async (cur) => {
          const title = prompt('Назва простору', 'Новий простір');
          if (!title) return;
          const parentId = cur?.parentId ?? null;
          await sdo.commit((next) => {
            const node = createSpace(title, parentId);
            next.spaces = addSpace(next.spaces || [], node);
            next.activeSpaceId = node.id;
            next.activeJournalId = null;
          }, ['nav_add_space_level']);
        }
      })
    }, [activeSpace ? formatSpaceLabel(activeSpace, state) : 'Простір']);

    const spaceChildrenBtn = h('button', {
      class: 'sdo-nav-btn sdo-nav-main is-adjacent',
      disabled: spaceChildren.length > 0 ? null : 'disabled',
      onClick: () => openTreePicker({
        kind: 'Простір',
        getCurrent: () => {
          const st = sdo.getState();
          const active = findById(st.spaces, st.activeSpaceId);
          const kids = st.spaces.filter(x => x.parentId === active?.id);
          return kids[0] || null;
        },
        getSiblings: (cur) => {
          const st = sdo.getState();
          const pid = cur?.parentId ?? null;
          return st.spaces.filter(x => (x.parentId ?? null) === pid);
        },
        getParent: (cur) => {
          const st = sdo.getState();
          if (!cur?.parentId) return null;
          return findById(st.spaces, cur.parentId) || null;
        },
        getFirstChild: (cur) => {
          const st = sdo.getState();
          if (!cur?.id) return null;
          return st.spaces.find(x => x.parentId === cur.id) || null;
        },
        getId: (item) => item.id,
        getLabel: (item) => formatSpaceLabel(item, sdo.getState()),
        noticeNoChildren: 'Цей простір не має дочірніх просторів',
        onSelect: async (item) => {
          await sdo.commit((next) => {
            next.activeSpaceId = item.id;
            next.activeJournalId = null;
          }, ['nav_last_loc_v2']);
        }
      })
    }, [spaceChildren[0] ? formatSpaceLabel(spaceChildren[0], state) : '—']);

    const spacePlusBtn = h('button', {
      class: 'sdo-nav-btn sdo-nav-plus',
      onClick: async () => {
        const title = window.prompt('Назва підпростору:', 'Новий підпростір');
        if (!title) return;
        // IMPORTANT: always read the latest state on click (handlers can be stale between rerenders)
        const stateNow = sdo.getState();
        const activeNow = findById(stateNow.spaces, stateNow.activeSpaceId);
        if (!activeNow?.id) return;
        const newId = crypto.randomUUID();
        // Create NEXT LEVEL (child of current active) and navigate into it
        await sdo.commit((next) => {
          next.spaces = [...next.spaces, { id: newId, title, parentId: activeNow.id, childCount: 0 }];
          next.activeSpaceId = newId;
          next.activeJournalId = null;
        }, ['spaces_nodes_v2', 'nav_last_loc_v2']);
      }
    }, ['+']);

    const journalBackBtn = h('button', {
      class: 'sdo-nav-btn sdo-nav-back',
      disabled: canGoBackJournal(activeJournal, state.activeSpaceId) ? null : 'disabled',
      onClick: async () => {
        if (!activeJournal || activeJournal.parentId === state.activeSpaceId) return;
        await sdo.commit((next) => {
          next.activeJournalId = activeJournal.parentId;
        }, ['nav_last_loc_v2']);
      }
    }, ['←']);

    const journalCurrentBtn = h('button', {
      class: 'sdo-nav-btn sdo-nav-main is-active',
      onClick: () => {
        try { openQuickNavRoot({ sdo }); } catch (e) { console.error(e); }
      }
    }, [activeJournal ? getJournalLabel(activeJournal) : 'Додай журнал']);

    const journalChildrenBtn = h('button', {
      class: 'sdo-nav-btn sdo-nav-main is-adjacent',
      disabled: journalChildren.length > 0 ? null : 'disabled',
      onClick: () => {
        try { openQuickNavRoot({ sdo }); } catch (e) { console.error(e); }
      }
    }, [journalChildren[0] ? getJournalLabel(journalChildren[0]) : '—']);

    const journalPlusBtn = h('button', {
      class: 'sdo-nav-btn sdo-nav-plus',
      onClick: async () => {
        try {
          openQuickNavRoot({ sdo });
        } catch (e) {
          console.error(e);
        }
      }
    }, ['+']);

    const spaceRow = h('div', { class: 'sdo-nav-row sdo-nav-row-space' }, [spaceBackBtn, spaceCurrentBtn, spaceChildrenBtn, spacePlusBtn]);
    const journalRow = h('div', { class: 'sdo-nav-row sdo-nav-row-journal' }, [journalBackBtn, journalCurrentBtn, journalChildrenBtn, journalPlusBtn]);

    navigationHost.innerHTML = '';
    // Left-to-right layout: Spaces then Journals
    const quickNavBtn = h('button', {
      class: 'sdo-nav-btn sdo-nav-quick',
      title: 'Спрощена навігація',
      onClick: () => {
        try { openQuickNavRoot({ sdo }); } catch (e) { console.error(e); }
      }
    }, ['☰']);

    navigationHost.append(quickNavBtn);
  }

  function renderButtons() {
    const left = h('div', { class: 'sdo-toolbar-left' });
    const rightBlock = h('div', { class: 'sdo-block sdo-block-settings' }, [themeButton, backupButton, settingsButton]);
    const right = h('div', { class: 'sdo-toolbar-right' }, [rightBlock]);

    // One-line header: navigation + table controls live here.
    const spacesJournalsBlock = h('div', { class: 'sdo-block sdo-block-nav' }, [navigationHost]);
    const tableBlock = h('div', { class: 'sdo-block sdo-block-table' }, [tableToolbarHost]);
    left.append(spacesJournalsBlock, tableBlock);

    toolbar.innerHTML = '';
    toolbar.append(left, right);
  }

  let panelCleanup = null;
  function renderPanel() {
    panelCleanup?.();
    panelCleanup = null;
    panelsHost.innerHTML = '';

    const mainPanel = sdo.ui.listPanels({ location: 'main' })[0] ?? null;
    const settingsPanel = sdo.ui.listPanels({ location: 'settings' })[0] ?? null;
    const panel = mainPanel ?? settingsPanel;
    if (!panel) return;

    const wrapper = h('div', { class: 'sdo-panel' }, [h('h3', {}, [panel.title])]);
    panelsHost.append(wrapper);
    const maybeCleanup = panel.render(wrapper, { api, sdo });
    if (typeof maybeCleanup === 'function') panelCleanup = maybeCleanup;
  }

  async function renderSettings() {
    settingsHost.innerHTML = '';
    const tabs = sdo.settings.listTabs();
    for (const tab of tabs) {
      const tabEl = h('div', { class: 'sdo-settings-tab' }, [h('h4', {}, [tab.title])]);
      for (const def of tab.items) {
        for (const field of def.fields) {
          if (typeof field.when === 'function' && !field.when({ api, sdo })) continue;
          const row = h('label', { class: 'sdo-settings-row' }, [field.label]);
          const value = await field.read({ api, sdo });
          const input = h('input', { value: value ?? '', type: field.type === 'number' ? 'number' : 'text' });
          input.addEventListener('change', () => field.write({ api, sdo }, input.value));
          row.append(input);
          tabEl.append(row);
        }
      }
      settingsHost.append(tabEl);
    }
  }

  async function refresh() {
    await renderNavigation();
    renderButtons();
    renderPanel();
    await renderSettings();
  }

  const unsubscribeRegistry = sdo.ui.subscribe(refresh);
  const unsubscribeState = sdo.on('state:changed', refresh);
  refresh();

  const children = [toolbar, panelsHost, settingsHost, modalLayer].filter(Boolean);
  const root = h('div', { class: 'sdo-core-shell' }, children);
  mount.innerHTML = '';
  mount.append(root);

  return {
    destroy() {
      unsubscribeRegistry();
      unsubscribeState();
      panelCleanup?.();
      root.remove();
    }
  };
}
