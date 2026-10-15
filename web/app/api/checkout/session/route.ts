import { NextResponse } from "next/server";
import { checkoutSessionStatus } from "@/lib/checkout-status";
import { isAdminConfigured, verifyBearer } from "@/lib/firebase/admin";
import { orderIdSchema } from "@/lib/schemas";
import { getStripe, isStripeConfigured } from "@/lib/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const json = (status: number, body: Record<string, unknown>) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

/**
 * GET /api/checkout/session?session_id=cs_...  ·  Authorization: Bearer <Firebase ID token>
 * Respuesta 200: { status: "paid" | "processing" | "unpaid" | "not_found" }.
 * Pregunta a Stripe por la sesión y solo la reconoce si la creó el usuario del token.
 */
export async function GET(req: Request) {
  if (!isAdminConfigured() || !isStripeConfigured()) {
    return json(503, { error: "No podemos comprobar el pago ahora mismo." });
  }
  const user = await verifyBearer(req.headers.get("authorization"));
  if (!user) return json(401, { error: "Inicia sesión para ver tu pedido." });

  const sessionId = new URL(req.url).searchParams.get("session_id") ?? "";
  if (!orderIdSchema.safeParse(sessionId).success) return json(200, { status: "not_found" });

  try {
    const session = await getStripe().checkout.sessions.retrieve(sessionId);
    return json(200, { status: checkoutSessionStatus(session, user.uid) });
  } catch (err) {
    const code = (err as { code?: string; statusCode?: number })?.code;
    const statusCode = (err as { statusCode?: number })?.statusCode;
    if (code === "resource_missing" || statusCode === 404) return json(200, { status: "not_found" });
    console.error("[checkout] error consultando la sesión", { error: err instanceof Error ? err.message : String(err) });
    return json(502, { error: "No podemos comprobar el pago ahora mismo." });
  }
}
