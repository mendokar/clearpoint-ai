"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatedPrice } from "@/components/ui/AnimatedPrice";
import { BagIcon, CheckIcon, LockIcon, MoonIcon, TruckIcon } from "@/components/ui/Icons";
import { findVariant, type Product } from "@/lib/catalog/types";
import { useCartDrawer } from "@/lib/cart/drawer";
import { MAX_QTY_PER_LINE, useCart } from "@/lib/cart/store";
import { useHydrated } from "@/lib/cart/useHydrated";
import { formatPrice } from "@/lib/format";
import { prefersReducedMotion } from "@/lib/motion/hooks";
import { initialSelection, resolveSelection, valueState } from "./selection";

type AddState = "idle" | "loading" | "done";

/** Tiempos del botón "Añadir": breve estado de carga, check y vuelta al reposo. */
export const ADD_TIMINGS = { loading: 350, done: 1800 };

export function ProductConfigurator({ product }: { product: Product }) {
  const [selection, setSelection] = useState<Record<string, string>>(() => initialSelection(product));
  const [quantity, setQuantity] = useState(1);
  const [addState, setAddState] = useState<AddState>("idle");
  const add = useCart((s) => s.add);
  const showDrawer = useCartDrawer((s) => s.show);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const showBar = useStickyBar(buttonRef);
  const mounted = useHydrated();

  const variant = useMemo(() => findVariant(product, selection), [product, selection]);

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const choose = (option: string, value: string) => {
    setSelection((prev) => resolveSelection(product, prev, option, value));
  };

  const onAdd = () => {
    if (!variant || !variant.inStock || addState !== "idle") return;
    const commit = () => {
      add(
        {
          sku: variant.sku,
          slug: product.slug,
          name: product.name,
          options: variant.options,
          unitPrice: variant.price,
          image: product.images[0],
        },
        quantity,
      );
      setAddState("done");
      showDrawer(variant.sku);
      timers.current.push(setTimeout(() => setAddState("idle"), ADD_TIMINGS.done));
    };
    if (prefersReducedMotion()) {
      commit();
      return;
    }
    setAddState("loading");
    timers.current.push(setTimeout(commit, ADD_TIMINGS.loading));
  };

  const isCustom = selection["Medida"] === "A medida";
  const fundaInfo = product.optionDetails?.["Funda"]?.[selection["Funda"] ?? ""]?.descripcion;
  const disabled = !variant || !variant.inStock;
  const label = !variant
    ? "Elige una combinación"
    : variant.inStock
      ? "Añadir al carrito"
      : "Agotado en esta combinación";

  const addContent = (compact = false) =>
    addState === "loading" ? (
      <span className="add-state" key="loading">
        <span className="btn-spinner" aria-hidden="true" /> Añadiendo…
      </span>
    ) : addState === "done" ? (
      <span className="add-state" key="done">
        <CheckIcon className="check-draw h-5 w-5" /> Añadido
      </span>
    ) : (
      <span className="add-state" key="idle">
        {!disabled && <BagIcon className="h-5 w-5" />} {compact && !disabled ? "Añadir" : label}
      </span>
    );

  return (
    <div className="flex flex-col gap-6">
      {product.options.map((option) => (
        <fieldset key={option.name} className="m-0 border-0 p-0">
          <legend className="label mb-2 flex w-full justify-between">
            <span>{option.name}</span>
            <span key={selection[option.name]} className="add-state tracking-normal normal-case text-ink">
              {selection[option.name]}
            </span>
          </legend>
          <div className="flex flex-wrap gap-2">
            {option.values.map((value) => {
              const state = valueState(product, selection, option.name, value);
              const id = `${option.name}-${value}`.replace(/[^a-zA-Z0-9-]/g, "_");
              const checked = selection[option.name] === value;
              return (
                <div key={value}>
                  <input
                    type="radio"
                    id={id}
                    name={option.name}
                    value={value}
                    checked={checked}
                    disabled={state === "missing"}
                    onChange={() => choose(option.name, value)}
                    className="peer sr-only"
                  />
                  <label
                    htmlFor={id}
                    data-checked={checked}
                    className={[
                      "opt-chip inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-4 py-2 text-[.95rem]",
                      "peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-panela",
                      checked ? "border-ink text-bg" : "border-line bg-surface hover:border-aji",
                      state === "missing" ? "cursor-not-allowed opacity-40 line-through" : "",
                      /\d/.test(value) ? "mono" : "",
                    ].join(" ")}
                  >
                    {value}
                    {state === "out" && <span className="text-xs opacity-70">(agotado)</span>}
                  </label>
                </div>
              );
            })}
          </div>
          {option.name === "Funda" && fundaInfo && (
            <p key={String(fundaInfo)} className="add-state mt-2 text-sm text-muted">
              {String(fundaInfo)}
            </p>
          )}
          {option.name === "Medida" && isCustom && (
            <p className="add-state mt-2 text-sm text-muted">
              Fabricado bajo pedido: tras la compra te escribimos para confirmar las medidas. Entrega en unos 30 días y
              sin devolución salvo defecto de fabricación.
            </p>
          )}
        </fieldset>
      ))}

      <div className="flex flex-wrap items-end justify-between gap-4 border-t border-line pt-5">
        <div aria-live="polite">
          <span className="block text-sm text-muted">Precio</span>
          <b className="font-display text-[2.2rem] leading-none font-bold tabular-nums">
            {variant ? <AnimatedPrice value={variant.price} /> : "—"}
          </b>
          <span className="mono mt-1 block text-xs text-muted">
            {variant ? <>SKU {variant.sku}</> : "Combinación no disponible"} · IVA incluido
          </span>
        </div>
        <div
          className="stepper flex items-center rounded-full border border-line bg-surface"
          role="group"
          aria-label="Cantidad"
        >
          <button
            type="button"
            className="grid h-11 w-11 place-items-center rounded-full text-lg"
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            disabled={quantity <= 1}
            aria-label="Quitar una unidad"
          >
            −
          </button>
          <label htmlFor="qty" className="sr-only">
            Cantidad
          </label>
          <input
            id="qty"
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_QTY_PER_LINE}
            value={quantity}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n)) setQuantity(Math.max(1, Math.min(MAX_QTY_PER_LINE, Math.floor(n))));
            }}
            className="mono w-10 [appearance:textfield] bg-transparent text-center [&::-webkit-inner-spin-button]:appearance-none"
          />
          <button
            type="button"
            className="grid h-11 w-11 place-items-center rounded-full text-lg"
            onClick={() => setQuantity((q) => Math.min(MAX_QTY_PER_LINE, q + 1))}
            disabled={quantity >= MAX_QTY_PER_LINE}
            aria-label="Añadir una unidad"
          >
            +
          </button>
        </div>
      </div>

      <div className="flex flex-col gap-3">
        <button
          ref={buttonRef}
          type="button"
          className="add-btn btn btn-primary w-full"
          data-state={addState}
          onClick={onAdd}
          disabled={disabled}
          aria-busy={addState === "loading"}
        >
          {addContent()}
        </button>
        <ul className="seals m-0 grid list-none grid-cols-3 gap-2 p-0 text-center text-[.75rem] leading-tight text-muted">
          <li className="flex flex-col items-center gap-1.5 rounded-xl bg-surface px-2 py-2.5">
            <LockIcon className="h-5 w-5" /> Pago seguro
          </li>
          <li className="flex flex-col items-center gap-1.5 rounded-xl bg-surface px-2 py-2.5">
            <MoonIcon className="h-5 w-5" /> 30 noches de prueba
          </li>
          <li className="flex flex-col items-center gap-1.5 rounded-xl bg-surface px-2 py-2.5">
            <TruckIcon className="h-5 w-5" /> Envío 24–72 h
          </li>
        </ul>
      </div>

      {/* En un portal: los ancestros animados con transform romperían el position: fixed. */}
      {mounted &&
        createPortal(
          <div className="buybar" data-show={showBar} aria-hidden={!showBar} inert={!showBar}>
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{product.name}</p>
                <p className="font-display text-lg leading-tight font-bold tabular-nums">
                  {variant ? formatPrice(variant.price) : "—"}
                  {quantity > 1 && <span className="mono ml-1.5 text-xs font-normal text-muted">× {quantity}</span>}
                </p>
              </div>
              <button
                type="button"
                className="add-btn btn btn-primary btn-sm !px-5 !py-3"
                data-state={addState}
                onClick={onAdd}
                disabled={disabled}
              >
                {addContent(true)}
              </button>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

/** Muestra la barra fija de compra cuando el botón principal ha quedado por encima de la pantalla. */
function useStickyBar(ref: React.RefObject<HTMLElement | null>): boolean {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Scroll pasivo + rAF (un IntersectionObserver no avisa si se salta el botón sin llegar a verlo).
    let raf = 0;
    const check = () => {
      raf = 0;
      setShow(el.getBoundingClientRect().bottom < 0);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(check);
    };
    check();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [ref]);
  useEffect(() => {
    const root = document.documentElement;
    if (show) root.dataset.buybar = "true";
    else delete root.dataset.buybar;
    return () => {
      delete root.dataset.buybar;
    };
  }, [show]);
  return show;
}
