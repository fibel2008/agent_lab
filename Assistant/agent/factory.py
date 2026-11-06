"""Agent 单例工厂模块，作为切换后端 Agent 实现的唯一替换点。"""

from typing import Literal

from .base import Agent
from .mock_agent import MockAgent
from .online_agent import OnlineAgent

_offline_agent: Agent | None = None
_online_agent: Agent | None = None


def get_agent(mode: Literal["offline", "online"] = "offline") -> Agent:
    """获取对应形态的全局 Agent 单例实例。"""
    global _offline_agent, _online_agent
    if mode == "online":
        if _online_agent is None:
            _online_agent = OnlineAgent()
        return _online_agent

    if _offline_agent is None:
        _offline_agent = MockAgent()
    return _offline_agent
