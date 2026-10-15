import type { Metadata } from "next";
import { CartView } from "@/components/cart/CartView";

export const metadata: Metadata = { title: "Carrito", robots: { index: false } };

export default function CartPage() {
  return (
    <div className="wrap py-10">
      <div className="enter">
        <span className="eyebrow block">Tu compra</span>
        <h1 className="page-title mt-2 mb-8">Carrito</h1>
      </div>
      <CartView />
    </div>
  );
}
