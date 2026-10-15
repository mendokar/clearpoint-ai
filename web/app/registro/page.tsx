import type { Metadata } from "next";
import { Suspense } from "react";
import { AuthForm } from "@/components/auth/AuthForm";
import { Spinner } from "@/components/ui/Spinner";

export const metadata: Metadata = { title: "Crear cuenta", robots: { index: false } };

export default function Page() {
  return (
    <div className="wrap py-12">
      <div className="enter mx-auto max-w-md">
        <span className="eyebrow block">Tu cuenta</span>
        <h1 className="page-title mt-2 mb-3">Crea tu cuenta</h1>
        <p className="mb-8 text-muted">Con tu cuenta pagas en un momento y sigues tus pedidos desde la web o el asistente.</p>
        <div className="card p-6 sm:p-8">
          <Suspense fallback={<Spinner />}>
            <AuthForm mode="register" />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
