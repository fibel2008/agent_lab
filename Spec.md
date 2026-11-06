# Spec：Emibot

<!-- 文档职责：回答"具体怎么实现"。
     只保留四部分：目录结构、架构、接口与数据规定、需求列表。
     不写项目背景与目标（属于 Intent.md），不写开发过程日志（属于 Memory.md）。

     编号规则：对应 Intent.md 中的单条需求 A{x}.{y}，本文拆解为若干实现子项 Ax_y_z（x 为子板块号，y 为需求号，z 为从 1 递增的实现部分序号）。
     编号一经分配不得更改或复用；条目废弃时保留原编号，并标注"已废弃"。
     每个 Ax_y_z 条目固定包含三项：状态、需求描述、详细方案设计。

     状态取值：已确认（方案已定，待实现）/ 进行中（正在实现，未验收）/
     已完成（已实现并通过验收）/ 待确认（方案待拍板）/ 已废弃。

     归档规则：
     1. 触发条件：当且仅当用户明确表达"归档"等意思后才进行归档；用户输入"开始下一阶段"时不进行归档；无需再次确认。
     2. 归档文件：将当前母文档复制到 Archive/ 目录，重命名为 {M}_{N}_spec.md（M 为当前阶段如 vA、vB，N 为该阶段备份序号，从 0 开始递增）。Archive/ 文件夹及备份文件已配置 .gitignore 忽略。
     3. 范围边界：仅归档当前阶段实现规格，后续阶段预研/未开发规格不计入当前阶段归档并保留在母文档中。
     4. 清空与提交：归档完成后，清空母文档中已归档阶段的需求列表板块，保留系统架构、接口规定与后续阶段规格；执行原子 commit，备注格式统一为 docs(archive): {M}_{N}整理归档intent,spec。 -->

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

<!-- A 阶段实现规格已归档至 Archive/vA_0_spec.md -->

### B 第二版
