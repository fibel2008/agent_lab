"""Word、Excel 与 PPT 文档文本提取解析器。"""

from pathlib import Path
import zipfile
import docx
import openpyxl
import pptx

from Assistant.config import ATTACHMENT_TEXT_TRUNCATE_LIMIT, logger


def parse_docx(file_path: Path) -> str:
    """提取 Word (.docx) 文件中的正文段落与表格文本。"""
    try:
        doc = docx.Document(str(file_path))
        lines: list[str] = []

        # 1. 提取段落文本
        for p in doc.paragraphs:
            text = p.text.strip()
            if text:
                lines.append(text)

        # 2. 提取表格文本
        for table in doc.tables:
            for row in table.rows:
                row_cells = [cell.text.strip() for cell in row.cells]
                row_text = " | ".join(filter(None, row_cells))
                if row_text:
                    lines.append(row_text)

        full_text = "\n".join(lines).strip()
        if len(full_text) > ATTACHMENT_TEXT_TRUNCATE_LIMIT:
            full_text = (
                full_text[:ATTACHMENT_TEXT_TRUNCATE_LIMIT]
                + f"\n\n[注：该附件内容已超出长度上限，系统已自动截断前 {ATTACHMENT_TEXT_TRUNCATE_LIMIT} 字符]"
            )
        return full_text if full_text else "[注：文档内容为空]"
    except zipfile.BadZipFile:
        return "[读取失败：文件已加密、损坏或编码不受支持]"
    except Exception as exc:
        logger.warning("解析 docx 文件失败: path=%s, err=%s", file_path, exc)
        return "[读取失败：文件已加密、损坏或编码不受支持]"


def parse_xlsx(file_path: Path) -> str:
    """提取 Excel (.xlsx) 文件的非空工作表单元格内容。"""
    try:
        wb = openpyxl.load_workbook(str(file_path), data_only=True, read_only=True)
        sheets_content: list[str] = []

        for sheet_name in wb.sheetnames:
            ws = wb[sheet_name]
            sheet_lines: list[str] = []
            for row in ws.iter_rows(values_only=True):
                non_empty = [str(val).strip() for val in row if val is not None and str(val).strip()]
                if non_empty:
                    sheet_lines.append(" | ".join(non_empty))
            if sheet_lines:
                sheets_content.append(f"### 工作表: {sheet_name}\n" + "\n".join(sheet_lines))

        wb.close()
        full_text = "\n\n".join(sheets_content).strip()
        if len(full_text) > ATTACHMENT_TEXT_TRUNCATE_LIMIT:
            full_text = (
                full_text[:ATTACHMENT_TEXT_TRUNCATE_LIMIT]
                + f"\n\n[注：该附件内容已超出长度上限，系统已自动截断前 {ATTACHMENT_TEXT_TRUNCATE_LIMIT} 字符]"
            )
        return full_text if full_text else "[注：工作簿内容为空]"
    except zipfile.BadZipFile:
        return "[读取失败：文件已加密、损坏或编码不受支持]"
    except Exception as exc:
        logger.warning("解析 xlsx 文件失败: path=%s, err=%s", file_path, exc)
        return "[读取失败：文件已加密、损坏或编码不受支持]"


def parse_pptx(file_path: Path) -> str:
    """提取 PowerPoint (.pptx) 演示文稿各幻灯片文本。"""
    try:
        prs = pptx.Presentation(str(file_path))
        slides_content: list[str] = []

        for idx, slide in enumerate(prs.slides, start=1):
            slide_texts: list[str] = []
            for shape in slide.shapes:
                if shape.has_text_frame:
                    text = shape.text_frame.text.strip()
                    if text:
                        slide_texts.append(text)
            if slide_texts:
                slides_content.append(f"### 幻灯片 {idx}\n" + "\n".join(slide_texts))

        full_text = "\n\n".join(slides_content).strip()
        if len(full_text) > ATTACHMENT_TEXT_TRUNCATE_LIMIT:
            full_text = (
                full_text[:ATTACHMENT_TEXT_TRUNCATE_LIMIT]
                + f"\n\n[注：该附件内容已超出长度上限，系统已自动截断前 {ATTACHMENT_TEXT_TRUNCATE_LIMIT} 字符]"
            )
        return full_text if full_text else "[注：演示文稿内容为空]"
    except zipfile.BadZipFile:
        return "[读取失败：文件已加密、损坏或编码不受支持]"
    except Exception as exc:
        logger.warning("解析 pptx 文件失败: path=%s, err=%s", file_path, exc)
        return "[读取失败：文件已加密、损坏或编码不受支持]"
