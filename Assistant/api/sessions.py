"""RESTful 在线会话与消息管理接口。"""

from fastapi import APIRouter, HTTPException, status

from ..agent.task_manager import task_manager
from ..storage.session_store import session_store
from .schemas import (
    CreateSessionRequest,
    MessageResponse,
    RenameSessionRequest,
    SendMessageRequest,
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
    """删除指定会话及关联的所有消息与任务。"""
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
    status_code=status.HTTP_200_OK,
)
async def send_session_message(
    session_id: str,
    request: SendMessageRequest,
) -> dict:
    """在指定在线会话中发送新消息，异步触发后台持续生成。"""
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

    try:
        task = await task_manager.start_generation(
            session_id=session_id,
            user_content=request.content,
            store=session_store,
        )
        return {
            "task_id": task.task_id,
            "message_id": task.message_id,
            "status": "running",
        }
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(exc),
        )
