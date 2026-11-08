"""本地 Mock Agent 实现，提供确定性关键词回复与流式切片输出。"""

import asyncio
from collections.abc import AsyncIterator, Sequence

from ..config import CHUNK_SIZE, STREAM_DELAY_MS
from .base import ChatMessage


class MockAgent:
    """本地确定性 Mock Agent。"""

    name: str = "mock"
    model: str = "mock-0.1"

    def _generate_reply_text(self, messages: Sequence[ChatMessage]) -> str:
        """根据最后一条用户消息的内容按关键词优先级生成纯文本回复。"""
        last_user_msg = next(
            (msg for msg in reversed(messages) if msg.role == "user"),
            None,
        )
        if not last_user_msg:
            return (
                "未检测到用户提问内容。当前为 Emibot 本地 Mock 模式，"
                "请输入你想探讨的 Agent 学习话题以体验流式回复。"
            )

        # 离线形态带附件文字反馈 (B1.15.3)
        if last_user_msg.attachments:
            count = len(last_user_msg.attachments)
            file_names = [att.filename for att in last_user_msg.attachments]
            return (
                f"已收到 {count} 个文件：{'、'.join(file_names)}。"
                "当前处于离线模式，不执行附件解析与工具调用。"
            )

        text = last_user_msg.content.strip().lower()

        if any(kw in text for kw in ("你好", "hello", "hi")):
            return (
                "你好！我是本地 Mock 模式下的 Emibot。当前服务运行在离线测试环境中，"
                "主要用于验证对话全链路和打字机流式输出。你可以尝试向我提问关于学习建议、"
                "系统介绍或数据库规划等问题，体验实时流式响应效果。"
            )

        if any(kw in text for kw in ("你是谁", "介绍", "名字")):
            return (
                "我是 Emibot，一个专为学习 Agent 架构而设计的可视化工作台助手。"
                "第一版通过本地 Mock 回复演示消息收发闭环和 Server-Sent Events 流式渲染，"
                "后续会平滑替换为真实大模型并接入工具调用能力。"
            )

        if any(kw in text for kw in ("学习", "怎么学", "agent")):
            return (
                "学习 Agent 建议分为三步推进：第一步先跑通前端与后端的最小对话流式闭环，"
                "建立端到端认知；第二步引入函数调用与工具执行机制，理解模型与环境交互原理；"
                "第三步构建短期与长期记忆，实现具备状态积累的智能助理。"
            )

        if any(kw in text for kw in ("数据库", "记忆", "笔记")):
            return (
                "个人数据库与记忆系统是 Emibot 后续版本的核心功能。在该模块中，"
                "你将能够沉淀个人知识库、学习笔记与会话历史，并支持通过向量检索为 Agent "
                "提供个性化上下文检索支持。目前该功能正在规划中，敬请期待。"
            )

        snippet = last_user_msg.content.strip()[:24]
        return (
            f"你刚才提到了：{snippet}。在当前 Mock 验证阶段，我们聚焦于打字机逐字输出与多消息排队机制的可靠性。"
            "针对后续 Agent 的工程实现，你更关注模型接口封装还是前端流式状态调度？"
        )

    async def stream_reply(
        self, messages: Sequence[ChatMessage]
    ) -> AsyncIterator[str]:
        """按配置切片大小与间隔延时流式产出增量文本块。"""
        full_text = self._generate_reply_text(messages)
        chunk_size = max(1, CHUNK_SIZE)
        delay_seconds = max(0, STREAM_DELAY_MS) / 1000.0

        chunks = [
            full_text[i : i + chunk_size]
            for i in range(0, len(full_text), chunk_size)
        ]

        for idx, chunk in enumerate(chunks):
            if idx > 0 and delay_seconds > 0:
                await asyncio.sleep(delay_seconds)
            yield chunk
