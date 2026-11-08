"""附件预览与系统默认关联应用调起接口及缓存管理。"""

import mimetypes
import os
from pathlib import Path
import re

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse, JSONResponse

from Assistant import config
from Assistant.config import ERROR_MESSAGES, logger
from Assistant.storage.session_store import generate_attachment_id, session_store

router = APIRouter()

# 内存全局缓存字典，用于记录 Mock 模式下上传的附件元数据
cache_attachments: dict[str, dict] = {}


def clear_cache_attachments() -> None:
    """清空内存中的全局附件缓存。"""
    cache_attachments.clear()


@router.post("/api/attachments/cache")
async def upload_cache_attachments(
    files: list[UploadFile] = File(default=[]),
) -> JSONResponse:
    """Mock 模式附件缓存写入接口：校验格式与大小并写入缓存目录，记录元数据。"""
    if len(files) > config.MAX_ATTACHMENT_COUNT:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                "code": "ATTACHMENT_COUNT_EXCEEDED",
                "message": config.ERROR_MESSAGES["ATTACHMENT_COUNT_EXCEEDED"],
            },
        )

    # 格式与大小校验
    for f in files:
        filename = f.filename or ""
        ext = Path(filename).suffix.lower()
        if ext not in config.ALLOWED_ATTACHMENT_EXTS:
            return JSONResponse(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                content={
                    "code": "ATTACHMENT_TYPE_NOT_SUPPORTED",
                    "message": config.ERROR_MESSAGES["ATTACHMENT_TYPE_NOT_SUPPORTED"],
                },
            )
        f.file.seek(0, 2)
        size = f.file.tell()
        f.file.seek(0)
        if size > config.MAX_ATTACHMENT_SIZE:
            return JSONResponse(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                content={
                    "code": "ATTACHMENT_TOO_LARGE",
                    "message": config.ERROR_MESSAGES["ATTACHMENT_TOO_LARGE"],
                },
            )

    config.ATTACHMENT_CACHE_DIR.mkdir(parents=True, exist_ok=True)
    attachments_res: list[dict] = []

    for f in files:
        att_id = generate_attachment_id()
        safe_name = Path(f.filename or "file").name
        safe_name = re.sub(r'[/\\?%*:|"<>]', '_', safe_name)
        dest_name = f"{att_id}_{safe_name}"
        storage_path = config.ATTACHMENT_CACHE_DIR / dest_name

        content_bytes = await f.read()
        with open(storage_path, "wb") as out_f:
            out_f.write(content_bytes)

        size = len(content_bytes)
        ext = Path(safe_name).suffix.lower()
        file_type = ext.lstrip(".")
        is_img = ext in config.IMAGE_ATTACHMENT_EXTS

        meta = {
            "id": att_id,
            "filename": safe_name,
            "file_type": file_type,
            "file_size": size,
            "storage_path": storage_path,
            "is_image": is_img,
        }
        cache_attachments[att_id] = meta
        attachments_res.append({
            "id": att_id,
            "filename": safe_name,
            "file_type": file_type,
            "file_size": size,
            "is_image": is_img,
        })

    return JSONResponse(
        status_code=status.HTTP_200_OK,
        content={"attachments": attachments_res},
    )


@router.post("/api/attachments/{attachment_id}/open")
async def open_attachment(attachment_id: str) -> JSONResponse:
    """调起系统默认应用打开本地存储目录中的附件副本（优先在线会话，回退缓存）。"""
    record = await session_store.get_attachment(attachment_id)
    if not record:
        record = cache_attachments.get(attachment_id)
    if not record:
        return JSONResponse(
            status_code=status.HTTP_404_NOT_FOUND,
            content={
                "code": "ATTACHMENT_NOT_FOUND",
                "message": ERROR_MESSAGES["ATTACHMENT_NOT_FOUND"],
            },
        )

    file_path = Path(record["storage_path"])
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
    """提供图片附件的缩略图加载预览接口（优先在线会话，回退缓存）。"""
    record = await session_store.get_attachment(attachment_id)
    if not record:
        record = cache_attachments.get(attachment_id)
    if not record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="附件不存在",
        )

    file_path = Path(record["storage_path"])
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
