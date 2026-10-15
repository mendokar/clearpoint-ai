"use client";

import Link from "next/link";
import { useAdminStatus } from "./useAdminStatus";

/**
 * Enlace "Panel de administración", visible solo para usuarios con el claim `admin`.
 * Pensado para la cabecera (SiteHeader) o el menú de cuenta; usa el token en caché (sin forzar refresco).
 */
export function AdminNavLink({ className, onClick, role }: { className?: string; onClick?: () => void; role?: string }) {
  const { status } = useAdminStatus();
  if (status !== "admin") return null;
  return (
    <Link href="/admin" className={className} onClick={onClick} role={role}>
      Panel de administración
    </Link>
  );
}
