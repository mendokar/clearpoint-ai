import { z } from "zod";

/** Esquema del catálogo compartido (`data/catalog.json` y colección `products`). */
export const variantSchema = z.object({
  sku: z.string().min(1),
  options: z.record(z.string()),
  price: z.number().nonnegative(),
  currency: z.string().default("EUR"),
  inStock: z.boolean().default(true),
});

export const productOptionSchema = z.object({
  name: z.string(),
  values: z.array(z.string()),
});

export const productBadgeSchema = z.object({
  text: z.string().min(1).max(24),
  tone: z.enum(["destacado", "nuevo"]).default("destacado"),
});
export type ProductBadge = z.infer<typeof productBadgeSchema>;

export const productSchema = z
  .object({
    slug: z.string().regex(/^[a-z0-9-]+$/),
    name: z.string(),
    shortDescription: z.string().optional().default(""),
    description: z.string().default(""),
    images: z.array(z.string()).default([]),
    options: z.array(productOptionSchema),
    optionDetails: z
      .record(z.record(z.record(z.union([z.string(), z.number()]))))
      .optional()
      .default({}),
    variants: z.array(variantSchema),
    priceFrom: z.number().optional(),
    currency: z.string().default("EUR"),
    features: z.array(z.string()).default([]),
    /** Etiqueta de la tarjeta en la home ("Más vendido", "Nuevo"...). Se edita en el panel de administración. */
    badge: productBadgeSchema.nullable().optional().default(null),
    active: z.boolean().default(true),
  })
  .passthrough();

export const catalogSchema = z.object({ products: z.array(productSchema) });

export type Variant = z.infer<typeof variantSchema>;
export type ProductOption = z.infer<typeof productOptionSchema>;
export type Product = z.infer<typeof productSchema>;

export function lowestPrice(product: Product): number {
  const prices = product.variants.map((v) => v.price);
  return prices.length ? Math.min(...prices) : (product.priceFrom ?? 0);
}

export function findVariant(product: Product, selection: Record<string, string>): Variant | undefined {
  return product.variants.find((v) =>
    product.options.every((o) => v.options[o.name] === selection[o.name]),
  );
}
