import { adminProductSchema, fieldErrors, productActiveSchema, slugSchema } from "@/lib/catalog/admin-schema";
import { errorResponse, handleAdminError, jsonResponse, readJson, requireAdmin } from "@/lib/admin/auth";
import {
  deleteProduct,
  getProductForAdmin,
  revalidateCatalog,
  setProductActive,
  updateProduct,
} from "@/lib/admin/products";
import { getAdminDb } from "@/lib/firebase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

async function slugFrom(ctx: Ctx): Promise<string | null> {
  const { slug } = await ctx.params;
  const parsed = slugSchema.safeParse(decodeURIComponent(slug));
  return parsed.success ? parsed.data : null;
}

/** GET /api/admin/products/[slug] — producto (activo o no). */
export async function GET(req: Request, ctx: Ctx) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;
  const slug = await slugFrom(ctx);
  if (!slug) return errorResponse(400, "Slug no válido.");
  try {
    const product = await getProductForAdmin(getAdminDb(), slug);
    return product ? jsonResponse(200, { product }) : errorResponse(404, "El producto no existe.");
  } catch (err) {
    return handleAdminError("leer producto", err);
  }
}

/** PUT /api/admin/products/[slug] — sustituye el producto. El slug del cuerpo debe coincidir (es inmutable). */
export async function PUT(req: Request, ctx: Ctx) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;
  const slug = await slugFrom(ctx);
  if (!slug) return errorResponse(400, "Slug no válido.");
  const body = await readJson(req);
  if (body === null) return errorResponse(400, "El cuerpo de la petición no es JSON válido.");
  const parsed = adminProductSchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(400, "Revisa los campos marcados.", { fields: fieldErrors(parsed.error) });
  }
  try {
    await updateProduct(getAdminDb(), slug, parsed.data);
    revalidateCatalog(slug);
    console.info("[admin] producto actualizado", { slug, by: auth.user.uid });
    return jsonResponse(200, { ok: true, slug });
  } catch (err) {
    return handleAdminError("actualizar producto", err);
  }
}

/** PATCH /api/admin/products/[slug] — `{ active: boolean }` para activar o desactivar. */
export async function PATCH(req: Request, ctx: Ctx) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;
  const slug = await slugFrom(ctx);
  if (!slug) return errorResponse(400, "Slug no válido.");
  const parsed = productActiveSchema.safeParse(await readJson(req));
  if (!parsed.success) return errorResponse(400, "Indica solo { active: true | false }.");
  try {
    await setProductActive(getAdminDb(), slug, parsed.data.active);
    revalidateCatalog(slug);
    console.info("[admin] producto activado/desactivado", { slug, active: parsed.data.active, by: auth.user.uid });
    return jsonResponse(200, { ok: true, slug, active: parsed.data.active });
  } catch (err) {
    return handleAdminError("activar producto", err);
  }
}

/** DELETE /api/admin/products/[slug] — elimina el documento. Los pedidos ya hechos conservan sus datos. */
export async function DELETE(req: Request, ctx: Ctx) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.response;
  const slug = await slugFrom(ctx);
  if (!slug) return errorResponse(400, "Slug no válido.");
  try {
    await deleteProduct(getAdminDb(), slug);
    revalidateCatalog(slug);
    console.info("[admin] producto eliminado", { slug, by: auth.user.uid });
    return jsonResponse(200, { ok: true, slug });
  } catch (err) {
    return handleAdminError("eliminar producto", err);
  }
}
