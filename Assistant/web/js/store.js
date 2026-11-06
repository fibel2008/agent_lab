// 双形态（离线/在线）会话状态管理、草稿维护、消息列表与发送队列

let sessionCounter = 0;
let messageCounter = 0;

function generateOfflineSessionId() {
  sessionCounter += 1;
  const rand = Math.random().toString(36).slice(2, 8);
  return `s_off_${Date.now().toString(36)}_${rand}_${sessionCounter}`;
}

function generateOfflineMessageId() {
  messageCounter += 1;
  const rand = Math.random().toString(36).slice(2, 8);
  return `m_off_${Date.now().toString(36)}_${rand}_${messageCounter}`;
}

const state = {
  mode: 'offline', // 当前工作台形态：'offline' | 'online'
  activeSessionId: null, // 当前活动会话 ID；为 null 时表示处于未创建的空白草稿态
  draftText: '', // 空白草稿态中已输入未发送的文字
  offlineSessions: [], // 离线会话列表（纯内存，ID 前缀 s_off_）
  onlineSessions: [], // 在线会话列表（同步自 SQLite，ID 前缀 s_on_）
  sessionDrafts: {}, // 各会话未发送草稿字典：{ [sessionId]: text }
  streamingBySession: {}, // 会话级流状态映射：{ [sessionId]: { abortController, taskId } }
  queue: [], // 离线形态发送队列：[{ sessionId, messageId, snapshot }]
  isStreaming: false, // 离线全局流式互斥锁
  currentAbortController: null, // 当前离线流式请求的 AbortController
};

export function getMode() {
  return state.mode;
}

export function setMode(newMode) {
  if (newMode !== 'offline' && newMode !== 'online') {
    throw new Error(`不支持的工作台形态: ${newMode}`);
  }
  state.mode = newMode;
  // 切换形态时统一落入空白草稿态，且保留输入框当前草稿
  state.activeSessionId = null;
  return state.mode;
}

export function getActiveSessionList() {
  return state.mode === 'online' ? state.onlineSessions : state.offlineSessions;
}

export function setOnlineSessions(sessions) {
  state.onlineSessions = sessions.map((s) => ({
    id: s.id,
    title: s.title,
    createdAt: s.created_at ? new Date(s.created_at) : new Date(),
    updatedAt: s.updated_at ? new Date(s.updated_at) : new Date(),
    messages: s.messages || [],
  }));
  sortSessions();
}

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
  const list = getActiveSessionList();
  list.sort((a, b) => getSessionLatestTime(b) - getSessionLatestTime(a));
}

export function getSessions() {
  sortSessions();
  return getActiveSessionList();
}

export function getActiveSessionId() {
  return state.activeSessionId;
}

export function findSession(sessionId) {
  if (!sessionId) {
    return null;
  }
  const activeList = getActiveSessionList();
  const found = activeList.find((s) => s.id === sessionId);
  if (found) {
    return found;
  }
  // 兜底查另一个列表
  const otherList = state.mode === 'online' ? state.offlineSessions : state.onlineSessions;
  return otherList.find((s) => s.id === sessionId) || null;
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

export function getSessionDraft(sessionId) {
  return state.sessionDrafts[sessionId] || '';
}

export function setSessionDraft(sessionId, text) {
  if (!sessionId) {
    state.draftText = text || '';
  } else {
    state.sessionDrafts[sessionId] = text || '';
  }
}

export function getCurrentDraft() {
  if (state.activeSessionId === null) {
    return state.draftText;
  }
  return state.sessionDrafts[state.activeSessionId] || '';
}

export function setCurrentDraft(text) {
  if (state.activeSessionId === null) {
    state.draftText = text || '';
  } else {
    state.sessionDrafts[state.activeSessionId] = text || '';
  }
}

export function createSessionFromDraft(firstUserContent, customSessionId = null) {
  // 1. 空白折叠：将换行符、回车符、连续空格收敛为单空格
  const folded = (firstUserContent || '').trim().replace(/\s+/g, ' ');
  // 2. Unicode 码点感知切片，防止 emoji 等代理对截断
  const title = Array.from(folded).slice(0, 10).join('') || '新会话';

  const isOnline = state.mode === 'online';
  const sessionId = customSessionId || (isOnline ? `s_on_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}` : generateOfflineSessionId());

  const session = {
    id: sessionId,
    title,
    createdAt: new Date(),
    updatedAt: new Date(),
    messages: [],
  };

  const list = getActiveSessionList();
  list.unshift(session);
  sortSessions();
  state.activeSessionId = session.id;
  state.draftText = '';
  return session;
}

export function addOnlineSessionToStore(sessionData) {
  const session = {
    id: sessionData.id,
    title: sessionData.title,
    createdAt: sessionData.created_at ? new Date(sessionData.created_at) : new Date(),
    updatedAt: sessionData.updated_at ? new Date(sessionData.updated_at) : new Date(),
    messages: sessionData.messages || [],
  };
  state.onlineSessions.unshift(session);
  sortSessions();
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
  const list = getActiveSessionList();
  const index = list.findIndex((s) => s.id === sessionId);
  if (index === -1) {
    return null;
  }
  const [deleted] = list.splice(index, 1);
  delete state.sessionDrafts[sessionId];
  if (state.activeSessionId === sessionId) {
    state.activeSessionId = null;
  }
  return deleted;
}

export function setSessionMessages(sessionId, messages) {
  const session = findSession(sessionId);
  if (!session) {
    return null;
  }
  session.messages = messages.map((m) => ({
    seq: m.seq,
    id: m.id,
    role: m.role,
    content: m.content || '',
    status: m.status || 'done',
    errorCode: m.error_code || null,
    errorMessage: m.error_message || null,
    createdAt: m.created_at ? new Date(m.created_at) : new Date(),
  }));
  session.updatedAt = new Date();
  sortSessions();
  return session.messages;
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
  const allSessions = [...state.offlineSessions, ...state.onlineSessions];
  for (const session of allSessions) {
    const msg = session.messages.find((m) => m.id === messageId);
    if (msg) {
      return { message: msg, session };
    }
  }
  return null;
}

export function addUserMessage(content, targetSessionId = null, customId = null) {
  const sessionId = targetSessionId || state.activeSessionId;
  const session = findSession(sessionId);
  if (!session) {
    throw new Error('无法在未创建的会话中追加用户消息');
  }

  const message = {
    id: customId || (state.mode === 'online' ? `m_u_${Math.random().toString(36).slice(2, 8)}` : generateOfflineMessageId()),
    role: 'user',
    content,
    createdAt: new Date(),
    status: 'done',
    errorCode: null,
    errorMessage: null,
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
    id: customId || (state.mode === 'online' ? `m_a_${Math.random().toString(36).slice(2, 8)}` : generateOfflineMessageId()),
    role: 'assistant',
    content: '',
    createdAt: new Date(),
    status: 'streaming',
    errorCode: null,
    errorMessage: null,
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
