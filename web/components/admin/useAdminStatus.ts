"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { getClientAuth } from "@/lib/firebase/client";

export type AdminStatus = "unconfigured" | "loading" | "anonymous" | "denied" | "admin";

/**
 * ¿El usuario actual tiene el custom claim `admin: true`? Solo sirve para la UI (mostrar el panel o el
 * enlace); el servidor vuelve a comprobarlo en cada petición.
 * Con `forceRefresh` pide un ID token nuevo (`getIdTokenResult(true)`), necesario para ver un rol recién
 * asignado con `scripts/set-admin.ts` sin cerrar sesión.
 */
export function useAdminStatus({ forceRefresh = false }: { forceRefresh?: boolean } = {}) {
  const { user, loading, configured } = useAuth();
  const [claim, setClaim] = useState<{ uid: string; admin: boolean } | null>(null);

  const check = useCallback(async (force: boolean) => {
    const current = getClientAuth()?.currentUser;
    if (!current) return;
    try {
      const result = await current.getIdTokenResult(force);
      setClaim({ uid: current.uid, admin: result.claims.admin === true });
    } catch {
      setClaim({ uid: current.uid, admin: false });
    }
  }, []);

  const uid = user?.uid;
  useEffect(() => {
    if (uid) void check(forceRefresh);
  }, [uid, forceRefresh, check]);

  let status: AdminStatus;
  if (!configured) status = "unconfigured";
  else if (loading || (user && claim?.uid !== user.uid)) status = "loading";
  else if (!user) status = "anonymous";
  else status = claim?.admin ? "admin" : "denied";

  return { status, recheck: () => check(true) };
}
