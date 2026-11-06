"""聊天 Server-Sent Events (SSE) 流式接口模块。"""

import asyncio
from datetime import datetime
import json
import time
from typing import Any
import uuid

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse

from ..agent.base import Agent
from ..agent.errors import LLMError
from ..agent.factory import get_agent
from ..agent.task_manager import task_manager
from ..config import ERROR_MESSAGES, logger
from ..storage.session_store import session_store
from .schemas import AbortChatRequest, ChatRequest

router = APIRouter()


def _format_sse_event(event_type: str, data: dict[str, Any]) -> str:
    """将数据字典序列化为单行 UTF-8 SSE 事件格式字符串。"""
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    return f"event: {event_type}\ndata: {payload}\n\n"


@router.post("/api/chat")
async def chat_stream(request: ChatRequest) -> StreamingResponse:
    """离线对话 SSE 接口：接收用户消息列表，以 Server-Sent Events 流式返回 Agent 回复。"""
    agent: Agent = get_agent("offline")

    async def event_generator():
        start_time = time.perf_counter()
        message_id = f"m_{uuid.uuid4().hex[:8]}"
        now_iso = datetime.now().astimezone().isoformat(timespec="seconds")
        agent_model = getattr(agent, "model", "mock-0.1")

        # 1. 发送 meta 事件（且仅发送一次）
        yield _format_sse_event(
            "meta",
            {
                "message_id": message_id,
                "created_at": now_iso,
                "model": agent_model,
            },
        )

        reply_chars = 0
        try:
            # 2. 逐块发送 delta 事件
            async for chunk in agent.stream_reply(request.messages):
                reply_chars += len(chunk)
                yield _format_sse_event("delta", {"text": chunk})

            # 3. 发送 done 事件
            duration_ms = int((time.perf_counter() - start_time) * 1000)
            yield _format_sse_event(
                "done",
                {
                    "finish_reason": "stop",
                    "duration_ms": duration_ms,
                },
            )
            logger.info(
                "Chat completed: messages=%d last_user_chars=%d reply_chars=%d duration_ms=%d",
                len(request.messages),
                len(request.messages[-1].content),
                reply_chars,
                duration_ms,
            )
        except asyncio.CancelledError:
            logger.debug("Chat stream cancelled by client: message_id=%s", message_id)
            raise
        except LLMError as exc:
            logger.warning("Chat stream LLMError: message_id=%s code=%s message=%s", message_id, exc.code, exc.message)
            yield _format_sse_event(
                "error",
                {
                    "code": exc.code,
                    "message": exc.message,
                },
            )
        except Exception:
            logger.exception("Chat stream failed: message_id=%s", message_id)
            code = "INTERNAL_ERROR"
            yield _format_sse_event(
                "error",
                {
                    "code": code,
                    "message": ERROR_MESSAGES.get(code, "生成过程发生异常，请重试。"),
                },
            )

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream; charset=utf-8",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/api/chat/stream")
async def chat_stream_online(
    session_id: str = Query(..., min_length=1, description="需要订阅的在线会话 ID"),
) -> StreamingResponse:
    """在线对话解耦 SSE 订阅流：支持切页重连、多端追赶与实时增量推送。"""
    async def event_generator():
        try:
            async for event_type, data in task_manager.subscribe_stream(session_id, session_store):
                yield _format_sse_event(event_type, data)
        except asyncio.CancelledError:
            logger.debug("客户端断开在线订阅连接: session_id=%s", session_id)
            raise
        except Exception:
            logger.exception("在线订阅流异常: session_id=%s", session_id)
            yield _format_sse_event(
                "error",
                {"code": "INTERNAL_ERROR", "message": ERROR_MESSAGES["INTERNAL_ERROR"]},
            )

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream; charset=utf-8",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/api/chat/abort")
async def abort_chat(request: AbortChatRequest) -> dict:
    """主动中断指定在线会话当前的后台生成任务并安全持久化。"""
    aborted = await task_manager.abort_session(request.session_id)
    return {"status": "aborted" if aborted else "not_found"}
