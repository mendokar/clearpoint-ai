import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { getEmailSender } from "@/lib/email/gmail";
import { getAdminDb, isAdminConfigured } from "@/lib/firebase/admin";
import { fulfillCheckoutSession } from "@/lib/orders/fulfill";
import { siteUrlFrom } from "@/lib/site";
import { getStripe, isStripeConfigured } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/webhooks/stripe
 * Verifica la firma con el cuerpo crudo y crea el pedido solo para
 * checkout.session.completed con payment_status = paid.
 */
export async function POST(req: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret || !isStripeConfigured() || !isAdminConfigured()) {
    console.error("[webhook] faltan STRIPE_WEBHOOK_SECRET, STRIPE_SECRET_KEY o FIREBASE_ADMIN_CREDENTIALS");
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "missing signature" }, { status: 400 });

  const raw = await req.text();
  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(raw, signature, secret);
  } catch {
    console.warn("[webhook] firma no válida");
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  if (event.type !== "checkout.session.completed") {
    return NextResponse.json({ received: true, ignored: event.type });
  }

  const session = event.data.object;
  if (session.payment_status !== "paid") {
    return NextResponse.json({ received: true, ignored: `payment_status=${session.payment_status}` });
  }

  try {
    const result = await fulfillCheckoutSession(session, {
      db: getAdminDb(),
      listLineItems: async (id) =>
        (await stripe.checkout.sessions.listLineItems(id, { limit: 100, expand: ["data.price.product"] })).data,
      email: getEmailSender(siteUrlFrom(req)),
    });
    console.info("[webhook] checkout.session.completed", { eventId: event.id, ...result });
    return NextResponse.json({ received: true, result: result.status });
  } catch (err) {
    // 500 → Stripe reintenta; la transacción garantiza que no haya duplicados.
    console.error("[webhook] error guardando el pedido", {
      eventId: event.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ error: "internal" }, { status: 500 });
  }
}
