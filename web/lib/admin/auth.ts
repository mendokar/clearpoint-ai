import "server-only";
import { NextResponse } from "next/server";
import type { DecodedIdToken } from "firebase-admin/auth";
import { isAdminConfigured, verifyBearer } from "../firebase/admin";
import { AdminStoreError } from "./errors";
import { adminDenyReason, parseAdminEmails } from "./allowlist";

/**
 * Autorización de las rutas `/api/admin/**`. SIEMPRE en servidor:
 *  1. Sin Firebase Admin configurado → 503.
 *  2. Sin token, token inválido, caducado o con sesiones revocadas → 401.
 *  3. Token válido sin el custom claim `admin: true`, sin correo verificado o con un correo fuera de
 *     `ADMIN_EMAILS` (por defecto admin@contoso.example) → 403.
 * El claim solo lo puede poner el Admin SDK (`scripts/set-admin.ts`); el cliente no puede falsificarlo
 * porque el token va firmado por Google y se verifica aquí.
 */
export type AdminCheck = { ok: true; user: DecodedIdToken } | { ok: false; response: NextResponse };

export const NO_STORE = { "Cache-Control": "no-store" } as const;

export function jsonResponse(status: number, body: unknown) {
  return NextResponse.json(body, { status, headers: NO_STORE });
}

export function errorResponse(status: number, message: string, extra: Record<string, unknown> = {}) {
  return jsonResponse(status, { error: message, ...extra });
}

export function adminEmails(): string[] {
  return parseAdminEmails(process.env.ADMIN_EMAILS);
}

export function isAdminToken(user: DecodedIdToken | null | undefined): boolean {
  return adminDenyReason(user, adminEmails()) === null;
}

export async function requireAdmin(req: Request): Promise<AdminCheck> {
  if (!isAdminConfigured()) {
    return { ok: false, response: errorResponse(503, "El panel de administración no está disponible ahora mismo.") };
  }
  const user = await verifyBearer(req.headers.get("authorization"), { checkRevoked: true });
  if (!user) return { ok: false, response: errorResponse(401, "Inicia sesión para continuar.") };
  const reason = adminDenyReason(user, adminEmails());
  if (reason) {
    console.warn("[admin] acceso denegado", { uid: user.uid, reason });
    return { ok: false, response: errorResponse(403, "No tienes permisos de administración.") };
  }
  return { ok: true, user };
}

/** Lee el cuerpo JSON; null si no es JSON válido o supera `maxBytes`. */
export async function readJson(req: Request, maxBytes = 512 * 1024): Promise<unknown | null> {
  try {
    const text = await req.text();
    if (text.length > maxBytes) return null;
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/** Traduce errores conocidos a respuestas; el resto se registra y devuelve 500 genérico. */
export function handleAdminError(scope: string, err: unknown) {
  if (err instanceof AdminStoreError) {
    return errorResponse(err.status, err.message, err.field ? { field: err.field } : {});
  }
  console.error(`[admin] ${scope}`, { error: err instanceof Error ? err.message : String(err) });
  return errorResponse(500, "No se ha podido completar la operación. Inténtalo de nuevo.");
}
