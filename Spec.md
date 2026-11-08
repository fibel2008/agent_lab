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
├── data/                        [第二版新增] 本地持久化与缓存数据目录（受 .gitignore 忽略）  
│   ├── emibot.db                本地 SQLite 数据库文件  
│   ├── attachments/             [第二版新增] 附件持久化存储目录（按 session_id 分布）  
│   └── cache/attachments/       [第二版新增] 离线 Mock 附件临时缓存目录（启动时清空）  
├── Archive/                     [阶段归档] 历史阶段规格与需求归档目录（受 .gitignore 忽略）  
│   ├── vA_0_intent.md  
│   ├── vA_0_spec.md  
│   ├── vB_0_intent.md  
│   └── vB_0_spec.md  
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
<!-- B 阶段实现规格已归档至 Archive/vB_0_spec.md -->

### B 第二版（已归档）

第二版实现规格（B1_1_1 到 B1_15_3）已全部实现并通过全量自动化测试，详细实现规格已归档至 Archive/vB_0_spec.md。
