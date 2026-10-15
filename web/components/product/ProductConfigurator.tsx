"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { findVariant, type Product } from "@/lib/catalog/types";
import { MAX_QTY_PER_LINE, useCart } from "@/lib/cart/store";
import { formatPrice } from "@/lib/format";
import { initialSelection, resolveSelection, valueState } from "./selection";

export function ProductConfigurator({ product }: { product: Product }) {
  const [selection, setSelection] = useState<Record<string, string>>(() => initialSelection(product));
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  const add = useCart((s) => s.add);

  const variant = useMemo(() => findVariant(product, selection), [product, selection]);

  const choose = (option: string, value: string) => {
    setSelection((prev) => resolveSelection(product, prev, option, value));
    setAdded(false);
  };

  const onAdd = () => {
    if (!variant || !variant.inStock) return;
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
    setAdded(true);
  };

  const isCustom = selection["Medida"] === "A medida";
  const fundaInfo = product.optionDetails?.["Funda"]?.[selection["Funda"] ?? ""]?.descripcion;

  return (
    <div className="flex flex-col gap-6">
      {product.options.map((option) => (
        <fieldset key={option.name} className="m-0 border-0 p-0">
          <legend className="label mb-2 flex w-full justify-between">
            <span>{option.name}</span>
            <span className="tracking-normal normal-case text-ink">{selection[option.name]}</span>
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
                    className={[
                      "inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-4 py-2 text-[.95rem] transition-colors",
                      "peer-focus-visible:outline-3 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-panela",
                      checked ? "border-ink bg-ink text-bg" : "border-line bg-surface hover:border-aji",
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
          {option.name === "Funda" && fundaInfo && <p className="mt-2 text-sm text-muted">{String(fundaInfo)}</p>}
          {option.name === "Medida" && isCustom && (
            <p className="mt-2 text-sm text-muted">
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
            {variant ? formatPrice(variant.price) : "—"}
          </b>
          <span className="mono mt-1 block text-xs text-muted">
            {variant ? <>SKU {variant.sku}</> : "Combinación no disponible"} · IVA incluido
          </span>
        </div>
        <div className="flex items-center rounded-full border border-line bg-surface" role="group" aria-label="Cantidad">
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

      <button
        type="button"
        className="btn btn-primary w-full"
        onClick={onAdd}
        disabled={!variant || !variant.inStock}
      >
        {!variant ? "Elige una combinación" : variant.inStock ? "Añadir al carrito" : "Agotado en esta combinación"}
      </button>

      <div aria-live="polite" className="min-h-[1.5rem]">
        {added && (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-card border border-ok bg-surface px-4 py-3 text-sm">
            <span>Añadido al carrito.</span>
            <Link href="/carrito" className="font-semibold text-aji-ink underline">
              Ver carrito y pagar
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
