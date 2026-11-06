# Spec：Emibot

<!-- 文档职责：回答"具体怎么实现"。
     只保留四部分：目录结构、架构、接口与数据规定、需求列表。
     不写项目背景与目标（属于 Intent.md），不写开发过程日志（属于 Memory.md）。

     编号规则：对应 Intent.md 中的单条需求 A{x}.{y} 或 B{x}.{y}，本文拆解为若干实现子项 Ax_y_z 或 Bx_y_z（x 为子板块号，y 为需求号，z 为从 1 递增的实现部分序号）。
     编号一经分配不得更改或复用；条目废弃时保留原编号，并标注"已废弃"。
     每个 Ax_y_z / Bx_y_z 条目固定包含三项：状态、需求描述、详细方案设计。

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
│   ├── app.py                   FastAPI 装配：路由、静态托管、缓存策略、生命周期管理
│   ├── config.py                常量、环境变量与日志初始化
│   ├── storage/                 [第二版新增] 本地持久化层
│   │   ├── __init__.py
│   │   ├── db.py                SQLite 数据库连接池、WAL 模式配置与自动建表迁移
│   │   └── session_store.py     会话与消息 CRUD 仓储实现、未完生成任务状态补偿
│   ├── api/
│   │   ├── __init__.py
│   │   ├── health.py            GET /api/health
│   │   ├── config.py            [第二版新增] GET /api/config/status（探测密钥配置状态，不泄露内容）
│   │   ├── sessions.py          [第二版新增] RESTful 会话与消息 CRUD 接口
│   │   ├── chat.py              POST /api/chat（兼容离线 SSE 与在线解耦触发）
│   │   ├── stream.py            [第二版新增] GET /api/chat/stream（会话级解耦 SSE 实时增量订阅）
│   │   └── schemas.py           请求、响应、任务与事件的数据模型
│   ├── agent/
│   │   ├── __init__.py
│   │   ├── base.py              ChatMessage 与 Agent 协议
│   │   ├── mock_agent.py        mock 回复的唯一生成位置
│   │   ├── online_agent.py      [第二版新增] 真实大模型在线 Agent 实现（支持流式通信）
│   │   ├── react.py             [第二版新增] ReAct 循环执行引擎（推理-行动-观察循环）
│   │   ├── tools/               [第二版新增] 工具与技能预留抽象层
│   │   │   ├── __init__.py
│   │   │   ├── base.py          Tool 协议与 ToolCall 模型
│   │   │   └── registry.py      统一工具注册中心（本阶段为空）
│   │   ├── task_manager.py      [第二版新增] 后台解耦生成任务管理器（支持多会话并发与广播）
│   │   └── factory.py           唯一替换点：选哪个 Agent
│   └── web/
│       ├── index.html           应用外壳 + 内联 SVG 图标库（顶栏新增交互式形态切换器）
│       ├── css/
│       │   ├── tokens.css       设计令牌（颜色、圆角、间距、字号、布局、形态与中断状态）
│       │   ├── base.css         reset、排版、滚动条、可访问性基础
│       │   ├── layout.css       顶栏、主侧栏（含缩略态）、内容区、响应式断点
│       │   ├── components.css   导航项、徽标、状态圆点、按钮、形态开关胶囊、占位页
│       │   └── chat.css         对话页双列布局、会话列表侧栏、空状态、消息气泡、中断样式、输入区
│       └── js/
│           ├── main.js          启动入口：构建导航、初始化路由、装配视图
│           ├── routes.js        路由与导航的唯一配置源
│           ├── icons.js         SVG symbol 的 id 常量
│           ├── router.js        hash 路由解析、主侧栏折叠切换与视图显隐
│           ├── store.js         双形态状态管理：离线纯内存数据源与在线持久化数据源
│           ├── api.js           RESTful API 客户端与会话级 SSE 订阅客户端
│           ├── dom.js           DOM 工具与时间戳格式化函数
│           └── views/
│               ├── chat.js      对话工作区与会话列表视图控制器（形态切换、解耦流式订阅与重连）
│               └── placeholder.js 占位页视图
├── data/                        [第二版新增] 本地持久化数据目录（受 .gitignore 忽略）
│   └── emibot.db                本地 SQLite 数据库文件
├── Archive/                     [阶段归档] 历史阶段规格与需求归档目录（受 .gitignore 忽略）
│   ├── vA_0_intent.md
│   └── vA_0_spec.md
├── requirements.txt
├── start.bat                    一键启动脚本：启动服务并自动弹出默认浏览器
├── .gitignore
├── Intent.md
├── Spec.md
├── Memory.md
└── README.md
```

- 目录名 `Assistant` 首字母大写沿用既有约定，作为顶层 Python 包通过 `python -m Assistant` 启动。
- 第二版新增 `data/` 本地持久化数据目录，由 `Assistant/storage/db.py` 在运行时自动创建，数据库文件已配置 `.gitignore` 忽略。

---

## 二、架构

### 2.1 组件关系图

```
浏览器端（原生 ES Modules）
├── 顶栏形态切换器（离线 ⇄ 在线）
├── 对话工作区（views/chat.js）
│   ├── 离线数据流：内存 store.js ── POST /api/chat（直连 MockAgent 流式输出）
│   └── 在线数据流：
│       ├── 会话/消息管理：RESTful API（/api/sessions）── SQLite 持久化
│       └── 解耦生成调度：触发生成 POST /api/chat ── 订阅流 GET /api/chat/stream?session_id={id}
FastAPI 服务端（Assistant/app.py）
├── 静态托管与配置检查：/api/config/status（安全探测密钥配置状态）
├── 持久化仓储层（storage/）：SQLite（WAL 模式）── sessions 表、messages 表、generation_tasks 表
├── 后台任务管理器（agent/task_manager.py）：
│   ├── 并发任务调度池（多会话独立 asyncio.Task，互不阻塞）
│   ├── 增量缓冲区与广播分发队列（动态挂载/卸载前端 SSE 客户端）
│   └── 进程异常恢复补偿（启动扫描中断状态）
└── 智能体执行层（agent/）：
    ├── 离线形态：MockAgent（纯文本关键词流式）
    └── 在线形态：OnlineAgent ── ReActLoop ── 动作分发（ToolRegistry 预留为空）── 大模型服务商（OpenAI 兼容协议）
```

### 2.2 前端模块职责与依赖方向

| 文件 | 职责 | 允许依赖 |
|---|---|---|
| `main.js` | 入口：构建导航、初始化路由、注册全局事件、装配双形态 | 其余全部前端模块 |
| `routes.js` | 路由、导航标签、图标、页面标题、占位页文案的唯一配置源 | `icons.js` |
| `router.js` | 解析 hash、主侧栏折叠切换、切换视图、更新导航高亮与 `document.title` | `routes.js` |
| `store.js` | 双形态状态管理：离线纯内存数据源与在线持久化数据源、草稿维护、当前活动会话与多会话并发流状态 | `dom.js` |
| `api.js` | RESTful API 客户端（会话 CRUD、状态检查）与会话级解耦 SSE 订阅客户端 | 无 |
| `dom.js` | `el()`、`createSvgIcon()`、`formatTimestamp()`、`scrollToBottom()`、`isNearBottom()` | 无 |
| `views/chat.js` | 对话页 DOM、会话列表渲染、新建/重命名/删除会话、形态切换响应、解耦流式订阅与重连、异常气泡渲染 | `store.js`、`api.js`、`dom.js` |
| `views/placeholder.js` | 占位页渲染 | `routes.js`、`dom.js` |
| `icons.js` | SVG symbol id 常量 | 无 |

- 依赖方向严格自上而下，禁止视图模块之间互相 `import`，禁止 `api.js` 操作 DOM。

### 2.3 对话全链路时序与状态归属

1. 浏览器加载 `/`，`main.js` 根据 `routes.js` 生成侧栏导航，`router.js` 解析 hash；无 hash 或非法 hash 时替换为 `#/chat`。每次启动或刷新页面，工作台默认进入**离线形态**。
2. 路由进入对话页（`#/chat`）时，左侧主导航自动收缩为仅显示图标的缩略态，紧邻展开会话列表栏；首次加载默认处于未创建的空白草稿态（`activeSessionId = null`），输入框可用，消息区显示空状态。
3. 草稿状态统一实时写入：监听输入框的 `input` 事件，每次键入实时将最新内容写入当前活动目标：
   - 若处于空白草稿态（`activeSessionId === null`），实时写入 `store.draftText`；
   - 若处于既有会话（`activeSessionId !== null`），实时写入对应会话的 `session.draft`；
   - 切换会话或切离对话页时无需依赖离场钩子，切回时直接从目标对象读取回填并联动自适应高度与发送按钮状态。
4. 在线形态消息发送与解耦流转：
   - 草稿态发出首条消息：自动按 `Array.from(trimmed.replace(/\s+/g, ' ')).slice(0, 10).join('')` 截取生成标题并创建新会话，同步写入本地 SQLite 数据库；
   - 用户消息与时间戳立即上屏，输入框清空并聚焦；
   - 前端调用 `POST /api/chat` 触发服务端异步生成；服务端写入用户消息至 SQLite，在后台启动独立的 `asyncio.Task` 开始 ReAct 循环推理；
   - 前端立即建立 `GET /api/chat/stream?session_id={id}` 的 SSE 增量订阅连接；
   - 切走与切回：用户切到其他会话或页面时，前端主动关闭该会话的 SSE 连接，服务端的后台生成协程不受任何影响继续全速运行；切回或刷新后，前端拉取最新消息列表，若仍在生成中，重新连入 SSE，服务端先推送增量缓冲区文本进行追赶，随后继续实时广播增量。
5. 离线形态消息发送与串行流式：
   - 沿用第一版纯内存管理与 `MockAgent` 确定性流式生成，不读写本地数据库，数据在刷新页面后清空。
6. 状态归属：
   - 离线形态数据只保存在浏览器内存（`store.js`）；
   - 在线形态的会话、消息与任务状态保存在服务端 SQLite 数据库中，关闭浏览器、重启服务后不丢失；
   - 未发送的输入文字（草稿）仅保存在浏览器运行时内存中，刷新后重置。

### 2.4 双形态切换与隔离架构

1. **形态定位与默认值**：
   - 工作台具备两套完全解耦的数据流与执行模式：离线形态（`mode = "offline"`）与在线形态（`mode = "online"`）。
   - 每次后端服务启动或前端网页重新打开，均默认进入**离线形态**，确保无网络与未配置密钥时的即开即用体验。
2. **切换阻断保护**：
   - 用户点击顶栏切换控件请求切入在线形态时，前端首先异步调用 `GET /api/config/status`。
   - 若返回 `has_api_key: false`，立即阻断切换流程，通过对话区全局气泡或顶栏弱提示"未配置密钥，请在本地环境变量配置后重试"，工作台保持在离线形态。
3. **状态隔离与草稿流转**：
   - 离线形态的数据完全保留在前端 `store.js` 内存对象中（`state.offlineSessions`），切到在线形态时离线数据不销毁，切回时依然完好（直到页面刷新按 A6.1 清空）；
   - 在线形态的数据均通过接口从后端 SQLite 数据库实时拉取；
   - 无论从离线切到在线，还是从在线切到离线，消息区均自动落入当前形态下的**空白草稿态**（`activeSessionId = null`），杜绝跨形态会话混乱；
   - 未发送的输入文字按 A6.9 与 A6.10 规则保留在前端内存，切换形态时不随之清空，方便用户在两端直接输入。
4. **生成中切换安全处理**：
   - 若在回复生成期间用户主动切换形态：
     - 若当前处于在线生成：前端向后端发送中断信号，后台生成协程中止执行，已生成的文本切片存入数据库并标记状态为 `"interrupted"`；
     - 若当前处于离线生成：前端直接调用 `abortController.abort()` 丢弃本次回复，不保存任何片段。

### 2.5 生成与页面解耦架构（后台任务 + 广播式 SSE）

```
【客户端】                                      【服务端 TaskManager】                【大模型 / 存储】
    │                                                   │                                    │
    │ 1. 发送消息 POST /api/chat                         │                                    │
    │    (session_id, content) ─────────────────────────>│ 2. 写入用户消息至 SQLite            │
    │                                                   │ 3. 启动后台异步任务 asyncio.Task      │
    │                                                   │    TaskManager 注册该会话任务        │
    │<── 返回 task_id / 200 OK ─────────────────────────│                                    │
    │                                                   │ 4. 驱动 ReAct 循环流式生成           │────> 调用 LLM
    │ 5. 建立解耦订阅 GET /api/chat/stream?session_id=X ──>│                                    │<──── 接收 chunk
    │                                                   │ 5. 缓冲区追赶 + 实时广播 delta 事件   │
    │<── SSE delta 事件逐块推送 ─────────────────────────│ 6. 边生成边更新数据库增量文本         │────> UPDATE DB
    │                                                   │                                    │
    ├─── [用户切至会话 Y 或刷新页面]                     │                                    │
    │ 7. 断开与会话 X 的 SSE 客户端连接                  │ 8. 后台任务不受影响，继续执行生成     │────> 调用 LLM
    │                                                   │ 9. 生成完毕，标记 status='done'     │────> UPDATE DB
    │                                                   │                                    │
    ├─── [用户切回会话 X]                               │                                    │
    │ 10. 拉取会话消息 GET /api/sessions/X/messages ────>│ 从 SQLite 返回已完成的完整历史      │
    │<── 渲染完整消息 ──────────────────────────────────│                                    │
    │ (若仍在生成，则重新连入 SSE 继续无缝接收增量)      │                                    │
```

1. **服务端任务常驻**：
   - 在线形态下的回复生成逻辑完全脱离 HTTP 请求生命周期，由服务端的 `TaskManager` 管理的独立 `asyncio.Task` 承载。
   - 单一会话严格保证串行顺序执行，不同会话之间并发独立执行，各会话的生成任务互不阻塞。
2. **广播与重连追赶**：
   - `TaskManager` 为每个活跃的生成任务维护一个最近生成的文本增量队列（Chunk Buffer）与一组监听中的客户端 `asyncio.Queue`。
   - 当用户切回会话重新连入 `GET /api/chat/stream?session_id={id}` 时，服务端首先将缓冲区中已产生的内容一次性补齐下发，随后继续下发后续实时增量，前端无感续接。
3. **异常中断保护**：
   - 若服务进程因断电、崩溃或关闭导致任务非正常终止，后端在下次启动初始化时自动扫描数据库中状态为 `"streaming"` 或 `"running"` 的未完任务，将其统一更新为 `"interrupted"`（已中断）；
   - 前端重连或刷新后，展示已生成的部分内容，并在气泡后方带有"已中断"标记，不自动重试，等待用户手动点击重新发送。

### 2.6 ReAct 循环执行引擎架构

```
                   ┌──────────────────────────────────────────┐
                   │               用户历史消息               │
                   └────────────────────┬─────────────────────┘
                                        │
                                        ▼
                   ┌──────────────────────────────────────────┐
                   │             ReAct 系统提示词             │
                   │ (定义 Thought / Action / Final Answer 规范)│
                   └────────────────────┬─────────────────────┘
                                        │
                                        ▼
                         ┌─────────────────────────────┐
                         │      大模型 API 流式推理     │
                         └──────────────┬──────────────┘
                                        │
                                        ▼
                         ┌─────────────────────────────┐
                         │   解析输出 (Parse Output)    │
                         └──────┬───────────────┬──────┘
                                │               │
          [命中 Action 调用]     │               │ [命中 Final Answer / 普通回复]
                                ▼               ▼
     ┌─────────────────────────────┐        ┌───────────────────────────────┐
     │   分发至 ToolRegistry 查找  │        │ 输出最终回答 (Final Answer)   │
     └──────────────┬──────────────┘        │ SSE 逐块向前端推送            │
                    │                       └───────────────┬───────────────┘
                    ▼                                       │
     ┌─────────────────────────────┐                        ▼
     │ 验证注册表 (第二版为空注册表)│                ┌───────────────────────────────┐
     │ 若无可用工具 -> 终止动作分发 │                │ 循环结束，标记完成 (done)     │
     └─────────────────────────────┘                └───────────────────────────────┘
```

1. **结构定义**：
   - 核心循环包含三要素：**Thought（思考推理）**、**Action / Action Input（工具行动）**、**Observation（环境观察）**，最终收敛于 **Final Answer（最终回答）**。
2. **第二版特化约束（无工具运行）**：
   - 严格遵循 Intent B1.4 与 B1.5 规定：第二版工具与技能注册中心保留统一抽象协议，但**不注册任何具体工具（`registry.get_tools() == []`）**；
   - 系统提示词在检测到注册表为空时，约束模型直接基于对话历史进行深度推理并直接输出最终回答；
   - 代码中明确定义循环入口 `ReActLoop.run(...)` 与动作分发点 `ReActLoop.dispatch_action(...)`，在不注册工具的前提下，动作分发点返回空，模型直接进入最终回答分支，既验证了 ReAct 的架构完备性，又确保不产生任何工具调用日志与记录。

### 2.7 功能分支拆分

| 阶段 | 顺序 | 分支 | 实现范围 | 对应 Intent 需求 | 状态 |
|---|---|---|---|---|---|
| 第一版 | 1 | `feature/app-shell` | Python 服务骨架、配置、静态托管、前端外壳、侧栏导航、顶栏、四个占位页、hash 路由 | A1.1 ~ A1.9 | 已合并 |
| 第一版 | 2 | `feature/mock-agent` | Agent 协议、mock 生成器、工厂、`POST /api/chat` SSE 接口与异常处理 | A3.1 ~ A3.3 | 已合并 |
| 第一版 | 3 | `feature/chat-window` | 对话页完整实现：消息列表、气泡、时间戳、输入区、发送队列、SSE 接入、打字机光标 | A2.1 ~ A2.7、A2.9、A4.1 | 已合并 |
| 第一版 | 4 | `feature/session-list` | 会话列表与导航折叠：多会话模型、延迟创建、导航缩略、会话列表栏、新建/改名/删除、草稿保留与丢弃 | A6.1 ~ A6.11 | 验收中 |
| 第二版 | 5 | `feature/storage-crud` | 本地 SQLite 仓储层实现、会话与消息 RESTful CRUD API、双形态状态管理与顶栏形态切换器 UI | B1.1、B1.7、B1.9 | 待开工 |
| 第二版 | 6 | `feature/online-react-agent` | 本机模型配置读取、OpenAI 兼容流式客户端、ReAct 循环引擎、工具注册中心预留、多轮上下文与中文错误提示 | B1.2、B1.3、B1.4、B1.5、B1.6 | 待开工 |
| 第二版 | 7 | `feature/generation-decoupling` | 后台解耦生成任务管理器（TaskManager）、多会话并发调度、会话级 SSE 订阅重连机制、停机中断状态标记与全量端到端验收 | B1.8 | 待开工 |

---

## 三、接口与数据规定

### 3.1 环境变量与配置常量（`Assistant/config.py`）

| 名称 | 类型 / 默认值 | 规定 |
|---|---|---|
| `ASSISTANT_HOST` | `str` / `"127.0.0.1"` | 环境变量；只绑定本机环回地址 |
| `ASSISTANT_PORT` | `int` / `8000` | 环境变量；要求 `>= 1`，非法值回退默认并打 warning 日志 |
| `ASSISTANT_STREAM_DELAY_MS` | `int` / `20` | 环境变量；离线 mock 每个文本块间隔毫秒数，要求 `>= 0` |
| `ASSISTANT_CHUNK_SIZE` | `int` / `1` | 环境变量；离线 mock 每个文本块字符数，要求 `>= 1` |
| `ASSISTANT_OPEN_BROWSER` | `bool` / `False` | 环境变量；设为 `1` 或 `true` 时服务就绪后自动弹出默认浏览器 |
| `ASSISTANT_API_KEY` | `str` / `""` | 环境变量；模型服务商 API 密钥，服务端启动时读取，严禁下发给前端或打印至日志 |
| `ASSISTANT_BASE_URL` | `str` / `"https://api.openai.com/v1"` | 环境变量；兼容 OpenAI 协议的模型 API 基础端点 |
| `ASSISTANT_MODEL` | `str` / `"gpt-4o-mini"` | 环境变量；在线形态调用的模型名称 |
| `ASSISTANT_DB_PATH` | `Path` / `data/emibot.db` | 环境变量或常量；本地 SQLite 数据库文件绝对路径，所在目录自动递归创建 |
| `ASSISTANT_REQUEST_TIMEOUT` | `int` / `60` | 环境变量；模型上游网络请求超时时间（秒），下限为 5 |
| `APP_VERSION` | `"0.1.0"` | 常量；应用版本号 |
| `MAX_MESSAGES` | `30` | 常量；单次请求最大历史消息条数 |
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

### 3.3 模式与配置安全探测接口（`GET /api/config/status`）

- 用途：前端切换到在线形态前探测本机环境是否具备在线能力，完全屏蔽敏感密钥内容。
- 响应状态码：`200 OK`
- 响应体结构：

```json
{
  "has_api_key": true,
  "provider": "openai-compatible",
  "model": "gpt-4o-mini",
  "storage": "sqlite",
  "db_connected": true
}
```

- 安全防线：响应字段仅包含布尔指示位与脱敏模型名，严禁返回任何 API Key 的明文或掩码片段。

### 3.4 在线会话与消息 RESTful 接口

#### 3.4.1 获取所有在线会话（`GET /api/sessions`）
- 响应：`200 OK`
- 响应体：`[ { "id": "s_...", "title": "会话标题", "created_at": "...", "updated_at": "..." }, ... ]`（按 `updated_at` 降序）。

#### 3.4.2 创建在线会话（`POST /api/sessions`）
- 请求体：`{ "id": "s_...", "title": "首条消息截取标题" }`（若前端未指定 id 则由服务端生成）。
- 响应：`201 Created`，返回创建成功的会话完整对象。

#### 3.4.3 重命名会话（`PATCH /api/sessions/{session_id}`）
- 请求体：`{ "title": "新标题" }`（非空，最大 50 字符，空白折叠）。
- 响应：`200 OK`，更新成功。

#### 3.4.4 删除会话（`DELETE /api/sessions/{session_id}`）
- 行为：级联删除会话及其关联的所有消息与后台正在进行的生成任务（自动触发 abort）。
- 响应：`204 No Content`。

#### 3.4.5 获取指定会话的历史消息（`GET /api/sessions/{session_id}/messages`）
- 响应：`200 OK`
- 响应体：

```json
[
  {
    "id": "m_1001",
    "role": "user",
    "content": "你好",
    "status": "done",
    "created_at": "2026-11-06T18:00:00+08:00"
  },
  {
    "id": "m_1002",
    "role": "assistant",
    "content": "你好！我是 Emibot，请问有什么可以帮助你？",
    "status": "done",
    "created_at": "2026-11-06T18:00:02+08:00"
  }
]
```

### 3.5 聊天与解耦流式生成接口

#### 3.5.1 聊天流式接口（`POST /api/chat`）
- 在离线形态下：入参沿用第一版 `ChatRequest`（`messages` 列表），直接以 SSE 流式同步返回（保持 A3.3 协议兼容性）。
- 在在线形态下：
  - 请求体：

```json
{
  "session_id": "s_123456",
  "content": "请分析一下这段代码",
  "mode": "online"
}
```

  - 响应：`202 Accepted`，响应体：

```json
{
  "task_id": "t_789abc",
  "session_id": "s_123456",
  "user_message_id": "m_u001",
  "assistant_message_id": "m_a002",
  "status": "queued"
}
```

#### 3.5.2 会话级增量订阅（`GET /api/chat/stream?session_id={session_id}`）
- 协议：`text/event-stream; charset=utf-8`，响应头 `Cache-Control: no-cache`、`X-Accel-Buffering: no`。
- 事件格式与类型约定：
  - `event: meta`：下发任务基本信息 `{"task_id":"...","session_id":"...","message_id":"...","created_at":"...","model":"..."}`。
  - `event: delta`：下发增量文本切片 `{"text":"..."}`。
  - `event: done`：下发完成事件 `{"finish_reason":"stop"|"interrupted","duration_ms":1230}`，随后结束本流。
  - `event: error`：模型调用异常或网络中断时下发 `{"code":"stream_error","message":"中文可读提示文案"}`。

### 3.6 SSE 事件协议通用规范

每个事件由 `event: <type>\ndata: <json>\n\n` 组成，`data` 为单行 UTF-8 JSON（`ensure_ascii=False`）：

| 事件名 | `data` JSON 结构 | 触发时机与规定 |
|---|---|---|
| `meta` | `{"message_id":"m_8f3a","created_at":"2026-11-06T10:20:13+08:00","model":"..."}` | 流启动时发送且仅发送一次 |
| `delta` | `{"text":"增量文本"}` | 每次产出增量文本块时发送，可发送多次 |
| `done` | `{"finish_reason":"stop"|"interrupted","duration_ms":1820}` | 回复正常生成完毕或被中断时发送一次，随后结束流 |
| `error` | `{"code":"stream_error","message":"中文可读提示文案"}` | 流式生成中途发生异常时发送一次，随后结束流 |

### 3.7 SQLite 数据库模式与表结构（`data/emibot.db`）

```sql
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- 会话表
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

-- 消息表
CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('done', 'streaming', 'error', 'interrupted')),
    created_at TEXT NOT NULL,
    FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

-- 生成任务记录表（用于解耦追踪与停机中断补偿）
CREATE TABLE IF NOT EXISTS generation_tasks (
    task_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    message_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('running', 'completed', 'interrupted', 'failed')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    FOREIGN KEY(message_id) REFERENCES messages(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON generation_tasks(status);
```

### 3.8 后端数据模型与协议（`Assistant/agent/base.py`、`Assistant/agent/tools/base.py`、`Assistant/api/schemas.py`）

```python
from collections.abc import AsyncIterator, Sequence
from typing import Literal, Protocol
from pydantic import BaseModel, Field


class ChatMessage(BaseModel):
    """聊天消息数据模型。"""
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class Agent(Protocol):
    """Agent 抽象协议。"""
    name: str
    model: str

    def stream_reply(
        self, messages: Sequence[ChatMessage]
    ) -> AsyncIterator[str]:
        """根据历史消息流式生成回复增量文本。"""
        ...


class BaseTool(Protocol):
    """工具与技能预留抽象协议。"""
    name: str
    description: str
    parameters: dict

    async def execute(self, **kwargs) -> str:
        """执行工具逻辑并返回观察字符串。"""
        ...
```

### 3.9 前端数据模型与编码约定

- 前端双形态状态管理（`store.js`）：

```js
{
  mode: 'offline',                 // 当前工作台形态：'offline' | 'online'
  activeSessionId: null,           // 当前活动会话 ID；为 null 时表示处于未创建的空白草稿态
  draftText: '',                   // 空白草稿态中已输入未发送的文字
  offlineSessions: [],             // 离线会话列表（纯内存）
  onlineSessions: [],              // 在线会话列表（同步自 SQLite）
  sessionDrafts: {},               // 各会话未发送草稿字典：{ [sessionId]: text }
  queue: [],                       // 发送队列
  isStreaming: false,              // 全局流式互斥锁
  currentAbortController: null     // 当前流式请求控制器
}
```

- 前端消息对象（`store.js`）：

```js
{
  id: 'm_<timestamp>_<rand>',
  role: 'user' | 'assistant',
  content: '',
  createdAt: Date,
  status: 'done' | 'streaming' | 'error' | 'interrupted'
}
```

- 核心数据处理与安全规定：
  - 会话标题生成规则：统一使用 `Array.from(rawContent.trim().replace(/\s+/g, ' ')).slice(0, 10).join('')`；先将换行符、制表符及连续空格折叠为单空格，再按 Unicode 码点切片，防止 emoji 等 UTF-16 代理对截断出现乱码。
  - XSS 防御规定：所有用户输入的标题与文本在注入 DOM 时，严禁使用 `innerHTML`，必须使用 `element.textContent` 或 `document.createTextNode` 渲染。
  - 草稿状态写入时机：统一在输入框 `input` 事件触发时实时写入当前活动目标（草稿态存入 `store.draftText`，已有会话存入对应 `sessionDrafts[id]`），会话切换与路由切离时直接复用，不维护分散的时机。

- 命名与格式规定：
  - Python：函数/变量 `snake_case`，类 `PascalCase`，常量 `UPPER_SNAKE_CASE`，4 空格缩进，公开函数写一行中文 docstring。
  - JavaScript：函数/变量 `camelCase`，常量 `UPPER_SNAKE_CASE`，2 空格缩进，分号结尾，单引号字符串，ES Modules。
  - CSS：BEM 命名（`block__element--modifier`），状态类 `is-active` / `is-disabled` / `is-streaming` / `is-error` / `is-editing` / `is-interrupted`，主侧栏缩略态 `.app-sidebar--collapsed`，形态切换胶囊命名（`.mode-toggle`、`.mode-toggle__pill`、`.mode-toggle__dot`、`.mode-toggle__label`），禁止使用 `#id` 选择器写样式，颜色与尺寸统一引用 `--color-*`、`--text-*`、`--space-*`、`--radius-*`、`--layout-*`、`--motion-*`。

---

## 四、需求列表

<!-- A 阶段实现规格已归档至 Archive/vA_0_spec.md -->

### B 第二版

#### B1.0 在线对话

##### B1.1 形态切换

**B1_1_1 顶栏形态切换交互组件与状态响应**
- 状态：已确认
- 需求描述：顶部栏右上角常驻显示当前工作台形态（离线 / 在线），支持鼠标点击切换；每次启动或刷新页面默认进入离线形态。
- 详细方案设计：
  1. 在 `Assistant/web/index.html` 的 `.app-header` 中，将原有的静态标签替换为交互式切换组件 `<button class="mode-toggle" id="mode-toggle" type="button" aria-label="切换工作台形态"><span class="mode-toggle__pill"><span class="mode-toggle__dot"></span><span class="mode-toggle__label" id="mode-label">离线模式</span></span></button>`。
  2. 在 `Assistant/web/css/components.css` 定义组件样式：
     - 离线态：指示点为 `--color-text-muted`（深灰/银白微光），文字显示"离线模式"；
     - 在线态：指示点为绿光渐变（`#10b981`），附带微妙呼吸效果，文字显示"在线模式"；
     - 支持悬停与键盘访问高亮。
  3. 在 `Assistant/web/js/store.js` 中维护全局状态 `state.mode = 'offline'`；页面初次加载时始终强制初始化为 `'offline'`，符合零网络默认约定。

**B1_1_2 本机模型密钥预检与阻断提示**
- 状态：已确认
- 需求描述：用户点击切换至在线形态前，自动检查本机是否配置模型密钥；若未配置，给出明确中文提示并留在离线形态，阻止切换。
- 详细方案设计：
  1. 在 `Assistant/api/config.py` 提供轻量探测接口 `GET /api/config/status`，后端读取 `os.environ.get("ASSISTANT_API_KEY")`；当且仅当去除首尾空白字符后长度大于 0 时，返回 `{"has_api_key": true}`，否则返回 `{"has_api_key": false}`。
  2. 前端在 `mode-toggle` 点击事件回调中：
     - 若当前为离线形态、准备切入在线形态，首先发起 `await api.checkConfigStatus()`；
     - 若 `has_api_key === false`：在对话区顶部弹出弱侵入提示横幅（Toast 或 Alert），文案明确提示："未配置模型密钥，请在本机环境变量中设置 ASSISTANT_API_KEY 后重试"，中断切换流程，保持 `state.mode = 'offline'`；
     - 若 `has_api_key === true`：允许切换，进入形态流转逻辑。

**B1_1_3 模式切换数据流转与进行中生成安全中断**
- 状态：已确认
- 需求描述：切换形态后立即渲染目标形态的会话与消息，并统一落在空白草稿态；切回离线时保留本次运行周期的离线内存会话；若在回复生成过程中切换形态，立即安全中断当前生成，在线已生成部分保存并标为已中断，离线直接丢弃。
- 详细方案设计：
  1. 数据流切换：
     - 在 `store.js` 中分离两组会话状态：`state.offlineSessions` 与 `state.onlineSessions`；
     - 切至在线：从后端 `GET /api/sessions` 拉取持久化列表注入 `state.onlineSessions`，激活会话重置为 `null`（空白草稿态），输入框自动保留当前草稿文字；
     - 切回离线：视图重新绑定 `state.offlineSessions`，同样激活会话置为 `null`；
  2. 生成中切换的安全中断（Abort & Persist）：
     - 若当前正在流式生成（`store.isStreaming === true`）：
       - 前端立即调用当前任务的 `currentAbortController.abort()`，停止向当前界面追加文字；
       - 若处于离线形态：直接丢弃该消息，从消息列表移除占位卡片；
       - 若处于在线形态：向服务端发送 `POST /api/chat/abort`（携带 `task_id`），服务端后台任务捕获 `CancelledError`，将当前已生成的文本内容落库至 `messages` 表，并将状态置为 `"interrupted"`；
     - 全局流式锁 `isStreaming` 复位为 `false`，确保切换后输入区立即恢复可用。

---

##### B1.2 真实模型回复

**B1_2_1 本机环境变量模型配置读取与脱敏保护**
- 状态：已确认
- 需求描述：在线形态回复由真实大模型生成，模型密钥仅通过本机环境变量读取，页面任何位置均无输入框、不展示密钥内容，离线形态不访问网络。
- 详细方案设计：
  1. 在 `Assistant/config.py` 中集中读取环境变量：`API_KEY = os.environ.get("ASSISTANT_API_KEY", "").strip()`、`BASE_URL = os.environ.get("ASSISTANT_BASE_URL", "").strip() or "https://api.openai.com/v1"`、`MODEL = os.environ.get("ASSISTANT_MODEL", "").strip() or "gpt-4o-mini"`。
  2. 安全防御：
     - 全站所有前端 HTML 模板、JavaScript 文件与静态样式中，绝对不包含任何 API Key 的输入框或配置展示；
     - 服务端日志格式化脱敏：在网络请求模块中添加过滤器，屏蔽所有 `Authorization: Bearer ***` 请求头，禁止将密钥打印到终端控制台或日志文件；
     - 离线形态完全不触发任何网络请求，保持断网可用。

**B1_2_2 OpenAI 兼容协议异步大模型客户端封装**
- 状态：已确认
- 需求描述：在后端实现标准 OpenAI 兼容的异步流式 HTTP 客户端，向配置的服务商端点发起流式对话请求并解析分块数据。
- 详细方案设计：
  1. 新增 `Assistant/agent/online_agent.py`，实现 `OnlineAgent` 类，满足 `Agent` 协议接口；
  2. 采用标准异步网络通信（使用 Python 标准异步通信或轻量客户端）：
     - 请求地址为 `{BASE_URL}/chat/completions`，下发 JSON 数据体：`{ "model": MODEL, "messages": payload_messages, "stream": True }`；
     - 请求头携带 `Authorization: f"Bearer {API_KEY}"` 与 `Content-Type: application/json`；
  3. 流式解析器：
     - 逐行读取上游返回的 `data: {...}`，反序列化提取 `choices[0].delta.content`；
     - 当收到 `data: [DONE]` 时优雅结束异步生成器；
     - 捕获上游网络中断、HTTP 状态码异常并转换为标准内部领域异常抛出。

---

##### B1.3 多轮上下文

**B1_3_1 单会话上下文滑动窗口构建与消息过滤**
- 状态：已确认
- 需求描述：同一会话内，模型调用时可参考该会话此前的全部历史消息；过滤失败消息并适配滑动窗口长度。
- 详细方案设计：
  1. 在 `Assistant/agent/online_agent.py` 或上下文装配模块中实现 `build_context_messages(session_id: str) -> list[dict]`：
     - 从数据库 `messages` 表按 `created_at ASC` 查询属于当前 `session_id` 的所有消息；
     - 状态过滤规则：仅保留 `status == 'done'` 的历史消息；若存在 `status == 'interrupted'` 的消息，则保留其已生成的 `content`，并在其尾部追加标记说明 `[此条回复此前已被用户中断]` 避免模型产生幻觉；完全忽略 `status == 'error'` 的异常卡片；
     - 窗口截取：取最后不超过 `MAX_MESSAGES`（30 条）消息作为 Prompt 上下文；
  2. 确保序列合法性：保证上下文第一条有效消息角色为用户，最后一条为当前新增的用户消息，中间维持 user 与 assistant 交叉序列。

**B1_3_2 跨会话上下文绝对隔离机制**
- 状态：已确认
- 需求描述：不同会话之间的上下文相互绝对独立，严格杜绝会话间串话。
- 详细方案设计：
  1. 所有会话消息在数据库层面以 `session_id` 作为外键唯一归属；
  2. 上下文构建查询严格绑定 SQL 条件：`SELECT role, content, status FROM messages WHERE session_id = ? ORDER BY created_at ASC`；
  3. 请求模型时仅传递该 SQL 查询产出的消息列表，严禁在后端全局内存中跨会话共享上下文缓存。

---

##### B1.4 ReAct 结构

**B1_4_1 ReAct 循环执行引擎设计**
- 状态：已确认
- 需求描述：回复生成组织为"推理—行动—观察"的循环结构，代码中可明确指认循环入口与动作分发点。
- 详细方案设计：
  1. 新增 `Assistant/agent/react.py`，实现 `ReActLoop` 引擎类；
  2. 引擎结构规定：
     - 唯一循环入口：`async def run(self, messages: list[ChatMessage]) -> AsyncIterator[str]`；
     - 内部维护 `step = 0; max_steps = 5;` 的 `while` 循环；
     - 动作分发点：`async def dispatch_action(self, tool_name: str, tool_args: dict) -> str`；
  3. 循环内部生命周期：
     - 步骤 1（推理 Thought）：将带 ReAct 指引的 Prompt 注入模型，获取模型输出；
     - 步骤 2（分发 Action）：解析模型是否产出结构化动作指令；若是，进入 `dispatch_action`；
     - 步骤 3（观察 Observation）：接收动作执行返回结果，拼装回上下文继续下一轮循环；
     - 步骤 4（最终回答 Final Answer）：若输出最终答案，则终止循环并流式吐出。

**B1_4_2 无工具阶段 ReAct 纯回答闭环与调用记录零残留**
- 状态：已确认
- 需求描述：第二阶段暂无任何可调用工具与技能，每次对话仅产生一次最终回答，对话过程中不产生工具调用记录。
- 详细方案设计：
  1. 在系统提示词中根据工具注册表状态自适应调整：当 `ToolRegistry.is_empty()` 为 `true` 时，系统提示词明确指示："当前环境下无外挂工具，请根据自身知识库对用户输入直接进行推理，并在 Final Answer 中输出完整解答"；
  2. 模型单次推理即直接命中最终回答；动作分发点校验到无可用工具，自动将全部内容作为最终回答流式推送；
  3. 数据库与前端消息卡片中仅存储最终回答文本，不落盘任何 Action 调用记录，满足验收无工具调用记录的规格。

---

##### B1.5 工具与技能预留

**B1_5_1 工具与技能抽象协议与注册中心预留**
- 状态：已确认
- 需求描述：为后续工具与技能保留统一的注册与调用入口，新增工具只需注册即可进入对话链路，不改动对话主体。
- 详细方案设计：
  1. 在 `Assistant/agent/tools/base.py` 中定义抽象协议：
     ```python
     class BaseTool(Protocol):
         name: str
         description: str
         parameters: dict  # JSON Schema
         async def execute(self, **kwargs) -> str: ...
     ```
  2. 在 `Assistant/agent/tools/registry.py` 中实现单例 `ToolRegistry`：
     - 维护内部字典 `_tools: dict[str, BaseTool] = {}`；
     - 提供 `register(tool: BaseTool)`、`get(name: str) -> BaseTool | None`、`list_tools() -> list[dict]` 与 `is_empty() -> bool`；
     - 第二版初始状态保持注册中心完全为空，不注册任何工具实例。

**B1_5_2 界面零侵入与工具预留接口解耦**
- 状态：已确认
- 需求描述：本阶段前端界面上不出现任何工具或技能相关入口、开关与提示，对话主体与注册表状态松耦合。
- 详细方案设计：
  1. 前端 HTML / CSS / JS 完全不引入与工具、插件、插件市场或技能配置相关的 DOM 元素、图标或状态显示；
  2. `ReActLoop` 仅依赖 `ToolRegistry` 提供的公共方法查询工具，当列表为空时平滑旁路动作分发，保证后续接入工具时对话主干代码无需重构。

---

##### B1.6 错误提示

**B1_6_1 模型调用异常分类诊断与中文友好错误映射**
- 状态：已确认
- 需求描述：在线形态下模型调用失败（未配置密钥、鉴权失败、网络中断、请求超时、服务端错误）时，在对话区给出可读的中文提示。
- 详细方案设计：
  1. 服务端统一异常分类与错误码映射表：
     - 未配置密钥（`NO_API_KEY`）-> "未检测到模型密钥，请在本地环境变量配置后重试。"
     - 401/403 鉴权失败（`AUTH_FAILED`）-> "模型密钥鉴权失败，请检查本地配置的 API Key 是否有效。"
     - 429 频率超限/欠费（`QUOTA_EXCEEDED`）-> "模型服务商额度已耗尽或请求过于频繁，请稍后再试。"
     - 网络超时（`TIMEOUT`）-> "连接模型服务商超时，请检查您的网络连接与代理设置。"
     - 5xx 服务端错误（`UPSTREAM_ERROR`）-> "模型服务商服务器返回异常，请稍后重新发起请求。"
     - 其他内部未预期异常（`INTERNAL_ERROR`）-> "生成过程发生异常，请重试。"
  2. SSE 错误事件：当异常发生时，下发 `event: error\ndata: {"code": "...", "message": "上述中文文案"}\n\n`。

**B1_6_2 对话区异常上屏与历史消息安全保留**
- 状态：已确认
- 需求描述：发生异常时不白屏、不静默失败、不自动改用 mock，且已经显示的消息与历史记录完好保留。
- 详细方案设计：
  1. 前端接收到 `error` 事件或网络非 200 状态码时：
     - 若当前已有部分文字流式上屏：保留已有文本，在其后方换行追加 `.msg__error-tip`（弱警告色背景卡片），渲染服务端下发的友好中文文案；
     - 若尚未有任何文字上屏（在等待阶段报错）：将 Agent 消息气泡内容替换为错误提示文案，并赋予 `.msg--agent.is-error` 样式；
  2. 严格禁止自动降级回退到 mock 回复，确保错误态真实可感知；
  3. 异常消息对象标记为 `status = 'error'`，此前已发送的用户消息与历史上下文原样保留在页面和数据库中。

---

##### B1.7 本地持久化（在线形态）

**B1_7_1 SQLite 数据库初始化与数据模式定义**
- 状态：已确认
- 需求描述：在线形态的会话与消息保存在本机 SQLite 数据库，刷新页面、重启服务后仍可读取，关闭浏览器不丢失。
- 详细方案设计：
  1. 新增 `Assistant/storage/db.py`：
     - 在服务启动时自动检查并在项目根目录下建立 `data/` 目录；
     - 初始化 SQLite 连接，开启 WAL 模式（`PRAGMA journal_mode = WAL`）提升并发读写性能，开启外键约束（`PRAGMA foreign_keys = ON`）；
     - 自动执行建表脚本：创建 `sessions`（会话表）、`messages`（消息表）、`generation_tasks`（任务追踪表）；
  2. 连接生命周期：利用 FastAPI lifespan 上下文管理器在应用启动时初始化数据库，在关闭时安全断开所有连接。

**B1_7_2 在线会话与消息持久化 CRUD 仓储层实现**
- 状态：已确认
- 需求描述：实现会话增删改查、消息追加与状态维护的异步仓储层，保证数据持久化一致性。
- 详细方案设计：
  1. 新增 `Assistant/storage/session_store.py`，实现 `SessionStore`：
     - `create_session(session_id, title)`：插入 `sessions` 表；
     - `get_sessions() -> list[dict]`：查询所有在线会话，按 `updated_at DESC` 排序；
     - `rename_session(session_id, new_title)`：更新会话标题与 `updated_at`；
     - `delete_session(session_id)`：删除会话记录（依靠外键级联清理 `messages` 与 `generation_tasks`）；
     - `save_message(message_id, session_id, role, content, status)`：持久化单条消息；
     - `update_message_content(message_id, content, status)`：流式增量或最终完成更新。

**B1_7_3 差异化存储隔离**
- 状态：已确认
- 需求描述：在线形态持久化至磁盘，离线形态仅在内存保留；未发送的草稿输入文字不持久化，仍按既有规则在页面内维护。
- 详细方案设计：
  1. 存储路由分流：离线形态下发送的消息绝不写入 SQLite 数据库，刷新页面后按 A6.1 全部清空；在线形态下的增删改查全量走持久化 API；
  2. 草稿文字处理：未发送的草稿文本（无论是在线草稿还是离线草稿）均只保留在前端 `store.js` 内存中，完全不落库，页面刷新后输入框重置为空白草稿，严格符合 B1.7 规定。

---

##### B1.8 生成与页面解耦

**B1_8_1 后端异步生成任务管理器与多会话并发架构**
- 状态：已确认
- 需求描述：在线形态下发出的消息在后台持续生成直至完成；不同会话支持同时生成，互不阻塞。
- 详细方案设计：
  1. 新增 `Assistant/agent/task_manager.py`，定义 `TaskManager` 全局单例；
  2. 任务结构：
     ```python
     class GenerationTask:
         task_id: str
         session_id: str
         message_id: str
         asyncio_task: asyncio.Task
         chunk_buffer: list[str]       # 已产生的增量文本缓存
         subscribers: set[asyncio.Queue] # 正在监听该任务的客户端连接
         status: Literal["running", "completed", "interrupted", "failed"]
     ```
  3. 并发度设计：每个会话在生成时独立启动 `asyncio.create_task(...)`，会话 A 与会话 B 各自拥有独立的协程与状态，实现真正的多会话并发生成、互不等待。

**B1_8_2 会话级解耦 SSE 订阅与前端切页/切会话无缝重连**
- 状态：已确认
- 需求描述：用户在生成期间切换会话、切到其他导航页或刷新页面，后台继续生成；返回时若已完成则展示完整内容，若仍在生成中则显示"正在生成"并自动更新补齐。
- 详细方案设计：
  1. 客户端切走逻辑：
     - 用户在流式期间切换到其他会话或切换至其他路由：前端关闭当前的 EventSource / fetch SSE 连接，释放前端网络资源；服务端的后台生成任务检测到订阅者离开，仅从 `subscribers` 移除该客户端队列，**生成协程绝不 cancel，继续全速运行并将增量写入数据库**；
  2. 客户端切回/刷新恢复逻辑：
     - 用户返回该会话或刷新后重新进入该会话：
       - 前端调用 `GET /api/sessions/{session_id}/messages` 拉取消息列表；
       - 若最新一条 Agent 消息状态为 `"done"`，直接渲染完整内容；
       - 若最新一条 Agent 消息状态仍为 `"streaming"`：前端将气泡渲染为等待态，并立即发起 `GET /api/chat/stream?session_id={session_id}`；
       - 服务端接收到订阅后，先将 `chunk_buffer` 中积累的文本一次性推送给客户端完成追赶，随后继续实时广播后续增量，直至下发 `done` 事件并完成。

**B1_8_3 停服与异常崩溃中断标记与恢复处理**
- 状态：已确认
- 需求描述：服务被关闭或崩溃导致回复未完成时，已生成部分保留并标记"已中断"，不自动重试，用户可手动再次发送。
- 详细方案设计：
  1. 服务端启动补偿扫描（Recovery on Startup）：
     - 在 `Assistant/app.py` 的 lifespan 启动钩子中，调用 `session_store.recover_interrupted_tasks()`；
     - 执行 SQL 补偿：`UPDATE messages SET status = 'interrupted' WHERE status = 'streaming'`；
     - 执行任务表补偿：`UPDATE generation_tasks SET status = 'interrupted' WHERE status = 'running'`；
  2. 前端展示与用户重发：
     - 对状态为 `"interrupted"` 的消息，气泡底部或末尾展示徽标 `<span class="badge badge--interrupted">已中断</span>`；
     - 气泡文本保持显示此前已经成功落盘的部分内容；
     - 系统不执行任何静默自动重试，输入框保持就绪状态，用户可选择手动再次发送新消息。

---

##### B1.9 会话列表沿用

**B1_9_1 会话列表生命周期操作在持久化层的适配沿用**
- 状态：已确认
- 需求描述：会话的新建、切换、重命名、删除、自动标题生成等生命周期逻辑，在双形态下完全沿用 A6.2 到 A6.11 规范。
- 详细方案设计：
  1. 新建对话：在线形态同样采用"延迟创建草稿态"（A6.4）；点击"新建对话"仅进入空白草稿态，只有在用户成功发出首条消息后，才调用 `POST /api/sessions` 正式落库并进入列表；
  2. 自动标题：首条消息发出时，依然严格采用 A6.5 算法（空白折叠与 Unicode 10 字符感知切片截取），落库并展示在列表；
  3. 行内重命名：保留悬停笔图标、行内 input 编辑、防失焦重复提交与输入法组合保护（A6.6），保存时调用 `PATCH /api/sessions/{id}` 同步更新本地数据库；
  4. 删除会话：保留悬停垃圾桶图标（A6.7），点击后调用 `DELETE /api/sessions/{id}` 同步清除本地持久化，当前会话被删后同样安全回退至空白草稿态。

**B1_9_2 全会话未发送草稿在双形态下的统一页面内存管理**
- 状态：已确认
- 需求描述：全会话未发送输入文字保留（A6.10）与空白草稿再次新建显式丢弃（A6.11），在在线形态下与离线形态保持完全一致的交互体验。
- 详细方案设计：
  1. 前端 `store.js` 统一维护内存中的草稿字典 `sessionDrafts: { [sessionId: string]: string }` 以及空白草稿槽位 `draftText: string`；
  2. 用户在不同在线会话间切换、或切到其他路由导航再返回时，直接从前端内存读取对应会话的草稿文字恢复到文本框，调用 `adjustInputHeight()` 与 `syncSendButtonState()`；
  3. 再次在空白草稿态点击"新建对话"时，彻底清空丢弃 `draftText`（A6.11）；
  4. 既有会话已发出的消息不受影响，草稿仅在运行时内存留存，不发起数据库读写，确保零磁盘 I/O 延迟与高响应度。
