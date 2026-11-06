"""工具与技能预留抽象协议与调用实体定义。"""

from typing import Protocol
from pydantic import BaseModel


class ToolCall(BaseModel):
    """结构化工具调用模型。"""

    id: str
    name: str
    arguments: dict


class BaseTool(Protocol):
    """工具与技能预留抽象协议。"""

    name: str
    description: str
    parameters: dict

    async def execute(self, **kwargs) -> str:
        """执行工具逻辑并返回观察结果字符串。"""
        ...
