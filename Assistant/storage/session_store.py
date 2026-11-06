"""会话与消息异步 CRUD 仓储实现、写入串行锁与状态补偿。"""

import asyncio
from datetime import datetime
import secrets
import time
from typing import Optional

from ..config import ERROR_MESSAGES, logger
from .db import get_db


def generate_online_session_id() -> str:
    """生成符合在线会话格式规范的唯一 ID：s_on_<timestamp36>_<rand>。"""
    ts_36 = base36_encode(int(time.time() * 1000))
    rand = secrets.token_hex(4)
    return f"s_on_{ts_36}_{rand}"


def generate_online_message_id(role: str) -> str:
    """生成符合在线消息格式规范的唯一 ID：m_{u|a}_<rand>。"""
    prefix = "m_u" if role == "user" else "m_a"
    rand = secrets.token_hex(4)
    return f"{prefix}_{rand}"


def base36_encode(number: int) -> str:
    """将非负整数转换为 36 进制字符串。"""
    if number < 0:
        raise ValueError("仅支持非负整数转换")
    alphabet = "0123456789abcdefghijklmnopqrstuvwxyz"
    if number == 0:
        return "0"
    base36 = []
    while number:
        number, i = divmod(number, 36)
        base36.append(alphabet[i])
    return "".join(reversed(base36))


class SessionStore:
    """在线会话与消息 SQLite 仓储层，写锁保护防数据库死锁。"""

    def __init__(self):
        self._write_lock = asyncio.Lock()

    @staticmethod
    def _now_iso() -> str:
        """获取当前带本地时区偏移的 ISO 8601 时间戳。"""
        return datetime.now().astimezone().isoformat(timespec="seconds")

    async def create_session(self, session_id: Optional[str] = None, title: str = "新会话") -> dict:
        """在 sessions 表中插入新会话并返回该会话字典。"""
        sid = session_id or generate_online_session_id()
        now = self._now_iso()
        db = get_db()
        async with self._write_lock:
            await db.execute(
                "INSERT INTO sessions (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)",
                (sid, title, now, now),
            )
            await db.commit()

        logger.info("Created online session: id=%s title=%r", sid, title)
        return {
            "id": sid,
            "title": title,
            "created_at": now,
            "updated_at": now,
        }

    async def get_sessions(self) -> list[dict]:
        """获取所有在线会话列表，严格按 updated_at 降序排列。"""
        db = get_db()
        async with db.execute(
            "SELECT id, title, created_at, updated_at FROM sessions ORDER BY updated_at DESC"
        ) as cursor:
            rows = await cursor.fetchall()
            return [
                {
                    "id": row["id"],
                    "title": row["title"],
                    "created_at": row["created_at"],
                    "updated_at": row["updated_at"],
                }
                for row in rows
            ]

    async def get_session(self, session_id: str) -> Optional[dict]:
        """根据 session_id 获取单个会话信息，不存在时返回 None。"""
        db = get_db()
        async with db.execute(
            "SELECT id, title, created_at, updated_at FROM sessions WHERE id = ?",
            (session_id,),
        ) as cursor:
            row = await cursor.fetchone()
            if not row:
                return None
            return {
                "id": row["id"],
                "title": row["title"],
                "created_at": row["created_at"],
                "updated_at": row["updated_at"],
            }

    async def rename_session(self, session_id: str, new_title: str) -> Optional[dict]:
        """重命名指定会话，同时刷新 updated_at 并返回最新对象。"""
        db = get_db()
        now = self._now_iso()
        async with self._write_lock:
            cursor = await db.execute(
                "UPDATE sessions SET title = ?, updated_at = ? WHERE id = ?",
                (new_title, now, session_id),
            )
            await db.commit()
            if cursor.rowcount == 0:
                return None

        return await self.get_session(session_id)

    async def delete_session(self, session_id: str) -> bool:
        """删除指定会话，依靠外键 ON DELETE CASCADE 自动级联清理消息与任务。"""
        db = get_db()
        async with self._write_lock:
            cursor = await db.execute(
                "DELETE FROM sessions WHERE id = ?",
                (session_id,),
            )
            await db.commit()
            deleted = cursor.rowcount > 0
            if deleted:
                logger.info("Deleted online session: %s", session_id)
            return deleted

    async def get_messages(self, session_id: str) -> list[dict]:
        """获取指定会话的历史消息，按 seq 升序排列，并依据 error_code 填充 error_message。"""
        db = get_db()
        async with db.execute(
            "SELECT seq, id, role, content, status, error_code, created_at FROM messages "
            "WHERE session_id = ? ORDER BY seq ASC",
            (session_id,),
        ) as cursor:
            rows = await cursor.fetchall()
            result = []
            for row in rows:
                err_code = row["error_code"]
                err_msg = ERROR_MESSAGES.get(err_code) if err_code else None
                result.append(
                    {
                        "seq": row["seq"],
                        "id": row["id"],
                        "role": row["role"],
                        "content": row["content"],
                        "status": row["status"],
                        "error_code": err_code,
                        "error_message": err_msg,
                        "created_at": row["created_at"],
                    }
                )
            return result

    async def create_turn_and_task(
        self,
        session_id: str,
        user_msg_id: str,
        user_content: str,
        assistant_msg_id: str,
        task_id: str,
    ) -> dict:
        """单事务原子写入用户消息、助手占位消息、generation_tasks 记录并更新会话时间。"""
        db = get_db()
        now = self._now_iso()
        async with self._write_lock:
            # 1. 插入用户消息
            await db.execute(
                "INSERT INTO messages (id, session_id, role, content, status, error_code, created_at) "
                "VALUES (?, ?, 'user', ?, 'done', NULL, ?)",
                (user_msg_id, session_id, user_content, now),
            )
            # 2. 插入初始助手占位消息
            await db.execute(
                "INSERT INTO messages (id, session_id, role, content, status, error_code, created_at) "
                "VALUES (?, ?, 'assistant', '', 'streaming', NULL, ?)",
                (assistant_msg_id, session_id, now),
            )
            # 3. 插入 generation_tasks 记录
            await db.execute(
                "INSERT INTO generation_tasks (task_id, session_id, message_id, status, created_at, updated_at) "
                "VALUES (?, ?, ?, 'running', ?, ?)",
                (task_id, session_id, assistant_msg_id, now, now),
            )
            # 4. 更新会话 updated_at
            await db.execute(
                "UPDATE sessions SET updated_at = ? WHERE id = ?",
                (now, session_id),
            )
            await db.commit()

        return {
            "task_id": task_id,
            "session_id": session_id,
            "user_message_id": user_msg_id,
            "assistant_message_id": assistant_msg_id,
            "status": "running",
        }

    async def update_message_stream(self, message_id: str, content: str) -> None:
        """流式生成期间节流更新助手消息已生成文本。"""
        db = get_db()
        async with self._write_lock:
            await db.execute(
                "UPDATE messages SET content = ? WHERE id = ?",
                (content, message_id),
            )
            await db.commit()

    async def finalize_generation(
        self,
        task_id: str,
        message_id: str,
        content: str,
        message_status: str,
        task_status: str,
        error_code: Optional[str] = None,
    ) -> None:
        """生成结束、中断或失败时单事务原子更新 messages、generation_tasks 与会话时间。"""
        db = get_db()
        now = self._now_iso()
        async with self._write_lock:
            # 1. 更新消息终态与错误码
            await db.execute(
                "UPDATE messages SET content = ?, status = ?, error_code = ? WHERE id = ?",
                (content, message_status, error_code, message_id),
            )
            # 2. 更新任务状态
            await db.execute(
                "UPDATE generation_tasks SET status = ?, updated_at = ? WHERE task_id = ?",
                (task_status, now, task_id),
            )
            # 3. 刷新对应会话的 updated_at
            await db.execute(
                "UPDATE sessions SET updated_at = ? WHERE id = ("
                "  SELECT session_id FROM messages WHERE id = ?"
                ")",
                (now, message_id),
            )
            await db.commit()

    async def recover_interrupted_tasks(self) -> int:
        """服务启动补偿扫描：将数据库中残留的 streaming 消息与 running 任务置为 interrupted。"""
        db = get_db()
        now = self._now_iso()
        async with self._write_lock:
            c1 = await db.execute(
                "UPDATE messages SET status = 'interrupted' WHERE status = 'streaming'"
            )
            c2 = await db.execute(
                "UPDATE generation_tasks SET status = 'interrupted', updated_at = ? WHERE status = 'running'",
                (now,),
            )
            await db.commit()
            count = c1.rowcount + c2.rowcount
            if count > 0:
                logger.warning(
                    "Recovered interrupted tasks on startup: messages=%d tasks=%d",
                    c1.rowcount,
                    c2.rowcount,
                )
            return count


# 全局单例仓储
session_store = SessionStore()
