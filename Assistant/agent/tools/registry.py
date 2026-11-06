"""工具注册中心模块。"""

from typing import Optional

from .base import BaseTool


class ToolRegistry:
    """全局工具注册中心，作为后续工具与技能的统一入口。"""

    def __init__(self) -> None:
        self._tools: dict[str, BaseTool] = {}

    def register(self, tool: BaseTool) -> None:
        """向注册中心登记工具实例。"""
        self._tools[tool.name] = tool

    def get(self, name: str) -> Optional[BaseTool]:
        """根据名称获取工具实例。"""
        return self._tools.get(name)

    def list_tools(self) -> list[dict]:
        """以标准 OpenAI Tool 规范格式返回所有已注册工具元数据。"""
        tools_schema: list[dict] = []
        for tool in self._tools.values():
            tools_schema.append(
                {
                    "type": "function",
                    "function": {
                        "name": tool.name,
                        "description": tool.description,
                        "parameters": tool.parameters,
                    },
                }
            )
        return tools_schema

    def is_empty(self) -> bool:
        """检查当前注册中心是否为空；第二版初始状态恒为空。"""
        return len(self._tools) == 0

    def clear(self) -> None:
        """清空所有注册工具（主要用于测试）。"""
        self._tools.clear()


tool_registry = ToolRegistry()
