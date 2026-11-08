"""在线 ReAct Agent 实现与多轮上下文构建模块。"""

import base64
from collections.abc import AsyncIterator, Callable, Sequence
import logging
import mimetypes
from pathlib import Path
from typing import Any, Optional

from Assistant import config
from Assistant.agent.base import Agent, AttachmentInfo, ChatMessage
from Assistant.agent.react import ReActLoop
from Assistant.storage.session_store import SessionStore

logger = logging.getLogger("assistant.online_agent")


async def build_context_messages(
    session_id: str,
    store: SessionStore,
    max_messages: int = config.MAX_MESSAGES,
) -> list[ChatMessage]:
    """构建单会话在线模型对话上下文。

    严格执行自增序号升序排布、异常消息过滤、中断标记补偿、
    交叉序列修正、附件提示词注入与滑动窗口截取算法。
    """
    raw_messages = await store.get_messages(session_id)
    filtered: list[ChatMessage] = []

    for item in raw_messages:
        role = item.get("role")
        content = item.get("content", "")
        status = item.get("status", "done")
        attachments_raw = item.get("attachments", [])

        # 1. 跳过无内容且无附件的空白占位消息
        if not content.strip() and not attachments_raw:
            continue

        # 2. 忽略错误状态卡片
        if status == "error":
            continue

        # 3. 中断消息补偿说明
        final_content = content
        if status == "interrupted":
            final_content = f"{content.rstrip()}\n[此条回复此前未完整生成]"

        # 4. 非图片附件提示词上下文注入 (B1.15.1)
        if role == "user" and attachments_raw:
            non_image_attachments = [
                att for att in attachments_raw if not att.get("is_image", False)
            ]
            if non_image_attachments:
                att_lines = [
                    f"[当前消息包含附件: 文件名={att['filename']}, 附件标识={att['id']}, 类型={att['file_type']}]"
                    for att in non_image_attachments
                ]
                att_prefix = "\n".join(att_lines)
                final_content = (
                    f"{att_prefix}\n{final_content}".strip()
                    if final_content
                    else att_prefix
                )

        attachments_info = [
            AttachmentInfo(
                id=att["id"],
                filename=att["filename"],
                file_type=att["file_type"],
                file_size=att["file_size"],
                is_image=att.get("is_image", False),
                storage_path=str(att["storage_path"]) if att.get("storage_path") else None,
            )
            for att in attachments_raw
        ]

        filtered.append(
            ChatMessage(
                id=item.get("id"),
                role=role,
                content=final_content,
                seq=item.get("seq"),
                status=status,
                attachments=attachments_info,
                created_at=item.get("created_at"),
            )
        )

    # 5. 严格保证 user -> assistant -> user 交叉序列
    alternating: list[ChatMessage] = []
    for msg in filtered:
        if alternating and alternating[-1].role == "user" and msg.role == "user":
            # 前一条 user 消息无有效回复，丢弃前一条
            alternating[-1] = msg
        else:
            alternating.append(msg)

    # 6. 滑动窗口截取末尾不超过 max_messages 条
    if len(alternating) > max_messages:
        alternating = alternating[-max_messages:]

    # 7. 首条消息确保为 user 消息
    while alternating and alternating[0].role == "assistant":
        alternating.pop(0)

    return alternating


def build_payload_messages(
    messages: Sequence[ChatMessage],
    system_prompt: Optional[str] = None,
) -> list[dict[str, Any]]:
    """将内部 ChatMessage 消息列表转换为符合 OpenAI API 标准格式的 payload_messages。

    对于包含 is_image=True 的附件的用户消息，读取图片二进制并转为 Base64 编码，
    组合为 OpenAI 多模态 content 格式；若无图片附件，保持纯文本字符串 content。
    """
    payload_messages: list[dict[str, Any]] = []
    if system_prompt:
        payload_messages.append({"role": "system", "content": system_prompt})

    for msg in messages:
        if msg.role != "user":
            payload_messages.append({"role": msg.role, "content": msg.content})
            continue

        image_attachments = [att for att in msg.attachments if att.is_image]
        if not image_attachments:
            payload_messages.append({"role": msg.role, "content": msg.content})
            continue

        # 包含图片附件的多模态消息结构构建
        content_parts: list[dict[str, Any]] = [{"type": "text", "text": msg.content}]
        for att in image_attachments:
            if att.storage_path:
                img_path = Path(att.storage_path)
                if img_path.is_file():
                    mime, _ = mimetypes.guess_type(str(img_path))
                    if not mime:
                        mime = "image/png"
                    b64 = base64.b64encode(img_path.read_bytes()).decode("utf-8")
                    content_parts.append({
                        "type": "image_url",
                        "image_url": {"url": f"data:{mime};base64,{b64}"},
                    })
                else:
                    logger.warning("多模态图片附件物理文件不存在: %s", att.storage_path)
            else:
                logger.warning("多模态图片附件缺少 storage_path: id=%s", att.id)

        payload_messages.append({"role": "user", "content": content_parts})

    return payload_messages


class OnlineAgent:
    """在线真实大模型 ReAct Agent 实现。"""

    def __init__(
        self,
        name: str = "Emibot Online",
        model: Optional[str] = None,
        react_loop: Optional[ReActLoop] = None,
    ) -> None:
        self.name = name
        self.model = model or config.MODEL
        self.react_loop = react_loop or ReActLoop()

    async def stream_reply(
        self,
        messages: Sequence[ChatMessage],
        on_event: Optional[Callable[[str, dict[str, Any]], None]] = None,
        session_id: Optional[str] = None,
    ) -> AsyncIterator[str]:
        """根据历史消息流式生成回复增量文本。"""
        msg_list = list(messages)
        async for chunk in self.react_loop.run(
            msg_list, on_event=on_event, session_id=session_id
        ):
            yield chunk


# 编译期静态校验是否完全实现 Agent 协议
_agent_check: Agent = OnlineAgent()
