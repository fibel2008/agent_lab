"""ReAct (Reasoning and Acting) 循环执行引擎模块。"""

import base64
from collections.abc import AsyncIterator, Callable, Sequence
import json
import logging
import mimetypes
from pathlib import Path
from typing import Any, Optional

from Assistant.agent.base import ChatMessage
from Assistant.agent.errors import LLMError
from Assistant.agent.llm_client import LLMClient
from Assistant.agent.tools.base import ToolCall
from Assistant.agent.tools.registry import ToolRegistry, tool_registry
from Assistant.storage.session_store import session_store

logger = logging.getLogger("assistant.react")

DEFAULT_SYSTEM_PROMPT = (
    "你是 Emibot，一个专业、友好、高效的 AI 个人助手。请清晰、准确地回答用户的问题。"
    "若附件内容超出长度上限已被截断，你必须在回答中如实向用户声明由于文件过长仅分析了前半部分；"
    "若附件读取失败，必须如实将失败原因告知用户，严禁凭空虚构或猜测文件内容。"
)


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


class ReActLoop:
    """ReAct 循环执行引擎。

    包含推理（Thought）、行动（Action）与观察（Observation）三要素骨架，
    在无工具注册时直接流式最终回答防推理泄露；在工具注册时支持工具调用、
    SSE 过程事件广播与多轮收敛。
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

    async def dispatch_action(
        self, tool_call: ToolCall, session_id: Optional[str] = None
    ) -> str:
        """动作分发点：根据工具调用分发至 ToolRegistry 执行并返回观察结果。"""
        if self.tools.is_empty():
            logger.warning("尝试分发动作但工具注册中心为空: tool=%s", tool_call.name)
            raise LLMError("INTERNAL_ERROR", f"无可用工具可执行动作: {tool_call.name}")

        tool = self.tools.get(tool_call.name)
        if not tool:
            logger.warning("未找到指定工具: %s", tool_call.name)
            raise LLMError("INTERNAL_ERROR", f"未找到已注册工具: {tool_call.name}")

        try:
            kwargs = dict(tool_call.arguments)
            if session_id:
                kwargs["session_id"] = session_id
            observation = await tool.execute(**kwargs)
            return observation
        except LLMError:
            raise
        except Exception as exc:
            logger.exception("工具执行异常: tool=%s, err=%s", tool_call.name, exc)
            raise LLMError("INTERNAL_ERROR", f"工具执行失败: {exc}") from exc

    async def run(
        self,
        messages: list[ChatMessage],
        on_event: Optional[Callable[[str, dict[str, Any]], None]] = None,
        session_id: Optional[str] = None,
    ) -> AsyncIterator[str]:
        """ReAct 核心循环入口：驱动思考与行动，广播过程事件并流式产出最终回答。"""
        payload_messages = build_payload_messages(messages, system_prompt=self.system_prompt)

        # 1. 无工具注册时直接进行最终回答流式生成，防推理过程泄露
        if self.tools.is_empty():
            if on_event:
                on_event("step_status", {"status": "generating", "text": "正在生成回复..."})
            async for chunk in self.llm_client.stream_chat(payload_messages):
                yield chunk
            return

        # 2. 具备工具能力时的多轮 ReAct 循环
        step = 0
        tools_schema = self.tools.list_tools()

        while step < self.max_steps:
            step += 1
            logger.info("执行 ReAct 步数 %d/%d", step, self.max_steps)

            # ReAct 循环向模型发起调用前广播 step_status: {"status": "thinking", "text": "正在思考..."}
            if on_event:
                on_event("step_status", {"status": "thinking", "text": "正在思考..."})

            resp_msg = await self.llm_client.chat_completion(
                payload_messages, tools=tools_schema
            )
            tool_calls = resp_msg.get("tool_calls")

            # 若模型决定调用工具
            if tool_calls:
                payload_messages.append({
                    "role": "assistant",
                    "content": resp_msg.get("content") or "",
                    "tool_calls": tool_calls,
                })

                for tc in tool_calls:
                    fn = tc.get("function", {})
                    tool_name = fn.get("name")
                    raw_args = fn.get("arguments", "{}")
                    if isinstance(raw_args, str):
                        try:
                            args = json.loads(raw_args)
                        except json.JSONDecodeError:
                            args = {}
                    else:
                        args = raw_args or {}

                    # 提取附件名称用于状态文案展示
                    filename = args.get("attachment_id", "未知附件")
                    if tool_name == "read_attachment":
                        att_id = args.get("attachment_id", "")
                        att_record = await session_store.get_attachment(att_id)
                        if att_record:
                            filename = att_record["filename"]

                    # 决定调用工具时广播 step_status
                    if on_event:
                        on_event(
                            "step_status",
                            {
                                "status": "calling_tool",
                                "tool": tool_name,
                                "text": f"正在调用工具: {tool_name}...",
                            },
                        )
                        # 兼容原有 tool_start 广播
                        on_event(
                            "tool_start",
                            {
                                "tool": tool_name,
                                "attachment_name": filename,
                                "status_text": f"正在读取附件 {filename}...",
                            },
                        )

                    # 分发执行工具动作
                    call_obj = ToolCall(id=tc.get("id", ""), name=tool_name, arguments=args)
                    tool_status = "success"
                    try:
                        observation = await self.dispatch_action(call_obj, session_id=session_id)
                        if observation.startswith("[读取失败") or observation.startswith("[错误"):
                            tool_status = "error"
                    except Exception as exc:
                        observation = f"[读取失败：{exc}]"
                        tool_status = "error"

                    # 工具执行完毕后广播 tool_done
                    if on_event:
                        on_event(
                            "tool_done",
                            {
                                "tool": tool_name,
                                "status": tool_status,
                            },
                        )

                    # 存入 ReAct 上下文
                    payload_messages.append({
                        "role": "tool",
                        "tool_call_id": tc.get("id", ""),
                        "content": observation,
                    })

                # 继续下一轮循环驱动大模型思考与生成
                continue

            # 若模型未调用工具，模型决定输出最终回答前广播 step_status: {"status": "generating", "text": "正在生成回复..."}
            if on_event:
                on_event("step_status", {"status": "generating", "text": "正在生成回复..."})

            final_content = resp_msg.get("content") or ""
            chunk_size = 4
            for i in range(0, len(final_content), chunk_size):
                yield final_content[i : i + chunk_size]
            return

        # 超过最大步数仍未产出最终回答
        logger.error("ReAct 循环达到最大步数上限 %d 仍未收敛", self.max_steps)
        raise LLMError("INTERNAL_ERROR", "生成步数超出上限，请重试。")
