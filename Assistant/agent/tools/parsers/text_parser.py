"""纯文本与代码文件解析器。"""

from pathlib import Path

from Assistant.config import ATTACHMENT_TEXT_TRUNCATE_LIMIT, logger


def parse_text_or_code(file_path: Path) -> str:
    """读取文本与代码源文件内容，自动在 utf-8 与 gbk 间回退并安全截断。"""
    content: str = ""
    try:
        with open(file_path, "r", encoding="utf-8") as f:
            content = f.read()
    except UnicodeDecodeError:
        try:
            with open(file_path, "r", encoding="gbk") as f:
                content = f.read()
        except UnicodeDecodeError:
            return "[读取失败：文件已加密、损坏或编码不受支持]"
        except Exception as exc:
            logger.warning("以 gbk 读取文本失败: path=%s, err=%s", file_path, exc)
            return "[读取失败：文件已加密、损坏或编码不受支持]"
    except Exception as exc:
        logger.warning("读取文件失败: path=%s, err=%s", file_path, exc)
        return "[读取失败：文件已加密、损坏或编码不受支持]"

    if len(content) > ATTACHMENT_TEXT_TRUNCATE_LIMIT:
        content = (
            content[:ATTACHMENT_TEXT_TRUNCATE_LIMIT]
            + f"\n\n[注：该附件内容已超出长度上限，系统已自动截断前 {ATTACHMENT_TEXT_TRUNCATE_LIMIT} 字符]"
        )
    return content
