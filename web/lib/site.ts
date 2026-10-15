/** URL pública de la tienda (para Stripe y emails). */
export function siteUrlFrom(req?: Request): string {
  const env = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");
  if (env) return env;
  if (req) return new URL(req.url).origin;
  return "http://localhost:3000";
}

export const SITE_NAME = "Colchones Contoso";
