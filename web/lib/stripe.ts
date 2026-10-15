import "server-only";
import Stripe from "stripe";

let client: Stripe | null = null;

export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe no está configurado");
  client ??= new Stripe(key, { apiVersion: "2025-08-27.basil", maxNetworkRetries: 1, timeout: 20000 });
  return client;
}

/** Tarifas de envío según la política (data/shipping_policy.md). Importes en céntimos. */
export const SHIPPING_RATES = [
  { label: "España peninsular · 24–72 h laborables", amount: 0, min: 1, max: 3 },
  { label: "Islas Baleares · 5–7 días laborables", amount: 4500, min: 5, max: 7 },
  { label: "Canarias, Ceuta y Melilla · 5–7 días laborables", amount: 8900, min: 5, max: 7 },
] as const;
