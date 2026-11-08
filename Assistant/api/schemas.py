"""API 请求与响应数据结构校验模型。"""

import re
from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

from ..agent.base import AttachmentInfo, ChatMessage
from ..config import MAX_MESSAGE_CHARS, MAX_MESSAGES


class ChatRequest(BaseModel):
    """POST /api/chat 离线请求体校验模型。"""

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
            # 允许有附件时内容为空白，或者无附件时内容非空
            if not stripped and not msg.attachments:
                raise ValueError(f"第 {idx + 1} 条消息 content 不能为空白字符")
            if len(msg.content) > MAX_MESSAGE_CHARS:
                raise ValueError(
                    f"第 {idx + 1} 条消息 content 长度超过上限 {MAX_MESSAGE_CHARS}"
                )
        if messages[-1].role != "user":
            raise ValueError("最后一条消息的 role 必须为 user")
        return messages


class CreateSessionRequest(BaseModel):
    """POST /api/sessions 创建在线会话请求体校验模型。"""

    id: Optional[str] = None
    title: str = Field(..., description="会话标题，经空白折叠后长度在 1 到 50 字符之间")

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str) -> str:
        """折叠空白字符并校验长度在 1 到 50 之间。"""
        folded = re.sub(r"\s+", " ", value).strip()
        if not folded:
            raise ValueError("会话标题不能为空白字符")
        if len(folded) > 50:
            raise ValueError("会话标题不能超过 50 个字符")
        return folded


class RenameSessionRequest(BaseModel):
    """PATCH /api/sessions/{session_id} 重命名在线会话请求体校验模型。"""

    title: str = Field(..., description="新会话标题，经空白折叠后长度在 1 到 50 字符之间")

    @field_validator("title")
    @classmethod
    def validate_title(cls, value: str) -> str:
        """折叠空白字符并校验长度在 1 到 50 之间。"""
        folded = re.sub(r"\s+", " ", value).strip()
        if not folded:
            raise ValueError("会话标题不能为空白字符")
        if len(folded) > 50:
            raise ValueError("会话标题不能超过 50 个字符")
        return folded


class SendMessageRequest(BaseModel):
    """POST /api/sessions/{session_id}/messages 在线发送用户消息请求体校验模型。"""

    content: str = Field(
        ...,
        min_length=1,
        max_length=MAX_MESSAGE_CHARS,
        description="用户消息文本，去除首尾空白后非空且在 1 到 4000 字符之间",
    )

    @field_validator("content")
    @classmethod
    def validate_content(cls, value: str) -> str:
        """校验用户消息去除首尾空白后非空。"""
        stripped = value.strip()
        if not stripped:
            raise ValueError("消息内容不能为空白字符")
        return value


class ConfigStatusResponse(BaseModel):
    """GET /api/config/status 安全探测响应模型。"""

    has_api_key: bool
    provider: str
    model: str
    storage: str
    db_connected: bool


class SessionResponse(BaseModel):
    """会话响应实体模型。"""

    id: str
    title: str
    created_at: str
    updated_at: str


class MessageResponse(BaseModel):
    """消息响应实体模型。"""

    seq: int
    id: str
    role: Literal["user", "assistant"]
    content: str
    status: Literal["done", "streaming", "error", "interrupted"]
    error_code: Optional[str] = None
    error_message: Optional[str] = None
    attachments: list[AttachmentInfo] = Field(default_factory=list)
    created_at: str


class AbortChatRequest(BaseModel):
    """POST /api/chat/abort 请求体校验模型。"""

    session_id: str = Field(..., min_length=1, description="需要中断生成的会话 ID")


class SendOnlineMessageResponse(BaseModel):
    """POST /api/sessions/{session_id}/messages 成功响应模型。"""

    task_id: str
    session_id: str
    user_message_id: str
    assistant_message_id: str
    attachments: list[AttachmentInfo] = Field(default_factory=list)
    status: Literal["running"] = "running"
