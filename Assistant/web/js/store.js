// 多会话内存状态管理、草稿管理、消息列表与发送队列

let sessionCounter = 0;
let messageCounter = 0;

function generateSessionId() {
  sessionCounter += 1;
  const rand = Math.random().toString(36).slice(2, 8);
  return `s_${Date.now().toString(36)}_${rand}_${sessionCounter}`;
}

function generateMessageId() {
  messageCounter += 1;
  const rand = Math.random().toString(36).slice(2, 8);
  return `m_${Date.now().toString(36)}_${rand}_${messageCounter}`;
}

const state = {
  activeSessionId: null, // 当前活动会话 ID；为 null 时表示处于未创建的空白草稿态
  draftText: '', // 空白草稿态中已输入未发送的文字
  sessions: [], // 全部已创建会话列表（按时间降序）：{ id, title, createdAt, updatedAt, messages, draft }
  queue: [], // 全局发送队列：[{ sessionId, messageId, snapshot }]
  isStreaming: false, // 全局流式互斥锁：是否正在流式生成回复
  currentAbortController: null, // 当前流式请求的 AbortController 实例
};

export function getSessionLatestTime(session) {
  if (session && session.messages && session.messages.length > 0) {
    const lastMsg = session.messages[session.messages.length - 1];
    const time = lastMsg.createdAt instanceof Date ? lastMsg.createdAt.getTime() : new Date(lastMsg.createdAt).getTime();
    if (!Number.isNaN(time)) {
      return time;
    }
  }
  const fallback = session?.updatedAt || session?.createdAt;
  if (fallback) {
    const time = fallback instanceof Date ? fallback.getTime() : new Date(fallback).getTime();
    if (!Number.isNaN(time)) {
      return time;
    }
  }
  return 0;
}

export function sortSessions() {
  state.sessions.sort((a, b) => getSessionLatestTime(b) - getSessionLatestTime(a));
}

export function getSessions() {
  sortSessions();
  return state.sessions;
}

export function getActiveSessionId() {
  return state.activeSessionId;
}

export function findSession(sessionId) {
  if (!sessionId) {
    return null;
  }
  return state.sessions.find((s) => s.id === sessionId) || null;
}

export function getActiveSession() {
  return findSession(state.activeSessionId);
}

export function switchSession(sessionId) {
  state.activeSessionId = sessionId;
  return findSession(sessionId);
}

export function enterDraft() {
  state.activeSessionId = null;
}

export function getDraftText() {
  return state.draftText;
}

export function setDraftText(text) {
  state.draftText = text || '';
}

export function clearDraftText() {
  state.draftText = '';
}

export function createSessionFromDraft(firstUserContent) {
  // 1. 空白折叠：将换行符、回车符、连续空格收敛为单空格
  const folded = (firstUserContent || '').trim().replace(/\s+/g, ' ');
  // 2. Unicode 码点感知切片，防止 emoji 等代理对截断
  const title = Array.from(folded).slice(0, 10).join('') || '新会话';

  const session = {
    id: generateSessionId(),
    title,
    createdAt: new Date(),
    updatedAt: new Date(),
    messages: [],
    draft: '',
  };

  state.sessions.unshift(session);
  sortSessions();
  state.activeSessionId = session.id;
  state.draftText = '';
  return session;
}

export function renameSession(sessionId, newTitle) {
  const session = findSession(sessionId);
  if (!session) {
    return null;
  }
  session.title = newTitle;
  session.updatedAt = new Date();
  return session;
}

export function deleteSession(sessionId) {
  const index = state.sessions.findIndex((s) => s.id === sessionId);
  if (index === -1) {
    return null;
  }
  const [deleted] = state.sessions.splice(index, 1);
  if (state.activeSessionId === sessionId) {
    state.activeSessionId = null;
  }
  return deleted;
}

export function getActiveMessages() {
  const active = getActiveSession();
  return active ? active.messages : [];
}

export function findMessageInSession(sessionId, messageId) {
  const session = findSession(sessionId);
  if (!session) {
    return null;
  }
  return session.messages.find((m) => m.id === messageId) || null;
}

export function findMessage(messageId) {
  for (const session of state.sessions) {
    const msg = session.messages.find((m) => m.id === messageId);
    if (msg) {
      return { message: msg, session };
    }
  }
  return null;
}

export function addUserMessage(content, targetSessionId = null) {
  const sessionId = targetSessionId || state.activeSessionId;
  const session = findSession(sessionId);
  if (!session) {
    throw new Error('无法在未创建的会话中追加用户消息');
  }

  const message = {
    id: generateMessageId(),
    role: 'user',
    content,
    createdAt: new Date(),
    status: 'done',
  };

  session.messages.push(message);
  session.updatedAt = new Date();
  sortSessions();
  return message;
}

export function addAgentPlaceholder(customId = null, targetSessionId = null) {
  const sessionId = targetSessionId || state.activeSessionId;
  const session = findSession(sessionId);
  if (!session) {
    throw new Error('无法在未创建的会话中追加 Agent 占位');
  }

  const message = {
    id: customId || generateMessageId(),
    role: 'assistant',
    content: '',
    createdAt: new Date(),
    status: 'streaming',
  };

  session.messages.push(message);
  session.updatedAt = new Date();
  sortSessions();
  return message;
}

export function updateMessage(id, patch, targetSessionId = null) {
  let target = null;
  if (targetSessionId) {
    target = findMessageInSession(targetSessionId, id);
  } else {
    const found = findMessage(id);
    if (found) {
      target = found.message;
    }
  }

  if (!target) {
    return null;
  }
  Object.assign(target, patch);
  if (patch.createdAt) {
    sortSessions();
  }
  return target;
}

export function getHistorySnapshot(maxCount = 30, targetSessionId = null) {
  const sessionId = targetSessionId || state.activeSessionId;
  const session = findSession(sessionId);
  if (!session) {
    return [];
  }

  return session.messages
    .filter((msg) => msg.status === 'done' && (msg.role === 'user' || msg.role === 'assistant'))
    .slice(-maxCount)
    .map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));
}

export function enqueueRequest(req) {
  state.queue.push(req);
  return state.queue.length;
}

export function dequeueRequest() {
  return state.queue.shift() || null;
}

export function getQueueLength() {
  return state.queue.length;
}

export function clearQueueForSession(sessionId) {
  state.queue = state.queue.filter((item) => item.sessionId !== sessionId);
  return state.queue.length;
}

export function isStreaming() {
  return state.isStreaming;
}

export function setStreaming(streaming) {
  state.isStreaming = Boolean(streaming);
}

export function getCurrentAbortController() {
  return state.currentAbortController;
}

export function setCurrentAbortController(controller) {
  state.currentAbortController = controller;
}

export function abortStreaming() {
  if (state.currentAbortController) {
    state.currentAbortController.abort();
    state.currentAbortController = null;
  }
  state.isStreaming = false;
}
