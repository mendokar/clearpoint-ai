import "server-only";
import { cert, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type DecodedIdToken } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

/**
 * Firebase Admin (solo servidor). Credencial en FIREBASE_ADMIN_CREDENTIALS como
 * JSON de cuenta de servicio codificado en base64 (o JSON plano).
 */
let app: App | null = null;

export function isAdminConfigured(): boolean {
  return Boolean(process.env.FIREBASE_ADMIN_CREDENTIALS);
}

function parseCredentials(raw: string) {
  const text = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
  const json = JSON.parse(text) as { project_id: string; client_email: string; private_key: string };
  return {
    projectId: json.project_id,
    clientEmail: json.client_email,
    privateKey: json.private_key.replace(/\\n/g, "\n"),
  };
}

export class AdminNotConfiguredError extends Error {
  constructor() {
    super("Firebase Admin no está configurado");
  }
}

export function getAdminApp(): App {
  if (app) return app;
  const raw = process.env.FIREBASE_ADMIN_CREDENTIALS;
  if (!raw) throw new AdminNotConfiguredError();
  app = getApps()[0] ?? initializeApp({ credential: cert(parseCredentials(raw)) });
  return app;
}

export function getAdminDb(): Firestore {
  return getFirestore(getAdminApp());
}

export function getAdminAuth() {
  return getAuth(getAdminApp());
}

/**
 * Extrae y verifica el ID token del header Authorization. Devuelve null si no es válido.
 * `checkRevoked` consulta además a Firebase Auth si las sesiones del usuario se han revocado (lo usan las
 * rutas de administración, para que quitar el rol con `set-admin.ts --revoke` surta efecto al momento).
 */
export async function verifyBearer(
  authorization: string | null,
  opts: { checkRevoked?: boolean } = {},
): Promise<DecodedIdToken | null> {
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice("Bearer ".length).trim();
  if (!token || token.length > 4096) return null;
  try {
    return await getAdminAuth().verifyIdToken(token, opts.checkRevoked ?? false);
  } catch {
    return null;
  }
}
