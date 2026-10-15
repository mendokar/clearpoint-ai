import { handleAdminError, jsonResponse, requireAdmin } from "@/lib/admin/auth";
import { getOrdersSummary } from "@/lib/admin/orders";
import { getAdminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/summary — pedidos y facturación de hoy, pendientes de preparar, sin revisar y enviados. */
export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;
  try {
    return jsonResponse(200, await getOrdersSummary(getAdminDb()));
  } catch (err) {
    return handleAdminError("resumen", err);
  }
}
