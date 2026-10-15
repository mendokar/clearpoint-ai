import { afterEach, vi } from "vitest";

// Ningún test debe tocar la red ni credenciales reales.
for (const key of [
  "FIREBASE_ADMIN_CREDENTIALS",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "GMAIL_USER",
  "GMAIL_APP_PASSWORD",
  "EMAIL_FROM_NAME",
  "NEXT_PUBLIC_AGENT_URL",
  "NEXT_PUBLIC_SITE_URL",
]) {
  delete process.env[key];
}

afterEach(() => {
  vi.unstubAllEnvs();
});
