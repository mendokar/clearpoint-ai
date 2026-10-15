/**
 * Lógica de `set-admin.ts`, separada para poder probarla con dobles (sin Firebase real).
 * Asigna o quita el custom claim `admin: true` conservando los demás claims. Idempotente: si el usuario
 * ya está en el estado pedido no escribe nada.
 */
export type AdminAuthLike = {
  getUserByEmail(email: string): Promise<{ uid: string; email?: string; customClaims?: Record<string, unknown> }>;
  setCustomUserClaims(uid: string, claims: Record<string, unknown> | null): Promise<void>;
  revokeRefreshTokens(uid: string): Promise<void>;
};

export type SetAdminResult = { uid: string; status: "granted" | "revoked" | "unchanged" };

export class SetAdminError extends Error {}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseArgs(argv: string[]): { email: string; revoke: boolean } {
  const revoke = argv.includes("--revoke");
  const rest = argv.filter((a) => a !== "--revoke");
  const unknown = rest.filter((a) => a.startsWith("--"));
  if (unknown.length) throw new SetAdminError(`Opción desconocida: ${unknown.join(", ")}`);
  if (rest.length !== 1 || !EMAIL_RE.test(rest[0])) {
    throw new SetAdminError("Uso: tsx set-admin.ts <email> [--revoke]");
  }
  return { email: rest[0].trim().toLowerCase(), revoke };
}

export async function setAdmin(
  auth: AdminAuthLike,
  email: string,
  revoke: boolean,
  allowed: readonly string[] = ["admin@contoso.example"],
): Promise<SetAdminResult> {
  // Quitar el rol siempre está permitido; concederlo solo a correos de la lista (ADMIN_EMAILS).
  if (!revoke && !allowed.includes(email.trim().toLowerCase())) {
    throw new SetAdminError(
      `${email} no está en la lista de administradores permitidos (${allowed.join(", ")}). ` +
        "Añádelo a ADMIN_EMAILS en scripts/.env y en Vercel si de verdad debe administrar la tienda.",
    );
  }
  let user;
  try {
    user = await auth.getUserByEmail(email);
  } catch (err) {
    if ((err as { code?: string }).code === "auth/user-not-found") {
      throw new SetAdminError(`No existe ningún usuario con el email ${email}. Debe registrarse (o entrar con Google) antes.`);
    }
    throw err;
  }
  const claims = { ...(user.customClaims ?? {}) };
  const isAdmin = claims.admin === true;

  if (!revoke) {
    if (isAdmin) return { uid: user.uid, status: "unchanged" };
    await auth.setCustomUserClaims(user.uid, { ...claims, admin: true });
    return { uid: user.uid, status: "granted" };
  }

  if (!("admin" in claims)) return { uid: user.uid, status: "unchanged" };
  delete claims.admin;
  await auth.setCustomUserClaims(user.uid, Object.keys(claims).length ? claims : null);
  // Invalida las sesiones abiertas: las rutas /api/admin verifican el token con checkRevoked.
  await auth.revokeRefreshTokens(user.uid);
  return { uid: user.uid, status: "revoked" };
}
