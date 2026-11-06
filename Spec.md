# Spec：Emibot

<!-- 文档职责：回答"具体怎么实现"。
     只保留四部分：目录结构、架构、接口与数据规定、需求列表。
     不写项目背景与目标（属于 Intent.md），不写开发过程日志（属于 Memory.md）。

     编号规则：对应 Intent.md 中的单条需求 A{x}.{y}，本文拆解为若干实现子项 Ax_y_z（x 为子板块号，y 为需求号，z 为从 1 递增的实现部分序号）。
     编号一经分配不得更改或复用；条目废弃时保留原编号，并标注"已废弃"。
     每个 Ax_y_z 条目固定包含三项：状态、需求描述、详细方案设计。

     状态取值：已确认（方案已定，待实现）/ 进行中（正在实现，未验收）/
     已完成（已实现并通过验收）/ 待确认（方案待拍板）/ 已废弃。 -->

## 一、目录结构

```
Lab1/
├── Assistant/
│   ├── __init__.py              包标记
│   ├── __main__.py              启动入口：python -m Assistant
│   ├── app.py                   FastAPI 装配：路由、静态托管、缓存策略
│   ├── config.py                常量、环境变量与日志初始化
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
│       │   ├── tokens.css       设计令牌（颜色、圆角、间距、字号、布局）
│       │   ├── base.css         reset、排版、滚动条、可访问性基础
│       │   ├── layout.css       顶栏、侧栏、内容区、响应式断点
│       │   ├── components.css   导航项、徽标、状态圆点、按钮、占位页
│       │   └── chat.css         对话页、空状态、消息气泡、输入区
│       └── js/
│           ├── main.js          启动入口：构建导航、初始化路由、装配视图
│           ├── routes.js        路由与导航的唯一配置源
│           ├── icons.js         SVG symbol 的 id 常量
│           ├── router.js        hash 路由解析与视图切换
│           ├── store.js         内存消息状态与发送队列
│           ├── api.js           SSE 客户端
│           ├── dom.js           DOM 工具与时间戳格式化函数
│           └── views/
│               ├── chat.js      对话页视图
│               └── placeholder.js 占位页视图
├── requirements.txt
├── start.bat                    一键启动脚本：启动服务并自动弹出默认浏览器
├── .gitignore
├── Intent.md
├── Spec.md
├── Memory.md
└── README.md
```

- 目录名 `Assistant` 首字母大写沿用既有约定，作为顶层 Python 包通过 `python -m Assistant` 启动。
- 第一版不建立 `tests/`、`scripts/`、`docs/` 目录。

---

## 二、架构

### 2.1 组件关系

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

### 2.2 前端模块职责与依赖方向

| 文件 | 职责 | 允许依赖 |
|---|---|---|
| `main.js` | 入口：构建导航、初始化路由、注册全局事件 | 其余全部前端模块 |
| `routes.js` | 路由、导航标签、图标、页面标题、占位页文案的唯一配置源 | `icons.js` |
| `router.js` | 解析 hash、切换视图、更新导航高亮与 `document.title` | `routes.js` |
| `store.js` | 消息数组、发送队列、流状态、ID 与时间戳生成 | `dom.js` |
| `api.js` | 组装请求、解析 SSE、回调 `meta` / `delta` / `done` / `error` | 无 |
| `dom.js` | `el()`、`createSvgIcon()`、`formatTimestamp()`、`scrollToBottom()`、`isNearBottom()` | 无 |
| `views/chat.js` | 对话页 DOM、输入、渲染、队列驱动、滚动控制 | `store.js`、`api.js`、`dom.js` |
| `views/placeholder.js` | 占位页渲染 | `routes.js`、`dom.js` |
| `icons.js` | SVG symbol id 常量 | 无 |

- 依赖方向严格自上而下，禁止视图模块之间互相 `import`，禁止 `api.js` 操作 DOM。

### 2.3 对话全链路时序与状态归属

1. 浏览器加载 `/`，`main.js` 根据 `routes.js` 生成侧栏导航，`router.js` 解析 hash；无 hash 或非法 hash 时替换为 `#/chat`。
2. 用户在输入框输入，发送按钮随内容动态启用或置灰。
3. 用户按 Enter 或点击发送，前端立即追加用户消息与时间戳，清空输入框并滚到底部。
4. 前端对截至当前用户消息的历史做快照并入队；若当前无进行中的流式回复，立即出队执行下一条。
5. 前端追加一条状态为 `streaming` 的 Agent 占位消息（显示三点等待动画），调用 `POST /api/chat`。
6. 后端校验请求体，通过 `factory.get_agent()` 取得 Agent 实例，返回 `text/event-stream`。
7. 前端依次处理 `meta`、`delta`、`done`（或 `error`）事件，将增量文本逐块写入当前 Agent 消息节点。
8. 单条回复结束后，若队列仍有待处理项则继续第 5 步，否则回到空闲状态。
9. 状态归属：消息、队列、流状态仅保存在浏览器内存（`store.js`），刷新页面即清空；后端无状态；对话页 `#view-chat` DOM 常驻，切换路由仅通过 `hidden` 属性显隐。

### 2.4 功能分支拆分

| 顺序 | 分支 | 实现范围 | 对应 Intent 需求 |
|---|---|---|---|
| 1 | `feature/app-shell` | Python 服务骨架、配置、健康检查、静态托管；前端外壳、设计令牌、侧栏导航、顶栏、四个占位页、hash 路由；对话页空状态占位 | A1.1 ~ A1.9 |
| 2 | `feature/mock-agent` | Agent 协议、mock 生成器、工厂、`POST /api/chat` SSE 接口与流式异常处理 | A3.1 ~ A3.3 |
| 3 | `feature/chat-window` | 对话页完整实现：消息列表、气泡、时间戳、输入区、发送队列、SSE 客户端接入、逐字渲染、自动滚动 | A2.1 ~ A2.9、A4.1 |
| 4 | `feature/first-release` | 流式失败与网络错误提示、响应式与可访问性收尾、文档同步与第一版全量回归验收 | A1.1 ~ A5.5 |

---

## 三、接口与数据规定

### 3.1 环境变量与配置常量（`Assistant/config.py`）

| 名称 | 类型 / 默认值 | 规定 |
|---|---|---|
| `ASSISTANT_HOST` | `str` / `"127.0.0.1"` | 环境变量；只绑定本机环回地址 |
| `ASSISTANT_PORT` | `int` / `8000` | 环境变量；要求 `>= 1`，非法值回退默认并打 warning 日志 |
| `ASSISTANT_STREAM_DELAY_MS` | `int` / `20` | 环境变量；每个文本块间隔毫秒数，要求 `>= 0` |
| `ASSISTANT_CHUNK_SIZE` | `int` / `1` | 环境变量；每个文本块字符数，要求 `>= 1` |
| `ASSISTANT_OPEN_BROWSER` | `bool` / `False` | 环境变量；设为 `1` 或 `true` 时服务就绪后自动弹出默认浏览器 |
| `APP_VERSION` | `"0.1.0"` | 常量；应用版本号 |
| `MAX_MESSAGES` | `30` | 常量；单次请求最大消息条数 |
| `MAX_MESSAGE_CHARS` | `4000` | 常量；单条消息最大字符数 |
| `WEB_DIR` | `Path(__file__).resolve().parent / "web"` | 常量；前端静态资源目录 |

### 3.2 健康检查接口（`GET /api/health`）

- 响应状态码：`200 OK`
- 响应体（`application/json`）：

```json
{
  "status": "ok",
  "version": "0.1.0",
  "agent": "mock",
  "time": "2026-11-06T14:13:21+08:00"
}
```

- 字段规定：`agent` 取自 `get_agent().name`；`time` 为带本地时区偏移的 ISO 8601 字符串（精确到秒）。

### 3.3 聊天流式接口（`POST /api/chat`）

- 请求头：`Content-Type: application/json`
- 请求体结构：

```json
{
  "messages": [
    { "role": "user", "content": "你好" },
    { "role": "assistant", "content": "你好，我是 Emibot。" },
    { "role": "user", "content": "怎么开始学 Agent？" }
  ]
}
```

- 请求校验规定：
  1. `messages`：必填数组，长度 `1 <= len <= 30`。
  2. `messages[].role`：字面量枚举 `"user"` 或 `"assistant"`。
  3. `messages[].content`：字符串，`strip()` 后长度 `>= 1`，且原始长度 `<= 4000`。
  4. `messages[-1].role`：最后一条消息的 `role` 必须为 `"user"`。
- 响应规定：
  - 校验通过：`200 OK`，`Content-Type: text/event-stream; charset=utf-8`，附带响应头 `Cache-Control: no-cache`、`X-Accel-Buffering: no`。
  - 校验失败：`422 Unprocessable Entity`，返回 FastAPI 标准 `{"detail": [...]}`。
  - 流开始前内部异常：`500 Internal Server Error` JSON；流开始后异常通过 SSE `error` 事件下发并关闭流。

### 3.4 SSE 事件协议

每个事件由 `event: <type>\ndata: <json>\n\n` 组成，`data` 为单行 UTF-8 JSON（`ensure_ascii=False`）：

| 事件名 | `data` JSON 结构 | 触发时机与规定 |
|---|---|---|
| `meta` | `{"message_id":"m_8f3a","created_at":"2026-11-06T10:20:13+08:00","model":"mock-0.1"}` | 流启动时发送且仅发送一次 |
| `delta` | `{"text":"你好"}` | 每次产出增量文本块时发送，可发送多次 |
| `done` | `{"finish_reason":"stop","duration_ms":1820}` | 回复正常生成完毕时发送一次，随后结束流 |
| `error` | `{"code":"stream_error","message":"回复生成失败"}` | 流式生成中途发生异常时发送一次，随后结束流 |

### 3.5 后端数据模型与协议（`Assistant/agent/base.py`、`Assistant/api/schemas.py`）

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

### 3.6 前端数据模型与编码约定

- 前端消息对象（`store.js`）：

```js
{
  id: 'm_<uuid>',
  role: 'user' | 'assistant',
  content: '',
  createdAt: Date,
  status: 'done' | 'streaming' | 'error'
}
```

- 前端路由对象（`routes.js`）：

```js
{
  hash: '#/chat',
  label: '对话',
  title: '对话',
  view: 'chat' | 'placeholder',
  icon: 'icon-chat',
  description: ''
}
```

- 命名与格式规定：
  - Python：函数/变量 `snake_case`，类 `PascalCase`，常量 `UPPER_SNAKE_CASE`，4 空格缩进，公开函数写一行中文 docstring。
  - JavaScript：函数/变量 `camelCase`，常量 `UPPER_SNAKE_CASE`，2 空格缩进，分号结尾，单引号字符串，ES Modules。
  - CSS：BEM 命名（`block__element--modifier`），状态类 `is-active` / `is-disabled` / `is-streaming` / `is-error`，禁止使用 `#id` 选择器写样式，颜色与尺寸统一引用 `--color-*`、`--text-*`、`--space-*`、`--radius-*`、`--layout-*`、`--motion-*`。

---

## 四、需求列表

### A 第一版

#### A1.0 工作台外壳

##### A1.1 技术基线

**A1_1_1 Python 3.12 虚拟环境与精简依赖**
- 状态：已完成
- 需求描述：建立项目内独立的 Python 3.12 虚拟环境，仅引入 FastAPI 与 Uvicorn 两项直接依赖。
- 详细方案设计：
  1. 在根目录提供 `requirements.txt`，固定 `fastapi>=0.115,<1.0` 与 `uvicorn>=0.34,<1.0`，不安装 `uvicorn[standard]` 以规避 Windows 原生扩展编译问题。
  2. 使用 `py -V:Astral\CPython3.12.13 -m venv .venv` 创建 `.venv`，并通过 `.gitignore` 忽略 `.venv/` 与 `__pycache__/`。

**A1_1_2 原生前端与同源静态托管**
- 状态：已完成
- 需求描述：前端采用零构建的原生 HTML / CSS / ES Modules，由 FastAPI 进程同源托管并禁用静态缓存。
- 详细方案设计：
  1. 在 `Assistant/app.py` 创建 `FastAPI` 实例时设置 `docs_url=None`、`redoc_url=None`（防止加载外部 CDN 资源），保留 `openapi_url="/api/openapi.json"`。
  2. 注册 HTTP 中间件 `no_cache_static_middleware`：对所有非 `/api` 前缀的 `GET` 请求剥离 `If-None-Match` 与 `If-Modified-Since` 条件请求头，并将响应头设为 `Cache-Control: no-store, no-cache, must-revalidate`，强制返回 `200 OK` 最新静态资源，杜绝 `304 Not Modified` 复用旧缓存响应。
  3. 在 `/api` 路由注册完成后，使用 `StaticFiles(directory=str(WEB_DIR), html=True)` 挂载到 `/`。
  4. 在挂载静态目录前调用 `mimetypes.add_type("text/javascript", ".js")` 与 `mimetypes.add_type("text/css", ".css")`，规避 Windows 注册表将 `.js` 映射为 `text/plain` 导致浏览器拒绝执行 ES Modules 的问题。

**A1_1_3 离线内联图标库与系统字体栈**
- 状态：已完成
- 需求描述：所有图标与字体均离线自包含，不发起任何外部字体、图标或图片请求。
- 详细方案设计：
  1. 在 `Assistant/web/index.html` 的 `<head>` 中使用内联 SVG data URI 设置 `favicon`，避免 `/favicon.ico` 404。
  2. 在 `<body>` 顶部放置隐藏 `<svg class="app-svg-sprite" aria-hidden="true">`，内联定义 `icon-brand`、`icon-chat`、`icon-database`、`icon-mail`、`icon-device`、`icon-settings`、`icon-send` 共 7 个 `24x24` 线性图标 symbol（`stroke="currentColor"`、`stroke-width="1.6"`）。
  3. 在 `Assistant/web/js/icons.js` 导出冻结常量 `ICONS`，通过 `dom.js` 的 `createSvgIcon(symbolId, className)` 动态创建 `<svg><use href="#..."></use></svg>`。

##### A1.2 启动与访问

**A1_2_1 模块化单命令启动入口**
- 状态：已完成
- 需求描述：支持在项目根目录通过一条命令启动服务，并在控制台输出可访问地址。
- 详细方案设计：
  1. 实现 `Assistant/__main__.py` 的 `main()`：首先调用 `sys.stdout.reconfigure(encoding="utf-8")` 与 `sys.stderr.reconfigure(encoding="utf-8")` 消除 Windows 控制台中文乱码。
  2. 从 `Assistant/config.py` 读取 `HOST`（默认 `127.0.0.1`）与 `PORT`（默认 `8000`），打印 `Emibot 已启动：http://{HOST}:{PORT}`。
  3. 直接传入 `app` 实例调用 `uvicorn.run(app, host=HOST, port=PORT, log_level="info")`，无需激活虚拟环境即可通过 `.\.venv\Scripts\python.exe -m Assistant` 启动。

**A1_2_2 配置读取与健康检查端点**
- 状态：已完成
- 需求描述：集中校验环境变量配置，并提供 `GET /api/health` 供启动自检与运行确认。
- 详细方案设计：
  1. 在 `Assistant/config.py` 初始化名称为 `assistant` 的标准库 `logging` 记录器（格式 `%(asctime)s %(levelname)s %(name)s %(message)s`），实现 `_read_int_env(name, default, min_value)`，对空串、非整数或越界值打印 warning 并回退默认值。
  2. 在 `Assistant/api/health.py` 实现 `GET /api/health`，返回 `status="ok"`、`version=APP_VERSION`、`agent` 名称与本地 ISO 8601 时间戳。

**A1_2_3 一键启动文件与自动弹出默认浏览器**
- 状态：已完成
- 需求描述：在项目根目录提供一键启动文件 `start.bat`，打开后直接启动后端服务，并在服务就绪后自动用系统默认浏览器弹出工作台网页。
- 详细方案设计：
  1. 在项目根目录新增 `start.bat`：切换代码页为 UTF-8（`chcp 65001 >nul`），定位到脚本所在目录（`cd /d "%~dp0"`），自动清理仍占用 `8000` 端口的旧服务进程，设置环境变量 `ASSISTANT_OPEN_BROWSER=1`，调用 `".\.venv\Scripts\python.exe" -m Assistant` 启动服务；若异常退出则执行 `pause` 保留窗口便于查看报错。
  2. 在 `Assistant/config.py` 新增布尔配置 `OPEN_BROWSER`（当环境变量 `ASSISTANT_OPEN_BROWSER` 为 `"1"` 或 `"true"` 时为 `True`，默认 `False`）。
  3. 在 `Assistant/__main__.py` 中：当 `OPEN_BROWSER` 为 `True` 时，在调用 `uvicorn.run()` 前启动一个守护线程 `_open_browser_when_ready(host, port)`，轮询 `http://{host}:{port}/api/health` 直到返回 `200`（最长等待 5 秒），随即调用标准库 `webbrowser.open(f"http://{host}:{port}/")` 自动弹出默认浏览器。

##### A1.3 后台布局

**A1_3_1 顶栏、侧栏与内容区三段式外壳**
- 状态：已完成
- 需求描述：搭建仿 AstrBot 风格的顶栏、左侧常驻导航栏与右侧主内容区，整页 100vh 无双滚动条。
- 详细方案设计：
  1. 在 `Assistant/web/index.html` 构建顶栏 `.app-header`（包含品牌链接 `.app-brand`、分隔线、当前页标题 `#page-title`、弹性空白、`Mock 模式` 徽标与版本号 `v0.1.0`）与主体 `.app-body`。
  2. `.app-body` 左侧为 `.app-sidebar`（含 `<nav class="nav" aria-label="主导航"><ul class="nav__list" id="nav-list"></ul></nav>` 与底部 `.app-sidebar__footer` 运行状态点），右侧为 `<main class="app-main" id="main-content">`。
  3. 在 `Assistant/web/css/layout.css` 中固定 `.app-header` 高 `50px`、`.app-sidebar` 宽 `235px`，`body` 设为 `height: 100vh; overflow: hidden`，仅允许 `.nav` 与对话滚动区 `.chat__scroll` 各自内部滚动。

##### A1.4 导航五项

**A1_4_1 路由表配置源与动态导航渲染**
- 状态：已完成
- 需求描述：按固定顺序渲染"对话、个人数据库、管理 Mail、手机端联动、配置"五个导航入口，并支持悬停与选中高亮。
- 详细方案设计：
  1. 在 `Assistant/web/js/routes.js` 定义冻结数组 `ROUTES`，依次配置 `#/chat`、`#/database`、`#/mail`、`#/device`、`#/settings` 五项路由的 `hash`、`label`、`title`、`view`、`icon` 与 `description`。
  2. 在 `Assistant/web/js/main.js` 的 `buildNavList()` 中遍历 `ROUTES`，使用 `document.createElement` 生成 `<li class="nav__item"><a class="nav__link" href="..." title="...">` 节点并挂载到 `#nav-list`。
  3. 在 `Assistant/web/css/components.css` 中设置 `.nav__link` 高 `40px`、圆角 `8px`；悬停态应用 `--color-primary-softer` 背景与主色文字；激活态 `.is-active` 应用 `--color-primary-soft` 背景、主色文字与 `aria-current="page"`。

##### A1.5 默认落地页

**A1_5_1 根地址与未知 Hash 重定向至对话页**
- 状态：已完成
- 需求描述：访问根路径或输入未定义的 hash 时，自动落到 `#/chat` 对话主窗口且不污染浏览器历史栈。
- 详细方案设计：
  1. 在 `Assistant/web/js/routes.js` 导出 `DEFAULT_HASH = '#/chat'` 与查询函数 `findRouteByHash(rawHash)`。
  2. 在 `Assistant/web/js/router.js` 的 `syncRoute()` 中检查 `window.location.hash`：当结果为空或 `findRouteByHash` 返回 `null` 时，调用 `window.history.replaceState(null, '', targetUrl)` 将地址替换为 `#/chat` 并加载对话路由。

##### A1.6 页面切换

**A1_6_1 Hashchange 监听与常驻视图显隐切换**
- 状态：已完成
- 需求描述：点击导航或浏览器前进/后退时同步更新地址栏、顶栏标题、文档标题与主内容区视图，刷新后保持当前页。
- 详细方案设计：
  1. 在 `Assistant/web/js/router.js` 监听 `window` 的 `hashchange` 事件并在初始化时立即执行一次 `syncRoute()`。
  2. 每次路由同步时：将 `#page-title` 更新为 `route.title`，将 `document.title` 更新为 `${route.title} · Emibot`，更新 `.nav__link` 的 `.is-active` 与 `aria-current`。
  3. 视图切换采用显隐控制：当 `route.view === 'chat'` 时设 `#view-chat.hidden = false`、`#view-placeholder.hidden = true`；反之隐藏 `#view-chat`、显示 `#view-placeholder` 并触发 `onRouteRender(route)`，确保对话页 DOM 状态与滚动位置在切页时不丢失。

##### A1.7 占位页

**A1_7_1 四页共用空状态视图组件**
- 状态：已完成
- 需求描述：个人数据库、管理 Mail、手机端联动、配置四页展示统一的居中空状态提示，不含任何交互控件。
- 详细方案设计：
  1. 在 `Assistant/web/js/views/placeholder.js` 实现 `renderPlaceholder(container, route)`：使用 `el()` 与 `createSvgIcon()` 构建 `.placeholder` 容器，依次包含 `.placeholder__icon`（72px 圆底 + 48px 图标）、`h2.placeholder__title`、`.badge.badge--neutral`（"尚未开放"）与 `p.placeholder__text`（路由说明文案）。
  2. 通过 `container.replaceChildren(cardEl)` 替换 `#view-placeholder` 子节点，并在 `components.css` 中设置 `.view--placeholder` 水平与垂直居中，最大宽度 `420px`。

##### A1.8 主题

**A1_8_1 深色主题 CSS 变量令牌体系**
- 状态：已完成
- 需求描述：全站统一深色主题，所有颜色、字号、圆角、间距与布局尺寸集中定义在 CSS 变量中。
- 详细方案设计：
  1. 在 `Assistant/web/css/tokens.css` 的 `:root` 中声明 `color-scheme: dark` 及全部令牌：背景 `--color-bg: #1a1a1a`、表面 `--color-surface: #242424`、主色 `--color-primary: #5ba4d4`、边框 `--color-border: #333333`、文本层级、间距 `--space-1`~`--space-7`、圆角 `--radius-sm`~`--radius-pill` 与布局尺寸变量。
  2. 在 `base.css`、`layout.css`、`components.css`、`chat.css` 中全部通过 `var(--*)` 引用令牌，不为组件写死颜色常量，为后续扩展浅色主题预留挂载点。

##### A1.9 屏幕适配

**A1_9_1 三档响应式断点与图标栏折叠**
- 状态：已完成
- 需求描述：适配桌面、平板与手机三种视口宽度，窄屏下侧栏自动折叠为图标栏且不出现横向滚动条。
- 详细方案设计：
  1. 在 `Assistant/web/css/layout.css` 与 `components.css` 设置两处媒体查询断点：
     - `< 1024px`（平板 `768px ~ 1023px`）：`.app-sidebar` 宽度收窄为 `var(--layout-sidebar-compact)`（`72px`），`.nav__label` 与 `.app-sidebar__footer-text` 使用 clip 隐藏但保留 DOM 供读屏器读取，图标居中并依赖 `<a title="...">` 提供悬停提示。
     - `< 768px`（手机）：`.app-sidebar` 宽度收窄为 `var(--layout-sidebar-mobile)`（`64px`），隐藏顶栏 `.app-brand__name` 与 `.app-header__version`，`.view--chat` 移除左右内边距。
  2. `.app-main` 设置 `min-width: 0; overflow: hidden`，确保任何宽度下不产生横向溢出。

---

#### A2.0 对话主窗口

##### A2.1 消息输入

**A2_1_1 对话页输入区 DOM 与自适应高度文本域**
- 状态：已确认
- 需求描述：在对话页底部提供固定输入区，支持多行自动增高与最大高度内部滚动。
- 详细方案设计：
  1. 在 `Assistant/web/index.html` 的 `#view-chat` 底部增加 `.chat__composer`，内含排队提示 `<p class="composer__queue" id="composer-queue" hidden></p>`、表单 `<form class="composer" id="composer">`（包含 `<textarea class="composer__input" id="composer-input" rows="1" maxlength="4000">` 与 `<button class="composer__send" id="send-button" type="submit" disabled>`）以及快捷键提示 `.composer__hint`。
  2. 在 `Assistant/web/css/chat.css` 设置 `.composer` 最大宽度 `860px` 居中，`--color-surface` 背景、`1px solid var(--color-border-strong)`、`16px` 圆角；`:focus-within` 时边框变为 `--color-primary` 并附加 `3px` `--color-primary-softer` 外圈。
  3. 在 `Assistant/web/js/views/chat.js` 监听 `input` 事件，每次输入将 `textarea.style.height` 先设为 `'auto'`，再设为 `${Math.min(textarea.scrollHeight, 200)}px`，实现 1 行至 `200px` 自动伸缩。

**A2_1_2 键盘快捷键与中文输入法组合保护**
- 状态：已确认
- 需求描述：实现 Enter 发送、Shift + Enter 换行，并拦截中文输入法候选词组合期间的 Enter 键。
- 详细方案设计：
  1. 在 `views/chat.js` 中维护布尔状态 `isComposing = false`，监听 `#composer-input` 的 `compositionstart`（设为 `true`）与 `compositionend`（设为 `false`）。
  2. 监听 `#composer-input` 的 `keydown` 事件：当 `event.key === 'Enter' && !event.shiftKey` 时，若 `isComposing || event.isComposing` 为真则直接返回不处理；否则调用 `event.preventDefault()` 并触发消息提交流程。

##### A2.2 空白消息拦截

**A2_2_1 发送按钮可用态联动与提交双重校验**
- 状态：已确认
- 需求描述：当输入框为空或仅含空白字符时禁用发送按钮，输入有效字符后立即启用。
- 详细方案设计：
  1. 在 `views/chat.js` 实现 `syncSendButtonState()`：读取 `composerInput.value.trim().length === 0`，据此设置 `sendButton.disabled`。
  2. 在 `input` 事件与发送清空后均调用 `syncSendButtonState()`；在 `submit` 处理函数中再次校验 `const content = composerInput.value.trim()`，若为空则直接中止发送。
  3. 在 `chat.css` 中设置 `.composer__send:disabled` 使用弱化背景与 `--color-text-muted` 图标，光标设为 `cursor: not-allowed`。

##### A2.3 用户消息上屏

**A2_3_1 立即追加用户消息并重置输入框**
- 状态：已确认
- 需求描述：点击发送或按 Enter 后，用户消息立即追加至消息列表末尾，同时清空输入框并保持输入焦点。
- 详细方案设计：
  1. 在 `Assistant/web/js/store.js` 实现 `addUserMessage(content)`：构造 `{ id, role: 'user', content, createdAt: new Date(), status: 'done' }` 推入 `store.messages` 并返回该对象。
  2. 在 `views/chat.js` 的发送处理函数中：首次发送时设置 `#chat-empty.hidden = true`，调用 `appendMessageNode(userMsg)` 将气泡插入 `#messages`，随后将 `composerInput.value = ''`、重置高度为一行、调用 `syncSendButtonState()` 并执行 `composerInput.focus()`。

##### A2.4 双方消息分列

**A2_4_1 左右分列布局与差异化气泡样式**
- 状态：已确认
- 需求描述：用户消息靠右显示为主色淡底气泡，Agent 消息靠左显示为深色卡片气泡。
- 详细方案设计：
  1. 在 `views/chat.js` 渲染单条消息为 `<article class="msg msg--user|msg--agent" data-message-id="...">`，内部包含 `<div class="msg__bubble"><p class="msg__text"></p></div>` 与 `<time class="msg__time">`。
  2. 在 `Assistant/web/css/chat.css` 中设置：
     - `.msg--user`：`align-self: flex-end`、`align-items: flex-end`，最大宽度 `60%`（手机 `< 768px` 为 `82%`），`.msg__bubble` 使用 `--color-primary-soft` 背景、圆角 `16px 16px 4px 16px`、内边距 `10px 16px`。
     - `.msg--agent`：`align-self: flex-start`、`align-items: flex-start`，最大宽度 `760px`（手机 `< 768px` 为 `92%`），`.msg__bubble` 使用 `--color-surface` 背景、`1px solid var(--color-border)`、圆角 `16px 16px 16px 4px`、内边距 `12px 16px`。
  3. 消息正文统一通过 `textContent` 写入，`.msg__text` 设置 `white-space: pre-wrap; overflow-wrap: anywhere`。

##### A2.5 消息顺序与滚动

**A2_5_1 顺序追加与智能触底滚动控制**
- 状态：已确认
- 需求描述：消息严格按创建顺序追加；新消息上屏必滚到底部；流式输出期间若用户手动上滑查看历史则暂停自动跟随。
- 详细方案设计：
  1. 在 `views/chat.js` 维护布尔变量 `shouldAutoScroll = true`，监听滚动容器 `#chat-scroll` 的 `scroll` 事件，通过 `dom.js` 的 `isNearBottom(chatScrollEl, 80)` 实时更新 `shouldAutoScroll`。
  2. 当用户发送新消息或新增 Agent 占位消息时，将 `shouldAutoScroll` 置为 `true` 并立即调用 `scrollToBottom(chatScrollEl)`（直接设置 `scrollTop = scrollHeight`，不使用 smooth 动画以防流式抖动）。
  3. 在流式 `delta` 更新帧内，仅当 `shouldAutoScroll === true` 时才调用 `scrollToBottom(chatScrollEl)`。

##### A2.6 时间戳

**A2_6_1 本地时区格式化与气泡下方展示**
- 状态：已确认
- 需求描述：每条消息气泡下方展示 `YYYY-MM-DD HH:mm` 本地时间戳，不做相对时间与日期分隔线。
- 详细方案设计：
  1. 使用 `Assistant/web/js/dom.js` 已实现的 `formatTimestamp(dateInput)` 生成本地时间字符串 `YYYY-MM-DD HH:mm`，同时将 `<time class="msg__time">` 的 `datetime` 属性设为 `date.toISOString()`。
  2. 用户消息取发送时刻的本地 `new Date()`；Agent 消息先取占位创建时刻，收到服务端 `meta.created_at` 后解析并更新 `<time>` 的 `datetime` 与显示文本。
  3. 在 `chat.css` 中设置 `.msg__time` 位于气泡下方 `6px`，字号 `--text-xs`（`11px`），颜色 `--color-text-muted`，并启用 `font-variant-numeric: tabular-nums`。

##### A2.7 头像

**A2_7_1 无头像纯气泡卡片结构**
- 状态：已确认
- 需求描述：对话列表中不渲染用户或 Agent 头像，依靠对齐方向与卡片边框底色区分角色。
- 详细方案设计：
  1. `.msg` DOM 结构仅包含 `.msg__bubble` 与 `.msg__time` 两个直接子元素，不预留头像槽位或左侧缩进。
  2. `.msg--agent .msg__bubble` 通过 `--color-surface` 背景色与 `1px solid var(--color-border)` 描边在 `--color-bg`（`#1a1a1a`）画布上形成清晰边界。

##### A2.8 会话模型

**A2_8_1 单一内存会话流与常驻视图**
- 状态：已确认
- 需求描述：全应用仅维护单一对话流，不提供多会话列表，消息保存在浏览器内存中，刷新页面即清空。
- 详细方案设计：
  1. 在 `Assistant/web/js/store.js` 中定义单例状态（`messages: []`、`queue: []`、`isStreaming: false`），不读写 `localStorage`、`sessionStorage` 或 `IndexedDB`。
  2. 页面首次加载或浏览器刷新时，`store.messages` 为空，`#chat-empty` 显示"开始和 Agent 对话"空状态；在应用内切换五项导航时，`#view-chat` 仅切换 `hidden` 属性，不销毁已渲染的消息节点。

##### A2.9 回复期间可继续输入

**A2_9_1 历史快照发送队列与串行流式调度**
- 状态：已确认
- 需求描述：Agent 流式回复期间不锁定输入框，新发送的用户消息立即上屏并进入先进先出队列依次请求回复。
- 详细方案设计：
  1. 用户每次发送消息时，立即将用户消息追加到 `store.messages` 并渲染上屏，同时截取截至该条用户消息的对话历史快照（仅含已完成的 `user` / `assistant` 消息，最多保留最近 30 条），推入 `store.queue`。
  2. 在 `views/chat.js` 实现队列消费者 `processQueue()`：若 `store.isStreaming` 为 `true`，则更新 `#composer-queue` 提示文案为 `另有 ${store.queue.length} 条消息等待回复` 并显示；若 `store.isStreaming` 为 `false` 且队列非空，则取出队首快照开始一次新的 `POST /api/chat` 流式请求。
  3. 当前流式请求结束（无论是 `done` 还是 `error`）时，在 `finally` 中调用 `processQueue()` 自动拉起下一条排队请求，队列清空后隐藏 `#composer-queue`。

---

#### A3.0 回复生成

##### A3.1 回复来源

**A3_1_1 本地确定性关键词匹配 Mock 生成器**
- 状态：已完成
- 需求描述：在后端提供无需外网与 API Key 的确定性 Mock 回复生成器，按固定关键词优先级返回纯文本回复。
- 详细方案设计：
  1. 新增 `Assistant/agent/mock_agent.py`，定义 `MockAgent` 类（`name = "mock"`，`model = "mock-0.1"`）。
  2. 提取请求消息列表中最后一条 `role == "user"` 的文本（转小写后匹配），按以下固定顺序命中回复文案（纯文本、60~200 汉字、不含 Markdown 符号与 emoji）：
     - 含 `你好` / `hello` / `hi`：问候并说明当前为本地 Mock 模式及可体验的对话能力。
     - 含 `你是谁` / `介绍` / `名字`：说明自己是 Emibot，用于演示对话主流程与流式输出。
     - 含 `学习` / `怎么学` / `agent`：给出三步学习建议（先跑通对话闭环、再理解工具调用、最后构建记忆）。
     - 含 `数据库` / `记忆` / `笔记`：说明个人数据库与记忆模块将在后续版本开放。
     - 其他输入：复述用户输入的核心内容，并追问一个具体的 Agent 学习问题。

##### A3.2 回复逻辑集中

**A3_2_1 Agent 协议抽象与唯一工厂替换点**
- 状态：已完成
- 需求描述：定义统一的 `Agent` 协议并通过 `factory.py` 暴露唯一获取入口，使路由层与具体 Mock 实现解耦。
- 详细方案设计：
  1. 在 `Assistant/agent/base.py` 定义 `ChatMessage` 与 `Agent(Protocol)`（包含属性 `name: str` 与方法 `stream_reply(self, messages: Sequence[ChatMessage]) -> AsyncIterator[str]`）。
  2. 在 `Assistant/agent/factory.py` 实现单例工厂函数 `get_agent() -> Agent`，内部实例化 `MockAgent()`；同时让 `Assistant/api/health.py` 改为通过 `get_agent().name` 返回当前 Agent 名称。
  3. `Assistant/api/chat.py` 只导入 `get_agent` 与 `Agent` 协议，不直接导入 `MockAgent`；后续替换为真实大模型时仅需新增实现类并修改 `factory.py` 一行构造代码。

##### A3.3 接口形态

**A3_3_1 请求模型校验与 SSE 流式路由实现**
- 状态：已完成
- 需求描述：实现 `POST /api/chat` 路由，完成请求合法性校验并以 `text/event-stream` 按序推送 `meta`、`delta`、`done` / `error` 事件。
- 详细方案设计：
  1. 在 `Assistant/api/schemas.py` 定义 `ChatRequest(BaseModel)`：校验 `messages` 长度 `1..30`、每条 `content.strip()` 非空且长度 `<= 4000`、最后一条 `role == "user"`，违反时由 FastAPI 自动返回 `422`。
  2. 在 `Assistant/api/chat.py` 实现 `POST /api/chat`：使用 `StreamingResponse` 包装异步生成器，首先发送 `event: meta`，随后遍历 `agent.stream_reply(req.messages)` 逐块发送 `event: delta`，完成后计算耗时发送 `event: done` 并打印统计日志 `messages=N last_user_chars=M reply_chars=K duration_ms=T`（不打印消息正文）。
  3. 异常处理：捕获 `asyncio.CancelledError` 时记录 `logger.debug` 并安静退出；捕获其他异常时记录 `logger.exception` 并下发 `event: error` 事件。

---

#### A4.0 逐字输出

##### A4.1 逐字显示

**A4_1_1 后端按字符切片与异步延时推送**
- 状态：已完成
- 需求描述：后端将完整回复按固定字符数切片并在块间异步等待，形成稳定的服务端流式推送节奏。
- 详细方案设计：
  1. 在 `MockAgent.stream_reply()` 中读取 `Assistant/config.py` 的 `CHUNK_SIZE`（默认 `1`）与 `STREAM_DELAY_MS`（默认 `20`）。
  2. 首块直接 `yield`，后续每块前执行 `await asyncio.sleep(STREAM_DELAY_MS / 1000.0)`，确保首字节在 50ms 内发出、整条回复在 1~4 秒内平滑输出完毕。

**A4_1_2 前端 Fetch ReadableStream SSE 解析器**
- 状态：已确认
- 需求描述：前端使用 `fetch` + `ReadableStream` + `TextDecoder` 实时解析 `POST /api/chat` 返回的 SSE 事件流。
- 详细方案设计：
  1. 在 `Assistant/web/js/api.js` 实现 `streamChat({ messages, signal, onMeta, onDelta, onDone, onError })`。
  2. 若响应 `!response.ok`，读取错误体并触发 `onError`；若为 `200`，通过 `response.body.getReader()` 循环读取字节流，使用 `TextDecoder('utf-8')` 解码并按 `\r?\n\r?\n` 切分完整事件块，提取 `event:` 与 `data:` 行后回调对应处理函数。

**A4_1_3 等待三点动画、闪烁光标与帧合并渲染**
- 状态：已确认
- 需求描述：流式请求发起后先显示三点等待动画，收到增量文本后逐字追加并显示闪烁光标，完成或报错时优雅收尾。
- 详细方案设计：
  1. 请求发起时插入 `.msg--agent.is-streaming` 节点，气泡内含 `.msg__waiting`（三个 6px 圆点透明度循环动画）与 `.msg__text`。
  2. 收到首个 `delta` 时移除 `.msg__waiting`；使用 `requestAnimationFrame` 合并同一渲染帧内的多次 `delta` 文本追加，流式期间 `.msg--agent.is-streaming .msg__text::after` 显示 `2px` 宽的主色闪烁竖线光标。
  3. 收到 `done` 时移除 `.is-streaming` 类（光标消失），更新消息状态为 `done`；若流开始前失败则将文本设为"连接失败，请确认后端服务正在运行。"，若流中途失败则保留已生成文本并追加弱化提示"回复生成中断，请重试。"，同时赋予 `.is-error` 样式。

---

#### A5.0 工程与文档约定

##### A5.1 Git 流程

**A5_1_1 功能分支开发、No-FF 合并与远端即时同步**
- 状态：已确认
- 需求描述：严格执行 `feature/<name>` 分支开发、每次提交后推送远端、验收后 `--no-ff` 合并回 `main` 且保留已合并分支。
- 详细方案设计：
  1. 每个阶段从最新 `main` 切出对应功能分支（`feature/app-shell`、`feature/mock-agent`、`feature/chat-window`、`feature/first-release`）。
  2. 每次提交完成后立即执行 `git push origin <branch>`；人工验收通过后切回 `main` 执行 `git merge --no-ff <branch>` 并推送 `origin/main`，不删除任何功能分支。

##### A5.2 提交信息

**A5_2_1 精准暂存、自审与 Conventional Commits 规范**
- 状态：已确认
- 需求描述：提交信息遵循 `<type>(<scope>): <subject>` 格式，禁止盲目全量暂存，确保每次提交职责单一。
- 详细方案设计：
  1. 提交前固定执行 `git status -s` -> `git add <明确路径>` -> `git diff --cached` 逐行复核，严禁使用 `git add .` 或 `git add -A`。
  2. Windows 环境下含中文的提交信息统一写入临时文件后通过 `git commit -F <file>` 提交，随后删除临时文件，防止终端编码破坏中文提交记录。

##### A5.3 文档职责

**A5_3_1 四份核心文档边界隔离**
- 状态：已确认
- 需求描述：`README.md`、`Intent.md`、`Spec.md`、`Memory.md` 各司其职，开头声明职责边界且全文不使用 emoji。
- 详细方案设计：
  1. `README.md` 仅保留简介、当前状态、运行方式、目录概览与文档导航；`Intent.md` 仅保留背景与目标、当前状态、需求列表（`A{x}.{y}`）；`Spec.md` 仅保留目录结构、架构、接口与数据规定、需求列表（`Ax_y_z`）；`Memory.md` 仅保留当前状态、已做决定及理由、踩过的坑、下一步。

##### A5.4 文档同步

**A5_4_1 规格先行与里程碑文档同步**
- 状态：已确认
- 需求描述：实现偏离规格时先更新 `Spec.md` 并在 `Memory.md` 记录原因，每个功能完成时同步更新文档。
- 详细方案设计：
  1. 任何接口、结构或交互调整必须先修改 `Spec.md` 对应 `Ax_y_z` 条目；废弃子项保留原 `Ax_y_z` 编号并标注 `状态：已废弃`。
  2. 每个功能分支验收合并前，同步更新 `Spec.md` 中对应子项的状态为 `已完成`，并在 `Memory.md` 更新当前进度与下一步计划。

##### A5.5 分工

**A5_5_1 需求验收与代码实现角色分离**
- 状态：已确认
- 需求描述：主 Agent 负责需求维护与人工验收清单核对，实现方 Agent 按 `Spec.md` 编写代码与自测。
- 详细方案设计：
  1. 实现方严格依据 `Spec.md` 中的 `Ax_y_z` 方案编写代码并执行命令行接口与静态资源冒烟验证。
  2. 每个功能分支完成后交由 Fibel / 主 Agent 依据 `Intent.md` 的验收标准逐条核验，确认通过后方可执行分支合并。
