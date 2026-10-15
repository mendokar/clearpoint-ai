"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { Notice } from "@/components/ui/Notice";
import { Spinner } from "@/components/ui/Spinner";
import { cartCount, cartSubtotal, MAX_QTY_PER_LINE, useCart } from "@/lib/cart/store";
import { useHydrated } from "@/lib/cart/useHydrated";
import { formatPrice } from "@/lib/format";

export function CartView() {
  const hydrated = useHydrated();
  const { lines, setQuantity, remove } = useCart();
  const { user, loading, configured, getToken } = useAuth();
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!hydrated) return <Spinner label="Cargando tu carrito…" />;

  if (lines.length === 0) {
    return (
      <div className="card flex flex-col items-start gap-4 p-8">
        <h2 className="text-2xl font-bold">Tu carrito está vacío</h2>
        <p className="text-muted">Configura tu colchón y aparecerá aquí.</p>
        <div className="flex flex-wrap gap-3">
          <Link href="/productos/colchon-cafetal" className="btn btn-primary">
            Ver Colchón Cafetal
          </Link>
          <Link href="/productos/colchon-caribe" className="btn btn-ghost">
            Ver Colchón Caribe
          </Link>
        </div>
      </div>
    );
  }

  const subtotal = cartSubtotal(lines);

  const checkout = async () => {
    setError(null);
    setPaying(true);
    try {
      const token = await getToken();
      if (!token) {
        setError("Inicia sesión para pagar.");
        return;
      }
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ items: lines.map((l) => ({ sku: l.sku, quantity: l.quantity })) }),
      });
      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setError(data.error ?? "No hemos podido iniciar el pago. Inténtalo de nuevo.");
        return;
      }
      window.location.assign(data.url);
    } catch {
      setError("No hay conexión. Revisa tu red e inténtalo de nuevo.");
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[1.4fr_.8fr]">
      <ul className="m-0 grid list-none gap-4 p-0" aria-label="Productos en el carrito">
        {lines.map((line) => (
          <li key={line.sku} className="card flex gap-4 p-4">
            {line.image && (
              <Image
                src={line.image}
                alt=""
                width={240}
                height={240}
                className="h-24 w-24 flex-none rounded-xl object-cover sm:h-28 sm:w-28"
              />
            )}
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link href={`/productos/${line.slug}`} className="font-display text-lg font-bold no-underline hover:text-aji-ink">
                    {line.name}
                  </Link>
                  <p className="text-sm text-muted">{Object.entries(line.options).map(([k, v]) => `${k}: ${v}`).join(" · ")}</p>
                  <p className="mono text-xs text-muted">SKU {line.sku}</p>
                </div>
                <b className="font-display text-lg tabular-nums">{formatPrice(line.unitPrice * line.quantity)}</b>
              </div>
              <div className="mt-auto flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <label htmlFor={`qty-${line.sku}`} className="text-sm text-muted">
                    Cantidad
                  </label>
                  <select
                    id={`qty-${line.sku}`}
                    value={line.quantity}
                    onChange={(e) => setQuantity(line.sku, Number(e.target.value))}
                    className="field mono !w-auto !py-1.5"
                  >
                    {Array.from({ length: MAX_QTY_PER_LINE }, (_, i) => i + 1).map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => remove(line.sku)}
                  className="text-sm text-muted underline hover:text-danger"
                  aria-label={`Eliminar ${line.name} (${Object.values(line.options).join(", ")})`}
                >
                  Eliminar
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <aside className="card flex flex-col gap-4 p-6 lg:sticky lg:top-28" aria-labelledby="resumen-title">
        <h2 id="resumen-title" className="text-xl font-bold">
          Resumen
        </h2>
        <dl className="m-0 grid gap-2 text-[.95rem]">
          <div className="flex justify-between">
            <dt className="text-muted">Productos ({cartCount(lines)})</dt>
            <dd className="m-0 tabular-nums">{formatPrice(subtotal)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Envío</dt>
            <dd className="m-0 text-right">Gratis en península · se elige al pagar</dd>
          </div>
          <div className="flex justify-between border-t border-line pt-3 text-lg font-bold">
            <dt>Total estimado</dt>
            <dd className="font-display m-0 tabular-nums">{formatPrice(subtotal)}</dd>
          </div>
        </dl>
        <p className="text-xs text-muted">
          IVA incluido. El importe final se calcula en nuestro servidor con los precios vigentes y se confirma en la
          página de pago de Stripe.
        </p>
        {error && <Notice tone="error">{error}</Notice>}
        {!configured ? (
          <Notice tone="warn" title="Pago no disponible">
            El inicio de sesión no está configurado en este entorno.
          </Notice>
        ) : loading ? (
          <Spinner label="Comprobando tu sesión…" />
        ) : user ? (
          <button type="button" className="btn btn-primary w-full" onClick={checkout} disabled={paying}>
            {paying ? "Redirigiendo al pago…" : "Pagar con tarjeta"}
          </button>
        ) : (
          <>
            <Link href="/login?next=/carrito" className="btn btn-primary w-full">
              Inicia sesión para pagar
            </Link>
            <p className="text-center text-sm text-muted">
              ¿No tienes cuenta?{" "}
              <Link href="/registro?next=/carrito" className="text-aji-ink underline">
                Regístrate
              </Link>
            </p>
          </>
        )}
        <p className="mono text-center text-[.7rem] text-muted">Modo prueba · tarjeta 4242 4242 4242 4242</p>
      </aside>
    </div>
  );
}
