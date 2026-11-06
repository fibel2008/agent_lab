"""聊天 Server-Sent Events (SSE) 流式接口模块。"""

import asyncio
from datetime import datetime
import json
import time
import uuid

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from ..agent.base import Agent
from ..agent.errors import LLMError
from ..agent.factory import get_agent
from ..config import ERROR_MESSAGES, logger
from .schemas import ChatRequest

router = APIRouter()


def _format_sse_event(event_type: str, data: dict) -> str:
    """将数据字典序列化为单行 UTF-8 SSE 事件格式字符串。"""
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    return f"event: {event_type}\ndata: {payload}\n\n"


@router.post("/api/chat")
async def chat_stream(request: ChatRequest) -> StreamingResponse:
    """接收用户消息列表，以 Server-Sent Events 流式返回 Agent 回复。"""
    agent: Agent = get_agent()

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
