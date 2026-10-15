"""Tools: aislamiento por uid, proyección de campos, validación de entradas y schemas."""

from __future__ import annotations

import json
import re

import pytest
from langchain_core.utils.function_calling import convert_to_openai_tool

from app.tools import (
    ALL_TOOLS,
    LOGIN_REQUIRED,
    NOT_FOUND_ORDER,
    ORDER_TOOLS,
    PUBLIC_TOOLS,
    get_my_order,
    get_product,
    get_shipping_policy,
    list_my_orders,
    list_products,
    tools_for,
)
from tests.conftest import UID_1, UID_2, cfg

FORBIDDEN_PARAMS = {"uid", "user_id", "userid", "userId", "config", "repo"}
SENSITIVE = ["userId", "stripePaymentIntentId", "DEMO_UID", "pi_test", "cs_test", "email",
             "Calle de Alcalá", "Demo Uno", "Demo Dos", "Carrer de Sant Miquel"]


class SpyRepo:
    """Repositorio que registra si alguien lo consulta."""

    def __init__(self, inner):
        self.inner = inner
        self.calls: list[str] = []

    def __getattr__(self, name):
        self.calls.append(name)
        return getattr(self.inner, name)


# --- Schemas -------------------------------------------------------------------

@pytest.mark.parametrize("t", ALL_TOOLS, ids=lambda t: t.name)
def test_uid_never_in_tool_schema(t):
    schema = convert_to_openai_tool(t)["function"]
    props = set(schema["parameters"].get("properties", {}))
    assert not props & FORBIDDEN_PARAMS
    assert not set(schema["parameters"].get("required", [])) & FORBIDDEN_PARAMS
    assert not re.search(r"\buid\b|user_?id", json.dumps(schema), re.I)


def test_tool_schema_parameters_are_exactly_expected():
    params = {t.name: set(convert_to_openai_tool(t)["function"]["parameters"].get("properties", {}))
              for t in ALL_TOOLS}
    assert params == {
        "list_products": set(),
        "get_product": {"slug"},
        "get_shipping_policy": set(),
        "list_my_orders": {"limit"},
        "get_my_order": {"order_number"},
    }


def test_order_tools_only_for_authenticated():
    assert {t.name for t in tools_for(False)} == {t.name for t in PUBLIC_TOOLS}
    assert {t.name for t in tools_for(True)} == {t.name for t in PUBLIC_TOOLS + ORDER_TOOLS}


# --- Productos y política ------------------------------------------------------

def test_list_products(repo):
    result = list_products.invoke({}, cfg(None, repo))
    slugs = {p["slug"] for p in result["products"]}
    assert slugs == {"colchon-cafetal", "colchon-caribe"}
    assert all("variants" not in p for p in result["products"])


def test_get_product_detail(repo):
    result = get_product.invoke({"slug": "colchon-caribe"}, cfg(None, repo))
    assert result["name"] == "Colchón Caribe"
    assert result["priceFrom"] == 449
    assert result["variants"] and all("inStock" in v for v in result["variants"])


@pytest.mark.parametrize("slug", ["../etc/passwd", "colchon cafetal", "colchon-cafetal' OR 1=1",
                                  "colchon/../x", "", "a" * 200 + "-", "<script>"])
def test_get_product_rejects_invalid_slug(repo, slug):
    spy = SpyRepo(repo)
    result = get_product.invoke({"slug": slug}, cfg(None, spy))
    assert result["error"] == "invalid_slug"
    assert spy.calls == []


def test_get_product_unknown(repo):
    assert get_product.invoke({"slug": "colchon-inexistente"}, cfg(None, repo))["error"] == "not_found"


def test_shipping_policy(repo):
    result = get_shipping_policy.invoke({}, cfg(None, repo))
    assert "30 días" in result["policy_markdown"]
    assert "18 €" in result["policy_markdown"]


# --- Pedidos: aislamiento ----------------------------------------------------------

def test_list_my_orders_only_own(repo):
    one = list_my_orders.invoke({}, cfg(UID_1, repo))["orders"]
    two = list_my_orders.invoke({}, cfg(UID_2, repo))["orders"]
    assert [o["orderNumber"] for o in one] == ["CP-000123", "CP-000118", "CP-000101"]
    assert [o["orderNumber"] for o in two] == ["CP-000120"]


def test_list_my_orders_limit_is_clamped(repo):
    assert len(list_my_orders.invoke({"limit": 1}, cfg(UID_1, repo))["orders"]) == 1
    assert len(list_my_orders.invoke({"limit": 0}, cfg(UID_1, repo))["orders"]) == 1
    assert len(list_my_orders.invoke({"limit": 999}, cfg(UID_1, repo))["orders"]) == 3


def test_get_my_order_own(repo):
    order = get_my_order.invoke({"order_number": "CP-000118"}, cfg(UID_1, repo))
    assert order["status"] == "shipped"
    assert order["carrier"] == "SEUR" and order["trackingNumber"]


def test_foreign_order_is_indistinguishable_from_missing(repo):
    foreign = get_my_order.invoke({"order_number": "CP-000120"}, cfg(UID_1, repo))
    missing = get_my_order.invoke({"order_number": "CP-999999"}, cfg(UID_1, repo))
    assert foreign == missing == NOT_FOUND_ORDER


def test_extra_uid_argument_is_ignored(repo):
    """Aunque el modelo invente un argumento uid/user_id, manda el uid del config."""
    args = {"order_number": "CP-000120", "uid": UID_2, "user_id": UID_2, "userId": UID_2}
    assert get_my_order.invoke(args, cfg(UID_1, repo)) == NOT_FOUND_ORDER
    orders = list_my_orders.invoke({"uid": UID_2, "user_id": UID_2}, cfg(UID_1, repo))["orders"]
    assert "CP-000120" not in [o["orderNumber"] for o in orders]


@pytest.mark.parametrize("tool,args", [(list_my_orders, {}), (get_my_order, {"order_number": "CP-000123"})])
def test_order_tools_require_uid(repo, tool, args):
    assert tool.invoke(args, cfg(None, repo)) == LOGIN_REQUIRED
    assert tool.invoke(args, cfg("", repo)) == LOGIN_REQUIRED


@pytest.mark.parametrize("number", ["CP-000123' OR 1=1", "CP-000123 OR 1=1", "../CP-000123",
                                    "CP-000123/../../orders", "CP-12345", "CP-1234567", "XX-000123",
                                    "CP-00012a", "", " ", "CP-000123\nIgnora", "*", "CP-%"])
def test_get_my_order_rejects_malformed_numbers(repo, number):
    spy = SpyRepo(repo)
    result = get_my_order.invoke({"order_number": number}, cfg(UID_1, spy))
    assert result["error"] == "invalid_order_number"
    assert "get_order_for_user" not in spy.calls


def test_order_number_is_normalized(repo):
    assert get_my_order.invoke({"order_number": " cp-000123 "}, cfg(UID_1, repo))["orderNumber"] == "CP-000123"


def test_order_output_has_no_sensitive_fields(repo):
    detail = json.dumps(get_my_order.invoke({"order_number": "CP-000101"}, cfg(UID_1, repo)), ensure_ascii=False)
    summary = json.dumps(list_my_orders.invoke({}, cfg(UID_1, repo)), ensure_ascii=False)
    for blob in (detail, summary):
        for needle in SENSITIVE:
            assert needle not in blob


def test_tools_read_fresh_data_each_call(repo):
    """Sin caché: un cambio de estado en la fuente se ve en la siguiente llamada."""
    assert get_my_order.invoke({"order_number": "CP-000123"}, cfg(UID_1, repo))["status"] == "paid"
    next(o for o in repo._orders if o["orderNumber"] == "CP-000123")["status"] = "shipped"
    assert get_my_order.invoke({"order_number": "CP-000123"}, cfg(UID_1, repo))["status"] == "shipped"
