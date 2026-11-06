"""启动入口模块：支持 python -m Assistant 启动服务。"""

import sys
import threading
import time
import urllib.request
import webbrowser

import uvicorn


def _open_browser_when_ready(host: str, port: int) -> None:
    """后台轮询健康检查端点，服务就绪后自动弹出系统默认浏览器。"""
    health_url = f"http://{host}:{port}/api/health"
    app_url = f"http://{host}:{port}/"
    deadline = time.time() + 5.0
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(health_url, timeout=0.5) as resp:
                if resp.status == 200:
                    webbrowser.open(app_url)
                    return
        except Exception:
            time.sleep(0.1)


def main() -> None:
    """配置控制台 UTF-8 编码并启动 Uvicorn 服务。"""
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    if hasattr(sys.stderr, "reconfigure"):
        sys.stderr.reconfigure(encoding="utf-8")

    from .app import app
    from .config import HOST, OPEN_BROWSER, PORT

    print(f"Emibot 已启动：http://{HOST}:{PORT}", flush=True)
    if OPEN_BROWSER:
        threading.Thread(
            target=_open_browser_when_ready,
            args=(HOST, PORT),
            daemon=True,
        ).start()
    uvicorn.run(app, host=HOST, port=PORT, log_level="info")


if __name__ == "__main__":
    main()
