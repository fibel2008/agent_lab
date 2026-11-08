"""附件读取工具 (read_attachment) 实现与安全沙箱执行。"""

import contextvars
from pathlib import Path
from typing import Optional

from Assistant import config
from Assistant.storage.session_store import session_store
from .base import BaseTool
from .parsers.doc_parser import parse_docx, parse_pptx, parse_xlsx
from .parsers.pdf_parser import parse_pdf
from .parsers.text_parser import parse_text_or_code

# 会话上下文隔离变量，防止跨会话工具执行越权
current_session_id_ctx: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "current_session_id_ctx", default=None
)


class ReadAttachmentTool(BaseTool):
    """读取当前会话用户附件的文本内容工具。"""

    name: str = "read_attachment"
    description: str = (
        "读取当前会话中用户上传的非图片附件（Word、Excel、PPT、文字版 PDF、文本及代码文件）的文本内容。"
    )
    parameters: dict = {
        "type": "object",
        "properties": {
            "attachment_id": {
                "type": "string",
                "description": "待读取的附件唯一标识 ID",
            }
        },
        "required": ["attachment_id"],
    }

    async def execute(
        self,
        attachment_id: str,
        session_id: Optional[str] = None,
        **kwargs,
    ) -> str:
        """执行附件读取并返回解析后的观察文本。"""
        active_session_id = session_id or current_session_id_ctx.get()

        # 1. 查询数据库记录
        record = await session_store.get_attachment(attachment_id)
        if not record:
            return "[错误：未在当前会话中找到该附件]"

        # 2. 会话权限沙箱校验：严禁跨会话越权
        if active_session_id and record["session_id"] != active_session_id:
            return "[错误：未在当前会话中找到该附件]"

        file_path: Path = record["storage_path"]
        if not file_path.is_file():
            return "[读取失败：文件已不存在]"

        # 3. 按文件扩展名分发至对应解析器
        ext = file_path.suffix.lower()
        if ext == ".docx":
            return parse_docx(file_path)
        if ext == ".xlsx":
            return parse_xlsx(file_path)
        if ext == ".pptx":
            return parse_pptx(file_path)
        if ext == ".pdf":
            return parse_pdf(file_path)
        if ext in (config.TEXT_ATTACHMENT_EXTS | config.CODE_ATTACHMENT_EXTS):
            return parse_text_or_code(file_path)

        return "[读取失败：文件已加密、损坏或编码不受支持]"


# 全局单例工具
read_attachment_tool = ReadAttachmentTool()
