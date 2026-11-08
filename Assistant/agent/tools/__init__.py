"""工具抽象层导出模块与工具自动注册。"""

from .attachment_tool import ReadAttachmentTool, current_session_id_ctx, read_attachment_tool
from .base import BaseTool, ToolCall
from .registry import ToolRegistry, tool_registry

# 注册默认工具
tool_registry.register(read_attachment_tool)

__all__ = [
    "BaseTool",
    "ToolCall",
    "ToolRegistry",
    "tool_registry",
    "ReadAttachmentTool",
    "read_attachment_tool",
    "current_session_id_ctx",
]
