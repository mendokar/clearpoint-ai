"""Configuración del servicio leída de variables de entorno (y de `.env` en local)."""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Annotated, Literal

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

# Raíz del monorepo (agent/app/config.py -> ../../). En Docker se sobreescribe con DATA_DIR.
_DEFAULT_DATA_DIR = Path(__file__).resolve().parents[2] / "data"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # --- LLM ---
    anthropic_api_key: SecretStr | None = None
    anthropic_model: str = "claude-sonnet-5-5"
    # Esfuerzo de razonamiento (pensamiento adaptativo) para modelos que lo soportan.
    # "low" deja casi todo el presupuesto de max_tokens para la respuesta.
    anthropic_effort: Literal["low", "medium", "high"] | None = "low"
    openai_api_key: SecretStr | None = None
    openai_model: str = "gpt-5.4-mini"
    force_fallback: bool = False

    llm_timeout_seconds: float = 30.0
    llm_max_retries: int = 1
    max_tokens: int = 1024

    # --- Límites de la conversación ---
    max_tool_iterations: int = 5
    max_user_message_chars: int = 1000
    max_assistant_message_chars: int = 4000
    max_history_messages: int = 20
    rate_limit_requests: int = 20
    rate_limit_window_seconds: int = 600

    # --- Datos y auth ---
    repository_backend: Literal["firestore", "memory"] = "firestore"
    data_dir: Path = _DEFAULT_DATA_DIR
    firebase_project_id: str | None = None

    # --- HTTP ---
    # Lista separada por comas (NoDecode: no se interpreta como JSON).
    allowed_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["http://localhost:3000"]
    )
    log_level: str = "INFO"

    @field_validator("allowed_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        if isinstance(value, str):
            return [o.strip() for o in value.split(",") if o.strip()]
        return value

    @field_validator("anthropic_api_key", "openai_api_key", mode="before")
    @classmethod
    def _empty_to_none(cls, value: object) -> object:
        return None if value in ("", None) else value

    @field_validator("anthropic_effort", mode="before")
    @classmethod
    def _empty_effort(cls, value: object) -> object:
        return None if value in ("", "none", None) else value

    @property
    def fallback_enabled(self) -> bool:
        return self.openai_api_key is not None


@lru_cache
def get_settings() -> Settings:
    return Settings()
