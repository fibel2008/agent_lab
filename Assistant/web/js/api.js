// 聊天接口 Server-Sent Events (SSE) 客户端与在线会话 RESTful API 客户端

export async function checkConfigStatus() {
  const response = await fetch('/api/config/status');
  if (!response.ok) {
    throw new Error(`探测配置状态失败: HTTP ${response.status}`);
  }
  return await response.json();
}

export async function fetchOnlineSessions() {
  const response = await fetch('/api/sessions');
  if (!response.ok) {
    throw new Error(`获取在线会话失败: HTTP ${response.status}`);
  }
  return await response.json();
}

export async function createOnlineSession({ id, title }) {
  const response = await fetch('/api/sessions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ id, title }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || `创建在线会话失败: HTTP ${response.status}`);
  }
  return await response.json();
}

export async function renameOnlineSession(sessionId, title) {
  const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ title }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || `重命名会话失败: HTTP ${response.status}`);
  }
  return await response.json();
}

export async function deleteOnlineSession(sessionId) {
  const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
  });
  return response.ok;
}

export async function fetchOnlineMessages(sessionId) {
  const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/messages`);
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.detail || `获取会话消息失败: HTTP ${response.status}`);
  }
  return await response.json();
}

export async function sendOnlineMessage(sessionId, content, files = []) {
  let body;
  let headers = {};

  if (files && files.length > 0) {
    const formData = new FormData();
    formData.append('content', content || '');
    for (const file of files) {
      formData.append('files', file);
    }
    body = formData;
  } else {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify({ content });
  }

  const response = await fetch(`/api/sessions/${encodeURIComponent(sessionId)}/messages`, {
    method: 'POST',
    headers,
    body,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    const error = new Error(err.message || err.detail || `发送消息失败: HTTP ${response.status}`);
    error.status = response.status;
    error.code = err.code || `HTTP_${response.status}`;
    error.payload = err;
    throw error;
  }
  return await response.json();
}

export async function uploadCacheAttachments(files = []) {
  if (!files || files.length === 0) {
    return [];
  }
  const formData = new FormData();
  for (const file of files) {
    formData.append('files', file);
  }
  const response = await fetch('/api/attachments/cache', {
    method: 'POST',
    body: formData,
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    const error = new Error(err.message || err.detail || `上传缓存附件失败: HTTP ${response.status}`);
    error.status = response.status;
    error.code = err.code || `HTTP_${response.status}`;
    error.payload = err;
    throw error;
  }
  const data = await response.json();
  return data.attachments || data;
}

export async function openAttachment(attachmentId) {
  const response = await fetch(`/api/attachments/${encodeURIComponent(attachmentId)}/open`, {
    method: 'POST',
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    const error = new Error(err.message || err.detail || `打开文件失败: HTTP ${response.status}`);
    error.status = response.status;
    error.code = err.code || `HTTP_${response.status}`;
    throw error;
  }
  return await response.json();
}

export async function abortOnlineChat(sessionId) {
  const response = await fetch('/api/chat/abort', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ session_id: sessionId }),
  });
  if (!response.ok) {
    return false;
  }
  const data = await response.json().catch(() => ({}));
  return data.status === 'aborted';
}

export async function subscribeChatStream(sessionId, {
  signal,
  onMeta,
  onStepStatus,
  onDelta,
  onToolStart,
  onToolDone,
  onDone,
  onError,
}) {
  let response;
  try {
    response = await fetch(`/api/chat/stream?session_id=${encodeURIComponent(sessionId)}`, {
      method: 'GET',
      signal,
    });
  } catch (networkError) {
    if (signal?.aborted) {
      return;
    }
    onError?.({
      code: 'NETWORK_ERROR',
      message: networkError.message || '网络连接异常，无法访问模型服务商，请检查网络连接或代理设置。',
    });
    return;
  }

  if (!response.ok) {
    let errorDetail = `HTTP ${response.status}`;
    try {
      const errJson = await response.json();
      if (errJson?.detail) {
        errorDetail = typeof errJson.detail === 'string'
          ? errJson.detail
          : JSON.stringify(errJson.detail);
      }
    } catch {
      // 保留状态码
    }
    onError?.({
      code: `http_${response.status}`,
      message: `请求失败（${errorDetail}）`,
    });
    return;
  }

  await readSSEStream(response, signal, { onMeta, onStepStatus, onDelta, onToolStart, onToolDone, onDone, onError });
}

export async function streamChat({
  messages,
  signal,
  onMeta,
  onStepStatus,
  onDelta,
  onToolStart,
  onToolDone,
  onDone,
  onError,
}) {
  let response;
  try {
    response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ messages }),
      signal,
    });
  } catch (networkError) {
    if (signal?.aborted) {
      return;
    }
    onError?.({
      code: 'network_error',
      message: networkError.message || '网络连接失败，请检查服务状态',
    });
    return;
  }

  if (!response.ok) {
    let errorDetail = `HTTP ${response.status}`;
    try {
      const errJson = await response.json();
      if (errJson?.detail) {
        errorDetail = typeof errJson.detail === 'string'
          ? errJson.detail
          : JSON.stringify(errJson.detail);
      }
    } catch {
      // 保留状态码
    }
    onError?.({
      code: `http_${response.status}`,
      message: `请求失败（${errorDetail}）`,
    });
    return;
  }

  await readSSEStream(response, signal, { onMeta, onStepStatus, onDelta, onToolStart, onToolDone, onDone, onError });
}

async function readSSEStream(response, signal, { onMeta, onStepStatus, onDelta, onToolStart, onToolDone, onDone, onError }) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  try {
    while (true) {
      if (signal?.aborted) {
        try {
          await reader.cancel();
        } catch (_) {}
        return;
      }

      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });

      // 按双换行分割事件块（同时兼容 CRLF 与 LF）
      const events = buffer.split(/\r?\n\r?\n/);
      buffer = events.pop() || '';

      for (const eventChunk of events) {
        const trimmed = eventChunk.trim();
        if (trimmed) {
          parseAndDispatchEvent(trimmed, { onMeta, onStepStatus, onDelta, onToolStart, onToolDone, onDone, onError });
        }
      }
    }

    // 处理流结束时缓冲区可能剩余的最后一个事件块
    const remaining = buffer.trim();
    if (remaining) {
      parseAndDispatchEvent(remaining, { onMeta, onStepStatus, onDelta, onToolStart, onToolDone, onDone, onError });
    }
  } catch (readError) {
    if (signal?.aborted) {
      return;
    }
    onError?.({
      code: 'stream_read_error',
      message: readError.message || '流式数据接收中断',
    });
  }
}

function parseAndDispatchEvent(chunk, { onMeta, onStepStatus, onDelta, onToolStart, onToolDone, onDone, onError }) {
  const lines = chunk.split('\n');
  let eventType = 'message';
  let dataLines = [];

  for (const rawLine of lines) {
    const line = rawLine.replace(/\r$/, '');
    if (line.startsWith('event: ')) {
      eventType = line.slice(7).trim();
    } else if (line.startsWith('data: ')) {
      dataLines.push(line.slice(6));
    }
  }

  if (dataLines.length === 0) {
    return;
  }

  const dataStr = dataLines.join('\n');
  let payload;
  try {
    payload = JSON.parse(dataStr);
  } catch {
    payload = { text: dataStr };
  }

  switch (eventType) {
    case 'meta':
      onMeta?.(payload);
      break;
    case 'step_status':
      onStepStatus?.(payload);
      break;
    case 'delta':
      onDelta?.(payload);
      break;
    case 'tool_start':
      onToolStart?.(payload);
      break;
    case 'tool_done':
      onToolDone?.(payload);
      break;
    case 'done':
      onDone?.(payload);
      break;
    case 'error':
      onError?.(payload);
      break;
    default:
      if (payload.text !== undefined) {
        onDelta?.(payload);
      }
      break;
  }
}
