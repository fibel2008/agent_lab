# 知识库操作指南与配置手册

## 1. 概述与适用范围
本文档用于指导智能问答助手的文本类附件解析流程，包含 Markdown 标题、任务列表、代码块与表格数据测试。

> [!NOTE]
> 本文件专属校验标记：**暗号：玄冰雪鸮 (Glacier Owl)**

## 2. 核心功能检查清单
- [x] 支持标准 UTF-8 编码读取
- [x] 支持 Markdown 结构完整保留
- [x] 支持模型调用工具时注入上下文
- [x] 支持多附件组合提问

## 3. 示例配置表
| 环境变量 | 默认值 | 作用说明 |
| :--- | :--- | :--- |
| `MAX_ATTACHMENT_SIZE` | `5242880` | 单文件最大体积（5MB） |
| `MAX_ATTACHMENT_COUNT` | `3` | 单次消息支持上传的最大附件数 |
| `ATTACHMENT_TEXT_TRUNCATE_LIMIT` | `10000` | 超长文本自动截断上限（字符数） |

```python
# 验证代码示例
def verify_passphrase():
    return "暗号：玄冰雪鸮 (Glacier Owl)"
```
