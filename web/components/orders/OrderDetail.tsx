"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Notice } from "@/components/ui/Notice";
import { Skeleton, SkeletonGroup } from "@/components/ui/Skeleton";
import { formatDate, formatPrice } from "@/lib/format";
import { fetchMyOrder, type OrderWithId } from "@/lib/orders/client";
import { orderIdSchema, STATUS_LABELS } from "@/lib/schemas";
import { OrderStatusBadge, STATUS_FLOW } from "./OrderStatus";

export function OrderDetail({ id }: { id: string }) {
  const { user } = useAuth();
  const [order, setOrder] = useState<OrderWithId | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const validId = orderIdSchema.safeParse(id).success;

  useEffect(() => {
    if (!user || !validId) return;
    let active = true;
    fetchMyOrder(id)
      .then((o) => active && setOrder(o))
      .catch(() => active && setError("No hemos podido cargar el pedido. Inténtalo de nuevo."));
    return () => {
      active = false;
    };
  }, [user, id, validId]);

  if (!validId || order === null) {
    return (
      <Notice tone="warn" title="Pedido no encontrado">
        No existe o no pertenece a tu cuenta. <Link href="/pedidos" className="underline">Volver a mis pedidos</Link>
      </Notice>
    );
  }
  if (error) return <Notice tone="error">{error}</Notice>;
  if (!order) return <OrderDetailSkeleton />;

  const reached = new Set(order.statusHistory.map((h) => h.status));
  const historyAt = (s: string) => order.statusHistory.find((h) => h.status === s)?.at;
  const addr = order.shippingAddress;

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[1.3fr_.9fr]">
      <div className="flex flex-col gap-6">
        <div className="card p-6">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl font-bold">Estado</h2>
            <OrderStatusBadge status={order.status} />
          </div>
          {order.status === "cancelled" ? (
            <p className="text-muted">Este pedido está cancelado.</p>
          ) : (
            <ol className="m-0 grid list-none gap-0 p-0">
              {STATUS_FLOW.map((s, i) => {
                const done = reached.has(s);
                const nextDone = reached.has(STATUS_FLOW[i + 1]);
                const current = done && !nextDone;
                const style = { "--i": i } as React.CSSProperties;
                return (
                  <li key={s} className="grid grid-cols-[1.5rem_1fr] gap-3 pb-4 last:pb-0">
                    <span className="flex flex-col items-center">
                      <span
                        style={style}
                        className={`timeline-dot h-4 w-4 rounded-full border-2 ${done ? "border-aji bg-aji" : "border-line bg-surface"}${
                          current && order.status !== "delivered" ? " is-current" : ""
                        }`}
                        aria-hidden="true"
                      />
                      {i < STATUS_FLOW.length - 1 && (
                        <span className="timeline-line w-0.5 flex-1 bg-line" aria-hidden="true">
                          {nextDone && <span style={style} />}
                        </span>
                      )}
                    </span>
                    <div className={`timeline-text ${done ? "" : "text-muted"}`} style={style}>
                      <p className="font-semibold">
                        {STATUS_LABELS[s]}
                        <span className="sr-only">{done ? " (completado)" : " (pendiente)"}</span>
                      </p>
                      {done && <p className="text-sm text-muted">{formatDate(historyAt(s), true)}</p>}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
          {(order.carrier || order.trackingNumber || order.estimatedDelivery) && (
            <dl className="mt-5 grid gap-2 border-t border-line pt-4 text-sm sm:grid-cols-3">
              <div>
                <dt className="label">Transportista</dt>
                <dd className="m-0">{order.carrier ?? "—"}</dd>
              </div>
              <div>
                <dt className="label">Seguimiento</dt>
                <dd className="mono m-0 break-all">{order.trackingNumber ?? "—"}</dd>
              </div>
              <div>
                <dt className="label">Entrega estimada</dt>
                <dd className="m-0">{order.estimatedDelivery ? formatDate(order.estimatedDelivery) : "—"}</dd>
              </div>
            </dl>
          )}
        </div>

        <div className="card p-6">
          <h2 className="mb-4 text-xl font-bold">Productos</h2>
          <ul className="m-0 grid list-none gap-3 p-0">
            {order.items.map((item) => (
              <li key={item.sku} className="flex flex-wrap justify-between gap-3 border-b border-line pb-3 last:border-0 last:pb-0">
                <div>
                  <p className="font-semibold">
                    {item.name} × {item.quantity}
                  </p>
                  <p className="text-sm text-muted">{Object.values(item.options).join(" · ")}</p>
                  <p className="mono text-xs text-muted">SKU {item.sku}</p>
                </div>
                <b className="tabular-nums">{formatPrice(item.unitPrice * item.quantity, order.currency)}</b>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <aside className="card flex flex-col gap-4 p-6">
        <h2 className="text-xl font-bold">Resumen</h2>
        <dl className="m-0 grid gap-2">
          <div className="flex justify-between">
            <dt className="text-muted">Fecha</dt>
            <dd className="m-0">{formatDate(order.createdAt)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Subtotal</dt>
            <dd className="m-0 tabular-nums">{formatPrice(order.subtotal, order.currency)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Envío</dt>
            <dd className="m-0 tabular-nums">{order.shipping ? formatPrice(order.shipping, order.currency) : "Gratis"}</dd>
          </div>
          <div className="flex justify-between border-t border-line pt-2 text-lg font-bold">
            <dt>Total</dt>
            <dd className="font-display m-0 tabular-nums">{formatPrice(order.total, order.currency)}</dd>
          </div>
        </dl>
        {addr && (
          <div className="border-t border-line pt-4 text-sm">
            <p className="label">Dirección de entrega</p>
            <address className="not-italic">
              {addr.name}
              <br />
              {addr.line1}
              {addr.line2 ? `, ${addr.line2}` : ""}
              <br />
              {addr.postalCode} {addr.city}
              {addr.state ? ` (${addr.state})` : ""}
            </address>
          </div>
        )}
        <p className="text-xs text-muted">
          ¿Necesitas cambiar o cancelar algo? Escríbenos a hola@contoso.example indicando {order.orderNumber}.
        </p>
      </aside>
    </div>
  );
}

function OrderDetailSkeleton() {
  return (
    <SkeletonGroup label="Cargando el pedido…" className="grid items-start gap-8 lg:grid-cols-[1.3fr_.9fr]">
      <div className="card flex flex-col gap-4 p-6">
        <Skeleton className="h-6 w-1/4" />
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-3">
            <Skeleton className="h-4 w-4 rounded-full" />
            <Skeleton className="h-4 w-1/3" />
          </div>
        ))}
      </div>
      <div className="card flex flex-col gap-3 p-6">
        <Skeleton className="h-6 w-1/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </div>
    </SkeletonGroup>
  );
}
