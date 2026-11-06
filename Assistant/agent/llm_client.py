"""OpenAI 兼容协议异步大模型客户端模块。"""

import json
import logging
from collections.abc import AsyncIterator
from typing import Any, Optional

import httpx

from Assistant import config
from Assistant.agent.errors import LLMError

logger = logging.getLogger("assistant.llm_client")


class LLMClient:
    """基于 httpx 的标准 OpenAI 兼容流式 HTTP 客户端。"""

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        model: Optional[str] = None,
        timeout: Optional[int] = None,
        http_client: Optional[httpx.AsyncClient] = None,
    ) -> None:
        self.api_key = api_key if api_key is not None else config.API_KEY
        self.base_url = (base_url if base_url is not None else config.BASE_URL).rstrip("/")
        self.model = model if model is not None else config.MODEL
        self.timeout = timeout if timeout is not None else config.REQUEST_TIMEOUT
        self._custom_http_client = http_client

    async def stream_chat(
        self, messages: list[dict[str, Any]]
    ) -> AsyncIterator[str]:
        """向配置的服务商发起异步流式对话请求并逐块抛出增量内容。"""
        if not self.api_key or not self.api_key.strip():
            logger.warning("未检测到 API Key，阻断模型调用")
            raise LLMError("NO_API_KEY")

        url = f"{self.base_url}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key.strip()}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self.model,
            "messages": messages,
            "stream": True,
        }

        # 脱敏日志输出
        logger.info("发起流式模型请求: url=%s, model=%s, msg_count=%d", url, self.model, len(messages))

        try:
            client = self._custom_http_client or httpx.AsyncClient(timeout=float(self.timeout))
            try:
                async with client.stream("POST", url, json=payload, headers=headers) as response:
                    if response.status_code != 200:
                        raw_error = await response.aread()
                        error_text = raw_error.decode("utf-8", errors="replace")
                        logger.error(
                            "模型上游服务返回异常状态码: status=%d, body=%s",
                            response.status_code,
                            error_text[:200],
                        )
                        if response.status_code in (401, 403):
                            raise LLMError("AUTH_FAILED")
                        if response.status_code == 429:
                            raise LLMError("QUOTA_EXCEEDED")
                        raise LLMError("UPSTREAM_ERROR")

                    async for line in response.aiter_lines():
                        trimmed = line.strip()
                        if not trimmed:
                            continue
                        if not trimmed.startswith("data:"):
                            continue
                        raw_data = trimmed[5:].strip()
                        if raw_data == "[DONE]":
                            break
                        try:
                            chunk = json.loads(raw_data)
                        except json.JSONDecodeError:
                            continue

                        choices = chunk.get("choices") or []
                        if not choices:
                            continue
                        delta = choices[0].get("delta") or {}
                        content = delta.get("content")
                        if content:
                            yield content
            finally:
                if self._custom_http_client is None:
                    await client.aclose()

        except LLMError:
            raise
        except httpx.TimeoutException as exc:
            logger.error("模型服务商请求超时: %s", exc)
            raise LLMError("TIMEOUT") from exc
        except httpx.RequestError as exc:
            logger.error("模型服务商网络连接异常: %s", exc)
            raise LLMError("NETWORK_ERROR") from exc
        except Exception as exc:
            logger.exception("大模型调用发生未知异常: %s", exc)
            raise LLMError("INTERNAL_ERROR") from exc
