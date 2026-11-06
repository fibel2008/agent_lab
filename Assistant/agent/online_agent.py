"""在线 ReAct Agent 实现与多轮上下文构建模块。"""

import logging
from collections.abc import AsyncIterator, Sequence
from typing import Optional

from Assistant import config
from Assistant.agent.base import Agent, ChatMessage
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
    交叉序列修正与滑动窗口截取算法。
    """
    raw_messages = await store.get_messages(session_id)
    filtered: list[ChatMessage] = []

    for item in raw_messages:
        role = item.get("role")
        content = item.get("content", "")
        status = item.get("status", "done")

        # 1. 跳过空白占位消息
        if not content.strip():
            continue

        # 2. 忽略错误状态卡片
        if status == "error":
            continue

        # 3. 中断消息补偿说明
        final_content = content
        if status == "interrupted":
            final_content = f"{content.rstrip()}\n[此条回复此前未完整生成]"

        filtered.append(
            ChatMessage(
                id=item.get("id"),
                role=role,
                content=final_content,
                seq=item.get("seq"),
                status=status,
                created_at=item.get("created_at"),
            )
        )

    # 4. 严格保证 user -> assistant -> user 交叉序列
    alternating: list[ChatMessage] = []
    for msg in filtered:
        if alternating and alternating[-1].role == "user" and msg.role == "user":
            # 前一条 user 消息无有效回复，丢弃前一条
            alternating[-1] = msg
        else:
            alternating.append(msg)

    # 5. 滑动窗口截取末尾不超过 max_messages 条
    if len(alternating) > max_messages:
        alternating = alternating[-max_messages:]

    # 6. 首条消息确保为 user 消息
    while alternating and alternating[0].role == "assistant":
        alternating.pop(0)

    return alternating


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
        self, messages: Sequence[ChatMessage]
    ) -> AsyncIterator[str]:
        """根据历史消息流式生成回复增量文本。"""
        msg_list = list(messages)
        async for chunk in self.react_loop.run(msg_list):
            yield chunk


# 编译期静态校验是否完全实现 Agent 协议
_agent_check: Agent = OnlineAgent()
