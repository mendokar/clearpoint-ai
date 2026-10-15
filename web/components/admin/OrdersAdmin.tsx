"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useState, type FormEvent } from "react";
import { OrderStatusBadge } from "@/components/orders/OrderStatus";
import { ArrowRight } from "@/components/ui/Icons";
import { Notice } from "@/components/ui/Notice";
import { SkeletonGroup, SkeletonRow } from "@/components/ui/Skeleton";
import { adminFetch, errorMessage } from "@/lib/admin/client";
import { formatDate, formatOptions, formatPrice } from "@/lib/format";
import { ORDER_STATUSES, type OrderStatus } from "@/lib/orders/status";
import { STATUS_LABELS } from "@/lib/schemas";

export type AdminOrder = {
  id: string;
  orderNumber: string;
  email: string;
  userId: string;
  status: OrderStatus;
  statusHistory: { status: OrderStatus; at: string | null }[];
  items: { productSlug: string; name: string; sku: string; options: Record<string, string>; unitPrice: number; quantity: number }[];
  subtotal: number;
  shipping: number;
  total: number;
  currency: string;
  shippingAddress: {
    name: string;
    line1: string;
    line2?: string | null;
    city: string;
    postalCode: string;
    state?: string | null;
    country: string;
  } | null;
  carrier: string | null;
  trackingNumber: string | null;
  estimatedDelivery: string | null;
  stripePaymentIntentId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  /** Primera vez que un admin abrió el detalle; sin él, un pedido pagado cuenta como "nuevo". */
  reviewedAt?: string | null;
  /** Avisos de cambio de estado ya enviados al cliente (idempotencia). */
  notifiedStatuses?: Partial<Record<OrderStatus, string>>;
};

export const isNewOrder = (o: Pick<AdminOrder, "status" | "reviewedAt">) => o.status === "paid" && !o.reviewedAt;

type ListResponse = { orders: AdminOrder[]; nextCursor: string | null };

/** Todos los pedidos (más recientes primero), paginados, con filtro por estado y búsqueda por número. */
export function OrdersAdmin({ initialStatus = "" }: { initialStatus?: OrderStatus | "" }) {
  const [status, setStatus] = useState<OrderStatus | "">(initialStatus);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [orders, setOrders] = useState<AdminOrder[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const ids = useId();

  const fetchPage = useCallback(
    async (after: string | null) => {
      const params = new URLSearchParams();
      if (query) params.set("orderNumber", query);
      else {
        if (status) params.set("status", status);
        if (after) params.set("cursor", after);
      }
      return adminFetch<ListResponse>(`/api/admin/orders?${params.toString()}`);
    },
    [status, query],
  );

  useEffect(() => {
    let active = true;
    setOrders(null);
    setError(null);
    fetchPage(null)
      .then((d) => {
        if (!active) return;
        setOrders(d.orders);
        setCursor(d.nextCursor);
      })
      .catch((err) => active && setError(errorMessage(err)));
    return () => {
      active = false;
    };
  }, [fetchPage]);

  async function more() {
    if (!cursor) return;
    setLoadingMore(true);
    try {
      const d = await fetchPage(cursor);
      setOrders((o) => [...(o ?? []), ...d.orders]);
      setCursor(d.nextCursor);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoadingMore(false);
    }
  }

  function submitSearch(e: FormEvent) {
    e.preventDefault();
    const v = search.trim().toUpperCase();
    if (v && !/^CP-\d{6}$/.test(v)) {
      setError("El número de pedido tiene el formato CP-000123.");
      return;
    }
    setQuery(v);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <label htmlFor={`${ids}-status`} className="label">
            Estado
          </label>
          <select
            id={`${ids}-status`}
            className="field min-w-48"
            value={status}
            disabled={Boolean(query)}
            onChange={(e) => setStatus(e.target.value as OrderStatus | "")}
          >
            <option value="">Todos</option>
            {ORDER_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
        <form onSubmit={submitSearch} className="flex flex-wrap items-end gap-2" role="search">
          <div>
            <label htmlFor={`${ids}-q`} className="label">
              Buscar por número
            </label>
            <input
              id={`${ids}-q`}
              className="field mono w-44"
              placeholder="CP-000123"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <button type="submit" className="btn btn-ghost btn-sm">
            Buscar
          </button>
          {query && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setSearch("");
                setQuery("");
              }}
            >
              Ver todos
            </button>
          )}
        </form>
      </div>

      {error && <Notice tone="error">{error}</Notice>}

      {!orders && !error && (
        <SkeletonGroup label="Cargando pedidos…" className="grid gap-4">
          <SkeletonRow media={false} />
          <SkeletonRow media={false} />
          <SkeletonRow media={false} />
        </SkeletonGroup>
      )}

      {orders && orders.length === 0 && (
        <div className="card p-8">
          <h2 className="text-xl font-bold">No hay pedidos</h2>
          <p className="text-muted">
            {query ? `No existe el pedido ${query}.` : status ? `Ningún pedido en estado «${STATUS_LABELS[status]}».` : "Todavía no se ha hecho ningún pedido."}
          </p>
        </div>
      )}

      {orders && orders.length > 0 && (
        <ul className="m-0 grid list-none gap-3 p-0">
          {orders.map((o) => (
            <li key={o.id}>
              <Link
                href={`/admin/pedidos/${encodeURIComponent(o.id)}`}
                className="card lift group flex flex-wrap items-center justify-between gap-4 p-4 no-underline hover:border-aji"
              >
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-3">
                    <b className="mono text-lg">{o.orderNumber}</b>
                    <OrderStatusBadge status={o.status} />
                    {isNewOrder(o) && <span className="pill !ml-0">Nuevo</span>}
                  </p>
                  <p className="mt-1 text-sm break-all text-muted">
                    {formatDate(o.createdAt, true)} · {o.email || "sin email"}
                  </p>
                  <p className="text-sm text-muted">
                    {o.items.map((i) => `${i.name} (${formatOptions(i.options)}) × ${i.quantity}`).join(", ")}
                  </p>
                </div>
                <span className="flex items-center gap-3">
                  <b className="font-display text-xl tabular-nums">{formatPrice(o.total, o.currency)}</b>
                  <ArrowRight className="btn-arrow h-5 w-5 text-aji-ink" />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {cursor && (
        <div>
          <button type="button" className="btn btn-ghost" onClick={() => void more()} disabled={loadingMore}>
            {loadingMore ? "Cargando…" : "Cargar más"}
          </button>
        </div>
      )}
    </div>
  );
}
