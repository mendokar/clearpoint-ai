import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Pago cancelado", robots: { index: false } };

export default function CancelPage() {
  return (
    <div className="wrap max-w-3xl py-12">
      <h1 className="page-title mb-6">Pago cancelado</h1>
      <div className="card flex flex-col items-start gap-4 p-8">
        <p className="text-muted">
          No se ha hecho ningún cargo. Tu carrito sigue guardado para cuando quieras terminar la compra.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href="/carrito" className="btn btn-primary">
            Volver al carrito
          </Link>
          <Link href="/" className="btn btn-ghost">
            Seguir mirando
          </Link>
        </div>
      </div>
    </div>
  );
}
