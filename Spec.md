# Spec：Emibot

<!-- 文档职责：回答"具体怎么实现"。只保留四部分：目录结构、架构、接口与数据规定、需求列表。不写项目背景与目标（属于 Intent.md），不写开发过程日志（属于 Memory.md）。

```
 编号规则：对应 Intent.md 中的单条需求 A{x}.{y} 或 B{x}.{y}，本文拆解为若干实现子项 Ax_y_z 或 Bx_y_z（x 为子板块号，y 为需求号，z 为从 1 递增的实现部分序号）。  
 编号一经分配不得更改或复用；条目废弃时保留原编号，并标注"已废弃"。  
 每个 Ax_y_z / Bx_y_z 条目固定包含三项：状态、需求描述、详细方案设计。  
 阅读时默认只读本文档内容，不读取已归档内容。只有在和先前功能有关联的时候才需要读取。  
  
  
 状态取值：已确认（方案已定，待实现）/ 进行中（正在实现，未验收）/  
 已完成（已实现并通过验收）/ 待确认（方案待拍板）/ 已废弃。  
  
 归档规则：  
 1. 触发条件：当且仅当用户明确表达"归档"等意思后才进行归档；用户输入"开始下一阶段"时不进行归档；无需再次确认。  
 2. 归档文件：将当前母文档复制到 Archive/ 目录，重命名为 {M}_{N}_spec.md（M 为当前阶段如 vA、vB，N 为该阶段备份序号，从 0 开始递增）。Archive/ 文件夹及备份文件已配置 .gitignore 忽略。  
 3. 范围边界：仅归档当前阶段实现规格，后续阶段预研/未开发规格不计入当前阶段归档并保留在母文档中。  
 4. 清空与提交：归档完成后，清空母文档中已归档阶段的需求列表板块，保留系统架构、接口规定与后续阶段规格；执行原子 commit，备注格式统一为 docs(archive): {M}_{N}整理归档intent,spec。 -->
```

## 一、目录结构

```
Lab1/  
├── Assistant/  
│   ├── __init__.py              包标记  
│   ├── __main__.py              启动入口：python -m Assistant  
│   ├── app.py                   FastAPI 装配：路由、静态托管、缓存策略、生命周期管理  
│   ├── config.py                常量、环境变量与日志初始化（系统唯一配置读取点）  
│   ├── storage/                 [第二版新增] 本地异步持久化层  
│   │   ├── __init__.py  
│   │   ├── db.py                SQLite 异步连接管理、WAL 模式配置、Per-Connection 外键开启与建表迁移  
│   │   └── session_store.py     会话与消息异步 CRUD 仓储实现、节流刷盘、未完任务状态补偿  
│   ├── api/  
│   │   ├── __init__.py  
│   │   ├── health.py            GET /api/health  
│   │   ├── config_status.py     [第二版新增] GET /api/config/status（探测密钥配置状态，不泄露内容）  
│   │   ├── sessions.py          [第二版新增] RESTful 会话 CRUD 与在线消息触发接口  
│   │   ├── chat.py              POST /api/chat（离线 SSE）与 POST /api/chat/abort（任务中断）  
│   │   ├── stream.py            [第二版新增] GET /api/chat/stream（会话级解耦 SSE 实时增量订阅）  
│   │   └── schemas.py           请求、响应、任务与事件的 Pydantic 数据模型  
│   ├── agent/  
│   │   ├── __init__.py  
│   │   ├── base.py              ChatMessage 与 Agent 协议  
│   │   ├── mock_agent.py        mock 回复的唯一生成位置  
│   │   ├── llm_client.py        [第二版新增] OpenAI 兼容协议异步流式 HTTP 客户端（基于 httpx）  
│   │   ├── online_agent.py      [第二版新增] 真实大模型在线 Agent 外观实现  
│   │   ├── react.py             [第二版新增] ReAct 循环执行引擎（推理-行动-观察循环）  
│   │   ├── tools/               [第二版新增] 工具与技能预留抽象层  
│   │   │   ├── __init__.py  
│   │   │   ├── base.py          BaseTool 协议与 ToolCall 模型  
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
│           ├── store.js         双形态状态管理：离线纯内存数据源与在线持久化数据源、会话级流状态映射  
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
- 配置状态路由独立命名为 `Assistant/api/config_status.py`，避免与全局配置 `Assistant/config.py` 同名冲突。
- 模型流式通信独立抽取为 `Assistant/agent/llm_client.py`，供 `ReActLoop` 依赖调用，彻底解耦 `OnlineAgent` 与 ReAct 循环依赖。

---

## 二、架构

### 2.1 组件关系图

```
浏览器端（原生 ES Modules）  
├── 顶栏形态切换器（离线 ⇄ 在线）  
├── 对话工作区（views/chat.js）  
│   ├── 离线数据流：内存 store.js ── POST /api/chat（直连 MockAgent 同步 SSE 直出）  
│   └── 在线数据流：  
│       ├── 会话管理：RESTful API（GET/POST/PATCH/DELETE /api/sessions）── SQLite 持久化  
│       ├── 触发生成：POST /api/sessions/{session_id}/messages ── 202 异步任务  
│       ├── 解耦订阅：GET /api/chat/stream?session_id={id} ── 接收 SSE delta 增量  
│       └── 任务中断：POST /api/chat/abort ── 中断指定会话正在进行的任务  
FastAPI 服务端（Assistant/app.py）  
├── 静态托管与配置检查：/api/config/status（安全探测密钥配置状态）  
├── 异步持久化仓储层（storage/，基于 aiosqlite）：  
│   ├── SQLite（WAL 模式 + Per-Connection 外键开启）── sessions 表、messages 表、generation_tasks 表  
│   └── 增量节流写盘（流式缓冲定时刷盘，done/interrupted 强制 flush）  
├── 后台任务管理器（agent/task_manager.py）：  
│   ├── 并发任务调度池（多会话独立 asyncio.Task，互不阻塞，单会话严格串行）  
│   ├── 增量缓冲区与广播分发队列（动态挂载/卸载前端 SSE 订阅者，支持断线重连追赶）  
│   └── 进程异常恢复补偿（启动扫描中断状态）  
└── 智能体执行层（agent/）：  
    ├── 离线形态：MockAgent（纯文本关键词流式直出）  
    └── 在线形态：OnlineAgent ── ReActLoop ── LLMClient（OpenAI 兼容协议流式）  
                                        └── ToolRegistry（统一工具注册中心，第二版为空）
```

### 2.2 前端模块职责与依赖方向


| 文件                 | 职责                                                                                                                                                               | 允许依赖                     |
|------------------------|----------------------------------------------------------------------------------------------------------------------------------------------------------------------|----------------------------------|
| `main.js`              | 入口：构建导航、初始化路由、注册全局事件、装配双形态                                                                                       | 其余全部前端模块         |
| `routes.js`            | 路由、导航标签、图标、页面标题、占位页文案的唯一配置源                                                                                    | `icons.js`                       |
| `router.js`            | 解析 hash、主侧栏折叠切换、切换视图、更新导航高亮与 `document.title`                                                                          | `routes.js`                      |
| `store.js`             | 双形态状态管理：离线纯内存数据源与在线持久化数据源、草稿维护、当前活动会话与会话级流状态映射（`streamingBySession`） | `dom.js`                         |
| `api.js`               | RESTful API 客户端（会话与消息 CRUD、状态检查、中断请求）与会话级解耦 SSE 订阅客户端                                                  | 无                              |
| `dom.js`               | `el()`、`createSvgIcon()`、`formatTimestamp()`、`scrollToBottom()`、`isNearBottom()`                                                                             | 无                              |
| `views/chat.js`        | 对话页 DOM、会话列表渲染、新建/重命名/删除会话、形态切换响应、解耦流式订阅与重连、异常气泡渲染                           | `store.js`、`api.js`、`dom.js` |
| `views/placeholder.js` | 占位页渲染                                                                                                                                                      | `routes.js`、`dom.js`           |
| `icons.js`             | SVG symbol id 常量                                                                                                                                                 | 无                              |


- 依赖方向严格自上而下，禁止视图模块之间互相 `import`，禁止 `api.js` 操作 DOM。

### 2.3 对话全链路时序与状态归属

1. 浏览器加载 `/`，`main.js` 根据 `routes.js` 生成侧栏导航，`router.js` 解析 hash；无 hash 或非法 hash 时替换为 `#/chat`。每次启动或刷新页面，工作台默认进入**离线形态**。
2. 路由进入对话页（`#/chat`）时，左侧主导航自动收缩为仅显示图标的缩略态，紧邻展开会话列表栏；首次加载默认处于未创建的空白草稿态（`activeSessionId = null`），输入框可用，消息区显示空状态。
3. 草稿状态统一实时写入：监听输入框的 `input` 事件，每次键入实时将最新内容写入当前活动目标：4. 若处于空白草稿态（`activeSessionId === null`），实时写入 `store.draftText`；
5. 若处于既有会话（`activeSessionId !== null`），实时写入对应会话的 `store.sessionDrafts[activeSessionId]`；
6. 切换会话或切离对话页时无需依赖离场钩子，切回时直接从目标对象读取回填并联动自适应高度与发送按钮状态。
7. 在线形态消息发送与解耦流转：
8. 草稿态发出首条消息：自动按 `Array.from(trimmed.replace(/\s+/g, ' ')).slice(0, 10).join('')` 截取生成标题并通过 `POST /api/sessions` 创建新会话落盘；
9. 用户消息与时间戳立即上屏，输入框清空并聚焦；
10. 前端调用 `POST /api/sessions/{session_id}/messages` 触发服务端异步生成；服务端将用户消息与助手初始占位写入 SQLite，更新会话 `updated_at`，在后台启动独立的 `asyncio.Task` 开始 ReAct 循环推理，返回 202 Accepted 及任务信息；
11. 前端登记该会话的流式状态（写入 `store.streamingBySession[sessionId]`）并立即建立 `GET /api/chat/stream?session_id={id}` 的 SSE 增量订阅连接；
12. 切走与切回：用户切到其他会话或页面时，前端主动关闭该会话的 SSE 订阅连接（仅断开 `GET /api/chat/stream`，不调用 `/api/chat/abort`）并清除 `store.streamingBySession[sessionId]`，服务端的后台生成协程不受任何影响继续全速运行；切回或刷新后，前端拉取最新消息列表，若最新一条助手消息 `status === 'streaming'`，则重新在 `store.streamingBySession[sessionId]` 登记 `AbortController`、先清空气泡既有文本缓存，并重新连入 SSE，服务端先推送增量缓冲区文本进行追赶，随后继续实时广播增量。
13. 离线形态消息发送与串行流式：
14. 沿用第一版纯内存管理与 `MockAgent` 确定性流式生成，通过 `POST /api/chat` 直连同步 SSE 输出，不读写本地数据库，数据在刷新页面后清空。
15. 状态归属：
16. 离线形态数据只保存在浏览器内存（`store.js`）；
17. 在线形态的会话、消息与任务状态保存在服务端 SQLite 数据库中，关闭浏览器、重启服务后不丢失；
18. 未发送的输入文字（草稿）仅保存在浏览器运行时内存中，刷新后重置。


### 2.4 双形态切换与隔离架构

1. **形态定位与默认值**：2. 工作台具备两套完全解耦的数据流与执行模式：离线形态（`mode = "offline"`）与在线形态（`mode = "online"`）。
3. 每次后端服务启动或前端网页重新打开，均默认进入**离线形态**，确保无网络与未配置密钥时的即开即用体验。
4. **切换阻断保护**：
5. 用户点击顶栏切换控件请求切入在线形态时，前端首先异步调用 `GET /api/config/status`。
6. 若返回 `has_api_key: false`，立即阻断切换流程，通过对话区顶部弱侵入提示横幅明确提示（文案引用 3.6 节 `NO_API_KEY` 映射：“未检测到模型密钥，请在本地环境变量配置并重启服务后重试。”），工作台保持在离线形态。
7. **状态隔离与草稿流转**：
8. 离线形态的数据完全保留在前端 `store.js` 内存对象中（`state.offlineSessions`），切到在线形态时离线数据不销毁，切回时依然完好（直到页面刷新按 A6.1 清空）；
9. 在线形态的数据均通过接口从后端 SQLite 数据库实时拉取；
10. 无论从离线切到在线，还是从在线切到离线，消息区均自动落入当前形态下的**空白草稿态**（`activeSessionId = null`），杜绝跨形态会话混乱；
11. 未发送的输入文字按 A6.9 与 A6.10 规则保留在前端内存，切换形态时不随之清空，方便用户在两端直接输入。
12. **生成中切换安全处理**：
13. 若在回复生成期间用户主动切换形态：14. 若当前处于在线生成：前端向后端发送 `POST /api/chat/abort`（携带当前会话 `session_id`），后台生成协程中止执行，已生成的文本切片存入数据库并标记状态为 `"interrupted"`；
15. 若当前处于离线生成：前端直接调用当前请求的 `abortController.abort()` 丢弃本次回复，不保存任何片段；
16. 切换后目标形态的输入区立即可用。


### 2.5 生成与页面解耦架构（后台任务 + 广播式 SSE）

```
【客户端】                                           【服务端 TaskManager】                【大模型 / 存储】  
│                                                        │                                    │  
│ 1. 发送消息 POST /api/sessions/X/messages              │                                    │  
│    { content } ───────────────────────────────────────>│ 2. 写入用户消息与占位助手至 SQLite  │  
│                                                        │ 3. 启动后台异步任务 asyncio.Task   │  
│                                                        │    注册该会话任务并绑定 TaskManager │  
│<── 返回 task_id / 202 Accepted ────────────────────────│                                    │  
│                                                        │ 4. 驱动 ReAct 循环流式生成        │────> 调用 LLM  
│ 5. 建立解耦订阅 GET /api/chat/stream?session_id=X ───────>│                                    │<──── 接收 chunk  
│                                                        │ 6. 缓冲区追赶 + 实时广播 delta 事件│  
│<── SSE delta 事件逐块推送 ──────────────────────────────│ 7. 节流批量更新数据库增量文本     │────> UPDATE DB  
│                                                        │                                    │  
├─── [用户切至会话 Y 或刷新页面]                          │                                    │  
│ 8. 断开与会话 X 的 SSE 客户端连接                       │ 9. 后台任务不受影响，继续执行生成  │────> 调用 LLM  
│                                                        │ 10. 生成完毕，标记 status='done'   │────> UPDATE DB  
│                                                        │                                    │  
├─── [用户切回会话 X]                                    │                                    │  
│ 11. 拉取历史 GET /api/sessions/X/messages ─────────────>│ 从 SQLite 返回当前全部历史        │  
│<── 渲染消息列表 ───────────────────────────────────────│                                    │  
│ (若最新消息 status 为 streaming，重新连入 SSE 继续接收增量) │                                    │
```

1. **服务端任务常驻**：2. 在线形态下的回复生成逻辑完全脱离单个 HTTP 请求生命周期，由服务端的 `TaskManager` 管理的独立 `asyncio.Task` 承载。
3. 单一会话严格保证串行顺序执行（若同一会话已有生成任务在运行，再次提交返回 409 Conflict），不同会话之间并发独立执行，各会话的生成任务互不阻塞。
4. **广播与重连追赶**：
5. `TaskManager` 为每个活跃的生成任务维护一个最近生成的文本增量队列（Chunk Buffer）与一组监听中的客户端 `asyncio.Queue`。
6. 订阅竞态处理规则：当客户端连入 `GET /api/chat/stream?session_id={id}` 时：7. 若该会话当前无正在运行的任务：服务端立即下发 `done`（若数据库中状态为 error 则下发 `error`）事件并正常关闭流，客户端收到后根据最新历史渲染，不挂起也不报错；
8. 若该会话有正在运行的任务：服务端在同一个同步执行段内将缓冲区快照与新订阅者队列绑定（杜绝 await 穿插造成的漏字或重复），先一次性推送已产生的全部缓冲区文本，随后继续下发后续实时增量，前端无感续接。
9.
前端重连处理规则：前端重连订阅前，先将当前气泡文本内容置空，统一通过服务端的增量追赶事件流重建，避免数据库已有内容与缓冲区重放文本发生叠加重复。
10. **数据库写入节流与终态落盘顺序规定**：
11. 流式生成期间，服务端不对每个字符/每个 chunk 立即执行数据库写入，而是采用节流批处理机制（每 300ms 刷新一次或累计到达固定步长时刷盘），确保多会话并发下的数据库 I/O 稳定。
12. **终态顺序死锁与竞态防护**：当生成任务结束（`done`）、被中断（`interrupted`）或失败（`error`）时，必须严格按以下顺序执行收尾：**① 强制执行最终 flush 写库并同步更新 `messages` 与 `generation_tasks` 的终态 → ② 向所有活跃订阅者队列广播 `done` 或 `error` 终态事件 → ③ 从 `TaskManager` 活跃任务表中移除该任务**。严禁在数据库落盘前广播终态事件，确保客户端收到终态事件后拉取历史或重连时一定读到最新终态数据。
13. **异常中断与优雅停服保护**：
14. 正常停服（如 `Ctrl+C` 触发 FastAPI `lifespan` shutdown）：服务端主动取消所有正在运行的生成任务并等待其将已生成文本以 `"interrupted"` 状态刷入数据库、关闭全部 SSE 订阅流后再断开数据库连接，防止 Uvicorn 因长连接挂起而无法退出；
15. 异常崩溃恢复：若服务进程因断电或强制杀死导致任务非正常终止，后端在下次启动初始化时自动扫描数据库中状态为 `"streaming"` 的未完消息及 `"running"` 的未完任务，将其统一更新为 `"interrupted"`（已中断）；
16. 前端重连或刷新后，展示已生成的部分内容，并在气泡后方带有"已中断"标记，不自动重试，等待用户手动点击重新发送。


### 2.6 ReAct 循环执行引擎架构

```
                   ┌──────────────────────────────────────────┐  
                   │               会话历史上下文             │  
                   └────────────────────┬─────────────────────┘  
                                        │  
                                        ▼  
                   ┌──────────────────────────────────────────┐  
                   │            普通系统提示词                │  
                   │ (无工具阶段直接对话，不输出 Thought 文本标记)│  
                   └────────────────────┬─────────────────────┘  
                                        │  
                                        ▼  
                         ┌─────────────────────────────┐  
                         │      LLMClient 流式推理     │  
                         └──────────────┬──────────────┘  
                                        │  
                                        ▼  
                         ┌─────────────────────────────┐  
                         │ 检测结构化工具调用(tool_calls)│  
                         └──────┬───────────────┬──────┘  
                                │               │  
          [命中 Action 调用]     │               │ [最终回答 / 普通文本增量]  
                                ▼               ▼  
     ┌─────────────────────────────┐        ┌───────────────────────────────┐  
     │   分发至 ToolRegistry 查找  │        │ 输出最终回答 (Final Answer)   │  
     └──────────────┬──────────────┘        │ SSE 逐块向前端实时推送        │  
                    │                       └───────────────┬───────────────┘  
                    ▼                                       │  
     ┌─────────────────────────────┐                        ▼  
     │ 验证注册表 (第二版为空注册表)│                ┌───────────────────────────────┐  
     │ 校验到无工具可用            │                │ 循环结束，标记完成 (done)     │  
     └─────────────────────────────┘                └───────────────────────────────┘
```

1. **结构定义**：2. 核心循环包含三要素：**Thought（思考推理）**、**Action / Action Input（工具行动）**、**Observation（环境观察）**，最终收敛于 **Final Answer（最终回答）**。
3. 循环入口：`async def run(self, messages: list[ChatMessage]) -> AsyncIterator[str]`；
4. 动作分发点：`async def dispatch_action(self, tool_call: ToolCall) -> str`；
5. 最大步数上限：`max_steps = 5`，若达到最大步数仍未生成最终回答，下发 `INTERNAL_ERROR` 异常事件并安全中止。
6. **第二版特化约束（无工具运行与流式防泄露）**：
7. 严格遵循 Intent B1.4 与 B1.5 规定：第二版工具注册中心保留统一抽象协议，但**不注册任何具体工具（`ToolRegistry.is_empty() == True`）**；
8. **流式防泄露策略**：无工具运行阶段，Prompt 模板**严禁**注入要求模型输出 `Thought:` / `Final Answer:` 文本前缀的指令，避免 Thought 思考过程随流式推送到前端违反“不展示模型推理过程”规范；而是使用标准对话系统提示词，模型单次流式输出直接作为最终回答向订阅流抛出；
9. 保留 `ReActLoop.run` 循环骨架与 `dispatch_action` 入口，当且仅当检测到模型命中结构化工具调用时才进入分发；若分发点校验到 `ToolRegistry.is_empty()`，则安全阻断动作分发；
10. 后续阶段接入具体工具时，统一基于 OpenAI 原生 `tools` 与 `tool_calls` 结构化参数交互，不依赖脆弱的文本解析器。


### 2.7 功能分支拆分


| 阶段    | 顺序 | 分支                          | 实现范围                                                                                                                                                                                                                                                                                | 对应 Intent 需求                                            | 状态    |
|-----------|--------|---------------------------------|---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|-----------------------------------------------------------------|-----------|
| 第一版 | 1      | `feature/app-shell`             | Python 服务骨架、配置、静态托管、前端外壳、侧栏导航、顶栏、四个占位页、hash 路由                                                                                                                                                                          | A1.1 ~ A1.9                                                     | 已完成 |
| 第一版 | 2      | `feature/mock-agent`            | Agent 协议、mock 生成器、工厂、`POST /api/chat` SSE 接口与异常处理                                                                                                                                                                                                         | A3.1 ~ A3.3                                                     | 已完成 |
| 第一版 | 3      | `feature/chat-window`           | 对话页完整实现：消息列表、气泡、时间戳、输入区、发送队列、SSE 接入、打字机光标                                                                                                                                                                         | A2.1 ~ A2.7、A2.9、A4.1                                       | 已完成 |
| 第一版 | 4      | `feature/session-list`          | 会话列表与导航折叠：多会话模型、延迟创建、导航缩略、会话列表栏、新建/改名/删除、草稿保留与丢弃                                                                                                                                                | A6.1 ~ A6.11                                                    | 已完成 |
| 第二版 | 5      | `feature/storage-crud`          | 本地 SQLite 异步持久化层、会话 CRUD、顶栏形态切换器 UI、密钥预检与静默态数据流切换                                                                                                                                                                         | B1.1（B1_1_1、B1_1_2 及 B1_1_3 静默切换）、B1.7、B1.9 | 已完成 |
| 第二版 | 6      | `feature/online-react-agent`    | 本机模型配置读取、OpenAI 兼容流式客户端（LLMClient）、ReAct 循环引擎、工具注册中心预留、多轮上下文构建与中文错误提示                                                                                                                         | B1.2、B1.3、B1.4、B1.5、B1.6                                | 已完成 |
| 第二版 | 7      | `feature/generation-decoupling` | 后台解耦任务管理器（TaskManager）、`POST /api/sessions/{id}/messages` 异步生成触发、会话级订阅流 `GET /api/chat/stream`、任务中断 `POST /api/chat/abort`、生成中切换形态安全中断（`B1_1_3`）、停服崩溃状态恢复与多会话并发验收 | B1.8、B1.1（B1_1_3 生成中中断收尾）                   | 已完成 |


---

## 三、接口与数据规定

### 3.1 环境变量与配置常量（`Assistant/config.py`）


| 环境变量名             | Python 导出常量名 | 类型 / 默认值                        | 规定                                                                                                                                                                                                                                                                                                                                                                       |
|-----------------------------|------------------------|-------------------------------------------|------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------|
| `ASSISTANT_HOST`            | `HOST`                 | `str` / `"127.0.0.1"`                     | 环境变量；强制校验环回地址白名单 `("127.0.0.1", "localhost", "::1")`，若配置为 `0.0.0.0` 或非环回地址则回退 `"127.0.0.1"` 并打 warning 日志；服务端严禁配置通配符 CORS（禁止 `allow_origins=["*"]`），并对写操作请求校验 `Origin` / `Host` 头只放行本机环回源，防止外部恶意网页跨站触发 API |
| `ASSISTANT_PORT`            | `PORT`                 | `int` / `8000`                            | 环境变量；要求 `>= 1`，非法值回退默认并打 warning 日志                                                                                                                                                                                                                                                                                                 |
| `ASSISTANT_STREAM_DELAY_MS` | `STREAM_DELAY_MS`      | `int` / `20`                              | 环境变量；离线 mock 每个文本块间隔毫秒数，要求 `>= 0`                                                                                                                                                                                                                                                                                                 |
| `ASSISTANT_CHUNK_SIZE`      | `CHUNK_SIZE`           | `int` / `1`                               | 环境变量；离线 mock 每个文本块字符数，要求 `>= 1`                                                                                                                                                                                                                                                                                                       |
| `ASSISTANT_OPEN_BROWSER`    | `OPEN_BROWSER`         | `bool` / `False`                          | 环境变量；设为 `1` 或 `true` 时服务就绪后自动弹出默认浏览器                                                                                                                                                                                                                                                                                           |
| `ASSISTANT_API_KEY`         | `API_KEY`              | `str` / `""`                              | 环境变量；模型服务商 API 密钥，统一由 `config.py` 读取，严禁下发给前端或打印至日志                                                                                                                                                                                                                                                           |
| `ASSISTANT_BASE_URL`        | `BASE_URL`             | `str` / `"https://api.openai.com/v1"`     | 环境变量；兼容 OpenAI 协议的模型 API 基础端点，读取时统一执行 `.strip().rstrip("/")`，防止拼接路径产生双斜杠                                                                                                                                                                                                                             |
| `ASSISTANT_MODEL`           | `MODEL`                | `str` / `"gpt-4o-mini"`                   | 环境变量；在线形态调用的模型名称                                                                                                                                                                                                                                                                                                                             |
| `ASSISTANT_DB_PATH`         | `DB_PATH`              | `Path` / `data/emibot.db`                 | 环境变量或常量；本地 SQLite 数据库文件绝对路径，所在目录自动递归创建                                                                                                                                                                                                                                                                           |
| `ASSISTANT_REQUEST_TIMEOUT` | `REQUEST_TIMEOUT`      | `int` / `60`                              | 环境变量；模型上游网络请求超时时间（秒），下限为 5                                                                                                                                                                                                                                                                                                   |
| -                           | `APP_VERSION`          | `"0.2.0"`                                 | 常量；第二版应用版本号                                                                                                                                                                                                                                                                                                                                            |
| -                           | `MAX_MESSAGES`         | `30`                                      | 常量；单次请求滑动窗口最大上下文条数                                                                                                                                                                                                                                                                                                                       |
| -                           | `MAX_MESSAGE_CHARS`    | `4000`                                    | 常量；单条用户输入最大字符限制                                                                                                                                                                                                                                                                                                                                |
| -                           | `WEB_DIR`              | `Path(__file__).resolve().parent / "web"` | 常量；前端静态资源目录                                                                                                                                                                                                                                                                                                                                            |


- 系统内所有模块需要读取环境变量与常量时，统一从 `Assistant.config` 导入上方定义的 **Python 导出常量名**，严禁在其它业务模块散落 `os.environ.get(...)`。

### 3.2 健康检查接口（`GET /api/health`）

- 响应状态码：`200 OK`
- 响应体（`application/json`）：

```json
{  
"status": "ok",  
"version": "0.2.0",  
"agent": "mock",  
"time": "2026-11-06T14:13:21+08:00"  
}
```

- 字段规定：`agent` 取自当前活动 Agent 标识（离线默认为 `"mock"`，在线具备模型能力时为 `"online"`）；`time` 为带本地时区偏移的 ISO 8601 字符串（精确到秒）。

### 3.3 模式与配置安全探测接口（`GET /api/config/status`）

- 模块位置：`Assistant/api/config_status.py`
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
- 响应体：`[ { "id": "s_on_...", "title": "会话标题", "created_at": "...", "updated_at": "..." }, ... ]`（按 `updated_at` 降序）。

#### 3.4.2 创建在线会话（`POST /api/sessions`）

- 请求体：`{ "id": "s_on_...", "title": "首条消息截取标题" }`（若前端未指定 `id` 则由服务端生成 `s_on_<timestamp36>_<rand>`；`title` 经空白折叠后非空且长度在 `1..50` 字符之间）。
- 响应：`201 Created`，返回创建成功的会话完整对象 `{ "id": "s_on_...", "title": "...", "created_at": "...", "updated_at": "..." }`。
- 错误码：422（标题为空、格式非法或超过 50 字符）。

#### 3.4.3 重命名会话（`PATCH /api/sessions/{session_id}`）

- 请求体：`{ "title": "新标题" }`（空白折叠后非空，长度 `1..50` 字符）。
- 响应：`200 OK`，返回更新后的会话完整对象 `{ "id": "s_on_...", "title": "新标题", "created_at": "...", "updated_at": "..." }`。
- 错误码：404（会话不存在）、422（标题为空或超过 50 字符）。更新成功时同步将 `updated_at` 刷新为当前时间。

#### 3.4.4 删除会话（`DELETE /api/sessions/{session_id}`）

-
行为（严格先后顺序）：
1. 若该会话在 `TaskManager` 中有正在运行的生成任务，**首先调用 `await task_manager.cancel_and_wait(session_id)` 取消任务并等待协程收尾退出**，避免任务收尾写库与数据库级联删除发生竞态或外键冲突；
2. 随后执行数据库删除，依靠外键 `ON DELETE CASCADE` 级联删除该会话及其关联的所有 `messages` 与 `generation_tasks` 记录。

- 响应：`204 No Content`（删除成功，或会话原本不存在时保持幂等）。

#### 3.4.5 获取指定会话的历史消息（`GET /api/sessions/{session_id}/messages`）

- 响应：`200 OK`
- 排序规则：按 `seq ASC` 绝对严格升序排列。
- 字段规定：服务端返回每条消息时，若 `error_code` 非空，自动根据 **3.6 全局错误码与提示文案映射表** 填充 `error_message` 字段（否则为 `null`），前端直接渲染 `error_message`，无需在前端维护第二份错误码字典。
- 响应体：

```json
[  
{  
"seq": 1,  
"id": "m_u_1001",  
"role": "user",  
"content": "你好",  
"status": "done",  
"error_code": null,  
"error_message": null,  
"created_at": "2026-11-06T18:00:00+08:00"  
},  
{  
"seq": 2,  
"id": "m_a_1002",  
"role": "assistant",  
"content": "你好！我是 Emibot，请问有什么可以帮助你？",  
"status": "done",  
"error_code": null,  
"error_message": null,  
"created_at": "2026-11-06T18:00:02+08:00"  
}  
]
```

- 错误码：404（会话不存在）。

#### 3.4.6 发送在线消息触发生成（`POST /api/sessions/{session_id}/messages`）

- 模块位置：`Assistant/api/sessions.py`
- 用途：在线形态下发送用户消息，触发后台独立解耦生成任务。
- 请求体：		{  
"content": "请分析一下这段代码"  
}
- 响应状态码：`202 Accepted`
- 响应体（由服务端统一生成 `task_id`、`user_message_id`、`assistant_message_id`）：		{  
"task_id": "t_789abc",  
"session_id": "s_on_123456",  
"user_message_id": "m_u_001",  
"assistant_message_id": "m_a_002",  
"status": "running"  
}
-
行为与约束（严格防竞态顺序）：
1. 入参校验（`content` 去除首尾空白后非空，长度 `1..4000` 字符），非法返回 `422 Unprocessable Entity`；
2. 校验会话是否存在，不存在返回 `404 Not Found`；
3. **同步检查与原子占位（防 409 竞态）**：在同一个同步执行段（中间无任何 `await`）中检查 `TaskManager` 是否已存在该 `session_id` 的活跃任务或占位锁；若已存在则立即返回 `409 Conflict`（单一会话严格串行执行）；若不存在则立即在 `TaskManager` 中同步登记该会话占位（若后续数据库写入抛错则在 `except` 中释放占位）；
4. **单事务持久化三表记录**：在 `SessionStore` 写锁保护的同一个 SQLite 事务中：5. 插入用户消息（`id = m_u_...`, `status = 'done'`）；
6. 插入初始助手占位消息（`id = m_a_...`, `status = 'streaming'`, `content = ''`），自增 `seq` 确保用户消息严格在助手消息之前；
7. 插入 `generation_tasks` 记录（`task_id = t_...`, `session_id`, `message_id = m_a_...`, `status = 'running'`）；
8. 更新当前会话的 `updated_at` 为当前时间戳；
9. 在 `TaskManager` 启动后台独立 `asyncio.Task` 开始 ReAct 循环流式生成，立即返回 `202 Accepted`。

### 3.5 聊天与解耦流式生成接口

#### 3.5.1 离线聊天流式接口（`POST /api/chat`）

- 模块位置：`Assistant/api/chat.py`
- 用途：专供**离线形态**同步流式直出。
- 入参：沿用第一版 `ChatRequest`（`messages` 列表，允许 `user` 与 `assistant` 角色交错，校验通过后调用 MockAgent）。
- 协议：`text/event-stream; charset=utf-8` 同步 SSE 直出，保持第一版兼容性。

#### 3.5.2 会话级增量订阅（`GET /api/chat/stream?session_id={session_id}`）

- 模块位置：`Assistant/api/stream.py`
- 协议：`text/event-stream; charset=utf-8`，响应头 `Cache-Control: no-cache`、`X-Accel-Buffering: no`。
- 错误码：`404 Not Found`（当指定的 `session_id` 在数据库中不存在时直接返回 404）。
- 竞态兜底规则（当会话存在时）：- 若客户端请求订阅时，该会话当前**已没有正在运行的任务**：服务端立即下发 `done`（若数据库中最新助手消息状态为 `error` 则下发 `error`）事件并正常关闭流，前端拉取消息列表回显最终状态；
- 若该会话任务正在执行：服务端在同一个同步段内将 `chunk_buffer` 快照与新订阅者队列绑定，先将 `chunk_buffer` 中的增量文本一次性推给客户端完成追赶，随后继续实时广播后续增量，直至生成完毕下发 `done` 事件。
- 事件格式与类型约定引用 **3.6 SSE 事件协议通用规范**。

#### 3.5.3 中断生成任务（`POST /api/chat/abort`）

- 模块位置：`Assistant/api/chat.py`
- 用途：用户切换形态、删除会话或前端主动取消时，通知服务端安全中止指定会话的任务。
- 请求体：		{  
"session_id": "s_on_123456"  
}
- 响应：`200 OK`- 若成功中断正在运行的任务：`{ "session_id": "s_on_123456", "status": "interrupted" }`；
- 若该会话当前无活跃任务（幂等无操作）：`{ "session_id": "s_on_123456", "status": "idle" }`。
- 行为：`TaskManager` 查找到该会话对应的 `asyncio.Task` 时调用 `task.cancel()`
并等待其收尾完成（协程内部捕获 `CancelledError` 后将已生成片段与 `"interrupted"` 状态写入 `messages` 和 `generation_tasks` 表，随后向所有监听中的客户端下发 `done`（`finish_reason="interrupted"`），最后重新 `raise CancelledError`）。

### 3.6 SSE 事件协议通用规范（单一事实来源）

每个事件由 `event: <type>\ndata: <json>\n\n` 组成，`data` 为单行 UTF-8 JSON（`ensure_ascii=False`）：


| 事件名 | `data` JSON 结构                                                                                                                   | 触发时机与规定                                     |
|-----------|--------------------------------------------------------------------------------------------------------------------------------------|-----------------------------------------------------------|
| `meta`    | `{"task_id":"t_123","session_id":"s_on_456","message_id":"m_a_8f3a","created_at":"2026-11-06T10:20:13+08:00","model":"gpt-4o-mini"}` | 流启动时发送且仅发送一次                      |
| `delta`   | `{"text":"增量文本"}`                                                                                                            | 每次产出增量文本块时发送，可发送多次    |
| `done`    | `{"finish_reason":"stop"                                                                                                             | "interrupted","duration_ms":1820}`                        | 回复正常生成完毕或被中断时发送一次，随后结束流 |
| `error`   | `{"code":"<ERROR_CODE>","message":"<中文友好提示文案>"}`                                                         | 生成中途发生异常时发送一次，随后结束流 |


#### 全局错误码与提示文案映射表（System Error Code Registry）

本表为全系统异常分类、SSE `error` 事件及后端填充 `error_message` 的**唯一事实来源**：


| 错误码 (`code`) | 触发场景                                                                                                         | 官方中文提示文案 (`message`)                                                         |
|--------------------|----------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------|
| `NO_API_KEY`       | 未配置模型 API 密钥或密钥为空                                                                            | `未检测到模型密钥，请在本地环境变量配置并重启服务后重试。`       |
| `AUTH_FAILED`      | 上游 401/403 鉴权失败或 Key 无效                                                                            | `模型密钥鉴权失败，请检查本地配置的 API Key 是否有效。`                |
| `QUOTA_EXCEEDED`   | 上游 429 频率超限或服务商额度已耗尽                                                                   | `模型服务商额度已耗尽或请求过于频繁，请稍后再试。`                   |
| `NETWORK_ERROR`    | 网络中断、DNS 失败、连接被拒或传输断开（`httpx.ConnectError` / `ReadError` 等）                  | `网络连接异常，无法访问模型服务商，请检查网络连接或代理设置。` |
| `TIMEOUT`          | 连接或读取模型服务商响应超时（`httpx.TimeoutException`）                                             | `连接模型服务商超时，请检查您的网络连接与代理设置。`                |
| `UPSTREAM_ERROR`   | 上游返回 5xx 故障，或除 401/403/429 外的其他 4xx 错误（如 400/404 模型名或端点配置有误） | `模型服务商返回异常，请检查模型与端点配置或稍后重试。`             |
| `INTERNAL_ERROR`   | 本地未预期异常或 ReAct 步数超限                                                                          | `生成过程发生异常，请重试。`                                                    |


### 3.7 SQLite 数据库模式与表结构（`data/emibot.db`）

```sql
PRAGMA journal_mode = WAL;  
PRAGMA foreign_keys = ON;  
PRAGMA busy_timeout = 5000;  
  
-- 会话表  
CREATE TABLE IF NOT EXISTS sessions (  
    id TEXT PRIMARY KEY,  
    title TEXT NOT NULL,  
    created_at TEXT NOT NULL,  
    updated_at TEXT NOT NULL  
);  
  
-- 消息表（引入 seq 自增序号保证绝对排序，error_code 记录失败原因）  
CREATE TABLE IF NOT EXISTS messages (  
    seq INTEGER PRIMARY KEY AUTOINCREMENT,  
    id TEXT NOT NULL UNIQUE,  
    session_id TEXT NOT NULL,  
    role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),  
    content TEXT NOT NULL,  
    status TEXT NOT NULL CHECK(status IN ('done', 'streaming', 'error', 'interrupted')),  
    error_code TEXT,  
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
  
CREATE INDEX IF NOT EXISTS idx_messages_session_seq ON messages(session_id, seq);  
CREATE INDEX IF NOT EXISTS idx_tasks_status ON generation_tasks(status);
```

- **连接生命周期与并发写锁规定**：- `aiosqlite` 无内置连接池且每个连接对应一个后台线程；为保证代码精简好维护并杜绝频繁创建线程与 `database is locked` 异常，应用在 FastAPI `lifespan` 周期内**复用单一长连接（Single Shared Connection）**。
- 启动初始化连接时一次性执行 `PRAGMA journal_mode = WAL;`、`PRAGMA foreign_keys = ON;` 与 `PRAGMA busy_timeout = 5000;`。
- 在 `SessionStore` 中维护一把全局异步写锁 `_write_lock = asyncio.Lock()`：所有涉及写库的操作（`INSERT`、`UPDATE`、`DELETE` 及 `commit`）统一在 `async with self._write_lock:` 内串行执行；只读查询直接并发读取，兼顾零锁冲突与极简维护性。

### 3.8 后端数据模型与协议

```python
from collections.abc import AsyncIterator, Sequence  
from typing import Literal, Protocol  
from pydantic import BaseModel, Field  


class SendMessageRequest(BaseModel):  
"""POST /api/sessions/{session_id}/messages 在线发送用户消息请求体校验模型。"""  
content: str = Field(min_length=1, max_length=4000)  


class ChatMessage(BaseModel):  
"""系统内部流转、离线请求与历史持久化的领域实体模型（允许 user 与 assistant 角色）。"""  
id: str | None = None  
role: Literal["user", "assistant"]  
content: str = Field(default="")  
seq: int | None = None  
status: Literal["done", "streaming", "error", "interrupted"] = "done"  
error_code: str | None = None  
error_message: str | None = None  
created_at: str | None = None  


class ToolCall(BaseModel):  
"""结构化工具调用模型。"""  
id: str  
name: str  
arguments: dict  


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

- **离线 `ChatRequest` 兼容约定**：`Assistant/api/schemas.py` 中的 `ChatRequest`（供离线 `POST /api/chat` 使用）继续接收 `messages: list[ChatMessage]`（允许 `"user"` 与 `"assistant"` 角色交错，并在 validator 中校验每条非空、`<= 4000` 字符且最后一条为 `"user"`），确保离线多轮对话完全兼容。
- **外部核心依赖**：第二版在 `requirements.txt` 中引入 `httpx>=0.28,<1.0`（提供异步流式 HTTP 客户端）与 `aiosqlite>=0.21,<1.0`（提供异步 SQLite 驱动）。

### 3.9 前端数据模型与编码约定

- 前端双形态状态管理（`store.js`）：

```js
{  
  mode: 'offline',                 // 当前工作台形态：'offline' | 'online'  
  activeSessionId: null,           // 当前活动会话 ID；为 null 时表示处于未创建的空白草稿态  
  draftText: '',                   // 空白草稿态中已输入未发送的文字  
  offlineSessions: [],             // 离线会话列表（纯内存，ID 前缀 s_off_）  
  onlineSessions: [],              // 在线会话列表（同步自 SQLite，ID 前缀 s_on_）  
  sessionDrafts: {},               // 各会话未发送草稿字典：{ [sessionId]: text }（依靠 s_off_ 与 s_on_ 前缀天然隔离）  
  streamingBySession: {},          // 当前活跃 SSE 订阅流映射：{ [sessionId]: { abortController, taskId } }  
  queue: []                        // 离线形态发送队列  
}
```

- **流状态与切走/切回规则**：- 当前活动会话是否有正在连接的实时流，通过 `Boolean(store.streamingBySession[store.activeSessionId])` 判断；
- **切走清理**：当用户从在线会话 X 切换到其他会话或切离对话页时，前端调用 `store.streamingBySession[X].abortController.abort()` 断开该会话的 SSE 订阅流，并**立即执行 `delete store.streamingBySession[X]`**（注意：绝不调用 `/api/chat/abort`，后台生成任务继续运行）；
- **切回恢复**：当用户切回在线会话 X 时，前端拉取 `GET /api/sessions/X/messages`；若最新一条助手消息 `status === 'streaming'`，前端新建 `AbortController` 登记至 `store.streamingBySession[X]`，清空该气泡当前文字，并连入 `GET /api/chat/stream?session_id=X` 追赶并续接实时流；当收到 `done` 或 `error` 事件时，执行 `delete store.streamingBySession[X]`。
- 前端消息对象（`store.js`）：

```js
{  
seq: 1,                          // 数据库自增序号（在线消息具备）  
id: 'm_u_...',                   // 离线为客户端生成 m_off_...，在线为服务端生成 m_u_... / m_a_...  
role: 'user' | 'assistant',  
content: '',  
createdAt: Date,  
status: 'done' | 'streaming' | 'error' | 'interrupted',  
errorCode: null | string,        // 关联的系统错误码  
errorMessage: null | string      // 后端根据 3.6 映射表返回的标准中文错误提示  
}
```

- 核心数据处理与安全规定：
- 会话标题生成规则：统一使用 `Array.from(rawContent.trim().replace(/\s+/g, ' ')).slice(0, 10).join('')`；先将换行符、制表符及连续空格折叠为单空格，再按 Unicode 码点切片，防止 emoji 等 UTF-16 代理对截断出现乱码。
- XSS 防御规定：所有用户输入的标题与文本在注入 DOM 时，严禁使用 `innerHTML`，必须使用 `element.textContent` 或 `document.createTextNode` 渲染。
- 草稿状态写入时机：统一在输入框 `input` 事件触发时实时写入当前活动目标（草稿态存入 `store.draftText`，已有会话存入对应 `sessionDrafts[id]`），会话切换与路由切离时直接复用，不维护分散的时机。
-
命名与格式规定：

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

- 状态：已完成
- 需求描述：顶部栏右上角常驻显示当前工作台形态（离线 / 在线），支持鼠标点击切换；每次启动或刷新页面默认进入离线形态。
-
详细方案设计：
1. 在 `Assistant/web/index.html` 的 `.app-header` 中，将原有的静态标签替换为交互式切换组件 `<button class="mode-toggle" id="mode-toggle" type="button" aria-label="切换工作台形态"><span class="mode-toggle__pill"><span class="mode-toggle__dot"></span><span class="mode-toggle__label" id="mode-label">离线模式</span></span></button>`。
2. 在 `Assistant/web/css/components.css` 定义组件样式：3. 离线态：指示点为 `--color-text-muted`（深灰/银白微光），文字显示"离线模式"；
4. 在线态：指示点为绿光渐变（`#10b981`），附带微妙呼吸效果，文字显示"在线模式"；
5. 支持悬停与键盘访问高亮。
6. 在 `Assistant/web/js/store.js` 中维护全局状态 `state.mode = 'offline'`；页面初次加载时始终强制初始化为 `'offline'`，符合零网络默认约定。

**B1_1_2 本机模型密钥预检与阻断提示**

- 状态：已完成
- 需求描述：用户点击切换至在线形态前，自动检查本机是否配置模型密钥；若未配置，给出明确中文提示并留在离线形态，阻止切换。
-
详细方案设计：
1. 在 `Assistant/api/config_status.py` 提供轻量探测接口 `GET /api/config/status`，后端读取 `Assistant.config.API_KEY`；当且仅当去除首尾空白字符后长度大于 0 时，返回 `{"has_api_key": true, ...}`（完整 5 字段见 3.3 节），否则返回 `{"has_api_key": false, ...}`。
2. 前端在 `mode-toggle` 点击事件回调中：3. 若当前为离线形态、准备切入在线形态，首先发起 `await api.checkConfigStatus()`；
4. 若 `has_api_key === false`：在对话区顶部弹出弱侵入提示横幅，文案严格匹配 3.6 节 `NO_API_KEY` 映射："未检测到模型密钥，请在本地环境变量配置并重启服务后重试。"，中断切换流程，保持 `state.mode = 'offline'`；
5. 若 `has_api_key === true`：允许切换，进入形态流转逻辑。

**B1_1_3 模式切换数据流转与进行中生成安全中断**

- 状态：已完成
- 需求描述：切换形态后立即渲染目标形态的会话与消息，并统一落在空白草稿态；切回离线时保留本次运行周期的离线内存会话；若在回复生成过程中切换形态，立即安全中断当前生成，在线已生成部分保存并标为已中断，离线直接丢弃。
-
详细方案设计：
1. 数据流切换：2. 在 `store.js` 中分离两组会话状态：`state.offlineSessions` 与 `state.onlineSessions`；
3. 切至在线：从后端 `GET /api/sessions` 拉取持久化列表注入 `state.onlineSessions`，激活会话重置为 `null`（空白草稿态），输入框自动保留当前草稿文字；
4. 切回离线：视图重新绑定 `state.offlineSessions`，同样激活会话置为 `null`；
5. 生成中切换的安全中断（Abort & Persist）：6. 检查当前会话是否处于流式生成中（`store.streamingBySession[store.activeSessionId]` 存在）：7. 前端调用该会话专属的 `abortController.abort()`，停止向当前界面追加文字；
8. 若处于离线形态：直接丢弃该消息，从消息列表移除占位卡片；
9. 若处于在线形态：向服务端发送 `POST /api/chat/abort`（携带 `session_id`），服务端后台任务捕获 `CancelledError`，将当前已生成的文本内容落库至 `messages` 表并将状态置为 `"interrupted"`（同时更新 `generation_tasks` 状态为 `"interrupted"`），最后重新抛出 `CancelledError`；
10. 从 `store.streamingBySession` 中清除当前会话状态，确保切换后目标形态的输入区立即可用。

---

##### B1.2 真实模型回复

**B1_2_1 本机环境变量模型配置读取与脱敏保护**

- 状态：已完成
- 需求描述：在线形态回复由真实大模型生成，模型密钥仅通过本机环境变量读取，页面任何位置均无输入框、不展示密钥内容，离线形态不访问网络。
-
详细方案设计：
1. 在 `Assistant/config.py` 中集中读取环境变量并向系统导出（常量名统一不带 `ASSISTANT_` 前缀）：2. `API_KEY = os.environ.get("ASSISTANT_API_KEY", "").strip()`；
3. `BASE_URL = (os.environ.get("ASSISTANT_BASE_URL", "").strip().rstrip("/")) or "https://api.openai.com/v1"`（强制 `rstrip("/")` 防止拼接双斜杠）；
4. `MODEL = os.environ.get("ASSISTANT_MODEL", "").strip() or "gpt-4o-mini"`；
5. `REQUEST_TIMEOUT = _read_int_env("ASSISTANT_REQUEST_TIMEOUT", 60, min_value=5)`；
6. `DB_PATH = Path(os.environ.get("ASSISTANT_DB_PATH", "").strip() or (Path(__file__).resolve().parent.parent / "data" / "emibot.db")).resolve()`；
7. `HOST` 校验：若读取的 `ASSISTANT_HOST` 不在环回白名单 `("127.0.0.1", "localhost", "::1")` 内（例如被误设为 `0.0.0.0`），打印 warning 日志并强制回退至 `"127.0.0.1"`。
8. 安全防御：9. 全站所有前端 HTML 模板、JavaScript 文件与静态样式中，绝对不包含任何 API Key 的输入框或配置展示；
10. 服务端日志格式化脱敏：在网络请求模块中添加过滤器，屏蔽所有 `Authorization: Bearer ***` 请求头，禁止将密钥打印到终端控制台或日志文件；
11. 服务端仅绑定本机环回地址，严禁配置 `allow_origins=["*"]` 通配跨域；同时在 `app.py` 中间件对 `/api/*` 的写请求（`POST` / `PATCH` / `DELETE`）校验 `Origin`（若存在）与 `Host` 请求头，仅放行 `127.0.0.1`、`localhost` 与 `[::1]`，非法来源直接返回 `403 Forbidden`，防止恶意网页跨站消耗本机模型额度；
12. 离线形态完全不触发任何网络请求，保持断网可用。

**B1_2_2 OpenAI 兼容协议异步大模型客户端封装（LLMClient）**

- 状态：已完成
- 需求描述：在后端实现标准 OpenAI 兼容的异步流式 HTTP 客户端，向配置的服务商端点发起流式对话请求并解析分块数据。
-
详细方案设计：
1. 新增 `Assistant/agent/llm_client.py`，实现 `LLMClient` 类；`Assistant/agent/online_agent.py` 作为外观实现 `Agent` 协议；
2. 采用基于 `httpx.AsyncClient` 的标准异步网络通信：3. 请求地址为 `{BASE_URL}/chat/completions`，下发 JSON 数据体：`{ "model": MODEL, "messages": payload_messages, "stream": True }`；
4. 请求头携带 `Authorization: f"Bearer {API_KEY}"` 与 `Content-Type: application/json`；
5. 超时时间绑定 `config.REQUEST_TIMEOUT`；
6. 流式解析器与异常映射：7. 使用 `client.stream("POST", ...)` 结合 `response.aiter_lines()` 逐行读取上游返回的 `data: {...}`；
8. 反序列化提取 `choices[0].delta.content`；
9. 当收到 `data: [DONE]` 时优雅结束异步生成器；
10. 完整捕获异常并转换为 3.6 节标准错误码：`401/403` -> `AUTH_FAILED`，`429` -> `QUOTA_EXCEEDED`，其他 `4xx`（如 `400/404`）及 `5xx` -> `UPSTREAM_ERROR`，`httpx.TimeoutException` -> `TIMEOUT`，`httpx.RequestError`（含 `ConnectError`、`ReadError` 等网络中断）-> `NETWORK_ERROR`；
11. 演进备注：本阶段无工具注册，`LLMClient` 直接 `yield str` 增量文本；后续阶段接入具体工具时，该生成器返回类型将演进为结构化流事件（`TextDelta | ToolCallChunk`）。

---

##### B1.3 多轮上下文

**B1_3_1 单会话上下文滑动窗口构建与消息过滤**

- 状态：已完成
- 需求描述：同一会话内，模型调用时可参考该会话此前的全部历史消息；过滤失败消息并适配滑动窗口长度。
-
详细方案设计：
1. 在 `Assistant/agent/online_agent.py` 中实现 `build_context_messages(session_id: str) -> list[ChatMessage]`：2. 从数据库 `messages` 表查询属于当前 `session_id` 的所有消息，SQL 严格绑定：`SELECT seq, id, role, content, status, error_code, created_at FROM messages WHERE session_id = ? ORDER BY seq ASC`，依靠自增 `seq` 保证绝对时序；
3. 状态过滤与内容预处理：4. 跳过初始占位等空内容消息（`content.strip() == ""`）；
5. 若存在 `status == 'interrupted'` 的消息，保留其已生成的 `content`，并在尾部追加标记说明 `[此条回复此前未完整生成]`；
6. 完全忽略 `status == 'error'` 的异常卡片；
7. 严格保证交叉序列算法：8. 过滤异常卡片后，若出现连续两条 `role == 'user'` 的消息（前一条用户消息因异常未获得有效回复），丢弃前一条无应答的 user 消息，确保维持 `user -> assistant -> user` 交叉序列；
9. 窗口截取：
10. 取末尾不超过 `MAX_MESSAGES`（30 条）消息作为上下文（注：本阶段仅按消息条数截断，暂不做字符或 Token 预算截断，留待后续阶段演进）；
11. 截取后若第一条消息角色为 `assistant`，则丢弃该条，确保上下文第一条有效消息必须为用户消息，最后一条为当前新增的用户消息。

**B1_3_2 跨会话上下文绝对隔离机制**

- 状态：已完成
- 需求描述：不同会话之间的上下文相互绝对独立，严格杜绝会话间串话。
-
详细方案设计：
1. 所有会话消息在数据库层面以 `session_id` 作为外键唯一归属；
2. 上下文构建查询严格绑定 SQL 条件：`WHERE session_id = ? ORDER BY seq ASC`；
3. 请求模型时仅传递该 SQL 查询产出的消息列表，严禁在后端全局内存中跨会话共享上下文缓存。

---

##### B1.4 ReAct 结构

**B1_4_1 ReAct 循环执行引擎设计**

- 状态：已完成
- 需求描述：回复生成组织为"推理—行动—观察"的循环结构，代码中可明确指认循环入口与动作分发点。
-
详细方案设计：
1. 新增 `Assistant/agent/react.py`，实现 `ReActLoop` 引擎类；
2. 引擎结构规定：3. 唯一循环入口：`async def run(self, messages: list[ChatMessage]) -> AsyncIterator[str]`；
4. 内部维护 `step = 0; max_steps = 5;` 的循环计数；
5. 动作分发点：`async def dispatch_action(self, tool_call: ToolCall) -> str`；
6. 异常边界防护：7. 若模型循环步数达到 `max_steps` 仍未产出最终答案，抛出内部领域异常（映射为 3.6 节的 `INTERNAL_ERROR` 错误事件），安全终止生成并关闭流。

**B1_4_2 无工具阶段 ReAct 纯回答闭环与流式防泄露**

- 状态：已完成
- 需求描述：第二阶段暂无任何可调用工具与技能，每次对话仅产生一次最终回答，对话过程中不产生工具调用记录，且严禁泄露内部推理过程。
-
详细方案设计：
1. 系统提示词自适应（流式防泄露）：2. 当 `ToolRegistry.is_empty()` 为 `true` 时，系统提示词采用标准对话设定，**严禁要求模型输出 `Thought:` / `Final Answer:` 格式标记**，模型流式增量文本直接作为最终回答向订阅者推送，完全杜绝 Thought 思考文字提前上屏违反“不展示推理过程”规格；
3. 动作分发旁路保护：4. 保留循环入口 `ReActLoop.run` 与动作分发点 `dispatch_action` 入口，当 `ToolRegistry.is_empty()` 时，循环只执行单次大模型流式推理；
5. 后续接入具体工具时，基于 OpenAI 原生 `tools` 与 `tool_calls` 结构化参数交互，不依赖脆弱的文本正则解析；
6. 数据库与前端消息卡片中仅存储最终回答文本，不落盘任何 Action 调用记录，满足验收无工具调用记录的规格。

---

##### B1.5 工具与技能预留

**B1_5_1 工具与技能抽象协议与注册中心预留**

- 状态：已完成
- 需求描述：为后续工具与技能保留统一的注册与调用入口，新增工具只需注册即可进入对话链路，不改动对话主体。
-
详细方案设计：
1. 在 `Assistant/agent/tools/base.py` 中定义抽象协议与模型：		class ToolCall(BaseModel):  
id: str  
name: str  
arguments: dict  

class BaseTool(Protocol):  
name: str  
description: str  
parameters: dict  # JSON Schema  
async def execute(self, **kwargs) -> str: ...
2. 在 `Assistant/agent/tools/registry.py` 中实现单例 `ToolRegistry`：3. 维护内部字典 `_tools: dict[str, BaseTool] = {}`；
4. 提供 `register(tool: BaseTool)`、`get(name: str) -> BaseTool | None`、`list_tools() -> list[dict]` 与 `is_empty() -> bool`；
5. 第二版初始状态保持注册中心完全为空，不注册任何工具实例。

**B1_5_2 界面零侵入与工具预留接口解耦**

- 状态：已完成
- 需求描述：本阶段前端界面上不出现任何工具或技能相关入口、开关与提示，对话主体与注册表状态松耦合。
-
详细方案设计：
1. 前端 HTML / CSS / JS 完全不引入与工具、插件、插件市场或技能配置相关的 DOM 元素、图标或状态显示；
2. `ReActLoop` 仅依赖 `ToolRegistry` 提供的公共方法查询工具，当列表为空时平滑旁路动作分发，保证后续接入工具时对话主干代码无需重构。

---

##### B1.6 错误提示

**B1_6_1 模型调用异常分类诊断与中文友好错误映射**

- 状态：已完成
- 需求描述：在线形态下模型调用失败（未配置密钥、鉴权失败、网络中断、请求超时、服务端错误）时，在对话区给出可读的中文提示。
-
详细方案设计：
1. 服务端统一异常分类与错误码映射表：严格遵循 **3.6 全局错误码与提示文案映射表** 作为唯一事实来源；
2. SSE 错误事件：当异常发生时，下发 `event: error\ndata: {"code": "<ERROR_CODE>", "message": "<官方中文文案>"}\n\n`。

**B1_6_2 对话区异常上屏与历史消息安全保留**

- 状态：已完成
- 需求描述：发生异常时不白屏、不静默失败、不自动改用 mock，且已经显示的消息与历史记录完好保留。
-
详细方案设计：
1. 服务端持久化错误码与统一文案返回：发生异常时，服务端将错误码记录在 `messages.error_code` 列，消息状态标记为 `status = 'error'`；在 `GET /api/sessions/{session_id}/messages` 查询返回时，服务端统一根据 `error_code` 查 3.6 节映射表填充 `error_message` 字段；
2. 前端接收到实时 SSE `error` 事件时：3. 若当前已有部分文字流式上屏：保留已有文本，在其后方换行追加 `.msg__error-tip`（弱警告色背景卡片），渲染事件携带的 `message` 官方中文提示文案；
4. 若尚未有任何文字上屏（在等待阶段报错）：将 Agent 消息气泡内容替换为错误提示文案，并赋予 `.msg--agent.is-error` 样式；
5. 刷新页面恢复回显：前端拉取历史消息时，对 `status === 'error'` 的消息，直接读取服务端返回的 `error_message` 字段渲染中文错误提示卡片（前端无需重复维护错误码映射表），确保刷新后错误提示不丢失；
6. 严格禁止自动降级回退到 mock 回复，确保错误态真实可感知。

---

##### B1.7 本地持久化（在线形态）

**B1_7_1 SQLite 数据库初始化与数据模式定义**

- 状态：已完成
- 需求描述：在线形态的会话与消息保存在本机 SQLite 数据库，刷新页面、重启服务后仍可读取，关闭浏览器不丢失。
-
详细方案设计：
1. 新增 `Assistant/storage/db.py`，采用\*\*应用级单一共享长连接（Single Shared `aiosqlite.Connection`）\*\*方案：2. 在服务启动时自动检查并在项目根目录下建立 `data/` 目录；
3. 启动打开连接后一次性执行：`PRAGMA journal_mode = WAL;`（开启读写并发）、`PRAGMA foreign_keys = ON;`（开启外键级联清理）、`PRAGMA busy_timeout = 5000;`（防写锁繁忙报错）；
4. 自动执行建表迁移：创建包含自增序号 `seq` 与 `error_code` 的 `messages` 表、`sessions` 表与 `generation_tasks` 表（严格对齐 3.7 规范）；
5. 连接生命周期：利用 FastAPI `lifespan` 上下文管理器在应用启动时初始化单一长连接并执行未完任务恢复扫描；在应用关闭（shutdown）时，先等待 `TaskManager` 完成所有运行中任务的取消与落盘，最后安全关闭数据库连接。

**B1_7_2 在线会话与消息持久化 CRUD 仓储层实现与节流写盘**

- 状态：已完成
- 需求描述：实现会话增删改查、消息追加与状态维护的异步仓储层，保证数据持久化一致性与高并发 I/O 稳定。
-
详细方案设计：
1. 新增 `Assistant/storage/session_store.py`，实现 `SessionStore`（内部持有 `_write_lock = asyncio.Lock()` 串行化所有写事务）：2. `create_session(session_id, title) -> dict`：插入 `sessions` 表并返回会话字典；
3. `get_sessions() -> list[dict]`：查询所有在线会话，按 `updated_at DESC` 排序；
4. `get_session(session_id) -> dict | None`：查询单个会话是否存在；
5. `rename_session(session_id, new_title) -> dict | None`：更新会话标题与 `updated_at` 并返回更新后对象；
6. `delete_session(session_id) -> bool`：删除会话记录（依靠外键级联清理 `messages` 与 `generation_tasks`）；
7. `get_messages(session_id) -> list[dict]`：按 `seq ASC` 升序返回指定会话的所有消息，并根据 `error_code` 自动映射填充 `error_message`；
8. `create_turn_and_task(session_id, user_msg_id, user_content, assistant_msg_id, task_id) -> dict`：在单次写事务中原子插入用户消息（`status='done'`）、助手初始占位消息（`status='streaming'`）、`generation_tasks` 记录（`status='running'`），并刷新会话 `updated_at`；
9. `update_message_stream(message_id, content)`：流式生成期间节流更新助手消息已生成文本；
10. `finalize_generation(task_id, message_id, content, message_status, task_status, error_code=None)`：生成结束/中断/失败时在单次写事务中原子更新 `messages`（最终文本、`status`、`error_code`）、`generation_tasks`（`status`、`updated_at`）及会话 `updated_at`；
11. `recover_interrupted_tasks() -> int`：服务启动时扫描并将所有残留的 `status='streaming'` 消息与 `status='running'` 任务统一更新为 `'interrupted'`；
12. 流式节流写盘保护：流式生成期间每 300ms 或累计若干 chunk 通过 `update_message_stream` 异步刷盘一次；在生成完成（`done`）、中断（`interrupted`）或失败（`error`）时，必须先 `await finalize_generation(...)` 完成最终落盘，随后再向订阅者广播终态事件。

**B1_7_3 差异化存储隔离**

- 状态：已完成
- 需求描述：在线形态持久化至磁盘，离线形态仅在内存保留；未发送的草稿输入文字不持久化，仍按既有规则在页面内维护。
-
详细方案设计：
1. 存储路由分流：离线形态下发送的消息绝不写入 SQLite 数据库，刷新页面后按 A6.1 全部清空；在线形态下的增删改查全量走持久化 API；
2. 草稿文字处理：未发送的草稿文本（无论是在线草稿还是离线草稿）均只保留在前端 `store.js` 内存中，完全不落库，页面刷新后输入框重置为空白草稿，严格符合 B1.7 规定。

---

##### B1.8 生成与页面解耦

**B1_8_1 后端异步生成任务管理器与多会话并发架构**

- 状态：已完成
- 需求描述：在线形态下发出的消息在后台持续生成直至完成；不同会话支持同时生成，互不阻塞。
-
详细方案设计：
1. 新增 `Assistant/agent/task_manager.py`，定义 `TaskManager` 全局单例；
2. 任务结构：		class GenerationTask:  
task_id: str  
session_id: str  
message_id: str  
asyncio_task: asyncio.Task  
chunk_buffer: list[str]       # 已产生的增量文本缓存  
subscribers: set[asyncio.Queue] # 正在监听该任务的客户端连接  
status: Literal["running", "completed", "interrupted", "failed"]
3. 并发度与防竞态设计：4. 单一会话严格串行与同步占位：在 `POST /api/sessions/{id}/messages` 进入异步写库前，先在同一个同步执行段内检查并占用该 `session_id` 的运行槽位；若该会话已有任务处于 `running` 或占位状态，立即返回 `409 Conflict`；
5. 跨会话并发独立：每个会话在生成时独立启动 `asyncio.create_task(...)`，会话 A 与会话 B 各自拥有独立的协程与状态，实现真正的多会话并发生成、互不等待；
6. 终态与取消收尾契约：7. 任务正常完成、抛错或收到 `asyncio.CancelledError` 时，严格按 **① 调用 `session_store.finalize_generation` 强制刷盘并更新状态 → ② 向所有 `subscribers` 队列推入 `done` 或 `error` 终态事件 → ③ 从活跃任务字典移除该会话任务** 的顺序执行；
8. 捕获 `asyncio.CancelledError` 完成上述收尾落盘后，**必须重新 `raise`**，符合 Python `asyncio` 协程取消规范；
9. 提供 `cancel_and_wait(session_id)` 供 `POST /api/chat/abort` 与 `DELETE /api/sessions/{id}` 调用，确保任务彻底结束落盘后再返回或执行会话删除。

**B1_8_2 会话级解耦 SSE 订阅与前端切页/切会话无缝重连**

- 状态：已完成
- 需求描述：用户在生成期间切换会话、切到其他导航页或刷新页面，后台继续生成；返回时若已完成则展示完整内容，若仍在生成中则显示"正在生成"并自动更新补齐。
-
详细方案设计：
1. 客户端切走逻辑：2. 用户在流式期间切换到其他会话或切换至其他路由：前端调用 `store.streamingBySession[sessionId].abortController.abort()` 关闭该会话专属的 fetch SSE 订阅连接，并执行 `delete store.streamingBySession[sessionId]`；服务端的后台生成任务检测到订阅者离开，仅从 `subscribers` 移除该客户端队列，**生成协程绝不 cancel，继续全速运行并节流写入数据库**；
3. 客户端切回/刷新恢复逻辑：4. 用户返回该会话或刷新后重新进入该会话：5. 前端调用 `GET /api/sessions/{session_id}/messages` 拉取消息列表；
6. 若最新一条 Agent 消息状态为 `"done"` 或 `"interrupted"` 或 `"error"`，直接渲染完整内容（`error` 状态直接渲染消息中的 `error_message`）；
7. 若最新一条 Agent 消息状态仍为 `"streaming"`：前端新建 `AbortController` 登记至 `store.streamingBySession[sessionId]`，将该气泡文本先清空置为等待态，并立即发起 `GET /api/chat/stream?session_id={session_id}`；
8. 服务端无任务竞态兜底：若连接到达时任务恰好已执行完毕，服务端立即推送 `done`（或 `error`）事件并关闭连接，前端收到后清理 `streamingBySession[sessionId]` 并重新拉取渲染最终消息；
9. 服务端追赶与广播：若任务正在执行，服务端在同步段内绑定订阅队列并先将 `chunk_buffer` 中积累的文本一次性推送给客户端完成追赶，随后继续实时广播后续增量，直至下发 `done` 事件完成。

**B1_8_3 停服与异常崩溃中断标记与恢复处理**

- 状态：已完成
- 需求描述：服务被关闭或崩溃导致回复未完成时，已生成部分保留并标记"已中断"，不自动重试，用户可手动再次发送。
-
详细方案设计：
1. 优雅停服（Graceful Shutdown）与启动补偿扫描（Recovery on Startup）：2. 在 `Assistant/app.py` 的 `lifespan` 关闭阶段（shutdown）：调用 `await task_manager.shutdown()` 取消所有运行中的生成任务，等待各任务将已生成部分刷入数据库并标记为 `'interrupted'`、向所有活跃 SSE 订阅者下发终止事件关闭连接后，再关闭 SQLite 连接，确保服务快速干净退出；
3. 在 `Assistant/app.py` 的 `lifespan` 启动阶段（startup）：针对断电或进程被强杀等未走优雅停服的场景，调用 `await session_store.recover_interrupted_tasks()`；
4. 执行 SQL 补偿：`UPDATE messages SET status = 'interrupted' WHERE status = 'streaming'` 以及 `UPDATE generation_tasks SET status = 'interrupted', updated_at = ? WHERE status = 'running'`；
5. 前端展示与用户重发：6. 对状态为 `"interrupted"` 的消息，气泡底部或末尾展示徽标 `<span class="badge badge--interrupted">已中断</span>`；
7. 气泡文本保持显示此前已经成功落盘的部分内容；
8. 系统不执行任何静默自动重试，输入框保持就绪状态，用户可选择手动再次发送新消息。

---

##### B1.9 会话列表沿用

**B1_9_1 会话列表生命周期操作在持久化层的适配沿用**

- 状态：已完成
- 需求描述：会话的新建、切换、重命名、删除、自动标题生成等生命周期逻辑，在双形态下完全沿用 A6.2 到 A6.11 规范。
-
详细方案设计：
1. 新建对话：在线形态同样采用"延迟创建草稿态"（A6.4）；点击"新建对话"仅进入空白草稿态，只有在用户成功发出首条消息后，才调用 `POST /api/sessions` 正式落库并进入列表；
2. 自动标题：首条消息发出时，依然严格采用 A6.5 算法（空白折叠与 Unicode 10 字符感知切片截取），落库并展示在列表；
3. 行内重命名：保留悬停笔图标、行内 input 编辑、防失焦重复提交与输入法组合保护（A6.6），保存时调用 `PATCH /api/sessions/{id}` 同步更新本地数据库；
4. 删除会话：保留悬停垃圾桶图标（A6.7），点击后调用 `DELETE /api/sessions/{id}` 同步清除本地持久化，当前会话被删后同样安全回退至空白草稿态。

**B1_9_2 全会话未发送草稿在双形态下的统一页面内存管理**

- 状态：已完成
- 需求描述：全会话未发送输入文字保留（A6.10）与空白草稿再次新建显式丢弃（A6.11），在在线形态下与离线形态保持完全一致的交互体验。
-
详细方案设计：
1. 前端 `store.js` 统一维护内存中的草稿字典 `sessionDrafts: { [sessionId: string]: string }` 以及空白草稿槽位 `draftText: string`；
2. 用户在不同在线会话间切换、或切到其他路由导航再返回时，直接从前端内存读取对应会话的草稿文字恢复到文本框，调用 `adjustInputHeight()` 与 `syncSendButtonState()`；
3. 再次在空白草稿态点击"新建对话"时，彻底清空丢弃 `draftText`（A6.11）；
4. 既有会话已发出的消息不受影响，草稿仅在运行时内存留存，不发起数据库读写，确保零磁盘 I/O 延迟与高响应度。

 
