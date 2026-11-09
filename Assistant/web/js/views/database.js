// 个人数据库工作台视图控制器 (C1.0)

import {
  getDbState,
  setDbActiveView,
  getDbActiveView,
  setDbSelectedId,
  getDbSelectedId,
  setDbFilterDocId,
  getDbFilterDocId,
  toggleDbSessionFold,
  isDbSessionFolded,
  setDbSidebarCollapsed,
  isDbSidebarCollapsed,
  setDbDraftText,
  getDbDraftText,
  isDbDirty,
  getCurrentDbItem,
  findDoc,
  findChunk,
  findMessageWithSession,
  getDocChunks,
  importDbDoc,
  saveCurrentDbItem,
  deleteDbDoc,
  deleteDbChunk,
  deleteDbChatMessage,
  searchDb,
  splitTextToParagraphs,
} from '../store.js';

let containerEl = null;
let dbSidebarEl = null;
let dbContentEl = null;
let dbSidebarListEl = null;
let dbFilterChipWrapEl = null;
let dbFileInputEl = null;
let dbToastEl = null;

let headerTabsEl = null;
let headerSearchEl = null;
let headerSearchInputEl = null;
let headerSearchDropdownEl = null;

let toastTimer = null;
let isComposing = false;

// 通用 Toast 提示
export function showToast(message) {
  if (!dbToastEl) return;
  dbToastEl.textContent = message;
  dbToastEl.classList.add('is-visible');
  if (toastTimer) {
    clearTimeout(toastTimer);
  }
  toastTimer = setTimeout(() => {
    dbToastEl.classList.remove('is-visible');
    toastTimer = null;
  }, 2000);
}

// 通用未保存拦截守卫
export function guardUnsavedChanges(actionFn) {
  if (!isDbDirty()) {
    actionFn();
    return;
  }

  showConfirmModal({
    title: '放弃未保存的修改？',
    desc: '当前内容还没有保存，离开后修改会丢失。',
    confirmText: '放弃修改',
    isDanger: true,
    onConfirm: () => {
      setDbDraftText(null);
      actionFn();
    },
  });
}

// 模态确认弹窗
function showConfirmModal({ title, desc, confirmText, isDanger, onConfirm }) {
  const modalBackdrop = document.getElementById('delete-confirm-modal');
  const modalTitle = document.getElementById('delete-modal-title');
  const modalDesc = document.getElementById('delete-modal-desc');
  const cancelBtn = document.getElementById('delete-modal-cancel');
  const confirmBtn = document.getElementById('delete-modal-confirm');

  if (!modalBackdrop || !modalTitle || !modalDesc || !confirmBtn) {
    if (window.confirm(`${title}\n${desc}`)) {
      onConfirm();
    }
    return;
  }

  modalTitle.textContent = title;
  modalDesc.textContent = desc;
  confirmBtn.textContent = confirmText || '确认';
  confirmBtn.className = isDanger
    ? 'modal__btn modal__btn--danger'
    : 'modal__btn modal__btn--primary';

  modalBackdrop.hidden = false;

  function cleanup() {
    modalBackdrop.hidden = true;
    cancelBtn.removeEventListener('click', onCancel);
    confirmBtn.removeEventListener('click', onOk);
    modalBackdrop.removeEventListener('click', onBackdropClick);
    window.removeEventListener('keydown', onKeyDown);
  }

  function onCancel() {
    cleanup();
  }

  function onOk() {
    cleanup();
    onConfirm();
  }

  function onBackdropClick(e) {
    if (e.target === modalBackdrop) {
      cleanup();
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Escape') {
      cleanup();
    }
  }

  cancelBtn.addEventListener('click', onCancel);
  confirmBtn.addEventListener('click', onOk);
  modalBackdrop.addEventListener('click', onBackdropClick);
  window.addEventListener('keydown', onKeyDown);
}

// 初始化个人数据库视图控制器
export function initDatabaseView() {
  containerEl = document.getElementById('view-database');
  if (!containerEl) return;

  headerTabsEl = document.getElementById('db-header-tabs');
  headerSearchEl = document.getElementById('db-header-search');
  if (headerSearchEl) {
    headerSearchInputEl = headerSearchEl.querySelector('#db-search-input');
    headerSearchDropdownEl = headerSearchEl.querySelector('#db-search-dropdown');
  }

  // 构建工作台内层 DOM
  containerEl.innerHTML = `
    <aside class="db-sidebar" id="db-sidebar" aria-label="个人数据库条目列表">
      <div class="db-sidebar__header">
        <input type="file" id="db-file-input" style="display:none;" accept=".md,.txt,.pdf,.docx,.xlsx,.pptx,.py,.js,.json,.html,.css,.java,.c,.cpp,.go,.sh,.yaml,.sql">
        <button class="db-import-btn" id="db-import-btn" type="button">
          <svg class="db-import-icon" viewBox="0 0 24 24"><use href="#icon-plus"></use></svg>
          <span>导入资料</span>
        </button>
        <div class="db-filter-chip-wrap" id="db-filter-chip-wrap" hidden></div>
      </div>
      <div class="db-sidebar__list" id="db-sidebar-list" role="list"></div>
      <div class="db-sidebar__footer">
        <button class="db-collapse-btn" id="db-collapse-btn" type="button" title="收起列表" aria-label="收起列表">
          <svg viewBox="0 0 24 24"><use href="#icon-chevron-left"></use></svg>
          <span>收起列表</span>
        </button>
      </div>
    </aside>
    <main class="db-content" id="db-content" aria-label="详情面板"></main>
    <div class="db-toast" id="db-toast" role="status" aria-live="polite"></div>
  `;

  dbSidebarEl = containerEl.querySelector('#db-sidebar');
  dbContentEl = containerEl.querySelector('#db-content');
  dbSidebarListEl = containerEl.querySelector('#db-sidebar-list');
  dbFilterChipWrapEl = containerEl.querySelector('#db-filter-chip-wrap');
  dbFileInputEl = containerEl.querySelector('#db-file-input');
  dbToastEl = containerEl.querySelector('#db-toast');

  bindHeaderEvents();
  bindSidebarEvents();
  bindGlobalShortcuts();

  renderAll();
}

// 绑定顶栏 Tab 与全局搜索事件
function bindHeaderEvents() {
  if (headerTabsEl) {
    headerTabsEl.addEventListener('click', (e) => {
      const btn = e.target.closest('.db-header-tabs__btn');
      if (!btn) return;
      const targetView = btn.dataset.dbView;
      if (!targetView || targetView === getDbActiveView()) return;

      guardUnsavedChanges(() => {
        setDbActiveView(targetView);
        updateHeaderTabs();
        renderAll();
      });
    });
  }

  if (headerSearchInputEl && headerSearchDropdownEl) {
    headerSearchInputEl.addEventListener('compositionstart', () => {
      isComposing = true;
    });

    headerSearchInputEl.addEventListener('compositionend', () => {
      isComposing = false;
      handleSearch(headerSearchInputEl.value);
    });

    headerSearchInputEl.addEventListener('input', () => {
      if (!isComposing) {
        handleSearch(headerSearchInputEl.value);
      }
    });

    headerSearchInputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        headerSearchInputEl.value = '';
        headerSearchDropdownEl.hidden = true;
        headerSearchInputEl.blur();
      }
    });

    // 点击搜索浮层结果跳转
    headerSearchDropdownEl.addEventListener('click', (e) => {
      const itemEl = e.target.closest('.db-search__item');
      if (!itemEl) return;
      const targetType = itemEl.dataset.type;
      const targetId = itemEl.dataset.id;

      guardUnsavedChanges(() => {
        if (targetType === 'doc') {
          setDbActiveView('docs');
          setDbSelectedId('docs', targetId);
        } else if (targetType === 'chunk') {
          setDbActiveView('chunks');
          setDbSelectedId('chunks', targetId);
        } else if (targetType === 'chat') {
          setDbActiveView('chats');
          setDbSelectedId('chats', targetId);
        }

        headerSearchInputEl.value = '';
        headerSearchDropdownEl.hidden = true;
        updateHeaderTabs();
        renderAll();
      });
    });

    // 点击外部隐藏下拉
    document.addEventListener('click', (e) => {
      if (!headerSearchEl.contains(e.target)) {
        headerSearchDropdownEl.hidden = true;
      }
    });
  }
}

// 执行搜索并渲染下拉
function handleSearch(rawQuery) {
  const query = (rawQuery || '').trim();
  if (!query) {
    headerSearchDropdownEl.hidden = true;
    headerSearchDropdownEl.innerHTML = '';
    return;
  }

  const res = searchDb(query);
  const total = res.docs.length + res.chunks.length + res.chats.length;

  if (total === 0) {
    headerSearchDropdownEl.innerHTML = `<div class="db-search__empty">未找到匹配的资料、切片或对话</div>`;
    headerSearchDropdownEl.hidden = false;
    return;
  }

  let html = '';

  if (res.docs.length > 0) {
    html += `<div class="db-search__group"><div class="db-search__group-title">资料 (${res.docs.length})</div>`;
    res.docs.forEach((d) => {
      html += `
        <div class="db-search__item" data-type="doc" data-id="${escapeHtml(d.id)}">
          <div class="db-search__item-title">${escapeHtml(d.name)}</div>
          <div class="db-search__item-sub">${escapeHtml(d.text.slice(0, 45))}</div>
        </div>
      `;
    });
    html += `</div>`;
  }

  if (res.chunks.length > 0) {
    html += `<div class="db-search__group"><div class="db-search__group-title">切片 (${res.chunks.length})</div>`;
    res.chunks.forEach((c) => {
      const doc = findDoc(c.docId);
      html += `
        <div class="db-search__item" data-type="chunk" data-id="${escapeHtml(c.id)}">
          <div class="db-search__item-title">${escapeHtml(c.text.slice(0, 50))}</div>
          <div class="db-search__item-sub">来自：${escapeHtml(doc ? doc.name : '未知资料')}</div>
        </div>
      `;
    });
    html += `</div>`;
  }

  if (res.chats.length > 0) {
    html += `<div class="db-search__group"><div class="db-search__group-title">对话归档 (${res.chats.length})</div>`;
    res.chats.forEach(({ msg, session }) => {
      html += `
        <div class="db-search__item" data-type="chat" data-id="${escapeHtml(msg.id)}">
          <div class="db-search__item-title">${msg.role === 'user' ? '用户' : 'Agent'}：${escapeHtml(msg.text.slice(0, 45))}</div>
          <div class="db-search__item-sub">${escapeHtml(session.title)} · ${escapeHtml(msg.time)}</div>
        </div>
      `;
    });
    html += `</div>`;
  }

  headerSearchDropdownEl.innerHTML = html;
  headerSearchDropdownEl.hidden = false;
}

// 绑定侧栏事件
function bindSidebarEvents() {
  const importBtn = containerEl.querySelector('#db-import-btn');
  const collapseBtn = containerEl.querySelector('#db-collapse-btn');
  const mainSidebarExpandBtn = document.getElementById('expand-sessions-btn');

  // 文件导入
  if (importBtn && dbFileInputEl) {
    importBtn.addEventListener('click', () => {
      dbFileInputEl.click();
    });

    dbFileInputEl.addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      const isText = /\.(txt|md|py|json|js|ts|html|css|java|c|cpp|go|sh|yaml|sql)$/i.test(file.name);
      if (isText) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const content = event.target.result;
          const { doc, chunkCount } = importDbDoc(file.name, content);
          showToast(`已导入 ${file.name}`);
          updateHeaderTabs();
          renderAll();
          dbFileInputEl.value = '';
        };
        reader.readAsText(file, 'utf-8');
      } else {
        // 二进制文档生成结构化演示解析文本
        const mockText = `${file.name} 解析文本内容：\n\n这是从 ${file.name} 中提取的第一段文本，包含该文档的核心概括信息与关键术语。\n\n在第二段中，详细记录了具体的规格要点、流程步骤与参考数据，已成功建立切片与索引。`;
        const { doc, chunkCount } = importDbDoc(file.name, mockText);
        showToast(`已导入 ${file.name}`);
        updateHeaderTabs();
        renderAll();
        dbFileInputEl.value = '';
      }
    });
  }

  // 侧栏收起
  if (collapseBtn) {
    collapseBtn.addEventListener('click', () => {
      setDbSidebarCollapsed(true);
      dbSidebarEl.classList.add('is-collapsed');
      if (mainSidebarExpandBtn) {
        mainSidebarExpandBtn.hidden = false;
        mainSidebarExpandBtn.title = '展开列表';
        mainSidebarExpandBtn.setAttribute('aria-label', '展开列表');
      }
    });
  }

  // 主侧栏底部展开按钮联动
  if (mainSidebarExpandBtn) {
    mainSidebarExpandBtn.addEventListener('click', () => {
      if (window.location.hash === '#/database') {
        setDbSidebarCollapsed(false);
        dbSidebarEl.classList.remove('is-collapsed');
        mainSidebarExpandBtn.hidden = true;
      }
    });
  }

  // 侧栏列表点击
  if (dbSidebarListEl) {
    dbSidebarListEl.addEventListener('click', (e) => {
      // 会话分组折叠切换
      const groupHeader = e.target.closest('.db-group-header');
      if (groupHeader) {
        const sid = groupHeader.dataset.sessionId;
        toggleDbSessionFold(sid);
        renderSidebarList();
        return;
      }

      // 条目选中
      const itemEl = e.target.closest('.db-list-item');
      if (!itemEl) return;
      const itemId = itemEl.dataset.id;
      const view = getDbActiveView();
      if (!itemId || itemId === getDbSelectedId(view)) return;

      guardUnsavedChanges(() => {
        setDbSelectedId(view, itemId);
        renderSidebarList();
        renderDetailPanel();
      });
    });
  }
}

// 绑定快捷键 (Ctrl+K / Cmd+K 与 Ctrl+S / Cmd+S)
function bindGlobalShortcuts() {
  window.addEventListener('keydown', (e) => {
    // 仅在当前处于个人数据库工作台时响应
    if (window.location.hash !== '#/database') return;

    // Ctrl+K 或 Cmd+K 聚焦顶栏搜索
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      if (headerSearchInputEl) {
        headerSearchInputEl.focus();
        headerSearchInputEl.select();
      }
      return;
    }

    // Ctrl+S 或 Cmd+S 保存编辑
    if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
      e.preventDefault();
      handleSave();
    }
  });
}

// 保存逻辑
function handleSave() {
  if (!isDbDirty()) {
    showToast('没有需要保存的修改');
    return;
  }

  const ok = saveCurrentDbItem();
  if (ok) {
    showToast('已保存');
    renderSidebarList();
    renderDetailPanel();
  }
}

// 删除逻辑
function handleDelete() {
  const view = getDbActiveView();
  const currentItem = getCurrentDbItem();
  if (!currentItem) return;

  if (view === 'docs') {
    const chunkCount = getDocChunks(currentItem.id).length;
    showConfirmModal({
      title: '删除这份资料？',
      desc: `资料及其 ${chunkCount} 个切片都会被删除，无法恢复。`,
      confirmText: '删除',
      isDanger: true,
      onConfirm: () => {
        deleteDbDoc(currentItem.id);
        showToast('已删除');
        renderSidebarList();
        renderDetailPanel();
      },
    });
    return;
  }

  if (view === 'chunks') {
    showConfirmModal({
      title: '删除这个切片？',
      desc: '这个切片会被删除，原资料不受影响。',
      confirmText: '删除',
      isDanger: true,
      onConfirm: () => {
        deleteDbChunk(currentItem.id);
        showToast('已删除');
        renderSidebarList();
        renderDetailPanel();
      },
    });
    return;
  }

  if (view === 'chats') {
    showConfirmModal({
      title: '删除这条消息？',
      desc: '这条消息会从已保存的对话中删除，无法恢复。',
      confirmText: '删除',
      isDanger: true,
      onConfirm: () => {
        deleteDbChatMessage(currentItem.id);
        showToast('已删除');
        renderSidebarList();
        renderDetailPanel();
      },
    });
  }
}

// 更新顶栏 Tab 激活态
function updateHeaderTabs() {
  if (!headerTabsEl) return;
  const currentView = getDbActiveView();
  const buttons = headerTabsEl.querySelectorAll('.db-header-tabs__btn');
  buttons.forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.dbView === currentView);
  });
}

// 刷新整个视图
export function renderAll() {
  updateHeaderTabs();
  renderSidebarList();
  renderDetailPanel();
}

// 渲染左侧列表
function renderSidebarList() {
  if (!dbSidebarListEl) return;
  const dbState = getDbState();
  const view = dbState.activeView;

  // 筛选胶囊状态
  if (dbFilterChipWrapEl) {
    if (view === 'chunks' && dbState.filterDocId) {
      const doc = findDoc(dbState.filterDocId);
      const docName = doc ? doc.name : '已筛选资料';
      dbFilterChipWrapEl.innerHTML = `
        <button class="db-filter-chip" id="db-filter-chip" type="button" title="点击取消筛选">
          <span class="db-filter-chip__text">来自：${escapeHtml(docName)}</span>
          <span class="db-filter-chip__close">×</span>
        </button>
      `;
      dbFilterChipWrapEl.hidden = false;
      const chipBtn = dbFilterChipWrapEl.querySelector('#db-filter-chip');
      chipBtn.addEventListener('click', () => {
        setDbFilterDocId(null);
        renderSidebarList();
      });
    } else {
      dbFilterChipWrapEl.hidden = true;
      dbFilterChipWrapEl.innerHTML = '';
    }
  }

  // 1. 资料列表 (docs)
  if (view === 'docs') {
    if (dbState.docs.length === 0) {
      dbSidebarListEl.innerHTML = `<div class="db-sidebar__empty">还没有资料。导入一份文件，开始建立你的个人数据库。</div>`;
      return;
    }

    let html = '';
    dbState.docs.forEach((doc) => {
      const isSelected = doc.id === dbState.selectedIds.docs;
      const count = getDocChunks(doc.id).length;
      html += `
        <div class="db-list-item ${isSelected ? 'is-active' : ''}" data-id="${escapeHtml(doc.id)}">
          <div class="db-list-item__title">${escapeHtml(doc.name)}</div>
          <div class="db-list-item__sub">${count} 个切片，${escapeHtml(doc.time)}</div>
        </div>
      `;
    });
    dbSidebarListEl.innerHTML = html;
    return;
  }

  // 2. 切片列表 (chunks)
  if (view === 'chunks') {
    const list = dbState.filterDocId
      ? dbState.chunks.filter((c) => c.docId === dbState.filterDocId)
      : dbState.chunks;

    if (list.length === 0) {
      dbSidebarListEl.innerHTML = `<div class="db-sidebar__empty">这里还没有切片。</div>`;
      return;
    }

    let html = '';
    list.forEach((chunk) => {
      const isSelected = chunk.id === dbState.selectedIds.chunks;
      const doc = findDoc(chunk.docId);
      html += `
        <div class="db-list-item ${isSelected ? 'is-active' : ''}" data-id="${escapeHtml(chunk.id)}">
          <div class="db-list-item__title">${escapeHtml(chunk.text)}</div>
          <div class="db-list-item__sub">来自 ${escapeHtml(doc ? doc.name : '已删除资料')}</div>
        </div>
      `;
    });
    dbSidebarListEl.innerHTML = html;
    return;
  }

  // 3. 对话归档列表 (chats)
  if (view === 'chats') {
    if (dbState.archivedSessions.length === 0) {
      dbSidebarListEl.innerHTML = `<div class="db-sidebar__empty">暂无已保存的在线对话。</div>`;
      return;
    }

    let html = '';
    dbState.archivedSessions.forEach((session) => {
      const isFolded = isDbSessionFolded(session.id);
      html += `
        <div class="db-group">
          <button class="db-group-header" type="button" data-session-id="${escapeHtml(session.id)}">
            <span class="db-group-header__arrow">${isFolded ? '▸' : '▾'}</span>
            <span class="db-group-header__title">${escapeHtml(session.title)}</span>
          </button>
          <div class="db-group__items" ${isFolded ? 'hidden' : ''}>
      `;
      session.msgs.forEach((msg) => {
        const isSelected = msg.id === dbState.selectedIds.chats;
        const roleName = msg.role === 'user' ? '用户' : 'Agent';
        html += `
          <div class="db-list-item ${isSelected ? 'is-active' : ''}" data-id="${escapeHtml(msg.id)}">
            <div class="db-list-item__title">${roleName}：${escapeHtml(msg.text)}</div>
            <div class="db-list-item__sub">${escapeHtml(msg.time)}</div>
          </div>
        `;
      });
      html += `
          </div>
        </div>
      `;
    });
    dbSidebarListEl.innerHTML = html;
  }
}

// 渲染右侧详情面板
function renderDetailPanel() {
  if (!dbContentEl) return;
  const dbState = getDbState();
  const view = dbState.activeView;
  const currentItem = getCurrentDbItem();

  // 空指针防护
  if (!currentItem) {
    dbContentEl.innerHTML = `<div class="db-content__empty">从左侧选择一项查看详情。</div>`;
    return;
  }

  const dirty = isDbDirty();
  const currentDraft = dbState.draftText !== null ? dbState.draftText : currentItem.text;

  // 1. 资料详情 (docs)
  if (view === 'docs') {
    const chunkCount = getDocChunks(currentItem.id).length;
    dbContentEl.innerHTML = `
      <div class="db-content__header">
        <div class="db-content__title-wrap">
          <h2 class="db-content__title">${escapeHtml(currentItem.name)}</h2>
          <span class="db-unsaved-badge" id="db-unsaved-badge" ${dirty ? '' : 'hidden'}>
            <span class="db-unsaved-badge__dot"></span>未保存
          </span>
        </div>
        <div class="db-content__actions">
          <button class="db-btn db-btn--primary" id="db-save-btn" type="button">保存</button>
          <button class="db-btn db-btn--danger" id="db-delete-btn" type="button">删除</button>
        </div>
      </div>

      <div class="db-section">
        <label class="db-section__label" for="db-editor-textarea">资料内容，可直接编辑</label>
        <textarea class="db-editor" id="db-editor-textarea" rows="8"></textarea>
      </div>

      <div class="db-section">
        <div class="db-source-card">
          <div class="db-source__meta">已切成 ${chunkCount} 个切片。</div>
          <button class="db-link" id="db-view-chunks-btn" type="button">查看这些切片</button>
        </div>
      </div>

      <div class="db-future-slot">预留扩展区：标签、关联、备注等后续功能可以挂在这里</div>
    `;

    bindDetailEditor(currentDraft);

    const viewChunksBtn = dbContentEl.querySelector('#db-view-chunks-btn');
    if (viewChunksBtn) {
      viewChunksBtn.addEventListener('click', () => {
        guardUnsavedChanges(() => {
          setDbActiveView('chunks');
          setDbFilterDocId(currentItem.id);
          const chunks = getDocChunks(currentItem.id);
          if (chunks.length > 0) {
            setDbSelectedId('chunks', chunks[0].id);
          }
          renderAll();
        });
      });
    }
    return;
  }

  // 2. 切片详情 (chunks)
  if (view === 'chunks') {
    const doc = findDoc(currentItem.docId);
    let sourceCardHtml = '';
    if (!doc) {
      sourceCardHtml = `<div class="db-source__meta">原资料已被删除，无法定位原文。</div>`;
    } else {
      const allParas = splitTextToParagraphs(doc.text);
      const pIdx = currentItem.paraIndex;
      const startIdx = Math.max(0, pIdx - 1);
      const endIdx = Math.min(allParas.length - 1, pIdx + 1);

      let parasHtml = '';
      for (let i = startIdx; i <= endIdx; i++) {
        const pText = allParas[i];
        if (i === pIdx) {
          parasHtml += `<p class="db-source__para"><mark class="db-source__mark">${escapeHtml(pText)}</mark></p>`;
        } else {
          parasHtml += `<p class="db-source__para">${escapeHtml(pText)}</p>`;
        }
      }

      sourceCardHtml = `
        <div class="db-source__meta">${escapeHtml(doc.name)}，第 ${pIdx + 1} 段</div>
        <div class="db-source__paras">${parasHtml}</div>
        <button class="db-link" id="db-open-doc-btn" type="button">打开原资料</button>
      `;
    }

    dbContentEl.innerHTML = `
      <div class="db-content__header">
        <div class="db-content__title-wrap">
          <h2 class="db-content__title">切片详情</h2>
          <span class="db-unsaved-badge" id="db-unsaved-badge" ${dirty ? '' : 'hidden'}>
            <span class="db-unsaved-badge__dot"></span>未保存
          </span>
        </div>
        <div class="db-content__actions">
          <button class="db-btn db-btn--primary" id="db-save-btn" type="button">保存</button>
          <button class="db-btn db-btn--danger" id="db-delete-btn" type="button">删除</button>
        </div>
      </div>

      <div class="db-section">
        <label class="db-section__label" for="db-editor-textarea">切片内容，可直接编辑</label>
        <textarea class="db-editor" id="db-editor-textarea" rows="6"></textarea>
      </div>

      <div class="db-section">
        <div class="db-section__label">溯源</div>
        <div class="db-source-card">${sourceCardHtml}</div>
      </div>

      <div class="db-future-slot">预留扩展区：标签、关联、备注等后续功能可以挂在这里</div>
    `;

    bindDetailEditor(currentDraft);

    const openDocBtn = dbContentEl.querySelector('#db-open-doc-btn');
    if (openDocBtn && doc) {
      openDocBtn.addEventListener('click', () => {
        guardUnsavedChanges(() => {
          setDbActiveView('docs');
          setDbSelectedId('docs', doc.id);
          renderAll();
        });
      });
    }
    return;
  }

  // 3. 对话归档详情 (chats)
  if (view === 'chats') {
    const found = findMessageWithSession(currentItem.id);
    const session = found ? found.session : null;
    const roleLabel = currentItem.role === 'user' ? '用户消息' : 'Agent消息';

    let sessionMsgsHtml = '';
    if (session) {
      session.msgs.forEach((m) => {
        const isCurrent = m.id === currentItem.id;
        const rName = m.role === 'user' ? '用户' : 'Agent';
        sessionMsgsHtml += `
          <div class="db-session-msg ${isCurrent ? 'is-active' : ''}" data-msg-id="${escapeHtml(m.id)}">
            ${rName}：${escapeHtml(m.text)}
          </div>
        `;
      });
    }

    dbContentEl.innerHTML = `
      <div class="db-content__header">
        <div class="db-content__title-wrap">
          <h2 class="db-content__title">${escapeHtml(roleLabel)}</h2>
          <span class="db-unsaved-badge" id="db-unsaved-badge" ${dirty ? '' : 'hidden'}>
            <span class="db-unsaved-badge__dot"></span>未保存
          </span>
        </div>
        <div class="db-content__actions">
          <button class="db-btn db-btn--primary" id="db-save-btn" type="button">保存</button>
          <button class="db-btn db-btn--danger" id="db-delete-btn" type="button">删除</button>
        </div>
      </div>

      <div class="db-section">
        <label class="db-section__label" for="db-editor-textarea">消息内容，可直接编辑</label>
        <textarea class="db-editor" id="db-editor-textarea" rows="6"></textarea>
      </div>

      <div class="db-section">
        <div class="db-section__label">所属会话：${escapeHtml(session ? session.title : '未知会话')}</div>
        <div class="db-session-context" id="db-session-context">${sessionMsgsHtml}</div>
      </div>

      <div class="db-future-slot">预留扩展区：标签、关联、备注等后续功能可以挂在这里</div>
    `;

    bindDetailEditor(currentDraft);

    const contextEl = dbContentEl.querySelector('#db-session-context');
    if (contextEl) {
      contextEl.addEventListener('click', (e) => {
        const msgCard = e.target.closest('.db-session-msg');
        if (!msgCard) return;
        const targetMsgId = msgCard.dataset.msgId;
        if (!targetMsgId || targetMsgId === currentItem.id) return;

        guardUnsavedChanges(() => {
          setDbSelectedId('chats', targetMsgId);
          renderSidebarList();
          renderDetailPanel();
        });
      });
    }
  }
}

// 绑定详情编辑器与操作按钮
function bindDetailEditor(initialText) {
  const textarea = dbContentEl.querySelector('#db-editor-textarea');
  const badgeEl = dbContentEl.querySelector('#db-unsaved-badge');
  const saveBtn = dbContentEl.querySelector('#db-save-btn');
  const deleteBtn = dbContentEl.querySelector('#db-delete-btn');

  if (textarea) {
    textarea.value = initialText || '';

    // 自动高度自适应
    function autoResize() {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.max(120, textarea.scrollHeight)}px`;
    }
    autoResize();

    textarea.addEventListener('input', () => {
      setDbDraftText(textarea.value);
      const dirty = isDbDirty();
      if (badgeEl) {
        badgeEl.hidden = !dirty;
      }
      autoResize();
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener('click', handleSave);
  }

  if (deleteBtn) {
    deleteBtn.addEventListener('click', handleDelete);
  }
}

// 页面切入生命周期钩子
export function onDatabaseViewActivated() {
  if (isDbSidebarCollapsed() && dbSidebarEl) {
    dbSidebarEl.classList.add('is-collapsed');
    const expandBtn = document.getElementById('expand-sessions-btn');
    if (expandBtn) {
      expandBtn.hidden = false;
      expandBtn.title = '展开列表';
      expandBtn.setAttribute('aria-label', '展开列表');
    }
  }
  renderAll();
}

// 页面切离生命周期钩子
export function onDatabaseViewDeactivated() {
  if (headerSearchDropdownEl) {
    headerSearchDropdownEl.hidden = true;
  }
}

// HTML 安全转义函数，杜绝 XSS
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
