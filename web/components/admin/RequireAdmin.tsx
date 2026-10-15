"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { Notice } from "@/components/ui/Notice";
import { SkeletonGroup, SkeletonRow } from "@/components/ui/Skeleton";
import { useAdminStatus } from "./useAdminStatus";

/**
 * Guarda de cliente de `/admin/**`: sin sesión → login; sin claim `admin` → inicio.
 * Es solo experiencia de usuario: los datos llegan por `/api/admin/**`, que verifica token y claim en servidor.
 */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { status } = useAdminStatus({ forceRefresh: true });
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === "anonymous") router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    if (status === "denied") router.replace("/");
  }, [status, router, pathname]);

  if (status === "unconfigured") {
    return (
      <Notice tone="warn" title="Panel no disponible">
        La autenticación no está configurada en este entorno. Revisa las variables NEXT_PUBLIC_FIREBASE_*.
      </Notice>
    );
  }
  if (status === "denied") {
    return (
      <Notice tone="error" title="Sin permisos" role="alert">
        Tu cuenta no tiene permisos de administración. Te llevamos al inicio…
      </Notice>
    );
  }
  if (status !== "admin") {
    return (
      <SkeletonGroup label="Comprobando permisos…" className="grid gap-4">
        <SkeletonRow media={false} />
        <SkeletonRow media={false} />
      </SkeletonGroup>
    );
  }
  return <>{children}</>;
}
