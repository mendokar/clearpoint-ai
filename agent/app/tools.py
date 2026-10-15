"""Tools de SOLO LECTURA del asistente.

Reglas de seguridad:
- El `uid` NUNCA es un parámetro de una tool. Se lee de `config["configurable"]["uid"]`, que pone
  el servidor a partir del ID token verificado. El parámetro `config: RunnableConfig` lo inyecta
  LangChain y no aparece en el schema que ve el modelo.
- Cada tool consulta el repositorio en cada llamada (sin caché): datos siempre actuales.
- Se devuelven solo los campos necesarios (sin userId, stripePaymentIntentId, email, dirección completa...).
- `get_my_order` responde lo mismo si el pedido no existe o es de otro usuario (no filtra existencia).
"""

from __future__ import annotations

import re
from datetime import date, datetime
from typing import Any

from langchain_core.runnables import RunnableConfig
from langchain_core.tools import BaseTool, tool

from app.repository import Repository

SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+){0,7}$")
ORDER_NUMBER_RE = re.compile(r"^CP-\d{6}$")
MAX_ORDERS = 10

STATUS_LABELS = {
    "paid": "Pagado (preparación en curso)",
    "preparing": "En preparación",
    "shipped": "Enviado",
    "delivered": "Entregado",
    "cancelled": "Cancelado",
}

NOT_FOUND_ORDER = {
    "error": "not_found",
    "message": "No se ha encontrado ningún pedido con ese número en la cuenta del cliente.",
}
LOGIN_REQUIRED = {
    "error": "login_required",
    "message": "El cliente no ha iniciado sesión. Debe iniciar sesión para consultar sus pedidos.",
}


def _configurable(config: RunnableConfig | None) -> dict[str, Any]:
    return (config or {}).get("configurable", {}) or {}


def _repo(config: RunnableConfig | None) -> Repository:
    repo = _configurable(config).get("repo")
    if repo is None:
        raise RuntimeError("Repositorio no configurado")
    return repo


def _uid(config: RunnableConfig | None) -> str | None:
    uid = _configurable(config).get("uid")
    return uid if isinstance(uid, str) and uid else None


def _iso(value: Any) -> Any:
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    return value


# --- Proyecciones (lista blanca de campos) -----------------------------------


def _product_summary(p: dict[str, Any]) -> dict[str, Any]:
    variants = p.get("variants") or []
    prices = [v["price"] for v in variants if isinstance(v.get("price"), (int, float))]
    return {
        "slug": p.get("slug"),
        "name": p.get("name"),
        "shortDescription": p.get("shortDescription"),
        "priceFrom": p.get("priceFrom", min(prices) if prices else None),
        "currency": p.get("currency", "EUR"),
        "options": p.get("options", []),
    }


def _product_detail(p: dict[str, Any]) -> dict[str, Any]:
    detail = _product_summary(p)
    detail.update(
        {
            "description": p.get("description"),
            "features": p.get("features", []),
            "optionDetails": p.get("optionDetails", {}),
            "variants": [
                {
                    "sku": v.get("sku"),
                    "options": v.get("options", {}),
                    "price": v.get("price"),
                    "currency": v.get("currency", "EUR"),
                    "inStock": bool(v.get("inStock")),
                }
                for v in p.get("variants") or []
            ],
        }
    )
    return detail


def _order_common(o: dict[str, Any]) -> dict[str, Any]:
    status = o.get("status")
    return {
        "orderNumber": o.get("orderNumber"),
        "status": status,
        "statusLabel": STATUS_LABELS.get(status, status),
        "total": o.get("total"),
        "currency": o.get("currency", "EUR"),
        "createdAt": _iso(o.get("createdAt")),
        "carrier": o.get("carrier"),
        "trackingNumber": o.get("trackingNumber"),
        "estimatedDelivery": _iso(o.get("estimatedDelivery")),
    }


def _order_summary(o: dict[str, Any]) -> dict[str, Any]:
    summary = _order_common(o)
    summary["items"] = [
        f"{i.get('quantity', 1)} × {i.get('name')}" for i in o.get("items") or []
    ]
    return summary


def _order_detail(o: dict[str, Any]) -> dict[str, Any]:
    detail = _order_common(o)
    address = o.get("shippingAddress") or {}
    detail.update(
        {
            "statusHistory": [
                {"status": h.get("status"), "at": _iso(h.get("at"))}
                for h in o.get("statusHistory") or []
            ],
            "items": [
                {
                    "name": i.get("name"),
                    "options": i.get("options", {}),
                    "unitPrice": i.get("unitPrice"),
                    "quantity": i.get("quantity"),
                }
                for i in o.get("items") or []
            ],
            "subtotal": o.get("subtotal"),
            "shipping": o.get("shipping"),
            # Solo destino aproximado; ni nombre ni calle.
            "shippingDestination": {
                "city": address.get("city"),
                "postalCode": address.get("postalCode"),
                "country": address.get("country"),
            },
            "updatedAt": _iso(o.get("updatedAt")),
        }
    )
    return detail


# --- Tools ------------------------------------------------------------------


@tool
def list_products(config: RunnableConfig) -> dict[str, Any]:
    """Lista los colchones a la venta en Colchones Contoso con su precio desde, medidas y opciones."""
    products = _repo(config).list_products()
    return {"products": [_product_summary(p) for p in products]}


@tool
def get_product(slug: str, config: RunnableConfig) -> dict[str, Any]:
    """Devuelve el detalle de un colchón: descripción, características, núcleos, fundas y precio
    y disponibilidad de cada combinación (variante). `slug` es el identificador del producto
    devuelto por list_products, por ejemplo "colchon-cafetal"."""
    slug = (slug or "").strip().lower()
    if not SLUG_RE.fullmatch(slug):
        return {"error": "invalid_slug", "message": "Identificador de producto no válido."}
    product = _repo(config).get_product(slug)
    if product is None:
        return {"error": "not_found", "message": "No existe ningún producto con ese identificador."}
    return _product_detail(product)


@tool
def get_shipping_policy(config: RunnableConfig) -> dict[str, Any]:
    """Devuelve la política de envíos, plazos, costes, devoluciones, cambios de medida y garantía."""
    policy = _repo(config).get_shipping_policy()
    if not policy:
        return {"error": "not_found", "message": "La política no está disponible ahora mismo."}
    return {"title": policy.get("title"), "policy_markdown": policy.get("body_md")}


@tool
def list_my_orders(config: RunnableConfig, limit: int = 5) -> dict[str, Any]:
    """Lista los pedidos más recientes del cliente que ha iniciado sesión, con su estado actual,
    total y seguimiento. `limit` es el número de pedidos a devolver (1 a 10, por defecto 5)."""
    uid = _uid(config)
    if uid is None:
        return LOGIN_REQUIRED
    try:
        limit = int(limit)
    except (TypeError, ValueError):
        limit = 5
    limit = max(1, min(MAX_ORDERS, limit))
    orders = _repo(config).list_orders_for_user(uid, limit)
    return {"orders": [_order_summary(o) for o in orders if o.get("userId") == uid]}


@tool
def get_my_order(order_number: str, config: RunnableConfig) -> dict[str, Any]:
    """Devuelve el detalle actualizado de un pedido del cliente que ha iniciado sesión: estado,
    historial, artículos, importes, transportista, número de seguimiento y entrega estimada.
    `order_number` tiene el formato CP-000123."""
    uid = _uid(config)
    if uid is None:
        return LOGIN_REQUIRED
    order_number = (order_number or "").strip().upper()
    if not ORDER_NUMBER_RE.fullmatch(order_number):
        return {
            "error": "invalid_order_number",
            "message": "El número de pedido debe tener el formato CP- seguido de 6 dígitos (p. ej. CP-000123).",
        }
    order = _repo(config).get_order_for_user(uid, order_number)
    if order is None or order.get("userId") != uid:
        return NOT_FOUND_ORDER
    return _order_detail(order)


PUBLIC_TOOLS: list[BaseTool] = [list_products, get_product, get_shipping_policy]
ORDER_TOOLS: list[BaseTool] = [list_my_orders, get_my_order]
ALL_TOOLS: list[BaseTool] = PUBLIC_TOOLS + ORDER_TOOLS


def tools_for(authenticated: bool) -> list[BaseTool]:
    """Tools que se enlazan al modelo: las de pedidos solo con usuario autenticado."""
    return ALL_TOOLS if authenticated else PUBLIC_TOOLS
