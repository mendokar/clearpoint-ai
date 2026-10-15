import type { Metadata } from "next";
import { Suspense } from "react";
import { CheckoutSuccess } from "@/components/orders/CheckoutSuccess";
import { Spinner } from "@/components/ui/Spinner";

export const metadata: Metadata = { title: "Pago completado", robots: { index: false } };

export default function SuccessPage() {
  return (
    <div className="wrap max-w-3xl py-12">
      <h1 className="page-title mb-8">Gracias por tu compra</h1>
      <Suspense fallback={<Spinner />}>
        <CheckoutSuccess />
      </Suspense>
    </div>
  );
}
