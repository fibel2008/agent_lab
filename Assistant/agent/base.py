"""Agent 协议与基础消息模型定义。"""

from collections.abc import AsyncIterator, Sequence
from typing import Literal, Protocol

from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    """聊天消息数据模型。"""

    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class Agent(Protocol):
    """Agent 抽象协议。"""

    name: str
    model: str

    def stream_reply(
        self, messages: Sequence[ChatMessage]
    ) -> AsyncIterator[str]:
        """根据历史消息流式生成回复增量文本。"""
        ...
