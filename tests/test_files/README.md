# 附件系统端到端测试样本集

本目录提供了用于测试 EmiBot 附件上传、格式校验、多格式文本提取、多模态视觉识别及异常处理的全套测试文件。

---

## 1. 合格文件 (`valid/`)

所有文件大小均小于 5MB，且扩展名在系统白名单内。**每个合格文档均包含一句全局独一无二的专属暗号**，用于验证 Agent 工具调用 (`read_attachment`) 或视觉识别是否真正读取到了文档内部正文。

| 文件名 | 格式 | 专属暗号 | 预期测试行为 |
| :--- | :--- | :--- | :--- |
| `valid_image.png` | PNG | `暗号：蓝色企鹅 (Blue Penguin)` | 支持图片卡片渲染；视觉大模型直接识别画面暗号 |
| `valid_photo.jpg` | JPG | `暗号：赤色飞狐 (Crimson Fox)` | 支持图片缩略图预览；视觉大模型图文对话提取 |
| `valid_report.docx` | DOCX | `暗号：琥珀金狮 (Amber Lion)` | `parse_docx` 提取段落与表格，Agent 可读出暗号 |
| `valid_sheet.xlsx` | XLSX | `暗号：翡翠灵鹿 (Emerald Deer)` | `parse_xlsx` 提取多工作表单元格，Agent 可读出暗号 |
| `valid_slides.pptx` | PPTX | `暗号：紫晶猎鹰 (Amethyst Falcon)` | `parse_pptx` 提取各幻灯片文本框，Agent 可读出暗号 |
| `valid_document.pdf` | PDF | `暗号：蔚蓝鲸落 (Azure Whale)` | `parse_pdf` 提取内嵌文字流，Agent 可读出暗号 |
| `valid_guide.md` | MD | `暗号：玄冰雪鸮 (Glacier Owl)` | `parse_text_or_code` 提取 Markdown 格式内容 |
| `valid_notes.txt` | TXT | `暗号：烈焰火凤 (Blazing Phoenix)` | `parse_text_or_code` 提取纯文本内容 |
| `valid_script.py` | PY | `暗号：青铜苍狼 (Bronze Wolf)` | `parse_text_or_code` 提取代码与 docstring 内容 |

---

## 2. 不合格文件 (`invalid/`)

测试前端与后端对非法大小、不受支持扩展名的拦截与错误提示。

| 文件名 | 格式/特征 | 测试目标 | 预期拦截结果 |
| :--- | :--- | :--- | :--- |
| `oversized_payload_5.5mb.txt` | TXT (> 5.5MB) | 单文件超出 5MB 上限 | 拦截报错：`ATTACHMENT_TOO_LARGE`（单个文件大小不能超过 5MB） |
| `legacy_document.doc` | .doc (旧 Word) | 不在允许白名单的文档格式 | 拦截报错：`ATTACHMENT_TYPE_NOT_SUPPORTED` |
| `legacy_sheet.xls` | .xls (旧 Excel) | 不在允许白名单的表格格式 | 拦截报错：`ATTACHMENT_TYPE_NOT_SUPPORTED` |
| `legacy_presentation.ppt` | .ppt (旧 PPT) | 不在允许白名单的演示格式 | 拦截报错：`ATTACHMENT_TYPE_NOT_SUPPORTED` |
| `test_program.exe` | .exe (二进制程序) | 禁止上传的可执行程序 | 拦截报错：`ATTACHMENT_TYPE_NOT_SUPPORTED` |
| `archive_sample.zip` | .zip (压缩包) | 禁止上传的归档压缩包 | 拦截报错：`ATTACHMENT_TYPE_NOT_SUPPORTED` |

---

## 3. 特殊测试文件 (`special/`)

测试边界条件、异常文件编码、损坏与超长截断机制。

| 文件名 | 格式/特征 | 测试目标 | 预期解析行为 |
| :--- | :--- | :--- | :--- |
| `scanned_image_only.pdf` | 纯图片 PDF (无文字层) | 扫描件无法提取文字异常 | 返回友好提示：`[读取失败：该 PDF 文件为扫描版或纯图片型文档，当前系统仅支持文字版 PDF]` |
| `corrupted_renamed.docx` | 伪装文件 (txt 改名为 .docx) | 解压损坏/文件破损处理 | 捕获 `BadZipFile`，返回：`[读取失败：文件已加密、损坏或编码不受支持]` |
| `encrypted_protected.pdf` | 带密码的加密 PDF | 拒绝空密码解密 | 捕获加密异常，返回：`[读取失败：文件已加密、损坏或编码不受支持]` |
| `long_text_50k_words.txt` | 约 5 万字纯文本 (< 5MB) | 超长文本安全截断 | 正常上传；调用 `read_attachment` 时自动截断前 10,000 字符并附加截断声明 |

---

## 4. 自动化回归测试命令

在项目根目录下运行如下命令进行全量校验：

```bash
.venv\Scripts\python -m unittest tests/test_fixture_files.py
```
