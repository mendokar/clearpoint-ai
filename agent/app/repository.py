"""Capa de datos de solo lectura.

`Repository` es la interfaz; hay dos implementaciones:
- `FirestoreRepository`: producción. Consulta Firestore en cada llamada (sin caché),
  para que el estado de los pedidos sea siempre el actual.
- `InMemoryRepository`: tests y desarrollo local sin credenciales, cargada desde `data/`.

Los métodos de pedidos SIEMPRE reciben el `uid` del token verificado y filtran por él.
"""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any, Protocol

logger = logging.getLogger(__name__)


class Repository(Protocol):
    def list_products(self) -> list[dict[str, Any]]: ...

    def get_product(self, slug: str) -> dict[str, Any] | None: ...

    def get_shipping_policy(self) -> dict[str, Any] | None: ...

    def list_orders_for_user(self, uid: str, limit: int) -> list[dict[str, Any]]: ...

    def get_order_for_user(self, uid: str, order_number: str) -> dict[str, Any] | None: ...


class InMemoryRepository:
    def __init__(
        self,
        products: list[dict[str, Any]],
        shipping_policy: dict[str, Any] | None,
        orders: list[dict[str, Any]],
    ) -> None:
        self._products = {p["slug"]: p for p in products}
        self._policy = shipping_policy
        self._orders = list(orders)

    @classmethod
    def from_data_dir(cls, data_dir: Path) -> "InMemoryRepository":
        catalog = json.loads((data_dir / "catalog.json").read_text(encoding="utf-8"))
        policy_md = (data_dir / "shipping_policy.md").read_text(encoding="utf-8")
        orders = json.loads((data_dir / "demo_orders.json").read_text(encoding="utf-8"))
        return cls(
            products=catalog["products"],
            shipping_policy={"title": "Envíos y devoluciones", "body_md": policy_md},
            orders=orders["orders"],
        )

    def list_products(self) -> list[dict[str, Any]]:
        return [p for p in self._products.values() if p.get("active", True)]

    def get_product(self, slug: str) -> dict[str, Any] | None:
        product = self._products.get(slug)
        return product if product and product.get("active", True) else None

    def get_shipping_policy(self) -> dict[str, Any] | None:
        return self._policy

    def list_orders_for_user(self, uid: str, limit: int) -> list[dict[str, Any]]:
        own = [o for o in self._orders if o.get("userId") == uid]
        own.sort(key=lambda o: str(o.get("createdAt", "")), reverse=True)
        return own[:limit]

    def get_order_for_user(self, uid: str, order_number: str) -> dict[str, Any] | None:
        for order in self._orders:
            if order.get("orderNumber") == order_number and order.get("userId") == uid:
                return order
        return None


class FirestoreRepository:
    """Lecturas directas a Firestore. La cuenta de servicio solo tiene `datastore.viewer`."""

    def __init__(self, client: Any) -> None:
        self._db = client
        from google.cloud.firestore import FieldFilter, Query

        self._field_filter = FieldFilter
        self._query = Query

    @classmethod
    def create(cls) -> "FirestoreRepository":
        from firebase_admin import firestore

        from app.auth import get_firebase_app

        return cls(firestore.client(app=get_firebase_app()))

    def list_products(self) -> list[dict[str, Any]]:
        docs = self._db.collection("products").where(filter=self._field_filter("active", "==", True)).stream()
        return [d.to_dict() for d in docs]

    def get_product(self, slug: str) -> dict[str, Any] | None:
        snap = self._db.collection("products").document(slug).get()
        data = snap.to_dict() if snap.exists else None
        return data if data and data.get("active", True) else None

    def get_shipping_policy(self) -> dict[str, Any] | None:
        snap = self._db.collection("content").document("shipping_policy").get()
        return snap.to_dict() if snap.exists else None

    def list_orders_for_user(self, uid: str, limit: int) -> list[dict[str, Any]]:
        # Usa el índice compuesto userId ASC, createdAt DESC.
        query = (
            self._db.collection("orders")
            .where(filter=self._field_filter("userId", "==", uid))
            .order_by("createdAt", direction=self._query.DESCENDING)
            .limit(limit)
        )
        return [d.to_dict() for d in query.stream()]

    def get_order_for_user(self, uid: str, order_number: str) -> dict[str, Any] | None:
        # El filtro por userId va en la propia consulta: nunca se leen pedidos ajenos.
        query = (
            self._db.collection("orders")
            .where(filter=self._field_filter("userId", "==", uid))
            .where(filter=self._field_filter("orderNumber", "==", order_number))
            .limit(1)
        )
        for doc in query.stream():
            data = doc.to_dict()
            if data.get("userId") == uid:  # defensa en profundidad
                return data
        return None


def build_repository(backend: str, data_dir: Path) -> Repository:
    if backend == "memory":
        logger.info("repository_selected", extra={"backend": "memory"})
        return InMemoryRepository.from_data_dir(data_dir)
    logger.info("repository_selected", extra={"backend": "firestore"})
    return FirestoreRepository.create()
