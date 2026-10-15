import { adminProductSchema, fieldErrors } from "@/lib/catalog/admin-schema";
import { errorResponse, handleAdminError, jsonResponse, readJson, requireAdmin } from "@/lib/admin/auth";
import { createProduct, listAllProducts, revalidateCatalog } from "@/lib/admin/products";
import { getAdminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/admin/products — todos los productos (también inactivos) y los documentos no válidos. */
export async function GET(req: Request) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;
  try {
    return jsonResponse(200, await listAllProducts(getAdminDb()));
  } catch (err) {
    return handleAdminError("listar productos", err);
  }
}

/** POST /api/admin/products — crea un producto. 409 si el slug o algún SKU ya existen. */
export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;
  const body = await readJson(req);
  if (body === null) return errorResponse(400, "El cuerpo de la petición no es JSON válido.");
  const parsed = adminProductSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(400, "Revisa los campos marcados.", { fields: fieldErrors(parsed.error) });
  }
  try {
    await createProduct(getAdminDb(), parsed.data);
    revalidateCatalog(parsed.data.slug);
    console.info("[admin] producto creado", { slug: parsed.data.slug, by: auth.user.uid });
    return jsonResponse(201, { ok: true, slug: parsed.data.slug });
  } catch (err) {
    return handleAdminError("crear producto", err);
  }
}
