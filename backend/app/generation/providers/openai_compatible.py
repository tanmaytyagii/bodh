"""Provider for any OpenAI-compatible chat-completions endpoint.

Works with OpenAI and with local or hosted servers that speak the same API
(Ollama, vLLM, LM Studio, Groq, OpenRouter, ...) via LLM_BASE_URL. Structured
output uses `response_format` with a strict JSON schema (LLM_JSON_MODE=
json_schema) or plain JSON mode (json_object) for servers that lack schema
support; either way the reply is validated with Pydantic and repaired once.
"""

from __future__ import annotations

import copy
import json
import logging
import re
import time
from typing import Any, cast

import openai
from openai.types.chat import ChatCompletion
from pydantic import ValidationError

from app.config import Settings
from app.generation.llm import (
    LLMBadOutput,
    LLMNotConfigured,
    LLMRequestRejected,
    LLMUnavailable,
    StepConfig,
    T,
)

log = logging.getLogger(__name__)

_THINK = re.compile(r"<think>.*?</think>", re.DOTALL | re.IGNORECASE)
_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$")


def strict_schema(model: type[Any]) -> dict[str, Any]:
    """Pydantic JSON schema adjusted for strict structured-output modes: every
    object closed (additionalProperties false) and every property required
    (optional ones are already nullable)."""
    schema = copy.deepcopy(model.model_json_schema())

    def walk(node: Any) -> None:
        if isinstance(node, dict):
            node.pop("default", None)
            if node.get("type") == "object" and "properties" in node:
                node["additionalProperties"] = False
                node["required"] = list(node["properties"])
            for value in node.values():
                walk(value)
        elif isinstance(node, list):
            for item in node:
                walk(item)

    walk(schema)
    return schema


def extract_json(content: str) -> str:
    content = _THINK.sub("", content).strip()
    content = _FENCE.sub("", content).strip()
    start, end = content.find("{"), content.rfind("}")
    return content[start : end + 1] if start != -1 and end > start else content


class OpenAICompatibleProvider:
    provider = "openai"

    def __init__(self, settings: Settings) -> None:
        key = settings.llm_api_key or settings.openai_api_key
        if not key and not settings.llm_base_url:
            raise LLMNotConfigured(
                "LLM_PROVIDER=openai needs OPENAI_API_KEY (or LLM_API_KEY), or LLM_BASE_URL "
                "for a local server such as Ollama (http://localhost:11434/v1)."
            )
        self.client = openai.OpenAI(
            base_url=settings.llm_base_url,
            api_key=key or "not-needed",
            timeout=settings.llm_timeout_seconds,
            max_retries=2,
        )
        self.json_mode = settings.llm_json_mode

    def structured(self, *, system: str, user: str, schema: type[T], step: StepConfig) -> T:
        json_schema = strict_schema(schema)
        if self.json_mode == "json_schema":
            response_format: dict[str, Any] = {
                "type": "json_schema",
                "json_schema": {"name": schema.__name__, "schema": json_schema, "strict": True},
            }
            instructions = system
        else:
            response_format = {"type": "json_object"}
            instructions = (
                f"{system}\n\nReply with a single JSON object that matches this JSON schema:\n"
                f"{json.dumps(json_schema)}"
            )
        messages: list[dict[str, str]] = [
            {"role": "system", "content": instructions},
            {"role": "user", "content": user},
        ]

        content = self._complete(messages, response_format, step)
        try:
            return schema.model_validate_json(extract_json(content))
        except ValidationError as first_error:
            log.info("Repairing malformed structured output: %s", first_error.error_count())
            messages += [
                {"role": "assistant", "content": content},
                {
                    "role": "user",
                    "content": "That reply did not match the required JSON schema: "
                    f"{first_error}. Reply again with only the corrected JSON object.",
                },
            ]
            content = self._complete(messages, response_format, step)
            try:
                return schema.model_validate_json(extract_json(content))
            except ValidationError as exc:
                raise LLMBadOutput(
                    "The model's reply did not match the expected format.", retryable=True
                ) from exc

    def _complete(
        self, messages: list[dict[str, str]], response_format: dict[str, Any], step: StepConfig
    ) -> str:
        started = time.perf_counter()
        params: dict[str, Any] = {
            "model": step.model,
            "messages": messages,
            "response_format": response_format,
            "max_tokens": step.max_tokens,
            "temperature": 0.3,
        }
        try:
            completion = cast(ChatCompletion, self.client.chat.completions.create(**params))
        except openai.AuthenticationError as exc:
            raise LLMRequestRejected("The API key was rejected by the LLM endpoint.") from exc
        except openai.NotFoundError as exc:
            raise LLMRequestRejected(f"Unknown model {step.model!r}; check LLM_MODEL.") from exc
        except openai.BadRequestError as exc:
            raise LLMRequestRejected(f"The LLM endpoint rejected the request: {exc.message}") from exc
        except openai.RateLimitError as exc:
            raise LLMUnavailable("Rate limited by the LLM endpoint.", retryable=True) from exc
        except openai.APITimeoutError as exc:
            raise LLMUnavailable("The LLM endpoint timed out.", retryable=True) from exc
        except openai.APIConnectionError as exc:
            raise LLMUnavailable("Could not reach the LLM endpoint.", retryable=True) from exc
        except openai.APIStatusError as exc:
            raise LLMUnavailable(
                f"LLM endpoint error {exc.status_code}.", retryable=exc.status_code >= 500
            ) from exc
        choice = completion.choices[0]
        log.info(
            "openai-compatible %s finish=%s %.1fs",
            step.model,
            choice.finish_reason,
            time.perf_counter() - started,
        )
        if choice.finish_reason == "length":
            raise LLMBadOutput("The model's reply was cut off (max tokens).", retryable=True)
        return choice.message.content or ""
