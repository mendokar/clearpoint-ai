import { NextResponse } from "next/server";
import { CatalogUnavailableError, getCatalog } from "@/lib/catalog/repository";
import { buildSessionParams, CheckoutError, priceCart } from "@/lib/checkout";
import { isAdminConfigured, verifyBearer } from "@/lib/firebase/admin";
import { siteUrlFrom } from "@/lib/site";
import { getStripe, isStripeConfigured } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (status: number, body: Record<string, unknown>) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

/**
 * POST /api/checkout
 * Body: { items: [{ sku, quantity }] }  ·  Header: Authorization: Bearer <Firebase ID token>
 * Respuesta 200: { url } de la Stripe Checkout Session.
 */
export async function POST(req: Request) {
  if (!isAdminConfigured() || !isStripeConfigured()) {
    return json(503, { error: "El pago no está disponible ahora mismo. Inténtalo más tarde." });
  }

  const user = await verifyBearer(req.headers.get("authorization"));
  if (!user) return json(401, { error: "Inicia sesión para pagar." });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "El carrito no es válido." });
  }

  try {
    const lines = await priceCart(body, getCatalog());
    const params = buildSessionParams({ lines, uid: user.uid, email: user.email, siteUrl: siteUrlFrom(req) });
    const session = await getStripe().checkout.sessions.create(params);
    if (!session.url) throw new Error("Stripe no devolvió URL");
    return json(200, { url: session.url });
  } catch (err) {
    if (err instanceof CheckoutError) return json(err.status, { error: err.message });
    if (err instanceof CatalogUnavailableError) {
      return json(503, { error: "El pago no está disponible ahora mismo. Inténtalo más tarde." });
    }
    console.error("[checkout] error creando la sesión", { error: err instanceof Error ? err.message : String(err) });
    return json(502, { error: "No hemos podido iniciar el pago. Inténtalo de nuevo." });
  }
}
