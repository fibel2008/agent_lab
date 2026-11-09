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
│       ├── index.html           应用外壳 + 内联 SVG 图标库（顶栏含形态切换器、个人数据库视图切换栏与全局搜索框，底部含通用深色模态弹窗与轻提示 Toast）  
│       ├── css/  
│       │   ├── tokens.css       设计令牌（颜色、圆角、间距、字号、布局、形态与中断状态）  
│       │   ├── base.css         reset、排版、滚动条、可访问性基础  
│       │   ├── layout.css       顶栏、主侧栏（含缩略态）、内容区、响应式断点  
│       │   ├── components.css   导航项、徽标、状态圆点、按钮、形态开关胶囊、模态提示与确认弹窗、轻提示 Toast、占位页  
│       │   ├── chat.css         对话页双列布局、会话列表侧栏、空状态、待发送附件栏、气泡附件卡片、图片缩略图、工具执行胶囊、Markdown 排版、底部复制栏、输入区  
│       │   └── database.css     [第三版 C1.0 新增] 个人数据库工作台样式：顶栏视图切换栏、右侧全局搜索框与分组下拉浮层、可收起列表栏、详情编辑器、溯源高亮卡片与预留扩展区  
│       └── js/  
│           ├── main.js          启动入口：构建导航、初始化路由、装配视图  
│           ├── routes.js        路由与导航的唯一配置源  
│           ├── icons.js         SVG symbol 的 id 常量（新增回形针、文件类型、搜索与工具动效图标）  
│           ├── router.js        hash 路由解析、主侧栏折叠切换、顶栏数据库专属控件显隐与视图切换  
│           ├── store.js         双形态状态管理與个人数据库工作台状态管理（资料、切片、对话归档、检索与草稿脏状态）  
│           ├── api.js           RESTful API 客户端（包含附件打开与预览）与会话级 SSE 订阅客户端  
│           ├── dom.js           DOM 工具与时间戳格式化函数  
│           ├── markdown.js      [第二版新增] 零依赖安全 DOM 级 Markdown 解析与纯文本提取工具  
│           └── views/  
│               ├── chat.js      对话工作区与会话列表视图控制器（形态切换、附件添加/校验/移除/打开、模型视觉拦截、ReAct 工具过程展示、解耦流式订阅、Markdown 渲染、删除确认与一键复制）  
│               ├── database.js  [第三版 C1.0 新增] 个人数据库工作台视图控制器（顶栏视图切换与全局搜索、可收起列表栏、资料导入切分、双向联动编辑保存、未保存拦截、删除确认与溯源跳转）  
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
├── 顶栏形态切换器（离线 ⇄ 在线）与个人数据库顶栏扩展区（左侧视图切换 Tab 栏 + 右侧全局搜索框）  
├── 对话工作区（views/chat.js）  
│   ├── 待发送附件池与多源输入（store.js：按钮选择、拖拽进输入区、Ctrl+V 粘贴/截图）  
│   ├── 离线数据流：内存 store.js ── POST /api/chat（直连 MockAgent 同步 SSE 直出，文字反馈附件接收）  
│   └── 在线数据流：  
│       ├── 会话管理：RESTful API（GET/POST/PATCH/DELETE /api/sessions）── SQLite 持久化与附件目录级联清理  
│       ├── 附件操作：POST /api/attachments/{id}/open（Windows 默认应用调起）、GET /api/attachments/{id}/preview  
│       ├── 触发生成：POST /api/sessions/{session_id}/messages ── 发送时模型视觉探测与拦截、202 异步任务  
│       ├── 解耦订阅：GET /api/chat/stream?session_id={id} ── 接收 SSE delta 增量与 tool_start/tool_done 过程  
│       └── 任务中断：POST /api/chat/abort ── 中断指定会话正在进行的任务  
├── 个人数据库工作区（views/database.js，[第三版 C1.0 新增]）  
│   ├── 顶栏联动：左侧「资料 / 切片 / 对话归档 / 未来视图」Tab 切换 + 右侧全局跨源检索浮层（Ctrl+K、IME 保护）  
│   ├── 左侧可收起条目列表栏：支持资料导入切分、来源筛选胶囊、会话分组折叠、底部收起与 72px 主导航底部展开  
│   └── 右侧详情与溯源面板：解析文本/切片/归档消息自适应编辑、未保存脏状态守卫、资料⇄切片双向联动保存、上下文高亮溯源与跨视图跳转  
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
| `router.js`            | 解析 hash、主侧栏折叠切换、顶栏数据库专属控件显隐、切换视图、更新导航高亮与 `document.title`                                                                          | `routes.js`                      |
| `store.js`             | 双形态状态管理（离线纯内存与在线持久化数据源、草稿维护、流状态映射）与个人数据库工作台状态管理（资料、切片、对话归档、检索与编辑脏状态） | `dom.js`                         |
| `api.js`               | RESTful API 客户端（会话与消息 CRUD、状态检查、中断请求）与会话级解耦 SSE 订阅客户端                                                  | 无                              |
| `dom.js`               | `el()`、`createSvgIcon()`、`formatTimestamp()`、`scrollToBottom()`、`isNearBottom()`                                                                             | 无                              |
| `markdown.js`          | 安全 DOM 级 Markdown 解析器（`renderMarkdownToElement`）与纯文本提取（`stripMarkdownToPlainText`）                                                              | `dom.js`                         |
| `views/chat.js`        | 对话页 DOM、会话列表渲染、新建/重命名/删除会话（含二次确认弹窗）、形态切换响应、解耦流式订阅与重连、在线 Agent Markdown 渲染、消息气泡底部一键复制、异常气泡渲染 | `store.js`、`api.js`、`dom.js`、`markdown.js`、`icons.js` |
| `views/database.js`    | 个人数据库工作台 DOM、顶栏视图切换与全局搜索下拉、可收起条目列表栏、本地文件导入与切分、资料与切片双向联动编辑保存、历史归档消息编辑与删除、未保存离开拦截与溯源跳转 | `store.js`、`dom.js`、`icons.js`（C2.0 起扩展依赖 `api.js`） |
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
| 第三版 | 10     | `feature/database-workbench-ui` | 个人数据库工作台前端页面启用、顶栏左侧视图切换栏与右侧全局搜索框嵌入（含 IME 保护与快捷键）、左侧主导航缩略与可收起条目列表栏、资料/切片/对话归档三视图浏览、资料导入切分、资料与切片双向联动编辑保存、对话归档消息修改与删除、未保存离开拦截、删除二次确认与溯源高亮跳转 | C1.1、C1.2、C1.3                                            | 已完成 |


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

- 前端个人数据库工作台状态管理（`store.js` 中的 `dbState`，C1.0 阶段）：

```js
{
  activeView: 'chunks',            // 当前激活分类视图：'docs'（资料） | 'chunks'（切片） | 'chats'（对话归档）
  selectedIds: {                   // 各视图当前选中的条目 ID（无选中时为 null）
    docs: 'd1',
    chunks: 'c11',
    chats: 'm1'
  },
  filterDocId: null,               // 切片视图下的来源资料过滤 ID（为 null 表示显示全部切片）
  searchQuery: '',                 // 顶栏右侧全局搜索框当前查询词
  foldedSessions: {},              // 对话归档视图中已折叠的会话字典：{ [sessionId]: boolean }
  draftText: null,                 // 右侧详情编辑器当前未保存草稿（null 表示未发生编辑或与原文一致）
  isSidebarCollapsed: false,       // 个人数据库左侧条目列表栏是否处于收起状态
  docs: [                          // 资料列表：[{ id, name, time, text }]
    { id: 'd1', name: 'Python 入门笔记.pdf', time: '昨天导入', text: '...' },
    { id: 'd2', name: 'agent_notes.docx', time: '3 天前导入', text: '...' }
  ],
  chunks: [                        // 分段切片列表：[{ id, docId, paraIndex, text }]（由 docs 按双换行切分派生并与之双向同步）
  ],
  archivedSessions: [              // 对话归档列表：[{ id, title, msgs: [{ id, role, text, time }] }]
  ]
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

---

### C 第三版

#### C1.0 个人数据库工作台前端页面

##### C1.1 个人数据库页面启用与整体布局

**C1_1_1 路由激活、主侧栏自动缩略与双形态无差别访问**

- 状态：已完成
- 需求描述：启用左侧主导航中的“个人数据库”（`#/database`）工作台视图，移除第一版占位页；进入该页面时主导航栏自动收缩为 `72px` 图标栏；无论顶栏当前处于离线模式还是在线模式，均可正常进入与操作个人数据库工作台。
- 详细方案设计：
  1. 路由配置升级（`Assistant/web/js/routes.js`）：
     - 将 `#/database` 路由项的 `view` 字段由 `'placeholder'` 修改为 `'database'`；
  2. 视图容器与主侧栏缩略联动（`Assistant/web/index.html` 与 `Assistant/web/js/router.js`）：
     - 在 `index.html` 的 `.app-main` 内新增 `<section class="view view--database" id="view-database" aria-label="个人数据库工作台" hidden></section>`；
     - 在 `router.js` 的 `syncRoute()` 中判定：
       - `const isChat = route.view === 'chat';`
       - `const isDatabase = route.view === 'database';`
       - `const isCompactSidebar = isChat || isDatabase;`
       - 主导航栏 `.app-sidebar` 在 `isCompactSidebar` 为 `true` 时挂载 `.app-sidebar--collapsed`（收为 `72px` 仅显示图标的缩略态，移动端 `< 768px` 为 `64px`）；
       - 控制三个视图容器互斥显隐：`viewChatEl.hidden = !isChat`、`viewDatabaseEl.hidden = !isDatabase`、`viewPlaceholderEl.hidden = (isChat || isDatabase)`；
  3. 双形态无差别访问保障：
     - 顶栏 `.mode-toggle` 切换离线/在线模式时，仅切换对话工作区（`#/chat`）的数据源与流式行为；
     - 若用户当前处于 `#/database` 页面并在顶栏点击切换离线/在线模式，个人数据库视图的状态、选中项与数据保持不变，不阻断、不重置，满足“无论处于离线或在线模式均可正常使用个人数据库工作台”的规定。

**C1_1_2 顶栏融合架构：左侧视图切换栏与右侧全局搜索框（含 IME 保护与快捷键）**

- 状态：已完成
- 需求描述：进入个人数据库页面时，在全局顶栏左侧（`Emibot |` 右侧）嵌入分类视图切换栏（`资料 / 切片 / 对话归档 / 未来视图`），替代单纯页面标题文字；在顶栏右侧嵌入全局搜索框（移除冗余的“个人数据库 / 切片”路径面包屑），支持跨资料、切片、对话实时检索下拉预览、快捷键聚焦及中文输入法（IME）无损输入。
- 详细方案设计：
  1. 全局顶栏 DOM 结构扩展（`Assistant/web/index.html` 与 `Assistant/web/css/database.css`）：
     - 在 `.app-header` 中：
       - 紧随 `.app-header__divider` 与 `#page-title` 之后挂载个人数据库专属视图切换栏（默认 `hidden`）：
         ```html
         <nav class="db-header-tabs" id="db-header-tabs" aria-label="个人数据库视图切换" hidden>
           <button class="db-header-tabs__btn" type="button" data-db-view="docs">资料</button>
           <button class="db-header-tabs__btn is-active" type="button" data-db-view="chunks">切片</button>
           <button class="db-header-tabs__btn" type="button" data-db-view="chats">对话归档</button>
           <span class="db-header-tabs__placeholder" aria-disabled="true">未来视图</span>
         </nav>
         ```
       - 在 `.app-header__spacer` 右侧、`.mode-toggle` 左侧挂载个人数据库全局搜索组件（默认 `hidden`）：
         ```html
         <div class="db-search" id="db-header-search" hidden>
           <div class="db-search__input-wrap">
             <svg class="db-search__icon" viewBox="0 0 24 24" aria-hidden="true"><use href="#icon-search"></use></svg>
             <input
               class="db-search__input"
               id="db-search-input"
               type="search"
               placeholder="搜索资料、切片、对话 (Ctrl+K)"
               autocomplete="off"
               aria-label="搜索资料、切片、对话"
             >
           </div>
           <div class="db-search__dropdown" id="db-search-dropdown" role="listbox" hidden></div>
         </div>
         ```
     - 路由显隐联动：当路由进入 `#/database` 时，`pageTitleEl.hidden = true`，`dbHeaderTabsEl.hidden = false`，`dbHeaderSearchEl.hidden = false`（顶栏左侧呈现 `Emibot | 资料 / 切片 / 对话归档 / 未来视图`，右侧呈现全局搜索框）；当路由切往其他页面时，恢复 `pageTitleEl.hidden = false`，并将 `dbHeaderTabsEl` 与 `dbHeaderSearchEl` 置为 `hidden`（同时清空下拉浮层）。
  2. 顶栏视觉与 AstrBot 深色风格适配（`database.css`）：
     - `.db-header-tabs` 采用紧凑水平排列（`display: inline-flex; align-items: center; gap: 4px;`）；
     - `.db-header-tabs__btn`：高度 `32px`，内边距 `0 12px`，圆角 `var(--radius-sm)`，字号 `var(--text-base)`，默认文字颜色 `var(--color-text-secondary)`，悬停背景 `var(--color-surface-hover)`；激活态 `.is-active` 使用 `background-color: var(--color-primary-soft); color: var(--color-primary); font-weight: 500;`；
     - `.db-header-tabs__placeholder`（`未来视图`）：高度 `30px`，内边距 `0 10px`，采用 `1px dashed var(--color-border-strong)` 虚线边框，文字颜色 `var(--color-text-dim)`，字号 `var(--text-sm)`，`cursor: default; user-select: none;`，预留未来视图扩展心智；
     - `.db-search`：宽度 `clamp(200px, 26vw, 340px)`，输入框背景 `var(--color-bg)`，边框 `1px solid var(--color-border)`，聚焦时 `border-color: var(--color-primary); box-shadow: 0 0 0 2px var(--color-primary-softer);`。
  3. 根治原型输入框中文输入 Bug 与实时下拉检索逻辑（`views/database.js`）：
     - **缺陷根因修复**：原型在每次 `oninput` 时重写整个 `#app.innerHTML`，导致 `<input>` 节点在敲击每个字母时被销毁重建，直接打断中文拼音输入法（IME）组合状态并造成失焦或只能输入异常字符。本设计中 `#db-search-input` 作为常驻 DOM 节点挂载在 `.app-header` 内，**在任何检索或视图重绘过程中绝不销毁或替换该 `<input>` 节点**；
     - **IME 组合态保护**：监听 `#db-search-input` 的 `compositionstart`（设置 `isComposing = true`）与 `compositionend`（设置 `isComposing = false` 并立即执行一次检索渲染）；在 `input` 事件中若 `isComposing === true` 则直接返回，待拼音选词上屏后再更新检索结果；
     - **分组检索与安全 DOM 渲染**：
       - 将 `query = inputEl.value.trim().toLowerCase()` 存入 `dbState.searchQuery`；若 `query === ''`，将 `#db-search-dropdown` 置为 `hidden`；
       - 若 `query` 非空，按三组依次匹配（忽略大小写子串匹配）：
         ① `资料`：匹配 `doc.name` 或 `doc.text`，渲染条目显示 `doc.name`；
         ② `切片`：匹配 `chunk.text`，渲染条目显示前 40 个字符预览；
         ③ `对话`：遍历 `archivedSessions` 匹配 `msg.text`，渲染条目显示 `{session.title}：{msg.text 前 30 字符}`；
       - 使用 `dom.js` 的 `el()` 与 `textContent` 构建 `.db-search__group-title` 与 `.db-search__item`（严禁 `innerHTML`）；若三组均无命中，渲染空提示 `.db-search__empty`：`没有找到“${rawQuery}”相关内容。换个关键词试试。`；
     - **点击跳转与快捷键**：
       - 点击下拉结果项时，调用未保存修改守卫 `guardUnsavedChanges(() => { ... })`：切换到目标视图（`docs` / `chunks` / `chats`）、清除 `filterDocId = null`、选中目标条目 ID、清空搜索框并关闭下拉浮层；
       - 全局监听 `Ctrl+K` / `Cmd+K`（当处于 `#/database` 路由时阻止默认行为并调用 `dbSearchInputEl.focus()` 与 `select()`）；按 `Escape` 键或点击 `.db-search` 外部区域时关闭下拉浮层。

**C1_1_3 双栏工作区骨架与条目列表栏收起/展开交互（对齐对话页）**

- 状态：已完成
- 需求描述：个人数据库主体区采用与对话页一致的“左侧可收起条目列表栏 + 右侧详情编辑与溯源面板”双栏布局；列表栏底部设“收起列表”按钮，收起后展开按钮显示在 `72px` 主导航栏最底部，且在窗口宽度 `< 1024px` 时自动收起。
- 详细方案设计：
  1. 双栏工作区 DOM 结构（`views/database.js` 与 `database.css`）：
     - `#view-database` 设置为 `max-width: 100%; padding: 0; margin: 0; height: 100%; display: flex; flex-direction: row; overflow: hidden;`（与 `.view--chat` 完全对齐）；
     - 左侧条目列表栏 `<aside class="db-sidebar" id="db-sidebar" aria-label="数据库条目列表">`：
       - 宽度 `var(--layout-session-width)`（`240px`，或桌面端 `260px`），背景 `var(--color-surface)`，右侧边框 `1px solid var(--color-border-sidebar)`；
       - 内部由三部分构成：顶部栏 `.db-sidebar__header`（显示当前分类名称与操作按钮）、中部滚动列表区 `.db-sidebar__list`（`flex: 1; overflow-y: auto;`）、底部收起操作区 `.db-sidebar__footer`（内含 `#collapse-db-btn`“收起列表”按钮）；
     - 右侧详情主区域 `<div class="db-main" id="db-main">`：
       - `flex: 1; min-width: 0; height: 100%; overflow-y: auto; background-color: var(--color-bg);`；
       - 内部详情容器 `.db-detail` 最大宽度 `860px`，内边距 `var(--space-6) clamp(16px, 4vw, 44px)`，在滚动视口内居中或自然展开。
  2. 列表栏收起/展开与主侧栏底部按钮复用机制：
     - 当点击 `.db-sidebar__footer` 中的“收起列表”按钮时：
       - 将 `dbState.isSidebarCollapsed` 置为 `true`，为 `#db-sidebar` 添加 `.is-collapsed` 类（`width: 0 !important; opacity: 0; pointer-events: none; border-right-width: 0;`）；
       - 显示主侧栏最底部的 `#expand-sessions-btn` 按钮，并将其 `title` 与 `aria-label` 动态更新为 `"展开列表"`；
     - 当在 `#/database` 路由下点击主侧栏底部的 `#expand-sessions-btn` 时：
       - 将 `dbState.isSidebarCollapsed` 置为 `false`，移除 `#db-sidebar` 的 `.is-collapsed` 类，并隐藏 `#expand-sessions-btn`；
     - 响应式自适应：监听窗口尺寸变化（`< 1024px` 平板/小屏断点），进入小屏时自动将列表栏收起，释放右侧详情编辑空间；切换到 `#/mail`、`#/device`、`#/settings` 等非双栏路由时自动隐藏 `#expand-sessions-btn`。

---

##### C1.2 资料与切片可视化增删改查界面

**C1_2_1 资料与切片列表渲染、本地文件导入切分与来源筛选胶囊**

- 状态：已完成
- 需求描述：在左侧列表栏支持“资料”与“切片”视图渲染；“资料”视图顶部提供“导入资料”按钮支持选择本地文件并自动切分段落生成切片；“切片”视图支持按来源资料筛选并展示可一键清除的筛选胶囊。
- 详细方案设计：
  1. 列表栏头部与导入入口（`views/database.js`）：
     - `.db-sidebar__header` 左侧显示当前视图名称（`资料` / `切片` / `对话归档`），右侧在 `activeView === 'docs'` 时挂载 `<button class="db-btn db-btn--sm" id="db-import-btn" type="button">导入资料</button>`，关联隐藏的 `<input type="file" id="db-file-input" multiple hidden accept=".pdf,.docx,.xlsx,.pptx,.txt,.md,.py,.json,.js,.ts,.html,.css,.java,.c,.cpp,.go,.sh,.yaml,.sql">`；
  2. 本地文件导入与自动段落切分（C1.0 前端状态机）：
     - 用户选择本地文件后，遍历文件列表：
       - 创建新资料条目 `{ id: 'd' + nextId++, name: file.name, time: '刚刚导入', text: '解析中…' }` 插入 `dbState.docs` 头部，自动切至 `docs` 视图并选中该资料；
       - 若为纯文本/代码类文件（`.txt`, `.md`, `.py`, `.json`, `.js`, `.ts`, `.html`, `.css`, `.java`, `.c`, `.cpp`, `.go`, `.sh`, `.yaml`, `.sql`），使用 `FileReader.readAsText(file, 'utf-8')` 读取真实文件内容；
       - 若为二进制文档类（`.pdf`, `.docx`, `.xlsx`, `.pptx`），在 C1.0 纯前端阶段生成结构化演示解析文本（C2.2 阶段对接后端解析器落盘）；
       - 解析完成后更新 `doc.text`，调用 `splitTextToParagraphs(doc.text)`（按 `/\n\n+/` 拆分并过滤空白段）为每段生成 `{ id: 'c' + nextId++, docId: doc.id, paraIndex: i, text: para }` 写入 `dbState.chunks`，弹出轻提示 Toast：`已导入 ${file.name}`；
  3. 列表条目与筛选胶囊渲染：
     - **资料列表项（`docs`）**：主标题加粗单行省略显示 `doc.name`，副标题显示 `${chunkCount} 个切片，${doc.time}`；无资料时渲染空状态：`还没有资料。导入一份文件，开始建立你的个人数据库。`；
     - **切片列表项（`chunks`）**：
       - 若 `dbState.filterDocId` 非空，在列表顶部渲染可点击的筛选胶囊 `<button class="db-filter-chip" type="button">来自：${docName} ×</button>`，点击后将 `filterDocId` 重置为 `null` 并刷新列表；
       - 每个切片项主标题单行省略显示 `chunk.text`，副标题显示 `来自 ${doc ? doc.name : '已删除资料'}`；无切片时渲染空状态：`这里还没有切片。`；
     - 当前选中项挂载 `.is-active` 高亮样式（主色左边框或柔和主色底 `var(--color-primary-soft)`）。

**C1_2_2 详情编辑器、精准未保存脏状态守卫（Dirty Guard）与双向联动保存**

- 状态：已完成
- 需求描述：右侧详情面板提供自适应高度文本编辑器、未保存状态指示与保存/删除按钮；仅当文本实际发生改动时触发“未保存”标记与离开拦截弹窗；保存“资料”或“切片”时自动执行双向联动更新。
- 详细方案设计：
  1. 详情面板头部与编辑器（`views/database.js` 与 `database.css`）：
     - 头部 `.db-detail__header`：左侧 `<h2>` 显示标题（资料视图为 `doc.name`，切片视图为 `切片`，对话归档视图为 `${msg.role}消息`）；右侧操作组包含状态标签 `<span class="db-detail__status" id="db-dirty-status"></span>`、主按钮 `<button class="db-btn db-btn--primary" id="db-save-btn" type="button">保存</button>` 与危险按钮 `<button class="db-btn db-btn--danger" id="db-delete-btn" type="button">删除</button>`；
     - 编辑器区：小标题提示（`解析文本，可直接编辑` / `切片内容，可直接编辑` / `消息内容，可直接编辑`），下方挂载 `<textarea class="db-editor" id="db-editor"></textarea>`；
     - 自适应高度：在填充初始内容及 `input` 事件中执行 `editorEl.style.height = 'auto'; editorEl.style.height = (editorEl.scrollHeight + 2) + 'px';`，且在用户输入期间**绝不重建 `<textarea>` 节点**；
  2. 精准脏状态判定与未保存离开拦截（修复原型误拦 Bug）：
     - 判定函数 `isDirty()`：当且仅当 `dbState.draftText !== null && currentItem && dbState.draftText !== currentItem.text` 时为 `true`；若用户修改后又将文字改回与原文完全一致，自动将 `dbState.draftText` 置回 `null` 并隐藏“未保存”提示；
     - 守卫函数 `guardUnsavedChanges(actionFn)`：当用户在 `isDirty()` 为 `true` 时尝试切换左侧列表条目、切换顶栏视图 Tab、点击搜索结果跳转或点击溯源链接跳转时，弹出深色确认模态框：
       - 标题：`放弃未保存的修改？`
       - 描述：`当前内容还没有保存，离开后修改会丢失。`
       - 按钮：`取消`（留在当前编辑页）与红色 `放弃修改`（清空 `draftText = null` 并执行 `actionFn()`）；
  3. 资料与切片双向联动保存机制（修复原型数据脱节 Bug）：
     - 监听点击“保存”按钮或键盘 `Ctrl+S` / `Cmd+S`（阻止浏览器默认保存网页行为）：
       - 若 `!isDirty()`，弹出轻提示 Toast：`没有需要保存的修改`；
       - **当在“资料”（`docs`）视图保存时**：
         ① 将 `doc.text` 更新为 `dbState.draftText`；
         ② **正向联动重切分**：调用 `splitTextToParagraphs(doc.text)` 获取最新段落数组 `newParas`；基于 `doc.id` 重建该资料在 `dbState.chunks` 中的切片序列（同 `paraIndex` 优先复用原有切片 `id` 以保持选中态稳定，新增段落分配新 `id`，多余旧段落移除）；
       - **当在“切片”（`chunks`）视图保存时**：
         ① 将 `chunk.text` 更新为 `dbState.draftText.trim()`；
         ② **反向联动回写原资料**：查找所属原资料 `doc = findDoc(chunk.docId)`；若存在，将 `doc.text` 按段落拆开，把第 `chunk.paraIndex` 段替换为修改后的 `chunk.text`（若修改后的切片自身包含双换行，则同步重排该资料的段落与切片索引），再用 `\n\n` 拼接写回 `doc.text`；
         ③ 保存完成后立即重绘右侧详情底部的“溯源”卡片，使溯源高亮段落即时反映最新修改的内容，彻底消除原型中修改切片后溯源区仍显示旧文本或报错“原文已修改，无法定位这个切片”的逻辑漏洞；
       - 重置 `dbState.draftText = null`，弹出轻提示 Toast：`已保存`。

**C1_2_3 溯源上下文高亮预览、跨视图双向跳转与删除二次确认**

- 状态：已完成
- 需求描述：在资料详情展示切片统计与“查看这些切片”跳转入口；在切片详情展示来源资料名称、前后文段落与当前段落高亮，并提供“打开原资料”跳转入口；删除资料或切片时弹出深色二次确认模态框。
- 详细方案设计：
  1. 资料详情底部切片关联卡片：
     - 在编辑器下方渲染 `.db-source-card`：`已切成 ${n} 个切片。` 搭配动作链接 `<button class="db-link" type="button" data-action="view-doc-chunks">查看这些切片</button>`；
     - 点击“查看这些切片”（经 `guardUnsavedChanges` 校验后）：切换顶栏视图至 `'chunks'`，设置 `dbState.filterDocId = doc.id`，并将选中项设为该资料的第一个切片。
  2. 切片详情底部溯源上下文卡片：
     - 小标题 `溯源`，内部渲染 `.db-source-card`：
       - 若原资料已被删除：显示提示 `原资料已被删除，无法定位原文。`；
       - 若原资料存在且段落可定位：
         ① 顶部显示加粗文件名与段落号：`${doc.name}，第 ${chunk.paraIndex + 1} 段`；
         ② 摘录上下文段落 `[paraIndex - 1, paraIndex, paraIndex + 1]` 中存在的段落，每段渲染为 `<p class="db-source__para">`，其中当前切片对应的 `paraIndex` 段落内部包裹 `<mark class="db-source__mark">`（采用深色主题友好的暖金/主色半透明高亮底色，文字清晰可读）；
         ③ 底部提供动作链接 `<button class="db-link" type="button" data-action="open-source-doc">打开原资料</button>`，点击后（经 `guardUnsavedChanges` 校验）切换顶栏视图至 `'docs'` 并选中 `doc.id`。
  3. 预留扩展区与删除二次确认弹窗：
     - 三个视图的详情面板最底部均渲染虚线预留卡片 `.db-future-slot`：`预留扩展区：标签、关联、备注等后续功能可以挂在这里`；
     - 点击详情头部“删除”按钮时，调用通用深色确认弹窗：
       - **删除资料**：标题 `删除这份资料？`，文案 `资料及其 ${n} 个切片都会被删除，无法恢复。`；确认后从 `dbState.docs` 移除该资料，同时从 `dbState.chunks` 级联移除所有 `docId === doc.id` 的切片（若 `filterDocId === doc.id` 则重置为 `null`），选中相邻资料或 `null`，弹出 Toast `已删除`；
       - **删除切片**：标题 `删除这个切片？`，文案 `这个切片会被删除，原资料不受影响。`；确认后从 `dbState.chunks` 移除该切片，选中相邻切片或 `null`，弹出 Toast `已删除`。

---

##### C1.3 在线历史消息直接修改与删除界面

**C1_3_1 对话归档按会话折叠列表与所属会话上下文联动面板**

- 状态：已完成
- 需求描述：在个人数据库“对话归档”视图中，左侧列表按会话分组并支持点击会话标题折叠/展开消息列表；右侧详情面板展示选中消息的编辑器以及“所属会话”完整消息上下文列表，支持在上下文列表中直接点击切换选中消息。
- 详细方案设计：
  1. 左侧会话分组折叠列表（`views/database.js`）：
     - 当 `activeView === 'chats'` 时，遍历 `dbState.archivedSessions`：
       - 若 `archivedSessions` 为空，渲染空状态：`暂无已保存的在线对话。`；
       - 对每个会话渲染分组头部 `<button class="db-group-header" type="button" data-session-id="${session.id}">`，显示折叠指示符（折叠时 `▸ `，展开时 `▾ `）与 `session.title`；点击头部切换 `dbState.foldedSessions[session.id]` 布尔值并局部重绘列表；
       - 当会话处于展开态时，依次渲染该会话下的消息行 `.db-list-item`：主标题加粗单行省略显示 `${msg.role}：${msg.text}`，副标题显示消息时间 `msg.time`；
  2. 右侧消息详情与所属会话上下文列表：
     - **空指针防护（修复原型崩溃 Bug）**：查询当前选中消息 `findMessageWithSession(dbState.selectedIds.chats)`；若未找到（例如列表为空或选中 ID 失效），安全回退渲染右侧空状态 `从左侧选择一项查看详情。`，杜绝原型中直接访问 `[0].s` 引发的未捕获空指针异常；
     - 若命中选中消息 `{ msg, session }`：
       - 详情头部标题显示 `${msg.role}消息`（如 `用户消息` 或 `Agent消息`），右侧配“未保存”指示、“保存”与“删除”按钮；
       - 第一分区（`消息内容，可直接编辑`）：挂载自适应高度 `<textarea class="db-editor">`，绑定 `msg.text`；
       - 第二分区（`所属会话：${session.title}`）：在 `.db-session-context` 容器中按顺序渲染该会话的全部消息卡片 `.db-session-msg`（显示 `${m.role}：${m.text}`），当前选中的消息挂载 `.is-active` 高亮样式；点击同会话内的其他消息卡片时，经过 `guardUnsavedChanges` 校验后直接将 `dbState.selectedIds.chats` 切换至该消息并刷新详情面板；
       - 第三分区：挂载 `.db-future-slot` 预留扩展区。

**C1_3_2 历史消息内容编辑保存、单条删除二次确认与空会话自动清理**

- 状态：已完成
- 需求描述：在个人数据库“对话归档”详情面板中支持修改单条历史消息并保存，支持二次确认后删除单条历史消息（会话内消息删空时自动移除该空会话）；对话页（`#/chat`）的消息气泡保持简洁，不增设单条编辑与删除入口。
- 详细方案设计：
  1. 历史消息编辑保存：
     - 在“对话归档”详情编辑器中修改消息文本后点击“保存”（或按 `Ctrl+S` / `Cmd+S`）：
       - 将 `msg.text` 更新为 `dbState.draftText`；
       - 重置 `dbState.draftText = null`；
       - 同步刷新左侧会话分组下的消息摘要行与右侧“所属会话”上下文列表中的对应条目，弹出轻提示 Toast：`已保存`；
  2. 历史消息单条删除与空会话清理：
     - 点击详情头部“删除”按钮时，弹出深色确认模态框：
       - 标题：`删除这条消息？`
       - 描述：`这条消息会从已保存的对话中删除，无法恢复。`
       - 按钮：`取消` 与红色 `删除`；
     - 用户点击确认“删除”后：
       - 从所属会话 `session.msgs` 中移除该消息；
       - **空会话自动清理**：过滤 `dbState.archivedSessions`，自动移除 `session.msgs.length === 0` 的空会话；
       - 自动选中剩余归档消息列表中相邻的一条消息（若已无任何归档消息则置为 `null`），重置 `dbState.draftText = null`，弹出轻提示 Toast：`已删除`；
  3. 界面职责边界：
     - 历史对话消息的单条内容修改与单条删除入口收敛于个人数据库工作台的“对话归档”视图中；对话主窗口（`#/chat`）的气泡底部元信息栏仅保留时间戳与一键复制按钮（B1.12），不叠加编辑与删除按钮，保证日常对话界面的专注与整洁。

