"""Anthropic Messages API provider.

Structured output uses `messages.parse(output_format=...)`, which validates the
reply against the Pydantic schema. Requests opt into server-side refusal
fallbacks (`fallbacks="default"`): if a safety classifier declines a request,
the API retries it on the model Anthropic recommends for that category instead
of failing. The stable system prompt carries a cache breakpoint.
"""

from __future__ import annotations

import logging
import time
from typing import cast

import anthropic
from anthropic.types.beta import BetaOutputConfigParam

from app.config import Settings
from app.generation.llm import (
    LLMBadOutput,
    LLMNotConfigured,
    LLMRefused,
    LLMRequestRejected,
    LLMUnavailable,
    StepConfig,
    T,
)

log = logging.getLogger(__name__)

FALLBACK_BETA = "server-side-fallback-2026-07-01"


class AnthropicProvider:
    provider = "anthropic"

    def __init__(self, settings: Settings) -> None:
        key = settings.llm_api_key or settings.anthropic_api_key
        client = anthropic.Anthropic(api_key=key or None, timeout=settings.llm_timeout_seconds, max_retries=2)
        # Without an explicit key the SDK also resolves ANTHROPIC_API_KEY,
        # ANTHROPIC_AUTH_TOKEN and `ant auth login` profiles.
        if not (client.api_key or client.auth_token or getattr(client, "credentials", None)):
            raise LLMNotConfigured(
                "No Anthropic credentials found. Set ANTHROPIC_API_KEY (or LLM_API_KEY) in .env, "
                "or choose another provider with LLM_PROVIDER."
            )
        self.client = client
        self.fallbacks = settings.llm_refusal_fallbacks

    def structured(self, *, system: str, user: str, schema: type[T], step: StepConfig) -> T:
        started = time.perf_counter()
        extra = {"betas": [FALLBACK_BETA], "fallbacks": "default"} if self.fallbacks else {}
        try:
            response = self.client.beta.messages.parse(
                model=step.model,
                max_tokens=step.max_tokens,
                system=[{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
                messages=[{"role": "user", "content": user}],
                output_format=schema,
                output_config=cast(BetaOutputConfigParam, {"effort": step.effort}),
                **extra,  # type: ignore[arg-type]
            )
        except anthropic.AuthenticationError as exc:
            raise LLMRequestRejected("The Anthropic API key was rejected.") from exc
        except anthropic.PermissionDeniedError as exc:
            raise LLMRequestRejected("The Anthropic API key lacks permission for this model.") from exc
        except anthropic.NotFoundError as exc:
            raise LLMRequestRejected(f"Unknown model {step.model!r}; check LLM_MODEL.") from exc
        except anthropic.BadRequestError as exc:
            raise LLMRequestRejected(f"Anthropic rejected the request: {exc.message}") from exc
        except anthropic.RateLimitError as exc:
            raise LLMUnavailable("Rate limited by the Anthropic API.", retryable=True) from exc
        except anthropic.APITimeoutError as exc:
            raise LLMUnavailable("The Anthropic API timed out.", retryable=True) from exc
        except anthropic.APIConnectionError as exc:
            raise LLMUnavailable("Could not reach the Anthropic API.", retryable=True) from exc
        except anthropic.APIStatusError as exc:
            raise LLMUnavailable(
                f"Anthropic API error {exc.status_code}.", retryable=exc.status_code >= 500
            ) from exc
        except TypeError as exc:  # SDK raises this when no credentials resolve
            if "authentication" in str(exc).lower():
                raise LLMNotConfigured(str(exc)) from exc
            raise

        log.info(
            "anthropic %s effort=%s stop=%s in=%s out=%s cache_read=%s %.1fs",
            response.model,
            step.effort,
            response.stop_reason,
            response.usage.input_tokens,
            response.usage.output_tokens,
            response.usage.cache_read_input_tokens,
            time.perf_counter() - started,
        )
        if response.stop_reason == "refusal":
            raise LLMRefused("The model declined to answer this request.")
        if response.stop_reason == "max_tokens":
            raise LLMBadOutput("The model's reply was cut off (max tokens).", retryable=True)
        parsed = response.parsed_output
        if parsed is None:
            raise LLMBadOutput("The model's reply did not match the expected format.", retryable=True)
        return parsed
