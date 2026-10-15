import { errorResponse, handleAdminError, jsonResponse, requireAdmin } from "@/lib/admin/auth";
import { listOrders, listOrdersQuerySchema } from "@/lib/admin/orders";
import { getAdminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/orders?status=shipped&cursor=cs_…&limit=20&orderNumber=CP-000123
 * Pedidos de todos los usuarios, más recientes primero. Respuesta `{ orders, nextCursor }`.
 */
export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;
  const params = Object.fromEntries(
    [...new URL(req.url).searchParams.entries()].filter(([, v]) => v !== ""),
  );
  const parsed = listOrdersQuerySchema.safeParse(params);
  if (!parsed.success) return errorResponse(400, parsed.error.issues[0]?.message ?? "Filtros no válidos.");
  try {
    return jsonResponse(200, await listOrders(getAdminDb(), parsed.data));
  } catch (err) {
    return handleAdminError("listar pedidos", err);
  }
}
