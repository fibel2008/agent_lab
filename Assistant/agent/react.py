"""ReAct (Reasoning and Acting) 循环执行引擎模块。"""

import logging
from collections.abc import AsyncIterator
from typing import Optional

from Assistant.agent.base import ChatMessage
from Assistant.agent.errors import LLMError
from Assistant.agent.llm_client import LLMClient
from Assistant.agent.tools.base import ToolCall
from Assistant.agent.tools.registry import ToolRegistry, tool_registry

logger = logging.getLogger("assistant.react")

DEFAULT_SYSTEM_PROMPT = (
    "你是 Emibot，一个专业、友好、高效的 AI 个人助手。请清晰、准确地回答用户的问题。"
)


class ReActLoop:
    """ReAct 循环执行引擎。

    包含推理（Thought）、行动（Action）与观察（Observation）三要素骨架，
    在第二版无工具阶段采用直接流式最终回答防推理泄露策略。
    """

    def __init__(
        self,
        llm_client: Optional[LLMClient] = None,
        tools: Optional[ToolRegistry] = None,
        max_steps: int = 5,
        system_prompt: str = DEFAULT_SYSTEM_PROMPT,
    ) -> None:
        self.llm_client = llm_client or LLMClient()
        self.tools = tools if tools is not None else tool_registry
        self.max_steps = max_steps
        self.system_prompt = system_prompt

    async def dispatch_action(self, tool_call: ToolCall) -> str:
        """动作分发点：根据工具调用分发至 ToolRegistry 执行并返回观察结果。"""
        if self.tools.is_empty():
            logger.warning("尝试分发动作但工具注册中心为空: tool=%s", tool_call.name)
            raise LLMError("INTERNAL_ERROR", f"无可用工具可执行动作: {tool_call.name}")

        tool = self.tools.get(tool_call.name)
        if not tool:
            logger.warning("未找到指定工具: %s", tool_call.name)
            raise LLMError("INTERNAL_ERROR", f"未找到已注册工具: {tool_call.name}")

        try:
            observation = await tool.execute(**tool_call.arguments)
            return observation
        except Exception as exc:
            logger.exception("工具执行异常: tool=%s, err=%s", tool_call.name, exc)
            raise LLMError("INTERNAL_ERROR", f"工具执行失败: {exc}") from exc

    async def run(self, messages: list[ChatMessage]) -> AsyncIterator[str]:
        """ReAct 核心循环入口：根据消息历史驱动思考与行动，流式产出最终回答。"""
        step = 0

        while step < self.max_steps:
            step += 1

            # 第二版特化约束：无工具注册阶段直接进行最终回答流式生成，防推理过程泄露
            if self.tools.is_empty():
                payload_messages: list[dict[str, str]] = []
                if self.system_prompt:
                    payload_messages.append({"role": "system", "content": self.system_prompt})

                for msg in messages:
                    payload_messages.append({"role": msg.role, "content": msg.content})

                async for chunk in self.llm_client.stream_chat(payload_messages):
                    yield chunk

                # 单次生成即完成最终回答收敛，退出循环
                return

            # 后续阶段接入具体工具时的通用 ReAct 循环扩展占位
            # 当有注册工具时，此处将集成工具调用判定与 dispatch_action
            raise NotImplementedError("多工具 ReAct 闭环将在后续阶段接入具体工具时启用")

        # 超过最大步数仍未产出最终回答
        logger.error("ReAct 循环达到最大步数上限 %d 仍未收敛", self.max_steps)
        raise LLMError("INTERNAL_ERROR", "生成步数超出上限，请重试。")
