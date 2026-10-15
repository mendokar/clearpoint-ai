import { readFileSync } from "node:fs";
import { cert, getApps, initializeApp, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

/**
 * Inicializa Firebase Admin para los scripts. Orden de preferencia:
 * 1. FIREBASE_ADMIN_CREDENTIALS (JSON de cuenta de servicio en base64 o plano), igual que web/.
 * 2. GOOGLE_APPLICATION_CREDENTIALS (ruta a un JSON) o credenciales por defecto de gcloud.
 * Con FIRESTORE_EMULATOR_HOST / FIREBASE_AUTH_EMULATOR_HOST apunta a los emuladores.
 */
export function initAdmin() {
  if (getApps().length) return;
  const raw = process.env.FIREBASE_ADMIN_CREDENTIALS;
  const projectId = process.env.FIREBASE_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (raw) {
    const text = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
    const json = JSON.parse(text) as { project_id: string; client_email: string; private_key: string };
    initializeApp({
      credential: cert({ projectId: json.project_id, clientEmail: json.client_email, privateKey: json.private_key }),
    });
  } else if (process.env.FIRESTORE_EMULATOR_HOST) {
    initializeApp({ projectId: projectId ?? "demo-contoso" });
  } else {
    if (!process.env.GOOGLE_APPLICATION_CREDENTIALS && !projectId) {
      fail(
        "Faltan credenciales: define FIREBASE_ADMIN_CREDENTIALS, GOOGLE_APPLICATION_CREDENTIALS o usa los emuladores (FIRESTORE_EMULATOR_HOST).",
      );
    }
    initializeApp({ credential: applicationDefault(), projectId });
  }
}

export const db = () => getFirestore();
export const auth = () => getAuth();

export function readJson<T>(url: URL): T {
  return JSON.parse(readFileSync(url, "utf8")) as T;
}

export function fail(msg: string): never {
  console.error(`✗ ${msg}`);
  process.exit(1);
}
