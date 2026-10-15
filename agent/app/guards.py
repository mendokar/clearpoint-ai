"""Validación de la entrada y saneado de la salida del asistente (sin dependencias de LangGraph)."""

from __future__ import annotations

import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Any

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage

from app.prompts import PROMPT_CANARY, SUPPORT_EMAIL

ALLOWED_ROLES = {"user", "assistant"}

GENERIC_BLOCKED_REPLY = (
    "Lo siento, no puedo compartir esa información. Puedo ayudarte con nuestros colchones, "
    "las condiciones de envío y devolución o el estado de tus pedidos."
)
ITERATION_LIMIT_REPLY = (
    "Lo siento, no he podido completar la consulta en este momento. Prueba a reformular la "
    f"pregunta o escríbenos a {SUPPORT_EMAIL}."
)
EMPTY_REPLY = (
    "Lo siento, no he podido generar una respuesta. Prueba de nuevo o escríbenos a "
    f"{SUPPORT_EMAIL}."
)


@dataclass(frozen=True)
class InputError(Exception):
    code: str
    message: str


@dataclass(frozen=True)
class InputLimits:
    max_user_chars: int = 1000
    max_assistant_chars: int = 4000
    max_history: int = 20


def _role_and_content(item: Any) -> tuple[str, Any]:
    if isinstance(item, Mapping):
        return item.get("role"), item.get("content")
    if isinstance(item, HumanMessage):
        return "user", item.content
    if isinstance(item, AIMessage):
        return "assistant", item.content
    role = getattr(item, "role", None)
    return role, getattr(item, "content", None)


def prepare_history(messages: Sequence[Any], limits: InputLimits) -> list[BaseMessage]:
    """Valida la conversación del cliente y devuelve los últimos N mensajes como mensajes LangChain.

    Solo se aceptan roles user/assistant con texto plano. El system prompt lo pone el servidor.
    """
    if not messages:
        raise InputError("empty", "La conversación está vacía.")

    parsed: list[tuple[str, str]] = []
    for item in messages:
        role, content = _role_and_content(item)
        if role not in ALLOWED_ROLES:
            raise InputError("invalid_role", "Solo se aceptan mensajes de usuario y asistente.")
        if not isinstance(content, str):
            raise InputError("invalid_content", "El contenido del mensaje debe ser texto.")
        content = content.strip()
        if role == "user" and len(content) > limits.max_user_chars:
            raise InputError(
                "message_too_long",
                f"El mensaje supera el máximo de {limits.max_user_chars} caracteres.",
            )
        if role == "assistant" and len(content) > limits.max_assistant_chars:
            raise InputError("message_too_long", "Un mensaje del historial es demasiado largo.")
        parsed.append((role, content))

    if parsed[-1][0] != "user" or not parsed[-1][1]:
        raise InputError("empty", "El último mensaje debe ser una pregunta del usuario.")

    window = [m for m in parsed if m[1]][-limits.max_history :]
    while window and window[0][0] != "user":  # la conversación debe empezar por el usuario
        window.pop(0)

    return [HumanMessage(c) if r == "user" else AIMessage(c) for r, c in window]


# --- Salida -----------------------------------------------------------------

_STRIPE_ID = re.compile(
    r"\b(?:pi|cs|ch|cus|pm|seti|re|in|sub|evt|sk|rk|whsec)_(?:test_|live_)?[A-Za-z0-9_]{8,}\b"
)
_API_KEY = re.compile(r"\b(?:sk-ant-|sk-proj-|sk-)[A-Za-z0-9_\-]{16,}")
_INTERNAL_FIELDS = re.compile(r"\b(?:userId|stripePaymentIntentId|stripeSessionId)\b", re.I)
_WS = re.compile(r"\s+")


def _norm(text: str) -> str:
    return _WS.sub(" ", text).strip().lower()


def find_leak(text: str, *, uid: str | None, system_prompt: str) -> str | None:
    """Devuelve el motivo si la respuesta filtra algo interno; None si es segura."""
    if PROMPT_CANARY.lower() in text.lower():
        return "system_prompt"
    if uid and uid in text:
        return "uid"
    if _STRIPE_ID.search(text):
        return "stripe_id"
    if _API_KEY.search(text):
        return "secret"
    if _INTERNAL_FIELDS.search(text):
        return "internal_field"
    normalized = _norm(text)
    for line in system_prompt.splitlines():
        fragment = _norm(line).lstrip("-0123456789. ")
        # Frases largas copiadas literalmente del prompt = intento de revelar instrucciones.
        if len(fragment) >= 60 and fragment[:60] in normalized:
            return "system_prompt"
    return None


def message_text(message: BaseMessage) -> str:
    """Solo el texto visible (descarta bloques de pensamiento y tool_use)."""
    content = message.content
    if isinstance(content, str):
        return content
    parts: list[str] = []
    for block in content:
        if isinstance(block, str):
            parts.append(block)
        elif isinstance(block, Mapping) and block.get("type") == "text":
            parts.append(str(block.get("text", "")))
    return "".join(parts)
