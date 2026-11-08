"""FastAPI 应用装配：路由注册、安全与缓存中间件、生命周期管理与静态资源托管。"""

from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
import mimetypes
from urllib.parse import urlparse

from fastapi import FastAPI, Request, Response, status
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from .agent.task_manager import task_manager
from .agent.tools import read_attachment_tool, tool_registry
from .api.attachments import router as attachments_router
from .api.chat import router as chat_router
from .api.config_status import router as config_status_router
from .api.health import router as health_router
from .api.sessions import router as sessions_router
from .config import APP_VERSION, WEB_DIR, logger
from .storage.db import close_db, init_db
from .storage.session_store import session_store

mimetypes.add_type("text/javascript", ".js")
mimetypes.add_type("text/css", ".css")
mimetypes.add_type("image/svg+xml", ".svg")

LOOPBACK_HOSTS = {"127.0.0.1", "localhost", "::1", "testserver"}


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """管理全局资源生命周期：启动初始化数据库与任务补偿扫描，关闭安全断开连接。"""
    logger.info("Initializing Emibot v%s runtime...", APP_VERSION)
    await init_db()
    await session_store.recover_interrupted_tasks()
    # 确保默认工具在启动时已向 ToolRegistry 注册
    tool_registry.register(read_attachment_tool)
    yield
    logger.info("Shutting down Emibot runtime...")
    await task_manager.shutdown()
    await close_db()


def create_app() -> FastAPI:
    """创建并装配 FastAPI 应用实例。"""
    application = FastAPI(
        title="Emibot",
        version=APP_VERSION,
        docs_url=None,
        redoc_url=None,
        openapi_url="/api/openapi.json",
        lifespan=lifespan,
    )

    @application.middleware("http")
    async def security_and_cache_middleware(
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        """安全白名单检查与静态资源缓存控制中间件。"""
        # 1. 跨站写保护：校验 /api/* 写操作的 Host 与 Origin 仅允许本机环回
        if request.url.path.startswith("/api") and request.method in ("POST", "PATCH", "DELETE", "PUT"):
            host_header = request.headers.get("host", "")
            host_name = host_header.split(":")[0].strip().lower()
            if host_name not in LOOPBACK_HOSTS:
                logger.warning("Rejected write request with disallowed Host: %r", host_header)
                return JSONResponse(
                    status_code=status.HTTP_403_FORBIDDEN,
                    content={"detail": "Forbidden: Non-loopback host"},
                )

            origin_header = request.headers.get("origin")
            if origin_header:
                try:
                    parsed = urlparse(origin_header)
                    origin_hostname = (parsed.hostname or "").lower()
                    if origin_hostname not in LOOPBACK_HOSTS:
                        logger.warning("Rejected write request with disallowed Origin: %r", origin_header)
                        return JSONResponse(
                            status_code=status.HTTP_403_FORBIDDEN,
                            content={"detail": "Forbidden: Non-loopback origin"},
                        )
                except Exception:
                    return JSONResponse(
                        status_code=status.HTTP_403_FORBIDDEN,
                        content={"detail": "Forbidden: Invalid origin header"},
                    )

        # 2. 静态资源缓存控制：对非 /api 的 GET 请求剥离条件缓存头并返回 no-store
        if request.method == "GET" and not request.url.path.startswith("/api"):
            request.scope["headers"] = [
                (k, v)
                for k, v in request.scope["headers"]
                if k.lower() not in (b"if-none-match", b"if-modified-since")
            ]

        response = await call_next(request)

        if request.method == "GET" and not request.url.path.startswith("/api"):
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"

        return response

    # 路由注册
    application.include_router(health_router)
    application.include_router(config_status_router)
    application.include_router(sessions_router)
    application.include_router(attachments_router)
    application.include_router(chat_router)

    # 静态资源托管
    application.mount("/", StaticFiles(directory=str(WEB_DIR), html=True), name="web")
    return application


app = create_app()
