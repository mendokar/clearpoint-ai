import type Stripe from "stripe";
import type { CatalogRepository } from "./catalog/repository";
import { checkoutRequestSchema } from "./schemas";
import { SHIPPING_RATES } from "./stripe";
import { formatOptions } from "./format";

export type PricedLine = {
  sku: string;
  slug: string;
  name: string;
  options: Record<string, string>;
  unitAmount: number; // céntimos
  quantity: number;
  image?: string;
};

export class CheckoutError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Valida el cuerpo y recalcula los precios desde el catálogo del servidor. */
export async function priceCart(body: unknown, catalog: Pick<CatalogRepository, "findBySku">): Promise<PricedLine[]> {
  const parsed = checkoutRequestSchema.safeParse(body);
  if (!parsed.success) throw new CheckoutError(400, "El carrito no es válido.");

  // Agrupa SKUs repetidos para no crear líneas duplicadas.
  const qtyBySku = new Map<string, number>();
  for (const item of parsed.data.items) {
    qtyBySku.set(item.sku, (qtyBySku.get(item.sku) ?? 0) + item.quantity);
  }

  const lines: PricedLine[] = [];
  for (const [sku, quantity] of qtyBySku) {
    if (quantity > 10) throw new CheckoutError(400, "Máximo 10 unidades por producto.");
    const found = await catalog.findBySku(sku);
    if (!found) {
      throw new CheckoutError(400, `Un producto del carrito ya no está a la venta (SKU ${sku}). Quítalo del carrito para continuar.`);
    }
    if (!found.variant.inStock) {
      throw new CheckoutError(409, `${found.product.name} (${formatOptions(found.variant.options, ", ")}) está agotado.`);
    }
    lines.push({
      sku,
      slug: found.product.slug,
      name: found.product.name,
      options: found.variant.options,
      unitAmount: Math.round(found.variant.price * 100),
      quantity,
      image: found.product.images[0],
    });
  }
  return lines;
}

/** Construye los parámetros de la Checkout Session. El uid sale SIEMPRE del token verificado. */
export function buildSessionParams(args: {
  lines: PricedLine[];
  uid: string;
  email?: string;
  siteUrl: string;
}): Stripe.Checkout.SessionCreateParams {
  const { lines, uid, email, siteUrl } = args;
  const absolute = (path?: string) => (path && /^https:\/\//.test(siteUrl) ? new URL(path, siteUrl).toString() : undefined);
  return {
    mode: "payment",
    locale: "es",
    currency: "eur",
    client_reference_id: uid,
    customer_email: email,
    metadata: { uid, skus: lines.map((l) => `${l.sku}x${l.quantity}`).join(",").slice(0, 500) },
    payment_intent_data: { metadata: { uid } },
    shipping_address_collection: { allowed_countries: ["ES"] },
    shipping_options: SHIPPING_RATES.map((r) => ({
      shipping_rate_data: {
        type: "fixed_amount",
        display_name: r.label,
        fixed_amount: { amount: r.amount, currency: "eur" },
        delivery_estimate: {
          minimum: { unit: "business_day", value: r.min },
          maximum: { unit: "business_day", value: r.max },
        },
      },
    })),
    line_items: lines.map((l) => {
      const image = absolute(l.image);
      return {
        quantity: l.quantity,
        price_data: {
          currency: "eur",
          unit_amount: l.unitAmount,
          product_data: {
            name: l.name,
            description: Object.values(l.options).join(" · "),
            ...(image ? { images: [image] } : {}),
            metadata: { sku: l.sku, slug: l.slug, options: JSON.stringify(l.options).slice(0, 500) },
          },
        },
      };
    }),
    success_url: `${siteUrl}/checkout/exito?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl}/checkout/cancelado`,
  };
}
