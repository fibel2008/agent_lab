"""应用常量与环境变量配置模块。"""

import logging
import os
from pathlib import Path

APP_VERSION = "0.2.0"
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


def _resolve_host() -> str:
    """读取并校验绑定地址，强制限制环回地址以确保本机安全。"""
    raw_host = os.environ.get("ASSISTANT_HOST", "").strip() or "127.0.0.1"
    allowed_hosts = ("127.0.0.1", "localhost", "::1")
    if raw_host.lower() not in allowed_hosts:
        logger.warning(
            "环境变量 ASSISTANT_HOST=%r 不在允许的环回地址白名单 %r 内，强制回退至 127.0.0.1",
            raw_host,
            allowed_hosts,
        )
        return "127.0.0.1"
    return raw_host


HOST: str = _resolve_host()
PORT: int = _read_int_env("ASSISTANT_PORT", 8000, min_value=1)
STREAM_DELAY_MS: int = _read_int_env("ASSISTANT_STREAM_DELAY_MS", 20, min_value=0)
CHUNK_SIZE: int = _read_int_env("ASSISTANT_CHUNK_SIZE", 1, min_value=1)
OPEN_BROWSER: bool = os.environ.get("ASSISTANT_OPEN_BROWSER", "").strip().lower() in ("1", "true", "yes")

API_KEY: str = os.environ.get("ASSISTANT_API_KEY", "").strip()
BASE_URL: str = (os.environ.get("ASSISTANT_BASE_URL", "").strip().rstrip("/")) or "https://api.openai.com/v1"
MODEL: str = os.environ.get("ASSISTANT_MODEL", "").strip() or "gpt-4o-mini"
REQUEST_TIMEOUT: int = _read_int_env("ASSISTANT_REQUEST_TIMEOUT", 60, min_value=5)

DB_PATH: Path = Path(
    os.environ.get("ASSISTANT_DB_PATH", "").strip()
    or (Path(__file__).resolve().parent.parent / "data" / "emibot.db")
).resolve()

# 3.6 全局错误码与提示文案映射表（System Error Code Registry）唯一事实来源
ERROR_MESSAGES: dict[str, str] = {
    "NO_API_KEY": "未检测到模型密钥，请在本地环境变量配置并重启服务后重试。",
    "AUTH_FAILED": "模型密钥鉴权失败，请检查本地配置的 API Key 是否有效。",
    "QUOTA_EXCEEDED": "模型服务商额度已耗尽或请求过于频繁，请稍后再试。",
    "NETWORK_ERROR": "网络连接异常，无法访问模型服务商，请检查网络连接或代理设置。",
    "TIMEOUT": "连接模型服务商超时，请检查您的网络连接与代理设置。",
    "UPSTREAM_ERROR": "模型服务商返回异常，请检查模型与端点配置或稍后重试。",
    "INTERNAL_ERROR": "生成过程发生异常，请重试。",
}
