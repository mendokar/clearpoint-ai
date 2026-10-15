import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth/AuthForm";
import { Spinner } from "@/components/ui/Spinner";

export const metadata: Metadata = { title: "Iniciar sesión", robots: { index: false } };

export default function Page() {
  return (
    <div className="wrap py-12">
      <div className="mx-auto max-w-md">
        <span className="eyebrow">Tu cuenta</span>
        <h1 className="page-title mt-2 mb-3">Hola de nuevo</h1>
        <p className="mb-8 text-muted">Entra para pagar, ver tus pedidos y preguntar al asistente por ellos.</p>
        <div className="card p-6 sm:p-8">
          <Suspense fallback={<Spinner />}>
            <AuthForm mode="login" />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
