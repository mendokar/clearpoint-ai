"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useCart, type PriceChange, type QuoteUpdate } from "@/lib/cart/store";
import { formatPrice } from "@/lib/format";
import { toast } from "@/lib/ui/toast";

/**
 * Al abrir el carrito pregunta al servidor el precio y la disponibilidad actuales de cada línea y los aplica.
 * Si un precio cambió, lo avisa. Se vuelve a ejecutar cuando cambian los productos del carrito.
 */
export function useCartQuote(enabled: boolean) {
  const lines = useCart((s) => s.lines);
  const applyQuote = useCart((s) => s.applyQuote);
  const [changes, setChanges] = useState<PriceChange[]>([]);
  const [checked, setChecked] = useState(false);
  const skusKey = lines.map((l) => l.sku).sort().join(",");
  const running = useRef(0);

  const refresh = useCallback(async () => {
    const skus = skusKey ? skusKey.split(",") : [];
    if (!skus.length) return;
    const run = ++running.current;
    try {
      const res = await fetch("/api/cart/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skus }),
        cache: "no-store",
      });
      if (!res.ok || run !== running.current) return;
      const data = (await res.json()) as { lines?: QuoteUpdate[] };
      const found = applyQuote(data.lines ?? []);
      if (found.length) {
        setChanges((prev) => [...prev.filter((c) => !found.some((f) => f.sku === c.sku)), ...found]);
        toast({
          tone: "info",
          text:
            found.length === 1
              ? `El precio de ${found[0].name} ha cambiado a ${formatPrice(found[0].to)}.`
              : `Han cambiado los precios de ${found.length} productos. Revisa el total.`,
        });
      }
    } catch {
      // Sin conexión: el servidor vuelve a calcular el precio al pagar.
    } finally {
      if (run === running.current) setChecked(true);
    }
  }, [skusKey, applyQuote]);

  useEffect(() => {
    if (enabled) void refresh();
  }, [enabled, refresh]);

  return { changes, checked, refresh };
}
