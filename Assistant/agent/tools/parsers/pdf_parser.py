"""文字版 PDF 文本提取解析器。"""

from pathlib import Path
import pypdf
from pypdf.errors import FileNotDecryptedError, PdfReadError, PyPdfError

from Assistant.config import ATTACHMENT_TEXT_TRUNCATE_LIMIT, logger


def parse_pdf(file_path: Path) -> str:
    """提取文字版 PDF 文件全文，检测扫描版与加密异常。"""
    try:
        reader = pypdf.PdfReader(str(file_path))
        if reader.is_encrypted:
            try:
                # 尝试空密码解密
                decrypt_res = reader.decrypt("")
                if decrypt_res == pypdf.constants.DecryptionResult.FAILED:
                    return "[读取失败：文件已加密、损坏或编码不受支持]"
            except Exception:
                return "[读取失败：文件已加密、损坏或编码不受支持]"

        pages_text: list[str] = []
        for page in reader.pages:
            t = page.extract_text()
            if t:
                pages_text.append(t)

        full_text = "\n\n".join(pages_text).strip()

        # 扫描版判定：去除所有空白后长度为 0
        non_space_chars = "".join(full_text.split())
        if len(non_space_chars) == 0:
            return "[读取失败：该 PDF 文件为扫描版或纯图片型文档，当前系统仅支持文字版 PDF]"

        if len(full_text) > ATTACHMENT_TEXT_TRUNCATE_LIMIT:
            full_text = (
                full_text[:ATTACHMENT_TEXT_TRUNCATE_LIMIT]
                + f"\n\n[注：该附件内容已超出长度上限，系统已自动截断前 {ATTACHMENT_TEXT_TRUNCATE_LIMIT} 字符]"
            )
        return full_text
    except FileNotDecryptedError:
        return "[读取失败：文件已加密、损坏或编码不受支持]"
    except (PdfReadError, PyPdfError) as exc:
        logger.warning("PDF 读取异常: path=%s, err=%s", file_path, exc)
        return "[读取失败：文件已加密、损坏或编码不受支持]"
    except Exception as exc:
        logger.warning("解析 PDF 发生未预期异常: path=%s, err=%s", file_path, exc)
        return "[读取失败：文件已加密、损坏或编码不受支持]"
