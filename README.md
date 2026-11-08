# Emibot

## 一、项目简介

**Emibot** 是一个用于学习、探索 Agent 运行机制与交互范式的轻量级可视化 AI 工作台。项目支持在离线 Mock 模拟与在线真实大模型（基于 ReAct 推理-行动-观察循环）之间无缝切换，并提供后台解耦的异步流式生成、本地 SQLite 会话持久化，以及纯原生、零外部构建依赖的深色主题 Web 交互界面。

---

## 二、目录概览

> 注：目录结构基于本地实际工程布局整理，涵盖核心应用源码、测试套件与规范文档。

```text
Lab1/
├── Assistant/                         # 核心应用源码包（后端服务 + 原生前端静态托管）
│   ├── agent/                         # Agent 核心逻辑、ReAct 推理引擎与工具层
│   │   ├── tools/                     # 工具抽象与注册中心
│   │   │   ├── __init__.py            # 工具模块导出声明
│   │   │   ├── base.py                # BaseTool 抽象基类与 ToolCall 数据结构
│   │   │   └── registry.py            # 统一工具注册中心与分发逻辑
│   │   ├── __init__.py                # Agent 模块导出声明
│   │   ├── base.py                    # Agent 基础抽象协议与 ChatMessage 消息模型
│   │   ├── errors.py                  # Agent 运行期异常体系定义
│   │   ├── factory.py                 # Agent 工厂：统一模式判定与实例分发
│   │   ├── llm_client.py              # OpenAI 兼容协议异步流式 HTTP 客户端
│   │   ├── mock_agent.py              # 离线模拟 Mock Agent 实现
│   │   ├── online_agent.py            # 在线真实大模型 Agent 实现
│   │   ├── react.py                   # ReAct（思考-行动-观察）循环推理引擎
│   │   └── task_manager.py            # 后台解耦异步生成任务管理器
│   ├── api/                           # HTTP RESTful API 路由与契约
│   │   ├── __init__.py                # API 路由聚合与导出
│   │   ├── chat.py                    # 对话交互与生成任务中断控制接口
│   │   ├── config_status.py           # 环境变量与配置状态脱敏检测接口
│   │   ├── health.py                  # 基础健康检查接口（GET /api/health）
│   │   ├── schemas.py                 # Pydantic 请求、响应与事件数据模式
│   │   └── sessions.py                # 会话管理与历史消息 CRUD 接口
│   ├── storage/                       # 本地异步持久化层
│   │   ├── __init__.py                # 存储模块导出声明
│   │   ├── db.py                      # SQLite 异步连接池、WAL 模式配置与自动建表
│   │   └── session_store.py           # 会话与消息的异步仓储实现
│   ├── web/                           # 原生前端单页应用（SPA，零打包构建依赖）
│   │   ├── css/                       # 模块化样式系统
│   │   │   ├── base.css               # 全局重置、排版基底与无障碍适配
│   │   │   ├── chat.css               # 对话工作区布局、消息气泡与工具展示排版
│   │   │   ├── components.css         # 按钮、模态弹窗、状态圆点与开关组件样式
│   │   │   ├── layout.css             # 顶栏、可折叠侧边栏与整体网格布局
│   │   │   └── tokens.css             # 全局设计令牌（颜色、间距、圆角与断点）
│   │   ├── js/                        # 原生 ES 模块前端脚本
│   │   │   ├── views/                 # 页面视图控制器
│   │   │   │   ├── chat.js            # 对话主视图：会话流转、流式渲染与工具链卡片
│   │   │   │   └── placeholder.js     # 预留扩展模块占位视图
│   │   │   ├── api.js                 # 后端 REST API 客户端与流式通信封装
│   │   │   ├── dom.js                 # DOM 操作辅助库与时间戳格式化
│   │   │   ├── icons.js               # SVG 图标 Symbol ID 常量定义
│   │   │   ├── main.js                # 前端主启动入口：路由初始化与组件装配
│   │   │   ├── markdown.js            # 轻量零依赖安全 Markdown 解析与渲染器
│   │   │   ├── router.js              # Hash 路由解析器与侧边栏折叠控制器
│   │   │   ├── routes.js              # 页面路由与主侧栏导航配置源
│   │   │   └── store.js               # 双形态（离线内存/在线持久化）前端状态中心
│   │   └── index.html                 # 单页 HTML 宿主外壳与内联 SVG 图标库
│   ├── __init__.py                    # Python 应用包标识
│   ├── __main__.py                    # 命令行模块启动入口（python -m Assistant）
│   ├── app.py                         # FastAPI 顶层装配（路由挂载、静态托管与生命周期）
│   └── config.py                      # 全局配置读取中心与统一日志系统
├── tests/                             # 自动化测试用例套件
│   ├── __init__.py                    # 测试包标识
│   ├── test_generation_decoupling.py  # 异步生成任务解耦与流式广播单元测试
│   └── test_online_react_agent.py     # 在线 ReAct Agent 推理循环与工具调用测试
├── .env.example                       # 环境变量配置模板（模型 API Key/Base URL/Port 等）
├── .gitignore                         # Git 版本管理忽略规则
├── Intent.md                          # 需求意图与边界说明书（为什么做、做什么、不做什么）
├── Memory.md                          # 阶段演进、关键架构决策与避坑复盘笔记
├── README.md                          # 项目说明文档（简介、目录概览、文件导航）
├── requirements.txt                   # Python 核心依赖声明文件
├── Spec.md                            # 技术实现规格说明书（架构设计、模块划分与数据契约）
└── start.bat                          # Windows 平台一键启动并打开浏览器的批处理脚本
```

---

## 三、文件导航

### 1. 规范与配置文档

| 文件 | 职责类型 | 核心定位与回答的问题 |
|---|---|---|
| [Intent.md](Intent.md) | 需求与边界说明 | **为什么做、做什么、不做什么**：定义产品目标、阶段边界、需求条目与验收基线 |
| [Spec.md](Spec.md) | 架构与实现规格 | **具体怎么实现**：模块分层设计、接口参数、数据模型、状态机流转与执行细节 |
| [Memory.md](Memory.md) | 演进与经验沉淀 | **做到哪了、学到了什么**：开发过程记录、架构决策依据、问题复盘与踩坑规避 |
| [.env.example](.env.example) | 配置样例模板 | **系统环境如何配置**：提供在线大模型 API 凭证、服务监听端口等配置参考 |
| [requirements.txt](requirements.txt) | 依赖清单声明 | **运行需要哪些依赖**：明确 FastAPI、Uvicorn、httpx、aiosqlite 等直接依赖版本 |

### 2. 核心源码与关键入口

| 关键文件 | 所在分层 | 核心职责说明 |
|---|---|---|
| [Assistant/app.py](Assistant/app.py) | 服务接入层 | FastAPI 应用总装配点，负责静态托管、中间件配置、路由注册与生命周期管理 |
| [Assistant/config.py](Assistant/config.py) | 系统配置层 | 系统唯一配置读取点，解析环境变量并初始化全局统一日志体系 |
| [Assistant/agent/factory.py](Assistant/agent/factory.py) | 核心调度层 | Agent 实例化工厂，统一调度 Mock Agent 与 Online Agent 的模式选择 |
| [Assistant/agent/react.py](Assistant/agent/react.py) | 算法推理层 | 驱动大模型进行 Thought（思考）- Action（行动）- Observation（观察）的 ReAct 循环引擎 |
| [Assistant/agent/task_manager.py](Assistant/agent/task_manager.py) | 任务调度层 | 消息生成与网络连接解耦调度器，负责后台长任务生命周期管理与事件广播 |
| [Assistant/api/chat.py](Assistant/api/chat.py) | 接口契约层 | 提供对话交互、异步生成订阅触发及任务强行中断控制 |
| [Assistant/storage/db.py](Assistant/storage/db.py) | 数据持久层 | 异步 SQLite 连接池管理、WAL 模式开启及数据库 Schema 自动迁移初始化 |
| [Assistant/web/index.html](Assistant/web/index.html) | 前端视图层 | 原生单页应用骨架，挂载顶层容器并内嵌全量 SVG 矢量图标定义 |
| [Assistant/web/js/main.js](Assistant/web/js/main.js) | 前端逻辑层 | 前端启动引导器，初始化客户端 Store、绑定路由并触发首屏渲染 |
| [start.bat](start.bat) | 运维脚本层 | Windows 本地一键启动快捷脚本，自动拉起服务并在默认浏览器中唤起工作台 |
