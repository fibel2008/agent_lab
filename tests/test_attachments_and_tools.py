"""B1.13 - B1.15 附件管理、多格式解析、沙箱工具与视觉能力校验单元测试。"""

import asyncio
import io
import os
from pathlib import Path
import shutil
import tempfile
import unittest
from unittest.mock import AsyncMock, patch
import uuid

import docx
from fastapi.testclient import TestClient
import httpx
import openpyxl
import pptx
import pypdf

from Assistant import config
from Assistant.agent.base import AttachmentInfo, ChatMessage
from Assistant.agent.llm_client import LLMClient, clear_model_vision_cache, set_model_vision_cache
from Assistant.agent.mock_agent import MockAgent
from Assistant.agent.task_manager import task_manager
from Assistant.agent.tools.attachment_tool import ReadAttachmentTool, read_attachment_tool
from Assistant.agent.tools.parsers.doc_parser import parse_docx, parse_pptx, parse_xlsx
from Assistant.agent.tools.parsers.pdf_parser import parse_pdf
from Assistant.agent.tools.parsers.text_parser import parse_text_or_code
from Assistant.app import create_app
from Assistant.storage.db import close_db, init_db
from Assistant.storage.session_store import SessionStore, session_store


class TestParsers(unittest.TestCase):
    """测试多格式文本提取解析器（docx, xlsx, pptx, pdf, text/code）。"""

    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.dir_path = Path(self.temp_dir.name)

    def tearDown(self):
        self.temp_dir.cleanup()

    def test_docx_parser_success_and_truncate(self):
        # 1. 正常 docx
        doc_path = self.dir_path / "test.docx"
        doc = docx.Document()
        doc.add_paragraph("第一段测试正文")
        table = doc.add_table(rows=2, cols=2)
        table.cell(0, 0).text = "表头1"
        table.cell(0, 1).text = "表头2"
        table.cell(1, 0).text = "数据1"
        table.cell(1, 1).text = "数据2"
        doc.save(str(doc_path))

        res = parse_docx(doc_path)
        self.assertIn("第一段测试正文", res)
        self.assertIn("表头1 | 表头2", res)
        self.assertIn("数据1 | 数据2", res)

        # 2. 超长截断 (超 10,000 字符)
        long_doc_path = self.dir_path / "long.docx"
        long_doc = docx.Document()
        long_doc.add_paragraph("A" * 12000)
        long_doc.save(str(long_doc_path))

        long_res = parse_docx(long_doc_path)
        self.assertIn("该附件内容已超出长度上限，系统已自动截断前 10000 字符", long_res)
        self.assertTrue(long_res.startswith("A" * 10000))

        # 3. 损坏的 docx
        bad_doc_path = self.dir_path / "bad.docx"
        bad_doc_path.write_bytes(b"corrupted binary data")
        bad_res = parse_docx(bad_doc_path)
        self.assertEqual(bad_res, "[读取失败：文件已加密、损坏或编码不受支持]")

    def test_xlsx_parser_success_and_truncate(self):
        # 1. 正常 xlsx
        xlsx_path = self.dir_path / "test.xlsx"
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = "测试表"
        ws.append(["姓名", "成绩"])
        ws.append(["张三", "95"])
        wb.save(str(xlsx_path))
        wb.close()

        res = parse_xlsx(xlsx_path)
        self.assertIn("### 工作表: 测试表", res)
        self.assertIn("姓名 | 成绩", res)
        self.assertIn("张三 | 95", res)

        # 2. 超长截断
        long_xlsx_path = self.dir_path / "long.xlsx"
        long_wb = openpyxl.Workbook()
        long_ws = long_wb.active
        # 每行 1000 字符，写入 15 行
        for _ in range(15):
            long_ws.append(["B" * 1000])
        long_wb.save(str(long_xlsx_path))
        long_wb.close()

        long_res = parse_xlsx(long_xlsx_path)
        self.assertIn("该附件内容已超出长度上限，系统已自动截断前 10000 字符", long_res)

        # 3. 损坏的 xlsx
        bad_xlsx_path = self.dir_path / "bad.xlsx"
        bad_xlsx_path.write_bytes(b"corrupted xlsx")
        bad_res = parse_xlsx(bad_xlsx_path)
        self.assertEqual(bad_res, "[读取失败：文件已加密、损坏或编码不受支持]")

    def test_pptx_parser_success_and_truncate(self):
        # 1. 正常 pptx
        pptx_path = self.dir_path / "test.pptx"
        prs = pptx.Presentation()
        slide = prs.slides.add_slide(prs.slide_layouts[6])
        tx_box = slide.shapes.add_textbox(0, 0, 100, 100)
        tx_box.text_frame.text = "幻灯片核心内容"
        prs.save(str(pptx_path))

        res = parse_pptx(pptx_path)
        self.assertIn("### 幻灯片 1", res)
        self.assertIn("幻灯片核心内容", res)

        # 2. 超长截断
        long_pptx_path = self.dir_path / "long.pptx"
        long_prs = pptx.Presentation()
        long_slide = long_prs.slides.add_slide(long_prs.slide_layouts[6])
        long_box = long_slide.shapes.add_textbox(0, 0, 100, 100)
        long_box.text_frame.text = "C" * 12000
        long_prs.save(str(long_pptx_path))

        long_res = parse_pptx(long_pptx_path)
        self.assertIn("该附件内容已超出长度上限，系统已自动截断前 10000 字符", long_res)

        # 3. 损坏的 pptx
        bad_pptx_path = self.dir_path / "bad.pptx"
        bad_pptx_path.write_bytes(b"corrupted pptx")
        bad_res = parse_pptx(bad_pptx_path)
        self.assertEqual(bad_res, "[读取失败：文件已加密、损坏或编码不受支持]")

    def test_pdf_parser_text_scan_and_corrupt(self):
        # 1. 文本版 PDF
        pdf_bytes = (
            b"%PDF-1.4\n"
            b"1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n"
            b"2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n"
            b"3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj\n"
            b"4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n"
            b"5 0 obj << /Length 44 >> stream\n"
            b"BT\n"
            b"/F1 12 Tf\n"
            b"100 700 Td\n"
            b"(Hello PDF World) Tj\n"
            b"ET\n"
            b"endstream\n"
            b"endobj\n"
            b"xref\n"
            b"0 6\n"
            b"0000000000 65535 f \n"
            b"0000000009 00000 n \n"
            b"0000000058 00000 n \n"
            b"0000000115 00000 n \n"
            b"0000000229 00000 n \n"
            b"0000000302 00000 n \n"
            b"trailer << /Size 6 /Root 1 0 R >>\n"
            b"startxref\n"
            b"396\n"
            b"%%EOF\n"
        )
        pdf_path = self.dir_path / "text.pdf"
        pdf_path.write_bytes(pdf_bytes)
        res = parse_pdf(pdf_path)
        self.assertIn("Hello PDF World", res)

        # 2. 扫描版 / 纯空白 PDF
        blank_pdf_path = self.dir_path / "blank.pdf"
        writer = pypdf.PdfWriter()
        writer.add_blank_page(width=100, height=100)
        with open(blank_pdf_path, "wb") as f:
            writer.write(f)
        blank_res = parse_pdf(blank_pdf_path)
        self.assertEqual(
            blank_res,
            "[读取失败：该 PDF 文件为扫描版或纯图片型文档，当前系统仅支持文字版 PDF]",
        )

        # 3. 损坏的 PDF
        bad_pdf_path = self.dir_path / "bad.pdf"
        bad_pdf_path.write_bytes(b"corrupted pdf stream")
        bad_res = parse_pdf(bad_pdf_path)
        self.assertEqual(bad_res, "[读取失败：文件已加密、损坏或编码不受支持]")

    def test_text_parser_utf8_gbk_and_truncate(self):
        # 1. UTF-8 文件
        utf8_path = self.dir_path / "hello.py"
        utf8_path.write_text("print('你好世界')", encoding="utf-8")
        res = parse_text_or_code(utf8_path)
        self.assertEqual(res, "print('你好世界')")

        # 2. GBK 回退文件
        gbk_path = self.dir_path / "gbk_test.txt"
        gbk_path.write_bytes("这是GBK编码文本内容".encode("gbk"))
        gbk_res = parse_text_or_code(gbk_path)
        self.assertEqual(gbk_res, "这是GBK编码文本内容")

        # 3. 超长截断
        long_txt_path = self.dir_path / "long.txt"
        long_txt_path.write_text("D" * 12000, encoding="utf-8")
        long_res = parse_text_or_code(long_txt_path)
        self.assertIn("该附件内容已超出长度上限，系统已自动截断前 10000 字符", long_res)
        self.assertTrue(long_res.startswith("D" * 10000))


class TestReadAttachmentToolAndSandbox(unittest.IsolatedAsyncioTestCase):
    """测试 ReadAttachmentTool 及其会话沙箱权限隔离。"""

    async def asyncSetUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.dir_path = Path(self.temp_dir.name)
        self.db_path = self.dir_path / f"test_tool_{uuid.uuid4().hex[:6]}.db"
        await init_db(self.db_path)
        self.store = SessionStore()

        self.sid_valid = f"s_valid_{uuid.uuid4().hex[:6]}"
        self.sid_other = f"s_other_{uuid.uuid4().hex[:6]}"

        # 创建测试会话与测试物理文件
        await self.store.create_session(self.sid_valid, "有效会话")
        await self.store.create_session(self.sid_other, "另一个会话")

        self.att_file = self.dir_path / "sample.txt"
        self.att_file.write_text("附件正文测试内容", encoding="utf-8")

        # 创建附件记录挂载到 self.sid_valid 会话
        await self.store.create_turn_and_task(
            session_id=self.sid_valid,
            user_content="用户提问",
            user_msg_id=f"m_u_{uuid.uuid4().hex[:6]}",
            assistant_msg_id=f"m_a_{uuid.uuid4().hex[:6]}",
            task_id=f"t_{uuid.uuid4().hex[:6]}",
            attachments=[
                {
                    "id": "att_u_test1",
                    "filename": "sample.txt",
                    "file_type": "text/plain",
                    "file_size": self.att_file.stat().st_size,
                    "storage_path": self.att_file,
                }
            ],
        )

    async def asyncTearDown(self):
        await close_db()
        self.temp_dir.cleanup()

    async def test_tool_metadata(self):
        tool = read_attachment_tool
        self.assertEqual(tool.name, "read_attachment")
        self.assertIn("非图片附件", tool.description)
        self.assertIn("attachment_id", tool.parameters["properties"])
        self.assertEqual(tool.parameters["required"], ["attachment_id"])

    async def test_sandbox_session_isolation(self):
        tool = read_attachment_tool

        # 1. 跨会话越权读取：属于 self.sid_valid 的附件在 self.sid_other 中尝试读取
        res_cross = await tool.execute(attachment_id="att_u_test1", session_id=self.sid_other)
        self.assertEqual(res_cross, "[错误：未在当前会话中找到该附件]")

        # 2. 读取不存在的附件
        res_none = await tool.execute(attachment_id="att_u_none", session_id=self.sid_valid)
        self.assertEqual(res_none, "[错误：未在当前会话中找到该附件]")

        # 3. 合法会话内读取成功
        res_ok = await tool.execute(attachment_id="att_u_test1", session_id=self.sid_valid)
        self.assertEqual(res_ok, "附件正文测试内容")


class TestLLMClientVision(unittest.IsolatedAsyncioTestCase):
    """测试模型视觉能力校验与缓存机制。"""

    def setUp(self):
        clear_model_vision_cache()

    def tearDown(self):
        clear_model_vision_cache()

    async def test_vision_cache_hit(self):
        # 预设缓存
        set_model_vision_cache("cached-vision-model", True)
        client = LLMClient(model="cached-vision-model")
        self.assertTrue(await client.check_model_vision_support())

        set_model_vision_cache("cached-text-model", False)
        client_text = LLMClient(model="cached-text-model")
        self.assertFalse(await client_text.check_model_vision_support())

    async def test_vision_probe_success(self):
        def handler(request: httpx.Request) -> httpx.Response:
            self.assertEqual(request.url.path, "/v1/chat/completions")
            return httpx.Response(
                200,
                json={"choices": [{"message": {"content": "ok"}}]},
            )

        transport = httpx.MockTransport(handler)
        async with httpx.AsyncClient(transport=transport) as http_client:
            client = LLMClient(
                model="probe-vision-ok",
                api_key="sk-test",
                base_url="https://mock.api/v1",
                http_client=http_client,
            )
            supported = await client.check_model_vision_support()
            self.assertTrue(supported)
            # 验证已被缓存
            self.assertEqual(LLMClient._model_vision_cache.get("probe-vision-ok"), True)

    async def test_vision_probe_unsupported(self):
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(
                400,
                json={"error": {"message": "The model probe-vision-fail does not support image input"}},
            )

        transport = httpx.MockTransport(handler)
        async with httpx.AsyncClient(transport=transport) as http_client:
            client = LLMClient(
                model="probe-vision-fail",
                api_key="sk-test",
                base_url="https://mock.api/v1",
                http_client=http_client,
            )
            supported = await client.check_model_vision_support()
            self.assertFalse(supported)
            self.assertEqual(LLMClient._model_vision_cache.get("probe-vision-fail"), False)


class TestAttachmentAPIs(unittest.IsolatedAsyncioTestCase):
    """测试附件上传校验、系统调起、图片预览与级联删除 API。"""

    async def asyncSetUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.dir_path = Path(self.temp_dir.name)
        self.db_path = self.dir_path / f"test_api_{uuid.uuid4().hex[:6]}.db"
        self.att_dir = self.dir_path / "attachments"
        self.att_dir.mkdir(parents=True, exist_ok=True)

        self.patcher_db = patch.object(config, "DB_PATH", self.db_path)
        self.patcher_att = patch.object(config, "ATTACHMENT_DIR", self.att_dir)
        self.patcher_db.start()
        self.patcher_att.start()

        await init_db(self.db_path)
        self.app = create_app()
        self.client = TestClient(self.app)

        # 创建测试会话
        res = self.client.post("/api/sessions", json={"title": "测试附件会话"})
        self.assertEqual(res.status_code, 201)
        self.session_id = res.json()["id"]

    async def asyncTearDown(self):
        await task_manager.shutdown()
        await close_db()
        self.patcher_db.stop()
        self.patcher_att.stop()
        self.temp_dir.cleanup()
        clear_model_vision_cache()

    async def test_upload_attachment_success(self):
        # 模拟上传正常文本文件
        file_content = b"console.log('hello world');"
        files = [
            ("files", ("test.js", io.BytesIO(file_content), "text/javascript")),
        ]
        data = {"content": "请分析这个代码文件"}

        res = self.client.post(
            f"/api/sessions/{self.session_id}/messages",
            data=data,
            files=files,
        )
        self.assertEqual(res.status_code, 202)
        resp_json = res.json()
        self.assertEqual(resp_json["status"], "running")
        self.assertIn("task_id", resp_json)

        # 检查数据库中是否存在附件记录
        records = await session_store.get_messages(self.session_id)
        user_msg = next((m for m in records if m["role"] == "user"), None)
        self.assertIsNotNone(user_msg)
        self.assertEqual(len(user_msg["attachments"]), 1)
        self.assertEqual(user_msg["attachments"][0]["filename"], "test.js")

        # 检查文件是否已落盘至 data/attachments/{session_id}/
        session_folder = self.att_dir / self.session_id
        self.assertTrue(session_folder.is_dir())
        saved_files = list(session_folder.iterdir())
        self.assertEqual(len(saved_files), 1)
        self.assertTrue(saved_files[0].name.endswith("_test.js"))
        self.assertEqual(saved_files[0].read_bytes(), file_content)

    async def test_upload_exceed_max_count(self):
        # 超过 3 个附件拦截 (422)
        files = [
            ("files", ("f1.txt", io.BytesIO(b"1"), "text/plain")),
            ("files", ("f2.txt", io.BytesIO(b"2"), "text/plain")),
            ("files", ("f3.txt", io.BytesIO(b"3"), "text/plain")),
            ("files", ("f4.txt", io.BytesIO(b"4"), "text/plain")),
        ]
        res = self.client.post(
            f"/api/sessions/{self.session_id}/messages",
            data={"content": "测试过多附件"},
            files=files,
        )
        self.assertEqual(res.status_code, 422)
        self.assertEqual(res.json()["code"], "ATTACHMENT_COUNT_EXCEEDED")

    async def test_upload_exceed_max_size(self):
        # 单文件超出 5MB 拦截 (422)
        oversized = io.BytesIO(b"0" * (5 * 1024 * 1024 + 1))
        files = [("files", ("big.txt", oversized, "text/plain"))]
        res = self.client.post(
            f"/api/sessions/{self.session_id}/messages",
            data={"content": "测试超大附件"},
            files=files,
        )
        self.assertEqual(res.status_code, 422)
        self.assertEqual(res.json()["code"], "ATTACHMENT_TOO_LARGE")

    async def test_upload_unsupported_file_type(self):
        # 不受支持的格式拦截 (422)
        files = [("files", ("evil.exe", io.BytesIO(b"binary"), "application/octet-stream"))]
        res = self.client.post(
            f"/api/sessions/{self.session_id}/messages",
            data={"content": "测试可执行文件"},
            files=files,
        )
        self.assertEqual(res.status_code, 422)
        self.assertEqual(res.json()["code"], "ATTACHMENT_TYPE_NOT_SUPPORTED")

    async def test_upload_image_not_supported_interception(self):
        # 模型不支持视觉时拦截 (400)
        set_model_vision_cache(config.MODEL, False)
        files = [("files", ("pic.png", io.BytesIO(b"\x89PNG\r\n\x1a\n"), "image/png"))]
        res = self.client.post(
            f"/api/sessions/{self.session_id}/messages",
            data={"content": "发送图片"},
            files=files,
        )
        self.assertEqual(res.status_code, 400)
        self.assertEqual(res.json()["code"], "IMAGE_NOT_SUPPORTED")

        # 验证数据库中无记录，磁盘无新文件
        msgs = await session_store.get_messages(self.session_id)
        self.assertEqual(len(msgs), 0)
        session_folder = self.att_dir / self.session_id
        if session_folder.exists():
            self.assertEqual(len(list(session_folder.iterdir())), 0)

    async def test_open_attachment_and_preview(self):
        # 1. 先上传图片
        set_model_vision_cache(config.MODEL, True)
        files = [("files", ("test.png", io.BytesIO(b"\x89PNG\r\n\x1a\n"), "image/png"))]
        self.client.post(
            f"/api/sessions/{self.session_id}/messages",
            data={"content": "测试图片"},
            files=files,
        )
        msgs = await session_store.get_messages(self.session_id)
        att_id = msgs[0]["attachments"][0]["id"]

        # 2. 测试图片预览 GET /api/attachments/{id}/preview
        preview_res = self.client.get(f"/api/attachments/{att_id}/preview")
        self.assertEqual(preview_res.status_code, 200)
        self.assertEqual(preview_res.headers.get("content-type"), "image/png")

        # 3. 测试系统打开 POST /api/attachments/{id}/open
        with patch("os.startfile", create=True) as mock_startfile:
            open_res = self.client.post(f"/api/attachments/{att_id}/open")
            self.assertEqual(open_res.status_code, 200)
            self.assertEqual(open_res.json()["status"], "opened")
            self.assertTrue(mock_startfile.called)

        # 4. 手动删除磁盘上的物理文件，测试 404 文件不存在拦截
        record = await session_store.get_attachment(att_id)
        storage_path: Path = record["storage_path"]
        storage_path.unlink()

        missing_res = self.client.post(f"/api/attachments/{att_id}/open")
        self.assertEqual(missing_res.status_code, 404)
        self.assertEqual(missing_res.json()["code"], "ATTACHMENT_NOT_FOUND")

    async def test_delete_session_cascades_attachments_and_directory(self):
        # 1. 上传文件并确认生成目录
        files = [("files", ("note.txt", io.BytesIO(b"hello note"), "text/plain"))]
        self.client.post(
            f"/api/sessions/{self.session_id}/messages",
            data={"content": "便签"},
            files=files,
        )
        session_folder = self.att_dir / self.session_id
        self.assertTrue(session_folder.is_dir())

        # 2. 删除会话
        del_res = self.client.delete(f"/api/sessions/{self.session_id}")
        self.assertEqual(del_res.status_code, 204)

        # 3. 验证磁盘文件夹已被物理递归清理
        self.assertFalse(session_folder.exists())


class TestMockAgentAttachments(unittest.TestCase):
    """测试离线 Mock 模式下的附件确定性文本反馈。"""

    def test_mock_agent_deterministic_feedback(self):
        agent = MockAgent()
        user_msg = ChatMessage(
            role="user",
            content="请查看这些文档",
            attachments=[
                AttachmentInfo(
                    id="att_1",
                    filename="设计方案.docx",
                    file_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    file_size=1024,
                ),
                AttachmentInfo(
                    id="att_2",
                    filename="main.py",
                    file_type="text/x-python",
                    file_size=2048,
                ),
            ],
        )
        reply = agent._generate_reply_text([user_msg])
        self.assertEqual(
            reply,
            "已收到 2 个文件：设计方案.docx、main.py。当前处于离线模式，不执行附件解析与工具调用。",
        )


if __name__ == "__main__":
    unittest.main()
