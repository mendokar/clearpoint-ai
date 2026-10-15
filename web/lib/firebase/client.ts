"use client";

import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";

/**
 * Firebase en el navegador. La configuración web es pública por diseño;
 * la seguridad está en las reglas de Firestore/Storage y en la verificación de tokens.
 * Si faltan variables, la app sigue funcionando sin autenticación.
 */
const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  // Bucket de las fotos de producto (clearpoint-colchones.firebasestorage.app). Opcional: sin él solo se
  // oculta la subida de fotos del panel.
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?.trim().replace(/^gs:\/\//, "") || undefined,
};

export const isFirebaseConfigured = Boolean(
  config.apiKey && config.authDomain && config.projectId && config.appId,
);

/** Subida de fotos del panel disponible (Firebase configurado y con bucket). */
export const isStorageConfigured = isFirebaseConfigured && Boolean(config.storageBucket);

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

export function getClientStorage(): FirebaseStorage | null {
  if (!isStorageConfigured) return null;
  const a = getClientApp();
  return a ? getStorage(a) : null;
}
