"""Language-model access behind a small, provider-neutral interface.

Two providers are included: Anthropic (default) and any OpenAI-compatible
endpoint (OpenAI, Ollama, Groq, OpenRouter, vLLM, ...). Each lives in its own
module; this file only defines the contract, the errors the rest of the app
handles, and the factory.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from functools import lru_cache
from typing import Literal, Protocol, TypeVar

from pydantic import BaseModel

from app.config import Settings, get_settings

log = logging.getLogger(__name__)

T = TypeVar("T", bound=BaseModel)
Step = Literal["understand", "answer"]


class LLMError(RuntimeError):
    """Base class. `code` is stable and safe to show to API clients."""

    code = "llm_error"

    def __init__(self, message: str, *, retryable: bool = False) -> None:
        super().__init__(message)
        self.retryable = retryable


class LLMNotConfigured(LLMError):
    code = "llm_not_configured"


class LLMUnavailable(LLMError):
    """Rate limits, overload, timeouts, network failures, server errors."""

    code = "llm_unavailable"


class LLMRequestRejected(LLMError):
    """The provider rejected the request (bad model name, invalid key, ...)."""

    code = "llm_request_rejected"


class LLMRefused(LLMError):
    code = "llm_refused"


class LLMBadOutput(LLMError):
    code = "llm_bad_output"


@dataclass(frozen=True)
class StepConfig:
    model: str
    effort: str
    max_tokens: int


class LLMClient(Protocol):
    provider: str

    def structured(self, *, system: str, user: str, schema: type[T], step: StepConfig) -> T:
        """Run one request and return the response parsed into `schema`."""
        ...


def step_config(settings: Settings, step: Step) -> StepConfig:
    if step == "understand":
        return StepConfig(
            model=settings.resolved_fast_model,
            effort=settings.llm_understand_effort,
            max_tokens=settings.llm_understand_max_tokens,
        )
    return StepConfig(
        model=settings.llm_model,
        effort=settings.llm_answer_effort,
        max_tokens=settings.llm_max_output_tokens,
    )


def create_llm(settings: Settings) -> LLMClient | None:
    """The configured client, or None when generation is disabled (LLM_PROVIDER=none).

    Raises LLMNotConfigured when a provider is selected but has no credentials.
    """
    if settings.llm_provider == "none":
        return None
    if settings.llm_provider == "anthropic":
        from app.generation.providers.anthropic_provider import AnthropicProvider

        return AnthropicProvider(settings)
    from app.generation.providers.openai_compatible import OpenAICompatibleProvider

    return OpenAICompatibleProvider(settings)


@dataclass
class LLMStatus:
    provider: str
    configured: bool
    model: str | None
    detail: str | None = None


@lru_cache
def get_llm() -> tuple[LLMClient | None, LLMStatus]:
    settings = get_settings()
    try:
        client = create_llm(settings)
    except LLMNotConfigured as exc:
        log.warning("Language model not configured: %s", exc)
        return None, LLMStatus(settings.llm_provider, False, settings.llm_model, str(exc))
    if client is None:
        return None, LLMStatus("none", False, None, "Generation disabled (LLM_PROVIDER=none).")
    return client, LLMStatus(settings.llm_provider, True, settings.llm_model)
