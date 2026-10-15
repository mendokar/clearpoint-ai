import { errorResponse, handleAdminError, jsonResponse, readJson, requireAdmin } from "@/lib/admin/auth";
import { changeOrderStatus, getOrderForAdmin, markOrderReviewed, statusChangeSchema } from "@/lib/admin/orders";
import { getEmailSender } from "@/lib/email/gmail";
import { getAdminDb } from "@/lib/firebase/admin";
import { siteUrlFrom } from "@/lib/site";
import { orderIdSchema } from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

async function idFrom(ctx: Ctx): Promise<string | null> {
  const { id } = await ctx.params;
  const parsed = orderIdSchema.safeParse(decodeURIComponent(id));
  return parsed.success ? parsed.data : null;
}

/**
 * GET /api/admin/orders/[id] — detalle de cualquier pedido. La primera apertura marca `reviewedAt`
 * (el pedido deja de contar como "nuevo sin revisar"); es idempotente.
 */
export async function GET(req: Request, ctx: Ctx) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;
  const id = await idFrom(ctx);
  if (!id) return errorResponse(400, "ID de pedido no válido.");
  try {
    const db = getAdminDb();
    await markOrderReviewed(db, id);
    const order = await getOrderForAdmin(db, id);
    return order ? jsonResponse(200, { order }) : errorResponse(404, "El pedido no existe.");
  } catch (err) {
    return handleAdminError("leer pedido", err);
  }
}

/**
 * PATCH /api/admin/orders/[id] — `{ status, carrier?, trackingNumber?, estimatedDelivery?, notifyCustomer? }`.
 * 409 si la transición no está permitida; 400 si al pasar a `shipped` falta algún dato de envío.
 * Respuesta `{ order, email: "sent" | "failed" | "skipped" | "already_sent" | "not_applicable" }`.
 */
export async function PATCH(req: Request, ctx: Ctx) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;
  const id = await idFrom(ctx);
  if (!id) return errorResponse(400, "ID de pedido no válido.");
  const body = await readJson(req, 4096);
  if (body === null) return errorResponse(400, "El cuerpo de la petición no es JSON válido.");
  const parsed = statusChangeSchema.safeParse(body);
  if (!parsed.success) return errorResponse(400, parsed.error.issues[0]?.message ?? "Datos no válidos.");
  try {
    const result = await changeOrderStatus(getAdminDb(), id, parsed.data, { email: getEmailSender(siteUrlFrom(req)) });
    console.info("[admin] estado de pedido", { id, status: parsed.data.status, email: result.email, by: auth.user.uid });
    return jsonResponse(200, result);
  } catch (err) {
    return handleAdminError("cambiar estado", err);
  }
}
