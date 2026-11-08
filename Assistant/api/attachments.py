"""附件预览与系统默认关联应用调起接口。"""

import mimetypes
import os
from pathlib import Path

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import FileResponse, JSONResponse

from Assistant.config import ERROR_MESSAGES, logger
from Assistant.storage.session_store import session_store

router = APIRouter()


@router.post("/api/attachments/{attachment_id}/open")
async def open_attachment(attachment_id: str) -> JSONResponse:
    """调起 Windows 系统默认应用打开本地存储目录中的附件副本。"""
    record = await session_store.get_attachment(attachment_id)
    if not record:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={
                "code": "ATTACHMENT_NOT_FOUND",
                "message": ERROR_MESSAGES["ATTACHMENT_NOT_FOUND"],
            },
        )

    file_path: Path = record["storage_path"]
    if not file_path.is_file():
        logger.warning("附件副本物理文件不存在: id=%s, path=%s", attachment_id, file_path)
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={
                "code": "ATTACHMENT_NOT_FOUND",
                "message": ERROR_MESSAGES["ATTACHMENT_NOT_FOUND"],
            },
        )

    try:
        # 在 Windows 环境下异步调用系统默认关联程序打开物理文件
        resolved_path = str(file_path.resolve())
        if hasattr(os, "startfile"):
            os.startfile(resolved_path)
        else:
            # 非 Windows 平台（如 Linux/CI 测试环境）备用降级
            import subprocess
            subprocess.Popen(["xdg-open", resolved_path])
        logger.info("已通过系统默认程序打开附件: id=%s, path=%s", attachment_id, resolved_path)
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={"status": "opened"},
        )
    except Exception as exc:
        logger.exception("调用系统默认应用打开附件失败: id=%s, err=%s", attachment_id, exc)
        return JSONResponse(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            content={"detail": f"打开文件失败: {exc}"},
        )


@router.get("/api/attachments/{attachment_id}/preview")
async def preview_attachment(attachment_id: str) -> FileResponse:
    """提供图片附件的缩略图加载预览接口。"""
    record = await session_store.get_attachment(attachment_id)
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="附件不存在",
        )

    file_path: Path = record["storage_path"]
    if not file_path.is_file():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="附件物理文件已不存在",
        )

    content_type, _ = mimetypes.guess_type(str(file_path))
    media_type = content_type or "application/octet-stream"

    return FileResponse(
        path=str(file_path.resolve()),
        media_type=media_type,
        headers={"Cache-Control": "public, max-age=86400"},
    )
