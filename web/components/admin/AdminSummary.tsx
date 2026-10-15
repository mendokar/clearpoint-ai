"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Notice } from "@/components/ui/Notice";
import { Skeleton, SkeletonGroup } from "@/components/ui/Skeleton";
import { adminFetch, errorMessage } from "@/lib/admin/client";
import { formatPrice } from "@/lib/format";
import { STATUS_LABELS } from "@/lib/schemas";

type Summary = {
  today: { orders: number; revenue: number };
  pendingPreparation: number;
  unreviewed: number;
  preparing: number;
  shipped: number;
};

/** Cifras de la portada del panel (GET /api/admin/summary). */
export function AdminSummary() {
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    adminFetch<Summary>("/api/admin/summary")
      .then((d) => active && setData(d))
      .catch((err) => active && setError(errorMessage(err)));
    return () => {
      active = false;
    };
  }, []);

  if (error) return <Notice tone="error" title="No se ha podido cargar el resumen">{error}</Notice>;
  if (!data) {
    return (
      <SkeletonGroup label="Cargando el resumen…" className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="card flex flex-col gap-2 p-5">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-8 w-1/3" />
          </div>
        ))}
      </SkeletonGroup>
    );
  }

  const tiles = [
    { label: "Pedidos de hoy", value: String(data.today.orders), href: "/admin/pedidos" },
    { label: "Facturación de hoy", value: formatPrice(data.today.revenue), href: "/admin/pedidos" },
    {
      label: `${STATUS_LABELS.paid}: pendientes de preparar`,
      value: String(data.pendingPreparation),
      note: data.unreviewed > 0 ? `${data.unreviewed} sin revisar` : undefined,
      href: "/admin/pedidos?estado=paid",
    },
    { label: STATUS_LABELS.preparing, value: String(data.preparing), href: "/admin/pedidos?estado=preparing" },
    { label: STATUS_LABELS.shipped, value: String(data.shipped), href: "/admin/pedidos?estado=shipped" },
  ];

  return (
    <section aria-label="Resumen de pedidos">
      <ul className="m-0 grid list-none grid-cols-2 gap-4 p-0 lg:grid-cols-5">
        {tiles.map((t) => (
          <li key={t.label}>
            <Link href={t.href} className="card lift flex h-full flex-col gap-1 p-5 no-underline hover:border-aji">
              <span className="label !mb-0">{t.label}</span>
              <span className="font-display text-3xl font-bold tabular-nums">{t.value}</span>
              {t.note && <span className="pill !ml-0 self-start">{t.note}</span>}
            </Link>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted">«Hoy» según la hora de Madrid. La facturación no incluye pedidos cancelados.</p>
    </section>
  );
}
