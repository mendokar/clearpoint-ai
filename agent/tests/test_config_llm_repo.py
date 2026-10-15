"""Configuración, construcción de modelos reales (sin red) y consultas de FirestoreRepository."""

from __future__ import annotations

from unittest.mock import MagicMock

import pytest
from langchain_core.messages import AIMessage
from langchain_core.runnables import RunnableWithFallbacks

from app.config import Settings
from app.llm import ChatModels, LLMNotConfiguredError, build_chat_models, provider_of
from app.repository import FirestoreRepository


def test_allowed_origins_from_csv(monkeypatch):
    monkeypatch.setenv("ALLOWED_ORIGINS", "https://a.example, http://localhost:3000 ,")
    monkeypatch.setenv("OPENAI_API_KEY", "")
    s = Settings(_env_file=None)
    assert s.allowed_origins == ["https://a.example", "http://localhost:3000"]
    assert s.openai_api_key is None and not s.fallback_enabled


def test_build_models_requires_anthropic_key():
    with pytest.raises(LLMNotConfiguredError):
        build_chat_models(Settings(_env_file=None, anthropic_api_key=None))


def test_build_models_accepts_default_model_id_and_limits():
    s = Settings(_env_file=None, anthropic_api_key="test-key-no-real")
    models = build_chat_models(s)
    assert models.primary.model == "claude-sonnet-5-5"
    assert models.primary.max_tokens == 1024
    assert models.primary.default_request_timeout == 30
    assert models.primary.max_retries == 1
    assert models.fallback is None
    assert not isinstance(models.bind([]), RunnableWithFallbacks)


def test_build_models_with_openai_fallback():
    s = Settings(_env_file=None, anthropic_api_key="a", openai_api_key="b", openai_model="gpt-5.4-mini")
    models = build_chat_models(s)
    assert models.fallback.model_name == "gpt-5.4-mini"
    assert isinstance(models.bind([]), RunnableWithFallbacks)


def test_chat_models_requires_one_provider():
    with pytest.raises(LLMNotConfiguredError):
        ChatModels(primary=None, fallback=None)


@pytest.mark.parametrize("meta,expected", [
    ({"model_provider": "anthropic"}, "anthropic"),
    ({"model_name": "claude-sonnet-5-5"}, "anthropic"),
    ({"model_name": "gpt-5.4-mini"}, "openai"),
    ({}, "unknown"),
])
def test_provider_of(meta, expected):
    assert provider_of(AIMessage("x", response_metadata=meta)) == expected


def _fake_db(docs):
    db = MagicMock()
    query = db.collection.return_value
    query.where.return_value = query
    query.order_by.return_value = query
    query.limit.return_value = query
    snaps = []
    for d in docs:
        snap = MagicMock()
        snap.to_dict.return_value = d
        snaps.append(snap)
    query.stream.return_value = snaps
    return db, query


def _filters(query):
    return [(c.kwargs["filter"].field_path, c.kwargs["filter"].op_string, c.kwargs["filter"].value)
            for c in query.where.call_args_list]


def test_firestore_list_orders_filters_by_uid():
    db, query = _fake_db([{"orderNumber": "CP-000001", "userId": "u1"}])
    repo = FirestoreRepository(db)
    assert repo.list_orders_for_user("u1", 5)[0]["orderNumber"] == "CP-000001"
    db.collection.assert_called_with("orders")
    assert ("userId", "==", "u1") in _filters(query)
    query.limit.assert_called_with(5)


def test_firestore_get_order_filters_by_uid_and_double_checks():
    db, query = _fake_db([{"orderNumber": "CP-000001", "userId": "otro"}])
    repo = FirestoreRepository(db)
    assert repo.get_order_for_user("u1", "CP-000001") is None  # defensa en profundidad
    assert ("userId", "==", "u1") in _filters(query)
    assert ("orderNumber", "==", "CP-000001") in _filters(query)


def test_firestore_products_and_policy():
    db, query = _fake_db([{"slug": "colchon-cafetal", "active": True}])
    doc = db.collection.return_value.document.return_value.get.return_value
    doc.exists = True
    doc.to_dict.return_value = {"slug": "colchon-cafetal", "active": True}
    repo = FirestoreRepository(db)
    assert repo.list_products()[0]["slug"] == "colchon-cafetal"
    assert repo.get_product("colchon-cafetal")["slug"] == "colchon-cafetal"
    assert repo.get_shipping_policy()["slug"] == "colchon-cafetal"
    doc.exists = False
    assert repo.get_product("x") is None and repo.get_shipping_policy() is None
