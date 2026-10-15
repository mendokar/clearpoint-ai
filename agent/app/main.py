"""API HTTP del asistente (FastAPI): /health y /chat con streaming SSE."""

from __future__ import annotations

import hashlib
import json
import logging
import time
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any, Literal

from fastapi import Depends, FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, ConfigDict, Field
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.auth import AuthUnavailableError, get_optional_uid
from app.config import Settings, get_settings
from app.graph import build_graph, stream_chat
from app.guards import InputError, InputLimits, prepare_history
from app.llm import ChatModels, LLMNotConfiguredError, build_chat_models
from app.logging_config import configure_logging
from app.ratelimit import RateLimiter
from app.repository import Repository, build_repository

logger = logging.getLogger("app")


class ChatMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")
    role: Literal["user", "assistant"]
    content: str = Field(max_length=8000)


class ChatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    messages: list[ChatMessage] = Field(min_length=1, max_length=100)


def _sse(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def _error(status_code: int, code: str, message: str, headers: dict[str, str] | None = None) -> JSONResponse:
    return JSONResponse({"error": {"code": code, "message": message}}, status_code, headers=headers)


def _client_ip(request: Request) -> str:
    # En Cloud Run el balanceador de Google añade la IP real del cliente al final de X-Forwarded-For.
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[-1].strip()
    return request.client.host if request.client else "unknown"


def _hash(value: str) -> str:
    return hashlib.sha256(value.encode()).hexdigest()[:12]


def create_app(
    settings: Settings | None = None,
    *,
    repository: Repository | None = None,
    models: ChatModels | None = None,
) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level)
    limits = InputLimits(
        max_user_chars=settings.max_user_message_chars,
        max_assistant_chars=settings.max_assistant_message_chars,
        max_history=settings.max_history_messages,
    )

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        app.state.repo = repository or build_repository(settings.repository_backend, settings.data_dir)
        chat_models = models
        if chat_models is None:
            try:
                chat_models = build_chat_models(settings)
            except LLMNotConfiguredError:
                logger.error("llm_not_configured", extra={"hint": "ANTHROPIC_API_KEY ausente"})
        app.state.graph = (
            build_graph(chat_models, limits=limits, max_tool_iterations=settings.max_tool_iterations)
            if chat_models
            else None
        )
        yield

    app = FastAPI(
        title="Colchones Contoso · Asistente",
        lifespan=lifespan,
        debug=False,
        docs_url=None,
        redoc_url=None,
        openapi_url=None,
    )
    app.state.rate_limiter = RateLimiter(settings.rate_limit_requests, settings.rate_limit_window_seconds)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.allowed_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type"],
        max_age=600,
    )

    @app.middleware("http")
    async def security_headers(request: Request, call_next):  # type: ignore[no-untyped-def]
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        response.headers["Cache-Control"] = "no-store"
        return response

    # --- Errores genéricos (nunca se devuelve la entrada ni trazas) -------------
    @app.exception_handler(RequestValidationError)
    async def _validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
        logger.info("request_invalid", extra={"errors": len(exc.errors())})
        return _error(422, "invalid_request", "La petición no es válida.")

    @app.exception_handler(StarletteHTTPException)
    async def _http_error(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        codes = {401: "unauthorized", 404: "not_found", 405: "method_not_allowed"}
        message = exc.detail if exc.status_code == 401 else "Error en la petición."
        return _error(exc.status_code, codes.get(exc.status_code, "error"), str(message), exc.headers)

    @app.exception_handler(AuthUnavailableError)
    async def _auth_unavailable(request: Request, exc: AuthUnavailableError) -> JSONResponse:
        return _error(503, "auth_unavailable", "Servicio no disponible temporalmente.")

    @app.exception_handler(Exception)
    async def _unhandled(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("unhandled_error")
        return _error(500, "internal_error", "Ha ocurrido un error inesperado.")

    # --- Endpoints ----------------------------------------------------------------
    @app.get("/health")
    async def health() -> dict[str, str]:
        return {"status": "ok"}

    @app.post("/chat")
    async def chat(
        body: ChatRequest, request: Request, uid: str | None = Depends(get_optional_uid)
    ) -> Any:
        key = f"uid:{uid}" if uid else f"ip:{_client_ip(request)}"
        if not request.app.state.rate_limiter.allow(key):
            logger.info("rate_limited", extra={"key_hash": _hash(key)})
            return _error(
                429, "rate_limited", "Has enviado demasiados mensajes. Espera unos minutos.",
                {"Retry-After": str(settings.rate_limit_window_seconds)},
            )

        raw = [m.model_dump() for m in body.messages]
        try:
            prepare_history(raw, limits)  # validación temprana para responder 400 (no SSE)
        except InputError as exc:
            return _error(400, exc.code, exc.message)

        graph = request.app.state.graph
        if graph is None:
            return _error(503, "llm_unavailable", "El asistente no está disponible en este momento.")

        repo = request.app.state.repo
        started = time.monotonic()

        async def events() -> AsyncIterator[str]:
            try:
                async for event, data in stream_chat(
                    graph, raw, uid=uid, repo=repo, max_tool_iterations=settings.max_tool_iterations
                ):
                    yield _sse(event, data)
            except Exception as exc:  # detalle solo en logs
                logger.error(
                    "chat_failed",
                    extra={"exc_type": type(exc).__name__, "status_code": getattr(exc, "status_code", None)},
                )
                yield _sse(
                    "error",
                    {"code": "llm_unavailable", "message": "El asistente no está disponible en este momento. Inténtalo de nuevo más tarde."},
                )
            finally:
                logger.info(
                    "chat_request",
                    extra={
                        "authenticated": uid is not None,
                        "messages": len(raw),
                        "duration_ms": int((time.monotonic() - started) * 1000),
                    },
                )

        return StreamingResponse(
            events(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache, no-store", "X-Accel-Buffering": "no"},
        )

    return app
