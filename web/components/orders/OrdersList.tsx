"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Notice } from "@/components/ui/Notice";
import { ArrowRight } from "@/components/ui/Icons";
import { SkeletonGroup, SkeletonRow } from "@/components/ui/Skeleton";
import { formatDate, formatPrice } from "@/lib/format";
import { fetchMyOrders, type OrderWithId } from "@/lib/orders/client";
import { OrderStatusBadge } from "./OrderStatus";

export function OrdersList() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<OrderWithId[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let active = true;
    fetchMyOrders(user.uid)
      .then((o) => active && setOrders(o))
      .catch(() => active && setError("No hemos podido cargar tus pedidos. Inténtalo de nuevo en unos segundos."));
    return () => {
      active = false;
    };
  }, [user]);

  if (error) return <Notice tone="error">{error}</Notice>;
  if (!orders) {
    return (
      <SkeletonGroup label="Cargando tus pedidos…" className="grid gap-4">
        <SkeletonRow media={false} />
        <SkeletonRow media={false} />
        <SkeletonRow media={false} />
      </SkeletonGroup>
    );
  }
  if (orders.length === 0) {
    return (
      <div className="card enter flex flex-col items-start gap-4 p-8">
        <h2 className="text-2xl font-bold">Todavía no tienes pedidos</h2>
        <p className="text-muted">Cuando compres un colchón lo verás aquí con su estado y seguimiento.</p>
        <Link href="/#productos" className="btn btn-primary">
          Ver colchones <ArrowRight />
        </Link>
      </div>
    );
  }

  return (
    <ul className="m-0 grid list-none gap-4 p-0">
      {orders.map((o, i) => (
        <li key={o.id} className="order-row" style={{ "--i": i } as React.CSSProperties}>
          <Link
            href={`/pedidos/${encodeURIComponent(o.id)}`}
            className="card lift group flex flex-wrap items-center justify-between gap-4 p-5 no-underline transition-colors hover:border-aji"
          >
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-3">
                <b className="mono text-lg">{o.orderNumber}</b>
                <OrderStatusBadge status={o.status} />
              </p>
              <p className="mt-1 text-sm text-muted">
                {formatDate(o.createdAt)} · {o.items.map((i) => `${i.name} × ${i.quantity}`).join(", ")}
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
  );
}
