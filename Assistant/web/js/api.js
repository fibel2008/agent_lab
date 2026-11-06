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

export async function streamChat({
  messages,
  signal,
  onMeta,
  onDelta,
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
      message: networkError.message || '网络连接失败，请确认后端服务正在运行',
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
      // 无法解析 JSON 则保留 HTTP 状态码
    }
    onError?.({
      code: `http_${response.status}`,
      message: `请求失败（${errorDetail}）`,
    });
    return;
  }

  const reader = response.body?.getReader();
  if (!reader) {
    onError?.({
      code: 'stream_unsupported',
      message: '浏览器不支持响应流式读取',
    });
    return;
  }

  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        buffer += decoder.decode();
        break;
      }
      buffer += decoder.decode(value, { stream: true });

      // SSE 事件以两个换行符分隔
      let boundaryIndex;
      while ((boundaryIndex = buffer.indexOf('\n\n')) !== -1) {
        const eventChunk = buffer.slice(0, boundaryIndex).trim();
        buffer = buffer.slice(boundaryIndex + 2);

        if (!eventChunk) {
          continue;
        }

        parseAndDispatchEvent(eventChunk, { onMeta, onDelta, onDone, onError });
      }
    }

    // 处理流结束时缓冲区可能剩余的最后一个事件块
    const remaining = buffer.trim();
    if (remaining) {
      parseAndDispatchEvent(remaining, { onMeta, onDelta, onDone, onError });
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

function parseAndDispatchEvent(chunk, { onMeta, onDelta, onDone, onError }) {
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
    case 'delta':
      onDelta?.(payload);
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
