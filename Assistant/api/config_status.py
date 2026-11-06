"""系统配置状态与密钥就绪探测接口模块。"""

from fastapi import APIRouter

from ..config import API_KEY, MODEL
from ..storage.db import get_db
from .schemas import ConfigStatusResponse

router = APIRouter()


@router.get("/api/config/status", response_model=ConfigStatusResponse)
async def get_config_status() -> dict:
    """探测本机环境是否具备在线能力，完全屏蔽敏感密钥内容。"""
    has_key = bool(API_KEY and API_KEY.strip())
    db_connected = False
    try:
        conn = get_db()
        db_connected = conn is not None
    except Exception:
        db_connected = False

    return {
        "has_api_key": has_key,
        "provider": "openai-compatible",
        "model": MODEL,
        "storage": "sqlite",
        "db_connected": db_connected,
    }
