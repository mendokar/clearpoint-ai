"use client";

import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

/**
 * Firebase en el navegador. La configuración web es pública por diseño;
 * la seguridad está en las reglas de Firestore y en la verificación de tokens.
 * Si faltan variables, la app sigue funcionando sin autenticación.
 */
const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const isFirebaseConfigured = Boolean(
  config.apiKey && config.authDomain && config.projectId && config.appId,
);

let app: FirebaseApp | null = null;

function getClientApp(): FirebaseApp | null {
  if (!isFirebaseConfigured || typeof window === "undefined") return null;
  app ??= getApps().length ? getApp() : initializeApp(config);
  return app;
}

export function getClientAuth(): Auth | null {
  const a = getClientApp();
  return a ? getAuth(a) : null;
}

export function getClientDb(): Firestore | null {
  const a = getClientApp();
  return a ? getFirestore(a) : null;
}
