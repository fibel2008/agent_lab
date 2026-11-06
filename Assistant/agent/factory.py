"""Agent 单例工厂模块，作为切换后端 Agent 实现的唯一替换点。"""

from .base import Agent
from .mock_agent import MockAgent

_agent_instance: Agent | None = None


def get_agent() -> Agent:
    """获取全局 Agent 实例；后续替换真实大模型时仅需在此处更改实现类。"""
    global _agent_instance
    if _agent_instance is None:
        _agent_instance = MockAgent()
    return _agent_instance
