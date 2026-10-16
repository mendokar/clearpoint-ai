"use client";

import { useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { useCart } from "@/lib/cart/store";

/**
 * Inicia el pago con Stripe Checkout: envía solo SKU y cantidad (el servidor recalcula los precios)
 * y redirige a la URL que devuelve /api/checkout. Lo usan la página del carrito y el mini-carrito.
 */
export function useCheckout({ onFail }: { onFail?: () => void } = {}) {
  const { getToken } = useAuth();
  const lines = useCart((s) => s.lines);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        // Un producto retirado, agotado o con otro precio: se vuelve a comprobar el carrito para señalarlo.
        if (res.status === 400 || res.status === 409) onFail?.();
        return;
      }
      window.location.assign(data.url);
    } catch {
      setError("No hay conexión. Revisa tu red e inténtalo de nuevo.");
    } finally {
      setPaying(false);
    }
  };

  return { checkout, paying, error };
}
