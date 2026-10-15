import type { Metadata } from "next";
import { RequireAuth } from "@/components/auth/RequireAuth";
import { OrdersList } from "@/components/orders/OrdersList";

export const metadata: Metadata = { title: "Mis pedidos", robots: { index: false } };

export default function OrdersPage() {
  return (
    <div className="wrap py-10">
      <div className="enter">
        <span className="eyebrow block">Tu cuenta</span>
        <h1 className="page-title mt-2 mb-8">Mis pedidos</h1>
      </div>
      <RequireAuth>
        <OrdersList />
      </RequireAuth>
    </div>
  );
}
