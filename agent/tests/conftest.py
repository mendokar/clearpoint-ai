from __future__ import annotations

from pathlib import Path

import pytest

from app.config import Settings
from app.repository import InMemoryRepository

DATA_DIR = Path(__file__).resolve().parents[2] / "data"

UID_1 = "DEMO_UID_1"
UID_2 = "DEMO_UID_2"


@pytest.fixture
def repo() -> InMemoryRepository:
    return InMemoryRepository.from_data_dir(DATA_DIR)


@pytest.fixture
def settings() -> Settings:
    return Settings(
        _env_file=None,
        repository_backend="memory",
        data_dir=DATA_DIR,
        anthropic_api_key=None,
        openai_api_key=None,
        allowed_origins="https://tienda.example,http://localhost:3000",
        rate_limit_requests=20,
        log_level="INFO",
    )


def cfg(uid: str | None, repo: InMemoryRepository) -> dict:
    return {"configurable": {"uid": uid, "repo": repo}}
