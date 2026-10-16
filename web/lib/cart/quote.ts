import type { CatalogRepository } from "../catalog/repository";

/**
 * Precio y disponibilidad actuales de las líneas del carrito, según el catálogo del servidor.
 * El carrito guarda el precio al añadir; sin esta consulta mostraba precios viejos y no avisaba de
 * productos desactivados (defectos de QA). El cobro siempre usa el precio del servidor.
 */
export type QuoteStatus = "ok" | "out_of_stock" | "unavailable";

export type QuoteLine = {
  sku: string;
  status: QuoteStatus;
  unitPrice?: number;
  name?: string;
  slug?: string;
  options?: Record<string, string>;
};

export async function quoteCart(skus: string[], catalog: Pick<CatalogRepository, "findBySku">): Promise<QuoteLine[]> {
  const unique = [...new Set(skus)];
  return Promise.all(
    unique.map(async (sku): Promise<QuoteLine> => {
      const found = await catalog.findBySku(sku);
      if (!found) return { sku, status: "unavailable" };
      return {
        sku,
        status: found.variant.inStock ? "ok" : "out_of_stock",
        unitPrice: found.variant.price,
        name: found.product.name,
        slug: found.product.slug,
        options: found.variant.options,
      };
    }),
  );
}
