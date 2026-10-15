"""Modelos de chat: Anthropic (primario) con fallback opcional a OpenAI.

- Las tools se definen una sola vez (LangChain) y cada proveedor recibe su traducción con `bind_tools`.
- El fallback (`with_fallbacks`) se activa ante rate limit, errores 5xx/sobrecarga, timeout o error
  de conexión del primario. Errores de petición (400) o de clave (401/403) NO activan el fallback.
- `FORCE_FALLBACK=true` sustituye el primario por uno que falla siempre, para demostrar el fallback.
- El proveedor que respondió se lee de `response_metadata["model_provider"]`.
"""

from __future__ import annotations

import logging
from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Any

import anthropic
import openai
from langchain_core.language_models import BaseChatModel
from langchain_core.runnables import Runnable, RunnableLambda
from langchain_core.tools import BaseTool

from app.config import Settings

logger = logging.getLogger(__name__)


class ForcedFallbackError(RuntimeError):
    """Fallo simulado del proveedor primario (FORCE_FALLBACK=true)."""


class LLMNotConfiguredError(RuntimeError):
    """No hay ningún proveedor de LLM utilizable."""


FALLBACK_EXCEPTIONS: tuple[type[BaseException], ...] = (
    anthropic.RateLimitError,
    anthropic.InternalServerError,
    anthropic.OverloadedError,
    anthropic.ServiceUnavailableError,
    anthropic.APITimeoutError,
    anthropic.APIConnectionError,
    ForcedFallbackError,
)


def _raise_forced(_: Any) -> Any:
    raise ForcedFallbackError("FORCE_FALLBACK activo")


async def _araise_forced(_: Any) -> Any:
    raise ForcedFallbackError("FORCE_FALLBACK activo")


@dataclass
class ChatModels:
    """Agrupa el modelo primario y el de fallback y los enlaza a un conjunto de tools."""

    primary: BaseChatModel | None
    fallback: BaseChatModel | None = None
    force_fallback: bool = False
    _cache: dict[tuple[str, ...], Runnable] = field(default_factory=dict, repr=False)

    def __post_init__(self) -> None:
        if self.primary is None and self.fallback is None:
            raise LLMNotConfiguredError()

    def bind(self, tools: Sequence[BaseTool]) -> Runnable:
        key = tuple(t.name for t in tools)
        if key not in self._cache:
            self._cache[key] = self._build(tools)
        return self._cache[key]

    def _build(self, tools: Sequence[BaseTool]) -> Runnable:
        fallback = self.fallback.bind_tools(list(tools)) if self.fallback is not None else None
        if self.force_fallback and fallback is not None:
            primary: Runnable = RunnableLambda(_raise_forced, afunc=_araise_forced)
        elif self.primary is not None:
            primary = self.primary.bind_tools(list(tools))
        else:  # solo hay fallback configurado
            assert fallback is not None
            return fallback
        if fallback is None:
            return primary
        return primary.with_fallbacks([fallback], exceptions_to_handle=FALLBACK_EXCEPTIONS)


def build_chat_models(settings: Settings) -> ChatModels:
    """Crea los clientes reales a partir de la configuración. Lanza LLMNotConfiguredError si no hay clave."""
    if settings.anthropic_api_key is None:
        raise LLMNotConfiguredError()

    from langchain_anthropic import ChatAnthropic

    anthropic_kwargs: dict[str, Any] = {
        "model": settings.anthropic_model,
        "api_key": settings.anthropic_api_key,
        "max_tokens": settings.max_tokens,
        "timeout": settings.llm_timeout_seconds,
        "max_retries": settings.llm_max_retries,
    }
    if settings.anthropic_effort:
        anthropic_kwargs["effort"] = settings.anthropic_effort
    primary = ChatAnthropic(**anthropic_kwargs)

    fallback = None
    if settings.openai_api_key is not None:
        from langchain_openai import ChatOpenAI

        fallback = ChatOpenAI(
            model=settings.openai_model,
            api_key=settings.openai_api_key,
            max_tokens=settings.max_tokens,
            timeout=settings.llm_timeout_seconds,
            max_retries=settings.llm_max_retries,
        )
    elif settings.force_fallback:
        logger.warning("force_fallback_ignored", extra={"reason": "openai_not_configured"})

    logger.info(
        "llm_configured",
        extra={
            "primary_model": settings.anthropic_model,
            "fallback_model": settings.openai_model if fallback else None,
            "force_fallback": settings.force_fallback and fallback is not None,
        },
    )
    return ChatModels(
        primary=primary, fallback=fallback, force_fallback=settings.force_fallback
    )


def provider_of(message: Any) -> str:
    metadata = getattr(message, "response_metadata", None) or {}
    provider = metadata.get("model_provider")
    if provider:
        return str(provider)
    model_name = str(metadata.get("model_name") or metadata.get("model") or "")
    if model_name.startswith("claude"):
        return "anthropic"
    if model_name.startswith(("gpt", "o")):
        return "openai"
    return "unknown"
