"""RESTful 在线会话与消息管理接口。"""

from pathlib import Path
import re
from typing import Optional

from fastapi import APIRouter, File, Form, HTTPException, Request, status
from fastapi.responses import JSONResponse
from starlette.datastructures import UploadFile

from Assistant import config
from Assistant.config import logger
from Assistant.agent.errors import LLMError
from Assistant.agent.llm_client import LLMClient
from Assistant.agent.task_manager import task_manager
from Assistant.storage.session_store import generate_attachment_id, session_store
from .schemas import (
    CreateSessionRequest,
    MessageResponse,
    RenameSessionRequest,
    SendOnlineMessageResponse,
    SessionResponse,
)

router = APIRouter()


@router.get("/api/sessions", response_model=list[SessionResponse])
async def list_sessions() -> list[dict]:
    """获取所有在线会话列表，严格按 updated_at 降序排列。"""
    return await session_store.get_sessions()


@router.post(
    "/api/sessions",
    response_model=SessionResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_session(request: CreateSessionRequest) -> dict:
    """创建新的在线会话。"""
    return await session_store.create_session(
        session_id=request.id,
        title=request.title,
    )


@router.patch("/api/sessions/{session_id}", response_model=SessionResponse)
async def rename_session(session_id: str, request: RenameSessionRequest) -> dict:
    """重命名指定在线会话，更新 updated_at。"""
    updated = await session_store.rename_session(
        session_id=session_id,
        new_title=request.title,
    )
    if updated is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"会话 {session_id} 不存在",
        )
    return updated


@router.delete(
    "/api/sessions/{session_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_session(session_id: str) -> None:
    """删除指定会话及关联的所有消息、任务与磁盘附件副本。"""
    # 先等待该会话可能正在运行的任务彻底中断并落盘
    await task_manager.abort_session(session_id)
    await session_store.delete_session(session_id)
    return None


@router.get(
    "/api/sessions/{session_id}/messages",
    response_model=list[MessageResponse],
)
async def get_session_messages(session_id: str) -> list[dict]:
    """获取指定会话的历史消息列表，严格按 seq 升序排列。"""
    session = await session_store.get_session(session_id)
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"会话 {session_id} 不存在",
        )
    return await session_store.get_messages(session_id)


@router.post(
    "/api/sessions/{session_id}/messages",
    response_model=SendOnlineMessageResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
async def send_session_message(
    session_id: str,
    request: Request,
) -> JSONResponse:
    """在指定在线会话中发送新消息与附件，异步触发后台持续生成。"""
    session = await session_store.get_session(session_id)
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"会话 {session_id} 不存在",
        )

    # 409 同步槽位防穿透
    if task_manager.is_session_busy(session_id):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="该会话已有正在进行的生成任务",
        )

    content_type = request.headers.get("content-type", "")
    content: str = ""
    files: list[UploadFile] = []
    is_json = False

    if "application/json" in content_type:
        is_json = True
        try:
            body = await request.json()
            content = body.get("content", "")
        except Exception:
            raise HTTPException(status_code=400, detail="无效的 JSON 请求体")
    elif "multipart/form-data" in content_type:
        form = await request.form()
        raw_content = form.get("content", "")
        if isinstance(raw_content, str):
            content = raw_content
        raw_files = form.getlist("files")
        for item in raw_files:
            if hasattr(item, "filename") and item.filename:
                files.append(item)
    else:
        raise HTTPException(status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, detail="不支持的请求类型")

    content_stripped = content.strip()
    if not content_stripped and not files:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="消息内容与附件不能同时为空")

    if len(content) > config.MAX_MESSAGE_CHARS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"消息内容长度超出 {config.MAX_MESSAGE_CHARS} 字符限制",
        )

    # 附件数量上限校验
    if len(files) > config.MAX_ATTACHMENT_COUNT:
        return JSONResponse(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            content={
                "code": "ATTACHMENT_COUNT_EXCEEDED",
                "message": config.ERROR_MESSAGES["ATTACHMENT_COUNT_EXCEEDED"],
            },
        )

    # 单附件规格校验（格式白名单与大小）
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

    # 图片模型视觉能力探测与拦截 (B1.14)
    has_image = any(
        Path(f.filename or "").suffix.lower() in config.IMAGE_ATTACHMENT_EXTS
        for f in files
    )
    if has_image:
        llm = LLMClient()
        try:
            supported = await llm.check_model_vision_support()
            if not supported:
                return JSONResponse(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    content={
                        "code": "IMAGE_NOT_SUPPORTED",
                        "message": config.ERROR_MESSAGES["IMAGE_NOT_SUPPORTED"],
                    },
                )
        except LLMError as exc:
            return JSONResponse(
                status_code=status.HTTP_400_BAD_REQUEST,
                content={"code": exc.code, "message": exc.message},
            )

    # 物理落盘
    attachments_data: list[dict] = []
    attachments_res: list[dict] = []
    if files:
        session_dir = config.ATTACHMENT_DIR / session_id
        session_dir.mkdir(parents=True, exist_ok=True)
        for f in files:
            att_id = generate_attachment_id()
            safe_name = Path(f.filename or "file").name
            safe_name = re.sub(r'[/\\?%*:|"<>]', '_', safe_name)
            dest_name = f"{att_id}_{safe_name}"
            storage_path = session_dir / dest_name
            content_bytes = await f.read()
            with open(storage_path, "wb") as out_f:
                out_f.write(content_bytes)

            size = len(content_bytes)
            ext = Path(safe_name).suffix.lower()
            file_type = ext.lstrip(".")
            is_img = ext in config.IMAGE_ATTACHMENT_EXTS

            att_item = {
                "id": att_id,
                "filename": safe_name,
                "file_type": file_type,
                "file_size": size,
                "storage_path": storage_path,
                "is_image": is_img,
            }
            attachments_data.append(att_item)
            attachments_res.append({
                "id": att_id,
                "filename": safe_name,
                "file_type": file_type,
                "file_size": size,
                "is_image": is_img,
            })

    try:
        task = await task_manager.start_generation(
            session_id=session_id,
            user_content=content,
            store=session_store,
            attachments=attachments_data,
        )
        resp_status = status.HTTP_200_OK if is_json else status.HTTP_202_ACCEPTED
        return JSONResponse(
            status_code=resp_status,
            content={
                "task_id": task.task_id,
                "session_id": session_id,
                "user_message_id": task.user_msg_id,
                "assistant_message_id": task.message_id,
                "attachments": attachments_res,
                "status": "running",
            },
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        )
