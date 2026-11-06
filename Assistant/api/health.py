"""健康检查路由模块。"""

from datetime import datetime

from fastapi import APIRouter

from ..agent.factory import get_agent
from ..config import APP_VERSION

router = APIRouter()


@router.get("/api/health")
async def get_health() -> dict[str, str]:
    """返回服务健康状态、版本号、当前 Agent 名称与本地时间。"""
    now_iso = datetime.now().astimezone().isoformat(timespec="seconds")
    agent = get_agent()
    return {
        "status": "ok",
        "version": APP_VERSION,
        "agent": agent.name,
        "time": now_iso,
    }
