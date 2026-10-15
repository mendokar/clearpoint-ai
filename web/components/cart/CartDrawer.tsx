"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { AnimatedPrice } from "@/components/ui/AnimatedPrice";
import { ArrowRight, CheckIcon, CloseIcon, LockIcon } from "@/components/ui/Icons";
import { Notice } from "@/components/ui/Notice";
import { useCartDrawer } from "@/lib/cart/drawer";
import { cartCount, cartSubtotal, useCart } from "@/lib/cart/store";
import { useHydrated } from "@/lib/cart/useHydrated";
import { useFocusTrap } from "@/lib/motion/hooks";
import { useCheckout } from "./useCheckout";

/** Mini-carrito lateral que se abre al añadir un producto. */
export function CartDrawer() {
  const { open, lastSku, close } = useCartDrawer();
  const hydrated = useHydrated();
  const storedLines = useCart((s) => s.lines);
  const lines = hydrated ? storedLines : [];
  const { user, configured } = useAuth();
  const { checkout, paying, error } = useCheckout();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const pathname = usePathname();

  useFocusTrap(panelRef, open, { initial: closeRef });

  useEffect(() => {
    close();
  }, [pathname, close]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("keydown", onKey);
    // Bloquea el scroll del fondo sin mover la página (compensa la barra de scroll).
    const { body, documentElement } = document;
    const gap = window.innerWidth - documentElement.clientWidth;
    const prev = { overflow: body.style.overflow, pad: body.style.paddingRight };
    body.style.overflow = "hidden";
    if (gap > 0) body.style.paddingRight = `${gap}px`;
    return () => {
      document.removeEventListener("keydown", onKey);
      body.style.overflow = prev.overflow;
      body.style.paddingRight = prev.pad;
    };
  }, [open, close]);

  const last = lines.find((l) => l.sku === lastSku) ?? lines[lines.length - 1];
  const others = lines.filter((l) => l !== last);
  const count = cartCount(lines);

  return (
    <div className="drawer-root" data-open={open} aria-hidden={!open} inert={!open}>
      <div className="drawer-backdrop" onClick={close} aria-hidden="true" />
      <div ref={panelRef} role="dialog" aria-modal="true" aria-labelledby={titleId} className="drawer-panel">
        <div className="flex items-center gap-3 border-b border-line px-5 py-4">
          {lastSku ? (
            <span className="success-badge" aria-hidden="true">
              <CheckIcon className="check-draw h-4 w-4" />
            </span>
          ) : null}
          <h2 id={titleId} className="flex-1 text-xl font-bold">
            {lastSku ? "Añadido al carrito" : "Tu carrito"}
          </h2>
          <button ref={closeRef} type="button" onClick={close} className="icon-btn chat-close" aria-label="Cerrar el carrito">
            <CloseIcon />
          </button>
        </div>

        <div className="drawer-stagger flex flex-1 flex-col gap-4 overflow-y-auto px-5 py-5">
          {!last ? (
            <p className="text-muted">Tu carrito está vacío.</p>
          ) : (
            <>
              <div className="flex gap-4 rounded-card border border-line bg-bg p-3">
                {last.image && (
                  <Image src={last.image} alt="" width={160} height={160} className="h-20 w-20 flex-none rounded-xl object-cover" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="font-display text-lg leading-tight font-bold">{last.name}</p>
                  <p className="mt-1 text-sm text-muted">{Object.values(last.options).join(" · ")}</p>
                  <p className="mt-1 flex items-baseline justify-between gap-2 text-sm">
                    <span className="mono text-muted">× {last.quantity}</span>
                    <b className="font-display tabular-nums">
                      <AnimatedPrice value={last.unitPrice * last.quantity} />
                    </b>
                  </p>
                </div>
              </div>
              {others.length > 0 && (
                <p className="text-sm text-muted">
                  Y {others.length === 1 ? "1 producto más" : `${others.length} productos más`} en tu carrito.
                </p>
              )}
              <ul className="m-0 grid list-none gap-2 rounded-card bg-tint p-4 text-sm">
                <li className="flex items-center gap-2">
                  <CheckIcon className="h-4 w-4 text-ok" /> Envío gratis a la península en 24–72 h
                </li>
                <li className="flex items-center gap-2">
                  <CheckIcon className="h-4 w-4 text-ok" /> 30 noches de prueba
                </li>
                <li className="flex items-center gap-2">
                  <LockIcon className="h-4 w-4 text-ok" /> Pago seguro con Stripe
                </li>
              </ul>
            </>
          )}
        </div>

        {last && (
          <div className="flex flex-col gap-3 border-t border-line px-5 pt-4 pb-[calc(1rem+env(safe-area-inset-bottom,0px))]">
            <div className="flex items-baseline justify-between">
              <span className="text-muted">
                Subtotal ({count} {count === 1 ? "producto" : "productos"})
              </span>
              <b className="font-display text-2xl tabular-nums">
                <AnimatedPrice value={cartSubtotal(lines)} />
              </b>
            </div>
            {error && <Notice tone="error">{error}</Notice>}
            {configured && user ? (
              <button type="button" className="btn btn-primary w-full" onClick={checkout} disabled={paying}>
                {paying ? (
                  <>
                    <span className="btn-spinner" aria-hidden="true" /> Redirigiendo al pago…
                  </>
                ) : (
                  <>
                    Pagar <ArrowRight />
                  </>
                )}
              </button>
            ) : (
              <Link href="/login?next=/carrito" className="btn btn-primary w-full">
                Inicia sesión para pagar <ArrowRight />
              </Link>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Link href="/carrito" className="btn btn-ghost btn-sm border-line">
                Ver carrito
              </Link>
              <button type="button" className="btn btn-ghost btn-sm border-line" onClick={close}>
                Seguir mirando
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
