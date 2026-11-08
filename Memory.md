# Memory：Emibot

<!-- 文档职责：供每次开工时"失忆"的 agent 和我自己阅读，在几十秒内知道：现在做到哪了、哪些规则必须遵守、哪些坑别再踩。只写当前状态、跨版本规则、踩过的坑。需求属于 Intent.md；接口规格、各版本的设计决定与理由属于 Spec.md，Memory 不重复存储；已发生的历史由 Git 记录，Memory 不保留。 -->

## 约定的修改规则

- agent 不得自行修改或违反任何约定。
- 开发中发现约定与新需求冲突时，agent 必须停下并向我报告，不得自行判断或悄悄绕开。
- 修改约定只能由我拍板，改后按以下规则处理旧条目：保留编号，标注"已废弃，由 Wx/Tx 替代"，不删除、不复用编号。

## 1. 项目快照

- **当前版本**：第二版（B1.0 在线对话与首个工具 `read_attachment`）
- **已完成范围**：A1.1–A1.9、A2.1–A2.7、A2.9、A3.2–A3.3、A4.1、A6.1–A6.11、B1.1–B1.12（A2.8、A3.1 已废弃）
- **进行中**：`feature/attachments-and-tools`（B1.13–B1.15，待验收）
- **下一个**：`feature/attachments-and-tools` 验收通过后合并回 `main`，随后进入第三版 C1.0 个人数据库工作台（分支名待 Spec 规划）
- **当前分支**：`feature/attachments-and-tools`
- **最近一次合并的分支**：`feature/chat-ux-enhancements`
- **指针**：各版本的设计与理由见 Spec.md 对应章节。

| 分支 | 覆盖需求 | 状态 | 已合并 main |
|---|---|---|---|
| `feature/app-shell` | A1.1–A1.9 | 已验收 | 是 |
| `feature/mock-agent` | A3.1–A3.3 | 已验收 | 是 |
| `feature/chat-window` | A2.1–A2.7、A2.9、A4.1 | 已验收 | 是 |
| `feature/session-list` | A6.1–A6.11 | 已验收 | 是 |
| `feature/storage-crud` | B1.1（部分）、B1.7、B1.9 | 已验收 | 是 |
| `feature/online-react-agent` | B1.2–B1.6 | 已验收 | 是 |
| `feature/generation-decoupling` | B1.8、B1.1（生成中切换中断） | 已验收 | 是 |
| `feature/chat-ux-enhancements` | B1.10–B1.12 | 已验收 | 是 |
| `feature/attachments-and-tools` | B1.13–B1.15 | 待验收 | 否 |

## 2. 工作约定（W）

W1 提交信息必须使用 Conventional Commits 格式。
理由：统一提交历史语义，便于回看功能演进与变更目的。
范围：仓库内所有 Git 提交。

W2 分支合并回 `main` 时必须使用 `--no-ff` 并保留原功能分支，禁止删除已合并分支。
理由：保留完整的分支合并拓扑轨迹，便于按阶段回溯功能演进节奏。
范围：所有合入 `main` 的功能分支合并操作。

W3 每次提交后必须立即推送当前分支至远端 `origin`，合并回 `main` 后必须立即推送 `main`。
理由：保持本地与远端实时同步，形成异地备份并保留完整提交轨迹。
范围：所有本地分支提交与 `main` 分支合并操作。

W4 编写任何业务代码前必须先建立并维护 `.gitignore`。
理由：防止虚拟环境、缓存、依赖目录与本地运行数据进入版本库。
范围：项目初始化及新增产生本地临时文件、数据目录或构建产物的所有阶段。

W5 需求编号（Intent）与实现规格编号（Spec）一经分配禁止更改或复用；条目废弃时必须保留原编号并标注"已废弃"。
理由：保证每条需求到实现子项的双向追踪链路稳定，清晰反映需求的增删演进轨迹。
范围：Intent.md 与 Spec.md 中的所有板块、需求及实现子项编号。

W6 必须遵循规范先行：新增需求或实现偏离 Spec 时，必须先更新 Spec.md，再编写或修改代码。
理由：确保每次编码都有明确、可验证的实现依据，杜绝代码与设计文档脱节。
范围：所有功能开发、架构调整与需求变更流程。

W7 主 Agent 只负责需求与设计文档维护及功能验收，禁止编写业务代码。
理由：保持需求定义、编码实现与功能验收三方职责分离，避免自说自话。
范围：主 Agent 在整个项目生命周期内的所有操作。

W8 项目根目录必须提供一键启动脚本 `start.bat`，服务必须在 `/api/health` 就绪后自动打开系统默认浏览器访问工作台。
理由：保证在文件夹中直接双击脚本即可启动服务并打开页面，且避免端口未就绪时浏览器出现连接失败页。
范围：项目启动入口与本地服务启动流程。

## 3. 技术约定（T）

T1 前端必须使用原生 HTML、CSS、JavaScript（ES Modules），禁止引入任何前端框架与构建工具。
理由：保持零构建的最短改动回路，避免工程化配置掩盖核心业务与 Agent 交互逻辑。
范围：前端 `Assistant/web/` 下的所有页面、样式与脚本文件。

T2 前端所有颜色必须集中定义为 CSS 变量并通过变量引用，禁止在组件样式中散落写死颜色值。
理由：保证全站深色工作台配色一致，并为后续扩展浅色主题预留集中替换点。
范围：`Assistant/web/css/` 下的所有样式文件及动态创建的 DOM 样式。

T3 渲染任何文本（含 Markdown、会话标题、模型输出、用户输入）严禁使用 `innerHTML`，必须使用 `textContent` 或纯 DOM 节点构建。
理由：彻底杜绝 XSS 注入风险，确保任何恶意 HTML 或脚本均只作为纯文本安全显示。
范围：前端所有渲染模型输出、会话标题与用户输入内容的位置。

T4 后端必须使用 FastAPI + Uvicorn，对话回复必须采用后端 SSE 真流式推送；替换底层模型或切换离线/在线实现时只允许修改 `agent/` 层，禁止改动 API 协议与前端渲染逻辑。
理由：统一单进程 ASGI 异步流式架构并隔离模型实现细节，确保前后端接口协议跨版本稳定。
范围：后端服务框架、流式对话接口及 `Assistant/agent/` 智能体执行层。

## 4. 踩坑库

### 环境与工具

- **Python 3.14 兼容性与 3.12 虚拟环境创建**
  - 现象：本机默认 Python 为 3.14，部分 Web 依赖兼容性未经确认；直接执行 `py -3.12` 报错 `No runtime installed`。
  - 原因：本机安装的 Python 3.12.13 在 Windows Python Launcher 中的注册名为 `Astral\CPython3.12.13`，而非默认标准标签。
  - 解法：固定使用 Python 3.12 建立独立虚拟环境，创建命令必须指定完整注册名：`py -V:Astral\CPython3.12.13 -m venv .venv`。

- **空目录无法被 Git 跟踪**
  - 现象：新建的空目录（如初始化时的 `Assistant/`）在 `git status` 中不显示，无法随提交入库。
  - 原因：Git 只跟踪文件，不跟踪空目录本身。
  - 解法：在空目录中放入首个业务文件（如 `__init__.py`）或 `.gitkeep` 占位文件后再提交。

- **不引入 httpx 时的接口冒烟验证**
  - 现象：在未安装 `httpx` 的阶段，无法使用 Starlette/FastAPI 的 `TestClient` 进行接口测试。
  - 原因：`TestClient` 底层强依赖 `httpx` 库。
  - 解法：在不额外引入测试依赖的阶段，通过启动后端服务子进程，配合 Python 标准库 `urllib.request` 发起真实 HTTP 请求完成接口与静态资源冒烟验证。

- **Windows 注册表导致 `.js` 静态模块被浏览器拒绝执行**
  - 现象：浏览器加载前端入口 `main.js` 时报 ES Modules MIME 校验错误并拒绝执行；仅加 `Cache-Control: no-cache` 后刷新仍命中 `304 Not Modified` 沿用错误 MIME 头。
  - 原因：Windows 注册表默认将 `.js` 的 Content-Type 设为 `text/plain`，Python `mimetypes` 读取注册表后导致 `StaticFiles` 返回 `text/plain`。
  - 解法：在 `app.py` 启动时显式调用 `mimetypes.add_type("text/javascript", ".js")`，并在静态资源中间件中剥离条件请求头、设置 `Cache-Control: no-store, no-cache, must-revalidate` 强制返回 `200 OK`。

- **FastAPI 0.115+ 与 Starlette 的 UploadFile 类型判定失效**
  - 现象：在 `request.form()` 解析多附件上传时，使用 `isinstance(item, fastapi.UploadFile)` 判定结果恒为 `False`，导致上传文件被全部过滤丢失。
  - 原因：FastAPI 0.115+ 中 `request.form()` 实际返回的是 `starlette.datastructures.UploadFile` 实例，并非 `fastapi.UploadFile` 的子类实例。
  - 解法：解析表单附件时禁止使用 `isinstance(item, fastapi.UploadFile)`，统一改用鸭子类型 `hasattr(item, "filename") and item.filename` 进行判定提取。

### 前端

- **flex-end + min-height 导致对话区无法向上滚轮查看历史**
  - 现象：消息增多溢出后，鼠标滚轮无法向上滚动回看历史消息，且初始空状态被挤压偏移并出现非预期滚动条。
  - 原因：滚动容器同时设置了 `flex-direction: column`、`justify-content: flex-end` 和 `min-height: 100%`，导致溢出内容进入负向滚动区。
  - 解法：移除 `justify-content: flex-end`，改用全宽自然流式块级滚动容器，配合 `calc((100% - 860px) / 2)` 水平居中边距，并在无消息空状态时隐藏空列表容器。

- **onMeta 先改消息 ID 导致流式增量无法实时上屏**
  - 现象：多会话流式响应时，消息卡片一直停留在三点等待动画，流式文字不实时显示，只有切走再切回重绘时才一次性出现。
  - 原因：`onMeta` 回调中先更新了内存里的 `agentMessage.id` 为服务端返回的 `message_id`，而 DOM 树上节点的 `data-message-id` 仍是客户端初始占位 ID，导致后续 `onDelta` 按新 ID 查找 DOM 节点返回 `null`。
  - 解法：在 `onMeta` 中先基于旧的初始占位 ID（`prevId`）定位 DOM 节点并同步更新其 `data-message-id` 属性；在 `onDelta` 中同时兼容新旧 ID 查找。

- **document.createElement('svg') 导致图标透明隐形**
  - 现象：动态创建的会话重命名铅笔图标与删除垃圾桶图标在页面上完全透明不显示，但占据布局空间。
  - 原因：使用 `document.createElement('svg')` 创建的是 `HTMLUnknownElement` 而非 `SVGElement`，浏览器不解析 SVG 命名空间及内部 `<use>` 引用。
  - 解法：在 `dom.js` 的节点创建工具中识别 SVG 标签集（`svg`、`use`、`path` 等），强制使用 `document.createElementNS("http://www.w3.org/2000/svg", tagName)`（或统一调用 `createSvgIcon`）。

- **标题按 UTF-16 码元截取导致 Emoji 截断乱码**
  - 现象：首条消息前 10 个字包含 Emoji 等辅助平面字符时，直接使用 `str.slice(0, 10)` 会生成残缺代理对乱码（``）。
  - 原因：JavaScript 的 `String.prototype.slice` 按 UTF-16 码元切分，一个 Emoji 占 2 个码元，在边界处会被劈成两半。
  - 解法：截取会话标题时必须按 Unicode 码点切分，统一使用 `Array.from(trimmed.replace(/\s+/g, ' ')).slice(0, 10).join('')`。

- **弹性侧栏子容器固定像素宽度导致窄屏右侧无声截断**
  - 现象：窗口进入窄屏断点（< 768px）侧栏缩窄为 180px 时，新建对话按钮右边框、底部收起按钮及会话条目右侧的重命名/删除按钮被完全裁剪进不可见死区。
  - 原因：仅父容器 `.session-sidebar` 设置了响应式 180px 宽度与 `overflow: hidden`，而内部直属子容器（header、list、footer）仍写死 `240px` 固定宽度。
  - 解法：所有纵向弹性侧栏的直属子容器与条目均必须显式声明 `width: 100%` 与 `box-sizing: border-box`，禁止在子容器写死父容器的桌面端像素宽度。

### 测试

- **Headless Edge 自动化测试命中扩展背景页或脚本未挂载竞态**
  - 现象：使用 Headless Edge 跑 CDP 端到端测试时，`/json` 返回的首个 target 经常是浏览器插件背景页导致选择器全部未命中；或页面刚打开立即执行脚本时因 ES Module 尚未挂载完成而产生假失败。
  - 原因：未隔离用户目录时 Edge 会加载宿主环境的全部扩展插件；且 `<script type="module">` 异步加载，DOM 渲染完成早于业务逻辑初始化完成。
  - 解法：启动 Headless Edge 时必须显式传入 `--user-data-dir=<临时目录>` 与 `--disable-extensions`，并在 `main.js` 初始化末尾设置 `window.__emibot_ready = true`，测试脚本必须显式等待该标记为真后再执行交互断言。

- **Windows 下异步测试结束后后台生成任务持有文件锁导致 WinError 32**
  - 现象：异步单元测试断言通过后，在 `tearDown` 清理临时 SQLite 数据库与附件目录时抛出 `PermissionError: [WinError 32] 另一个程序正在使用此文件`。
  - 原因：被测接口触发的 `TaskManager` 后台异步生成协程在测试函数返回时仍未结束，继续持有 SQLite 连接或临时文件句柄。
  - 解法：在异步测试基类的 `asyncTearDown` 中，清理临时目录前必须统一先执行 `await task_manager.shutdown()`，确保所有后台任务取消并释放文件句柄。
