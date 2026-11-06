"""后台生成任务解耦管理器、会话订阅流与并发中断单元测试。"""

import asyncio
from datetime import datetime
import os
import unittest
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient
import httpx

from Assistant import config
from Assistant.agent.base import ChatMessage
from Assistant.agent.errors import LLMError
from Assistant.agent.llm_client import LLMClient
from Assistant.agent.online_agent import OnlineAgent
from Assistant.agent.react import ReActLoop
from Assistant.agent.task_manager import TaskManager, task_manager
from Assistant.agent.tools.registry import ToolRegistry
from Assistant.app import create_app, lifespan
from Assistant.storage.db import close_db, init_db
from Assistant.storage.session_store import SessionStore, session_store


class TestGenerationDecoupling(unittest.IsolatedAsyncioTestCase):
    """测试 TaskManager、并发占位与解耦订阅流。"""

    async def asyncSetUp(self):
        self.db_path = config.DB_PATH.parent / "test_decoupling.db"
        if self.db_path.exists():
            self.db_path.unlink()
        await init_db(self.db_path)
        self.tm = TaskManager()
        self.store = SessionStore()

    async def asyncTearDown(self):
        await self.tm.shutdown()
        await close_db()
        if self.db_path.exists():
            self.db_path.unlink()

    async def test_start_generation_and_409_concurrency_conflict(self):
        await self.store.create_session("s_test", "测试会话")

        # Mock online agent 的流式输出（稍作延迟以模拟生成过程）
        async def slow_stream(messages):
            yield "Hello"
            await asyncio.sleep(0.2)
            yield " World!"

        with patch("Assistant.agent.task_manager.get_agent") as mock_get_agent:
            fake_agent = AsyncMock()
            fake_agent.stream_reply = slow_stream
            mock_get_agent.return_value = fake_agent

            # 首次触发生成
            task = await self.tm.start_generation("s_test", "你好", self.store)
            self.assertEqual(task.session_id, "s_test")
            self.assertTrue(self.tm.is_session_busy("s_test"))

            # 在任务运行期间，同一会话再次触发应抛出 ValueError (对应 409)
            with self.assertRaises(ValueError) as ctx:
                await self.tm.start_generation("s_test", "重复提问", self.store)
            self.assertIn("已有正在进行的生成任务", str(ctx.exception))

            # 等待任务执行完毕
            await task.asyncio_task
            self.assertFalse(self.tm.is_session_busy("s_test"))
            self.assertEqual(task.status, "completed")
            self.assertEqual(task.final_content, "Hello World!")

            # 验证数据库落盘状态
            messages = await self.store.get_messages("s_test")
            self.assertEqual(len(messages), 2)
            self.assertEqual(messages[0]["content"], "你好")
            self.assertEqual(messages[1]["content"], "Hello World!")
            self.assertEqual(messages[1]["status"], "done")

    async def test_subscribe_stream_catch_up_and_realtime(self):
        await self.store.create_session("s_sub", "订阅测试会话")

        event_signal = asyncio.Event()

        async def controlled_stream(messages):
            yield "chunk1"
            yield "chunk2"
            event_signal.set()
            await asyncio.sleep(0.1)
            yield "chunk3"

        with patch("Assistant.agent.task_manager.get_agent") as mock_get_agent:
            fake_agent = AsyncMock()
            fake_agent.stream_reply = controlled_stream
            mock_get_agent.return_value = fake_agent

            task = await self.tm.start_generation("s_sub", "测试追赶", self.store)

            # 等待前两个 chunk 生成完毕
            await event_signal.wait()

            # 此时建立订阅，验证追赶机制是否把前两个 chunk 合并推入
            events = []
            async for evt, data in self.tm.subscribe_stream("s_sub", self.store):
                events.append((evt, data))

            # 验证事件顺序：meta -> delta(chunk1chunk2) -> delta(chunk3) -> done
            event_types = [e[0] for e in events]
            self.assertEqual(event_types, ["meta", "delta", "delta", "done"])
            self.assertEqual(events[1][1]["text"], "chunk1chunk2")
            self.assertEqual(events[2][1]["text"], "chunk3")
            self.assertEqual(events[3][1]["finish_reason"], "stop")

    async def test_client_disconnect_does_not_cancel_background_task(self):
        await self.store.create_session("s_dc", "断线测试会话")

        finish_event = asyncio.Event()

        async def long_stream(messages):
            yield "Part 1"
            await asyncio.sleep(0.15)
            yield "Part 2"
            finish_event.set()

        with patch("Assistant.agent.task_manager.get_agent") as mock_get_agent:
            fake_agent = AsyncMock()
            fake_agent.stream_reply = long_stream
            mock_get_agent.return_value = fake_agent

            task = await self.tm.start_generation("s_dc", "切页测试", self.store)

            # 客户端连接后读取一个事件即模拟切页（break 出生成器）
            sub_gen = self.tm.subscribe_stream("s_dc", self.store)
            first_event = await anext(sub_gen)
            self.assertEqual(first_event[0], "meta")
            # 客户端直接关闭连接（退出生成器）
            await sub_gen.aclose()

            # 等待后台任务运行完毕
            await finish_event.wait()
            await task.asyncio_task

            # 验证后台任务不受影响，继续执行完毕并成功落盘
            self.assertEqual(task.status, "completed")
            self.assertEqual(task.final_content, "Part 1Part 2")
            messages = await self.store.get_messages("s_dc")
            self.assertEqual(messages[1]["status"], "done")
            self.assertEqual(messages[1]["content"], "Part 1Part 2")

    async def test_abort_session(self):
        await self.store.create_session("s_abort", "中断测试会话")

        async def infinite_stream(messages):
            yield "开始部分"
            while True:
                await asyncio.sleep(0.05)
                yield "持续增量"

        with patch("Assistant.agent.task_manager.get_agent") as mock_get_agent:
            fake_agent = AsyncMock()
            fake_agent.stream_reply = infinite_stream
            mock_get_agent.return_value = fake_agent

            task = await self.tm.start_generation("s_abort", "中断测试", self.store)
            await asyncio.sleep(0.1)

            # 调用主动中断
            aborted = await self.tm.abort_session("s_abort")
            self.assertTrue(aborted)
            self.assertEqual(task.status, "interrupted")

            # 验证数据库消息已被标记为 interrupted
            messages = await self.store.get_messages("s_abort")
            self.assertEqual(messages[1]["status"], "interrupted")
            self.assertTrue(messages[1]["content"].startswith("开始部分"))

    async def test_multi_session_concurrency(self):
        # 验证不同会话支持并发独立生成
        await self.store.create_session("s_1", "会话1")
        await self.store.create_session("s_2", "会话2")

        async def stream_1(messages):
            await asyncio.sleep(0.1)
            yield "Resp 1"

        async def stream_2(messages):
            await asyncio.sleep(0.1)
            yield "Resp 2"

        with patch("Assistant.agent.task_manager.get_agent") as mock_get_agent:
            def agent_factory(mode):
                agent = AsyncMock()
                return agent

            mock_agent = AsyncMock()
            mock_agent.stream_reply = lambda msgs: stream_1(msgs) if "1" in msgs[-1].content else stream_2(msgs)
            mock_get_agent.return_value = mock_agent

            task1 = await self.tm.start_generation("s_1", "问1", self.store)
            task2 = await self.tm.start_generation("s_2", "问2", self.store)

            self.assertTrue(self.tm.is_session_busy("s_1"))
            self.assertTrue(self.tm.is_session_busy("s_2"))

            await asyncio.gather(task1.asyncio_task, task2.asyncio_task)

            self.assertFalse(self.tm.is_session_busy("s_1"))
            self.assertFalse(self.tm.is_session_busy("s_2"))
            self.assertEqual(task1.final_content, "Resp 1")
            self.assertEqual(task2.final_content, "Resp 2")


class TestFastAPIDecouplingEndpoints(unittest.IsolatedAsyncioTestCase):
    """测试通过 FastAPI HTTP 端点的在线流式、中断与 409 接口交互。"""

    async def asyncSetUp(self):
        self.db_path = config.DB_PATH.parent / "test_api_decoupling.db"
        if self.db_path.exists():
            self.db_path.unlink()
        await init_db(self.db_path)

    async def asyncTearDown(self):
        await task_manager.shutdown()
        await close_db()
        if self.db_path.exists():
            self.db_path.unlink()

    async def test_http_messages_stream_and_abort_flow(self):
        app = create_app()

        async def mock_stream(messages):
            yield "Alpha"
            await asyncio.sleep(0.1)
            yield "Beta"

        with patch("Assistant.agent.task_manager.get_agent") as mock_get_agent:
            fake_agent = AsyncMock()
            fake_agent.stream_reply = mock_stream
            mock_get_agent.return_value = fake_agent

            transport = httpx.ASGITransport(app=app)
            async with httpx.AsyncClient(transport=transport, base_url="http://127.0.0.1") as client:
                # 1. 创建会话
                res = await client.post("/api/sessions", json={"title": "端点测试"})
                self.assertEqual(res.status_code, 201)
                session_id = res.json()["id"]

                # 2. 发送在线消息
                msg_res = await client.post(
                    f"/api/sessions/{session_id}/messages",
                    json={"content": "测试提问"},
                )
                self.assertEqual(msg_res.status_code, 200)
                body = msg_res.json()
                self.assertEqual(body["status"], "running")

                # 3. 在同一会话再次发送，立即返回 409 Conflict
                dup_res = await client.post(
                    f"/api/sessions/{session_id}/messages",
                    json={"content": "重复提问"},
                )
                self.assertEqual(dup_res.status_code, 409)

                # 4. 订阅 SSE 流
                stream_res = await client.get(f"/api/chat/stream?session_id={session_id}")
                self.assertEqual(stream_res.status_code, 200)
                text = stream_res.text
                self.assertIn("event: meta", text)
                self.assertIn("event: delta", text)
                self.assertIn("Alpha", text)
                self.assertIn("event: done", text)

                # 5. 验证会话历史中消息已完成
                hist_res = await client.get(f"/api/sessions/{session_id}/messages")
                messages = hist_res.json()
                self.assertEqual(len(messages), 2)
                self.assertEqual(messages[1]["status"], "done")
                self.assertEqual(messages[1]["content"], "AlphaBeta")


if __name__ == "__main__":
    unittest.main()
