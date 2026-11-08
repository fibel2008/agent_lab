"""SQLite 异步连接管理、模式初始化与生命周期维护。"""

import logging
from pathlib import Path
from typing import Optional

import aiosqlite

from ..config import DB_PATH, logger

_db_conn: Optional[aiosqlite.Connection] = None

SCHEMA_SQL = """
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;

CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
    seq INTEGER PRIMARY KEY AUTOINCREMENT,
    id TEXT NOT NULL UNIQUE,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('done', 'streaming', 'error', 'interrupted')),
    error_code TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS generation_tasks (
    task_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('running', 'completed', 'interrupted', 'failed')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    FOREIGN KEY(message_id) REFERENCES messages(id) ON DELETE CASCADE
);

-- 附件持久化表（B1.13 新增，随会话/消息级联删除）
CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    file_type TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    storage_path TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    FOREIGN KEY(message_id) REFERENCES messages(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_session_seq ON messages(session_id, seq);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON generation_tasks(status);
CREATE INDEX IF NOT EXISTS idx_attachments_session ON attachments(session_id);
CREATE INDEX IF NOT EXISTS idx_attachments_message ON attachments(message_id);
"""


async def init_db(db_path: Optional[Path] = None) -> aiosqlite.Connection:
    """初始化数据库目录、建立单一共享长连接并执行模式迁移。"""
    global _db_conn
    target_path = db_path or DB_PATH
    target_path.parent.mkdir(parents=True, exist_ok=True)

    if _db_conn is not None:
        return _db_conn

    conn = await aiosqlite.connect(str(target_path))
    conn.row_factory = aiosqlite.Row

    # 执行 PRAGMA 与建表 DDL
    await conn.execute("PRAGMA journal_mode = WAL;")
    await conn.execute("PRAGMA foreign_keys = ON;")
    await conn.execute("PRAGMA busy_timeout = 5000;")
    await conn.executescript(SCHEMA_SQL)
    await conn.commit()

    _db_conn = conn
    logger.info("SQLite database initialized at: %s", target_path)
    return _db_conn


def get_db() -> aiosqlite.Connection:
    """获取当前活动的应用级单一共享数据库连接。"""
    if _db_conn is None:
        raise RuntimeError("数据库未初始化，请先调用 init_db()")
    return _db_conn


async def close_db() -> None:
    """安全关闭共享数据库长连接。"""
    global _db_conn
    if _db_conn is not None:
        try:
            await _db_conn.close()
            logger.info("SQLite database connection closed")
        finally:
            _db_conn = None
