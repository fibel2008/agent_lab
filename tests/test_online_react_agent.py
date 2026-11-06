"""在线 ReAct Agent、LLMClient、工具注册中心与上下文构建单元测试。"""

import asyncio
import os
import unittest
from unittest.mock import AsyncMock, patch

import httpx

from Assistant import config
from Assistant.agent.base import ChatMessage
from Assistant.agent.errors import LLMError
from Assistant.agent.factory import get_agent
from Assistant.agent.llm_client import LLMClient
from Assistant.agent.mock_agent import MockAgent
from Assistant.agent.online_agent import OnlineAgent, build_context_messages
from Assistant.agent.react import ReActLoop
from Assistant.agent.tools.base import BaseTool, ToolCall
from Assistant.agent.tools.registry import ToolRegistry, tool_registry
from Assistant.storage.db import close_db, init_db
from Assistant.storage.session_store import SessionStore


class DummyTool:
    """测试用具体工具类。"""

    name = "calculator"
    description = "用于计算数学表达式"
    parameters = {
        "type": "object",
        "properties": {"expr": {"type": "string"}},
        "required": ["expr"],
    }

    async def execute(self, **kwargs) -> str:
        return f"calc_result:{kwargs.get('expr')}"


class TestLLMClient(unittest.IsolatedAsyncioTestCase):
    """测试 LLMClient 客户端流式调用与异常映射。"""

    async def test_no_api_key_raises_error(self):
        client = LLMClient(api_key="")
        with self.assertRaises(LLMError) as ctx:
            async for _ in client.stream_chat([{"role": "user", "content": "hi"}]):
                pass
        self.assertEqual(ctx.exception.code, "NO_API_KEY")

    async def test_stream_chat_success(self):
        # 模拟标准 OpenAI SSE 流式响应
        sse_lines = [
            b'data: {"choices": [{"delta": {"content": "\xe4\xbd\xa0\xe5\xa5\xbd"}}]}\n\n',
            b'data: {"choices": [{"delta": {"content": "\xef\xbc\x81"}}]}\n\n',
            b"data: [DONE]\n\n",
        ]

        def handler(request: httpx.Request) -> httpx.Response:
            self.assertEqual(request.url.path, "/v1/chat/completions")
            self.assertEqual(request.headers.get("authorization"), "Bearer test-key")
            return httpx.Response(200, content=b"".join(sse_lines))

        transport = httpx.MockTransport(handler)
        async with httpx.AsyncClient(transport=transport) as http_client:
            client = LLMClient(api_key="test-key", base_url="https://mock.api/v1", http_client=http_client)
            chunks = []
            async for chunk in client.stream_chat([{"role": "user", "content": "hello"}]):
                chunks.append(chunk)

        self.assertEqual("".join(chunks), "你好！")

    async def test_auth_failed_401(self):
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(401, json={"error": "Invalid API key"})

        transport = httpx.MockTransport(handler)
        async with httpx.AsyncClient(transport=transport) as http_client:
            client = LLMClient(api_key="wrong-key", http_client=http_client)
            with self.assertRaises(LLMError) as ctx:
                async for _ in client.stream_chat([{"role": "user", "content": "hi"}]):
                    pass
            self.assertEqual(ctx.exception.code, "AUTH_FAILED")

    async def test_quota_exceeded_429(self):
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(429, json={"error": "Rate limit reached"})

        transport = httpx.MockTransport(handler)
        async with httpx.AsyncClient(transport=transport) as http_client:
            client = LLMClient(api_key="test-key", http_client=http_client)
            with self.assertRaises(LLMError) as ctx:
                async for _ in client.stream_chat([{"role": "user", "content": "hi"}]):
                    pass
            self.assertEqual(ctx.exception.code, "QUOTA_EXCEEDED")

    async def test_upstream_error_500(self):
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(500, content=b"Internal Server Error")

        transport = httpx.MockTransport(handler)
        async with httpx.AsyncClient(transport=transport) as http_client:
            client = LLMClient(api_key="test-key", http_client=http_client)
            with self.assertRaises(LLMError) as ctx:
                async for _ in client.stream_chat([{"role": "user", "content": "hi"}]):
                    pass
            self.assertEqual(ctx.exception.code, "UPSTREAM_ERROR")

    async def test_network_timeout(self):
        def handler(request: httpx.Request) -> httpx.Response:
            raise httpx.TimeoutException("Read timed out")

        transport = httpx.MockTransport(handler)
        async with httpx.AsyncClient(transport=transport) as http_client:
            client = LLMClient(api_key="test-key", http_client=http_client)
            with self.assertRaises(LLMError) as ctx:
                async for _ in client.stream_chat([{"role": "user", "content": "hi"}]):
                    pass
            self.assertEqual(ctx.exception.code, "TIMEOUT")

    async def test_network_error(self):
        def handler(request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError("Failed to connect")

        transport = httpx.MockTransport(handler)
        async with httpx.AsyncClient(transport=transport) as http_client:
            client = LLMClient(api_key="test-key", http_client=http_client)
            with self.assertRaises(LLMError) as ctx:
                async for _ in client.stream_chat([{"role": "user", "content": "hi"}]):
                    pass
            self.assertEqual(ctx.exception.code, "NETWORK_ERROR")


class TestToolRegistry(unittest.IsolatedAsyncioTestCase):
    """测试工具抽象协议与单例注册表。"""

    def setUp(self):
        self.registry = ToolRegistry()

    def test_empty_registry(self):
        self.assertTrue(self.registry.is_empty())
        self.assertEqual(len(self.registry.list_tools()), 0)
        self.assertIsNone(self.registry.get("non_existent"))

    async def test_register_and_execute(self):
        tool = DummyTool()
        self.registry.register(tool)

        self.assertFalse(self.registry.is_empty())
        self.assertEqual(self.registry.get("calculator"), tool)

        schema = self.registry.list_tools()
        self.assertEqual(len(schema), 1)
        self.assertEqual(schema[0]["function"]["name"], "calculator")

        res = await tool.execute(expr="1+1")
        self.assertEqual(res, "calc_result:1+1")

        self.registry.clear()
        self.assertTrue(self.registry.is_empty())


class TestReActLoop(unittest.IsolatedAsyncioTestCase):
    """测试 ReAct 循环执行引擎。"""

    async def test_run_in_empty_tool_mode_no_thought_leak(self):
        # 验证在无工具模式下：单次流式输出，不注入 Thought: 等前缀
        mock_llm = AsyncMock(spec=LLMClient)

        async def fake_stream(messages):
            # 确认系统提示词不含 Thought/Final Answer 注入
            for m in messages:
                self.assertNotIn("Thought:", m["content"])
                self.assertNotIn("Final Answer:", m["content"])
            yield "Hello"
            yield " World!"

        mock_llm.stream_chat = fake_stream

        empty_registry = ToolRegistry()
        react = ReActLoop(llm_client=mock_llm, tools=empty_registry)

        results = []
        async for chunk in react.run([ChatMessage(role="user", content="ping")]):
            results.append(chunk)

        self.assertEqual("".join(results), "Hello World!")

    async def test_dispatch_action_blocked_when_empty_tools(self):
        empty_registry = ToolRegistry()
        react = ReActLoop(tools=empty_registry)

        call = ToolCall(id="c1", name="dummy", arguments={})
        with self.assertRaises(LLMError) as ctx:
            await react.dispatch_action(call)
        self.assertEqual(ctx.exception.code, "INTERNAL_ERROR")


class TestContextMessages(unittest.IsolatedAsyncioTestCase):
    """测试多轮上下文构建与消息过滤算法。"""

    async def asyncSetUp(self):
        self.db_path = config.DB_PATH.parent / "test_context.db"
        if self.db_path.exists():
            self.db_path.unlink()
        await init_db(self.db_path)
        self.store = SessionStore()

    async def asyncTearDown(self):
        await close_db()
        if self.db_path.exists():
            self.db_path.unlink()

    async def test_context_building_and_filtering(self):
        # 1. 创建会话
        session = await self.store.create_session("s_test", "测试会话")

        # 2. 依次模拟写入各类状态的消息
        # msg1: 初始空白消息（应被忽略）
        await self.store.create_turn_and_task("s_test", "u_empty", "   ", "a_empty", "t_empty")
        # msg2: 正常 user
        # msg3: interrupted 助手消息（应保留并追加补偿说明）
        await self.store.create_turn_and_task("s_test", "u1", "用户第一问", "a1", "t1")
        await self.store.update_message_stream("a1", "助手部分回答")
        await self.store.finalize_generation("t1", "a1", "助手部分回答", "interrupted", "interrupted")

        # msg4: 连续第二个 user 消息（前一个因为是 interrupted 属于有效回答，保留第一轮）
        # msg5: error 助手消息（应被完全忽略）
        await self.store.create_turn_and_task("s_test", "u2", "用户第二问（发生异常）", "a2", "t2")
        await self.store.finalize_generation("t2", "a2", "", "error", "failed", "TIMEOUT")

        # msg6: 紧接着的第三个 user 消息（由于前一条 u2 对应的 a2 是 error，两 user 连续，u2 应当被丢弃）
        # msg7: 正常助手消息
        await self.store.create_turn_and_task("s_test", "u3", "用户第三问（正常）", "a3", "t3")
        await self.store.finalize_generation("t3", "a3", "助手完整回答", "done", "completed")

        # 当前会话的最新提问
        await self.store.create_turn_and_task("s_test", "u4", "用户当前最新提问", "a4", "t4")

        # 构建上下文
        context = await build_context_messages("s_test", self.store, max_messages=10)

        # 验证结果：
        # - u_empty 与 a_empty 被忽略
        # - u1 保留
        # - a1 保留且包含补偿说明 "[此条回复此前未完整生成]"
        # - a2 是 error 被忽略，导致 u2 紧邻 u3，交叉算法丢弃 u2，保留 u3
        # - a3 保留
        # - u4 保留
        roles = [m.role for m in context]
        self.assertEqual(roles, ["user", "assistant", "user", "assistant", "user"])

        self.assertEqual(context[0].content, "用户第一问")
        self.assertIn("[此条回复此前未完整生成]", context[1].content)
        self.assertEqual(context[2].content, "用户第三问（正常）")
        self.assertEqual(context[3].content, "助手完整回答")
        self.assertEqual(context[4].content, "用户当前最新提问")

    async def test_session_isolation(self):
        await self.store.create_session("s_1", "会话1")
        await self.store.create_session("s_2", "会话2")

        await self.store.create_turn_and_task("s_1", "u1_1", "来自会话1的消息", "a1_1", "t1_1")
        await self.store.finalize_generation("t1_1", "a1_1", "回复会话1", "done", "completed")

        await self.store.create_turn_and_task("s_2", "u2_1", "来自会话2的消息", "a2_1", "t2_1")
        await self.store.finalize_generation("t2_1", "a2_1", "回复会话2", "done", "completed")

        ctx_1 = await build_context_messages("s_1", self.store)
        ctx_2 = await build_context_messages("s_2", self.store)

        self.assertEqual(len(ctx_1), 2)
        self.assertEqual(ctx_1[0].content, "来自会话1的消息")
        self.assertEqual(len(ctx_2), 2)
        self.assertEqual(ctx_2[0].content, "来自会话2的消息")

    async def test_sliding_window_and_leading_assistant_drop(self):
        await self.store.create_session("s_long", "长对话会话")
        # 连续写入 20 轮（共 40 条有效消息），设定窗口上限为 10 条
        for i in range(1, 21):
            await self.store.create_turn_and_task("s_long", f"u_{i}", f"用户提问 {i}", f"a_{i}", f"t_{i}")
            await self.store.finalize_generation(f"t_{i}", f"a_{i}", f"助手回答 {i}", "done", "completed")

        # 截取窗口为 5 条（由于 40 条截取末尾 5 条第一条会是 assistant，算法应自动丢弃该 assistant 得到 4 条，且首条必为 user）
        ctx = await build_context_messages("s_long", self.store, max_messages=5)
        self.assertEqual(len(ctx), 4)
        self.assertEqual(ctx[0].role, "user")
        self.assertEqual(ctx[0].content, "用户提问 19")
        self.assertEqual(ctx[1].role, "assistant")
        self.assertEqual(ctx[1].content, "助手回答 19")
        self.assertEqual(ctx[2].role, "user")
        self.assertEqual(ctx[2].content, "用户提问 20")
        self.assertEqual(ctx[3].role, "assistant")
        self.assertEqual(ctx[3].content, "助手回答 20")


class TestAgentFactory(unittest.TestCase):
    """测试工厂模式。"""

    def test_get_agent(self):
        offline = get_agent("offline")
        self.assertIsInstance(offline, MockAgent)

        online = get_agent("online")
        self.assertIsInstance(online, OnlineAgent)


if __name__ == "__main__":
    unittest.main()
