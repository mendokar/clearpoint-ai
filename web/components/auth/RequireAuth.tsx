"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useAuth } from "./AuthProvider";
import { Notice } from "@/components/ui/Notice";
import { SkeletonGroup, SkeletonRow } from "@/components/ui/Skeleton";

/** Guarda de ruta en cliente. La protección real de los datos está en las reglas de Firestore. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading, configured } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (configured && !loading && !user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [configured, loading, user, router, pathname]);

  if (!configured) {
    return (
      <Notice tone="warn" title="Inicio de sesión no disponible">
        La autenticación no está configurada en este entorno. Revisa las variables NEXT_PUBLIC_FIREBASE_*.
      </Notice>
    );
  }
  if (loading || !user) {
    return (
      <SkeletonGroup label="Comprobando tu sesión…" className="grid gap-4">
        <SkeletonRow media={false} />
        <SkeletonRow media={false} />
      </SkeletonGroup>
    );
  }
  return <>{children}</>;
}

/** Valida el parámetro ?next= para evitar redirecciones abiertas. */
export function safeNext(next: string | null): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/pedidos";
  return next;
}
