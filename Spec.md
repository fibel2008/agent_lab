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
│   │   ├── attachments.py       [第二版新增] 附件预览加载（GET）与 Windows 默认应用调起（POST open）接口  
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
│   │   ├── tools/               [第二版新增] 工具与技能抽象层  
│   │   │   ├── __init__.py  
│   │   │   ├── base.py          BaseTool 协议与 ToolCall 模型  
│   │   │   ├── registry.py      统一工具注册中心（注册 read_attachment）  
│   │   │   ├── attachment_tool.py [第二版新增] read_attachment 工具实现（调用解析器读取附件文本）  
│   │   │   └── parsers/         [第二版新增] 多格式文本提取解析器（docx, xlsx, pptx, pdf, code/text）  
│   │   │       ├── __init__.py  
│   │   │       ├── doc_parser.py  
│   │   │       ├── pdf_parser.py  
│   │   │       └── text_parser.py  
│   │   ├── task_manager.py      [第二版新增] 后台解耦生成任务管理器（支持多会话并发与广播）  
│   │   └── factory.py           唯一替换点：选哪个 Agent  
│   └── web/  
│       ├── index.html           应用外壳 + 内联 SVG 图标库（顶栏新增交互式形态切换器、通用深色模态提示与确认弹窗）  
│       ├── css/  
│       │   ├── tokens.css       设计令牌（颜色、圆角、间距、字号、布局、形态与中断状态）  
│       │   ├── base.css         reset、排版、滚动条、可访问性基础  
│       │   ├── layout.css       顶栏、主侧栏（含缩略态）、内容区、响应式断点  
│       │   ├── components.css   导航项、徽标、状态圆点、按钮、形态开关胶囊、模态提示与确认弹窗、占位页  
│       │   └── chat.css         对话页双列布局、会话列表侧栏、空状态、待发送附件栏、气泡附件卡片、图片缩略图、工具执行胶囊、Markdown 排版、底部复制栏、输入区  
│       └── js/  
│           ├── main.js          启动入口：构建导航、初始化路由、装配视图  
│           ├── routes.js        路由与导航的唯一配置源  
│           ├── icons.js         SVG symbol 的 id 常量（新增回形针、文件类型与工具动效图标）  
│           ├── router.js        hash 路由解析、主侧栏折叠切换与视图显隐  
│           ├── store.js         双形态状态管理：离线纯内存数据源与在线持久化数据源、待发送附件池、会话级流状态映射  
│           ├── api.js           RESTful API 客户端（包含附件打开与预览）与会话级 SSE 订阅客户端  
│           ├── dom.js           DOM 工具与时间戳格式化函数  
│           ├── markdown.js      [第二版新增] 零依赖安全 DOM 级 Markdown 解析与纯文本提取工具  
│           └── views/  
│               ├── chat.js      对话工作区与会话列表视图控制器（形态切换、附件添加/校验/移除/打开、模型视觉拦截、ReAct 工具过程展示、解耦流式订阅、Markdown 渲染、删除确认与一键复制）  
│               └── placeholder.js 占位页视图  
├── data/                        [第二版新增] 本地持久化数据目录（受 .gitignore 忽略）  
│   ├── emibot.db                本地 SQLite 数据库文件  
│   └── attachments/             [第二版新增] 附件持久化存储目录（按 session_id 分布）  
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
│   ├── 待发送附件池与多源输入（store.js：按钮选择、拖拽进输入区、Ctrl+V 粘贴/截图）  
│   ├── 离线数据流：内存 store.js ── POST /api/chat（直连 MockAgent 同步 SSE 直出，文字反馈附件接收）  
│   └── 在线数据流：  
│       ├── 会话管理：RESTful API（GET/POST/PATCH/DELETE /api/sessions）── SQLite 持久化与附件目录级联清理  
│       ├── 附件操作：POST /api/attachments/{id}/open（Windows 默认应用调起）、GET /api/attachments/{id}/preview  
│       ├── 触发生成：POST /api/sessions/{session_id}/messages ── 发送时模型视觉探测与拦截、202 异步任务  
│       ├── 解耦订阅：GET /api/chat/stream?session_id={id} ── 接收 SSE delta 增量与 tool_start/tool_done 过程  
│       └── 任务中断：POST /api/chat/abort ── 中断指定会话正在进行的任务  
FastAPI 服务端（Assistant/app.py）  
├── 静态托管与配置检查：/api/config/status（安全探测密钥配置状态）  
├── 异步持久化仓储层（storage/，基于 aiosqlite）：  
│   ├── SQLite（WAL 模式 + Per-Connection 外键开启）── sessions 表、messages 表、generation_tasks 表、attachments 表  
│   ├── 磁盘附件副本管理（data/attachments/{session_id}/，随会话删除彻底清理）  
│   └── 增量节流写盘（流式缓冲定时刷盘，done/interrupted 强制 flush）  
├── 后台任务管理器（agent/task_manager.py）：  
│   ├── 并发任务调度池（多会话独立 asyncio.Task，互不阻塞，单会话严格串行）  
│   ├── 增量缓冲区与广播分发队列（动态挂载/卸载前端 SSE 订阅者，支持断线重连追赶）  
│   └── 进程异常恢复补偿（启动扫描中断状态）  
└── 智能体执行层（agent/）：  
    ├── 离线形态：MockAgent（纯文本关键词流式直出，带附件数量与文件名反馈）  
    └── 在线形态：OnlineAgent ── ReActLoop ── LLMClient（OpenAI 兼容协议流式，带视觉能力探测）  
                                        └── ToolRegistry（统一工具注册中心，注册 read_attachment，依赖 parsers/ 提取文本）
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
| `markdown.js`          | 安全 DOM 级 Markdown 解析器（`renderMarkdownToElement`）与纯文本提取（`stripMarkdownToPlainText`）                                                              | `dom.js`                         |
| `views/chat.js`        | 对话页 DOM、会话列表渲染、新建/重命名/删除会话（含二次确认弹窗）、形态切换响应、解耦流式订阅与重连、在线 Agent Markdown 渲染、消息气泡底部一键复制、异常气泡渲染 | `store.js`、`api.js`、`dom.js`、`markdown.js`、`icons.js` |
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
6. **第二版特化约束与首个工具接入演进（B1.15）**：
7. **初始基线（B1.1 ~ B1.12）**：工具注册中心保持为空（`ToolRegistry.is_empty() == True`），Prompt 严禁要求模型输出 `Thought:` / `Final Answer:` 前缀标记，杜绝思考文本提前流式上屏；
8. **首个工具接入（自 B1.15 起）**：在 `ToolRegistry` 中正式注册单例 `ReadAttachmentTool`（工具名 `read_attachment`）。
9. **工具执行全链路与流式过程广播时序**：
   - 当本轮对话包含非图片附件时，系统在上下文显式提供附件元数据（`attachment_id` 与文件名），允许模型发起 `tool_calls`；
   - 当 `ReActLoop` 检测到 `tool_calls` 命中 `read_attachment`：
     ① **广播工具开始事件**：通过 `TaskManager` 向前端订阅流广播 `tool_start` 事件（携带附件名与“正在读取附件 xxx...”状态文案），前端在气泡内呈现转圈读取胶囊；
     ② **安全解析与沙箱执行**：调用 `dispatch_action`，严格基于当前 `session_id` 校验附件所属权（禁止跨会话越权访问），由 `parsers/` 提取纯文本并执行 10,000 字符安全截断（超限追加截断声明）；
     ③ **广播工具完成事件**：向前端下发 `tool_done` 事件（标记成功或返回错误信息）；
     ④ **上下文回填与终答流式输出**：将观察结果以 `role: tool` 消息回填历史上下文，再次调用大模型，生成最终回答（Final Answer）并通过既有 `delta` 事件流式推送。


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
| 第二版 | 8      | `feature/chat-ux-enhancements`  | 在线形态 Agent 回复安全 Markdown 实时渲染、删除会话自定义深色模态二次确认弹窗、双形态消息气泡底部纯文本一键复制按钮与反馈 | B1.10、B1.11、B1.12                                         | 已完成 |
| 第二版 | 9      | `feature/attachments-and-tools` | 对话多源附件添加（按钮/拖拽/粘贴）、格式与大小拦截、附件持久化与级联清理、Windows 默认应用调起、图片模型视觉校验拦截、首个工具 read_attachment 接入与 ReAct 过程展示 | B1.13、B1.14、B1.15                                         | 未开始 |


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
| `ASSISTANT_ATTACHMENT_DIR`  | `ATTACHMENT_DIR`        | `Path` / `data/attachments`               | 常量或环境变量；本地持久化附件副本存放根路径，按会话子目录隔离                                                                                                                       |
| -                           | `MAX_ATTACHMENT_COUNT`  | `3`                                       | 常量；单条消息允许添加的附件数量上限                                                                                                                                                 |
| -                           | `MAX_ATTACHMENT_SIZE`   | `5242880` (5MB)                           | 常量；单个附件允许的最大字节数（5 * 1024 * 1024）                                                                                                                                     |
| -                           | `ATTACHMENT_TEXT_TRUNCATE_LIMIT` | `10000`                          | 常量；非图片附件文本提取字符数截断上限（超出时截断并在末尾标注声明）                                                                                                                 |
| -                           | `ALLOWED_ATTACHMENT_EXTS` | 集合常量                                | 常量；允许的附件扩展名白名单（包含图片 4 种、文档 4 种、文本 2 种、代码 13 种，旧版 .doc/.xls/.ppt 明确不在白名单中）                                                                 |


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
2. 随后执行数据库删除，依靠外键 `ON DELETE CASCADE` 级联删除该会话及其关联的所有 `messages`、`generation_tasks` 与 `attachments` 记录；
3. 同步清理磁盘附件目录：在文件系统层调用 `shutil.rmtree(config.ATTACHMENT_DIR / session_id, ignore_errors=True)`，彻底物理清理该会话存储的全部本地附件副本。

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
"content": "请分析附件中的需求文档",
"status": "done",
"error_code": null,
"error_message": null,
"attachments": [
  {
    "id": "att_u_981a",
    "filename": "requirements.docx",
    "file_type": "docx",
    "file_size": 28410,
    "is_image": false
  }
],
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
- 用途：在线形态下发送用户消息及可选附件（0~3 个），触发后台独立解耦生成任务。
- 请求内容类型：`multipart/form-data`（字段：`content: str` 表单文本，`files: list[UploadFile]` 文件列表）
- 响应状态码：`202 Accepted`
- 响应体（由服务端统一生成 `task_id`、`user_message_id`、`assistant_message_id` 及附件列表）：
```json
{
  "task_id": "t_789abc",
  "session_id": "s_on_123456",
  "user_message_id": "m_u_001",
  "assistant_message_id": "m_a_002",
  "attachments": [
    {
      "id": "att_u_981a",
      "filename": "requirements.docx",
      "file_type": "docx",
      "file_size": 28410,
      "is_image": false
    }
  ],
  "status": "running"
}
```
- 行为与约束（严格防竞态与前置拦截顺序）：
1. **入参与附件规格校验**：
   - `content` 允许纯文本或搭配附件时非空，长度 `1..4000` 字符；
   - 附件数量上限校验：`len(files) <= 3`，超出返回 `422 Unprocessable Entity`（错误码 `ATTACHMENT_COUNT_EXCEEDED`）；
   - 单附件规格校验：任一文件超出 5MB 返回 422（错误码 `ATTACHMENT_TOO_LARGE`）；任一文件扩展名不在白名单（明确拒绝 `.doc`、`.xls`、`.ppt` 等旧格式）返回 422（错误码 `ATTACHMENT_TYPE_NOT_SUPPORTED`）；
2. **会话存在性检查**：校验会话是否存在，不存在返回 `404 Not Found`；
3. **图片模型视觉能力探测与拦截（B1.14）**：
   - 若附件列表中包含图片（`.png`, `.jpg`, `.jpeg`, `.webp`）：在落库前触发视觉能力探测（优先读取当前配置模型的视觉支持缓存，若无缓存则向模型 API 端点发起带图片测试探测）；
   - 若 API 返回报错（表明不支持图片输入/多模态），立即阻断发送，返回 `400 Bad Request`，体为 `{"code": "IMAGE_NOT_SUPPORTED", "message": "当前模型不支持图片输入"}`；**本次请求完全终止，不写入用户消息、不保存附件到磁盘**；
4. **同步检查与原子占位（防 409 竞态）**：在同一个同步执行段中检查 `TaskManager` 是否已存在该 `session_id` 的活跃任务或占位锁；若已存在立即返回 `409 Conflict`；若不存在立即同步登记占位；
5. **物理落盘与单事务持久化四表记录**：
   - 将附件文件写入 `data/attachments/{session_id}/{att_id}_{safe_filename}`；
   - 在 `SessionStore` 写锁保护的同一个 SQLite 事务中原子执行：① 插入用户消息（`id = m_u_...`, `status = 'done'`）；② 批量插入 `attachments` 表记录；③ 插入初始助手占位消息（`id = m_a_...`, `status = 'streaming'`, `content = ''`）；④ 插入 `generation_tasks` 记录（`task_id = t_...`, `status = 'running'`）；⑤ 刷新会话 `updated_at`；
6. 在 `TaskManager` 启动后台独立 `asyncio.Task` 开始 ReAct 循环流式生成，立即返回 `202 Accepted`。

#### 3.4.7 调起 Windows 系统默认应用打开附件（`POST /api/attachments/{attachment_id}/open`）

- 模块位置：`Assistant/api/attachments.py`
- 用途：用户在气泡中点击附件时，由后端在本地调用 Windows 系统默认关联程序打开存储目录中的附件副本。
- 响应状态码：
  - `200 OK`：`{"status": "opened"}`（成功调起操作系统默认应用）；
  - `404 Not Found`：`{"code": "ATTACHMENT_NOT_FOUND", "message": "文件已不存在"}`（数据库无记录，或本地磁盘目录中的文件副本已被手动删除）。
- 核心实现：服务端查询 `attachments` 表获取存储绝对路径，在 Windows 下使用 `os.startfile(str(storage_path.resolve()))` 调起系统默认程序。

#### 3.4.8 图片附件缩略图预览（`GET /api/attachments/{attachment_id}/preview`）

- 模块位置：`Assistant/api/attachments.py`
- 用途：供前端气泡内 `<img>` 标签加载展示图片缩略图。
- 响应：`FileResponse`，携带正确的 `image/png`、`image/jpeg`、`image/webp` 等 Content-Type 与客户端缓存头。

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
| `tool_start` | `{"tool":"read_attachment","attachment_name":"a.docx","status_text":"正在读取附件 a.docx..."}`                               | Agent 调用工具开始执行时向前端广播，触发界面显示过程状态卡片 |
| `tool_done`  | `{"tool":"read_attachment","status":"success"` 或 `"error"}`                                                                  | Agent 完成工具调用获得观察结果时广播一次                     |
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
| `ATTACHMENT_TOO_LARGE` | 单个附件大小超过 5MB 限制                                                                            | `附件大小超过限制（单个文件不得超过 5MB）。`                                     |
| `ATTACHMENT_TYPE_NOT_SUPPORTED` | 文件格式不在允许清单中或属于不受支持的旧格式（.doc/.xls/.ppt）                                        | `不支持的文件类型，仅支持常见图片、文档、文本与代码文件。`                       |
| `ATTACHMENT_COUNT_EXCEEDED` | 单条消息附件总数超过 3 个                                                                             | `单条消息最多添加 3 个附件。`                                                   |
| `ATTACHMENT_NOT_FOUND` | 本地存储目录中的附件副本已被手动删除或不存在                                                         | `文件已不存在。`                                                                 |
| `IMAGE_NOT_SUPPORTED` | 发送包含图片附件时探测到当前配置的模型不支持图片视觉输入                                             | `当前模型不支持图片输入。`                                                       |
| `ATTACHMENT_READ_FAILED` | 附件被加密、损坏、编码不受支持或属于扫描版 PDF                                                       | `附件读取失败，文件可能已损坏、被加密或属于扫描版 PDF。`                         |


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

-- 附件持久化表（B1.13 新增，随会话/消息级联删除）  
CREATE TABLE IF NOT EXISTS attachments (  
    id TEXT PRIMARY KEY,  
    session_id TEXT NOT NULL,  
    message_id TEXT NOT NULL,  
    filename TEXT NOT NULL,  
    file_type TEXT NOT NULL,  
    file_size INTEGER NOT NULL,  
    storage_path TEXT NOT NULL,  
    created_at TEXT NOT NULL,  
    FOREIGN KEY(session_id) REFERENCES sessions(id) ON DELETE CASCADE,  
    FOREIGN KEY(message_id) REFERENCES messages(id) ON DELETE CASCADE  
);  
CREATE INDEX IF NOT EXISTS idx_attachments_session ON attachments(session_id);  
CREATE INDEX IF NOT EXISTS idx_attachments_message ON attachments(message_id);
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


class AttachmentInfo(BaseModel):  
    """附件元数据传输模型。"""  
    id: str  
    filename: str  
    file_type: str  
    file_size: int  
    is_image: bool = False  

class ChatMessage(BaseModel):  
    """系统内部流转、离线请求与历史持久化的领域实体模型（允许 user 与 assistant 角色）。"""  
    id: str | None = None  
    role: Literal["user", "assistant"]  
    content: str = Field(default="")  
    seq: int | None = None  
    status: Literal["done", "streaming", "error", "interrupted"] = "done"  
    error_code: str | None = None  
    error_message: str | None = None  
    attachments: list[AttachmentInfo] = Field(default_factory=list)  
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
- **外部核心依赖**：第二版在 `requirements.txt` 中引入 `httpx>=0.28,<1.0`（提供异步流式 HTTP 客户端）、`aiosqlite>=0.21,<1.0`（提供异步 SQLite 驱动），并在 B1.15 引入非图片附件解析库：`python-docx>=1.1.0`（Word 文档提取）、`openpyxl>=3.1.2`（Excel 表格提取）、`python-pptx>=0.6.23`（PPT 演示文稿提取）、`pypdf>=4.0.0`（文字版 PDF 文本提取）。

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
  pendingAttachments: [],          // 当前输入区待发送附件池：[{ id, file, name, size, ext, isImage, previewUrl }]  
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
errorMessage: null | string,     // 后端根据 3.6 映射表返回的标准中文错误提示  
attachments: []                  // 附件列表：[{ id, filename, fileType, fileSize, isImage }]  
}
```

- 核心数据处理与安全规定：
- 会话标题生成规则：统一使用 `Array.from(rawContent.trim().replace(/\s+/g, ' ')).slice(0, 10).join('')`；先将换行符、制表符及连续空格折叠为单空格，再按 Unicode 码点切片，防止 emoji 等 UTF-16 代理对截断出现乱码。
- XSS 防御规定：所有用户输入的标题与文本在注入 DOM 时，严禁使用 `innerHTML`，必须使用 `element.textContent` 或 `document.createTextNode` 渲染；在线形态下 Agent 的 Markdown 渲染同样严禁直接拼接 `innerHTML`，统一由 `markdown.js` 将语法树安全构建为真实 DOM 节点（`el()` / `createTextNode`），任何内嵌 HTML/脚本标签均作为纯文本字面量展示，且链接仅放行 `http://` 与 `https://` 协议。
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
4. 删除会话：保留悬停垃圾桶图标（A6.7），点击后调用 `DELETE /api/sessions/{id}` 同步清除本地持久化，当前会话被删后同样安全回退至空白草稿态；
5. 响应式布局与屏幕适配（A6.3/A6.6/A6.7 适配补强）：会话侧栏直属子容器（`.chat-sessions__header`、`.chat-sessions__list`、`.chat-sessions__footer`）与列表条目（`.session-item`）宽度一律设为 `width: 100%` 并配置 `box-sizing: border-box`，自适应小屏断点（180px）与视口收窄，杜绝固定 240px 导致的右侧虚线边框、收起按钮与操作按钮截断溢出；条目处于激活态（`.session-item.is-active`）时常驻展示重命名与删除按钮，长标题在操作按钮左侧自适应 ellipsis 省略号截断，杜绝吞字并保障移动/触屏端无 hover 即可直接操作。

**B1_9_2 全会话未发送草稿在双形态下的统一页面内存管理**

- 状态：已完成
- 需求描述：全会话未发送输入文字保留（A6.10）与空白草稿再次新建显式丢弃（A6.11），在在线形态下与离线形态保持完全一致的交互体验。
-
详细方案设计：
1. 前端 `store.js` 统一维护内存中的草稿字典 `sessionDrafts: { [sessionId: string]: string }` 以及空白草稿槽位 `draftText: string`；
2. 用户在不同在线会话间切换、或切到其他路由导航再返回时，直接从前端内存读取对应会话的草稿文字恢复到文本框，调用 `adjustInputHeight()` 与 `syncSendButtonState()`；
3. 再次在空白草稿态点击"新建对话"时，彻底清空丢弃 `draftText`（A6.11）；
4. 既有会话已发出的消息不受影响，草稿仅在运行时内存留存，不发起数据库读写，确保零磁盘 I/O 延迟与高响应度。

---

##### B1.10 Markdown 渲染

**B1_10_1 零依赖安全 DOM 级 Markdown 解析与纯文本提取工具（`markdown.js`）**

- 状态：已确认
- 需求描述：提供纯原生 ES Module 实现的 Markdown 解析与安全 DOM 构建器，支持常见 Markdown 排版语法，提供纯文本提取能力，并彻底杜绝内嵌脚本执行（XSS）。
- 详细方案设计：
  1. 新增 `Assistant/web/js/markdown.js`，仅依赖 `dom.js` 的 `el()` 工具，向外部导出两个核心函数：
     - `renderMarkdownToElement(containerEl: HTMLElement, rawMarkdown: string): void`：将 Markdown 字符串解析并挂载为安全 DOM 树；
     - `stripMarkdownToPlainText(rawMarkdown: string): string`：去除 Markdown 标记符号，返回还原后的纯文本字符串（供未挂载节点或纯文本复制兜底）。
  2. 零 `innerHTML` 安全解析架构：
     - 解析器采用两阶段状态机（块级解析 + 行内 Token 解析），所有文本内容一律通过 `document.createTextNode` 或 `el(tag, { text })` 写入 DOM，**严禁调用 `innerHTML`、`outerHTML` 或 `insertAdjacentHTML`**；模型输出中若包含 `<script>`、`<img onerror=...>` 等 HTML 标签，均原样作为普通文本字符安全显示，绝不触发浏览器 HTML 解析或脚本执行；
     - 支持的块级（Block）语法：
       - 围栏代码块（```` ```lang ... ``` ````）：渲染为 `<pre class="md-code-block"><code class="md-code-block__content" data-lang="lang">...</code></pre>`；流式输出期间若代码块尚未闭合（缺少尾部 ```` ``` ````），自动按未闭合代码块实时渲染；
       - 标题（`#` ~ `######`）：渲染为 `<h1 class="md-heading">` ~ `<h6 class="md-heading">`；
       - 无序列表（`- ` 或 `* ` 开头）与有序列表（`1. ` 开头）：连续列表项聚合渲染为 `<ul class="md-list"><li>...</li></ul>` 或 `<ol class="md-list"><li>...</li></ol>`；
       - 引用块（`> ` 开头）：连续引用行聚合渲染为 `<blockquote class="md-quote">...</blockquote>`；
       - 水平分割线（`---` 或 `***`）：渲染为 `<hr class="md-hr">`；
       - 普通段落：渲染为 `<p class="md-p">...</p>`，段落内单换行转换为 `<br>`；
     - 支持的行内（Inline）语法：
       - 行内代码（`` `code` ``）：渲染为 `<code class="md-inline-code">...</code>`（内部不做粗斜体二次解析）；
       - 粗体（`**text**`）与斜体（`*text*`）：分别渲染为 `<strong>` 与 `<em>`；
       - 安全链接（`[label](url)`）：仅当 `url` 经修剪后匹配 `/^https?:\/\//i` 时渲染为 `<a class="md-link" href="..." target="_blank" rel="noopener noreferrer">label</a>`，其余协议（如 `javascript:`、`data:`）一律降级为纯文本字面量。

**B1_10_2 在线形态 Agent 回复实时与历史 Markdown 渲染及双形态分流**

- 状态：已确认
- 需求描述：仅在线形态下的 Agent 回复按 Markdown 格式实时流式渲染与历史回显；用户消息以及离线形态下的所有消息均保持纯文本展示。
- 详细方案设计：
  1. 双形态与角色渲染分流（`Assistant/web/js/views/chat.js`）：
     - 在 `createMessageNode(message)` 及流式增量更新回调中判定渲染模式：
       - **启用 Markdown 渲染条件**：当且仅当 `getMode() === 'online' && message.role === 'assistant'`（且非无正文的纯错误卡片）；此时正文容器创建为 `<div class="msg__text msg__text--markdown"></div>`，调用 `renderMarkdownToElement(textEl, message.content)` 构建排版；
       - **保持纯文本渲染条件**：当 `message.role === 'user'`（无论在线或离线）或 `getMode() === 'offline'`（包括离线 Agent 回复）时，正文容器保持为 `<p class="msg__text"></p>`，直接通过 `textEl.textContent = displayText` 赋值，保留 `white-space: pre-wrap` 纯文本换行展示；
  2. 流式增量更新与打字机光标适配（`Assistant/web/css/chat.css`）：
     - 在线流式订阅 `onDelta` 经 `requestAnimationFrame` 合并渲染时，若目标卡片为在线 Agent 消息，调用 `renderMarkdownToElement(textEl, msg.content)` 实时更新 DOM 子树；
     - 在 `chat.css` 中定义 `.msg__text--markdown` 内部排版样式：消除首尾子元素多余外边距（`> :first-child { margin-top: 0; } > :last-child { margin-bottom: 0; }`），代码块 `.md-code-block` 使用 `--color-bg` 深色底、圆角边框与等宽字体横向滚动，行内代码 `.md-inline-code` 使用 `--color-surface-hover` 胶囊底色，引用块 `.md-quote` 左侧配 `3px solid var(--color-primary)` 竖线；
     - 流式闪烁光标兼容：为 `.msg--agent.is-streaming .msg__text--markdown > :last-child::after` 挂载与纯文本一致的 `2px` 宽主色闪烁光标。

---

##### B1.11 删除会话二次确认

**B1_11_1 自定义深色模态确认弹窗与会话删除拦截流转**

- 状态：已确认
- 需求描述：在离线与在线形态下，点击会话列表中的删除入口时弹出与工作台深色风格一致的自定义确认弹窗，用户点击确认“删除”后才执行删除，点击“取消”或关闭弹窗则保留原会话。
- 详细方案设计：
  1. 模态弹窗 DOM 结构（`Assistant/web/index.html`）：
     - 在 `<body>` 底部新增确认弹窗骨架（默认带有 `hidden` 属性）：
       ```html
       <div class="modal-backdrop" id="delete-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="delete-modal-title" aria-describedby="delete-modal-desc" hidden>
         <div class="modal">
           <h3 class="modal__title" id="delete-modal-title">删除对话</h3>
           <p class="modal__desc" id="delete-modal-desc">确定要删除该对话吗？删除后其中的全部消息将无法恢复。</p>
           <div class="modal__actions">
             <button class="modal__btn modal__btn--cancel" id="delete-modal-cancel" type="button">取消</button>
             <button class="modal__btn modal__btn--danger" id="delete-modal-confirm" type="button">删除</button>
           </div>
         </div>
       </div>
       ```
  2. 深色视觉样式（`Assistant/web/css/components.css`）：
     - `.modal-backdrop`：`position: fixed; inset: 0; z-index: 1000; background-color: rgba(0, 0, 0, 0.62); backdrop-filter: blur(2px); display: flex; align-items: center; justify-content: center;`，并规定 `.modal-backdrop[hidden] { display: none !important; }`；
     - `.modal`：宽度 `min(380px, calc(100vw - 32px))`，背景 `--color-surface`，边框 `1px solid var(--color-border-strong)`，圆角 `var(--radius-md)`，内边距 `20px 24px`，配轻微弹出入场过渡；
     - `.modal__btn--cancel` 采用透明/深色次级边框按钮样式；`.modal__btn--danger` 采用 `--color-danger`（`#ef4444`）红色背景配白色文字，悬停高亮，明确警示危险操作。
  3. 拦截与确认状态机（`Assistant/web/js/views/chat.js`）：
     - 维护模块级状态 `let pendingDeleteSessionId = null;`；
     - 当用户在离线或在线会话列表中点击垃圾桶删除按钮（`.session-item__action-btn[data-action="delete"]`）时：
       - 调用 `event.stopPropagation()`，不再直接删除，而是调用 `openDeleteConfirmModal(session.id)`；
       - `openDeleteConfirmModal(sessionId)` 将 `pendingDeleteSessionId` 设为 `sessionId`，读取该会话标题动态更新 `#delete-modal-desc` 文案为 `确定要删除对话“${session.title}”吗？删除后该对话的全部消息将无法恢复。`（使用 `textContent` 防 XSS），将 `#delete-confirm-modal` 的 `hidden` 置为 `false`，并将键盘焦点移至 `#delete-modal-cancel` 按钮；
     - 取消与关闭分支：
       - 点击 `#delete-modal-cancel` 按钮、点击 `.modal-backdrop` 遮罩空白处（`event.target === modalBackdropEl`）或在弹窗打开期间按下键盘 `Escape` 键时，调用 `closeDeleteConfirmModal()`：将 `pendingDeleteSessionId` 重置为 `null`，设置 `modalBackdropEl.hidden = true`，原会话及其消息不做任何改动；
     - 确认删除分支：
       - 点击 `#delete-modal-confirm` 红色“删除”按钮时：取出 `targetId = pendingDeleteSessionId`，立即调用 `closeDeleteConfirmModal()` 关闭弹窗，随后调用 `await handleDeleteSession(targetId)` 执行既有删除逻辑（流式中止、队列清理、在线 `DELETE /api/sessions/{id}` 持久化清除、内存移除及当前会话落回空白草稿态）。

---

##### B1.12 消息一键复制

**B1_12_1 消息气泡底部元信息栏、纯文本提取与一键复制反馈**

- 状态：已确认
- 需求描述：在离线与在线形态下，每条用户消息与 Agent 回复气泡下方（与时间戳同行的底部区域）均提供一键复制按钮；点击后将该条消息渲染后的纯文本复制到剪贴板，并展示短暂“已复制”反馈；流式生成中的消息在完成前不显示复制按钮。
- 详细方案设计：
  1. 新增矢量图标定义（`Assistant/web/index.html` 与 `Assistant/web/js/icons.js`）：
     - 在 `index.html` 的 `<svg class="app-svg-sprite">` 中新增两个 symbol：
       - `icon-copy`：双层圆角矩形复制图标；
       - `icon-check`：勾选对号图标；
     - 在 `Assistant/web/js/icons.js` 的 `ICONS` 中新增 `COPY: 'icon-copy'` 与 `CHECK: 'icon-check'`。
  2. 消息底部 DOM 结构与流式显隐控制（`Assistant/web/js/views/chat.js` 与 `Assistant/web/css/chat.css`）：
     - 在 `createMessageNode(message)` 中，将气泡下方的 `<time class="msg__time">` 升级为弹性同行容器 `<div class="msg__meta">`：
       - 子节点 1：`<time class="msg__time" datetime="...">YYYY-MM-DD HH:mm</time>`；
       - 子节点 2：`<button class="msg__copy-btn" type="button" aria-label="复制消息内容" title="复制">`（内部通过 `createSvgIcon(ICONS.COPY, 'msg__copy-icon')` 挂载图标，并附带 `<span class="msg__copy-label">复制</span>`）；
     - 对齐与流式控制：
       - `.msg__meta` 设置为 `display: inline-flex; align-items: center; gap: 8px; margin-top: 6px; padding: 0 4px;`，`.msg--user .msg__meta` 跟随用户气泡靠右对齐，`.msg--agent .msg__meta` 靠左对齐；
       - 当消息处于流式生成中（`.msg.is-streaming`）时，通过 CSS `.msg.is-streaming .msg__copy-btn { display: none; }` 隐藏复制按钮；当流式结束移除 `.is-streaming` 类后，复制按钮自动展现。
  3. 纯文本复制与短暂“已复制”视觉反馈：
     - 点击 `.msg__copy-btn` 时，执行 `handleCopyMessage(articleEl, message, copyBtnEl)`：
       - **纯文本获取规则**：优先查找当前气泡内的 `.msg__text` 节点；若该节点为 Markdown 渲染容器（`.msg__text--markdown`），读取 `textEl.innerText.trim()`（直接获得浏览器排版后的纯文本，不含 `**`、`#`、```` ``` ```` 等 Markdown 标记符号，若节点未挂载则调用 `stripMarkdownToPlainText(message.content)`）；若为普通纯文本节点（用户消息或离线消息），读取 `textEl.textContent`（或 `message.content`）；
       - **剪贴板写入**：优先调用 `await navigator.clipboard.writeText(plainText)`；若在非安全上下文或权限受限时自动回退至隐藏 `<textarea>` + `document.execCommand('copy')` 方案；
       - **视觉反馈状态机**：复制成功后，为 `copyBtnEl` 添加 `.is-copied` 类（配色变为成功绿/主色高亮），内部 `<use>` 图标引用切换为 `#icon-check`，`.msg__copy-label` 文本更新为 `"已复制"`；在按钮实例上记录定时器 ID，延时 `1500ms` 后自动移除 `.is-copied`、恢复 `#icon-copy` 图标与 `"复制"` 文案（若 1500ms 内再次点击则先 `clearTimeout` 再重新计时）。

 


---

##### B1.13 对话中添加附件与默认应用打开

**B1_13_1 多源附件添加交互、全域拖拽提示与待发送区内存管理**

- 状态：已完成
- 需求描述：支持通过点击回形针按钮选择文件、拖拽文件进入对话区（支持整个对话面板）、以及 `Ctrl+V` 粘贴三种方式添加附件；拖拽进入对话区时全域背景虚化并居中提示拖入添加附件与规格要求；在输入框上方动态展现待发送附件列表（包含文件名、格式图标、文件大小与单独移除按钮）；离线与在线形态支持相同添加与接收能力。
- 详细方案设计：
  1. 触发入口与多源监听（`views/chat.js` 与 `index.html`）：
     - 在输入区左侧工具栏增设回形针按钮 `<button class="chat-input__action-btn" id="attach-btn" type="button" aria-label="添加附件" title="添加附件"><svg class="icon"><use href="#icon-paperclip"></use></svg></button>`，绑定隐藏的 `<input type="file" id="file-input" multiple>`，点击触发系统文件选择框；
     - **对话面板全域拖拽与提示蒙层（全屏虚化居中提示）**：
       - 将拖拽监听（`dragenter`、`dragover`、`dragleave`、`drop`）绑定至整个对话面板容器 `#chat-panel`（或 `.chat-view`）；
       - 在对话面板内挂载全屏拖拽蒙层 `#chat-drag-overlay`，默认隐藏；
       - 当外部文件拖入对话面板时（`dragover`）：蒙层激活显现，对话背景应用高斯模糊（`backdrop-filter: blur(4px)`），面板中央居中展示深色高亮卡片：
         - 标题：“拖入此处添加附件”；
         - 规格要求说明：
           - 格式要求：支持常见图片（.png, .jpg, .jpeg, .webp）、文档（.docx, .xlsx, .pptx, .pdf）、文本及代码文件（.txt, .md, .py, .js 等）；
           - 大小限制：单个文件不超过 5MB；
           - 数量限制：单条消息最多添加 3 个附件；
       - 当拖拽离开对话面板（`dragleave`，经 `relatedTarget` 验证脱离）或释放文件（`drop`）时：蒙层平滑淡出，对话背景恢复清晰；若为 `drop` 则提取 `e.dataTransfer.files` 进入附件添加处理流程；
     - 监听输入框文本域 `#message-input` 的 `paste` 事件：遍历 `e.clipboardData.items`，过滤出文件对象（`item.kind === 'file'`）；若检测到剪贴板图片（`item.type.startsWith('image/')` 且文件名为空或默认 `image.png`），自动按 `image_${Date.now()}.png` 生成规范文件名转换为 `File` 对象；
  2. 待发送附件池状态管理（`store.js`）：
     - 在 `store.state` 中维护待发送附件数组 `pendingAttachments`，每个条目结构为：`{ id: 'att_tmp_' + uid, file: File, name: file.name, size: file.size, ext: string, isImage: boolean, previewUrl: string | null }`；
     - 若属于图片类型，调用 `URL.createObjectURL(file)` 生成本地内存预览地址赋给 `previewUrl`；
  3. 待发送区 DOM 渲染与独立移除交互（`chat.css` 与 `views/chat.js`）：
     - 在输入框上方挂载待发送附件容器 `.pending-attachments`（当 `pendingAttachments` 为空时隐藏）；
     - 每个附件渲染为胶囊卡片 `.pending-attachment-item`，显示文件分类小图标、文件名（超出宽度单行省略）、大小（格式化为 KB / MB）以及右上角移除按钮 `<button class="pending-attachment-item__remove" type="button" aria-label="移除">&times;</button>`；
     - 点击移除按钮时：从 `store.pendingAttachments` 中精确移除该项；若存在 `previewUrl` 则显式调用 `URL.revokeObjectURL(previewUrl)` 释放内存；输入框中的文字与已保留的其它附件完全不受影响；
     - 双形态统一：离线形态与在线形态均使用该完全相同的前端待发送区与内存管理。

**B1_13_2 客户端前置去重、全量前置校验与整批拒绝拦截**

- 状态：已完成
- 需求描述：添加附件时支持静默去重（相同文件不重复添加且不弹窗，只保留一个文件）；执行严格规格校验（格式白名单、单文件不超过 5MB、单条消息总数不超过 3 个）；只要去重后的本次新添加中任一文件不合格，整批拒绝本次添加，弹出深色提示弹窗说明具体原因，输入区已有的合格附件保持不变。
- 详细方案设计：
  1. **相同文件静默去重机制**：
     - 当传入文件列表 `incomingFiles` 时，首先依据文件名（`name`）与字节大小（`size`）进行去重比对；
     - 若传入文件在当前待发送池 `pendingAttachments` 中已存在，或本次批量传入中存在重复文件，**不弹出任何错误弹窗，静默忽略重复文件，只保留单一文件实例**；
     - 仅对去重后真正新增的文件执行后续格式、大小与总数校验；
  2. 允许类型白名单与扩展名判定（`Assistant/web/js/views/chat.js`）：
     - 图片类：`.png`、`.jpg`、`.jpeg`、`.webp`；
     - 文档类：`.docx`、`.xlsx`、`.pptx`、`.pdf`（明确禁止 `.doc`、`.xls`、`.ppt` 等旧格式二进制文件）；
     - 文本类：`.md`、`.txt`；
     - 代码类：`.py`、`.js`、`.ts`、`.json`、`.html`、`.css`、`.java`、`.c`、`.cpp`、`.go`、`.sh`、`.yaml`、`.sql`；
     - 提取扩展名统一采用小写 `file.name.slice(file.name.lastIndexOf('.')).toLowerCase()`；
  3. 整批拒绝前置校验算法：
     - 去重后得到有效新增文件集合 `newFiles`；
     - ① 校验总数量：若 `store.pendingAttachments.length + newFiles.length > 3`，判定违规，提示文案：“单条消息最多添加 3 个附件。”；
     - ② 校验单个文件格式：遍历 `newFiles`，若发现存在任一文件的扩展名不属于白名单，整批拒绝，提示文案：“文件 '${file.name}' 格式不受支持。仅支持常见图片、文档、文本与代码文件。”；
     - ③ 校验单个文件大小：遍历 `newFiles`，若存在任一文件 `file.size > 5 * 1024 * 1024`（5MB），整批拒绝，提示文案：“文件 '${file.name}' 大小超出 5MB 限制。”；
     - 违规处理：一旦命中上述任一违规，**整批丢弃本次传入的全部文件**，输入区已有的待发送附件完好保留；
  4. 通用深色模态提示弹窗（Alert Modal）：
     - 复用全局深色弹窗体系，在 `index.html` 中提供 `#alert-modal` 骨架；
     - 弹窗展示警告标题“无法添加附件”与对应的违规原因文案；底部提供单个深色高亮“我知道了”按钮；
     - 支持点击按钮、点击背景遮罩或按下键盘 `Escape` 键平滑关闭弹窗。

**B1_13_3 在线附件持久化与 Mock 模式缓存目录管理**

- 状态：已完成
- 需求描述：在线形态下，发送消息时将附件复制存入本地应用专属目录，与原文件解耦；删除对话时级联删除对应的附件副本；Mock 模式下将发送的文件存入专用缓存文件夹中，按照相同模式处理附件查看与系统调起；每次程序启动时自动清空该缓存文件夹。
- 详细方案设计：
  1. 在线形态存储目录与持久化：
     - 存储基路径：`data/attachments/{session_id}/`，按会话唯一 ID 隔离划分独立的子文件夹；
     - 文件命名：采用 `{attachment_id}_{safe_filename}`，防止重名覆盖与路径穿越；
     - 在 SQLite 中创建 `attachments` 表并配置 `ON DELETE CASCADE` 外键级联；删除在线会话时物理清理该会话子目录；
  2. **Mock 模式临时缓存目录与启动清理规范**：
     - 缓存基路径：`data/cache/attachments/`（配置常量 `ATTACHMENT_CACHE_DIR`）；
     - **启动清空缓存**：在 FastAPI 应用启动的 `lifespan` 阶段，自动扫描并清空 `data/cache/attachments/` 目录下的所有临时文件，确保每次程序运行均从干净的缓存环境开始；
     - **Mock 附件写入与管理**：
       - 提供附件缓存写入接口（`POST /api/attachments/cache`），支持接收表单文件流，保存至 `data/cache/attachments/{attachment_id}_{safe_filename}`；
       - 后端内存维护缓存附件元数据记录表 `cache_attachments`（含 `id`, `filename`, `file_type`, `file_size`, `storage_path`, `is_image` 等信息）；
       - 前端在 Mock 模式下发送带附件消息时，先行将文件上传至缓存目录，并将其关联的真实附件 ID 存入用户消息气泡中；
  3. 双形态统一打开与预览：
     - 在 `POST /api/attachments/{attachment_id}/open` 与 `GET /api/attachments/{attachment_id}/preview` 中，后端若在在线 `attachments` 表未查到对应附件，自动回退到缓存附件表查询；
     - 若命中缓存且物理文件存在，同样异步调起 Windows 系统默认关联程序打开该文件，或提供图片缩略图预览。

**B1_13_4 消息气泡附件呈现与系统默认应用调起**

- 状态：已完成
- 需求描述：发送后附件在消息气泡中展示（图片显示缩略图，其余展示文件卡片）；点击附件时调用 Windows 系统默认应用打开应用目录（或 Mock 缓存目录）里的副本；副本被手动删除后点击提示“文件已不存在”。
- 详细方案设计：
  1. 消息气泡附件列表 DOM 结构与排版（`chat.css` 与 `views/chat.js`）：
     - 每条包含附件的消息卡片中挂载 `.msg__attachments` 容器；
     - **图片附件**：渲染为 `.attachment-card.attachment-card--image`，内部挂载 `<img class="attachment-card__thumb" src="/api/attachments/{id}/preview" alt="{filename}" loading="lazy">`；缩略图最大尺寸限制为 `180px * 180px`，保持原宽高比，圆角边框并带有悬停放大与阴影动效；
     - **非图片附件**：渲染为 `.attachment-card.attachment-card--file`，包含文件类型专属彩色小图标、两行省略的文件名与文件大小说明；
     - 附件卡片具有可点击视觉反馈（指针悬停变为手型并微发光）；
  2. Windows 系统默认应用调起（`Assistant/api/attachments.py`）：
     - 前端点击气泡内的附件卡片时，调用 `POST /api/attachments/{attachment_id}/open`；
     - 后端查询 `attachments` 表或缓存附件表定位到 `storage_path`；
     - 物理文件检查：若 `storage_path.is_file()` 为 `False`（附件副本此前被用户手动删除或已被清理），后端返回 `404 Not Found`（错误码 `ATTACHMENT_NOT_FOUND`）；
     - 调起操作系统程序：若文件存在，在 Windows 环境下异步调用 `os.startfile(str(storage_path.resolve()))` 调起系统默认关联程序，接口返回 `200 OK`；
     - 前端反馈：若后端返回 404，前端调用通用深色提示弹窗，向用户明确提示：“文件已不存在”。

---

##### B1.14 图片附件的模型视觉能力校验与弹窗拦截

**B1_14_1 发送时模型视觉能力探测、多模态 Base64 注入与阻断拦截机制**

- 状态：已完成
- 需求描述：添加图片时不校验、不弹窗；在点击发送时校验当前配置模型是否支持图片输入；若模型 API 返回不支持，拦截本次发送，弹出提示“当前模型不支持图片输入”，清空本条消息的全部附件（图片与文档），但保留输入框中的文字；若模型支持视觉，将图片编码为标准多模态 Base64 数据注入请求，确保视觉模型真实接收到图片。
- 详细方案设计：
  1. 发送时探测触发时序（`Assistant/api/sessions.py` 与 `Assistant/agent/llm_client.py`）：
     - 用户在前端输入区添加图片并点击发送时，前端发起 `POST /api/sessions/{session_id}/messages` 请求；
     - 后端检测到提交的文件列表中包含图片扩展名（`.png`, `.jpg`, `.jpeg`, `.webp`）；
     - 视觉能力校验机制：系统维护运行时内存缓存 `_model_vision_cache: dict[str, bool]`；
       - 若当前模型名称已有探测缓存且为 `True`，直接放行；若为 `False`，判定为不支持；
       - 若无探测记录，向模型服务商发起轻量视觉探测请求（携带 1x1 最小合法图片 content 块向模型端点请求单 token 输出）；
       - 若服务商返回成功，将该模型记录为支持视觉（`True`）并放行；
       - 若服务商返回 `400 Bad Request` 或报错内容指出 `does not support image` / `invalid parameter`，将该模型标记为不支持（`False`）；
  2. **多模态视觉图片 Base64 注入大模型上下文（`online_agent.py` 与 `react.py`）**：
     - 在为视觉模型构造用户消息时，若用户消息包含图片附件（`is_image=True`）：
       - 从附件存储路径（`storage_path`）读取图片二进制字节，转换为 Base64 编码字符串；
       - 根据扩展名获取图片 MIME 类型（如 `image/png`, `image/jpeg`, `image/webp`）；
       - 将消息的 `content` 组装为 OpenAI 标准多模态格式：
         ```json
         [
           {"type": "text", "text": "用户消息正文内容"},
           {
             "type": "image_url",
             "image_url": {
               "url": "data:image/png;base64,..."
             }
           }
         ]
         ```
       - 确保真实多模态请求下，配置了视觉模型的后端服务能够将图片内容完整推入大模型 API，模型能够准确看到并理解图片；
  3. 后端 400 阻断与事务回滚：
     - 探测到不支持图片时，接口立即返回 `400 Bad Request`，返回 JSON 结构体 `{"code": "IMAGE_NOT_SUPPORTED", "message": "当前模型不支持图片输入"}`；
     - 拦截期间不执行数据库写操作，不保存附件到磁盘，杜绝垃圾数据生成；
  4. 前端拦截状态机与输入保护（`Assistant/web/js/views/chat.js`）：
     - 前端捕获到 `IMAGE_NOT_SUPPORTED` 响应码：
       ① **阻断本次发送**：不将用户消息挂载上屏，不开启 SSE 订阅流；
       ② **模态弹窗警示**：弹出通用深色模态提示弹窗，文案为“当前模型不支持图片输入”；
       ③ **清空全部附件**：调用 `store.pendingAttachments.forEach(att => att.previewUrl && URL.revokeObjectURL(att.previewUrl))` 释放资源，将 `store.pendingAttachments` 重置为空数组并重新渲染待发送区（图片与文档一并清空）；
       ④ **保留输入框文字**：文本框中的已有草稿文本完好保留，文本域重新聚焦，用户可直接调整后再次发送。

**B1_14_2 视觉校验在双形态与切模型场景的适配**

- 状态：已完成
- 需求描述：离线形态（Mock 阶段）不模拟不支持，图片附件直接放行；添加图片后切换到不支持图片的模型，图片仍保留在待发送列表，发送时被拦截。
- 详细方案设计：
  1. 离线形态直接放行：
     - 离线形态下无真实模型 API，发送包含图片的消息时跳过视觉探测，直接放行，MockAgent 正常生成包含文件数量与名称的离线回复；
  2. 切换模型延迟校验保护：
     - 用户在输入框添加图片附件后，无论在后台切换了模型还是修改了配置，前端待发送列表内的图片与文档始终保留在输入框上方；
     - 探测与拦截时机严格限定在用户点击“发送”按钮的一刻触发，满足“切换模型后待发送列表图片保留，发送时被拦截”的规范。

---

##### B1.15 附件读取工具（首个 Tool）

**B1_15_1 `read_attachment` 工具注册与安全沙箱执行**

- 状态：已完成
- 需求描述：在统一注册中心正式注册首个工具 `read_attachment`；参数传入附件标识 `attachment_id`，不传文件路径；系统在上下文告知 Agent 本条消息包含的附件及其标识；仅允许读取当前会话内的附件，防范越权与路径穿越。
- 详细方案设计：
  1. 工具协议实现与注册（`Assistant/agent/tools/attachment_tool.py`）：
     - 实现 `ReadAttachmentTool`，满足 `BaseTool` 抽象协议：
       - `name = "read_attachment"`；
       - `description = "读取当前会话中用户上传的非图片附件（Word、Excel、PPT、文字版 PDF、文本及代码文件）的文本内容。"`；
       - `parameters = {"type": "object", "properties": {"attachment_id": {"type": "string", "description": "待读取的附件唯一标识 ID"}}, "required": ["attachment_id"]}`；
     - 在应用启动时自动向 `ToolRegistry` 注册该单例实例；
  2. 上下文注入与权限沙箱隔离：
     - 当用户发送包含非图片附件的消息时，后端在向模型注入上下文时附带附件描述提示词：`[当前消息包含附件: 文件名={filename}, 附件标识={attachment_id}, 类型={file_type}]`；
     - 沙箱鉴权：工具被调用时，接收 `attachment_id` 参数及当前 `session_id`；工具首先从 SQLite `attachments` 表查询该附件记录；
     - 若该附件不存在或所属 `session_id` 与当前活跃会话不匹配，严禁读取任何物理文件，直接返回错误字符串：`[错误：未在当前会话中找到该附件]`，防止跨会话越权与任意路径探测；
  3. 多格式文本提取解析器（`Assistant/agent/tools/parsers/`）：
     - `doc_parser.py`：
       - Word（`.docx`）：使用 `python-docx` 读取正文段落与表格，按换行拼接；
       - Excel（`.xlsx`）：使用 `openpyxl` 遍历非空工作表，将单元格转为 Markdown 表格或制表符分隔文本；
       - PPT（`.pptx`）：使用 `python-pptx` 遍历幻灯片形状中的文本框提取文本；
     - `pdf_parser.py`：
       - PDF（`.pdf`）：使用 `pypdf.PdfReader` 逐页提取纯文本；
     - `text_parser.py`：
       - 文本与代码：以 `utf-8` 编码打开，若遇解码错误自动回退 `gbk`，读取 `.md`、`.txt` 以及所有允许的代码源文件全文。

**B1_15_2 文件内容超长截断保护与失败降级策略**

- 状态：已完成
- 需求描述：超出长度上限时截断并在返回内容中明确告知已被截断，Agent 需在回答中说明；损坏、加密、编码异常、扫描版 PDF 等情况，工具只返回错误信息，Agent 如实告知用户，不得编造内容。
- 详细方案设计：
  1. 10,000 字符安全截断防线：
     - 全局配置常量 `ATTACHMENT_TEXT_TRUNCATE_LIMIT = 10000`；
     - 解析器提取出文本后，若字符数超过 10,000 字符：截取前 10,000 字符，并在末尾显式拼接系统说明字符串：`\n\n[注：该附件内容已超出长度上限，系统已自动截断前 10,000 字符]`；
     - 系统提示词约束 Agent：当工具返回包含截断声明时，Agent 必须在最终回答中如实向用户声明由于文件过长仅分析了前半部分；
  2. 扫描版 PDF 判定与错误返回：
     - 若 `pypdf` 提取出的文本去除所有空白字符后长度为 0，判定该 PDF 属于扫描版或纯图片文档；
     - 工具不崩溃也不调用 OCR，返回标准错误：`[读取失败：该 PDF 文件为扫描版或纯图片型文档，当前系统仅支持文字版 PDF]`；
  3. 损坏、加密与编码异常安全捕获：
     - 解析过程捕获 `pypdf.errors.FileNotDecryptedError`、`zipfile.BadZipFile`、`UnicodeDecodeError` 及文件读取 I/O 异常；
     - 捕获异常后统一返回标准错误提示：`[读取失败：文件已加密、损坏或编码不受支持]`；
     - Agent 提示词严格约束：当工具返回读取失败时，Agent 必须如实将失败原因告知用户，严禁凭空虚构或猜测文件内容。

**B1_15_3 ReAct 规划步骤状态全链路广播、明确展示与离线 Mock 反馈**

- 状态：已完成
- 需求描述：Agent 执行过程中明确展示规划与执行步骤，包括“正在思考”、“正在调用工具: xxx”、“正在生成回复”等状态，不再只隐蔽展示工具；离线形态发送带附件消息时，将附件安全存入临时缓存，Mock 给出文字反馈。
- 详细方案设计：
  1. ReAct 循环与规划步骤状态广播（`Assistant/agent/react.py` 与 `task_manager.py`）：
     - 在 Agent 执行生命周期中，通过 `step_status`（与既有 `tool_start`、`tool_done`）事件向前端全链路推送明确的 Agent 规划步骤：
       ① **进入思考/规划阶段**：在调用 LLM 决策前，广播 `event: step_status\ndata: {"status": "thinking", "text": "正在思考..."}\n\n`；
       ② **调用工具阶段**：当 LLM 返回 `tool_calls` 时，广播 `event: step_status\ndata: {"status": "calling_tool", "tool": tool_name, "text": "正在调用工具: " + tool_name + "..."}\n\n`（同时广播 `tool_start` 携带 `attachment_name` 等详细参数）；
       ③ **工具调用完成**：广播 `tool_done`；
       ④ **生成最终回复阶段**：当模型决定结束工具调用或无工具调用、开始吐出回复内容时，广播 `event: step_status\ndata: {"status": "generating", "text": "正在生成回复..."}\n\n`；随后以 `delta` 逐块推送正文内容；
  2. 前端规划步骤状态指示器组件（`views/chat.js` 与 `chat.css`）：
     - 升级气泡等待指示区为规划步骤指示器 `.agent-step-status`，替代单一三点等待：
       - 显示当前步骤状态（“正在思考...”、“正在调用工具: xxx...”、“正在生成回复...”）与动态微动图标；
       - 当收到新的 `step_status` 事件时，平滑更新状态文字与图标；
       - 当收到首个 `delta` 或正文开始输出后，生成状态平滑过渡，确保最终回复 Markdown 清晰展示；
       - 生成完成（`done`）后，规划步骤收拢为完成状态；
  3. 离线形态 Mock 阶段文字与缓存反馈：
     - 离线形态下，发送消息后前端将附件上传至临时缓存目录 `data/cache/attachments/`；
     - MockAgent 在 SSE 回复中同样包含规划步骤流转与收到文件的文字反馈，且用户点击气泡中的附件卡片可调起 Windows 系统默认程序正常查看。
