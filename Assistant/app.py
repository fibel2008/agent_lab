"""FastAPI 应用装配：路由注册、缓存控制中间件与静态资源托管。"""

from collections.abc import Awaitable, Callable

from fastapi import FastAPI, Request, Response
from fastapi.staticfiles import StaticFiles

from .api.health import router as health_router
from .config import APP_VERSION, WEB_DIR


def create_app() -> FastAPI:
    """创建并装配 FastAPI 应用实例。"""
    application = FastAPI(
        title="Agent 学习助手",
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
        """对非 /api 的 GET 响应设置 Cache-Control: no-cache。"""
        response = await call_next(request)
        if request.method == "GET" and not request.url.path.startswith("/api"):
            response.headers["Cache-Control"] = "no-cache"
        return response

    application.include_router(health_router)
    application.mount("/", StaticFiles(directory=str(WEB_DIR), html=True), name="web")
    return application


app = create_app()
