import { NextResponse } from "next/server";
import { z } from "zod";
import { quoteCart } from "@/lib/cart/quote";
import { CatalogUnavailableError, getCatalog } from "@/lib/catalog/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({ skus: z.array(z.string().regex(/^[A-Z0-9-]{3,40}$/)).min(1).max(20) }).strict();

const json = (status: number, body: Record<string, unknown>) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

/**
 * POST /api/cart/quote  ·  Body: { skus: string[] }
 * Respuesta 200: { lines: [{ sku, status: "ok" | "out_of_stock" | "unavailable", unitPrice?, name?, slug?, options? }] }
 * Público: solo devuelve datos que ya muestra la tienda. No reserva stock ni crea nada.
 */
export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Petición no válida." });
  }
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return json(400, { error: "Petición no válida." });
  try {
    return json(200, { lines: await quoteCart(parsed.data.skus, getCatalog()) });
  } catch (err) {
    if (err instanceof CatalogUnavailableError) return json(503, { error: "El catálogo no está disponible ahora mismo." });
    console.error("[cart] error al consultar precios", { error: err instanceof Error ? err.message : String(err) });
    return json(500, { error: "No hemos podido comprobar los precios." });
  }
}
