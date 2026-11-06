# Spec：Agent 学习助手

<!-- 文档职责：回答"具体怎么实现"。
     只写目录结构、模块划分、接口定义、界面规格、命名约定与验收步骤。
     不写项目目标（属于 Intent.md），不写开发过程日志（属于 Memory.md）。 -->

状态：第一版实现规格，2026-11-06 定稿。需求边界以 Intent.md 为准；实现与本文不一致时，先更新本文并在 Memory.md 记录理由，再改代码。

## 1. 设计原则与约束

1.1 单进程：一个 Python 进程同时提供 API 与前端静态资源，启动一条命令即可在浏览器访问。
1.2 零构建：前端文件保存即生效，不引入 npm、打包器、前端框架与 CSS 预处理器。
1.3 可替换：mock 回复集中在 agent 层，替换为真实模型时不改 API 协议与前端代码。
1.4 单一深色主题：所有颜色取自 CSS 变量，为后续浅色主题预留位置而不改组件。
1.5 离线自包含：不请求 CDN、远程字体、远程图片；图标使用内联 SVG。
1.6 本地单用户：只监听 `127.0.0.1`，不做鉴权、不做多用户。
1.7 技术基线：Python 3.12 虚拟环境，Windows 本机开发，现代 Chromium 或 Firefox 浏览器。
1.8 本文与 Intent.md 冲突时以 Intent.md 为准；本文只补充 Intent.md 明确交给 spec 决定的选型与实现细节。

## 2. 技术选型与理由

### 2.1 后端框架

2.1.1 参考对象：AstrBot 工作台后端使用 Quart + Hypercorn，形态是"单进程 ASGI 应用 + 同源静态托管"。
2.1.2 本项目选用 FastAPI + Uvicorn，保持同一架构形态，理由如下：
- `StreamingResponse` 直接支持 SSE，异步生成器就是回复流，不需要额外适配层；
- Pydantic 在请求进入 agent 前完成校验，非法输入不会污染业务代码；
- 是当前 LLM 应用与流式接口最主流的技术栈，后续接真实模型时可参考资料最多；
- 与 Python 3.12 兼容良好，安装体积小。
2.1.3 不选 Quart：与 AstrBot 形式完全一致，但生态与流式示例较少，收益仅是形式统一。
2.1.4 不选 Flask：WSGI 同步模型，SSE 需要线程或第三方扩展，与后续模型流式输出的方向不一致。
2.1.5 不选标准库 `http.server`：路由、校验、并发、流式响应全部手写，接入真实模型时大概率返工。
2.1.6 若之后必须与 AstrBot 完全一致，只需把 `Assistant/app.py` 的装配替换为 Quart；`/api/chat` 契约与前端代码不变。

### 2.2 前端形态

2.2.1 原生 HTML / CSS / JavaScript（ES Modules），由后端同源托管。
2.2.2 路由使用 URL hash：`#/chat`、`#/database`、`#/mail`、`#/device`、`#/settings`。
2.2.3 选 hash 路由的理由：不需要服务端 SPA fallback，刷新、直接打开、回退键都能工作；静态托管只需 `html=True`。
2.2.4 不使用 Vue / React / Svelte：第一版页面数量少，原生 DOM 足够；消息数据以对象组织，为将来迁移留出空间。

### 2.3 流式输出

2.3.1 采用后端 SSE 真流式：`POST /api/chat` 返回 `text/event-stream`，Python 端逐块推送，浏览器边收边渲染。
2.3.2 不用 `EventSource`：它只支持 GET，无法把消息历史放进请求体；改用 `fetch` + `ReadableStream` 手动解析 SSE。
2.3.3 不用 WebSocket：本场景只有服务端到客户端的单向增量，SSE 更简单，且天然支持 HTTP 状态码与错误体。
2.3.4 选 POST 而非 GET 的理由：消息历史可能较长，放进 URL 不安全也不稳定。

### 2.4 依赖与版本

2.4.1 `requirements.txt` 只包含两项直接依赖：

```
fastapi>=0.115,<1.0
uvicorn>=0.34,<1.0
```

2.4.2 不使用 `uvicorn[standard]`：避免 httptools、watchfiles 等原生扩展在 Windows 与 Python 3.12 上的安装风险；默认的 h11 实现足以支撑本项目的 SSE。
2.4.3 解释器版本固定为 3.12：本机默认 3.14，部分依赖兼容性未经确认，按 Memory.md 3.2 的决定使用 3.12 虚拟环境。

### 2.5 明确不引入

2.5.1 前端：Vue、React、Vite、TypeScript、Tailwind、Sass、jQuery、任何 CDN 资源。
2.5.2 后端：数据库、ORM、登录鉴权、任务队列、Redis、Docker。
2.5.3 工程：自动化测试框架、linter、格式化工具、CI。第一版以手工验收清单为准，测试在接入真实模型后再引入。

## 3. 运行方式与配置

### 3.1 首次安装

在项目根目录 `D:\desk\jyy\Lab1` 执行：

```powershell
py -V:Astral\CPython3.12.13 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

3.1.1 已验证：本机 `py -3.12` 报 "No runtime installed"，而 `py -V:Astral\CPython3.12.13` 输出 Python 3.12.13；若以后安装了标准 3.12，可改用 `py -3.12`。
3.1.2 兜底命令：`& "$env:APPDATA\uv\python\cpython-3.12.13-windows-x86_64-none\python.exe" -m venv .venv`。
3.1.3 不要求激活虚拟环境：文档统一使用 `.\.venv\Scripts\python.exe` 直接调用，避免 PowerShell 执行策略问题。

### 3.2 启动

```powershell
.\.venv\Scripts\python.exe -m Assistant
```

3.2.1 必须在项目根目录执行，`Assistant` 才能作为包被发现。
3.2.2 启动成功后打印一行：`Agent 学习助手已启动：http://127.0.0.1:8000`。
3.2.3 浏览器访问 `http://127.0.0.1:8000/`；健康检查为 `GET http://127.0.0.1:8000/api/health`。
3.2.4 不开启 `--reload`：第一版不引入文件监听依赖；修改前端后刷新浏览器即可，修改 Python 后重启进程。

### 3.3 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| `ASSISTANT_HOST` | `127.0.0.1` | 监听地址；只允许本机访问 |
| `ASSISTANT_PORT` | `8000` | 监听端口；被占用时改这里 |
| `ASSISTANT_STREAM_DELAY_MS` | `20` | 每个文本块之间的间隔毫秒数 |
| `ASSISTANT_CHUNK_SIZE` | `1` | 每个文本块包含的字符数 |

3.3.1 环境变量只在 `Assistant/config.py` 读取，其他模块从 config 导入，不在业务代码里重复读环境变量。
3.3.2 非法数字（空、非整数、负数）回退默认值，并在启动日志中打印一条警告。

### 3.4 日志与编码

3.4.1 使用标准库 `logging`，logger 名称为 `assistant`，格式为 `时间 级别 名称 消息`。
3.4.2 启动时将 `sys.stdout` 与 `sys.stderr` 重新配置为 UTF-8，避免 Windows 控制台把中文日志输出成乱码。
3.4.3 uvicorn 使用 info 级别，保留访问日志。
3.4.4 聊天请求只记录消息条数、最后一条用户消息的字符数、回复字符数与耗时，不打印消息正文。

### 3.5 静态缓存

3.5.1 对非 `/api` 的 GET 响应统一附加 `Cache-Control: no-cache`，保证 vibecoding 改动后刷新即生效。
3.5.2 不使用 Service Worker、localStorage、sessionStorage 存储聊天内容。

## 4. 目录结构

```
Lab1/
├── Assistant/
│   ├── __init__.py              包标记
│   ├── __main__.py              启动入口：python -m Assistant
│   ├── app.py                   FastAPI 装配：路由、静态托管、缓存策略
│   ├── config.py                常量与环境变量
│   ├── api/
│   │   ├── __init__.py
│   │   ├── health.py            GET /api/health
│   │   ├── chat.py              POST /api/chat（SSE）
│   │   └── schemas.py           请求与事件的数据模型
│   ├── agent/
│   │   ├── __init__.py
│   │   ├── base.py              ChatMessage 与 Agent 协议
│   │   ├── mock_agent.py        mock 回复的唯一生成位置
│   │   └── factory.py           唯一替换点：选哪个 Agent
│   └── web/
│       ├── index.html           应用外壳 + 内联 SVG 图标库
│       ├── css/
│       │   ├── tokens.css       设计令牌（颜色、圆角、间距、字号）
│       │   ├── base.css         reset、排版、滚动条、可访问性基础
│       │   ├── layout.css       顶栏、侧栏、内容区、响应式
│       │   ├── components.css   导航项、徽标、按钮、空状态、占位页
│       │   └── chat.css         对话页、消息气泡、输入区
│       └── js/
│           ├── main.js          启动、构建导航、装配页面
│           ├── routes.js        路由与导航的唯一配置源
│           ├── icons.js         SVG symbol 的 id 常量
│           ├── router.js        hash 路由解析与页面切换
│           ├── store.js         内存消息状态与发送队列
│           ├── api.js           SSE 客户端
│           ├── dom.js           DOM 小工具与格式化函数
│           └── views/
│               ├── chat.js      对话页视图
│               └── placeholder.js 占位页视图
├── requirements.txt
├── .gitignore
├── Intent.md
├── Spec.md
├── Memory.md
└── README.md
```

4.1 不建立 `tests/`、`scripts/`、`docs/` 目录：第一版没有自动化测试与额外脚本，验收命令写在本文件第 11 节。
4.2 目录名 `Assistant` 首字母大写沿用 README.md 的既有约定；Python 包名因此也大写，`python -m Assistant` 可正常工作。

## 5. 架构与数据流

### 5.1 组件关系

```
浏览器
├── index.html / CSS / ES Modules
│   ├── main.js ── routes.js ── router.js
│   ├── views/chat.js ── store.js ── api.js
│   └── views/placeholder.js
└── fetch POST /api/chat（SSE）
        │
FastAPI（Assistant/app.py）
├── /api/health ── config
├── /api/chat ── agent/factory.py ── agent/mock_agent.py
└── StaticFiles("/", web/, html=True)
```

### 5.2 一次对话的时序

1. 浏览器加载 `/`，`main.js` 根据 `routes.js` 生成导航，`router.js` 解析 hash；无 hash 时替换为 `#/chat`。
2. 用户在输入框输入，发送按钮随内容启用或置灰。
3. 用户按 Enter 或点击发送，前端立即追加用户消息与时间戳，清空输入框，滚动到底部。
4. 前端对当前消息历史做快照，放入发送队列；若没有正在进行的回复，立即开始下一条。
5. 前端追加一条空的 Agent 消息（状态 `streaming`，显示等待动画），请求 `POST /api/chat`。
6. 后端校验请求，从 `factory.get_agent()` 取得 Agent，返回 `text/event-stream`。
7. 前端依次处理 `meta`、`delta`、`done`（或 `error`），把文本逐块写入 Agent 消息。
8. 一条回复结束后，队列中若有待发送消息，继续第 5 步；否则回到空闲。
9. 刷新页面后，前端内存状态清空；当前 hash 若为 `#/chat` 则回到空状态，若为其他合法 hash 则停留在该占位页；后端不保存任何会话。

### 5.3 状态归属

5.3.1 消息、队列、流状态全部只存在于浏览器内存，由 `store.js` 持有。
5.3.2 后端无状态：同一个 Agent 实例可被并发请求使用；mock 不保存任何上下文。
5.3.3 对话页 DOM 常驻：切换到其他页面时用 `hidden` 隐藏而不销毁，返回对话页时消息、滚动位置与进行中的流都保留。

## 6. 后端规格

### 6.1 启动入口

6.1.1 `Assistant/__main__.py` 只做三件事：配置 UTF-8 输出、读取 `HOST`/`PORT`、调用 `uvicorn.run(app, host=..., port=...)`。
6.1.2 直接传 app 对象，不用 import 字符串，避免 `python -m Assistant` 时的模块路径歧义。
6.1.3 打印启动地址后启动服务；端口被占用时让 uvicorn 抛出原始错误，不吞异常。

### 6.2 应用装配

6.2.1 `app.py` 中按固定顺序装配：创建 `FastAPI`、注册 `/api` 路由、挂载静态目录。
6.2.2 关闭交互式文档与 ReDoc（`docs_url=None`、`redoc_url=None`），因为 FastAPI 默认文档页会从 CDN 加载资源，违反 1.5；保留 `openapi_url="/api/openapi.json"` 供本地查看。
6.2.3 静态挂载使用 `StaticFiles(directory=WEB_DIR, html=True)`，挂载点为 `/`，且必须在 API 路由之后。
6.2.4 增加一个 HTTP 中间件：对非 `/api` 的 GET 响应设置 `Cache-Control: no-cache`。

### 6.3 配置模块

6.3.1 `config.py` 提供：`APP_VERSION = "0.1.0"`、`HOST`、`PORT`、`STREAM_DELAY_MS`、`CHUNK_SIZE`、`MAX_MESSAGES = 30`、`MAX_MESSAGE_CHARS = 4000`、`WEB_DIR`。
6.3.2 `WEB_DIR` 通过 `Path(__file__).parent / "web"` 计算，不依赖当前工作目录。

### 6.4 静态资源

6.4.1 `/` 返回 `web/index.html`；`/css/*`、`/js/*` 返回对应文件。
6.4.2 因为使用 hash 路由，不需要 SPA fallback；访问不存在的静态路径返回 404 即可。
6.4.3 不设置长缓存，浏览器每次协商缓存。

### 6.5 健康检查

`GET /api/health` 返回 200：

```json
{
  "status": "ok",
  "version": "0.1.0",
  "agent": "mock",
  "time": "2026-11-06T10:20:13+08:00"
}
```

6.5.1 `agent` 字段取当前 Agent 的 `name`，用于确认运行的是 mock 还是真实模型。
6.5.2 `time` 使用带时区的 ISO 8601 字符串。

### 6.6 聊天接口

6.6.1 请求：

```
POST /api/chat
Content-Type: application/json
```

```json
{
  "messages": [
    { "role": "user", "content": "你好" },
    { "role": "assistant", "content": "你好，我是你的学习助手。" },
    { "role": "user", "content": "怎么开始学 Agent？" }
  ]
}
```

6.6.2 字段定义：

| 字段 | 类型 | 约束 |
|---|---|---|
| `messages` | 数组 | 必填，1 到 30 条 |
| `messages[].role` | 字符串 | 只能是 `user` 或 `assistant` |
| `messages[].content` | 字符串 | 去除首尾空白后非空，最长 4000 字符 |

6.6.3 额外约束：最后一条消息的 `role` 必须是 `user`，否则返回 422。
6.6.4 成功响应：`200`，`Content-Type: text/event-stream; charset=utf-8`，按 6.7 推送事件。
6.6.5 校验失败：`422`，JSON 结构遵循 FastAPI 默认的 `{"detail": [...]}`。
6.6.6 内部异常：流开始前抛出的异常返回 `500` JSON；流开始后的异常通过 `error` 事件通知前端。
6.6.7 响应头至少包含 `Cache-Control: no-cache`、`X-Accel-Buffering: no`。

### 6.7 SSE 协议

6.7.1 每个事件由 `event:` 行、`data:` 行与一个空行组成；`data` 是单行 JSON（UTF-8，不转义中文）。
6.7.2 事件类型：

| 事件 | data 示例 | 说明 |
|---|---|---|
| `meta` | `{"message_id":"m_8f3a","created_at":"2026-11-06T10:20:13+08:00","model":"mock-0.1"}` | 流开始，只发一次 |
| `delta` | `{"text":"你好"}` | 增量文本，可发多次 |
| `done` | `{"finish_reason":"stop","duration_ms":1820}` | 正常结束 |
| `error` | `{"code":"stream_error","message":"回复生成失败"}` | 异常结束，随后关闭连接 |

6.7.3 不发送心跳注释：mock 回复在数秒内结束，没有长连接保活需求；接入真实模型后如需保活，再加 `: ping` 注释行。
6.7.4 客户端断开时，服务端生成器应捕获 `asyncio.CancelledError` 并直接结束，不记录为错误。
6.7.5 服务端不自动重试；一次请求对应一次完整回复。

### 6.8 数据模型

6.8.1 `agent/base.py` 定义：

```python
from typing import AsyncIterator, Literal, Protocol, Sequence

from pydantic import BaseModel


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str


class Agent(Protocol):
    name: str

    def stream_reply(
        self, messages: Sequence[ChatMessage]
    ) -> AsyncIterator[str]:
        ...
```

6.8.2 实现方的 `stream_reply` 使用带 `yield` 的 `async def`，调用后得到异步生成器；协议里写成普通 `def` 并返回 `AsyncIterator`，避免把返回类型误标成协程。
6.8.3 `api/schemas.py` 复用 `ChatMessage` 定义请求模型，并为 `messages` 增加 1 到 30 条的长度约束。
6.8.4 前端发送的字段名与后端一致，使用 snake_case；前端如需跨层使用，在 `api.js` 内做一次映射，不把 snake_case 扩散到整个前端。

### 6.9 Agent 抽象与替换点

6.9.1 `agent/factory.py` 是唯一决定"用哪个 Agent"的位置：

```python
from .base import Agent
from .mock_agent import MockAgent

_agent: Agent | None = None


def get_agent() -> Agent:
    global _agent
    if _agent is None:
        _agent = MockAgent()
    return _agent
```

6.9.2 `api/chat.py` 只依赖 `get_agent()` 与 `Agent` 协议，不 import `MockAgent`。
6.9.3 替换真实模型时：新增一个实现 `Agent` 协议的模块，修改 `factory.py` 中的一行构造；API、前端与数据模型不动。这就是 Intent.md 6.9 的落点。

### 6.10 Mock 回复

6.10.1 所有 mock 文案、规则与流式节奏集中在 `agent/mock_agent.py`，不散落到路由或前端。
6.10.2 输入取最后一条 `user` 消息，按关键词匹配回复方向，匹配不区分大小写，按固定优先级从上到下命中：

| 命中关键词 | 回复方向 |
|---|---|
| 你好、hello、hi | 问候，并说明当前是 mock 模式、可以聊什么 |
| 你是谁、介绍、名字 | 说明自己是 Agent 学习助手，用于演示对话主流程 |
| 学习、怎么学、agent | 给出三步学习建议：先跑通对话、再理解工具调用、最后做记忆 |
| 数据库、记忆、笔记 | 说明个人数据库与记忆功能将在后续版本开放 |
| 其他 | 复述用户输入，并追问一个具体的学习问题 |

6.10.3 回复约束：纯文本、60 到 200 个汉字、不使用 Markdown 语法（`#`、`**`、反引号、代码围栏）、不使用 emoji、结尾使用中文标点。
6.10.4 相同输入必须得到相同回复：不引入随机数，保证验收可重复。
6.10.5 流式实现：把回复文本按 `CHUNK_SIZE`（默认 1）个字符切块，逐块 `yield`，块与块之间 `await asyncio.sleep(STREAM_DELAY_MS / 1000)`。
6.10.6 首块在请求到达后 50 毫秒内发出，整条回复在 1 到 4 秒内结束（默认配置下）。
6.10.7 不访问网络、不读写文件、不依赖当前时间生成正文。

### 6.11 日志与异常

6.11.1 日志：每完成一次流，记录 `messages=N last_user_chars=M reply_chars=K duration_ms=T`。
6.11.2 未知异常在路由层捕获，记录 `logger.exception`，流开始前返回 500，流开始后发送 `error` 事件。
6.11.3 不在日志中打印消息正文、请求头或任何凭据。
6.11.4 前端断开导致的 `CancelledError` 记录为 debug，不算错误。

### 6.12 安全边界

6.12.1 只绑定 `127.0.0.1`，不对局域网开放。
6.12.2 不接受文件上传、URL 抓取、代码执行等能力。
6.12.3 请求体只做长度与角色校验，不把用户文本拼进任何命令或模板执行。

## 7. 前端规格

### 7.1 模块职责

| 文件 | 职责 | 可以依赖 |
|---|---|---|
| `main.js` | 入口：构建导航、初始化路由、注册全局事件 | 其余全部 |
| `routes.js` | 路由、导航标签、图标、页面标题、占位页文案的唯一配置源 | `icons.js` |
| `router.js` | 解析 hash、切换视图、更新导航高亮与 `document.title` | `routes.js` |
| `store.js` | 消息数组、发送队列、流状态、ID 与时间戳生成 | `dom.js` |
| `api.js` | 组装请求、解析 SSE、回调 `meta` / `delta` / `done` / `error` | 无 |
| `dom.js` | `el()`、`formatTimestamp()`、`scrollToBottom()`、`isNearBottom()` | 无 |
| `views/chat.js` | 对话页 DOM、输入、渲染、队列驱动、滚动 | `store.js`、`api.js`、`dom.js` |
| `views/placeholder.js` | 占位页渲染 | `routes.js`、`dom.js` |
| `icons.js` | SVG symbol id 常量 | 无 |

7.2 依赖方向只能自上而下，不允许视图之间互相 import，不允许 `api.js` 操作 DOM。

### 7.3 应用外壳结构

`index.html` 结构约定（属性名与类名按此实现）：

```html
<body>
  <a class="skip-link" href="#main-content">跳到主内容</a>

  <header class="app-header">
    <a class="app-brand" href="#/chat" aria-label="Agent 学习助手首页">
      <span class="app-brand__mark" aria-hidden="true"><svg>...</svg></span>
      <span class="app-brand__name">Agent 学习助手</span>
    </a>
    <span class="app-header__divider" aria-hidden="true"></span>
    <h1 class="app-header__title" id="page-title">对话</h1>
    <div class="app-header__spacer"></div>
    <span class="badge badge--mock"><span class="badge__dot"></span>Mock 模式</span>
    <span class="app-header__version">v0.1.0</span>
  </header>

  <div class="app-body">
    <aside class="app-sidebar">
      <nav class="nav" aria-label="主导航">
        <ul class="nav__list" id="nav-list"></ul>
      </nav>
      <div class="app-sidebar__footer">
        <span class="status-dot" aria-hidden="true"></span>
        <span>本地运行 · v0.1.0</span>
      </div>
    </aside>

    <main class="app-main" id="main-content">
      <section class="view view--chat" id="view-chat" aria-label="对话主窗口">...</section>
      <section class="view view--placeholder" id="view-placeholder" hidden>...</section>
    </main>
  </div>

  <div class="sr-only" id="live-status" role="status" aria-live="polite"></div>
  <script type="module" src="/js/main.js"></script>
</body>
```

7.3.1 五个导航项由 `routes.js` 配置、`main.js` 用 `document.createElement` 生成，使用 `<a href="#/...">`，不写死五段 HTML。
7.3.2 五个图标、发送图标与品牌标记使用 `index.html` 顶部隐藏的 `<svg><symbol id="icon-...">` 图标库，通过 `<use href="#icon-...">` 引用；不使用外部图标库。
7.3.3 设置 `<html lang="zh-CN">`、`<meta name="viewport" content="width=device-width, initial-scale=1">`、`color-scheme: dark`。
7.3.4 favicon 使用内联 SVG data URI，避免 404 请求。

### 7.4 路由表

| hash | 导航标签 | 页面标题 | 视图 | 图标 symbol |
|---|---|---|---|---|
| `#/chat` | 对话 | 对话 | 对话页 | `icon-chat` |
| `#/database` | 个人数据库 | 个人数据库 | 占位页 | `icon-database` |
| `#/mail` | 管理 Mail | 管理 Mail | 占位页 | `icon-mail` |
| `#/device` | 手机端联动 | 手机端联动 | 占位页 | `icon-device` |
| `#/settings` | 配置 | 配置 | 占位页 | `icon-settings` |

7.4.1 无 hash 或 hash 为空时，用 `history.replaceState` 写入 `#/chat`，不新增历史记录。
7.4.2 无法识别的 hash 同样替换为 `#/chat`。
7.4.3 导航项当前页使用 `aria-current="page"` 并加 `.is-active`。
7.4.4 `document.title` 更新为 `<页面标题> · Agent 学习助手`。

### 7.5 页面切换

7.5.1 `#/chat`：显示 `#view-chat`，隐藏 `#view-placeholder`。
7.5.2 其他四个路由：隐藏 `#view-chat`，显示 `#view-placeholder` 并按路由配置重新填充图标、标题、说明。
7.5.3 对话页只初始化一次；切换页面不销毁消息与输入内容，不重建 DOM。
7.5.4 占位页内容始终居中，不产生独立滚动；对话页切换前后保持原滚动位置。

### 7.6 对话页 DOM

```html
<section class="view view--chat" id="view-chat" aria-label="对话主窗口">
  <div class="chat">
    <div class="chat__scroll" id="chat-scroll">
      <div class="chat__empty" id="chat-empty">
        <span class="chat__empty-icon" aria-hidden="true">...</span>
        <h2 class="chat__empty-title">开始和 Agent 对话</h2>
        <p class="chat__empty-text">当前回复由本地 mock 生成，用来验证对话界面与流式输出。</p>
      </div>
      <div class="messages" id="messages" role="log" aria-live="off" aria-label="消息记录"></div>
    </div>

    <div class="chat__composer">
      <p class="composer__queue" id="composer-queue" hidden></p>
      <form class="composer" id="composer">
        <textarea
          class="composer__input"
          id="composer-input"
          rows="1"
          maxlength="4000"
          placeholder="输入消息，Enter 发送，Shift + Enter 换行"
          aria-label="消息输入框"
        ></textarea>
        <button class="composer__send" id="send-button" type="submit" aria-label="发送消息" disabled>
          <svg aria-hidden="true"><use href="#icon-send"></use></svg>
        </button>
      </form>
      <p class="composer__hint">Enter 发送 · Shift + Enter 换行</p>
    </div>
  </div>
</section>
```

7.6.1 消息区与输入区之间不插入其他组件；消息区滚动，输入区固定在对话页底部。
7.6.2 首次进入时消息区显示空状态；追加第一条消息后隐藏空状态，第一版不提供清空按钮。

### 7.7 消息数据模型

7.7.1 前端消息对象：

```js
{
  id: "m_<uuid>",
  role: "user" | "assistant",
  content: "",
  createdAt: Date,
  status: "done" | "streaming" | "error"
}
```

7.7.2 `id` 优先用 `crypto.randomUUID()`；不可用时回退 `m_<时间戳>_<自增序号>`。
7.7.3 消息按追加顺序保存在 `store.messages`，不做排序、不做分组、不持久化。

### 7.8 消息渲染

7.8.1 每条消息结构：

```html
<article class="msg msg--user" data-message-id="m_...">
  <div class="msg__bubble">
    <p class="msg__text"></p>
  </div>
  <time class="msg__time" datetime="2026-11-06T06:32:00.000Z">2026-11-06 14:32</time>
</article>
```

7.8.2 `role` 决定 `msg--user` 或 `msg--agent`；用户消息靠右，Agent 消息靠左。
7.8.3 用户消息使用主色淡底气泡；Agent 消息使用 `surface` 卡片气泡，无头像。两者都显示时间戳。
7.8.4 文本通过 `textContent` 写入，保留换行（CSS `white-space: pre-wrap`）；禁止把消息内容拼进 `innerHTML`。
7.8.5 Agent 消息在流式期间：`status="streaming"`，显示等待动画与光标；收到首个 `delta` 后移除等待动画；`done` 后移除光标。
7.8.6 每条消息的 `article` 追加后不需要整体重渲染；流式文本直接更新当前消息的文本节点。
7.8.7 不为消息添加 Markdown、代码高亮、复制、重新生成、删除、编辑等操作；这些属于第一版不做范围。

### 7.9 输入区交互

7.9.1 首次进入对话页时聚焦输入框，光标在末尾；之后切换页面不重复抢占焦点。
7.9.2 输入事件：更新发送按钮可用状态；自动增高输入框，最小一行，最大 200px；超过后内部滚动。
7.9.3 发送按钮的 `disabled` 只取决于内容：`value.trim().length === 0` 时禁用，否则启用。
7.9.4 Enter 发送；Shift + Enter 插入换行。
7.9.5 中文输入法保护：监听 `compositionstart` / `compositionend`，组合输入期间的 Enter 不触发发送。
7.9.6 发送时对内容执行 `trim()`，保留内部换行；内容为空则不发送。
7.9.7 发送后清空输入框、把高度重置为一行、保持焦点。
7.9.8 Agent 回复期间输入框与发送按钮保持可用；不能在流式期间禁用输入。
7.9.9 输入超过 4000 字符由 `maxlength` 截断，不额外显示计数器。

### 7.10 发送队列

7.10.1 每次发送立即追加用户消息并滚动到底部，然后把"截至该消息的历史快照"放入队列。
7.10.2 同一时间只允许一条回复在流式生成；队列按先进先出串行处理。
7.10.3 一条回复结束后自动开始下一条；某条失败不阻塞后续消息。
7.10.4 队列非空且正在生成时，在输入区上方显示"另有 N 条消息等待回复"；队列清空后隐藏。
7.10.5 请求历史只包含到对应队列项为止的消息，不包含之后排队的用户消息，也不包含空白的 Agent 占位消息。

### 7.11 SSE 客户端

7.11.1 `api.js` 提供 `streamChat({ messages, signal, onMeta, onDelta, onDone, onError })`，返回 Promise。
7.11.2 使用 `fetch` + `response.body.getReader()` + `TextDecoder`，按 `\n\n` 切分事件，兼容 `\r\n`。
7.11.3 只处理 `event:` 与 `data:` 行；忽略其他字段与注释行；`data` 解析失败视为流错误。
7.11.4 非 2xx 响应：读取 JSON 错误体，抛出带状态码的错误，由视图转成错误气泡。
7.11.5 网络异常、用户离开页面导致的中断、`error` 事件统一走 `onError`。
7.11.6 页面卸载时调用 `AbortController.abort()`。

### 7.12 流式渲染与滚动

7.12.1 开始请求时立即追加 Agent 占位消息并滚动到底部。
7.12.2 `meta` 到达时用服务端 `message_id` 更新消息 id，用 `created_at` 作为该 Agent 消息的时间；解析失败时保留前端生成的值。
7.12.3 每个 `delta` 把 `text` 追加到消息文本节点；用 `requestAnimationFrame` 合并同一帧内的多次更新。
7.12.4 自动滚动规则：追加任何新消息时总是滚到底部；流式更新时，只有用户当前位于距底部 80px 以内才跟随滚动；用户手动上滑后暂停跟随，回到底部后恢复。
7.12.5 滚动使用 `scrollTop = scrollHeight`，不加平滑动画，避免流式时抖动。
7.12.6 `done` 后把状态改为 `done`，移除光标；耗时只用于日志，不显示在界面上。

### 7.13 时间戳

7.13.1 显示格式固定为 `YYYY-MM-DD HH:mm`，24 小时制，本地时区，月、日、时、分补零。
7.13.2 用户消息时间取点击发送的时刻；Agent 消息时间以服务端 `meta.created_at` 为准，缺失时取追加占位消息的时刻。
7.13.3 `<time>` 的 `datetime` 属性使用 ISO 8601（UTC），显示文本使用本地时间。
7.13.4 时间戳位于气泡下方，字号 11px，弱化颜色，使用等宽数字（`font-variant-numeric: tabular-nums`）。
7.13.5 第一版不做日期分隔线，不显示"今天"等相对时间。

### 7.14 错误处理

7.14.1 流开始前失败：追加一条 Agent 错误消息，正文为"连接失败，请确认后端服务正在运行。"，状态 `error`，时间戳正常显示。
7.14.2 流中途失败：保留已收到的文本，在气泡末尾追加一行弱化的"回复生成中断，请重试。"，状态 `error`，移除光标。
7.14.3 服务端 `error` 事件：使用事件中的 `message` 作为错误说明；没有该字段时使用默认文案。
7.14.4 预期内的网络错误使用 `console.warn`，不产生未捕获的 Promise 拒绝；正常流程控制台无错误、无警告。
7.14.5 不自动重试，不弹出对话框，不使用 `alert`。

### 7.15 占位页

7.15.1 四个占位页共用一个视图，按 `routes.js` 配置渲染：

| hash | 标题 | 说明文案 |
|---|---|---|
| `#/database` | 个人数据库 | 后续版本将在这里管理学习资料、笔记与知识库。 |
| `#/mail` | 管理 Mail | 后续版本将在这里查看和处理 Agent 收发的邮件。 |
| `#/device` | 手机端联动 | 后续版本将支持手机与工作台之间的消息同步。 |
| `#/settings` | 配置 | 后续版本将在这里配置模型、工具与偏好。 |

7.15.2 每页结构：图标、标题（`h2`）、状态徽标"尚未开放"、一句说明；整体在内容区水平与垂直居中。
7.15.3 占位页不包含任何按钮、表单、表格或数据请求。
7.15.4 对话页的空状态与占位页的视觉语言保持一致（图标 + 标题 + 说明）。

### 7.16 响应式

7.16.1 断点：`>= 1024px` 完整侧栏；`768px ~ 1023px` 侧栏收为 72px 图标栏；`< 768px` 侧栏收为 64px 图标栏。
7.16.2 图标栏模式下保留图标，文字用 `.sr-only` 隐藏但仍在 DOM 中；导航链接加 `title` 属性。
7.16.3 内容区边距：桌面 24px，平板 20px，手机 12px；对话页在手机上去掉左右外边距。
7.16.4 顶栏：`< 768px` 隐藏品牌文字与版本号，仅保留标记与页面标题。
7.16.5 对话气泡最大宽度：用户 60%（手机 82%），Agent 760px（手机 92%）。
7.16.6 第一版不做移动端抽屉与汉堡菜单。

### 7.17 可访问性

7.17.1 提供"跳到主内容"链接，获得焦点时可见。
7.17.2 导航使用 `<nav aria-label="主导航">`，列表结构；当前项 `aria-current="page"`。
7.17.3 消息区 `role="log"` 并显式设置 `aria-live="off"`，避免逐字播报；用户消息发出时与 Agent 回复完成时，通过隐藏的 `#live-status`（`role="status"`）播报简短状态。
7.17.4 所有图标按钮有 `aria-label`；装饰性图标 `aria-hidden="true"`。
7.17.5 键盘焦点使用 `:focus-visible`，2px 主色描边、2px 偏移；不全局移除 outline。
7.17.6 `prefers-reduced-motion: reduce` 时禁用光标闪烁、输入区过渡与平滑滚动。

### 7.18 前端安全

7.18.1 用户与服务端文本只通过 `textContent` 或 `createTextNode` 写入。
7.18.2 只有静态模板（不含任何用户数据）可以使用 `innerHTML`；`index.html` 中的 SVG symbol 属于静态模板。
7.18.3 不执行 `eval`、`new Function`、动态 `<script>`；不拼接 HTML 字符串展示消息。

## 8. 视觉规范

视觉参照 AstrBot 深色工作台的主题令牌与布局比例，按以下值实现；所有颜色与尺寸只出现在 `tokens.css` 或对应组件文件中，不散落硬编码。

### 8.1 设计令牌

颜色：

| 变量 | 值 | 用途 |
|---|---|---|
| `--color-bg` | `#1a1a1a` | 内容区背景 |
| `--color-surface` | `#242424` | 顶栏、侧栏、卡片、输入区 |
| `--color-surface-hover` | `#2a2a2a` | 悬停背景 |
| `--color-border` | `#333333` | 常规描边 |
| `--color-border-strong` | `#3a3a3a` | 强调描边 |
| `--color-text` | `#e8eaed` | 主文本 |
| `--color-text-secondary` | `rgba(255, 255, 255, 0.87)` | 次级文本 |
| `--color-text-muted` | `rgba(232, 234, 237, 0.56)` | 时间戳、说明文字 |
| `--color-primary` | `#5ba4d4` | 主色、选中态、发送按钮 |
| `--color-primary-strong` | `#3a8ab8` | 主色悬停 |
| `--color-primary-soft` | `rgba(91, 164, 212, 0.12)` | 用户气泡、选中背景 |
| `--color-primary-softer` | `rgba(91, 164, 212, 0.08)` | 悬停背景 |
| `--color-danger` | `#ff4d4f` | 错误 |
| `--color-danger-soft` | `rgba(255, 77, 79, 0.12)` | 错误背景 |
| `--color-success` | `#52c41a` | 运行状态点 |
| `--color-focus` | `rgba(91, 164, 212, 0.7)` | 焦点描边 |
| `--color-scrollbar` | `rgba(255, 255, 255, 0.16)` | 滚动条滑块 |

字体与排版：

| 变量 | 值 |
|---|---|
| `--font-sans` | `-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif` |
| `--font-mono` | `"Cascadia Code", "Consolas", "SFMono-Regular", monospace` |
| `--text-xs` | `11px` |
| `--text-sm` | `12px` |
| `--text-base` | `14px` |
| `--text-lg` | `16px` |
| `--text-xl` | `20px` |
| `--leading-base` | `1.65` |

数量：

| 变量 | 值 |
|---|---|
| `--radius-sm` | `8px` |
| `--radius-md` | `12px` |
| `--radius-lg` | `16px` |
| `--radius-pill` | `999px` |
| `--space-1` ~ `--space-7` | `4px`、`8px`、`12px`、`16px`、`20px`、`24px`、`32px` |
| `--motion-fast` | `150ms ease` |
| `--motion-base` | `200ms ease` |

布局：

| 变量 | 值 |
|---|---|
| `--layout-header-height` | `50px` |
| `--layout-sidebar-width` | `235px` |
| `--layout-sidebar-compact` | `72px` |
| `--layout-sidebar-mobile` | `64px` |
| `--layout-content-max` | `1560px` |
| `--layout-chat-width` | `860px` |

8.1.1 不使用外部字体；AstrBot 的 Outfit 字体由系统字体栈替代，中文回退优先苹方、微软雅黑、Noto Sans SC。
8.1.2 页面设置 `color-scheme: dark`，让滚动条与表单控件使用深色外观。

### 8.2 布局尺寸

8.2.1 顶栏：高 50px，`surface` 背景，底部 1px 边框 `rgba(58, 58, 58, 0.5)`；左侧品牌区，中间分隔线，页面标题 15px/600，右侧弹性空白、Mock 徽标、版本号。
8.2.2 侧栏：宽 235px，`surface` 背景，右侧 1px 边框 `rgba(58, 58, 58, 0.45)`；导航列表顶部与左右内边距 16px，项间距 2px；底部固定版本与运行状态。
8.2.3 内容区：占满剩余宽度与高度，`bg` 背景；占位页内容最大宽度 420px，居中；对话页占满内容区高度，不出现整页滚动条。
8.2.4 页面整体高度为 100vh，顶栏与内容区之间不出现双滚动条；只有消息区与侧栏导航各自滚动。

### 8.3 组件规格

8.3.1 品牌标记：30px 圆角方块，`primary-soft` 背景，主色内联 SVG 线条图标；字标 15px、600 字重。
8.3.2 导航项：高 40px，左右内边距 12px，圆角 8px，图标 18px，图标与文字间距 10px，文字 14px；默认文字 `text-secondary`；悬停背景 `primary-softer`、文字与图标主色；选中背景 `primary-soft`、文字与图标主色。
8.3.3 徽标：胶囊形，高 24px，左右内边距 10px，字号 12px；`badge--mock` 使用主色文字与 `primary-softer` 背景，内含 6px 圆点；占位页的"尚未开放"使用中性背景与弱化文字。
8.3.4 按钮：发送按钮 36px 圆形，启用时 `primary-strong` 背景、白色图标，悬停时亮度降低 8%，禁用时 `rgba(255,255,255,0.08)` 背景与 `text-muted` 图标；禁用态 `cursor: not-allowed`。
8.3.5 输入区：容器最大宽度 860px、居中，`surface` 背景，1px `border-strong`，圆角 16px，内边距 10px 12px；聚焦时边框变主色并加 3px `primary-softer` 外圈；文本域透明背景、无边框、14px/1.65、最小高度 24px、最大高度 200px、禁止手动拖拽。
8.3.6 消息：列表最大宽度 860px、居中，消息间距 22px；用户行 `justify-content: flex-end`，Agent 行靠左；用户气泡内边距 10px 16px、圆角 `16px 16px 4px 16px`、背景 `primary-soft`；Agent 气泡内边距 12px 16px、圆角 `16px 16px 16px 4px`、背景 `surface`、1px `border`。
8.3.7 消息文本：14px/1.65，`white-space: pre-wrap`，`overflow-wrap: anywhere`。
8.3.8 时间戳：气泡下方 6px，11px，`text-muted`，等宽数字；用户侧右对齐，Agent 侧左对齐。
8.3.9 等待动画：三个 6px 圆点，间距 4px，透明度呈 0.3 到 1 循环，周期 1.2s；`prefers-reduced-motion` 下改为静态三点。
8.3.10 流式光标：2px 宽、1em 高的主色竖线，闪烁周期 1s；只在 `streaming` 状态显示。
8.3.11 滚动条：宽 6px，滑块 `--color-scrollbar`，圆角 999px，轨道透明；悬停时滑块透明度提高。
8.3.12 空状态：图标 40px 置于 64px 圆形 `primary-soft` 背景中，标题 18px/600，说明 13px `text-muted`，最大宽度 360px，整体在可用空间内垂直居中，偏上约 45%。
8.3.13 占位页：图标 48px 置于 72px 圆形背景，标题 20px/600，状态徽标，说明 13px，最大宽度 420px。

### 8.4 与 AstrBot 的对照

8.4.1 对齐的部分：深色配色（背景、表面、主色、文本层级）、50px 顶栏、235px 侧栏、8px 基础圆角、导航选中用主色、内容区最大宽度、消息区 760px 级别的阅读宽度。
8.4.2 有意不同的部分：
- AstrBot 在对话页隐藏侧栏；本项目按 Intent.md 2.6 始终保留侧栏。
- AstrBot 的 Agent 消息带头像且气泡透明；本项目按用户决定不显示头像，Agent 消息改为 `surface` 卡片以保证可辨识。
- 不使用 Vuetify、Material Design Icons、主题切换、语言切换、登录、更新日志、文档入口。
- 顶栏不显示全局搜索、通知、用户菜单。
8.4.3 风格验收以"第一眼像同一个产品体系"为准，不逐像素复制。

### 8.5 图标与字体

8.5.1 图标：手写内联 SVG，24×24 视图框，`stroke="currentColor"`、`stroke-width="1.6"`、`fill="none"`、圆角端点；只保留实际使用的十个左右 symbol。
8.5.2 品牌标记与空状态图标可以使用 `fill="currentColor"`，但必须与导航图标风格一致。
8.5.3 字体：只用系统字体栈，不请求网络字体；正文与标题同族，时间戳可用 `font-variant-numeric` 对齐。

## 9. 命名与代码约定

9.1 Python：文件与函数 `snake_case`，类 `PascalCase`，常量 `UPPER_SNAKE_CASE`；4 空格缩进；公开函数写一行 docstring，复杂分支写行内注释。
9.2 JavaScript：文件 `kebab-case` 或单词；函数与变量 `camelCase`，常量 `UPPER_SNAKE_CASE`；2 空格缩进；分号结尾；字符串统一单引号；模块使用 `import` / `export`。
9.3 CSS：类名使用 `block__element--modifier` 形式，区域前缀为 `app-`、`nav`、`chat`、`msg`、`composer`、`placeholder`、`badge`、`view`；状态类统一 `is-active`、`is-disabled`、`is-streaming`、`is-error`；不使用 ID 写样式。
9.4 CSS 变量：`--color-*`、`--text-*`、`--space-*`、`--radius-*`、`--layout-*`、`--motion-*`。
9.5 API：路径全小写、短横线分隔；JSON 字段 `snake_case`；事件名 `meta`、`delta`、`done`、`error`。
9.6 HTML：语义标签优先（`header`、`nav`、`main`、`aside`、`article`、`time`）；交互元素用 `button` / `a`，不使用 `div` 绑定点击。
9.7 Git：分支 `feature/<kebab-case>`；提交 scope 使用 `shell`、`navbar`、`chat`、`agent`、`api`、`docs`、`deps`、`style`；摘要使用中文祈使句。
9.8 注释语言：代码注释与文档统一中文；标识符、CSS 变量、API 字段统一英文。
9.9 文档：不使用 emoji；按条目编号；一条一句话。

## 10. Git 工作流与功能拆分

### 10.1 分支模型

10.1.1 `main` 始终保持可运行：任何时刻检出 `main` 都能启动并打开工作台。
10.1.2 每个功能一个 `feature/<name>` 分支，从最新 `main` 切出。
10.1.3 功能完成并人工验收后，用 `git merge --no-ff` 合回 `main`，保留合并提交。
10.1.4 已合并分支不删除。
10.1.5 远端为 GitHub `origin`（`https://github.com/fibel2008/agent_lab.git`）；每次提交后把当前分支推送到 origin，新建 feature 分支首次推送使用 `git push -u origin <branch>`。
10.1.6 合并回 `main` 后推送 `main`；不创建 PR。

### 10.2 功能拆分

| 顺序 | 分支 | 内容 | 验收 |
|---|---|---|---|
| 1 | `feature/app-shell` | Python 服务骨架、配置、健康检查、静态托管；前端外壳、设计令牌、侧栏导航、顶栏、四个占位页、hash 路由；对话页显示空状态占位 | Intent 6.1、6.2、6.10 |
| 2 | `feature/mock-agent` | Agent 协议、mock 生成器、工厂、`POST /api/chat` SSE；用命令行验证流式事件 | 第 11.3 节的接口冒烟 |
| 3 | `feature/chat-window` | 对话页完整实现：消息列表、气泡、时间戳、输入区、发送队列、SSE 接入、逐字渲染、自动滚动 | Intent 6.3 到 6.8 |
| 4 | `feature/first-release` | 错误处理与空状态收尾、响应式、可访问性、README 与 Memory 更新、第一版全量验收 | Intent 6.1 到 6.10 全量回归 |

10.2.1 第 1 个功能中的对话页只放空状态文案，不放输入框；第 3 个功能再替换为完整对话页，避免把输入交互提前实现。
10.2.2 不允许把两个功能合并在一个分支；发现范围变大时，拆出新分支并在 Memory.md 记录。

### 10.3 每个分支的提交序列

提交粒度是"完成一个可验证的小步"，以下为建议序列，实施时可以增删，但每个提交必须自身可运行。

`feature/app-shell`：

1. `chore(deps): 添加 FastAPI 与 Uvicorn 依赖`
2. `feat(api): 提供健康检查接口与静态托管`
3. `feat(shell): 搭建顶栏与侧栏布局`
4. `feat(navbar): 实现五项导航与哈希路由`
5. `feat(shell): 添加四个占位页`
6. `docs(readme): 补充安装与启动方式`

`feature/mock-agent`：

1. `feat(agent): 定义消息模型与 Agent 协议`
2. `feat(agent): 实现 mock 回复与逐块输出`
3. `feat(api): 提供 SSE 聊天接口`
4. `fix(api): 处理客户端断开与流式异常`

`feature/chat-window`：

1. `feat(chat): 搭建消息区与输入区`
2. `feat(chat): 实现发送、队列与时间戳`
3. `feat(chat): 接入 SSE 逐字渲染与自动滚动`
4. `fix(chat): 处理中文输入法与空白输入`

`feature/first-release`：

1. `fix(chat): 完善流式失败与错误提示`
2. `style(shell): 优化响应式与滚动条`
3. `feat(shell): 补齐键盘焦点与可访问性`
4. `docs: 更新第一版说明并记录验收结果`

### 10.4 提交规范

10.4.1 提交信息使用 Conventional Commits，摘要不超过 50 字符，正文说明"为什么"。
10.4.2 一个提交只做一件事；格式化、重命名、无关文件不混入。
10.4.3 显式 `git add <path>`，不使用 `git add -A` 或 `git add .`。
10.4.4 提交前执行 `git diff --cached` 逐行复核；禁止提交虚拟环境、`__pycache__`、日志与临时文件。
10.4.5 Windows 下含中文的提交信息写入临时文件后用 `git commit -F <file>`，提交后删除临时文件。
10.4.6 分支合并后用 `git log --oneline --graph -8` 确认轨迹正确。
10.4.7 每次提交成功后立即推送当前分支；推送失败先处理网络或凭据问题，不带着未同步的提交继续开发。

### 10.5 完成定义

一个功能满足以下全部条件才算完成：

1. 代码可运行，`main` 上的启动命令在该分支同样有效。
2. 本功能的验收步骤全部通过，浏览器控制台无报错。
3. Spec.md 与实现一致；如需变更，先改 Spec 再改代码。
4. Memory.md 更新"当前状态、已做决定、踩坑、下一步"。
5. 提交已按逻辑拆分，工作区干净。
6. 用户或主 Agent 验收通过后才执行 `--no-ff` 合并。

## 11. 验收

### 11.1 Intent 验收标准映射

| Intent | 验证动作 | 所属功能 |
|---|---|---|
| 6.1 | 执行启动命令，打开 `http://127.0.0.1:8000/`，确认顶栏、侧栏、内容区同时存在 | app-shell |
| 6.2 | 依次点击五个导航项，观察 hash、页面标题、内容变化；直接用根地址打开时默认进入 `#/chat` | app-shell |
| 6.3 | 输入"你好"并发送，用户气泡立即出现，输入框清空 | chat-window |
| 6.4 | 观察 Agent 回复在 1 到 4 秒内逐块出现，至少能分辨三次以上的增量 | chat-window |
| 6.5 | 连续快速发送三条消息，检查气泡顺序、时间戳顺序与控制台 | chat-window |
| 6.6 | 清空输入框、只输入空格，发送按钮均为禁用态 | chat-window |
| 6.7 | 检查每条消息下方均有 `YYYY-MM-DD HH:mm` 时间戳 | chat-window |
| 6.8 | 流式回复期间继续输入并发送，输入框不冻结 | chat-window |
| 6.9 | 代码审查：`api/chat.py` 不引用 `MockAgent`；替换点只有 `agent/factory.py` | mock-agent / first-release |
| 6.10 | 打开四个占位页，确认空状态提示、无报错、无业务按钮 | app-shell |

### 11.2 通用验收环境

11.2.1 浏览器：Chrome 或 Edge 最新稳定版，窗口 1440×900；另测 1280×800 与 390×844 两个尺寸。
11.2.2 验收前删除浏览器缓存或使用无痕窗口，避免旧 CSS / JS 干扰。
11.2.3 打开开发者工具的 Console 与 Network，正常流程不允许出现红色错误。

### 11.3 接口冒烟（第 2 个功能）

在项目根目录另开一个终端：

```powershell
curl.exe http://127.0.0.1:8000/api/health
```

期望返回 `status` 为 `ok`、`agent` 为 `mock`。

```powershell
curl.exe -N -X POST http://127.0.0.1:8000/api/chat `
  -H "Content-Type: application/json" `
  --data-binary '{"messages":[{"role":"user","content":"hello"}]}'
```

期望依次看到 `event: meta`、多条 `event: delta`、`event: done`，且 delta 之间有明显时间间隔。

11.3.1 发送空消息：`messages` 为 `[]` 或最后一条不是 `user`，期望 422。
11.3.2 发送 31 条消息，期望 422。
11.3.3 在 delta 期间按 Ctrl+C 中断 curl，服务端日志不出现错误堆栈。

### 11.4 第一版最终验收

11.4.1 按 11.1 全表逐条执行，全部通过。
11.4.2 在 `#/chat` 刷新页面，确认聊天记录清空且回到对话页空状态。
11.4.3 页面加载完成后停止后端服务，再发送消息，确认出现错误气泡且页面不崩溃；重启服务后可继续发送。
11.4.4 断开外网后重新加载页面：资源全部本地，只要后端在运行，页面仍可打开。
11.4.5 检查命令行日志中文不乱码，启动行包含访问地址。
11.4.6 检查 `git status` 干净，所有功能分支已合并并保留，`main` 已推送到 `origin`。

## 12. 风险与边界情况

12.1 Python 3.12 的启动器名称不是标准的 `py -3.12`：实测 `py -3.12` 失败，`py -V:Astral\CPython3.12.13` 可用；`py --list` 与 `py -0p` 可查到注册名与解释器路径，创建命令见 3.1。
12.2 端口 8000 被占用：在 PowerShell 中设置 `$env:ASSISTANT_PORT=8001` 后启动，README 中给出说明；不自动改端口，避免"一条命令"行为不可预测。
12.3 中文输入法：必须在微软拼音下测试 Enter 选词不误发送；组合输入期间一律不发送。
12.4 流式中断：用户刷新、关闭标签页、切换页面都可能中断请求；前端要保证不产生未捕获异常，服务端只记录 debug。
12.5 长文本：消息上限 4000 字符，超长输入由 `maxlength` 阻止；服务端仍要做二次校验。
12.6 高 DPI 与窄屏：时间戳与气泡圆角在 125%、150% 缩放下不重叠；窄屏按 7.16 收缩。
12.7 浏览器兼容：只依赖 fetch、ReadableStream、TextDecoder、AbortController 等稳定 API；`crypto.randomUUID` 需要回退。
12.8 视觉偏差：AstrBot 使用 Vue 组件与 Vuetify 阴影体系，本项目用原生 CSS 复刻，允许存在像素级差异，以 8.4.3 为准。
12.9 文档漂移：实现中若发现契约不可行，先改 Spec 再改代码，并在 Memory.md 记录原因；不允许"代码改了文档不动"。
12.10 明确不在第一版范围：真实模型、聊天记录持久化、Markdown 与代码块、工具调用可视化、登录与权限、主题切换、移动端抽屉、消息重新生成。

## 13. 演进预留

13.1 接入真实模型：新增 `Assistant/agent/<provider>_agent.py` 实现 `Agent` 协议，在 `factory.py` 中替换构造；API、SSE 协议、前端渲染均不变。环境变量读取 API Key，密钥不写入仓库。
13.2 聊天记录持久化：在 `store.js` 之上增加会话存储层，后端增加 SQLite 与 `/api/sessions`；消息模型保持不变，增加 `session_id`。
13.3 工具调用可视化：扩展消息为多段结构（文本、工具调用、工具结果），SSE 增加 `tool_start` / `tool_result` 事件；前端在消息渲染处增加对应块，不改流式主循环。
13.4 Markdown 渲染：在 `views/chat.js` 的文本写入处替换为渲染函数，先做转义再做白名单渲染；不引入前端框架。
13.5 浅色主题：在 `tokens.css` 增加 `:root[data-theme="light"]` 变量组与切换按钮；组件样式不写颜色常量。
13.6 自动化测试：后端用 pytest + `httpx.ASGITransport` 覆盖健康检查、校验失败、SSE 事件顺序；前端暂不引入测试框架，继续以手工验收为准。
13.7 多用户与鉴权：第一版明确不做；若要做，先在 Intent.md 与本文增加身份边界，再改后端。
