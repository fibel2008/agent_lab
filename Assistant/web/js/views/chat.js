// 对话主窗口视图：DOM 渲染、输入控制、发送队列与流式响应驱动

import { streamChat } from '../api.js';
import { el, formatTimestamp, isNearBottom, scrollToBottom } from '../dom.js';
import {
  addAgentPlaceholder,
  addUserMessage,
  dequeueRequest,
  enqueueRequest,
  getHistorySnapshot,
  getQueueLength,
  isStreaming,
  setStreaming,
  updateMessage,
} from '../store.js';

let chatScrollEl = null;
let chatEmptyEl = null;
let messagesEl = null;
let composerFormEl = null;
let composerInputEl = null;
let sendButtonEl = null;
let composerQueueEl = null;

let isComposing = false;
let shouldAutoScroll = true;

export function initChatView() {
  chatScrollEl = document.getElementById('chat-scroll');
  chatEmptyEl = document.getElementById('chat-empty');
  messagesEl = document.getElementById('messages');
  composerFormEl = document.getElementById('composer');
  composerInputEl = document.getElementById('composer-input');
  sendButtonEl = document.getElementById('send-button');
  composerQueueEl = document.getElementById('composer-queue');

  if (!composerInputEl || !composerFormEl) {
    return;
  }

  // 监听滚动，判断是否处于底部跟随区间
  if (chatScrollEl) {
    chatScrollEl.addEventListener('scroll', () => {
      shouldAutoScroll = isNearBottom(chatScrollEl, 80);
    });
  }

  // 输入框自适应高度与按键状态联动
  composerInputEl.addEventListener('input', () => {
    adjustInputHeight();
    syncSendButtonState();
  });

  // 中文输入法组合保护
  composerInputEl.addEventListener('compositionstart', () => {
    isComposing = true;
  });

  composerInputEl.addEventListener('compositionend', () => {
    isComposing = false;
    syncSendButtonState();
  });

  // 键盘快捷键：Enter 发送，Shift + Enter 换行
  composerInputEl.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      if (isComposing || event.isComposing) {
        return;
      }
      event.preventDefault();
      handleSubmit();
    }
  });

  // 表单提交
  composerFormEl.addEventListener('submit', (event) => {
    event.preventDefault();
    handleSubmit();
  });

  // 初始化按钮状态
  syncSendButtonState();
}

function adjustInputHeight() {
  if (!composerInputEl) {
    return;
  }
  composerInputEl.style.height = 'auto';
  const targetHeight = Math.min(composerInputEl.scrollHeight, 200);
  composerInputEl.style.height = `${targetHeight}px`;
}

function resetInputHeight() {
  if (!composerInputEl) {
    return;
  }
  composerInputEl.style.height = 'auto';
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

function createMessageNode(message) {
  const isUser = message.role === 'user';
  const article = el('article', {
    className: `msg msg--${message.role}${message.status === 'streaming' ? ' is-streaming' : ''}`,
    attrs: {
      'data-message-id': message.id,
    },
  });

  const bubble = el('div', { className: 'msg__bubble' });

  if (!isUser && message.status === 'streaming') {
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

  // 1. 用户消息立即上屏
  if (chatEmptyEl) {
    chatEmptyEl.hidden = true;
  }

  const userMessage = addUserMessage(text);
  const userNode = createMessageNode(userMessage);
  if (messagesEl) {
    messagesEl.appendChild(userNode);
  }

  // 2. 清空输入框并重置高度与焦点
  composerInputEl.value = '';
  resetInputHeight();
  syncSendButtonState();
  composerInputEl.focus();

  // 3. 强制滚动触底
  shouldAutoScroll = true;
  if (chatScrollEl) {
    scrollToBottom(chatScrollEl);
  }

  // 4. 截取截至当前用户消息的历史快照并入队
  const snapshot = getHistorySnapshot(30);
  enqueueRequest(snapshot);
  syncQueueUI();

  // 5. 触发队列消费者
  processQueue();
}

async function processQueue() {
  if (isStreaming()) {
    syncQueueUI();
    return;
  }

  const nextSnapshot = dequeueRequest();
  syncQueueUI();
  if (!nextSnapshot) {
    return;
  }

  setStreaming(true);

  // 创建并上屏 Agent 占位节点
  const agentMessage = addAgentPlaceholder();
  const agentNode = createMessageNode(agentMessage);
  if (messagesEl) {
    messagesEl.appendChild(agentNode);
  }

  shouldAutoScroll = true;
  if (chatScrollEl) {
    scrollToBottom(chatScrollEl);
  }

  const textEl = agentNode.querySelector('.msg__text');
  const timeEl = agentNode.querySelector('.msg__time');
  let firstDeltaReceived = false;

  try {
    await streamChat({
      messages: nextSnapshot,
      onMeta({ message_id, created_at, model }) {
        if (message_id) {
          agentNode.dataset.messageId = message_id;
        }
        if (created_at && timeEl) {
          const createdDate = new Date(created_at);
          timeEl.dateTime = created_at;
          timeEl.textContent = formatTimestamp(createdDate);
          updateMessage(agentMessage.id, {
            id: message_id || agentMessage.id,
            createdAt: createdDate,
          });
        }
      },
      onDelta({ text }) {
        if (!firstDeltaReceived) {
          firstDeltaReceived = true;
          const waitingEl = agentNode.querySelector('.msg__waiting');
          if (waitingEl) {
            waitingEl.remove();
          }
        }
        if (text) {
          agentMessage.content += text;
          if (textEl) {
            textEl.textContent = agentMessage.content;
          }
          if (shouldAutoScroll && chatScrollEl) {
            scrollToBottom(chatScrollEl);
          }
        }
      },
      onDone({ finish_reason, duration_ms }) {
        const waitingEl = agentNode.querySelector('.msg__waiting');
        if (waitingEl) {
          waitingEl.remove();
        }
        agentNode.classList.remove('is-streaming');
        updateMessage(agentMessage.id, { status: 'done' });
        if (shouldAutoScroll && chatScrollEl) {
          scrollToBottom(chatScrollEl);
        }
      },
      onError(error) {
        const waitingEl = agentNode.querySelector('.msg__waiting');
        if (waitingEl) {
          waitingEl.remove();
        }
        agentNode.classList.remove('is-streaming');
        agentNode.classList.add('is-error');

        if (agentMessage.content) {
          agentMessage.content += '\n\n[回复生成中断，请重试]';
        } else {
          agentMessage.content = error?.message || '连接失败，请确认后端服务正在运行。';
        }

        if (textEl) {
          textEl.textContent = agentMessage.content;
        }
        updateMessage(agentMessage.id, { status: 'error' });
        if (shouldAutoScroll && chatScrollEl) {
          scrollToBottom(chatScrollEl);
        }
      },
    });
  } finally {
    setStreaming(false);
    // 处理下一条排队中的消息
    processQueue();
  }
}
