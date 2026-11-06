"""RESTful 在线会话与消息管理接口。"""

from fastapi import APIRouter, HTTPException, status

from ..storage.session_store import session_store
from .schemas import (
    CreateSessionRequest,
    MessageResponse,
    RenameSessionRequest,
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
