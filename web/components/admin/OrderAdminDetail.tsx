"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { OrderStatusBadge } from "@/components/orders/OrderStatus";
import { Notice } from "@/components/ui/Notice";
import { SkeletonGroup, SkeletonRow } from "@/components/ui/Skeleton";
import { AdminApiError, adminFetch, errorMessage } from "@/lib/admin/client";
import { formatDate, formatOptions, formatPrice } from "@/lib/format";
import { addBusinessDays, allowedNextStatuses, type OrderStatus } from "@/lib/orders/status";
import { orderIdSchema, STATUS_LABELS } from "@/lib/schemas";
import type { AdminOrder } from "./OrdersAdmin";

/** Detalle de un pedido en el panel, con historial y cambio de estado. */
export function OrderAdminDetail({ id }: { id: string }) {
  const [order, setOrder] = useState<AdminOrder | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const validId = orderIdSchema.safeParse(id).success;

  useEffect(() => {
    if (!validId) return;
    let active = true;
    adminFetch<{ order: AdminOrder }>(`/api/admin/orders/${encodeURIComponent(id)}`)
      .then((d) => active && setOrder(d.order))
      .catch((err) => {
        if (!active) return;
        if (err instanceof AdminApiError && err.status === 404) setOrder(null);
        else setError(errorMessage(err));
      });
    return () => {
      active = false;
    };
  }, [id, validId]);

  if (!validId || order === null) {
    return (
      <div className="mt-4">
        <Notice tone="warn" title="Pedido no encontrado">
          <Link href="/admin/pedidos" className="underline">Volver a pedidos</Link>
        </Notice>
      </div>
    );
  }
  if (error) return <div className="mt-4"><Notice tone="error">{error}</Notice></div>;
  if (!order) {
    return (
      <SkeletonGroup label="Cargando el pedido…" className="mt-4 grid gap-4">
        <SkeletonRow media={false} />
        <SkeletonRow media={false} />
      </SkeletonGroup>
    );
  }

  const addr = order.shippingAddress;
  return (
    <>
      <h2 className="mono mt-2 mb-6 flex flex-wrap items-center gap-3 text-3xl font-bold">
        {order.orderNumber} <OrderStatusBadge status={order.status} />
      </h2>
      <div className="grid items-start gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="flex flex-col gap-6">
          <StatusChanger order={order} onChanged={setOrder} />

          <section className="card p-6" aria-labelledby="hist">
            <h3 id="hist" className="mb-4 text-xl font-bold">Historial</h3>
            <ol className="m-0 grid list-none gap-2 p-0">
              {order.statusHistory.map((h, i) => (
                <li key={i} className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2 last:border-0">
                  <OrderStatusBadge status={h.status} />
                  <span className="text-sm text-muted">{formatDate(h.at, true)}</span>
                </li>
              ))}
            </ol>
            {(order.carrier || order.trackingNumber || order.estimatedDelivery) && (
              <dl className="mt-4 grid gap-2 border-t border-line pt-4 text-sm sm:grid-cols-3">
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
          </section>

          <section className="card p-6" aria-labelledby="items">
            <h3 id="items" className="mb-4 text-xl font-bold">Productos</h3>
            <ul className="m-0 grid list-none gap-3 p-0">
              {order.items.map((item) => (
                <li key={item.sku} className="flex flex-wrap justify-between gap-3 border-b border-line pb-3 last:border-0 last:pb-0">
                  <div>
                    <p className="font-semibold">
                      {item.name} × {item.quantity}
                    </p>
                    <p className="text-sm text-muted">{formatOptions(item.options)}</p>
                    <p className="mono text-xs text-muted">SKU {item.sku}</p>
                  </div>
                  <b className="tabular-nums">{formatPrice(item.unitPrice * item.quantity, order.currency)}</b>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="card flex flex-col gap-4 p-6">
          <h3 className="text-xl font-bold">Resumen</h3>
          <dl className="m-0 grid gap-2 text-sm">
            <Row k="Fecha" v={formatDate(order.createdAt, true)} />
            <Row k="Cliente" v={order.email || "—"} />
            <Row k="Subtotal" v={formatPrice(order.subtotal, order.currency)} />
            <Row k="Envío" v={order.shipping ? formatPrice(order.shipping, order.currency) : "Gratis"} />
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
                {addr.state ? ` (${addr.state})` : ""} · {addr.country}
              </address>
            </div>
          )}
          <dl className="m-0 grid gap-1 border-t border-line pt-4 text-xs text-muted">
            <div>
              <dt className="inline">ID: </dt>
              <dd className="mono m-0 inline break-all">{order.id}</dd>
            </div>
            <div>
              <dt className="inline">Usuario: </dt>
              <dd className="mono m-0 inline break-all">{order.userId}</dd>
            </div>
            {order.stripePaymentIntentId && (
              <div>
                <dt className="inline">Pago Stripe: </dt>
                <dd className="mono m-0 inline break-all">{order.stripePaymentIntentId}</dd>
              </div>
            )}
          </dl>
        </aside>
      </div>
    </>
  );
}

type EmailResult = "sent" | "failed" | "skipped" | "already_sent" | "not_applicable";
const NOTIFIABLE: OrderStatus[] = ["shipped", "delivered", "cancelled"];
const EMAIL_MESSAGES: Record<EmailResult, string> = {
  sent: "Se ha enviado un email al cliente.",
  failed: "No se ha podido enviar el email al cliente (el estado sí se ha guardado).",
  skipped: "No se ha avisado al cliente por email.",
  already_sent: "El cliente ya había recibido este aviso; no se reenvía.",
  not_applicable: "",
};

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{k}</dt>
      <dd className="m-0 text-right break-all tabular-nums">{v}</dd>
    </div>
  );
}

function StatusChanger({ order, onChanged }: { order: AdminOrder; onChanged: (o: AdminOrder) => void }) {
  const next = allowedNextStatuses(order.status);
  const [target, setTarget] = useState<OrderStatus | "">(next[0] ?? "");
  const [carrier, setCarrier] = useState(order.carrier ?? "SEUR");
  const [tracking, setTracking] = useState(order.trackingNumber ?? "");
  const [eta, setEta] = useState(order.estimatedDelivery ?? addBusinessDays(new Date(), 2).toISOString().slice(0, 10));
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [notify, setNotify] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const ids = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setTarget(allowedNextStatuses(order.status)[0] ?? "");
    setConfirmCancel(false);
  }, [order.status]);
  useEffect(() => {
    if (confirmCancel) cancelRef.current?.focus();
  }, [confirmCancel]);

  if (next.length === 0) {
    return (
      <section className="card p-6">
        <h3 className="mb-2 text-xl font-bold">Estado</h3>
        {done && <div className="mb-3"><Notice tone="ok">{done}</Notice></div>}
        <p className="text-muted">
          «{STATUS_LABELS[order.status]}» es un estado final: este pedido ya no admite más cambios.
        </p>
      </section>
    );
  }

  async function send() {
    setSaving(true);
    setError(null);
    setDone(null);
    try {
      const body = {
        status: target,
        notifyCustomer: notify,
        ...(target === "shipped" ? { carrier: carrier.trim(), trackingNumber: tracking.trim(), estimatedDelivery: eta } : {}),
      };
      const res = await adminFetch<{ order: AdminOrder; email: EmailResult }>(`/api/admin/orders/${encodeURIComponent(order.id)}`, {
        method: "PATCH",
        body,
      });
      onChanged(res.order);
      setDone(
        `Estado actualizado a «${STATUS_LABELS[res.order.status]}». ${EMAIL_MESSAGES[res.email]} El cliente lo ve en «Mis pedidos» y el asistente ya responde con el nuevo estado.`,
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
      setConfirmCancel(false);
    }
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!target) return;
    if (target === "shipped" && (!carrier.trim() || !tracking.trim() || !eta)) {
      setError("Para marcarlo como enviado indica transportista, número de seguimiento y fecha estimada.");
      return;
    }
    if (target === "cancelled" && !confirmCancel) {
      setConfirmCancel(true);
      return;
    }
    void send();
  }

  return (
    <section className="card p-6" aria-labelledby={`${ids}-t`}>
      <h3 id={`${ids}-t`} className="mb-4 text-xl font-bold">Cambiar estado</h3>
      <div aria-live="polite">{done && <div className="mb-4"><Notice tone="ok">{done}</Notice></div>}</div>
      {error && <div className="mb-4"><Notice tone="error">{error}</Notice></div>}
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <fieldset>
          <legend className="label">Nuevo estado (ahora: {STATUS_LABELS[order.status]})</legend>
          <div className="flex flex-wrap gap-2">
            {next.map((s) => (
              <label key={s} className={`opt-chip flex cursor-pointer items-center gap-2 rounded-full border px-4 py-2 ${target === s ? "border-aji bg-tint" : "border-line"}`}>
                <input
                  type="radio"
                  name={`${ids}-status`}
                  value={s}
                  checked={target === s}
                  onChange={() => {
                    setTarget(s);
                    setConfirmCancel(false);
                  }}
                  className="accent-[var(--aji)]"
                />
                {STATUS_LABELS[s]}
              </label>
            ))}
          </div>
        </fieldset>

        {target === "shipped" && (
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className="label" htmlFor={`${ids}-c`}>Transportista *</label>
              <input id={`${ids}-c`} className="field" value={carrier} maxLength={60} required onChange={(e) => setCarrier(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor={`${ids}-tr`}>Nº de seguimiento *</label>
              <input
                id={`${ids}-tr`}
                className="field mono"
                value={tracking}
                maxLength={60}
                required
                placeholder="Escribe el número que da el transportista"
                onChange={(e) => setTracking(e.target.value)}
              />
            </div>
            <div>
              <label className="label" htmlFor={`${ids}-eta`}>Entrega estimada *</label>
              <input id={`${ids}-eta`} type="date" className="field" value={eta} required onChange={(e) => setEta(e.target.value)} />
            </div>
          </div>
        )}

        {target && NOTIFIABLE.includes(target) && (
          <label className="flex items-center gap-3 text-sm">
            <input type="checkbox" className="h-5 w-5 accent-[var(--aji)]" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
            Avisar al cliente por email{order.email ? ` (${order.email})` : ""}
          </label>
        )}

        {confirmCancel ? (
          <div role="group" aria-label="Confirmar cancelación" className="flex flex-col gap-2 rounded-card border border-danger p-3 text-sm">
            <p className="font-semibold">¿Cancelar el pedido {order.orderNumber}? Es un estado final.</p>
            <p className="text-muted">El reembolso no es automático: hazlo desde el panel de Stripe.</p>
            <div className="flex flex-wrap gap-2">
              <button ref={cancelRef} type="button" className="btn btn-ghost btn-sm" onClick={() => setConfirmCancel(false)} disabled={saving}>
                No, volver
              </button>
              <button type="submit" className="btn btn-sm border-danger bg-danger text-on-accent" disabled={saving}>
                {saving ? "Cancelando…" : "Sí, cancelar pedido"}
              </button>
            </div>
          </div>
        ) : (
          <div>
            <button type="submit" className="btn btn-primary" disabled={saving || !target}>
              {saving ? "Guardando…" : target ? `Marcar como «${STATUS_LABELS[target]}»` : "Elige un estado"}
            </button>
          </div>
        )}
      </form>
    </section>
  );
}
