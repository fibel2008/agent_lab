"""OpenAI 兼容协议异步大模型客户端模块。"""

import json
import logging
from collections.abc import AsyncIterator
from typing import Any, Optional

import httpx

from Assistant import config
from Assistant.agent.errors import LLMError

logger = logging.getLogger("assistant.llm_client")

# 运行时内存视觉探测缓存：dict[model_name, is_supported]
_model_vision_cache: dict[str, bool] = {}


def set_model_vision_cache(model: str, supported: bool) -> None:
    """设置指定模型的视觉支持缓存状态（供测试或预设使用）。"""
    _model_vision_cache[model] = supported


def clear_model_vision_cache() -> None:
    """清空视觉支持缓存。"""
    _model_vision_cache.clear()


class LLMClient:
    """基于 httpx 的标准 OpenAI 兼容流式 HTTP 客户端。"""

    _model_vision_cache = _model_vision_cache

    @staticmethod
    def set_model_vision_cache(model: str, supported: bool) -> None:
        set_model_vision_cache(model, supported)

    @staticmethod
    def clear_model_vision_cache() -> None:
        clear_model_vision_cache()

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

    async def check_model_vision_support(self, model: Optional[str] = None) -> bool:
        """探测当前模型是否支持图片视觉输入（携带 1x1 最小合法图片探测单 token 输出并写内存缓存）。"""
        target_model = model or self.model
        if target_model in _model_vision_cache:
            return _model_vision_cache[target_model]

        if not self.api_key or not self.api_key.strip():
            logger.warning("未检测到 API Key，无法探测视觉支持")
            raise LLMError("NO_API_KEY")

        url = f"{self.base_url}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key.strip()}",
            "Content-Type": "application/json",
        }
        # 1x1 最小透明 PNG base64
        payload = {
            "model": target_model,
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": "test"},
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
                            },
                        },
                    ],
                }
            ],
            "max_tokens": 1,
        }

        try:
            client = self._custom_http_client or httpx.AsyncClient(timeout=float(self.timeout))
            try:
                response = await client.post(url, json=payload, headers=headers)
                if response.status_code == 200:
                    _model_vision_cache[target_model] = True
                    return True

                raw_error = response.text.lower()
                if response.status_code in (400, 422) or "does not support image" in raw_error or "invalid parameter" in raw_error:
                    _model_vision_cache[target_model] = False
                    return False

                if response.status_code in (401, 403):
                    raise LLMError("AUTH_FAILED")
                if response.status_code == 429:
                    raise LLMError("QUOTA_EXCEEDED")
                raise LLMError("UPSTREAM_ERROR")
            finally:
                if self._custom_http_client is None:
                    await client.aclose()
        except LLMError:
            raise
        except httpx.TimeoutException as exc:
            logger.error("模型视觉探测请求超时: %s", exc)
            raise LLMError("TIMEOUT") from exc
        except httpx.RequestError as exc:
            logger.error("模型视觉探测网络连接异常: %s", exc)
            raise LLMError("NETWORK_ERROR") from exc
        except Exception as exc:
            logger.exception("模型视觉探测发生未知异常: %s", exc)
            raise LLMError("INTERNAL_ERROR") from exc

    async def chat_completion(
        self,
        messages: list[dict[str, Any]],
        tools: Optional[list[dict]] = None,
    ) -> dict[str, Any]:
        """非流式调用大模型，返回包含 content 与可选 tool_calls 的 assistant 消息体。"""
        if not self.api_key or not self.api_key.strip():
            logger.warning("未检测到 API Key，阻断模型调用")
            raise LLMError("NO_API_KEY")

        url = f"{self.base_url}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key.strip()}",
            "Content-Type": "application/json",
        }
        payload: dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "stream": False,
        }
        if tools:
            payload["tools"] = tools

        logger.info("发起非流式模型请求: url=%s, model=%s, msg_count=%d, has_tools=%s", url, self.model, len(messages), bool(tools))

        try:
            client = self._custom_http_client or httpx.AsyncClient(timeout=float(self.timeout))
            try:
                response = await client.post(url, json=payload, headers=headers)
                if response.status_code != 200:
                    raw_error = response.text
                    logger.error(
                        "模型上游服务返回异常状态码: status=%d, body=%s",
                        response.status_code,
                        raw_error[:200],
                    )
                    if response.status_code in (401, 403):
                        raise LLMError("AUTH_FAILED")
                    if response.status_code == 429:
                        raise LLMError("QUOTA_EXCEEDED")
                    raise LLMError("UPSTREAM_ERROR")

                data = response.json()
                choices = data.get("choices") or []
                if not choices:
                    return {"role": "assistant", "content": ""}
                return choices[0].get("message") or {"role": "assistant", "content": ""}
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
