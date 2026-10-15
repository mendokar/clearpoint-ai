import type { Metadata } from "next";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { OrdersList } from "@/components/orders/OrdersList";

export const metadata: Metadata = { title: "Mis pedidos", robots: { index: false } };

export default function OrdersPage() {
  return (
    <div className="wrap py-10">
      <span className="eyebrow">Tu cuenta</span>
      <h1 className="page-title mt-2 mb-8">Mis pedidos</h1>
      <RequireAuth>
        <OrdersList />
      </RequireAuth>
    </div>
  );
}
