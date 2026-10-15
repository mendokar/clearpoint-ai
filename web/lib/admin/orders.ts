import "server-only";
import type { Firestore, Query } from "firebase-admin/firestore";
import { z } from "zod";
import { toPlain } from "../catalog/repository";
import { orderIdSchema } from "../schemas";
import {
  ORDER_STATUSES,
  isOrderStatus,
  planStatusChange,
  StatusChangeError,
  type OrderStatus,
} from "../orders/status";
import { isNotifiableStatus, type EmailSender, type OrderEmail } from "../email/sender";
import { AdminStoreError } from "./errors";

/** Lectura y cambio de estado de pedidos desde el panel (Admin SDK). */

export const ORDERS_PAGE_SIZE = 20;

export const listOrdersQuerySchema = z
  .object({
    status: z.enum(ORDER_STATUSES).optional(),
    cursor: orderIdSchema.optional(),
    orderNumber: z.string().regex(/^CP-\d{6}$/, "Número de pedido no válido (CP-000123).").optional(),
    limit: z.coerce.number().int().min(1).max(50).default(ORDERS_PAGE_SIZE),
  })
  .strict();

export const statusChangeSchema = z
  .object({
    status: z.enum(ORDER_STATUSES, { errorMap: () => ({ message: "Estado no válido." }) }),
    carrier: z.string().trim().min(1).max(60).optional(),
    trackingNumber: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9-]{3,60}$/, "Seguimiento: 3–60 letras, números o guiones.")
      .optional(),
    estimatedDelivery: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha estimada: AAAA-MM-DD.").optional(),
    /** Enviar email al cliente (solo aplica a Enviado, Entregado y Cancelado). */
    notifyCustomer: z.boolean().default(true),
  })
  .strict();

export type StatusChangeBody = z.infer<typeof statusChangeSchema>;

export type AdminOrderRow = Record<string, unknown> & { id: string; status: OrderStatus };

function toRow(id: string, data: unknown): AdminOrderRow {
  return { id, ...(toPlain(data) as Record<string, unknown>) } as AdminOrderRow;
}

/**
 * Pedidos de todos los usuarios, más recientes primero, paginados por cursor (ID del último pedido).
 * Con filtro de estado usa el índice compuesto `orders (status ASC, createdAt DESC)`.
 */
export async function listOrders(
  db: Firestore,
  params: z.infer<typeof listOrdersQuerySchema>,
): Promise<{ orders: AdminOrderRow[]; nextCursor: string | null }> {
  const col = db.collection("orders");
  if (params.orderNumber) {
    const snap = await col.where("orderNumber", "==", params.orderNumber).limit(1).get();
    return { orders: snap.docs.map((d) => toRow(d.id, d.data())), nextCursor: null };
  }
  let q: Query = col;
  if (params.status) q = q.where("status", "==", params.status);
  q = q.orderBy("createdAt", "desc");
  if (params.cursor) {
    const cursorSnap = await col.doc(params.cursor).get();
    if (!cursorSnap.exists) throw new AdminStoreError(400, "La página solicitada ya no existe; vuelve a cargar la lista.");
    q = q.startAfter(cursorSnap);
  }
  const snap = await q.limit(params.limit + 1).get();
  const docs = snap.docs.slice(0, params.limit);
  return {
    orders: docs.map((d) => toRow(d.id, d.data())),
    nextCursor: snap.docs.length > params.limit ? (docs[docs.length - 1]?.id ?? null) : null,
  };
}

export async function getOrderForAdmin(db: Firestore, id: string): Promise<AdminOrderRow | null> {
  const snap = await db.collection("orders").doc(id).get();
  return snap.exists ? toRow(snap.id, snap.data()) : null;
}

/** Resultado del email al cliente tras un cambio de estado. */
export type StatusEmailResult = "sent" | "failed" | "skipped" | "already_sent" | "not_applicable";

/**
 * Cambia el estado en una transacción: valida la transición con las reglas compartidas
 * (`lib/orders/status.ts`), añade `{status, at}` a `statusHistory` y actualiza `updatedAt`.
 * Después, si el estado es Enviado/Entregado/Cancelado y no se ha pedido silencio, envía el email al
 * cliente. Es idempotente: `notifiedStatuses.<estado>` registra los avisos enviados y nunca se repiten
 * (además, repetir un estado es una transición inválida → 409 sin email). Un fallo del email no deshace
 * el cambio de estado.
 */
export async function changeOrderStatus(
  db: Firestore,
  id: string,
  body: StatusChangeBody,
  deps: { now?: Date; email?: EmailSender } = {},
): Promise<{ order: AdminOrderRow; email: StatusEmailResult }> {
  const now = deps.now ?? new Date();
  const ref = db.collection("orders").doc(id);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new AdminStoreError(404, "El pedido no existe.");
    const data = snap.data() ?? {};
    const current = data.status;
    if (!isOrderStatus(current)) throw new AdminStoreError(422, "El pedido tiene un estado desconocido.");
    let plan;
    try {
      plan = planStatusChange({ status: current, estimatedDelivery: data.estimatedDelivery ?? null }, body, now);
    } catch (err) {
      if (err instanceof StatusChangeError) {
        throw new AdminStoreError(err.code === "invalid_transition" ? 409 : 400, err.message, "status");
      }
      throw err;
    }
    const history = Array.isArray(data.statusHistory) ? data.statusHistory : [];
    tx.update(ref, { ...plan.update, statusHistory: [...history, plan.historyEntry], updatedAt: now });
  });

  let order = await getOrderForAdmin(db, id);
  if (!order) throw new AdminStoreError(404, "El pedido no existe.");

  const status = body.status;
  let email: StatusEmailResult = "not_applicable";
  if (isNotifiableStatus(status)) {
    const notified = (order.notifiedStatuses ?? {}) as Record<string, unknown>;
    if (!body.notifyCustomer) email = "skipped";
    else if (notified[status]) email = "already_sent";
    else if (!deps.email) email = "failed";
    else {
      try {
        await deps.email.sendOrderStatusUpdate(order as unknown as OrderEmail, status);
        await ref.update({ notifiedStatuses: { ...notified, [status]: now } });
        order = (await getOrderForAdmin(db, id)) ?? order;
        email = "sent";
      } catch (err) {
        console.error("[admin] fallo al enviar el email de cambio de estado", {
          id,
          status,
          error: err instanceof Error ? err.message : String(err),
        });
        email = "failed";
      }
    }
  }
  return { order, email };
}

/** Marca el pedido como revisado la primera vez que un admin abre su detalle (deja de contar como nuevo). */
export async function markOrderReviewed(db: Firestore, id: string, now: Date = new Date()): Promise<boolean> {
  const ref = db.collection("orders").doc(id);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists || snap.data()?.reviewedAt) return false;
    tx.update(ref, { reviewedAt: now });
    return true;
  });
}

/** Medianoche de hoy en Europe/Madrid, como instante UTC. */
export function startOfTodayMadrid(now: Date): Date {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Madrid",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  // Diferencia entre la hora de pared en Madrid y UTC en este instante = desfase de la zona.
  const wall = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second);
  const offset = wall - Math.floor(now.getTime() / 1000) * 1000;
  return new Date(Date.UTC(+parts.year, +parts.month - 1, +parts.day) - offset);
}

export type OrdersSummary = {
  today: { orders: number; revenue: number };
  pendingPreparation: number;
  unreviewed: number;
  preparing: number;
  shipped: number;
};

/** Resumen para la portada del panel. Los importes de hoy excluyen los pedidos cancelados. */
export async function getOrdersSummary(db: Firestore, now: Date = new Date()): Promise<OrdersSummary> {
  const col = db.collection("orders");
  const since = startOfTodayMadrid(now);
  const [todaySnap, paidSnap, preparing, shipped] = await Promise.all([
    col.where("createdAt", ">=", since).get(),
    col.where("status", "==", "paid").get(),
    col.where("status", "==", "preparing").count().get(),
    col.where("status", "==", "shipped").count().get(),
  ]);
  const todayDocs = todaySnap.docs.map((d) => d.data());
  const revenue = todayDocs
    .filter((o) => o.status !== "cancelled")
    .reduce((sum, o) => sum + (typeof o.total === "number" ? o.total : 0), 0);
  return {
    today: { orders: todayDocs.length, revenue: Math.round(revenue * 100) / 100 },
    pendingPreparation: paidSnap.size,
    unreviewed: paidSnap.docs.filter((d) => !d.data().reviewedAt).length,
    preparing: preparing.data().count,
    shipped: shipped.data().count,
  };
}
