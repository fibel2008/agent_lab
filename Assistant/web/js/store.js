// 内存消息状态管理与发送队列

import { formatTimestamp } from './dom.js';

let messageCounter = 0;

function generateId() {
  messageCounter += 1;
  const rand = Math.random().toString(36).slice(2, 8);
  return `m_${Date.now().toString(36)}_${rand}_${messageCounter}`;
}

const state = {
  messages: [],
  queue: [],
  isStreaming: false,
};

export function getMessages() {
  return state.messages;
}

export function findMessage(id) {
  return state.messages.find((msg) => msg.id === id) || null;
}

export function addUserMessage(content) {
  const message = {
    id: generateId(),
    role: 'user',
    content,
    createdAt: new Date(),
    status: 'done',
  };
  state.messages.push(message);
  return message;
}

export function addAgentPlaceholder(customId = null) {
  const message = {
    id: customId || generateId(),
    role: 'assistant',
    content: '',
    createdAt: new Date(),
    status: 'streaming',
  };
  state.messages.push(message);
  return message;
}

export function updateMessage(id, patch) {
  const message = findMessage(id);
  if (!message) {
    return null;
  }
  Object.assign(message, patch);
  return message;
}

export function getHistorySnapshot(maxCount = 30) {
  return state.messages
    .filter((msg) => msg.status === 'done' && (msg.role === 'user' || msg.role === 'assistant'))
    .slice(-maxCount)
    .map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));
}

export function enqueueRequest(snapshot) {
  state.queue.push(snapshot);
  return state.queue.length;
}

export function dequeueRequest() {
  return state.queue.shift() || null;
}

export function getQueueLength() {
  return state.queue.length;
}

export function isStreaming() {
  return state.isStreaming;
}

export function setStreaming(streaming) {
  state.isStreaming = Boolean(streaming);
}
