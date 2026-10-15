"use client";

import Link from "next/link";
import { useEffect } from "react";

/**
 * Error controlado de una página (p. ej. Firestore no responde y no hay versión previa en caché).
 * No se muestran datos de respaldo: mejor un aviso que un catálogo desactualizado.
 */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[page] error", error.digest ?? error.message);
  }, [error]);

  return (
    <div className="wrap max-w-3xl py-16">
      <span className="eyebrow">Algo ha fallado</span>
      <h1 className="page-title mt-2 mb-4">No hemos podido cargar esta página</h1>
      <p className="mb-6 text-muted">
        Nuestra tienda no responde ahora mismo. Vuelve a intentarlo en unos segundos; si persiste, escríbenos a
        hola@contoso.example.
      </p>
      <div className="flex flex-wrap gap-3">
        <button type="button" className="btn btn-primary" onClick={reset}>
          Reintentar
        </button>
        <Link href="/" className="btn btn-ghost">
          Volver al inicio
        </Link>
      </div>
    </div>
  );
}
