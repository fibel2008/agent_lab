"""个人数据库工作台前端静态资源托管与 HTML 结构单元测试 (C1.0)。"""

import unittest
from fastapi.testclient import TestClient

from Assistant.app import create_app


class TestDatabaseWorkbenchStatic(unittest.TestCase):
    """测试个人数据库工作台的静态资源与 DOM 结构。"""

    def setUp(self):
        self.app = create_app()
        self.client = TestClient(self.app)

    def test_index_html_contains_database_elements(self):
        resp = self.client.get("/")
        self.assertEqual(resp.status_code, 200)
        html = resp.text

        # 检查是否包含 database.css
        self.assertIn('/css/database.css', html)

        # 检查 SVG sprite 是否包含 icon-search
        self.assertIn('id="icon-search"', html)

        # 检查顶栏融合组件
        self.assertIn('id="db-header-tabs"', html)
        self.assertIn('data-db-view="docs"', html)
        self.assertIn('data-db-view="chunks"', html)
        self.assertIn('data-db-view="chats"', html)
        self.assertIn('未来视图', html)
        self.assertIn('id="db-header-search"', html)
        self.assertIn('id="db-search-input"', html)
        self.assertIn('id="db-search-dropdown"', html)

        # 检查主区域 view--database
        self.assertIn('id="view-database"', html)
        self.assertIn('class="view view--database"', html)

    def test_static_database_css_available(self):
        resp = self.client.get("/css/database.css")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("text/css", resp.headers.get("content-type", ""))
        self.assertIn(".db-header-tabs", resp.text)
        self.assertIn(".db-search", resp.text)
        self.assertIn(".db-sidebar", resp.text)
        self.assertIn(".db-content", resp.text)
        self.assertIn(".db-source-card", resp.text)
        self.assertIn(".db-toast", resp.text)

    def test_static_database_js_available(self):
        resp = self.client.get("/js/views/database.js")
        self.assertEqual(resp.status_code, 200)
        self.assertIn("javascript", resp.headers.get("content-type", ""))
        self.assertIn("initDatabaseView", resp.text)
        self.assertIn("guardUnsavedChanges", resp.text)
        self.assertIn("renderAll", resp.text)


if __name__ == "__main__":
    unittest.main()
