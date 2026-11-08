"""针对 tests/test_files 测试样本集的全自动化回归与校验单元测试。

验证范围：
1. 合格文件的存在性、大小合规性、白名单合规性、唯一专属暗号提取；
2. 不合格文件的拦截逻辑判定（超 5MB、不支持扩展名）；
3. 特殊文件的解析异常捕获（扫描版 PDF、损坏伪装 docx、加密 PDF、5万字超长截断）。
"""

import os
from pathlib import Path
import unittest

from PIL import Image

from Assistant import config
from Assistant.agent.tools.parsers.doc_parser import parse_docx, parse_pptx, parse_xlsx
from Assistant.agent.tools.parsers.pdf_parser import parse_pdf
from Assistant.agent.tools.parsers.text_parser import parse_text_or_code


class TestFixtureFiles(unittest.TestCase):
    """测试 tests/test_files 目录下所有测试样本的合规性与功能。"""

    @classmethod
    def setUpClass(cls):
        cls.base_dir = Path(__file__).resolve().parent / "test_files"
        cls.valid_dir = cls.base_dir / "valid"
        cls.invalid_dir = cls.base_dir / "invalid"
        cls.special_dir = cls.base_dir / "special"

    def test_directories_exist(self):
        """测试目录结构完整性。"""
        self.assertTrue(self.base_dir.is_dir(), "tests/test_files 目录不存在")
        self.assertTrue(self.valid_dir.is_dir(), "valid 目录不存在")
        self.assertTrue(self.invalid_dir.is_dir(), "invalid 目录不存在")
        self.assertTrue(self.special_dir.is_dir(), "special 目录不存在")
        self.assertTrue((self.base_dir / "README.md").is_file(), "README.md 对照文档不存在")

    def test_valid_files_compliance_and_passphrases(self):
        """测试所有合格文件：体积 < 5MB、白名单后缀、专属暗号提取成功且全集唯一。"""
        valid_specs = [
            ("valid_image.png", "image", "暗号：蓝色企鹅 (Blue Penguin)"),
            ("valid_photo.jpg", "image", "暗号：赤色飞狐 (Crimson Fox)"),
            ("valid_report.docx", "docx", "暗号：琥珀金狮 (Amber Lion)"),
            ("valid_sheet.xlsx", "xlsx", "暗号：翡翠灵鹿 (Emerald Deer)"),
            ("valid_slides.pptx", "pptx", "暗号：紫晶猎鹰 (Amethyst Falcon)"),
            ("valid_document.pdf", "pdf", "暗号：蔚蓝鲸落 (Azure Whale)"),
            ("valid_guide.md", "text", "暗号：玄冰雪鸮 (Glacier Owl)"),
            ("valid_notes.txt", "text", "暗号：烈焰火凤 (Blazing Phoenix)"),
            ("valid_script.py", "text", "暗号：青铜苍狼 (Bronze Wolf)"),
        ]

        # 确保所有暗号全局唯一
        all_passphrases = [spec[2] for spec in valid_specs]
        self.assertEqual(len(all_passphrases), len(set(all_passphrases)), "暗号存在重复项！")

        for filename, ftype, expected_passphrase in valid_specs:
            file_path = self.valid_dir / filename
            self.assertTrue(file_path.is_file(), f"合格文件缺失: {filename}")

            # 1. 大小必须小于 5MB
            size = file_path.stat().st_size
            self.assertLess(size, config.MAX_ATTACHMENT_SIZE, f"{filename} 大小超出 5MB: {size}")

            # 2. 后缀必须在允许白名单中
            ext = file_path.suffix.lower()
            self.assertIn(ext, config.ALLOWED_ATTACHMENT_EXTS, f"{filename} 后缀不在白名单: {ext}")

            # 3. 提取暗号校验
            if ftype == "image":
                # 图像文件能被 PIL 正确打开并读取元信息
                with Image.open(file_path) as img:
                    self.assertGreater(img.width, 0)
                    self.assertGreater(img.height, 0)
            elif ftype == "docx":
                text = parse_docx(file_path)
                self.assertIn(expected_passphrase, text, f"{filename} 未能提取出暗号")
            elif ftype == "xlsx":
                text = parse_xlsx(file_path)
                self.assertIn(expected_passphrase, text, f"{filename} 未能提取出暗号")
            elif ftype == "pptx":
                text = parse_pptx(file_path)
                self.assertIn(expected_passphrase, text, f"{filename} 未能提取出暗号")
            elif ftype == "pdf":
                text = parse_pdf(file_path)
                self.assertIn(expected_passphrase, text, f"{filename} 未能提取出暗号")
            elif ftype == "text":
                text = parse_text_or_code(file_path)
                self.assertIn(expected_passphrase, text, f"{filename} 未能提取出暗号")

    def test_invalid_oversized_file(self):
        """测试不合格文件：超大文件（> 5MB）。"""
        file_path = self.invalid_dir / "oversized_payload_5.5mb.txt"
        self.assertTrue(file_path.is_file(), "oversized 文件不存在")
        size = file_path.stat().st_size
        self.assertGreater(size, config.MAX_ATTACHMENT_SIZE, "文件大小应大于 5MB")

    def test_invalid_unsupported_extensions(self):
        """测试不合格文件：不受支持的扩展名拦截。"""
        unsupported_files = [
            "legacy_document.doc",
            "legacy_sheet.xls",
            "legacy_presentation.ppt",
            "test_program.exe",
            "archive_sample.zip",
        ]
        for name in unsupported_files:
            file_path = self.invalid_dir / name
            self.assertTrue(file_path.is_file(), f"不合格文件缺失: {name}")
            ext = file_path.suffix.lower()
            self.assertNotIn(ext, config.ALLOWED_ATTACHMENT_EXTS, f"{name} 应该被白名单拦截")

    def test_special_scanned_pdf(self):
        """测试特殊文件：纯图片扫描版 PDF 判定。"""
        file_path = self.special_dir / "scanned_image_only.pdf"
        self.assertTrue(file_path.is_file(), "scanned_image_only.pdf 不存在")
        res = parse_pdf(file_path)
        self.assertEqual(
            res,
            "[读取失败：该 PDF 文件为扫描版或纯图片型文档，当前系统仅支持文字版 PDF]",
        )

    def test_special_corrupted_docx(self):
        """测试特殊文件：txt 伪装成 .docx 损坏捕获。"""
        file_path = self.special_dir / "corrupted_renamed.docx"
        self.assertTrue(file_path.is_file(), "corrupted_renamed.docx 不存在")
        res = parse_docx(file_path)
        self.assertEqual(res, "[读取失败：文件已加密、损坏或编码不受支持]")

    def test_special_encrypted_pdf(self):
        """测试特殊文件：加密 PDF 异常捕获。"""
        file_path = self.special_dir / "encrypted_protected.pdf"
        self.assertTrue(file_path.is_file(), "encrypted_protected.pdf 不存在")
        res = parse_pdf(file_path)
        self.assertEqual(res, "[读取失败：文件已加密、损坏或编码不受支持]")

    def test_special_long_txt_truncation(self):
        """测试特殊文件：几万字纯文本（< 5MB）且触发 10000 字符截断机制。"""
        file_path = self.special_dir / "long_text_50k_words.txt"
        self.assertTrue(file_path.is_file(), "long_text_50k_words.txt 不存在")

        # 检查物理大小确实合规（小于 5MB，允许上传）
        self.assertLess(file_path.stat().st_size, config.MAX_ATTACHMENT_SIZE)

        # 检查原始字符数确实在几万字级别
        raw_text = file_path.read_text(encoding="utf-8")
        self.assertGreater(len(raw_text), 40000, "超长文本字数不足 40,000 字")

        # 检查调用解析器时，确实触发了截断
        parsed = parse_text_or_code(file_path)
        self.assertIn("该附件内容已超出长度上限，系统已自动截断前 10000 字符", parsed)
        self.assertTrue(parsed.startswith(raw_text[: config.ATTACHMENT_TEXT_TRUNCATE_LIMIT]))


if __name__ == "__main__":
    unittest.main()
