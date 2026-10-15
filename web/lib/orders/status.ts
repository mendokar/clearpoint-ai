/**
 * Reglas de cambio de estado de un pedido, compartidas por el panel de administración
 * (`/api/admin/orders/[id]`) y el script `scripts/update-order-status.ts`.
 *
 * Sin dependencias (ni Firebase ni Zod) para que el script pueda importarlo tal cual:
 * calcula QUÉ hay que escribir; quien llama decide CÓMO (transacción, Timestamp…).
 */
export const ORDER_STATUSES = ["paid", "preparing", "shipped", "delivered", "cancelled"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Nombres visibles de cada estado (los mismos en la web, los emails, el panel y el asistente). */
export const STATUS_LABELS: Record<OrderStatus, string> = {
  paid: "Pagado",
  preparing: "En preparación",
  shipped: "Enviado",
  delivered: "Entregado",
  cancelled: "Cancelado",
};

/**
 * Transiciones permitidas: paid → preparing → shipped → delivered, paso a paso, y cancelled solo desde
 * paid o preparing. `delivered` y `cancelled` son finales. El servidor rechaza cualquier otra.
 */
export const STATUS_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  paid: ["preparing", "cancelled"],
  preparing: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: [],
};

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === "string" && (ORDER_STATUSES as readonly string[]).includes(value);
}

export function allowedNextStatuses(from: OrderStatus): readonly OrderStatus[] {
  return STATUS_TRANSITIONS[from] ?? [];
}

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return allowedNextStatuses(from).includes(to);
}

export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Fecha AAAA-MM-DD válida (rechaza 2026-02-31). */
export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function addBusinessDays(date: Date, days: number): Date {
  const d = new Date(date);
  while (days > 0) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) days -= 1;
  }
  return d;
}

export type StatusChangeInput = {
  status: OrderStatus;
  carrier?: string | null;
  trackingNumber?: string | null;
  estimatedDelivery?: string | null;
};

export type CurrentOrderState = {
  status: OrderStatus;
  estimatedDelivery?: string | null;
};

export type StatusChangePlan = {
  /** Campos a actualizar (sin `statusHistory`, que quien llama añade con su tipo de fecha). */
  update: {
    status: OrderStatus;
    carrier?: string;
    trackingNumber?: string;
    estimatedDelivery?: string;
  };
  historyEntry: { status: OrderStatus; at: Date };
};

export class StatusChangeError extends Error {
  constructor(
    message: string,
    public code: "invalid_transition" | "missing_shipping" | "invalid_date",
  ) {
    super(message);
  }
}

/**
 * Calcula el cambio de estado. Lanza `StatusChangeError` si la transición no está permitida
 * (salvo `force`, solo para el script de demo) o si al pasar a `shipped` faltan transportista,
 * seguimiento o fecha estimada.
 */
export function planStatusChange(
  current: CurrentOrderState,
  input: StatusChangeInput,
  now: Date,
  opts: { force?: boolean } = {},
): StatusChangePlan {
  if (!opts.force && !canTransition(current.status, input.status)) {
    throw new StatusChangeError(
      `No se puede pasar de «${STATUS_LABELS[current.status] ?? current.status}» a «${STATUS_LABELS[input.status] ?? input.status}».`,
      "invalid_transition",
    );
  }
  const update: StatusChangePlan["update"] = { status: input.status };
  if (input.status === "shipped") {
    const carrier = input.carrier?.trim();
    const trackingNumber = input.trackingNumber?.trim();
    const eta = input.estimatedDelivery?.trim();
    if (!carrier || !trackingNumber || !eta) {
      throw new StatusChangeError(
        "Para marcar el pedido como enviado indica transportista, número de seguimiento y fecha estimada.",
        "missing_shipping",
      );
    }
    if (!isIsoDate(eta)) throw new StatusChangeError("La fecha estimada debe tener formato AAAA-MM-DD.", "invalid_date");
    update.carrier = carrier;
    update.trackingNumber = trackingNumber;
    update.estimatedDelivery = eta;
  }
  if (input.status === "delivered" && !current.estimatedDelivery) {
    update.estimatedDelivery = now.toISOString().slice(0, 10);
  }
  return { update, historyEntry: { status: input.status, at: now } };
}
