"use client";

import Image from "next/image";
import Link from "next/link";
import { useLayoutEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { AnimatedPrice } from "@/components/ui/AnimatedPrice";
import { ArrowRight, LockIcon, MoonIcon, TruckIcon } from "@/components/ui/Icons";
import { Notice } from "@/components/ui/Notice";
import { Skeleton, SkeletonGroup, SkeletonRow } from "@/components/ui/Skeleton";
import { cartCount, cartSubtotal, isPurchasable, MAX_QTY_PER_LINE, useCart, type CartLine } from "@/lib/cart/store";
import { useHydrated } from "@/lib/cart/useHydrated";
import { prefersReducedMotion } from "@/lib/motion/hooks";
import { toast } from "@/lib/ui/toast";
import { useCheckout } from "./useCheckout";
import { useCartQuote } from "./useCartQuote";
import { formatOptions, formatPrice, orderedOptionEntries } from "@/lib/format";

const LEAVE_MS = 260;

export function CartView() {
  const hydrated = useHydrated();
  const { lines, setQuantity, remove, add } = useCart();
  const { user, loading, configured } = useAuth();
  const { changes, refresh } = useCartQuote(hydrated && lines.length > 0);
  const { checkout, paying, error } = useCheckout({ onFail: refresh });
  const [leaving, setLeaving] = useState<Set<string>>(() => new Set());
  const listRef = useFlip(hydrated ? lines.length : -1);

  if (!hydrated) return <CartSkeleton />;
  if (lines.length === 0) return <EmptyCart />;

  const subtotal = cartSubtotal(lines);
  const blocked = lines.filter((l) => !isPurchasable(l));
  const purchasableCount = cartCount(lines.filter(isPurchasable));

  const onRemove = (line: CartLine) => {
    setLeaving((s) => new Set(s).add(line.sku));
    setTimeout(
      () => {
        remove(line.sku);
        setLeaving((s) => {
          const next = new Set(s);
          next.delete(line.sku);
          return next;
        });
        const { quantity, ...rest } = line;
        toast({
          text: `${line.name} eliminado del carrito`,
          action: { label: "Deshacer", run: () => add(rest, quantity) },
        });
      },
      prefersReducedMotion() ? 0 : LEAVE_MS,
    );
  };

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[1.4fr_.8fr]">
      <ul ref={listRef} className="m-0 grid list-none gap-4 p-0" aria-label="Productos en el carrito">
        {lines.map((line, i) => (
          <li
            key={line.sku}
            data-key={line.sku}
            data-leaving={leaving.has(line.sku)}
            style={{ "--i": i } as React.CSSProperties}
            className="cart-line card flex gap-4 p-4"
          >
            {line.image && (
              <Link href={`/productos/${line.slug}`} tabIndex={-1} aria-hidden="true" className="block flex-none overflow-hidden rounded-xl">
                <Image src={line.image} alt="" width={240} height={240} className="cl-img h-24 w-24 object-cover sm:h-28 sm:w-28" />
              </Link>
            )}
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link href={`/productos/${line.slug}`} className="font-display text-lg font-bold no-underline transition-colors hover:text-aji-ink">
                    {line.name}
                  </Link>
                  <p className="text-sm text-muted">{orderedOptionEntries(line.options).map(([k, v]) => `${k}: ${v}`).join(" · ")}</p>
                  <p className="mono text-xs text-muted">SKU {line.sku}</p>
                  {line.availability === "unavailable" && (
                    <p className="mt-1 inline-block rounded-full bg-danger/10 px-2 py-0.5 text-xs font-semibold text-danger">
                      Ya no está a la venta
                    </p>
                  )}
                  {line.availability === "out_of_stock" && (
                    <p className="mt-1 inline-block rounded-full bg-danger/10 px-2 py-0.5 text-xs font-semibold text-danger">
                      Agotado en esta combinación
                    </p>
                  )}
                </div>
                {isPurchasable(line) ? (
                  <b className="font-display text-lg tabular-nums">
                    <AnimatedPrice value={line.unitPrice * line.quantity} />
                  </b>
                ) : (
                  <span className="text-sm text-muted">No suma al total</span>
                )}
              </div>
              <div className="mt-auto flex flex-wrap items-center justify-between gap-3">
                <QuantityStepper
                  value={line.quantity}
                  label={`${line.name} (${formatOptions(line.options, ", ")})`}
                  onChange={(n) => setQuantity(line.sku, n)}
                />
                <button
                  type="button"
                  onClick={() => onRemove(line)}
                  className="rounded-md px-1 text-sm text-muted underline transition-colors hover:text-danger"
                  aria-label={`Eliminar ${line.name} (${formatOptions(line.options, ", ")})`}
                >
                  Eliminar
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>

      <aside className="card enter-one flex flex-col gap-4 p-6 lg:sticky lg:top-28" aria-labelledby="resumen-title">
        <h2 id="resumen-title" className="text-xl font-bold">
          Resumen
        </h2>
        <dl className="m-0 grid gap-2 text-[.95rem]">
          <div className="flex justify-between">
            <dt className="text-muted">Productos ({purchasableCount})</dt>
            <dd className="m-0 tabular-nums">
              <AnimatedPrice value={subtotal} />
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Envío</dt>
            <dd className="m-0 text-right">Gratis en península · se elige al pagar</dd>
          </div>
          <div className="flex justify-between border-t border-line pt-3 text-lg font-bold">
            <dt>Total estimado</dt>
            <dd className="font-display m-0 tabular-nums">
              <AnimatedPrice value={subtotal} />
            </dd>
          </div>
        </dl>
        <p className="text-xs text-muted">
          IVA incluido. El importe final se calcula en nuestro servidor con los precios vigentes y se confirma en la
          página de pago de Stripe.
        </p>
        {changes.length > 0 && (
          <div className="notice-in">
            <Notice tone="info" title="Precios actualizados">
              {changes.map((c) => `${c.name}: ${formatPrice(c.from)} → ${formatPrice(c.to)}`).join(" · ")}
            </Notice>
          </div>
        )}
        {blocked.length > 0 && (
          <div className="notice-in">
            <Notice tone="warn" title="Revisa tu carrito">
              Quita {blocked.map((l) => l.name).join(", ")} para poder pagar: ya no se puede comprar.
            </Notice>
          </div>
        )}
        {error && (
          <div className="notice-in">
            <Notice tone="error">{error}</Notice>
          </div>
        )}
        {!configured ? (
          <Notice tone="warn" title="Pago no disponible">
            El inicio de sesión no está configurado en este entorno.
          </Notice>
        ) : loading ? (
          <SkeletonGroup label="Comprobando tu sesión…">
            <Skeleton className="h-[52px] w-full rounded-full" />
          </SkeletonGroup>
        ) : user ? (
          <button type="button" className="btn btn-primary w-full" onClick={checkout} disabled={paying || blocked.length > 0}>
            {paying ? (
              <>
                <span className="btn-spinner" aria-hidden="true" /> Redirigiendo al pago…
              </>
            ) : (
              <>
                <LockIcon className="h-4 w-4" /> Pagar con tarjeta <ArrowRight />
              </>
            )}
          </button>
        ) : (
          <>
            <Link href="/login?next=/carrito" className="btn btn-primary w-full">
              Inicia sesión para pagar <ArrowRight />
            </Link>
            <p className="text-center text-sm text-muted">
              ¿No tienes cuenta?{" "}
              <Link href="/registro?next=/carrito" className="text-aji-ink underline">
                Regístrate
              </Link>
            </p>
          </>
        )}
        <ul className="seals m-0 grid list-none grid-cols-3 gap-2 border-t border-line p-0 pt-4 text-center text-[.72rem] leading-tight text-muted">
          <li className="flex flex-col items-center gap-1.5">
            <LockIcon className="h-5 w-5" /> Pago seguro
          </li>
          <li className="flex flex-col items-center gap-1.5">
            <MoonIcon className="h-5 w-5" /> 30 noches
          </li>
          <li className="flex flex-col items-center gap-1.5">
            <TruckIcon className="h-5 w-5" /> 24–72 h
          </li>
        </ul>
        <p className="mono text-center text-[.7rem] text-muted">Modo prueba · tarjeta 4242 4242 4242 4242</p>
      </aside>
    </div>
  );
}

export function QuantityStepper({
  value,
  onChange,
  label,
  min = 1,
  max = MAX_QTY_PER_LINE,
}: {
  value: number;
  onChange: (n: number) => void;
  label: string;
  min?: number;
  max?: number;
}) {
  return (
    <div className="stepper flex items-center rounded-full border border-line bg-bg" role="group" aria-label={`Cantidad de ${label}`}>
      <button
        type="button"
        className="grid h-9 w-9 place-items-center rounded-full text-lg"
        onClick={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        aria-label="Quitar una unidad"
      >
        −
      </button>
      <output className="mono grid w-8 place-items-center overflow-hidden text-center" aria-live="polite">
        <span key={value} className="num-pop">
          {value}
        </span>
      </output>
      <button
        type="button"
        className="grid h-9 w-9 place-items-center rounded-full text-lg"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        aria-label="Añadir una unidad"
      >
        +
      </button>
    </div>
  );
}

/** FLIP: cuando cambia el número de líneas, las que siguen se desplazan con transform en vez de saltar. */
function useFlip(count: number) {
  const ref = useRef<HTMLUListElement>(null);
  const positions = useRef(new Map<string, number>());
  useLayoutEffect(() => {
    const list = ref.current;
    if (!list) return;
    const items = Array.from(list.querySelectorAll<HTMLElement>(":scope > [data-key]"));
    const animate = !prefersReducedMotion() && typeof HTMLElement.prototype.animate === "function";
    for (const el of items) {
      const key = el.dataset.key!;
      const prev = positions.current.get(key);
      const delta = prev === undefined ? 0 : prev - el.offsetTop;
      if (animate && delta) {
        el.animate([{ transform: `translateY(${delta}px)` }, { transform: "none" }], {
          duration: 320,
          easing: "cubic-bezier(.2,.8,.2,1)",
        });
      }
    }
    positions.current = new Map(items.map((el) => [el.dataset.key!, el.offsetTop]));
  }, [count]);
  return ref;
}

function CartSkeleton() {
  return (
    <SkeletonGroup label="Cargando tu carrito…" className="grid items-start gap-8 lg:grid-cols-[1.4fr_.8fr]">
      <div className="grid gap-4">
        <SkeletonRow />
        <SkeletonRow />
      </div>
      <div className="card flex flex-col gap-3 p-6">
        <Skeleton className="h-6 w-1/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-4/5" />
        <Skeleton className="mt-2 h-[52px] w-full rounded-full" />
      </div>
    </SkeletonGroup>
  );
}

function EmptyCart() {
  return (
    <div className="card enter flex flex-col items-center gap-5 px-6 py-12 text-center">
      <svg viewBox="0 0 200 120" className="empty-illus h-auto w-48" aria-hidden="true">
        <g className="bed">
          <rect x="22" y="58" width="156" height="34" rx="12" fill="var(--tint)" stroke="var(--line)" strokeWidth="2" />
          <rect x="34" y="66" width="132" height="18" rx="7" fill="none" stroke="var(--aji)" strokeWidth="2" strokeDasharray="5 5" />
          <rect x="34" y="44" width="40" height="20" rx="9" fill="var(--surface)" stroke="var(--line)" strokeWidth="2" />
        </g>
        <text className="zz" x="120" y="40" fill="var(--panela)" fontFamily="var(--f-display)" fontWeight="800" fontSize="22">
          z
        </text>
        <text className="zz" x="138" y="26" fill="var(--panela)" fontFamily="var(--f-display)" fontWeight="800" fontSize="16">
          z
        </text>
        <text className="zz" x="152" y="14" fill="var(--panela)" fontFamily="var(--f-display)" fontWeight="800" fontSize="12">
          z
        </text>
      </svg>
      <div>
        <h2 className="text-2xl font-bold">Tu carrito está vacío</h2>
        <p className="mt-2 text-muted">Tu colchón te espera. Configura medida, núcleo y funda y aparecerá aquí.</p>
      </div>
      <div className="flex flex-wrap justify-center gap-3">
        <Link href="/productos/colchon-cafetal" className="btn btn-primary">
          Ver Colchón Cafetal <ArrowRight />
        </Link>
        <Link href="/productos/colchon-caribe" className="btn btn-ghost">
          Ver Colchón Caribe
        </Link>
      </div>
    </div>
  );
}
