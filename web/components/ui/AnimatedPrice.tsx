"use client";

import { formatPrice } from "@/lib/format";
import { useTweenNumber } from "@/lib/motion/hooks";

/**
 * Precio que interpola su valor al cambiar. Lo animado es aria-hidden; el valor final va en texto
 * oculto para que los lectores de pantalla no lean cada fotograma.
 */
export function AnimatedPrice({ value, className = "", currency }: { value: number; className?: string; currency?: string }) {
  const shown = useTweenNumber(value);
  return (
    <span className={className}>
      <span aria-hidden="true">{formatPrice(Math.round(shown * 100) / 100, currency)}</span>
      <span className="sr-only">{formatPrice(value, currency)}</span>
    </span>
  );
}
