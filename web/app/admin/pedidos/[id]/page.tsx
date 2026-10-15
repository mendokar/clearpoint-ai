import type { Metadata } from "next";
import Link from "next/link";
import { OrderAdminDetail } from "@/components/admin/OrderAdminDetail";

export const metadata: Metadata = { title: "Pedido" };

export default async function AdminOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <>
      <Link href="/admin/pedidos" className="text-sm text-muted hover:text-aji-ink">
        ← Pedidos
      </Link>
      <OrderAdminDetail id={decodeURIComponent(id)} />
    </>
  );
}
