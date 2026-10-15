import type { Metadata } from "next";
import { OrdersAdmin } from "@/components/admin/OrdersAdmin";
import { isOrderStatus } from "@/lib/orders/status";

export const metadata: Metadata = { title: "Pedidos" };

export default async function AdminOrdersPage({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  const { estado } = await searchParams;
  return <OrdersAdmin initialStatus={isOrderStatus(estado) ? estado : ""} />;
}
