"""应用常量与环境变量配置模块。"""

import logging
import os
from pathlib import Path

APP_VERSION = "0.1.0"
MAX_MESSAGES = 30
MAX_MESSAGE_CHARS = 4000
WEB_DIR = Path(__file__).resolve().parent / "web"

logger = logging.getLogger("assistant")


def _configure_logger() -> None:
    """初始化 assistant 日志记录器格式。"""
    if not logger.handlers:
        handler = logging.StreamHandler()
        formatter = logging.Formatter(
            "%(asctime)s %(levelname)s %(name)s %(message)s",
            datefmt="%Y-%m-%d %H:%M:%S",
        )
        handler.setFormatter(formatter)
        logger.addHandler(handler)
        logger.setLevel(logging.INFO)
        logger.propagate = False


_configure_logger()


def _read_int_env(name: str, default: int, min_value: int = 0) -> int:
    """读取整数环境变量，非法值或小于下限时回退默认值并打印警告。"""
    raw = os.environ.get(name)
    if raw is None:
        return default
    text = raw.strip()
    if not text:
        logger.warning("环境变量 %s 为空，回退默认值 %d", name, default)
        return default
    try:
        value = int(text)
    except ValueError:
        logger.warning("环境变量 %s=%r 不是有效整数，回退默认值 %d", name, raw, default)
        return default
    if value < min_value:
        logger.warning("环境变量 %s=%d 小于允许最小值 %d，回退默认值 %d", name, value, min_value, default)
        return default
    return value


HOST: str = os.environ.get("ASSISTANT_HOST", "").strip() or "127.0.0.1"
PORT: int = _read_int_env("ASSISTANT_PORT", 8000, min_value=1)
STREAM_DELAY_MS: int = _read_int_env("ASSISTANT_STREAM_DELAY_MS", 20, min_value=0)
CHUNK_SIZE: int = _read_int_env("ASSISTANT_CHUNK_SIZE", 1, min_value=1)
OPEN_BROWSER: bool = os.environ.get("ASSISTANT_OPEN_BROWSER", "").strip().lower() in ("1", "true", "yes")
