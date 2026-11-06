"""Agent 领域异常与错误码定义模块。"""

from typing import Optional

from Assistant.config import ERROR_MESSAGES


class LLMError(Exception):
    """大模型调用与 ReAct 循环统一领域异常。"""

    def __init__(self, code: str, message: Optional[str] = None):
        self.code = code
        self.message = message or ERROR_MESSAGES.get(code, ERROR_MESSAGES["INTERNAL_ERROR"])
        super().__init__(f"[{self.code}] {self.message}")
