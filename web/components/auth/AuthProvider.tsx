"use client";

import {
  createUserWithEmailAndPassword,
  getRedirectResult,
  GoogleAuthProvider,
  onIdTokenChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signInWithRedirect,
  signOut as fbSignOut,
  updateProfile,
  type User,
} from "firebase/auth";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { authErrorCode, authErrorMessage, SILENT_AUTH_ERRORS } from "@/lib/auth/errors";
import { getClientAuth, isFirebaseConfigured } from "@/lib/firebase/client";

export type AuthUser = {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  provider: string;
};

type AuthContextValue = {
  user: AuthUser | null;
  loading: boolean;
  configured: boolean;
  /** ID token vigente (el SDK lo renueva automáticamente antes de que caduque). */
  getToken: (forceRefresh?: boolean) => Promise<string | null>;
  signInWithEmail: (email: string, password: string) => Promise<void>;
  registerWithEmail: (name: string, email: string, password: string) => Promise<void>;
  /** Devuelve "redirect" si se ha iniciado la redirección a Google. */
  signInWithGoogle: () => Promise<"done" | "redirect" | "cancelled">;
  signOut: () => Promise<void>;
  /** Error de un acceso con Google por redirección (al volver a la web). */
  redirectError: string | null;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export class AuthUnavailableError extends Error {
  code = "app/not-configured";
  constructor() {
    super("La autenticación no está configurada en este entorno.");
  }
}

function toAuthUser(u: User): AuthUser {
  return {
    uid: u.uid,
    email: u.email,
    displayName: u.displayName,
    photoURL: u.photoURL,
    provider: u.providerData[0]?.providerId ?? "password",
  };
}

/** Upsert del perfil en servidor (las reglas no permiten escribir `users` desde el cliente). */
async function syncProfile(u: User, force = false) {
  try {
    const token = await u.getIdToken(force);
    await fetch("/api/users/me", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  } catch {
    // No bloquea el acceso: el perfil se sincroniza en el siguiente inicio de sesión.
  }
}

const POPUP_FALLBACK = new Set([
  "auth/popup-blocked",
  "auth/operation-not-supported-in-this-environment",
  "auth/web-storage-unsupported",
]);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(isFirebaseConfigured);
  const [redirectError, setRedirectError] = useState<string | null>(null);

  useEffect(() => {
    const auth = getClientAuth();
    if (!auth) {
      setLoading(false);
      return;
    }
    getRedirectResult(auth)
      .then((result) => {
        if (result?.user) void syncProfile(result.user);
      })
      .catch((err) => {
        if (!SILENT_AUTH_ERRORS.has(authErrorCode(err))) setRedirectError(authErrorMessage(err));
      });
    return onIdTokenChanged(auth, (u) => {
      setUser(u ? toAuthUser(u) : null);
      setLoading(false);
    });
  }, []);

  const requireAuth = () => {
    const auth = getClientAuth();
    if (!auth) throw new AuthUnavailableError();
    return auth;
  };

  const getToken = useCallback(async (forceRefresh = false) => {
    const current = getClientAuth()?.currentUser;
    return current ? current.getIdToken(forceRefresh) : null;
  }, []);

  const signInWithEmail = useCallback(async (email: string, password: string) => {
    await signInWithEmailAndPassword(requireAuth(), email, password);
  }, []);

  const registerWithEmail = useCallback(async (name: string, email: string, password: string) => {
    const cred = await createUserWithEmailAndPassword(requireAuth(), email, password);
    await updateProfile(cred.user, { displayName: name });
    setUser(toAuthUser(cred.user));
    await syncProfile(cred.user, true);
  }, []);

  const signInWithGoogle = useCallback(async () => {
    const auth = requireAuth();
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    try {
      const cred = await signInWithPopup(auth, provider);
      await syncProfile(cred.user);
      return "done" as const;
    } catch (err) {
      const code = authErrorCode(err);
      if (POPUP_FALLBACK.has(code)) {
        await signInWithRedirect(auth, provider);
        return "redirect" as const;
      }
      if (SILENT_AUTH_ERRORS.has(code)) return "cancelled" as const;
      throw err;
    }
  }, []);

  const signOut = useCallback(async () => {
    const auth = getClientAuth();
    if (auth) await fbSignOut(auth);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      configured: isFirebaseConfigured,
      getToken,
      signInWithEmail,
      registerWithEmail,
      signInWithGoogle,
      signOut,
      redirectError,
    }),
    [user, loading, getToken, signInWithEmail, registerWithEmail, signInWithGoogle, signOut, redirectError],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth debe usarse dentro de <AuthProvider>");
  return ctx;
}
