"""FastAPI 应用装配：路由注册、缓存控制中间件与静态资源托管。"""

from collections.abc import Awaitable, Callable
import mimetypes

from fastapi import FastAPI, Request, Response
from fastapi.staticfiles import StaticFiles

from .api.chat import router as chat_router
from .api.health import router as health_router
from .config import APP_VERSION, WEB_DIR

mimetypes.add_type("text/javascript", ".js")
mimetypes.add_type("text/css", ".css")
mimetypes.add_type("image/svg+xml", ".svg")


def create_app() -> FastAPI:
    """创建并装配 FastAPI 应用实例。"""
    application = FastAPI(
        title="Emibot",
        version=APP_VERSION,
        docs_url=None,
        redoc_url=None,
        openapi_url="/api/openapi.json",
    )

    @application.middleware("http")
    async def no_cache_static_middleware(
        request: Request,
        call_next: Callable[[Request], Awaitable[Response]],
    ) -> Response:
        """对非 /api 的 GET 请求剥离条件缓存头并返回 no-store，杜绝 304 复用旧响应。"""
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

    application.include_router(health_router)
    application.include_router(chat_router)
    application.mount("/", StaticFiles(directory=str(WEB_DIR), html=True), name="web")
    return application


app = create_app()
