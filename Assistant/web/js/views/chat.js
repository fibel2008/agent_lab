// 对话主窗口与会话列表视图：多会话管理、草稿保留与丢弃、DOM 渲染与流式响应驱动

import { streamChat } from '../api.js';
import { createSvgIcon, el, formatTimestamp, isNearBottom, scrollToBottom } from '../dom.js';
import {
  abortStreaming,
  addAgentPlaceholder,
  addUserMessage,
  clearDraftText,
  clearQueueForSession,
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
  getDraftText,
  getHistorySnapshot,
  getQueueLength,
  getSessions,
  isStreaming,
  renameSession,
  setCurrentAbortController,
  setDraftText,
  setStreaming,
  switchSession,
  updateMessage,
} from '../store.js';

let chatScrollEl = null;
let chatEmptyEl = null;
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

let isComposing = false;
let shouldAutoScroll = true;
let editingSessionId = null;
let isSessionsCollapsed = false;
let userCollapsePreference = null;

export function initChatView() {
  chatScrollEl = document.getElementById('chat-scroll');
  chatEmptyEl = document.getElementById('chat-empty');
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
    if (getActiveSessionId() === null) {
      setDraftText(composerInputEl.value);
    } else {
      const active = getActiveSession();
      if (active) {
        active.draft = composerInputEl.value;
      }
    }
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

  // 7. 会话侧栏收起与展开
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

  // 默认不收缩，当窗口页面不足（< 1024px）时收缩
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

  // 若当前正在行内重命名，禁止全量重绘列表破坏编辑中的 input 节点
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

  // 阻止 input 点击冒泡触发会话切换
  input.addEventListener('click', (event) => {
    event.stopPropagation();
  });

  input.addEventListener('compositionstart', () => {
    isInputComposing = true;
  });

  input.addEventListener('compositionend', () => {
    isInputComposing = false;
  });

  function commitRename() {
    if (isCommitted) {
      return;
    }
    isCommitted = true;

    const newTitle = input.value.trim().replace(/\s+/g, ' ');
    if (newTitle && newTitle !== session.title) {
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
function handleDeleteSession(sessionId) {
  // 1. 流式中止与死锁保护
  if (isStreaming()) {
    abortStreaming();
    syncSendButtonState();
  }

  // 2. 清理属于该会话的所有排队项
  clearQueueForSession(sessionId);
  syncQueueUI();

  // 3. 记录删除前活动会话状态
  const wasActive = getActiveSessionId() === sessionId;

  // 4. 从 store 移除会话
  deleteSession(sessionId);

  // 5. 重新渲染会话列表
  renderSessionList();

  // 6. 若删除的是当前活动会话，页面落回空白草稿会话
  if (wasActive) {
    enterDraft();
    if (composerInputEl) {
      composerInputEl.value = '';
      resetInputHeight();
      syncSendButtonState();
    }
    renderActiveSession();
  }

  // 7. 若队列中还有属于其他会话的请求，继续调度
  processQueue();
}

// 新建对话流转
function handleNewChat() {
  const currentActiveId = getActiveSessionId();

  if (currentActiveId === null) {
    // 分支一：当前本处于空白草稿态，再次点击"新建对话" -> 彻底丢弃旧草稿文字
    clearDraftText();
    if (composerInputEl) {
      composerInputEl.value = '';
      resetInputHeight();
      syncSendButtonState();
    }
  } else {
    // 分支二：从既有会话点击"新建对话" -> 进入草稿态，并恢复此前暂存的草稿文字（若有）
    enterDraft();
    if (composerInputEl) {
      composerInputEl.value = getDraftText();
      adjustInputHeight();
      syncSendButtonState();
    }
  }

  // 取消列表所有激活高亮
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
function handleSwitchSession(sessionId) {
  if (sessionId === getActiveSessionId()) {
    return;
  }

  switchSession(sessionId);

  // 刷新会话列表激活态
  if (chatSessionsListEl) {
    const items = chatSessionsListEl.querySelectorAll('.session-item');
    items.forEach((item) => {
      item.classList.toggle('is-active', item.dataset.sessionId === sessionId);
    });
  }

  // 重绘目标会话消息列表
  renderActiveSession();

  // 恢复目标会话的未发送草稿文字
  const targetSession = getActiveSession();
  if (composerInputEl) {
    composerInputEl.value = targetSession?.draft || '';
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
  const article = el('article', {
    className: `msg ${roleClass}${message.status === 'streaming' ? ' is-streaming' : ''}${message.status === 'error' ? ' is-error' : ''}`,
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

  const text = el('p', {
    className: 'msg__text',
    text: message.content || '',
  });
  bubble.appendChild(text);

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

function handleSubmit() {
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
    activeSession = createSessionFromDraft(text);
  }

  // 1. 用户消息追加至对应会话内存，并清空当前会话已保存草稿
  const userMessage = addUserMessage(text, activeSession.id);
  activeSession.draft = '';

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

  // 4. 对应会话内存追加状态为 streaming 的 Agent 占位消息并上屏
  const agentMessage = addAgentPlaceholder(null, activeSession.id);
  const agentNode = createMessageNode(agentMessage);
  if (messagesEl) {
    messagesEl.appendChild(agentNode);
  }
  if (chatScrollEl) {
    scrollToBottom(chatScrollEl);
  }

  // 会话产生最新消息，按最新消息时间重新排布会话列表
  renderSessionList();

  // 5. 截取历史快照并入队
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
    // 若会话在排队期间已被删除，跳过该项继续调度下一项
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

  let firstDeltaReceived = false;

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

        // 1. 无条件更新对应会话内存
        agentMessage.content += text;

        // 2. 若用户当前停留在该会话，动态定位 DOM 节点并更新
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

        if (agentMessage.content) {
          agentMessage.content += '\n\n[回复生成中断，请重试]';
        } else {
          agentMessage.content = error?.message || '连接失败，请确认后端服务正在运行。';
        }

        updateMessage(agentMessage.id, { status: 'error' }, sessionId);

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
    });
  } finally {
    setStreaming(false);
    setCurrentAbortController(null);
    syncSendButtonState();
    // 递归调度队列中下一项
    processQueue();
  }
}
