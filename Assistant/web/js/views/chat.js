// 对话主窗口与会话列表视图：多会话管理、双形态切换、草稿保留与丢弃、DOM 渲染、附件收发与流式响应驱动

import {
  abortOnlineChat,
  checkConfigStatus,
  createOnlineSession,
  deleteOnlineSession,
  fetchOnlineMessages,
  fetchOnlineSessions,
  openAttachment,
  renameOnlineSession,
  sendOnlineMessage,
  streamChat,
  subscribeChatStream,
  uploadCacheAttachments,
} from '../api.js';
import { createSvgIcon, el, formatTimestamp, isNearBottom, scrollToBottom } from '../dom.js';
import { ICONS } from '../icons.js';
import { renderMarkdownToElement, stripMarkdownToPlainText } from '../markdown.js';
import {
  abortStreaming,
  addAgentPlaceholder,
  addOnlineSessionToStore,
  addPendingAttachment,
  addUserMessage,
  clearDraftText,
  clearPendingAttachments,
  clearQueueForSession,
  clearSessionSubscription,
  createSessionFromDraft,
  deleteSession,
  dequeueRequest,
  enqueueRequest,
  enterDraft,
  findMessageInSession,
  findSession,
  getActiveMessages,
  getActiveSession,
  getActiveSessionId,
  getActiveSessionList,
  getCurrentDraft,
  getDraftText,
  getHistorySnapshot,
  getMode,
  getPendingAttachments,
  getQueueLength,
  getSessionDraft,
  getSessions,
  isStreaming,
  removePendingAttachment,
  renameSession,
  setCurrentAbortController,
  setCurrentDraft,
  setDraftText,
  setMode,
  setOnlineSessions,
  setSessionDraft,
  setSessionMessages,
  setSessionSubscription,
  setStreaming,
  switchSession,
  updateMessage,
} from '../store.js';

let chatScrollEl = null;
let chatEmptyEl = null;
let chatEmptyTitleEl = null;
let chatEmptyTextEl = null;
let messagesEl = null;
let composerFormEl = null;
let composerInputEl = null;
let sendButtonEl = null;
let composerQueueEl = null;
let newChatButtonEl = null;
let chatSessionsListEl = null;
let chatSessionsEl = null;
let collapseSessionsBtnEl = null;
let expandSessionsBtnEl = null;

// 形态切换与提示条元素
let modeToggleEl = null;
let modeLabelEl = null;
let chatBannerEl = null;
let chatBannerTextEl = null;
let chatBannerCloseEl = null;

// 附件与弹窗元素 (B1.13 - B1.15)
let attachBtnEl = null;
let fileInputEl = null;
let pendingAttachmentsEl = null;
let alertModalEl = null;
let alertModalTitleEl = null;
let alertModalDescEl = null;
let alertModalOkEl = null;

// 删除会话二次确认弹窗元素 (B1.11)
let pendingDeleteSessionId = null;
let deleteConfirmModalEl = null;
let deleteModalDescEl = null;
let deleteModalCancelEl = null;
let deleteModalConfirmEl = null;

let isComposing = false;
let shouldAutoScroll = true;
let editingSessionId = null;
let isSessionsCollapsed = false;
let userCollapsePreference = null;

// 允许的文件类型白名单 (B1.13.2)
const ALLOWED_EXTS = new Set([
  // 图片
  '.png', '.jpg', '.jpeg', '.webp',
  // 文档（明确禁止 .doc, .xls, .ppt）
  '.docx', '.xlsx', '.pptx', '.pdf',
  // 文本
  '.md', '.txt',
  // 代码
  '.py', '.js', '.ts', '.json', '.html', '.css', '.java', '.c', '.cpp', '.go', '.sh', '.yaml', '.sql',
]);

const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp']);
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_ATTACHMENTS = 3;

function formatFileSize(bytes) {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function showAlertModal(title, desc) {
  if (!alertModalEl) return;
  if (alertModalTitleEl) alertModalTitleEl.textContent = title || '无法添加附件';
  if (alertModalDescEl) alertModalDescEl.textContent = desc || '';
  alertModalEl.hidden = false;
  if (alertModalOkEl) alertModalOkEl.focus();
}

export function closeAlertModal() {
  if (!alertModalEl) return;
  alertModalEl.hidden = true;
}

export function initChatView() {
  chatScrollEl = document.getElementById('chat-scroll');
  chatEmptyEl = document.getElementById('chat-empty');
  chatEmptyTitleEl = document.getElementById('chat-empty-title');
  chatEmptyTextEl = document.getElementById('chat-empty-text');
  messagesEl = document.getElementById('messages');
  composerFormEl = document.getElementById('composer');
  composerInputEl = document.getElementById('composer-input');
  sendButtonEl = document.getElementById('send-button');
  composerQueueEl = document.getElementById('composer-queue');
  newChatButtonEl = document.getElementById('new-chat-button');
  chatSessionsListEl = document.getElementById('chat-sessions-list');
  chatSessionsEl = document.getElementById('chat-sessions');
  collapseSessionsBtnEl = document.getElementById('collapse-sessions-btn');
  expandSessionsBtnEl = document.getElementById('expand-sessions-btn');

  modeToggleEl = document.getElementById('mode-toggle');
  modeLabelEl = document.getElementById('mode-label');
  chatBannerEl = document.getElementById('chat-banner');
  chatBannerTextEl = document.getElementById('chat-banner-text');
  chatBannerCloseEl = document.getElementById('chat-banner-close');

  attachBtnEl = document.getElementById('attach-btn');
  fileInputEl = document.getElementById('file-input');
  pendingAttachmentsEl = document.getElementById('pending-attachments');
  alertModalEl = document.getElementById('alert-modal');
  alertModalTitleEl = document.getElementById('alert-modal-title');
  alertModalDescEl = document.getElementById('alert-modal-desc');
  alertModalOkEl = document.getElementById('alert-modal-ok');

  deleteConfirmModalEl = document.getElementById('delete-confirm-modal');
  deleteModalDescEl = document.getElementById('delete-modal-desc');
  deleteModalCancelEl = document.getElementById('delete-modal-cancel');
  deleteModalConfirmEl = document.getElementById('delete-modal-confirm');

  if (alertModalOkEl) {
    alertModalOkEl.addEventListener('click', () => {
      closeAlertModal();
    });
  }

  if (alertModalEl) {
    alertModalEl.addEventListener('click', (event) => {
      if (event.target === alertModalEl) {
        closeAlertModal();
      }
    });
  }

  if (deleteModalCancelEl) {
    deleteModalCancelEl.addEventListener('click', () => {
      closeDeleteConfirmModal();
    });
  }

  if (deleteConfirmModalEl) {
    deleteConfirmModalEl.addEventListener('click', (event) => {
      if (event.target === deleteConfirmModalEl) {
        closeDeleteConfirmModal();
      }
    });
  }

  if (deleteModalConfirmEl) {
    deleteModalConfirmEl.addEventListener('click', async () => {
      const targetId = pendingDeleteSessionId;
      closeDeleteConfirmModal();
      if (targetId) {
        await handleDeleteSession(targetId);
      }
    });
  }

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (alertModalEl && !alertModalEl.hidden) {
        event.preventDefault();
        closeAlertModal();
      } else if (deleteConfirmModalEl && !deleteConfirmModalEl.hidden) {
        event.preventDefault();
        closeDeleteConfirmModal();
      }
    }
  });

  if (!composerInputEl || !composerFormEl) {
    return;
  }

  // 1. 监听滚动与鼠标滚轮事件
  if (chatScrollEl) {
    chatScrollEl.addEventListener('scroll', () => {
      shouldAutoScroll = isNearBottom(chatScrollEl, 80);
    });
  }

  // 2. 自适应高度文本域与实时草稿同步
  composerInputEl.addEventListener('input', () => {
    setCurrentDraft(composerInputEl.value);
    adjustInputHeight();
    syncSendButtonState();
  });

  // 3. 输入法组合保护
  composerInputEl.addEventListener('compositionstart', () => {
    isComposing = true;
  });

  composerInputEl.addEventListener('compositionend', () => {
    isComposing = false;
    syncSendButtonState();
  });

  // 4. 键盘快捷键：Enter 发送，Shift + Enter 换行
  composerInputEl.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      if (isComposing || event.isComposing) {
        return;
      }
      event.preventDefault();
      handleSubmit();
    }
  });

  // 5. 提交事件处理
  composerFormEl.addEventListener('submit', (event) => {
    event.preventDefault();
    handleSubmit();
  });

  // 6. 附件多源交互监听 (B1.13.1)
  if (attachBtnEl && fileInputEl) {
    attachBtnEl.addEventListener('click', () => {
      fileInputEl.click();
    });
    fileInputEl.addEventListener('change', (e) => {
      handleIncomingFiles(e.target.files);
      fileInputEl.value = '';
    });
  }

  // 拖拽文件进入全对话区域面板 (#chat-panel)
  const chatPanelEl = document.getElementById('chat-panel');
  const chatDragOverlayEl = document.getElementById('chat-drag-overlay');
  let dragCounter = 0;

  if (chatPanelEl) {
    chatPanelEl.addEventListener('dragenter', (e) => {
      e.preventDefault();
      dragCounter++;
      if (chatDragOverlayEl) {
        chatDragOverlayEl.hidden = false;
      }
    });

    chatPanelEl.addEventListener('dragover', (e) => {
      e.preventDefault();
    });

    chatPanelEl.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dragCounter--;
      if (dragCounter <= 0) {
        dragCounter = 0;
        if (chatDragOverlayEl) {
          chatDragOverlayEl.hidden = true;
        }
      }
    });

    chatPanelEl.addEventListener('drop', (e) => {
      e.preventDefault();
      dragCounter = 0;
      if (chatDragOverlayEl) {
        chatDragOverlayEl.hidden = true;
      }
      if (e.dataTransfer && e.dataTransfer.files) {
        handleIncomingFiles(e.dataTransfer.files);
      }
    });
  }

  // Ctrl+V 粘贴文件与截图
  composerInputEl.addEventListener('paste', (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const files = [];
    for (const item of items) {
      if (item.kind === 'file') {
        const file = item.getAsFile();
        if (file) {
          let fileName = file.name;
          if (item.type.startsWith('image/') && (!fileName || fileName === 'image.png')) {
            fileName = `image_${Date.now()}.png`;
          }
          const normalizedFile = new File([file], fileName, { type: file.type });
          files.push(normalizedFile);
        }
      }
    }
    if (files.length > 0) {
      e.preventDefault();
      handleIncomingFiles(files);
    }
  });

  // 7. 新建会话按钮监听
  if (newChatButtonEl) {
    newChatButtonEl.addEventListener('click', handleNewChat);
  }

  // 8. 形态切换胶囊监听
  if (modeToggleEl) {
    modeToggleEl.addEventListener('click', handleModeToggle);
  }

  // 9. 提示条关闭监听
  if (chatBannerCloseEl) {
    chatBannerCloseEl.addEventListener('click', hideBanner);
  }

  // 10. 会话侧栏收起与展开
  const mediaQuery = window.matchMedia('(max-width: 1023px)');

  function applyResponsiveCollapse(matches) {
    if (userCollapsePreference !== null) {
      if (matches) {
        setSessionsCollapsed(true);
      } else {
        setSessionsCollapsed(userCollapsePreference);
      }
    } else {
      setSessionsCollapsed(matches);
    }
  }

  applyResponsiveCollapse(mediaQuery.matches);

  mediaQuery.addEventListener('change', (e) => {
    applyResponsiveCollapse(e.matches);
  });

  if (collapseSessionsBtnEl) {
    collapseSessionsBtnEl.addEventListener('click', () => {
      userCollapsePreference = true;
      setSessionsCollapsed(true);
    });
  }

  if (expandSessionsBtnEl) {
    expandSessionsBtnEl.addEventListener('click', () => {
      userCollapsePreference = false;
      setSessionsCollapsed(false);
    });
  }

  // 初始化会话列表与右侧视图
  renderSessionList();
  renderActiveSession();
  renderPendingAttachments();
  resetInputHeight();
  syncSendButtonState();
}

// 附件规格全量校验与整批拒绝 (B1.13.2)
function handleIncomingFiles(fileList) {
  const incomingFiles = Array.from(fileList || []);
  if (incomingFiles.length === 0) return;

  const currentPending = getPendingAttachments();

  // 对比传入的文件与当前 pendingAttachments（按文件名 name 与大小 size 比对），同时对传入批次内部也去重
  const newFiles = [];
  const seenInBatch = new Set();

  for (const file of incomingFiles) {
    const key = `${file.name}__${file.size}`;
    if (seenInBatch.has(key)) {
      continue;
    }
    seenInBatch.add(key);

    const isDuplicate = currentPending.some(
      (p) =>
        (p.name === file.name || p.file?.name === file.name) &&
        (p.size === file.size || p.file?.size === file.size),
    );
    if (!isDuplicate) {
      newFiles.push(file);
    }
  }

  // 重复文件静默忽略，不弹窗；若无真正新增文件直接返回
  if (newFiles.length === 0) {
    return;
  }

  // ① 校验数量上限：单条消息最多 3 个
  if (currentPending.length + newFiles.length > MAX_ATTACHMENTS) {
    showAlertModal('无法添加附件', '单条消息最多添加 3 个附件。');
    return;
  }

  // ② 校验文件格式白名单
  for (const file of newFiles) {
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (!ALLOWED_EXTS.has(ext)) {
      showAlertModal(
        '无法添加附件',
        `文件 '${file.name}' 格式不受支持。仅支持常见图片、文档、文本与代码文件。`,
      );
      return;
    }
  }

  // ③ 校验单个文件大小上限：5MB
  for (const file of newFiles) {
    if (file.size > MAX_FILE_SIZE) {
      showAlertModal('无法添加附件', `文件 '${file.name}' 大小超出 5MB 限制。`);
      return;
    }
  }

  // 全部合格，加入待发送池 (B1.13.1)
  for (const file of newFiles) {
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    const isImage = IMAGE_EXTS.has(ext);
    const item = {
      id: 'att_tmp_' + Math.random().toString(36).slice(2, 9),
      file,
      name: file.name,
      size: file.size,
      ext,
      isImage,
      previewUrl: isImage ? URL.createObjectURL(file) : null,
    };
    addPendingAttachment(item);
  }

  renderPendingAttachments();
  syncSendButtonState();
}

// 渲染待发送区 DOM 胶囊 (B1.13.1)
function renderPendingAttachments() {
  if (!pendingAttachmentsEl) return;
  const pending = getPendingAttachments();
  if (pending.length === 0) {
    pendingAttachmentsEl.hidden = true;
    pendingAttachmentsEl.innerHTML = '';
    return;
  }

  pendingAttachmentsEl.hidden = false;
  pendingAttachmentsEl.innerHTML = '';

  for (const att of pending) {
    const itemEl = el('div', { className: 'pending-attachment-item' });

    const iconEl = createSvgIcon(att.isImage ? ICONS.CHAT : ICONS.FILE, 'pending-attachment-item__icon');
    const nameEl = el('span', { className: 'pending-attachment-item__name', text: att.name, attrs: { title: att.name } });
    const sizeEl = el('span', { className: 'pending-attachment-item__size', text: formatFileSize(att.size) });

    const removeBtn = el('button', {
      className: 'pending-attachment-item__remove',
      attrs: { type: 'button', 'aria-label': '移除' },
    });
    removeBtn.innerHTML = '&times;';

    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removePendingAttachment(att.id);
      renderPendingAttachments();
      syncSendButtonState();
    });

    itemEl.appendChild(iconEl);
    itemEl.appendChild(nameEl);
    itemEl.appendChild(sizeEl);
    itemEl.appendChild(removeBtn);

    pendingAttachmentsEl.appendChild(itemEl);
  }
}

function showBanner(message) {
  if (chatBannerEl && chatBannerTextEl) {
    chatBannerTextEl.textContent = message;
    chatBannerEl.hidden = false;
  }
}

function hideBanner() {
  if (chatBannerEl) {
    chatBannerEl.hidden = true;
  }
}

async function handleModeToggle() {
  const currentMode = getMode();

  if (currentMode === 'offline') {
    // 准备切入在线形态：首先进行密钥预检 (B1_1_2)
    try {
      const status = await checkConfigStatus();
      if (!status.has_api_key) {
        showBanner('未检测到模型密钥，请在本地环境变量配置并重启服务后重试。');
        return;
      }
    } catch (err) {
      showBanner(`检查服务状态失败: ${err.message || '请确认后端服务正在运行'}`);
      return;
    }

    // 密钥配置正常，允许切入在线模式 (B1_1_3)
    hideBanner();
    if (isStreaming()) {
      abortStreaming();
    }

    setMode('online');
    if (modeToggleEl) {
      modeToggleEl.classList.add('is-online');
    }
    if (modeLabelEl) {
      modeLabelEl.textContent = '在线模式';
    }

    try {
      const sessions = await fetchOnlineSessions();
      setOnlineSessions(sessions);
    } catch (err) {
      showBanner(`加载在线会话失败: ${err.message}`);
    }

    if (chatEmptyTitleEl && chatEmptyTextEl) {
      chatEmptyTitleEl.textContent = '开始在线对话';
      chatEmptyTextEl.textContent = '当前连接真实大模型，已就绪支持多轮问答、Markdown 实时渲染与工具调用。';
    }

    renderSessionList();
    renderActiveSession();

    if (composerInputEl) {
      composerInputEl.value = getCurrentDraft();
      adjustInputHeight();
      syncSendButtonState();
      composerInputEl.focus();
    }
  } else {
    // 切回离线形态 (B1_1_3 安全中断进行中的生成)
    hideBanner();
    const onlineList = getActiveSessionList();
    for (const s of onlineList) {
      if (s.messages && s.messages.length > 0) {
        const last = s.messages[s.messages.length - 1];
        if (last.status === 'streaming') {
          abortOnlineChat(s.id).catch(() => {});
          clearSessionSubscription(s.id);
          updateMessage(last.id, { status: 'interrupted' }, s.id);
        }
      }
    }

    setMode('offline');
    if (modeToggleEl) {
      modeToggleEl.classList.remove('is-online');
    }
    if (modeLabelEl) {
      modeLabelEl.textContent = '离线模式';
    }

    if (chatEmptyTitleEl && chatEmptyTextEl) {
      chatEmptyTitleEl.textContent = '开始和 Agent 对话';
      chatEmptyTextEl.textContent = '当前回复由本地 mock 生成，用来验证对话界面与流式输出。';
    }

    renderSessionList();
    renderActiveSession();

    if (composerInputEl) {
      composerInputEl.value = getCurrentDraft();
      adjustInputHeight();
      syncSendButtonState();
      composerInputEl.focus();
    }
  }
}

export function setSessionsCollapsed(collapsed) {
  isSessionsCollapsed = Boolean(collapsed);
  if (chatSessionsEl) {
    chatSessionsEl.classList.toggle('is-collapsed', isSessionsCollapsed);
  }
  if (expandSessionsBtnEl) {
    expandSessionsBtnEl.hidden = !isSessionsCollapsed;
  }
  const appSidebar = document.querySelector('.app-sidebar');
  if (appSidebar) {
    appSidebar.classList.toggle('has-collapsed-session', isSessionsCollapsed);
  }
}

export function onChatViewActivated() {
  adjustInputHeight();
  syncSendButtonState();
  if (shouldAutoScroll && chatScrollEl) {
    scrollToBottom(chatScrollEl);
  }
  if (expandSessionsBtnEl) {
    expandSessionsBtnEl.hidden = !isSessionsCollapsed;
  }
}

export function onChatViewDeactivated() {
  if (expandSessionsBtnEl) {
    expandSessionsBtnEl.hidden = true;
  }
}

function adjustInputHeight() {
  if (!composerInputEl) {
    return;
  }
  composerInputEl.style.height = 'auto';
  const targetHeight = Math.min(Math.max(composerInputEl.scrollHeight, 36), 200);
  composerInputEl.style.height = `${targetHeight}px`;

  const rowEl = composerInputEl.closest('.composer__row');
  if (rowEl) {
    rowEl.style.alignItems = targetHeight > 42 ? 'flex-end' : 'center';
  }
}

function resetInputHeight() {
  if (!composerInputEl) {
    return;
  }
  composerInputEl.style.height = '36px';
  const rowEl = composerInputEl.closest('.composer__row');
  if (rowEl) {
    rowEl.style.alignItems = 'center';
  }
}

function syncSendButtonState() {
  if (!sendButtonEl || !composerInputEl) {
    return;
  }
  const hasText = composerInputEl.value.trim().length > 0;
  const hasAttachments = getPendingAttachments().length > 0;
  sendButtonEl.disabled = !hasText && !hasAttachments;
}

function syncQueueUI() {
  if (!composerQueueEl) {
    return;
  }
  const queueLen = getQueueLength();
  if (queueLen > 0) {
    composerQueueEl.textContent = `另有 ${queueLen} 条消息等待回复`;
    composerQueueEl.hidden = false;
  } else {
    composerQueueEl.hidden = true;
  }
}

// 渲染会话列表
function renderSessionList() {
  if (!chatSessionsListEl) {
    return;
  }

  if (editingSessionId !== null) {
    return;
  }

  const sessions = getSessions();
  const activeId = getActiveSessionId();
  const fragment = document.createDocumentFragment();

  sessions.forEach((session) => {
    const li = el('li', {
      className: `session-item${session.id === activeId ? ' is-active' : ''}`,
      attrs: {
        'data-session-id': session.id,
      },
    });

    const titleEl = el('span', {
      className: 'session-item__title',
      text: session.title,
      attrs: {
        title: session.title,
      },
    });

    const editInput = el('input', {
      className: 'session-item__input',
      attrs: {
        type: 'text',
        value: session.title,
        maxlength: '50',
      },
    });
    editInput.hidden = true;

    const actions = el('div', { className: 'session-item__actions' });

    const renameBtn = el(
      'button',
      {
        className: 'session-item__action-btn',
        attrs: {
          type: 'button',
          'aria-label': '重命名会话',
          title: '重命名',
        },
      },
      [createSvgIcon(ICONS.PENCIL, 'session-item__action-icon')],
    );

    const deleteBtn = el(
      'button',
      {
        className: 'session-item__action-btn session-item__action-btn--delete',
        attrs: {
          type: 'button',
          'aria-label': '删除会话',
          title: '删除',
          'data-action': 'delete',
        },
      },
      [createSvgIcon(ICONS.TRASH, 'session-item__action-icon')],
    );

    actions.appendChild(renameBtn);
    actions.appendChild(deleteBtn);

    li.appendChild(titleEl);
    li.appendChild(editInput);
    li.appendChild(actions);

    li.addEventListener('click', (e) => {
      if (e.target.closest('.session-item__actions') || e.target === editInput) {
        return;
      }
      handleSelectSession(session.id);
    });

    renameBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      startRenaming(session.id, li, titleEl, editInput);
    });

    deleteBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openDeleteConfirmModal(session.id, session.title);
    });

    fragment.appendChild(li);
  });

  chatSessionsListEl.innerHTML = '';
  chatSessionsListEl.appendChild(fragment);
}

function openDeleteConfirmModal(sessionId, sessionTitle) {
  pendingDeleteSessionId = sessionId;
  if (deleteModalDescEl) {
    const displayTitle = sessionTitle ? `"${sessionTitle}"` : '该对话';
    deleteModalDescEl.textContent = `确定要删除 ${displayTitle} 吗？删除后其中的全部消息与附件副本将无法恢复。`;
  }
  if (deleteConfirmModalEl) {
    deleteConfirmModalEl.hidden = false;
  }
}

function closeDeleteConfirmModal() {
  pendingDeleteSessionId = null;
  if (deleteConfirmModalEl) {
    deleteConfirmModalEl.hidden = true;
  }
}

function startRenaming(sessionId, li, titleEl, editInput) {
  editingSessionId = sessionId;
  li.classList.add('is-editing');
  titleEl.hidden = true;
  editInput.hidden = false;
  editInput.value = titleEl.textContent;
  editInput.focus();
  editInput.select();

  let isCommitted = false;
  let isRenamingComposing = false;

  const handleCompositionStart = () => {
    isRenamingComposing = true;
  };

  const handleCompositionEnd = () => {
    isRenamingComposing = false;
  };

  const commit = async () => {
    if (isCommitted) return;
    isCommitted = true;

    editInput.removeEventListener('compositionstart', handleCompositionStart);
    editInput.removeEventListener('compositionend', handleCompositionEnd);
    editInput.removeEventListener('keydown', handleKeyDown);
    editInput.removeEventListener('blur', handleBlur);

    const val = editInput.value.replace(/\s+/g, ' ').trim();
    if (val && val !== titleEl.textContent) {
      if (getMode() === 'online') {
        try {
          await renameOnlineSession(sessionId, val);
          renameSession(sessionId, val);
        } catch (err) {
          showBanner(`重命名在线会话失败: ${err.message}`);
        }
      } else {
        renameSession(sessionId, val);
      }
    }
    editingSessionId = null;
    renderSessionList();
  };

  const cancel = () => {
    if (isCommitted) return;
    isCommitted = true;

    editInput.removeEventListener('compositionstart', handleCompositionStart);
    editInput.removeEventListener('compositionend', handleCompositionEnd);
    editInput.removeEventListener('keydown', handleKeyDown);
    editInput.removeEventListener('blur', handleBlur);

    editingSessionId = null;
    renderSessionList();
  };

  const handleKeyDown = (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      if (isRenamingComposing || e.isComposing) {
        return;
      }
      e.preventDefault();
      commit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancel();
    }
  };

  const handleBlur = () => {
    commit();
  };

  editInput.addEventListener('compositionstart', handleCompositionStart);
  editInput.addEventListener('compositionend', handleCompositionEnd);
  editInput.addEventListener('keydown', handleKeyDown);
  editInput.addEventListener('blur', handleBlur);
}

async function handleDeleteSession(sessionId) {
  if (isStreaming()) {
    abortStreaming();
    syncSendButtonState();
  }

  clearQueueForSession(sessionId);
  syncQueueUI();

  const wasActive = getActiveSessionId() === sessionId;

  if (getMode() === 'online') {
    try {
      await deleteOnlineSession(sessionId);
    } catch (err) {
      showBanner(`删除在线会话失败: ${err.message}`);
    }
  }

  deleteSession(sessionId);
  renderSessionList();

  if (wasActive) {
    enterDraft();
    if (composerInputEl) {
      composerInputEl.value = getCurrentDraft();
      resetInputHeight();
      syncSendButtonState();
    }
    renderActiveSession();
  }

  processQueue();
}

function handleNewChat() {
  const currentActiveId = getActiveSessionId();
  if (currentActiveId === null) {
    clearDraftText();
    if (composerInputEl) {
      composerInputEl.value = '';
      resetInputHeight();
      syncSendButtonState();
    }
  } else {
    enterDraft();
    if (composerInputEl) {
      composerInputEl.value = getDraftText();
      adjustInputHeight();
      syncSendButtonState();
    }
  }

  if (chatSessionsListEl) {
    const items = chatSessionsListEl.querySelectorAll('.session-item');
    items.forEach((item) => item.classList.remove('is-active'));
  }

  renderActiveSession();
  if (composerInputEl) {
    composerInputEl.focus();
  }
}

async function handleSelectSession(sessionId) {
  if (getActiveSessionId() === sessionId) {
    return;
  }

  if (getActiveSessionId() === null && composerInputEl) {
    setDraftText(composerInputEl.value);
  }

  switchSession(sessionId);

  if (getMode() === 'online') {
    try {
      const messages = await fetchOnlineMessages(sessionId);
      setSessionMessages(sessionId, messages);

      const latest = messages[messages.length - 1];
      if (latest && latest.role === 'assistant' && latest.status === 'streaming') {
        subscribeOnlineSession(sessionId, latest.id);
      }
    } catch (err) {
      showBanner(`加载会话历史失败: ${err.message}`);
    }
  }

  renderSessionList();
  renderActiveSession();

  if (composerInputEl) {
    composerInputEl.value = getSessionDraft(sessionId);
    adjustInputHeight();
    syncSendButtonState();
    composerInputEl.focus();
  }
}

function renderActiveSession() {
  if (!messagesEl || !chatEmptyEl) {
    return;
  }

  messagesEl.replaceChildren();

  const activeSession = getActiveSession();
  if (!activeSession || activeSession.messages.length === 0) {
    chatEmptyEl.hidden = false;
  } else {
    chatEmptyEl.hidden = true;
    const fragment = document.createDocumentFragment();
    activeSession.messages.forEach((msg) => {
      const node = createMessageNode(msg);
      fragment.appendChild(node);
    });
    messagesEl.appendChild(fragment);
    if (chatScrollEl) {
      scrollToBottom(chatScrollEl);
    }
  }
}

function createStepStatusElement(status = 'thinking', text = '正在思考...') {
  const container = el('div', {
    className: `agent-step-status agent-step-status--${status}`,
  });
  const icon = el('span', { className: 'agent-step-status__icon' });
  const textSpan = el('span', {
    className: 'agent-step-status__text',
    text,
  });
  container.appendChild(icon);
  container.appendChild(textSpan);
  return container;
}

function updateStepStatus(cardNode, status, text) {
  if (!cardNode) return;
  const bubble = cardNode.querySelector('.msg__bubble');
  if (!bubble) return;

  const waitingEl = cardNode.querySelector('.msg__waiting');
  if (waitingEl) waitingEl.remove();

  let stepEl = bubble.querySelector('.agent-step-status');
  if (!stepEl) {
    stepEl = createStepStatusElement(status, text || '正在思考...');
    const textEl = bubble.querySelector('.msg__text');
    if (textEl) {
      bubble.insertBefore(stepEl, textEl);
    } else {
      bubble.appendChild(stepEl);
    }
  } else {
    stepEl.className = `agent-step-status agent-step-status--${status}`;
    const textSpan = stepEl.querySelector('.agent-step-status__text');
    if (textSpan && text) {
      textSpan.textContent = text;
    }
  }

  if (status === 'done' || status === 'completed') {
    stepEl.classList.add('is-done');
    const textSpan = stepEl.querySelector('.agent-step-status__text');
    if (textSpan) {
      textSpan.textContent = text || '规划完成';
    }
  }
}

function createMessageNode(message) {
  const isUser = message.role === 'user';
  const roleClass = isUser ? 'msg--user' : 'msg--agent msg--assistant';
  const isInterrupted = message.status === 'interrupted';
  const isError = message.status === 'error';

  const article = el('article', {
    className: `msg ${roleClass}${message.status === 'streaming' ? ' is-streaming' : ''}${isError ? ' is-error' : ''}${isInterrupted ? ' is-interrupted' : ''}`,
    attrs: {
      'data-message-id': message.id,
    },
  });

  const bubble = el('div', { className: 'msg__bubble' });

  // 1. 渲染消息附件卡片列表 (B1.13.4)
  if (message.attachments && message.attachments.length > 0) {
    const attContainer = el('div', { className: 'msg__attachments' });
    for (const att of message.attachments) {
      const isImg = Boolean(att.is_image || att.isImage);
      let card;

      if (isImg) {
        card = el('div', {
          className: 'attachment-card attachment-card--image',
          attrs: { title: att.filename },
        }, [
          el('img', {
            className: 'attachment-card__thumb',
            attrs: {
              src: `/api/attachments/${encodeURIComponent(att.id)}/preview`,
              alt: att.filename,
              loading: 'lazy',
            },
          }),
        ]);
      } else {
        card = el('div', {
          className: 'attachment-card attachment-card--file',
          attrs: { title: att.filename },
        }, [
          createSvgIcon(ICONS.FILE, 'attachment-card__icon'),
          el('div', { className: 'attachment-card__info' }, [
            el('span', { className: 'attachment-card__name', text: att.filename }),
            el('span', { className: 'attachment-card__size', text: formatFileSize(att.file_size || att.fileSize || 0) }),
          ]),
        ]);
      }

      // 点击调起 Windows 默认关联应用 (B1.13.4)
      card.addEventListener('click', async (e) => {
        e.stopPropagation();
        try {
          await openAttachment(att.id);
        } catch (err) {
          if (err.status === 404 || err.code === 'ATTACHMENT_NOT_FOUND') {
            showAlertModal('提示', '文件已不存在');
          } else {
            showAlertModal('提示', err.message || '无法打开附件');
          }
        }
      });

      attContainer.appendChild(card);
    }
    bubble.appendChild(attContainer);
  }

  // 2. 助手流式规划步骤指示器
  if (!isUser && message.status === 'streaming' && !message.content) {
    const stepEl = createStepStatusElement('thinking', '正在思考...');
    bubble.appendChild(stepEl);
  }

  const shouldRenderMarkdown = getMode() === 'online' && !isUser && !(isError && !message.content);

  // 3. 消息正文渲染
  if (shouldRenderMarkdown) {
    const textEl = el('div', { className: 'msg__text msg__text--markdown' });
    renderMarkdownToElement(textEl, message.content || '');
    bubble.appendChild(textEl);

    if (isError && message.errorMessage) {
      const tip = el('div', {
        className: 'msg__error-tip',
        text: message.errorMessage,
      });
      bubble.appendChild(tip);
    }
  } else if (isError && message.content && message.errorMessage) {
    const text = el('p', {
      className: 'msg__text',
      text: message.content,
    });
    bubble.appendChild(text);

    const tip = el('div', {
      className: 'msg__error-tip',
      text: message.errorMessage,
    });
    bubble.appendChild(tip);
  } else {
    const displayText = isError && message.errorMessage ? message.errorMessage : (message.content || '');
    if (displayText || (!message.attachments || message.attachments.length === 0)) {
      const text = el('p', {
        className: 'msg__text',
        text: displayText,
      });
      bubble.appendChild(text);
    }
  }

  if (isInterrupted) {
    const badge = el('span', {
      className: 'badge badge--interrupted',
      text: '已中断',
    });
    bubble.appendChild(badge);
  }

  const createdAt = message.createdAt instanceof Date ? message.createdAt : new Date(message.createdAt);
  const time = el('time', {
    className: 'msg__time',
    text: formatTimestamp(createdAt),
    attrs: {
      datetime: createdAt.toISOString(),
    },
  });

  // 一键复制按钮 (B1.12)
  const copyBtn = el(
    'button',
    {
      className: 'msg__copy-btn',
      attrs: {
        type: 'button',
        'aria-label': '复制消息内容',
        title: '复制',
      },
    },
    [
      createSvgIcon(ICONS.COPY, 'msg__copy-icon'),
      el('span', { className: 'msg__copy-label', text: '复制' }),
    ],
  );

  copyBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    handleCopyMessage(article, message, copyBtn);
  });

  const metaEl = el('div', { className: 'msg__meta' }, [time, copyBtn]);

  article.appendChild(bubble);
  article.appendChild(metaEl);
  return article;
}

// 消息一键复制与反馈 (B1.12)
async function handleCopyMessage(articleEl, message, copyBtnEl) {
  let plainText = '';
  const textEl = articleEl.querySelector('.msg__text');

  if (textEl && textEl.classList.contains('msg__text--markdown')) {
    if (textEl.isConnected && typeof textEl.innerText === 'string' && textEl.innerText.trim().length > 0) {
      plainText = textEl.innerText.trim();
    } else {
      plainText = stripMarkdownToPlainText(message.content || '');
    }
  } else if (textEl && typeof textEl.textContent === 'string') {
    plainText = textEl.textContent.trim();
  } else {
    plainText = (message.content || '').trim();
  }

  if (!plainText) {
    return;
  }

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(plainText);
    } else {
      copyUsingTextareaFallback(plainText);
    }
  } catch (err) {
    try {
      copyUsingTextareaFallback(plainText);
    } catch {
      showBanner('复制失败，请手动选中文本');
      return;
    }
  }

  copyBtnEl.classList.add('is-copied');
  const useEl = copyBtnEl.querySelector('use');
  if (useEl) {
    useEl.setAttribute('href', `#${ICONS.CHECK}`);
  }
  const labelEl = copyBtnEl.querySelector('.msg__copy-label');
  if (labelEl) {
    labelEl.textContent = '已复制';
  }

  if (copyBtnEl._copyTimer) {
    clearTimeout(copyBtnEl._copyTimer);
  }

  copyBtnEl._copyTimer = setTimeout(() => {
    copyBtnEl.classList.remove('is-copied');
    if (useEl) {
      useEl.setAttribute('href', `#${ICONS.COPY}`);
    }
    if (labelEl) {
      labelEl.textContent = '复制';
    }
    copyBtnEl._copyTimer = null;
  }, 1500);
}

function copyUsingTextareaFallback(text) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    document.execCommand('copy');
  } finally {
    textarea.remove();
  }
}

// 提交发送消息逻辑 (支持文本与附件)
async function handleSubmit() {
  if (!composerInputEl) {
    return;
  }
  const text = composerInputEl.value.trim();
  const pending = [...getPendingAttachments()];

  if (!text && pending.length === 0) {
    return;
  }

  let activeSession = getActiveSession();

  // 若处于空白草稿态，发出首条消息时正式创建新会话
  if (!activeSession) {
    const rawTitleText = text || (pending[0]?.name || '新会话');
    const folded = rawTitleText.replace(/\s+/g, ' ');
    const title = Array.from(folded).slice(0, 10).join('') || '新会话';

    if (getMode() === 'online') {
      try {
        const created = await createOnlineSession({ title });
        activeSession = addOnlineSessionToStore(created);
        switchSession(activeSession.id);
        clearDraftText();
      } catch (err) {
        showBanner(`创建在线会话失败: ${err.message}`);
        return;
      }
    } else {
      activeSession = createSessionFromDraft(rawTitleText);
      clearDraftText();
    }
  }

  // 在线形态发送逻辑 (包含视觉探测与 400 阻断保护 B1.14)
  if (getMode() === 'online') {
    const pendingFiles = pending.map((a) => a.file);
    let sendResult;

    try {
      sendResult = await sendOnlineMessage(activeSession.id, text, pendingFiles);
    } catch (err) {
      // 捕获模型不支持图片输入 (B1.14.1)
      if (err.code === 'IMAGE_NOT_SUPPORTED' || (err.status === 400 && err.message?.includes('图片'))) {
        // 弹出深色模态提示
        showAlertModal('无法发送消息', '当前模型不支持图片输入');
        // 清空本条消息全部附件
        clearPendingAttachments();
        renderPendingAttachments();
        syncSendButtonState();
        // 保留输入框文字并重新聚焦
        composerInputEl.focus();
        return;
      }
      showBanner(`发送消息失败: ${err.message}`);
      return;
    }

    // 发送成功，上屏用户消息
    const userAttachments = sendResult?.attachments || [];
    const userMessage = addUserMessage(text, activeSession.id, sendResult?.user_message_id, userAttachments);
    setSessionDraft(activeSession.id, '');

    // 清空输入框与待发送附件
    composerInputEl.value = '';
    resetInputHeight();
    clearPendingAttachments();
    renderPendingAttachments();
    syncSendButtonState();
    composerInputEl.focus();

    if (chatEmptyEl) {
      chatEmptyEl.hidden = true;
    }
    const userNode = createMessageNode(userMessage);
    if (messagesEl) {
      messagesEl.appendChild(userNode);
    }

    // 追加状态为 streaming 的 Agent 占位并上屏
    const assistantMsgId = sendResult?.assistant_message_id || null;
    const agentMessage = addAgentPlaceholder(assistantMsgId, activeSession.id);
    const agentNode = createMessageNode(agentMessage);
    if (messagesEl) {
      messagesEl.appendChild(agentNode);
    }
    if (chatScrollEl) {
      scrollToBottom(chatScrollEl);
    }
    renderSessionList();

    subscribeOnlineSession(activeSession.id, agentMessage.id);
    return;
  }

  // 离线形态发送逻辑 (Mock 模式带附件上传缓存后直出)
  let offlineAtts = [];
  const pendingFiles = pending.map((a) => a.file).filter(Boolean);
  if (pendingFiles.length > 0) {
    try {
      const uploaded = await uploadCacheAttachments(pendingFiles);
      offlineAtts = (uploaded || []).map((att) => ({
        id: att.id,
        filename: att.filename,
        file_type: att.file_type,
        file_size: att.file_size,
        is_image: att.is_image,
      }));
    } catch (err) {
      showAlertModal('无法添加附件', err.message || '上传缓存附件失败');
      return;
    }
  } else {
    offlineAtts = pending.map((a) => ({
      id: a.id,
      filename: a.name,
      file_type: a.ext.slice(1),
      file_size: a.size,
      is_image: a.isImage,
    }));
  }

  const userMessage = addUserMessage(text, activeSession.id, null, offlineAtts);
  setSessionDraft(activeSession.id, '');

  composerInputEl.value = '';
  resetInputHeight();
  clearPendingAttachments();
  renderPendingAttachments();
  syncSendButtonState();
  composerInputEl.focus();

  if (chatEmptyEl) {
    chatEmptyEl.hidden = true;
  }
  const userNode = createMessageNode(userMessage);
  if (messagesEl) {
    messagesEl.appendChild(userNode);
  }

  const agentMessage = addAgentPlaceholder(null, activeSession.id);
  const agentNode = createMessageNode(agentMessage);
  if (messagesEl) {
    messagesEl.appendChild(agentNode);
  }
  if (chatScrollEl) {
    scrollToBottom(chatScrollEl);
  }
  renderSessionList();

  const snapshot = getHistorySnapshot(activeSession.id);
  enqueueRequest({
    sessionId: activeSession.id,
    messageId: agentMessage.id,
    snapshot,
  });
  syncQueueUI();

  processQueue();
}

function subscribeOnlineSession(sessionId, messageId) {
  const controller = new AbortController();
  setSessionSubscription(sessionId, controller);

  subscribeChatStream(sessionId, {
    signal: controller.signal,
    onMeta({ message_id, created_at }) {
      if (getActiveSessionId() === sessionId && messagesEl) {
        const cardNode = messagesEl.querySelector(
          `[data-message-id="${message_id}"], [data-message-id="${messageId}"]`,
        );
        if (cardNode) {
          if (message_id) {
            cardNode.dataset.messageId = message_id;
          }
          if (created_at) {
            const timeEl = cardNode.querySelector('.msg__time');
            if (timeEl) {
              const createdDate = new Date(created_at);
              timeEl.dateTime = created_at;
              timeEl.textContent = formatTimestamp(createdDate);
            }
          }
        }
      }
      const patch = {};
      if (created_at) patch.createdAt = new Date(created_at);
      if (message_id) patch.id = message_id;
      updateMessage(messageId, patch, sessionId);
    },
    onStepStatus(data) {
      // 监听到 Agent 规划步骤状态广播 (B1.15.3 升级)
      if (getActiveSessionId() === sessionId && messagesEl) {
        const cardNode = messagesEl.querySelector(
          `[data-message-id="${messageId}"]`,
        );
        if (cardNode) {
          updateStepStatus(cardNode, data?.status || 'thinking', data?.text);
          if (shouldAutoScroll && chatScrollEl) {
            scrollToBottom(chatScrollEl);
          }
        }
      }
    },
    onToolStart(data) {
      // 监听到 ReAct 工具调用开始，展示胶囊 (B1.15.3)
      if (getActiveSessionId() === sessionId && messagesEl) {
        const cardNode = messagesEl.querySelector(
          `[data-message-id="${messageId}"]`,
        );
        if (cardNode) {
          const waitingEl = cardNode.querySelector('.msg__waiting');
          if (waitingEl) waitingEl.remove();

          const bubble = cardNode.querySelector('.msg__bubble');
          if (bubble) {
            let capsule = bubble.querySelector('.msg__tool-capsule');
            if (!capsule) {
              capsule = el('div', { className: 'msg__tool-capsule' }, [
                el('span', { className: 'msg__tool-spinner' }),
                el('span', {
                  className: 'msg__tool-label',
                  text: data?.status_text || `正在读取附件 ${data?.attachment_name || ''}...`,
                }),
              ]);
              const textEl = bubble.querySelector('.msg__text');
              if (textEl) {
                bubble.insertBefore(capsule, textEl);
              } else {
                bubble.appendChild(capsule);
              }
            } else {
              const labelEl = capsule.querySelector('.msg__tool-label');
              if (labelEl) {
                labelEl.textContent = data?.status_text || `正在读取附件 ${data?.attachment_name || ''}...`;
              }
            }
            if (shouldAutoScroll && chatScrollEl) {
              scrollToBottom(chatScrollEl);
            }
          }
        }
      }
    },
    onToolDone(data) {
      // 监听到 ReAct 工具调用完成，标记胶囊 (B1.15.3)
      if (getActiveSessionId() === sessionId && messagesEl) {
        const cardNode = messagesEl.querySelector(
          `[data-message-id="${messageId}"]`,
        );
        if (cardNode) {
          const capsule = cardNode.querySelector('.msg__tool-capsule');
          if (capsule) {
            capsule.classList.add('is-done');
          }
        }
      }
    },
    onDelta({ text }) {
      if (!text) return;
      const msg = findMessageInSession(sessionId, messageId);
      if (msg) {
        msg.content = (msg.content || '') + text;
      }

      if (getActiveSessionId() === sessionId && messagesEl) {
        const cardNode = messagesEl.querySelector(
          `[data-message-id="${messageId}"], [data-message-id="${msg?.id}"]`,
        );
        if (cardNode) {
          const waitingEl = cardNode.querySelector('.msg__waiting');
          if (waitingEl) waitingEl.remove();

          const stepEl = cardNode.querySelector('.agent-step-status');
          if (stepEl) {
            stepEl.classList.add('has-delta');
          }

          let textEl = cardNode.querySelector('.msg__text');
          if (textEl) {
            if (!textEl.classList.contains('msg__text--markdown')) {
              textEl.classList.add('msg__text--markdown');
            }
            renderMarkdownToElement(textEl, msg ? msg.content : text);
          }
          if (shouldAutoScroll && chatScrollEl) {
            scrollToBottom(chatScrollEl);
          }
        }
      }
    },
    onDone(data) {
      clearSessionSubscription(sessionId);
      const isInterrupted = data?.finish_reason === 'interrupted';
      const status = isInterrupted ? 'interrupted' : 'done';
      updateMessage(messageId, { status }, sessionId);

      if (getActiveSessionId() === sessionId && messagesEl) {
        const cardNode = messagesEl.querySelector(
          `[data-message-id="${messageId}"]`,
        );
        if (cardNode) {
          cardNode.classList.remove('is-streaming');
          const waitingEl = cardNode.querySelector('.msg__waiting');
          if (waitingEl) waitingEl.remove();
          updateStepStatus(cardNode, 'done', '规划完成');

          if (isInterrupted) {
            cardNode.classList.add('is-interrupted');
            const bubble = cardNode.querySelector('.msg__bubble');
            if (bubble && !bubble.querySelector('.badge--interrupted')) {
              const badge = el('span', { className: 'badge badge--interrupted', text: '已中断' });
              bubble.appendChild(badge);
            }
          }
          if (shouldAutoScroll && chatScrollEl) {
            scrollToBottom(chatScrollEl);
          }
        }
      }
    },
    onError(error) {
      if (error?.name === 'AbortError') {
        return;
      }
      clearSessionSubscription(sessionId);
      const errMsg = error?.message || '生成过程发生异常，请重试。';
      updateMessage(messageId, { status: 'error', errorMessage: errMsg }, sessionId);

      if (getActiveSessionId() === sessionId && messagesEl) {
        const cardNode = messagesEl.querySelector(
          `[data-message-id="${messageId}"]`,
        );
        if (cardNode) {
          cardNode.classList.remove('is-streaming');
          cardNode.classList.add('is-error');
          const waitingEl = cardNode.querySelector('.msg__waiting');
          if (waitingEl) waitingEl.remove();
          const stepEl = cardNode.querySelector('.agent-step-status');
          if (stepEl) stepEl.remove();

          const bubble = cardNode.querySelector('.msg__bubble');
          const textEl = cardNode.querySelector('.msg__text');
          const msg = findMessageInSession(sessionId, messageId);

          if (msg && msg.content) {
            if (textEl) {
              if (!textEl.classList.contains('msg__text--markdown')) {
                textEl.classList.add('msg__text--markdown');
              }
              renderMarkdownToElement(textEl, msg.content);
            }
            if (bubble) {
              let tipEl = bubble.querySelector('.msg__error-tip');
              if (!tipEl) {
                tipEl = el('div', { className: 'msg__error-tip' });
                bubble.appendChild(tipEl);
              }
              tipEl.textContent = errMsg;
            }
          } else {
            if (textEl) textEl.textContent = errMsg;
          }
          if (shouldAutoScroll && chatScrollEl) {
            scrollToBottom(chatScrollEl);
          }
        }
      }
    },
  });
}

async function processQueue() {
  if (isStreaming() || getQueueLength() === 0) {
    return;
  }

  const item = dequeueRequest();
  if (!item) {
    return;
  }

  syncQueueUI();

  const { sessionId, messageId, snapshot } = item;
  const agentMessage = findMessageInSession(sessionId, messageId);
  if (!agentMessage) {
    processQueue();
    return;
  }

  setStreaming(true);

  const controller = new AbortController();
  setCurrentAbortController(controller);

  // Mock 模式开始规划步骤：正在思考...
  if (getActiveSessionId() === sessionId && messagesEl) {
    const cardNode = messagesEl.querySelector(
      `[data-message-id="${agentMessage.id}"], [data-message-id="${messageId}"]`,
    );
    if (cardNode) {
      updateStepStatus(cardNode, 'thinking', '正在思考...');
    }
  }

  try {
    await streamChat({
      messages: snapshot,
      signal: controller.signal,
      onMeta({ message_id, created_at }) {
        const prevId = agentMessage.id;

        if (getActiveSessionId() === sessionId && messagesEl) {
          const cardNode = messagesEl.querySelector(
            `[data-message-id="${prevId}"], [data-message-id="${messageId}"]`,
          );
          if (cardNode) {
            // 收到元信息，转为正在生成回复...
            updateStepStatus(cardNode, 'generating', '正在生成回复...');

            if (message_id) {
              cardNode.dataset.messageId = message_id;
            }
            if (created_at) {
              const timeEl = cardNode.querySelector('.msg__time');
              if (timeEl) {
                const createdDate = new Date(created_at);
                timeEl.dateTime = created_at;
                timeEl.textContent = formatTimestamp(createdDate);
              }
            }
          }
        }

        const patch = {};
        if (created_at) {
          patch.createdAt = new Date(created_at);
        }
        if (message_id) {
          patch.id = message_id;
        }
        updateMessage(prevId, patch, sessionId);
      },
      onStepStatus(data) {
        if (getActiveSessionId() === sessionId && messagesEl) {
          const cardNode = messagesEl.querySelector(
            `[data-message-id="${agentMessage.id}"], [data-message-id="${messageId}"]`,
          );
          if (cardNode) {
            updateStepStatus(cardNode, data?.status || 'thinking', data?.text);
          }
        }
      },
      onDelta({ text }) {
        if (!text) {
          return;
        }

        agentMessage.content += text;

        if (getActiveSessionId() === sessionId && messagesEl) {
          const cardNode = messagesEl.querySelector(
            `[data-message-id="${agentMessage.id}"], [data-message-id="${messageId}"]`,
          );
          if (cardNode) {
            cardNode.dataset.messageId = agentMessage.id;

            const waitingEl = cardNode.querySelector('.msg__waiting');
            if (waitingEl) {
              waitingEl.remove();
            }

            const stepEl = cardNode.querySelector('.agent-step-status');
            if (stepEl) {
              stepEl.classList.add('has-delta');
            }

            const textEl = cardNode.querySelector('.msg__text');
            if (textEl) {
              textEl.textContent = agentMessage.content;
            }
            if (shouldAutoScroll && chatScrollEl) {
              scrollToBottom(chatScrollEl);
            }
          }
        }
      },
      onDone() {
        updateMessage(agentMessage.id, { status: 'done' }, sessionId);

        if (getActiveSessionId() === sessionId && messagesEl) {
          const cardNode = messagesEl.querySelector(
            `[data-message-id="${agentMessage.id}"], [data-message-id="${messageId}"]`,
          );
          if (cardNode) {
            cardNode.dataset.messageId = agentMessage.id;
            const waitingEl = cardNode.querySelector('.msg__waiting');
            if (waitingEl) {
              waitingEl.remove();
            }
            cardNode.classList.remove('is-streaming');
            updateStepStatus(cardNode, 'done', '规划完成');

            if (shouldAutoScroll && chatScrollEl) {
              scrollToBottom(chatScrollEl);
            }
          }
        }
      },
      onError(error) {
        if (error?.name === 'AbortError') {
          return;
        }

        const errMsg = error?.message || '生成过程发生异常，请重试。';
        updateMessage(agentMessage.id, { status: 'error', errorMessage: errMsg }, sessionId);

        if (getActiveSessionId() === sessionId && messagesEl) {
          const cardNode = messagesEl.querySelector(
            `[data-message-id="${agentMessage.id}"], [data-message-id="${messageId}"]`,
          );
          if (cardNode) {
            cardNode.dataset.messageId = agentMessage.id;
            const waitingEl = cardNode.querySelector('.msg__waiting');
            if (waitingEl) {
              waitingEl.remove();
            }
            cardNode.classList.remove('is-streaming');
            cardNode.classList.add('is-error');

            const stepEl = cardNode.querySelector('.agent-step-status');
            if (stepEl) stepEl.remove();

            const bubble = cardNode.querySelector('.msg__bubble');
            const textEl = cardNode.querySelector('.msg__text');

            if (agentMessage.content) {
              if (textEl) {
                textEl.textContent = agentMessage.content;
              }
              if (bubble) {
                let tipEl = bubble.querySelector('.msg__error-tip');
                if (!tipEl) {
                  tipEl = el('div', { className: 'msg__error-tip' });
                  bubble.appendChild(tipEl);
                }
                tipEl.textContent = errMsg;
              }
            } else {
              if (textEl) {
                textEl.textContent = errMsg;
              }
            }

            if (shouldAutoScroll && chatScrollEl) {
              scrollToBottom(chatScrollEl);
            }
          }
        }
      },
    });
  } finally {
    setStreaming(false);
    setCurrentAbortController(null);
    syncSendButtonState();
    processQueue();
  }
}
