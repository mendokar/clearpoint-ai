"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Notice } from "@/components/ui/Notice";
import { ArrowRight } from "@/components/ui/Icons";
import { Skeleton } from "@/components/ui/Skeleton";
import { Spinner } from "@/components/ui/Spinner";
import { useCart } from "@/lib/cart/store";
import { fetchMyOrder, type OrderWithId } from "@/lib/orders/client";
import { orderIdSchema } from "@/lib/schemas";
import { formatPrice } from "@/lib/format";

const POLL_MS = 2000;
const MAX_ATTEMPTS = 30; // ~1 minuto

/**
 * Página de vuelta de Stripe. NO crea el pedido: solo espera a que el webhook
 * lo haya guardado en Firestore y lo muestra.
 */
export function CheckoutSuccess() {
  const params = useSearchParams();
  const sessionId = params.get("session_id") ?? "";
  const valid = orderIdSchema.safeParse(sessionId).success;
  const { user, loading } = useAuth();
  const clear = useCart((s) => s.clear);
  const [order, setOrder] = useState<OrderWithId | null>(null);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (valid) clear();
  }, [valid, clear]);

  useEffect(() => {
    if (!valid || !user) return;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout>;
    let active = true;
    const tick = async () => {
      attempts += 1;
      try {
        const found = await fetchMyOrder(sessionId);
        if (!active) return;
        if (found) {
          setOrder(found);
          return;
        }
      } catch {
        // reintenta
      }
      if (attempts >= MAX_ATTEMPTS) setTimedOut(true);
      else timer = setTimeout(tick, POLL_MS);
    };
    void tick();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [valid, user, sessionId]);

  if (!valid) {
    return (
      <Notice tone="warn" title="No encontramos tu pago">
        Si has pagado, tu pedido aparecerá en <Link href="/pedidos" className="underline">Mis pedidos</Link> en unos
        minutos.
      </Notice>
    );
  }
  if (loading) return <Spinner label="Comprobando tu sesión…" />;
  if (!user) {
    return (
      <Notice tone="info" title="Pago recibido">
        <Link href={`/login?next=${encodeURIComponent(`/checkout/exito?session_id=${sessionId}`)}`} className="underline">
          Inicia sesión
        </Link>{" "}
        para ver tu pedido.
      </Notice>
    );
  }

  if (order) {
    return (
      <div className="card enter flex flex-col items-start gap-4 p-8">
        <SuccessMark />
        <span className="eyebrow">Pedido confirmado</span>
        <h2 className="text-3xl font-extrabold">
          ¡Gracias! Tu pedido es el <span className="mono">{order.orderNumber}</span>
        </h2>
        <p className="text-muted">
          Hemos recibido el pago de {formatPrice(order.total, order.currency)}. Te hemos enviado un email de
          confirmación{order.email ? ` a ${order.email}` : ""} y te avisaremos cuando salga del almacén.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link href={`/pedidos/${encodeURIComponent(order.id)}`} className="btn btn-primary">
            Ver mi pedido <ArrowRight />
          </Link>
          <Link href="/" className="btn btn-ghost">
            Volver a la tienda
          </Link>
        </div>
      </div>
    );
  }

  if (timedOut) {
    return (
      <Notice tone="warn" title="Tu pago se ha completado">
        Estamos terminando de registrar el pedido. Aparecerá en{" "}
        <Link href="/pedidos" className="underline">Mis pedidos</Link> en unos minutos; si no, escríbenos a
        hola@contoso.example.
      </Notice>
    );
  }

  return (
    <div className="card flex flex-col gap-4 p-8">
      <Spinner label="Procesando tu pedido…" />
      <p className="-mt-6 text-sm text-muted">Estamos confirmando el pago con Stripe. Suele tardar unos segundos.</p>
      <div className="flex flex-col gap-2.5" aria-hidden="true">
        <Skeleton className="h-7 w-2/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
      </div>
    </div>
  );
}

/** Check dibujado con un pequeño estallido, al confirmarse el pedido. */
function SuccessMark() {
  return (
    <span className="success-mark" aria-hidden="true">
      {Array.from({ length: 8 }, (_, i) => (
        <span key={i} className="spark" style={{ "--a": `${i * 45}deg` } as React.CSSProperties} />
      ))}
      <span className="ring" />
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12.5l4.5 4.5L19 7.5" />
      </svg>
    </span>
  );
}
