"""在线对话后台异步任务管理器模块。"""

import asyncio
from datetime import datetime
import inspect
import logging
import time
from typing import Any, AsyncIterator, Literal, Optional
import uuid

from Assistant import config
from Assistant.agent.errors import LLMError
from Assistant.agent.factory import get_agent
from Assistant.agent.online_agent import build_context_messages
from Assistant.storage.session_store import SessionStore

logger = logging.getLogger("assistant.task_manager")


class GenerationTask:
    """单个在线生成任务的状态追踪与订阅分发实体。"""

    def __init__(
        self,
        task_id: str,
        session_id: str,
        user_msg_id: str,
        message_id: str,
        created_at: str,
        model: str,
    ) -> None:
        self.task_id = task_id
        self.session_id = session_id
        self.user_msg_id = user_msg_id
        self.message_id = message_id
        self.created_at = created_at
        self.model = model
        self.asyncio_task: Optional[asyncio.Task] = None
        self.chunk_buffer: list[str] = []
        self.subscribers: set[asyncio.Queue] = set()
        self.status: Literal["running", "completed", "interrupted", "failed"] = "running"
        self.error_code: Optional[str] = None
        self.error_message: Optional[str] = None
        self.final_content: str = ""
        self.current_step_status: Optional[dict[str, Any]] = None


class TaskManager:
    """全局异步生成任务管理器。

    实现生成与页面解耦、单会话严格串行与防竞态占位、跨会话并发独立、
    追赶式增量广播以及优雅停机落盘收尾。
    """

    def __init__(self) -> None:
        self._tasks: dict[str, GenerationTask] = {}
        self._lock = asyncio.Lock()

    def is_session_busy(self, session_id: str) -> bool:
        """同步检查指定会话是否已有正在进行的生成任务。"""
        return session_id in self._tasks

    def get_task(self, session_id: str) -> Optional[GenerationTask]:
        """获取指定会话当前的活跃任务。"""
        return self._tasks.get(session_id)

    async def start_generation(
        self,
        session_id: str,
        user_content: str,
        store: SessionStore,
        attachments: Optional[list[dict]] = None,
    ) -> GenerationTask:
        """启动后台生成任务并在数据库原子写入 turn 与 task 记录。"""
        async with self._lock:
            if session_id in self._tasks:
                raise ValueError("该会话已有正在进行的生成任务")

            task_id = f"t_{uuid.uuid4().hex[:8]}"
            user_msg_id = f"m_u_{uuid.uuid4().hex[:8]}"
            assistant_msg_id = f"m_a_{uuid.uuid4().hex[:8]}"
            now_iso = datetime.now().astimezone().isoformat(timespec="seconds")
            model_name = config.MODEL

            task = GenerationTask(
                task_id=task_id,
                session_id=session_id,
                user_msg_id=user_msg_id,
                message_id=assistant_msg_id,
                created_at=now_iso,
                model=model_name,
            )
            self._tasks[session_id] = task

        # 在异步写事务中原子落盘用户消息、附件、助手占位消息与任务记录
        try:
            await store.create_turn_and_task(
                session_id=session_id,
                user_msg_id=user_msg_id,
                user_content=user_content,
                assistant_msg_id=assistant_msg_id,
                task_id=task_id,
                attachments=attachments,
            )
        except Exception as exc:
            async with self._lock:
                self._tasks.pop(session_id, None)
            logger.exception("创建消息轮次数据库记录失败: session_id=%s", session_id)
            raise

        # 启动后台独立异步协程执行生成
        task.asyncio_task = asyncio.create_task(
            self._run_generation(task, store),
            name=f"gen_{task.task_id}",
        )
        return task

    async def _run_generation(
        self,
        task: GenerationTask,
        store: SessionStore,
    ) -> None:
        """后台独立运行的生成协程：流式请求模型、节流刷盘并广播增量。"""
        start_time = time.perf_counter()
        session_id = task.session_id
        message_id = task.message_id
        task_id = task.task_id

        logger.info(
            "启动后台异步生成任务: task_id=%s session_id=%s message_id=%s",
            task_id,
            session_id,
            message_id,
        )

        accumulated_chunks: list[str] = []
        last_flush_time = time.perf_counter()
        unflushed_count = 0

        # 定义给 ReAct / 工具过程广播的回调
        def on_event(event_type: str, data: dict[str, Any]) -> None:
            self._broadcast(task, event_type, data)

        try:
            # 1. 严格从数据库构建带过滤与交叉序列的上下文
            context_messages = await build_context_messages(session_id, store)
            agent = get_agent("online")

            # 2. 逐块流式生成（支持 on_event 回调驱动工具状态广播）
            sig = inspect.signature(agent.stream_reply)
            if "on_event" in sig.parameters:
                reply_stream = agent.stream_reply(
                    context_messages, on_event=on_event, session_id=session_id
                )
            else:
                reply_stream = agent.stream_reply(context_messages)

            async for chunk in reply_stream:
                accumulated_chunks.append(chunk)
                task.chunk_buffer.append(chunk)
                unflushed_count += 1

                # 广播给所有活跃订阅者
                self._broadcast(task, "delta", {"text": chunk})

                # 节流写盘：每 300ms 或累计 5 个 chunk 异步更新一次数据库
                now = time.perf_counter()
                if (now - last_flush_time >= 0.3) or (unflushed_count >= 5):
                    partial_text = "".join(accumulated_chunks)
                    await store.update_message_stream(message_id, partial_text)
                    last_flush_time = now
                    unflushed_count = 0

            # 3. 正常完成收尾
            final_content = "".join(accumulated_chunks)
            task.final_content = final_content
            task.status = "completed"

            duration_ms = int((time.perf_counter() - start_time) * 1000)

            # 契约：① 先落盘 -> ② 再广播 -> ③ 移除任务
            await store.finalize_generation(
                task_id=task_id,
                message_id=message_id,
                content=final_content,
                message_status="done",
                task_status="completed",
            )
            self._broadcast(
                task,
                "done",
                {"finish_reason": "stop", "duration_ms": duration_ms},
            )
            logger.info(
                "后台任务正常完成: task_id=%s chars=%d duration_ms=%d",
                task_id,
                len(final_content),
                duration_ms,
            )

        except asyncio.CancelledError:
            # 任务被用户中断、模式切换中断或优雅关机取消
            logger.info("后台生成任务被取消中断: task_id=%s session_id=%s", task_id, session_id)
            final_content = "".join(accumulated_chunks)
            task.final_content = final_content
            task.status = "interrupted"

            # 契约：① 先落盘 -> ② 再广播中断事件 -> ③ 重新抛出 CancelledError
            try:
                await store.finalize_generation(
                    task_id=task_id,
                    message_id=message_id,
                    content=final_content,
                    message_status="interrupted",
                    task_status="interrupted",
                )
            except Exception as exc:
                logger.exception("中断任务保存最终状态失败: task_id=%s", task_id)

            self._broadcast(
                task,
                "done",
                {"finish_reason": "interrupted", "duration_ms": int((time.perf_counter() - start_time) * 1000)},
            )
            raise

        except LLMError as exc:
            # 捕获标准领域大模型异常（如网络错误、鉴权失败、超时等）
            logger.warning("后台生成任务抛出 LLMError: task_id=%s code=%s msg=%s", task_id, exc.code, exc.message)
            final_content = "".join(accumulated_chunks)
            task.final_content = final_content
            task.status = "failed"
            task.error_code = exc.code
            task.error_message = exc.message

            try:
                await store.finalize_generation(
                    task_id=task_id,
                    message_id=message_id,
                    content=final_content,
                    message_status="error",
                    task_status="failed",
                    error_code=exc.code,
                )
            except Exception:
                logger.exception("失败任务保存状态失败: task_id=%s", task_id)

            self._broadcast(
                task,
                "error",
                {"code": exc.code, "message": exc.message},
            )

        except Exception as exc:
            # 捕获未知内部异常
            logger.exception("后台生成任务发生未预期异常: task_id=%s", task_id)
            final_content = "".join(accumulated_chunks)
            task.final_content = final_content
            task.status = "failed"
            code = "INTERNAL_ERROR"
            msg = config.ERROR_MESSAGES.get(code, "生成过程发生异常，请重试。")
            task.error_code = code
            task.error_message = msg

            try:
                await store.finalize_generation(
                    task_id=task_id,
                    message_id=message_id,
                    content=final_content,
                    message_status="error",
                    task_status="failed",
                    error_code=code,
                )
            except Exception:
                logger.exception("异常任务保存状态失败: task_id=%s", task_id)

            self._broadcast(
                task,
                "error",
                {"code": code, "message": msg},
            )

        finally:
            # 终态收尾：向所有队列推入 None 标记流结束，并从任务表中释放槽位
            self._close_subscribers(task)
            async with self._lock:
                self._tasks.pop(session_id, None)

    def _broadcast(self, task: GenerationTask, event_type: str, data: dict[str, Any]) -> None:
        """向当前任务的所有订阅客户端广播事件。"""
        if event_type == "step_status":
            task.current_step_status = data
        for queue in list(task.subscribers):
            try:
                queue.put_nowait((event_type, data))
            except Exception:
                pass

    def _close_subscribers(self, task: GenerationTask) -> None:
        """通知所有订阅者当前流已关闭。"""
        for queue in list(task.subscribers):
            try:
                queue.put_nowait((None, None))
            except Exception:
                pass

    async def abort_session(self, session_id: str) -> bool:
        """取消指定会话当前正在运行的任务并等待其收尾落盘完毕。"""
        task = self.get_task(session_id)
        if not task or not task.asyncio_task:
            return False

        if not task.asyncio_task.done():
            task.asyncio_task.cancel()
            try:
                await asyncio.wait_for(asyncio.shield(task.asyncio_task), timeout=5.0)
            except (asyncio.CancelledError, asyncio.TimeoutError, Exception):
                pass
        return True

    async def subscribe_stream(
        self,
        session_id: str,
        store: SessionStore,
    ) -> AsyncIterator[tuple[str, dict[str, Any]]]:
        """为客户端提供会话级增量订阅流，支持即时追赶与断线重连。"""
        task = self.get_task(session_id)

        # 竞态兜底：若连接到达时任务已不在内存，查询数据库最新消息状态
        if not task:
            messages = await store.get_messages(session_id)
            if messages:
                latest = messages[-1]
                if latest.get("role") == "assistant":
                    now_iso = latest.get("created_at") or datetime.now().astimezone().isoformat(timespec="seconds")
                    yield (
                        "meta",
                        {
                            "message_id": latest.get("id"),
                            "created_at": now_iso,
                            "model": config.MODEL,
                        },
                    )
                    if latest.get("status") == "error":
                        code = latest.get("error_code") or "INTERNAL_ERROR"
                        msg = latest.get("error_message") or config.ERROR_MESSAGES.get(code, "生成过程发生异常")
                        yield ("error", {"code": code, "message": msg})
                        return
                    if latest.get("content"):
                        yield ("delta", {"text": latest["content"]})
                    yield ("done", {"finish_reason": latest.get("status", "stop"), "duration_ms": 0})
                    return

            # 若完全无消息，直接下发一个空的 done
            yield (
                "meta",
                {
                    "message_id": f"m_a_{uuid.uuid4().hex[:8]}",
                    "created_at": datetime.now().astimezone().isoformat(timespec="seconds"),
                    "model": config.MODEL,
                },
            )
            yield ("done", {"finish_reason": "stop", "duration_ms": 0})
            return

        # 存在活跃任务：绑定独立队列进行追赶与实时监听
        queue: asyncio.Queue[tuple[Optional[str], Optional[dict[str, Any]]]] = asyncio.Queue()
        task.subscribers.add(queue)

        try:
            # 1. 首先下发元信息 meta 事件
            yield (
                "meta",
                {
                    "message_id": task.message_id,
                    "created_at": task.created_at,
                    "model": task.model,
                },
            )

            # 2. 追赶机制：若已有规划步骤状态，下发当前步骤；一次性下发当前任务累积的全部增量文本
            if getattr(task, "current_step_status", None):
                yield ("step_status", task.current_step_status)

            caught_up_text = "".join(task.chunk_buffer)
            if caught_up_text:
                yield ("delta", {"text": caught_up_text})

            # 3. 实时从队列读取并推送后续事件
            while True:
                event_type, payload = await queue.get()
                if event_type is None:
                    break
                yield (event_type, payload)

        finally:
            # 客户端连接断开时，仅从订阅者列表中移除队列；后台生成任务绝不取消
            task.subscribers.discard(queue)

    async def shutdown(self) -> None:
        """优雅关机：取消所有正在运行的任务并等待它们落盘更新为 interrupted。"""
        async with self._lock:
            running_tasks = [t.asyncio_task for t in self._tasks.values() if t.asyncio_task and not t.asyncio_task.done()]

        if not running_tasks:
            return

        logger.info("优雅停服：正在取消 %d 个后台运行中的生成任务...", len(running_tasks))
        for t in running_tasks:
            t.cancel()

        # 等待所有任务完成取消收尾
        results = await asyncio.gather(*running_tasks, return_exceptions=True)
        logger.info("所有后台任务均已安全收尾落盘: results_count=%d", len(results))


task_manager = TaskManager()
