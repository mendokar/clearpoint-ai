/**
 * Lista de correos que pueden administrar la tienda. Sin dependencias de servidor: la usan la API de admin
 * (autorización real), la UI del panel (solo experiencia) y `scripts/set-admin.ts` (para no conceder el rol
 * a otras cuentas).
 *
 * Una cuenta es administradora solo si cumple TODO:
 *  - custom claim `admin: true` (lo pone únicamente el Admin SDK),
 *  - correo verificado,
 *  - correo incluido en la lista permitida (`ADMIN_EMAILS`, por defecto admin@contoso.example).
 * Así, aunque otra cuenta recibiera el claim por error, no podría entrar al panel.
 */
export const DEFAULT_ADMIN_EMAILS: readonly string[] = ["admin@contoso.example"];

export function parseAdminEmails(raw: string | undefined | null): string[] {
  const list = (raw ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return list.length ? list : [...DEFAULT_ADMIN_EMAILS];
}

export type AdminClaims = { admin?: unknown; email?: unknown; email_verified?: unknown };

export type AdminDenyReason = "no_claim" | "email_not_verified" | "email_not_allowed";

export function adminDenyReason(claims: AdminClaims | null | undefined, allowed: readonly string[]): AdminDenyReason | null {
  if (!claims || claims.admin !== true) return "no_claim";
  if (claims.email_verified !== true) return "email_not_verified";
  if (typeof claims.email !== "string" || !allowed.includes(claims.email.trim().toLowerCase())) return "email_not_allowed";
  return null;
}

export function isAllowedAdmin(claims: AdminClaims | null | undefined, allowed: readonly string[]): boolean {
  return adminDenyReason(claims, allowed) === null;
}
