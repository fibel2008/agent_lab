"""API 请求与响应数据结构校验模型。"""

from pydantic import BaseModel, Field, field_validator

from ..agent.base import ChatMessage
from ..config import MAX_MESSAGE_CHARS, MAX_MESSAGES


class ChatRequest(BaseModel):
    """POST /api/chat 请求体校验模型。"""

    messages: list[ChatMessage] = Field(
        ...,
        min_length=1,
        max_length=MAX_MESSAGES,
        description="对话历史消息列表，长度在 1 到 30 之间",
    )

    @field_validator("messages")
    @classmethod
    def validate_messages(cls, messages: list[ChatMessage]) -> list[ChatMessage]:
        """校验消息非空、单条字符数限制以及最后一条为用户消息。"""
        if not messages:
            raise ValueError("messages 列表不能为空")
        for idx, msg in enumerate(messages):
            stripped = msg.content.strip()
            if not stripped:
                raise ValueError(f"第 {idx + 1} 条消息 content 不能为空白字符")
            if len(msg.content) > MAX_MESSAGE_CHARS:
                raise ValueError(
                    f"第 {idx + 1} 条消息 content 长度超过上限 {MAX_MESSAGE_CHARS}"
                )
        if messages[-1].role != "user":
            raise ValueError("最后一条消息的 role 必须为 user")
        return messages
