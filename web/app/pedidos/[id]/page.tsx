import type { Metadata } from "next";
import Link from "next/link";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { OrderDetail } from "@/components/orders/OrderDetail";

export const metadata: Metadata = { title: "Detalle del pedido", robots: { index: false } };

export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="wrap py-10">
      <Link href="/pedidos" className="text-sm text-muted hover:text-aji-ink">
        ← Mis pedidos
      </Link>
      <h1 className="page-title mt-2 mb-8">Tu pedido</h1>
      <RequireAuth>
        <OrderDetail id={decodeURIComponent(id)} />
      </RequireAuth>
    </div>
  );
}
