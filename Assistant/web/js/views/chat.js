// 对话主窗口与会话列表视图：多会话管理、双形态切换、草稿保留与丢弃、DOM 渲染与流式响应驱动

import {
  abortOnlineChat,
  checkConfigStatus,
  createOnlineSession,
  deleteOnlineSession,
  fetchOnlineMessages,
  fetchOnlineSessions,
  renameOnlineSession,
  sendOnlineMessage,
  streamChat,
  subscribeChatStream,
} from '../api.js';
import { createSvgIcon, el, formatTimestamp, isNearBottom, scrollToBottom } from '../dom.js';
import {
  abortStreaming,
  addAgentPlaceholder,
  addOnlineSessionToStore,
  addUserMessage,
  clearDraftText,
  clearQueueForSession,
  clearSessionSubscription,
  getSessionSubscription,
  setSessionSubscription,
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
  getCurrentDraft,
  getDraftText,
  getHistorySnapshot,
  getMode,
  getQueueLength,
  getSessionDraft,
  getSessions,
  isStreaming,
  renameSession,
  setCurrentAbortController,
  setCurrentDraft,
  setDraftText,
  setMode,
  setOnlineSessions,
  setSessionDraft,
  setSessionMessages,
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

let isComposing = false;
let shouldAutoScroll = true;
let editingSessionId = null;
let isSessionsCollapsed = false;
let userCollapsePreference = null;

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

  if (!composerInputEl || !composerFormEl) {
    return;
  }

  // 1. 监听滚动与鼠标滚轮事件
  if (chatScrollEl) {
    chatScrollEl.addEventListener('scroll', () => {
      shouldAutoScroll = isNearBottom(chatScrollEl, 80);
    });

    chatScrollEl.addEventListener(
      'wheel',
      (event) => {
        if (event.deltaY < 0) {
          shouldAutoScroll = false;
        } else if (isNearBottom(chatScrollEl, 80)) {
          shouldAutoScroll = true;
        }
      },
      { passive: true },
    );
  }

  // 2. 统一草稿实时存取：键入即存入当前活动目标
  composerInputEl.addEventListener('input', () => {
    setCurrentDraft(composerInputEl.value);
    adjustInputHeight();
    syncSendButtonState();
  });

  // 3. 中文输入法组合保护
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

  // 5. 表单提交
  composerFormEl.addEventListener('submit', (event) => {
    event.preventDefault();
    handleSubmit();
  });

  // 6. 新建对话按钮点击
  if (newChatButtonEl) {
    newChatButtonEl.addEventListener('click', () => {
      handleNewChat();
    });
  }

  // 7. 形态切换点击 (B1_1_1, B1_1_2, B1_1_3)
  if (modeToggleEl) {
    modeToggleEl.addEventListener('click', () => {
      handleModeToggle();
    });
  }

  if (chatBannerCloseEl) {
    chatBannerCloseEl.addEventListener('click', () => {
      hideBanner();
    });
  }

  // 8. 会话侧栏收起与展开
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
  resetInputHeight();
  syncSendButtonState();
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

    // 更新空状态文案
    if (chatEmptyTitleEl) {
      chatEmptyTitleEl.textContent = '开始和 Agent 对话';
    }
    if (chatEmptyTextEl) {
      chatEmptyTextEl.textContent = '当前处于在线模式，回复由真实大模型生成，会话与消息保存在本地数据库。';
    }

    // 拉取在线会话列表
    try {
      const onlineSessions = await fetchOnlineSessions();
      setOnlineSessions(onlineSessions);
    } catch (err) {
      showBanner(`加载在线会话失败: ${err.message}`);
    }

    renderSessionList();
    renderActiveSession();

    // 切换后落在空白草稿态，输入框内容予以保留 (B1.7, B1_1_3)
    if (composerInputEl) {
      composerInputEl.value = getCurrentDraft();
      adjustInputHeight();
      syncSendButtonState();
      composerInputEl.focus();
    }
  } else {
    // 从在线切回离线形态 (B1_1_3 安全中断进行中的生成)
    hideBanner();
    const onlineList = getActiveSessionList();
    for (const s of onlineList) {
      if (s.messages && s.messages.length > 0) {
        const last = s.messages[s.messages.length - 1];
        if (last.status === 'streaming') {
          abortOnlineChat(s.id).catch(() => {});
          clearSessionSubscription(s.id);
          last.status = 'interrupted';
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

    if (chatEmptyTitleEl) {
      chatEmptyTitleEl.textContent = '开始和 Agent 对话';
    }
    if (chatEmptyTextEl) {
      chatEmptyTextEl.textContent = '当前回复由本地 mock 生成，用来验证对话界面与流式输出。';
    }

    renderSessionList();
    renderActiveSession();

    // 保留草稿文字
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
  const viewChat = document.getElementById('view-chat');
  const isChatVisible = viewChat && !viewChat.hidden;
  if (expandSessionsBtnEl) {
    expandSessionsBtnEl.hidden = !isChatVisible || !isSessionsCollapsed;
  }
}

export function isSessionListCollapsed() {
  return isSessionsCollapsed;
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
  const isEmpty = composerInputEl.value.trim().length === 0;
  sendButtonEl.disabled = isEmpty;
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
        title: session.title,
      },
    });

    const titleSpan = el('span', {
      className: 'session-item__title',
      text: session.title,
    });

    const actionsDiv = el('div', { className: 'session-item__actions' });

    // 重命名按钮
    const renameBtn = el(
      'button',
      {
        className: 'session-item__action-btn',
        attrs: {
          type: 'button',
          'data-action': 'rename',
          title: '重命名',
          'aria-label': '重命名会话',
        },
      },
      [createSvgIcon('icon-pencil')],
    );

    // 删除按钮
    const deleteBtn = el(
      'button',
      {
        className: 'session-item__action-btn',
        attrs: {
          type: 'button',
          'data-action': 'delete',
          title: '删除会话',
          'aria-label': '删除会话',
        },
      },
      [createSvgIcon('icon-trash')],
    );

    actionsDiv.appendChild(renameBtn);
    actionsDiv.appendChild(deleteBtn);

    li.appendChild(titleSpan);
    li.appendChild(actionsDiv);

    // 点击切换会话
    li.addEventListener('click', () => {
      if (editingSessionId === session.id) {
        return;
      }
      handleSwitchSession(session.id);
    });

    // 重命名入口
    renameBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      startRenameSession(session.id, li, titleSpan, actionsDiv);
    });

    // 删除入口
    deleteBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      handleDeleteSession(session.id);
    });

    fragment.appendChild(li);
  });

  chatSessionsListEl.replaceChildren(fragment);
}

// 行内编辑重命名
function startRenameSession(sessionId, itemEl, titleSpan, actionsDiv) {
  const session = findSession(sessionId);
  if (!session) {
    return;
  }

  editingSessionId = sessionId;
  itemEl.classList.add('is-editing');

  let isCommitted = false;
  let isInputComposing = false;

  const input = el('input', {
    className: 'session-item__input',
    attrs: {
      type: 'text',
      maxlength: '50',
      value: session.title,
    },
  });

  input.addEventListener('click', (event) => {
    event.stopPropagation();
  });

  input.addEventListener('compositionstart', () => {
    isInputComposing = true;
  });

  input.addEventListener('compositionend', () => {
    isInputComposing = false;
  });

  async function commitRename() {
    if (isCommitted) {
      return;
    }
    isCommitted = true;

    const newTitle = input.value.trim().replace(/\s+/g, ' ');
    if (newTitle && newTitle !== session.title) {
      if (getMode() === 'online') {
        try {
          await renameOnlineSession(sessionId, newTitle);
        } catch (err) {
          showBanner(`重命名会话失败: ${err.message}`);
        }
      }
      renameSession(sessionId, newTitle);
      titleSpan.textContent = newTitle;
      itemEl.title = newTitle;
    }

    exitEditing();
  }

  function cancelRename() {
    if (isCommitted) {
      return;
    }
    isCommitted = true;
    exitEditing();
  }

  function exitEditing() {
    editingSessionId = null;
    itemEl.classList.remove('is-editing');
    input.remove();
  }

  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter') {
      if (isInputComposing || event.isComposing) {
        return;
      }
      event.preventDefault();
      commitRename();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      cancelRename();
    }
  });

  input.addEventListener('blur', () => {
    commitRename();
  });

  itemEl.appendChild(input);
  input.focus();
  input.select();
}

// 删除会话
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

// 新建对话流转
function handleNewChat() {
  const currentActiveId = getActiveSessionId();

  if (currentActiveId === null) {
    // 处于空白草稿态再次点击新建 -> 丢弃旧草稿 (A6.11)
    clearDraftText();
    if (composerInputEl) {
      composerInputEl.value = '';
      resetInputHeight();
      syncSendButtonState();
    }
  } else {
    // 从既有会话点击新建 -> 回到空白草稿态并恢复暂存草稿
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

// 切换会话
async function handleSwitchSession(sessionId) {
  const prevId = getActiveSessionId();
  if (sessionId === prevId) {
    return;
  }

  // 切走上一会话：若存在前端流式订阅，仅断开当前前端专属连接，后台生成不受影响
  if (prevId) {
    clearSessionSubscription(prevId);
  }

  switchSession(sessionId);

  if (chatSessionsListEl) {
    const items = chatSessionsListEl.querySelectorAll('.session-item');
    items.forEach((item) => {
      item.classList.toggle('is-active', item.dataset.sessionId === sessionId);
    });
  }

  // 若处于在线形态，拉取持久化消息
  if (getMode() === 'online') {
    try {
      const messages = await fetchOnlineMessages(sessionId);
      setSessionMessages(sessionId, messages);
    } catch (err) {
      showBanner(`加载会话历史失败: ${err.message}`);
    }
  }

  renderActiveSession();

  // 若切入的会话最新一条消息处于 streaming 状态，自动发起追赶订阅
  if (getMode() === 'online') {
    const active = getActiveSession();
    if (active && active.messages.length > 0) {
      const last = active.messages[active.messages.length - 1];
      if (last.role === 'assistant' && last.status === 'streaming') {
        subscribeOnlineSession(sessionId, last.id);
      }
    }
  }

  if (composerInputEl) {
    composerInputEl.value = getSessionDraft(sessionId);
    adjustInputHeight();
    syncSendButtonState();
    composerInputEl.focus();
  }
}

// 渲染当前活动会话的消息区
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

  if (!isUser && message.status === 'streaming' && !message.content) {
    const waiting = el('div', { className: 'msg__waiting' }, [
      el('span', { className: 'msg__waiting-dot' }),
      el('span', { className: 'msg__waiting-dot' }),
      el('span', { className: 'msg__waiting-dot' }),
    ]);
    bubble.appendChild(waiting);
  }

  if (isError && message.content && message.errorMessage) {
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
    const text = el('p', {
      className: 'msg__text',
      text: displayText,
    });
    bubble.appendChild(text);
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

  article.appendChild(bubble);
  article.appendChild(time);
  return article;
}

async function handleSubmit() {
  if (!composerInputEl) {
    return;
  }
  const text = composerInputEl.value.trim();
  if (!text) {
    return;
  }

  let activeSession = getActiveSession();

  // 若处于空白草稿态，发出首条消息时正式创建新会话
  if (!activeSession) {
    if (getMode() === 'online') {
      const folded = text.replace(/\s+/g, ' ');
      const title = Array.from(folded).slice(0, 10).join('') || '新会话';
      try {
        const created = await createOnlineSession({ title });
        activeSession = addOnlineSessionToStore(created);
        switchSession(activeSession.id);
      } catch (err) {
        showBanner(`创建在线会话失败: ${err.message}`);
        return;
      }
    } else {
      activeSession = createSessionFromDraft(text);
    }
  }

  // 1. 用户消息追加至对应会话内存，并清空当前会话已保存草稿
  const userMessage = addUserMessage(text, activeSession.id);
  setSessionDraft(activeSession.id, '');

  // 2. 清空输入框并重置高度与焦点
  composerInputEl.value = '';
  resetInputHeight();
  syncSendButtonState();
  composerInputEl.focus();

  // 3. 用户消息上屏并隐藏空状态
  if (chatEmptyEl) {
    chatEmptyEl.hidden = true;
  }
  const userNode = createMessageNode(userMessage);
  if (messagesEl) {
    messagesEl.appendChild(userNode);
  }

  shouldAutoScroll = true;
  if (chatScrollEl) {
    scrollToBottom(chatScrollEl);
  }

  // 4. 追加状态为 streaming 的 Agent 占位消息并上屏
  const agentMessage = addAgentPlaceholder(null, activeSession.id);
  const agentNode = createMessageNode(agentMessage);
  if (messagesEl) {
    messagesEl.appendChild(agentNode);
  }
  if (chatScrollEl) {
    scrollToBottom(chatScrollEl);
  }

  renderSessionList();

  // 5. 在线形态直接触发后台解耦任务管理器，离线形态走发送队列
  if (getMode() === 'online') {
    handleOnlineSubmit(activeSession.id, agentMessage, text);
    return;
  }

  const snapshot = getHistorySnapshot(30, activeSession.id);
  enqueueRequest({
    sessionId: activeSession.id,
    messageId: agentMessage.id,
    snapshot,
  });
  syncQueueUI();

  // 6. 触发队列消费者
  processQueue();
}

async function handleOnlineSubmit(sessionId, agentMessage, text) {
  try {
    const res = await sendOnlineMessage(sessionId, text);
    if (res?.message_id && res.message_id !== agentMessage.id) {
      const prevId = agentMessage.id;
      updateMessage(prevId, { id: res.message_id }, sessionId);
      if (getActiveSessionId() === sessionId && messagesEl) {
        const cardNode = messagesEl.querySelector(
          `[data-message-id="${prevId}"], [data-message-id="${res.message_id}"]`,
        );
        if (cardNode) {
          cardNode.dataset.messageId = res.message_id;
        }
      }
      agentMessage.id = res.message_id;
    }
    subscribeOnlineSession(sessionId, agentMessage.id);
  } catch (err) {
    const errMsg = err.message || '发送消息失败';
    updateMessage(agentMessage.id, { status: 'error', errorMessage: errMsg }, sessionId);
    if (getActiveSessionId() === sessionId && messagesEl) {
      const cardNode = messagesEl.querySelector(`[data-message-id="${agentMessage.id}"]`);
      if (cardNode) {
        cardNode.classList.remove('is-streaming');
        cardNode.classList.add('is-error');
        const waitingEl = cardNode.querySelector('.msg__waiting');
        if (waitingEl) waitingEl.remove();
        const textEl = cardNode.querySelector('.msg__text');
        if (textEl) textEl.textContent = errMsg;
      }
    }
  }
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
          const textEl = cardNode.querySelector('.msg__text');
          if (textEl) {
            textEl.textContent = msg ? msg.content : text;
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

          const bubble = cardNode.querySelector('.msg__bubble');
          const textEl = cardNode.querySelector('.msg__text');
          const msg = findMessageInSession(sessionId, messageId);

          if (msg && msg.content) {
            if (textEl) textEl.textContent = msg.content;
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
  if (isStreaming()) {
    syncQueueUI();
    return;
  }

  const req = dequeueRequest();
  syncQueueUI();
  if (!req) {
    return;
  }

  const { sessionId, messageId, snapshot } = req;
  const session = findSession(sessionId);
  if (!session) {
    processQueue();
    return;
  }

  const agentMessage = findMessageInSession(sessionId, messageId);
  if (!agentMessage) {
    processQueue();
    return;
  }

  setStreaming(true);

  const controller = new AbortController();
  setCurrentAbortController(controller);

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
