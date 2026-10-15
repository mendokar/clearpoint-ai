import type Stripe from "stripe";
import type { Firestore } from "firebase-admin/firestore";
import type { EmailSender } from "../email/sender";
import { formatOrderNumber, type Order, type OrderItem, type ShippingAddress } from "./types";

export type FulfillDeps = {
  db: Firestore;
  listLineItems: (sessionId: string) => Promise<Stripe.LineItem[]>;
  email: EmailSender;
  now?: () => Date;
};

export type FulfillResult =
  | { status: "created"; orderId: string; orderNumber: string; emailSent: boolean; adminNotified: boolean }
  | { status: "duplicate"; orderId: string }
  | { status: "ignored"; reason: string };

const COUNTER_PATH = ["counters", "orders"] as const;

function toEuros(cents: number | null | undefined): number {
  return Math.round(cents ?? 0) / 100;
}

function itemFromLine(line: Stripe.LineItem): OrderItem {
  const product = line.price?.product;
  const meta = product && typeof product === "object" && !("deleted" in product && product.deleted)
    ? (product as Stripe.Product).metadata
    : {};
  let options: Record<string, string> = {};
  try {
    options = meta.options ? (JSON.parse(meta.options) as Record<string, string>) : {};
  } catch {
    options = {};
  }
  const quantity = line.quantity ?? 1;
  return {
    productSlug: meta.slug ?? "",
    name: (product && typeof product === "object" && "name" in product ? product.name : null) ?? line.description ?? "",
    sku: meta.sku ?? "",
    options,
    unitPrice: toEuros(line.price?.unit_amount ?? Math.round((line.amount_subtotal ?? 0) / quantity)),
    quantity,
  };
}

function addressFrom(session: Stripe.Checkout.Session): ShippingAddress | null {
  const legacy = (session as unknown as { shipping_details?: Stripe.Checkout.Session.CollectedInformation.ShippingDetails | null })
    .shipping_details;
  const details = session.collected_information?.shipping_details ?? legacy ?? null;
  const addr = details?.address ?? session.customer_details?.address ?? null;
  if (!addr) return null;
  return {
    name: details?.name ?? session.customer_details?.name ?? "",
    line1: addr.line1 ?? "",
    line2: addr.line2 ?? null,
    city: addr.city ?? "",
    postalCode: addr.postal_code ?? "",
    state: addr.state ?? null,
    country: addr.country ?? "ES",
  };
}

/**
 * Crea `orders/{session.id}` a partir de una Checkout Session pagada.
 * Idempotente: la existencia del pedido y el contador se leen y escriben en la
 * misma transacción, así que un webhook repetido no duplica ni consume número.
 */
export async function fulfillCheckoutSession(
  session: Stripe.Checkout.Session,
  deps: FulfillDeps,
): Promise<FulfillResult> {
  if (session.payment_status !== "paid") return { status: "ignored", reason: `payment_status=${session.payment_status}` };
  const uid = session.metadata?.uid ?? session.client_reference_id;
  if (!uid) return { status: "ignored", reason: "sin uid" };

  const lineItems = await deps.listLineItems(session.id);
  const items = lineItems.map(itemFromLine);
  const now = (deps.now ?? (() => new Date()))();

  const orderRef = deps.db.collection("orders").doc(session.id);
  const counterRef = deps.db.collection(COUNTER_PATH[0]).doc(COUNTER_PATH[1]);

  const result = await deps.db.runTransaction(async (tx) => {
    const existing = await tx.get(orderRef);
    if (existing.exists) return null;
    const counter = await tx.get(counterRef);
    const next = ((counter.data()?.value as number | undefined) ?? 0) + 1;
    const order: Order = {
      orderNumber: formatOrderNumber(next),
      userId: uid,
      email: session.customer_details?.email ?? session.customer_email ?? "",
      status: "paid",
      statusHistory: [{ status: "paid", at: now }],
      items,
      subtotal: toEuros(session.amount_subtotal),
      shipping: toEuros(session.shipping_cost?.amount_total ?? session.total_details?.amount_shipping ?? 0),
      total: toEuros(session.amount_total),
      currency: (session.currency ?? "eur").toUpperCase(),
      shippingAddress: addressFrom(session),
      carrier: null,
      trackingNumber: null,
      estimatedDelivery: null,
      stripePaymentIntentId:
        typeof session.payment_intent === "string" ? session.payment_intent : (session.payment_intent?.id ?? null),
      createdAt: now,
      updatedAt: now,
    };
    tx.set(counterRef, { value: next, updatedAt: now }, { merge: true });
    tx.set(orderRef, order);
    return order;
  });

  if (!result) return { status: "duplicate", orderId: session.id };

  let emailSent = false;
  try {
    await deps.email.sendOrderConfirmation({ ...result, id: session.id });
    emailSent = true;
  } catch (err) {
    // El pedido ya está guardado: el fallo del email solo se registra.
    console.error("[webhook] fallo al enviar el email de confirmación", {
      orderId: session.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
  // Aviso a la tienda: independiente del email al cliente y sin bloquear el pedido.
  let adminNotified = false;
  try {
    await deps.email.sendNewOrderAlert({ ...result, id: session.id });
    adminNotified = true;
  } catch (err) {
    console.error("[webhook] fallo al avisar a la tienda del pedido nuevo", {
      orderId: session.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return { status: "created", orderId: session.id, orderNumber: result.orderNumber, emailSent, adminNotified };
}
