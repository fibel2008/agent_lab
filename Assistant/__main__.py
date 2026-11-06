"""启动入口模块：支持 python -m Assistant 启动服务。"""

import sys

import uvicorn


def main() -> None:
    """配置控制台 UTF-8 编码并启动 Uvicorn 服务。"""
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8")

    from .app import app
    from .config import HOST, PORT

    print(f"Emibot 已启动：http://{HOST}:{PORT}", flush=True)
    uvicorn.run(app, host=HOST, port=PORT, log_level="info")


if __name__ == "__main__":
    main()
