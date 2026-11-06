# Emibot

<!-- 文档职责：回答"这是什么、怎么跑起来"。
     只写项目一句话简介、运行命令、目录概览、文档导航。
     不写需求细节、不写技术决策（那些在 Intent.md / Spec.md）。 -->

## 简介

一个用于学习 Agent 工作原理的可视化工作台：在网页中与 Agent 对话，后续逐步加入个人数据库、Mail 管理、手机端联动与配置等模块。第一版为 mock 回复的骨架版本。

## 当前状态

已实现应用外壳与导航（`feature/app-shell`）：支持本地启动服务、访问健康检查接口、加载深色工作台外壳、切换五项哈希路由及查看四个预留占位页。

## 运行方式

在项目根目录 `D:\desk\jyy\Lab1` 的 PowerShell 中执行以下步骤：

1. 创建 Python 3.12 虚拟环境并安装依赖（首次运行执行一次）：

```powershell
py -V:Astral\CPython3.12.13 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

2. 启动后端与静态托管服务（可直接双击打开根目录下的 `start.bat` 自动启动并弹出默认浏览器，或执行以下命令）：

```powershell
.\.venv\Scripts\python.exe -m Assistant
```

3. 在浏览器打开 `http://127.0.0.1:8000/` 访问工作台，或访问 `http://127.0.0.1:8000/api/health` 查看健康检查状态。
4. 若默认端口 `8000` 被占用，可在启动前设置环境变量 `$env:ASSISTANT_PORT=8001` 更换端口。

## 目录概览

```
Lab1/
├── Assistant/       应用代码（Python 后端 + 原生前端静态文件）
├── requirements.txt Python 直接依赖声明
├── start.bat        一键启动脚本（启动服务并自动弹出默认浏览器）
├── Intent.md        为什么做、做什么、不做什么
├── Spec.md          具体怎么实现
├── Memory.md        做到哪了、学到了什么
└── README.md        这是什么、怎么跑起来
```

## 文档导航

| 文档 | 回答的问题 |
|---|---|
| [Intent.md](Intent.md) | 为什么做、做什么、不做什么（目标、范围、不做清单、验收标准） |
| [Spec.md](Spec.md) | 具体怎么实现（目录结构、模块划分、接口定义、命名约定） |
| [Memory.md](Memory.md) | 做到哪了、学到了什么（当前状态、已做决定及理由、踩坑、下一步） |

## 验收

第一版的功能验收由主 Agent 或用户依据 Intent.md 与 Spec.md 中的验收清单逐条执行，验收通过后再合并回 `main`。
