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
│       ├── index.html           应用外壳 + 内联 SVG 图标库（含品牌、导航、发送、新建、编辑、删除）
│       ├── css/
│       │   ├── tokens.css       设计令牌（颜色、圆角、间距、字号、布局）
│       │   ├── base.css         reset、排版、滚动条、可访问性基础
│       │   ├── layout.css       顶栏、主侧栏（含缩略态）、内容区、响应式断点
│       │   ├── components.css   导航项、徽标、状态圆点、按钮、占位页
│       │   └── chat.css         对话页双列布局、会话列表侧栏、空状态、消息气泡、输入区
│       └── js/
│           ├── main.js          启动入口：构建导航、初始化路由、装配视图
│           ├── routes.js        路由与导航的唯一配置源
│           ├── icons.js         SVG symbol 的 id 常量
│           ├── router.js        hash 路由解析、主侧栏折叠切换与视图显隐
│           ├── store.js         多会话状态、草稿管理、消息列表与发送队列
│           ├── api.js           SSE 客户端
│           ├── dom.js           DOM 工具与时间戳格式化函数
│           └── views/
│               ├── chat.js      对话工作区与会话列表视图控制器
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
│   ├── views/chat.js（对话工作区 + 会话列表栏）── store.js ── api.js
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
| `router.js` | 解析 hash、主侧栏折叠切换、切换视图、更新导航高亮与 `document.title` | `routes.js` |
| `store.js` | 多会话管理、当前活动会话与草稿文字维护、消息列表、发送队列、流状态、ID 与时间戳生成 | `dom.js` |
| `api.js` | 组装请求、解析 SSE、回调 `meta` / `delta` / `done` / `error` | 无 |
| `dom.js` | `el()`、`createSvgIcon()`、`formatTimestamp()`、`scrollToBottom()`、`isNearBottom()` | 无 |
| `views/chat.js` | 对话页 DOM、会话列表渲染、新建/重命名/删除会话、输入保留与丢弃、队列驱动、滚动控制 | `store.js`、`api.js`、`dom.js` |
| `views/placeholder.js` | 占位页渲染 | `routes.js`、`dom.js` |
| `icons.js` | SVG symbol id 常量 | 无 |

- 依赖方向严格自上而下，禁止视图模块之间互相 `import`，禁止 `api.js` 操作 DOM。

### 2.3 对话全链路时序与状态归属

1. 浏览器加载 `/`，`main.js` 根据 `routes.js` 生成侧栏导航，`router.js` 解析 hash；无 hash 或非法 hash 时替换为 `#/chat`。
2. 路由进入对话页（`#/chat`）时，左侧主导航自动收缩为仅显示图标的缩略态，紧邻展开会话列表栏；首次加载默认处于未创建的空白草稿态（`activeSessionId = null`），输入框可用，消息区显示空状态。
3. 草稿状态统一实时写入：监听输入框的 `input` 事件，每次键入实时将最新内容写入当前活动目标：
   - 若处于空白草稿态（`activeSessionId === null`），实时写入 `store.draftText`；
   - 若处于既有会话（`activeSessionId !== null`），实时写入对应会话的 `session.draft`；
   - 切换会话或切离对话页时无需依赖离场钩子，切回时直接从目标对象读取回填并联动自适应高度与发送按钮状态。
4. 用户发送消息与全局排队流转：
   - 若在草稿态发送首条消息：自动按 `Array.from(trimmed.replace(/\s+/g, ' ')).slice(0, 10).join('')` 截取生成标题并创建新会话，设为 `activeSessionId` 并加入会话列表头部；
   - 用户消息与时间戳立即上屏，输入框清空并聚焦；对应会话内存追加状态为 `streaming` 的 Agent 占位消息（界面显示三点等待动画）；
   - 请求快照（含 `sessionId`、`messageId` 与历史切片）推入全局 FIFO 发送队列 `store.queue`；
   - 全局调度并发策略：采用串行单流调度（`isStreaming` 为全局锁），若当前已有流在进行，新发送的消息在列表中正常上屏展示等待态，并在输入区显示排队提示，等待上一请求完成后自动调度出队执行。
5. SSE 流式响应与重绘节点动态绑定：
   - 后端通过 `POST /api/chat` 下发 `text/event-stream`；
   - 前端接收增量 `delta` 时，首先无条件追加至内存中对应会话消息对象的 `content`；
   - DOM 更新通过 `document.querySelector(`[data-message-id="${messageId}"]`)` 动态定位 Agent 卡片节点并写入文本（使用 `textContent`）；
   - 切走再切回场景：若用户在流式期间切换到其他会话后再切回，视图执行全量重绘时将渲染持有相同 `data-message-id` 的最新卡片节点，后续到达的 `delta` 依然能通过选择器无缝接管并继续追加文字与滚动，彻底避免闭包 DOM 节点失效问题；若当前未停留在该会话，则静默更新内存，不触碰当前视口 DOM。
6. 流式中断与删除保护：
   - 每次发起流式请求时在全局保存 `currentAbortController`；
   - 若流式进行中用户删除了当前正在输出的会话：前端立即调用 `abortController.abort()` 中止连接，将全局 `isStreaming` 重置为 `false`，清理队列中属于该会话的所有排队项，并调用 `syncSendButtonState()` 恢复发送按钮，防止状态死锁，然后调度队列中下一条请求。
7. 会话交互与重命名安全流转：
   - 点击"新建对话"：从既有会话点击时进入草稿态并恢复此前暂存的 `store.draftText`（若有）；只有当前本来就在草稿态时再次点击"新建对话"，才彻底清空丢弃 `store.draftText` 与输入框文字。
   - 切换会话：直接从目标会话对象恢复其 `draft` 文字，并调用 `renderActiveSession()` 重绘消息区。
   - 重命名防护：操作按钮与输入框绑定 `stopPropagation`；维护 `isCommitted` 标记位杜绝 Esc/Enter 后失焦触发重复保存；中文输入法组合（`isComposing`）期间 Enter 不误触保存；编辑期间局部锁定会话列表禁止全量重绘破坏输入框；标题渲染强制使用 `textContent` 防御 XSS。
8. 状态归属：会话、草稿、消息、队列、流状态仅保存在浏览器内存（`store.js`），刷新页面即清空；后端无状态；对话页 `#view-chat` DOM 常驻，切换路由仅通过 `hidden` 属性显隐。

### 2.4 功能分支拆分

| 顺序 | 分支 | 实现范围 | 对应 Intent 需求 |
|---|---|---|---|
| 1 | `feature/app-shell` | Python 服务骨架、配置、健康检查、静态托管；前端外壳、设计令牌、侧栏导航、顶栏、四个占位页、hash 路由；对话页空状态占位 | A1.1 ~ A1.9 |
| 2 | `feature/mock-agent` | Agent 协议、mock 生成器、工厂、`POST /api/chat` SSE 接口与流式异常处理 | A3.1 ~ A3.3 |
| 3 | `feature/chat-window` | 对话页完整实现：消息列表、气泡、时间戳、输入区、发送队列、SSE 客户端接入、逐字渲染、自动滚动 | A2.1 ~ A2.7、A2.9、A4.1 |
| 4 | `feature/session-list` | 会话列表与导航折叠：多会话模型、延迟创建、导航缩略、会话列表栏、新建/改名/删除、草稿保留与丢弃 | A6.1 ~ A6.11 |
| 5 | `feature/first-release` | 流式失败与网络错误提示、响应式与可访问性收尾、文档同步与第一版全量回归验收 | A1.1 ~ A6.11 |

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

- 前端会话对象（`store.js`）：

```js
{
  id: 's_<timestamp>_<rand>',
  title: '首条消息前10字', // 空白折叠与Unicode安全截取后的标题
  createdAt: Date,
  updatedAt: Date,
  messages: [], // 包含的消息对象列表
  draft: ''     // 该会话中已输入未发送的草稿文本
}
```

- 前端多会话与队列状态（`store.js`）：

```js
{
  activeSessionId: null,           // 当前活动会话 ID；为 null 时表示处于未创建的空白草稿态
  draftText: '',                   // 空白草稿态中已输入未发送的文字
  sessions: [],                    // 全部已创建会话列表（按时间降序）
  queue: [],                       // 全局发送队列：[{ sessionId, messageId, snapshot }]
  isStreaming: false,              // 全局流式互斥锁：是否正在流式生成回复
  currentAbortController: null     // 当前流式请求的 AbortController 实例，用于会话删除或异常时安全中止
}
```

- 前端消息对象（`store.js`）：

```js
{
  id: 'm_<timestamp>_<rand>',
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

- 核心数据处理与安全规定：
  - 会话标题生成规则：统一使用 `Array.from(rawContent.trim().replace(/\s+/g, ' ')).slice(0, 10).join('')`；先将换行符、制表符及连续空格折叠为单空格，再按 Unicode 码点切片，防止 emoji 等 UTF-16 代理对截断出现乱码。
  - XSS 防御规定：所有用户输入的标题在注入 DOM 时，严禁使用 `innerHTML`，必须使用 `element.textContent` 或 `document.createTextNode` 渲染。
  - 草稿状态写入时机：统一在输入框 `input` 事件触发时实时写入当前活动目标（草稿态存入 `store.draftText`，已有会话存入对应 `session.draft`），会话切换与路由切离时直接复用，不维护分散的时机。

- 命名与格式规定：
  - Python：函数/变量 `snake_case`，类 `PascalCase`，常量 `UPPER_SNAKE_CASE`，4 空格缩进，公开函数写一行中文 docstring。
  - JavaScript：函数/变量 `camelCase`，常量 `UPPER_SNAKE_CASE`，2 空格缩进，分号结尾，单引号字符串，ES Modules。
  - CSS：BEM 命名（`block__element--modifier`），状态类 `is-active` / `is-disabled` / `is-streaming` / `is-error` / `is-editing`，主侧栏缩略态 `.app-sidebar--collapsed`，会话列表组件命名（`.chat-sessions`、`.chat-sessions__header`、`.chat-sessions__reserved`、`.chat-sessions__new-btn`、`.chat-sessions__list`、`.session-item`、`.session-item__title`、`.session-item__actions`、`.session-item__btn`、`.session-item__input`），禁止使用 `#id` 选择器写样式，颜色与尺寸统一引用 `--color-*`、`--text-*`、`--space-*`、`--radius-*`、`--layout-*`、`--motion-*`。

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
- 状态：已完成
- 需求描述：在对话页底部提供固定输入区，支持多行自动增高与最大高度内部滚动。
- 详细方案设计：
  1. 在 `Assistant/web/index.html` 的 `#view-chat` 底部增加 `.chat__composer`，内含排队提示 `<p class="composer__queue" id="composer-queue" hidden></p>`、表单 `<form class="composer" id="composer">`（包含 `<textarea class="composer__input" id="composer-input" rows="1" maxlength="4000">` 与 `<button class="composer__send" id="send-button" type="submit" disabled>`）以及快捷键提示 `.composer__hint`。
  2. 在 `Assistant/web/css/chat.css` 设置 `.composer` 最大宽度 `860px` 居中，`--color-surface` 背景、`1px solid var(--color-border-strong)`、`16px` 圆角；`:focus-within` 时边框变为 `--color-primary` 并附加 `3px` `--color-primary-softer` 外圈。
  3. 在 `Assistant/web/js/views/chat.js` 监听 `input` 事件，每次输入将 `textarea.style.height` 先设为 `'auto'`，再设为 `${Math.min(textarea.scrollHeight, 200)}px`，实现 1 行至 `200px` 自动伸缩。

**A2_1_2 键盘快捷键与中文输入法组合保护**
- 状态：已完成
- 需求描述：实现 Enter 发送、Shift + Enter 换行，并拦截中文输入法候选词组合期间的 Enter 键。
- 详细方案设计：
  1. 在 `views/chat.js` 中维护布尔状态 `isComposing = false`，监听 `#composer-input` 的 `compositionstart`（设为 `true`）与 `compositionend`（设为 `false`）。
  2. 监听 `#composer-input` 的 `keydown` 事件：当 `event.key === 'Enter' && !event.shiftKey` 时，若 `isComposing || event.isComposing` 为真则直接返回不处理；否则调用 `event.preventDefault()` 并触发消息提交流程。

##### A2.2 空白消息拦截

**A2_2_1 发送按钮可用态联动与提交双重校验**
- 状态：已完成
- 需求描述：当输入框为空或仅含空白字符时禁用发送按钮，输入有效字符后立即启用。
- 详细方案设计：
  1. 在 `views/chat.js` 实现 `syncSendButtonState()`：读取 `composerInput.value.trim().length === 0`，据此设置 `sendButton.disabled`。
  2. 在 `input` 事件与发送清空后均调用 `syncSendButtonState()`；在 `submit` 处理函数中再次校验 `const content = composerInput.value.trim()`，若为空则直接中止发送。
  3. 在 `chat.css` 中设置 `.composer__send:disabled` 使用弱化背景与 `--color-text-muted` 图标，光标设为 `cursor: not-allowed`。

##### A2.3 用户消息上屏

**A2_3_1 立即追加用户消息并重置输入框**
- 状态：已完成
- 需求描述：点击发送或按 Enter 后，用户消息立即追加至消息列表末尾，同时清空输入框并保持输入焦点。
- 详细方案设计：
  1. 在 `Assistant/web/js/store.js` 实现 `addUserMessage(content)`：构造 `{ id, role: 'user', content, createdAt: new Date(), status: 'done' }` 推入 `store.messages` 并返回该对象。
  2. 在 `views/chat.js` 的发送处理函数中：首次发送时设置 `#chat-empty.hidden = true`，调用 `appendMessageNode(userMsg)` 将气泡插入 `#messages`，随后将 `composerInput.value = ''`、重置高度为一行、调用 `syncSendButtonState()` 并执行 `composerInput.focus()`。

##### A2.4 双方消息分列

**A2_4_1 左右分列布局与差异化气泡样式**
- 状态：已完成
- 需求描述：用户消息靠右显示为主色淡底气泡，Agent 消息靠左显示为深色卡片气泡。
- 详细方案设计：
  1. 在 `views/chat.js` 渲染单条消息为 `<article class="msg msg--user|msg--agent" data-message-id="...">`，内部包含 `<div class="msg__bubble"><p class="msg__text"></p></div>` 与 `<time class="msg__time">`。
  2. 在 `Assistant/web/css/chat.css` 中设置：
     - `.msg--user`：`align-self: flex-end`、`align-items: flex-end`，最大宽度 `60%`（手机 `< 768px` 为 `82%`），`.msg__bubble` 使用 `--color-primary-soft` 背景、圆角 `16px 16px 4px 16px`、内边距 `10px 16px`。
     - `.msg--agent`：`align-self: flex-start`、`align-items: flex-start`，最大宽度 `760px`（手机 `< 768px` 为 `92%`），`.msg__bubble` 使用 `--color-surface` 背景、`1px solid var(--color-border)`、圆角 `16px 16px 16px 4px`、内边距 `12px 16px`。
  3. 消息正文统一通过 `textContent` 写入，`.msg__text` 设置 `white-space: pre-wrap; overflow-wrap: anywhere`。

##### A2.5 消息顺序与滚动

**A2_5_1 顺序追加与智能触底滚动控制**
- 状态：已完成
- 需求描述：消息严格按创建顺序追加；新消息上屏必滚到底部；流式输出期间若用户手动上滑查看历史则暂停自动跟随。
- 详细方案设计：
  1. 在 `views/chat.js` 维护布尔变量 `shouldAutoScroll = true`，监听滚动容器 `#chat-scroll` 的 `scroll` 事件，通过 `dom.js` 的 `isNearBottom(chatScrollEl, 80)` 实时更新 `shouldAutoScroll`。
  2. 当用户发送新消息或新增 Agent 占位消息时，将 `shouldAutoScroll` 置为 `true` 并立即调用 `scrollToBottom(chatScrollEl)`（直接设置 `scrollTop = scrollHeight`，不使用 smooth 动画以防流式抖动）。
  3. 在流式 `delta` 更新帧内，仅当 `shouldAutoScroll === true` 时才调用 `scrollToBottom(chatScrollEl)`。

##### A2.6 时间戳

**A2_6_1 本地时区格式化与气泡下方展示**
- 状态：已完成
- 需求描述：每条消息气泡下方展示 `YYYY-MM-DD HH:mm` 本地时间戳，不做相对时间与日期分隔线。
- 详细方案设计：
  1. 使用 `Assistant/web/js/dom.js` 已实现的 `formatTimestamp(dateInput)` 生成本地时间字符串 `YYYY-MM-DD HH:mm`，同时将 `<time class="msg__time">` 的 `datetime` 属性设为 `date.toISOString()`。
  2. 用户消息取发送时刻的本地 `new Date()`；Agent 消息先取占位创建时刻，收到服务端 `meta.created_at` 后解析并更新 `<time>` 的 `datetime` 与显示文本。
  3. 在 `chat.css` 中设置 `.msg__time` 位于气泡下方 `6px`，字号 `--text-xs`（`11px`），颜色 `--color-text-muted`，并启用 `font-variant-numeric: tabular-nums`。

##### A2.7 头像

**A2_7_1 无头像纯气泡卡片结构**
- 状态：已完成
- 需求描述：对话列表中不渲染用户或 Agent 头像，依靠对齐方向与卡片边框底色区分角色。
- 详细方案设计：
  1. `.msg` DOM 结构仅包含 `.msg__bubble` 与 `.msg__time` 两个直接子元素，不预留头像槽位或左侧缩进。
  2. `.msg--agent .msg__bubble` 通过 `--color-surface` 背景色与 `1px solid var(--color-border)` 描边在 `--color-bg`（`#1a1a1a`）画布上形成清晰边界。

##### A2.8 会话模型（已废弃）

**A2_8_1 单一内存会话流与常驻视图（已废弃）**
- 状态：已废弃
- 需求描述：全应用仅维护单一对话流，不提供多会话列表，消息保存在浏览器内存中，刷新页面即清空。
- 详细方案设计：
  1. 在 `Assistant/web/js/store.js` 中定义单例状态（`messages: []`、`queue: []`、`isStreaming: false`），不读写 `localStorage`、`sessionStorage` 或 `IndexedDB`。
  2. 页面首次加载或浏览器刷新时，`store.messages` 为空，`#chat-empty` 显示"开始和 Agent 对话"空状态；在应用内切换五项导航时，`#view-chat` 仅切换 `hidden` 属性，不销毁已渲染的消息节点。
  3. 废弃说明：2026-11-06 由 A6.1 到 A6.11（A6_1_1 等实现子项）接替，改为多会话模型与会话列表管理（见 A6.0 子板块）。

##### A2.9 回复期间可继续输入

**A2_9_1 历史快照发送队列与串行流式调度**
- 状态：已完成
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
- 状态：已完成
- 需求描述：前端使用 `fetch` + `ReadableStream` + `TextDecoder` 实时解析 `POST /api/chat` 返回的 SSE 事件流。
- 详细方案设计：
  1. 在 `Assistant/web/js/api.js` 实现 `streamChat({ messages, signal, onMeta, onDelta, onDone, onError })`。
  2. 若响应 `!response.ok`，读取错误体并触发 `onError`；若为 `200`，通过 `response.body.getReader()` 循环读取字节流，使用 `TextDecoder('utf-8')` 解码并按 `\r?\n\r?\n` 切分完整事件块，提取 `event:` 与 `data:` 行后回调对应处理函数。

**A4_1_3 等待三点动画、闪烁光标与帧合并渲染**
- 状态：已完成
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

---

#### A6.0 会话列表

##### A6.1 多会话模型

**A6_1_1 会话数据结构与多会话内存管理**
- 状态：已确认
- 需求描述：对话页支持多个会话，每个会话独立保存自身的消息列表；切换会话只切换显示内容，各会话已产生的消息不丢失、不串扰；会话与消息只存在于内存，刷新页面后清空。
- 详细方案设计：
  1. 在 `Assistant/web/js/store.js` 重构状态树，从单一消息列表升级为多会话状态结构：
     - `sessions`: 会话对象数组，每个会话结构为 `{ id: 's_<timestamp>_<rand>', title: string, createdAt: Date, updatedAt: Date, messages: [], draft: '' }`，按创建或最近活跃时间倒序排列。
     - `activeSessionId`: 当前处于活跃状态的会话 ID，取值为 `string` 或 `null`（`null` 表示当前处于未创建的空白草稿态）。
     - `draftText`: 处于空白草稿态时已输入但尚未发送的文字。
     - `queue`: 全局发送队列，元素为 `{ sessionId: string, messageId: string, snapshot: Array }`。
     - `isStreaming`: 全局流式互斥锁，表示当前是否有网络请求在持续推送中。
     - `currentAbortController`: 当前活跃的 `AbortController` 实例，供跨会话控制与删除中止。
  2. 导出多会话操作函数：`getSessions()`、`getActiveSessionId()`、`getActiveSession()`、`switchSession(sessionId)`、`getActiveMessages()`；所有数据只保留在 JavaScript 运行时内存，不读写 `localStorage`、`sessionStorage` 或 `IndexedDB`。

**A6_1_2 切换会话的消息区重绘与流式动态重绑定**
- 状态：已确认
- 需求描述：用户在会话列表点击切换会话时，消息区立即清空并完整重新渲染目标会话的消息列表与空状态；若流式期间切换会话，多会话之间请求排队串行调度，切走再切回视图全量重绘时能无缝恢复流式节点追加，各会话消息与顺序互不干扰。
- 详细方案设计：
  1. 在 `Assistant/web/js/views/chat.js` 实现 `renderActiveSession()`：
     - 首先清空当前 `#messages` 容器（`messagesEl.replaceChildren()`）；
     - 若当前处于空白草稿态（`activeSessionId === null`）或当前会话的 `messages` 为空数组，展示 `#chat-empty` 空状态提示；
     - 若当前会话存在消息，隐藏 `#chat-empty`，遍历该会话的 `messages` 数组，依次调用 `appendMessageNode()` 将用户气泡与 Agent 消息卡片按序渲染至 `#messages`；若其中有消息状态为 `streaming`，卡片赋予 `.is-streaming` 并渲染等待点动画与打字光标；
     - 渲染完成后调用 `scrollToBottom(chatScrollEl)` 使视图滚至最新消息。
  2. 流式与并发排队调度策略：
     - `isStreaming` 与 `queue` 保持全局统一调度。若会话 A 正在流式输出中，用户切至会话 B 或在草稿态发送消息，新发送的消息立即在对应会话中上屏，内存中生成状态为 `streaming` 的 Agent 占位卡片，并将请求快照 `{ sessionId, messageId, snapshot }` 推入全局队列；输入框上方展示排队等待提示；
     - 当前请求完成（`done` 或 `error`）后，`processQueue()` 自动出队下一项并启动网络请求。
  3. 切走再切回的 DOM 节点重绑定机制：
     - 杜绝视图模块内部使用局部闭包变量长期持有 Agent DOM 节点；
     - 每次收到 SSE `delta` 增量事件时：
       a. 首先无条件更新内存对象：找到对应会话的消息对象，执行 `message.content += delta`；
       b. 判断当前活动会话：若 `store.getActiveSessionId() === currentStreamingSessionId`（用户正在查看该会话），通过 `messagesEl.querySelector(\`[data-message-id="${messageId}"]\`)\` 动态获取当前 DOM 树上的 Agent 卡片节点并更新文本（使用 `textContent`）与智能触底滚动；
       c. 若用户切到其他会话，DOM 查找直接跳过，只保留内存累加；当用户重新切回该会话时，`renderActiveSession()` 执行全量重绘，新生成的卡片同样具备 `data-message-id="${messageId}"`，后续到达的 `delta` 片段将立刻定位到新生成的 DOM 节点继续渲染，彻底解决重绘导致的节点失效脱节问题。

##### A6.2 对话页导航折叠

**A6_2_1 主导航对话页缩略态与路由响应式联动**
- 状态：已确认
- 需求描述：进入对话页（`#/chat`）时，左侧主导航收为缩略形态，只显示五个入口的图标、不显示文字；切到个人数据库、管理 Mail、手机端联动、配置任一页面时，主导航恢复展开为图标加文字。
- 详细方案设计：
  1. 在 `Assistant/web/js/router.js` 的 `syncRoute()` 中判定当前路由视图：
     - 若 `route.view === 'chat'`，为 `.app-sidebar` 添加 `.app-sidebar--collapsed` 类；
     - 若 `route.view !== 'chat'`，从 `.app-sidebar` 移除 `.app-sidebar--collapsed` 类。
  2. 在 `Assistant/web/css/layout.css` 编写折叠态样式：
     - `.app-sidebar--collapsed` 宽度覆盖为 `var(--layout-sidebar-compact)`（`72px`）；
     - `.app-sidebar--collapsed .nav__label` 与 `.app-sidebar--collapsed .app-sidebar__footer-text` 采用隐藏样式（`position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0;`），隐藏文字同时保留语义供无障碍设备读取；
     - `.app-sidebar--collapsed .nav__link` 采用居中布局（`justify-content: center; padding: 0;`），保留原有 `title` 属性用于鼠标悬停提示；五个导航入口的点击跳转与激活态逻辑完全保持不变。
  3. 平板断点（`max-width: 1023px`）与手机断点（`max-width: 767px`）下，原有断点样式保证侧栏始终收缩为紧凑图标栏，两者规则协调一致。

##### A6.3 会话列表栏

**A6_3_1 对话页双列结构与会话列表栏布局**
- 状态：已确认
- 需求描述：在缩略导航栏右侧紧邻出现第二列会话列表栏，只在对话页显示；栏内自上而下为顶部操作区与会话列表滚动区。
- 详细方案设计：
  1. 在 `Assistant/web/index.html` 的 `#view-chat` 内部搭建水平双列结构：
     - 左列为会话列表栏 `<aside class="chat-sessions" id="chat-sessions" aria-label="会话列表">`；
     - 右列为主对话区 `<div class="chat" id="chat-main">`。
  2. 在 `Assistant/web/css/chat.css` 中声明布局规格：
     - `.view--chat` 设为 `flex-direction: row; height: 100%; width: 100%; max-width: 100%; padding: 0; margin: 0;`；
     - `.chat-sessions` 宽度固定为 `240px`（`var(--layout-session-width, 240px)`），`flex-shrink: 0`，背景色为 `--color-surface`，右边缘使用 `1px solid var(--color-border-sidebar)`；
     - `.chat-sessions` 内部垂直分为固定高度顶部操作区 `.chat-sessions__header` 与下方弹性滚动区 `.chat-sessions__list`（`flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden;`）；
     - 右侧 `.chat` 主体保持 `flex: 1; min-width: 0; display: flex; flex-direction: column;`。
  3. 切换到其他非对话页面时，由于外层 `#view-chat` 带有 `hidden` 属性，会话列表栏随之隐藏，其他页面占位区不受任何影响。

##### A6.4 新建对话

**A6_4_1 延迟创建机制与新建草稿态流转**
- 状态：已确认
- 需求描述：会话列表栏顶部提供"新建对话"按钮，点击后进入一个空白草稿会话，可直接输入；草稿在发出第一条用户消息之前不出现在会话列表中，发出第一条消息后才正式创建并加入列表；首次打开应用或点击"新建对话"时落在空白草稿上，不自动打开已有会话。
- 详细方案设计：
  1. 在 `.chat-sessions__header` 中提供新建对话按钮 `<button class="chat-sessions__new-btn" id="new-chat-button" type="button"><svg class="chat-sessions__new-icon" viewBox="0 0 24 24"><use href="#icon-plus"></use></svg><span>新建对话</span></button>`。
  2. 在 `Assistant/web/index.html` 的内联 SVG sprite 中增加 `icon-plus` symbol。
  3. 页面初次加载或用户点击"新建对话"按钮时触发 `handleNewChat()`：
     - 若当前已处于空白草稿态（`activeSessionId === null`）：判定为丢弃旧草稿，调用 `store.clearDraftText()`，输入框清空，高度重置，禁用发送按钮；
     - 若当前处于某一既有会话（`activeSessionId !== null`）：调用 `store.enterDraft()`，将 `activeSessionId` 设为 `null`；此时输入框回填此前暂存的 `store.draftText`（若有）并恢复发送按钮可用态；
     - 清空 `#messages` 容器并显示 `#chat-empty`，会话列表中所有条目均移除 `.is-active` 激活态；
     - 自动调用 `composerInputEl.focus()` 保持焦点就绪。
  4. 用户在草稿态发出第一条消息时，调用 `store.createSessionFromDraft(content)`：
     - 生成唯一 ID（`s_<timestamp>_<rand>`）；
     - 自动截取首条消息前 10 字为标题（按 A6.5 码点与空白安全算法）；
     - 将新会话推入 `store.sessions` 列表最前；
     - 将 `activeSessionId` 设为该会话 ID；
     - 触发会话列表重新渲染并将该新会话置为激活高亮状态，随后将首条用户消息放入该会话并进入正常发送与回复流程。

##### A6.5 会话标题自动生成

**A6_5_1 码点安全切片与空白折叠生成算法**
- 状态：已确认
- 需求描述：会话在发出第一条用户消息时正式创建，标题自动取该条消息的前 10 个字；标题在会话出现在列表时即已生成；消息不足 10 个字时标题与消息全文一致；杜绝多行与 emoji 乱码，防御 XSS。
- 详细方案设计：
  1. 在 `store.js` 的 `createSessionFromDraft(firstUserContent)` 中实现字符感知截取算法：
     - 过滤与折叠空白：`const folded = firstUserContent.trim().replace(/\s+/g, ' ');`；将换行符、回车符、制表符及多个连续空格统一收敛为一个半角空格，防止多行文本破坏会话条目单行样式；
     - Unicode 码点感知切片：`const title = Array.from(folded).slice(0, 10).join('');`；严格按字符感知单元截取，杜绝原生 JavaScript `slice(0, 10)` 在 UTF-16 代理对（如 emoji 表情）中间切断导致的乱码与字符畸变；不足 10 字时保留全部文本。
  2. 安全 DOM 渲染：新会话节点插入会话列表 DOM 时，必须使用 `element.textContent = title` 赋值，严禁使用 `innerHTML`，彻底杜绝用户输入构造恶意标签导致的 XSS 注入隐患；同时将完整 `folded` 赋给 `title` HTML 属性供长文本悬停查阅。

##### A6.6 会话重命名

**A6_6_1 悬停快捷入口与行内编辑事件保护**
- 状态：已确认
- 需求描述：鼠标悬停在会话条目上时显示重命名入口，点击后可编辑标题并保存，列表与当前会话标题同步更新；自动标题先于重命名发生，重命名结果不会被后续消息覆盖；严格拦截事件冒泡、中文选字回车误触、失焦重复提交与列表重绘冲突。
- 详细方案设计：
  1. 在 `Assistant/web/index.html` 的内联 SVG sprite 中增加 `icon-pencil` 线性编辑图标 symbol。
  2. 在每个会话条目 DOM 中构建操作按钮组 `<div class="session-item__actions">`，内含 `<button class="session-item__action-btn" data-action="rename" title="重命名" aria-label="重命名会话"><svg viewBox="0 0 24 24"><use href="#icon-pencil"></use></svg></button>`。
  3. 悬停交互：在 `chat.css` 中设置 `.session-item__actions` 默认 `opacity: 0`；当 `.session-item:hover` 或 `.session-item:focus-within` 时 `opacity: 1`。
  4. 点击重命名按钮时调用 `event.stopPropagation()`，条目进入编辑态：
     - 为 `.session-item` 增加 `.is-editing` 类；条目内包含标记变量 `let isCommitted = false;` 与组合状态 `let isInputComposing = false;`；
     - 隐藏原有的 `.session-item__title` 与操作组，原地插入单行文本框 `<input class="session-item__input" type="text" maxlength="50">`；
     - 输入框必须绑定 `click` 事件并调用 `event.stopPropagation()`，防止点击输入框时事件冒泡到外层条目触发会话切换；
     - 输入框初始值为当前标题文本，自动执行 `input.focus()` 与 `input.select()`。
  5. 事件保护与提交逻辑：
     - 组合输入法保护：监听输入框 `compositionstart`（置 `isInputComposing = true`）与 `compositionend`（置 `isInputComposing = false`）；
     - 键盘事件：监听 `keydown`：
       a. 若按 `Enter`：若 `isInputComposing || event.isComposing` 为真则直接返回，防止输入法确认拼音时误保存；若非组合输入，设置 `isCommitted = true`，调用保存流程并退出编辑；
       b. 若按 `Esc`：设置 `isCommitted = true`，恢复原标题并退出编辑；
     - 失焦保护：监听输入框 `blur`：若 `isCommitted` 为 `true`，说明此前已通过 Enter 或 Esc 完成处理，直接 return；若为 `false`，则将其置为 `true` 并执行保存流程；
     - 保存处理：读取 `input.value.trim().replace(/\s+/g, ' ')`，若非空且与原标题不同，调用 `store.renameSession(sessionId, newTitle)`，并使用 `titleSpan.textContent = newTitle` 安全更新 DOM；若为空串则取消本次修改并恢复原标题；
     - 退出编辑态，移除 `.is-editing`，销毁输入框并重新显示标题与操作组。
  6. 列表重排防丢失保护：若在编辑态期间有后台流式完成或数据更新，会话列表控制器禁止对会话列表执行全局 `replaceChildren` 全量重建，保持当前编辑中的 input 节点完整稳定。

##### A6.7 会话删除

**A6_7_1 悬停删除入口、流式中止与状态复位保护**
- 状态：已确认
- 需求描述：鼠标悬停在会话条目上时显示删除入口，触发后删除该会话及其全部消息；若删除正在流式的会话，中止网络连接并复位状态防止死锁；若删除当前正在查看的会话，页面落回空白草稿会话。
- 详细方案设计：
  1. 在 `Assistant/web/index.html` 的内联 SVG sprite 中增加 `icon-trash` 垃圾桶线性图标 symbol。
  2. 在会话条目的 `.session-item__actions` 内增加删除按钮 `<button class="session-item__action-btn" data-action="delete" title="删除会话" aria-label="删除会话"><svg viewBox="0 0 24 24"><use href="#icon-trash"></use></svg></button>`。
  3. 点击删除按钮时调用 `event.stopPropagation()`，在 `views/chat.js` 中触发会话删除流程：
     - 流式中止与死锁保护：检查当前全局状态，若当前 `store.isStreaming` 为 `true` 且正在流式处理的请求属于目标被删除会话：
       a. 立即调用 `store.currentAbortController.abort()` 中止底层 fetch SSE 数据流；
       b. 将 `store.isStreaming` 立即置为 `false`，清空 `store.currentAbortController = null`；
       c. 调用 `syncSendButtonState()` 强制刷新发送按钮可用态，杜绝因连接中途销毁导致的按钮永久禁用死锁；
     - 队列清理：过滤清理 `store.queue` 中所有 `sessionId === targetId` 的排队项；
     - 内存与视图移除：调用 `store.deleteSession(sessionId)` 从 `store.sessions` 中移除该会话；从会话列表 DOM 容器中移除对应的 `.session-item` 节点；
     - 活动会话落回草稿态：若被删除的会话正好是当前活动会话（`sessionId === store.getActiveSessionId()`）：
       a. 调用 `store.enterDraft()` 将 `activeSessionId` 重置为 `null`；
       b. 清空输入框（`composerInputEl.value = ''`），重置高度并禁用发送按钮；
       c. 清空 `#messages` 容器并显示 `#chat-empty` 空状态；
       d. 不自动切换或打开会话列表中的其他既有会话；
     - 若队列中仍有属于其他未删除会话的排队请求，在中止清理后继续调用 `processQueue()` 调度下一条。

##### A6.8 顶部预留区

**A6_8_1 会话栏顶部扩展区结构预留**
- 状态：已确认
- 需求描述：会话列表栏顶部在"新建对话"按钮所在区域内预留一块空白区域，供后续新增的同类模块入口使用；第一版该区域不放任何控件，不挤占会话列表的滚动区域。
- 详细方案设计：
  1. 在 `Assistant/web/index.html` 的 `.chat-sessions__header` 内部增加预留容器：`<div class="chat-sessions__reserved" id="chat-sessions-reserved" aria-hidden="true"></div>`。
  2. 在 `Assistant/web/css/chat.css` 中为 `.chat-sessions__reserved` 定义弹性预留空间：
     - 高度保持为紧凑预留（`min-height: 8px` 或空块容器），内容为空；
     - 不包含任何按钮、图标、表单或文字；
     - 设置 `pointer-events: none`，确保不捕获任何鼠标事件；
     - 该预留区置于顶部固定栏 `.chat-sessions__header` 内，下方会话列表单独滚动，杜绝挤占或遮挡会话条目滚动区域。

##### A6.9 草稿输入保留

**A6_9_1 空白草稿未发送文字输入即存与跨路由保留**
- 状态：已确认
- 需求描述：在空白草稿会话的输入框中已输入但尚未发送的文字，在离开对话页（切到个人数据库、管理 Mail、手机端联动、配置任一页面）后返回时仍然保留，返回后可直接继续编辑或发送。
- 详细方案设计：
  1. 采用统一的输入即存机制：在空白草稿态（`activeSessionId === null`）下，用户在 `composerInputEl` 中键入任意文字，`input` 事件触发时立即执行 `store.draftText = composerInputEl.value`，无延迟暂存。
  2. 前端路由采用常驻 DOM 方案：切换到其他非对话路由时，`#view-chat` 仅设置 `hidden = true`，DOM 实例与输入框内容完整保留在浏览器内存中；切回 `#/chat` 时，`#view-chat` 重新可见，输入框文字自然完好如初。
  3. 路由重置或视图重新激活时，从 `store.draftText` 读取草稿文字核对并回填输入框，调用 `adjustInputHeight()` 恢复文本框伸缩高度，并调用 `syncSendButtonState()` 恢复发送按钮的可用状态。

##### A6.10 会话输入保留（全部会话）

**A6_10_1 全会话未发送输入统一实时存取与自适应恢复**
- 状态：已确认
- 需求描述：每个会话各自记住输入框中尚未发送的文字；在会话之间切换、或切换到其他导航页再返回时，返回的会话恢复它自己的未发送文字；已发送的消息不受影响。
- 详细方案设计：
  1. 在每个正式会话对象中维护 `draft: string` 属性（默认空串 `''`）。
  2. 统一实时写入机制：`composerInputEl` 的 `input` 监听器统一步调：
     - 若 `activeSessionId !== null`，实时写入 `activeSession.draft = composerInputEl.value`；
     - 若 `activeSessionId === null`，实时写入 `store.draftText = composerInputEl.value`；
     - 彻底免除组件销毁或切换路由时的手动离场保存逻辑，杜绝漏存风险。
  3. 会话切入即时恢复：当用户在会话列表点击切换至目标会话时：
     - 读取目标会话的 `session.draft`，赋值给 `composerInputEl.value`；
     - 恢复后立即调用 `adjustInputHeight()` 重新计算高度（1 行至 200px 自动展开），并调用 `syncSendButtonState()` 同步发送按钮可用状态；
  4. 消息发送清空机制：当某会话成功发出一条消息后，立即将其 `session.draft` 清空为 `''`；其他会话已保存的未发送文字互不影响。

##### A6.11 新建对话丢弃旧草稿

**A6_11_1 显式新建对话丢弃条件分支与草稿恢复约定**
- 状态：已确认
- 需求描述：从既有会话点击"新建对话"进入草稿态时，恢复此前暂存的草稿文字（若有）；只有当前本来就处于空白草稿态时再次点击"新建对话"，旧草稿及其文字才直接丢弃，不做保留，也不提供返回旧草稿的入口；浏览页面、切换会话等非"新建对话"的操作仍按 A6.9 与 A6.10 保留文字；已经发出过消息的会话不属于草稿，不受本条目影响。
- 详细方案设计：
  1. 在"新建对话"按钮的点击事件处理函数 `handleNewChat()` 中根据当前活动态执行严格分支判断：
     - 分支一（当前本已处于草稿态 `activeSessionId === null`）：
       - 用户在草稿态再次显式点击新建对话，表明放弃当前未发送草稿；
       - 执行 `store.clearDraftText()`，将 `store.draftText` 重置为空串 `''`；
       - 将 `composerInputEl.value = ''`，输入框高度重置为单行（`resetInputHeight()`），发送按钮置灰禁用；
       - 旧草稿文字彻底销毁丢弃，不提供任何恢复入口；
     - 分支二（当前正处于某一既有正式会话 `activeSessionId !== null`）：
       - 用户从既有会话切换回草稿态准备开启新对话；
       - 当前会话的输入文字早已通过 `input` 实时安全保存在 `session.draft` 中（满足 A6.10）；
       - 调用 `store.enterDraft()`，将 `activeSessionId` 切换为 `null`；
       - 此时将此前在草稿态留存的 `store.draftText`（若有）回填至 `composerInputEl.value`；
       - 联动调用 `adjustInputHeight()` 与 `syncSendButtonState()` 恢复草稿文字与按钮状态，严禁将既有草稿置空清零；
  2. 会话列表中的既有会话不受影响；通过常规浏览页面、切换已有会话等操作离开或返回草稿态时，均严格执行 A6.9 与 A6.10 的文字完整保留逻辑。
