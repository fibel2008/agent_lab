"""Agent 协议与基础消息模型定义。"""

from collections.abc import AsyncIterator, Sequence
from typing import Literal, Optional, Protocol

from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    """系统内部流转、离线请求与历史持久化的领域实体模型。"""

    id: Optional[str] = None
    role: Literal["user", "assistant"]
    content: str = Field(default="")
    seq: Optional[int] = None
    status: Literal["done", "streaming", "error", "interrupted"] = "done"
    error_code: Optional[str] = None
    error_message: Optional[str] = None
    created_at: Optional[str] = None


class Agent(Protocol):
    """Agent 抽象协议。"""

    name: str
    model: str

    def stream_reply(
        self, messages: Sequence[ChatMessage]
    ) -> AsyncIterator[str]:
        """根据历史消息流式生成回复增量文本。"""
        ...
