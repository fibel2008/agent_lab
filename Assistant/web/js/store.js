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
  state.draftText = '';
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


export function setSessionSubscription(sessionId, controller) {
  if (state.streamingBySession[sessionId]?.abortController) {
    state.streamingBySession[sessionId].abortController.abort();
  }
  state.streamingBySession[sessionId] = { abortController: controller };
}

export function clearSessionSubscription(sessionId) {
  if (state.streamingBySession[sessionId]?.abortController) {
    state.streamingBySession[sessionId].abortController.abort();
  }
  delete state.streamingBySession[sessionId];
}

export function getSessionSubscription(sessionId) {
  return state.streamingBySession[sessionId] || null;
}

// ==========================================
// 个人数据库工作台状态管理 (C1.0)
// ==========================================

let nextDocId = 3;
let nextChunkId = 30;

export function splitTextToParagraphs(text) {
  if (!text || typeof text !== 'string') {
    return [];
  }
  return text
    .split(/\r?\n\s*\r?\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
}

const initialDocs = [
  {
    id: 'd1',
    name: 'Python 入门笔记.pdf',
    time: '昨天导入',
    text: 'Python 是一种解释型、高级编程语言，其设计哲学强调代码的可读性。\n\nPython 支持多种编程范式，包括结构化、面向对象和函数式编程。\n\n在构建 Agent 系统时，Python 拥有最完善的生态与异步框架支持。',
  },
  {
    id: 'd2',
    name: 'agent_notes.docx',
    time: '3 天前导入',
    text: 'Agent 的核心在于感知、思考与行动的闭环。\n\nReAct 架构通过交替生成思考步骤与操作指令，使大模型能够使用外部工具解决复杂问题。',
  },
];

const initialChunks = [
  {
    id: 'c11',
    docId: 'd1',
    paraIndex: 0,
    text: 'Python 是一种解释型、高级编程语言，其设计哲学强调代码的可读性。',
  },
  {
    id: 'c12',
    docId: 'd1',
    paraIndex: 1,
    text: 'Python 支持多种编程范式，包括结构化、面向对象和函数式编程。',
  },
  {
    id: 'c13',
    docId: 'd1',
    paraIndex: 2,
    text: '在构建 Agent 系统时，Python 拥有最完善的生态与异步框架支持。',
  },
  {
    id: 'c21',
    docId: 'd2',
    paraIndex: 0,
    text: 'Agent 的核心在于感知、思考与行动的闭环。',
  },
  {
    id: 'c22',
    docId: 'd2',
    paraIndex: 1,
    text: 'ReAct 架构通过交替生成思考步骤与操作指令，使大模型能够使用外部工具解决复杂问题。',
  },
];

const initialArchivedSessions = [
  {
    id: 's_arch_1',
    title: '关于 Agent 循环机制的探讨',
    msgs: [
      {
        id: 'm1',
        role: 'user',
        text: '请解释一下 ReAct 循环是如何在单轮会话中逐步调用工具并返回结果的？',
        time: '11-06 14:20',
      },
      {
        id: 'm2',
        role: 'assistant',
        text: 'ReAct 将推理（Reasoning）与行动（Acting）结合。模型在收到问题后先输出 Thought 思考要执行什么工具，再生成 Action 与参数，由执行环境返回 Observation 后继续下一轮循环，直至得出最终答案。',
        time: '11-06 14:21',
      },
    ],
  },
  {
    id: 's_arch_2',
    title: 'Python 异步持久化方案咨询',
    msgs: [
      {
        id: 'm3',
        role: 'user',
        text: '为什么在单机桌面 Agent 中推荐 aiosqlite 单长连接配合写锁，而不是每次请求开连接池？',
        time: '11-07 10:15',
      },
      {
        id: 'm4',
        role: 'assistant',
        text: '因为 SQLite 本质是文件级单写多读引擎。aiosqlite 底层每个连接由一个独立工作线程驱动，多连接高并发写容易导致 database is locked 报错；应用级复用单一连接并配合 asyncio.Lock 串行化事务写操作最为稳健且容易维护。',
        time: '11-07 10:16',
      },
    ],
  },
];

const dbState = {
  activeView: 'chunks', // 'docs' | 'chunks' | 'chats'
  selectedIds: {
    docs: 'd1',
    chunks: 'c11',
    chats: 'm1',
  },
  filterDocId: null,
  searchQuery: '',
  foldedSessions: {},
  draftText: null,
  isSidebarCollapsed: false,
  docs: initialDocs,
  chunks: initialChunks,
  archivedSessions: initialArchivedSessions,
};

export function getDbState() {
  return dbState;
}

export function setDbActiveView(view) {
  if (view !== 'docs' && view !== 'chunks' && view !== 'chats') {
    return;
  }
  dbState.activeView = view;
  dbState.draftText = null;
}

export function getDbActiveView() {
  return dbState.activeView;
}

export function getDbSelectedId(view) {
  const v = view || dbState.activeView;
  return dbState.selectedIds[v] || null;
}

export function setDbSelectedId(view, id) {
  if (dbState.selectedIds[view] !== undefined) {
    dbState.selectedIds[view] = id;
    dbState.draftText = null;
  }
}

export function getDbFilterDocId() {
  return dbState.filterDocId;
}

export function setDbFilterDocId(docId) {
  dbState.filterDocId = docId;
}

export function toggleDbSessionFold(sessionId) {
  dbState.foldedSessions[sessionId] = !dbState.foldedSessions[sessionId];
  return dbState.foldedSessions[sessionId];
}

export function isDbSessionFolded(sessionId) {
  return Boolean(dbState.foldedSessions[sessionId]);
}

export function isDbSidebarCollapsed() {
  return dbState.isSidebarCollapsed;
}

export function setDbSidebarCollapsed(collapsed) {
  dbState.isSidebarCollapsed = Boolean(collapsed);
}

export function getDbDraftText() {
  return dbState.draftText;
}

export function setDbDraftText(text) {
  dbState.draftText = text;
}

export function findDoc(docId) {
  if (!docId) return null;
  return dbState.docs.find((d) => d.id === docId) || null;
}

export function findChunk(chunkId) {
  if (!chunkId) return null;
  return dbState.chunks.find((c) => c.id === chunkId) || null;
}

export function getDocChunks(docId) {
  if (!docId) return [];
  return dbState.chunks.filter((c) => c.docId === docId);
}

export function findMessageWithSession(msgId) {
  if (!msgId) return null;
  for (const session of dbState.archivedSessions) {
    const msg = session.msgs.find((m) => m.id === msgId);
    if (msg) {
      return { msg, session };
    }
  }
  return null;
}

export function getCurrentDbItem() {
  const view = dbState.activeView;
  const selectedId = dbState.selectedIds[view];
  if (!selectedId) return null;

  if (view === 'docs') {
    return findDoc(selectedId);
  }
  if (view === 'chunks') {
    return findChunk(selectedId);
  }
  if (view === 'chats') {
    const found = findMessageWithSession(selectedId);
    return found ? found.msg : null;
  }
  return null;
}

export function isDbDirty() {
  if (dbState.draftText === null) {
    return false;
  }
  const currentItem = getCurrentDbItem();
  if (!currentItem) {
    return false;
  }
  return dbState.draftText !== currentItem.text;
}

export function importDbDoc(name, text, timeStr = '刚刚导入') {
  const id = `d${nextDocId++}`;
  const doc = {
    id,
    name,
    time: timeStr,
    text: text || '',
  };

  dbState.docs.unshift(doc);

  // 切分段落写入 chunks
  const paragraphs = splitTextToParagraphs(doc.text);
  paragraphs.forEach((p, idx) => {
    dbState.chunks.push({
      id: `c${nextChunkId++}`,
      docId: doc.id,
      paraIndex: idx,
      text: p,
    });
  });

  dbState.activeView = 'docs';
  dbState.selectedIds.docs = doc.id;
  dbState.draftText = null;

  return { doc, chunkCount: paragraphs.length };
}

export function saveCurrentDbItem(customText) {
  const textToSave = customText !== undefined ? customText : dbState.draftText;
  if (textToSave === null || textToSave === undefined) {
    return false;
  }

  const view = dbState.activeView;
  const selectedId = dbState.selectedIds[view];

  if (view === 'docs') {
    const doc = findDoc(selectedId);
    if (!doc) return false;
    doc.text = textToSave;

    // 正向重切分并同步 chunks
    const newParas = splitTextToParagraphs(doc.text);
    const existingChunks = getDocChunks(doc.id);

    // 移除原有该资料的切片
    dbState.chunks = dbState.chunks.filter((c) => c.docId !== doc.id);

    // 重新生成切片，优先复用已有 id
    newParas.forEach((p, idx) => {
      const reusedId = existingChunks[idx]?.id || `c${nextChunkId++}`;
      dbState.chunks.push({
        id: reusedId,
        docId: doc.id,
        paraIndex: idx,
        text: p,
      });
    });

    dbState.draftText = null;
    return true;
  }

  if (view === 'chunks') {
    const chunk = findChunk(selectedId);
    if (!chunk) return false;
    const cleanText = textToSave.trim();
    chunk.text = cleanText;

    // 反向联动回写原资料
    const doc = findDoc(chunk.docId);
    if (doc) {
      const paras = splitTextToParagraphs(doc.text);
      if (chunk.paraIndex >= 0 && chunk.paraIndex < paras.length) {
        paras[chunk.paraIndex] = cleanText;
      } else {
        paras.push(cleanText);
      }
      doc.text = paras.join('\n\n');

      // 若修改后的切片包含多个段落，重新排布切片索引
      const reParas = splitTextToParagraphs(doc.text);
      const docChunks = getDocChunks(doc.id);
      dbState.chunks = dbState.chunks.filter((c) => c.docId !== doc.id);
      reParas.forEach((p, idx) => {
        const cId = docChunks[idx]?.id || (idx === chunk.paraIndex ? chunk.id : `c${nextChunkId++}`);
        dbState.chunks.push({
          id: cId,
          docId: doc.id,
          paraIndex: idx,
          text: p,
        });
      });
    }

    dbState.draftText = null;
    return true;
  }

  if (view === 'chats') {
    const found = findMessageWithSession(selectedId);
    if (!found) return false;
    found.msg.text = textToSave;
    dbState.draftText = null;
    return true;
  }

  return false;
}

export function deleteDbDoc(docId) {
  const docIndex = dbState.docs.findIndex((d) => d.id === docId);
  if (docIndex === -1) return false;

  dbState.docs.splice(docIndex, 1);
  // 级联删除切片
  dbState.chunks = dbState.chunks.filter((c) => c.docId !== docId);

  if (dbState.filterDocId === docId) {
    dbState.filterDocId = null;
  }

  // 调整选中项
  if (dbState.selectedIds.docs === docId) {
    if (dbState.docs.length > 0) {
      const nextIdx = Math.min(docIndex, dbState.docs.length - 1);
      dbState.selectedIds.docs = dbState.docs[nextIdx].id;
    } else {
      dbState.selectedIds.docs = null;
    }
  }

  dbState.draftText = null;
  return true;
}

export function deleteDbChunk(chunkId) {
  const chunkIndex = dbState.chunks.findIndex((c) => c.id === chunkId);
  if (chunkIndex === -1) return false;

  dbState.chunks.splice(chunkIndex, 1);

  if (dbState.selectedIds.chunks === chunkId) {
    const remaining = dbState.filterDocId
      ? dbState.chunks.filter((c) => c.docId === dbState.filterDocId)
      : dbState.chunks;
    if (remaining.length > 0) {
      const nextIdx = Math.min(chunkIndex, remaining.length - 1);
      dbState.selectedIds.chunks = remaining[nextIdx].id;
    } else {
      dbState.selectedIds.chunks = null;
    }
  }

  dbState.draftText = null;
  return true;
}

export function deleteDbChatMessage(msgId) {
  const found = findMessageWithSession(msgId);
  if (!found) return false;

  const { msg, session } = found;
  const msgIdx = session.msgs.findIndex((m) => m.id === msgId);
  if (msgIdx !== -1) {
    session.msgs.splice(msgIdx, 1);
  }

  // 空会话自动清理
  dbState.archivedSessions = dbState.archivedSessions.filter((s) => s.msgs.length > 0);

  // 调整选中项
  if (dbState.selectedIds.chats === msgId) {
    const allMsgs = [];
    dbState.archivedSessions.forEach((s) => allMsgs.push(...s.msgs));
    if (allMsgs.length > 0) {
      const nextIdx = Math.min(msgIdx, allMsgs.length - 1);
      dbState.selectedIds.chats = allMsgs[nextIdx].id;
    } else {
      dbState.selectedIds.chats = null;
    }
  }

  dbState.draftText = null;
  return true;
}

export function searchDb(rawQuery) {
  const query = (rawQuery || '').trim().toLowerCase();
  if (!query) {
    return { docs: [], chunks: [], chats: [] };
  }

  const matchedDocs = dbState.docs.filter((d) =>
    d.name.toLowerCase().includes(query) || d.text.toLowerCase().includes(query)
  );

  const matchedChunks = dbState.chunks.filter((c) =>
    c.text.toLowerCase().includes(query)
  );

  const matchedChats = [];
  dbState.archivedSessions.forEach((session) => {
    session.msgs.forEach((msg) => {
      if (msg.text.toLowerCase().includes(query)) {
        matchedChats.push({
          msg,
          session,
        });
      }
    });
  });

  return {
    docs: matchedDocs,
    chunks: matchedChunks,
    chats: matchedChats,
  };
}
