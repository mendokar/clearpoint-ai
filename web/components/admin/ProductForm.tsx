"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Notice } from "@/components/ui/Notice";
import { AdminApiError, adminFetch, errorMessage } from "@/lib/admin/client";
import {
  adminProductSchema,
  fieldErrors,
  isAllowedImageUrl,
  type AdminVariant,
} from "@/lib/catalog/admin-schema";
import { generateVariants, skuPrefixFromSlug } from "@/lib/catalog/variants";
import { formatPrice } from "@/lib/format";
import {
  emptyForm,
  formToPayload,
  orphanVariants,
  parsePrice,
  renameOption,
  renameValue,
  type FormVariant,
  type ProductFormState,
} from "./productFormModel";

type Props = { mode: "create" | "edit"; initial?: ProductFormState };

/**
 * Formulario de producto del panel. Valida con el MISMO esquema Zod que el servidor
 * (`adminProductSchema`) antes de enviar, y muestra también los errores que devuelva la API
 * (slug o SKU duplicados).
 */
export function ProductForm({ mode, initial }: Props) {
  const router = useRouter();
  const [f, setF] = useState<ProductFormState>(() => initial ?? emptyForm());
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);
  const [focusSummary, setFocusSummary] = useState(0);

  useEffect(() => {
    if (focusSummary) summaryRef.current?.focus();
  }, [focusSummary]);

  const set = <K extends keyof ProductFormState>(key: K, value: ProductFormState[K]) => setF((s) => ({ ...s, [key]: value }));
  const err = (path: string) => errors[path];

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaved(null);
    setServerError(null);
    const parsed = adminProductSchema.safeParse(formToPayload(f));
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      setFocusSummary((n) => n + 1);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      if (mode === "create") {
        await adminFetch("/api/admin/products", { method: "POST", body: parsed.data });
        router.push(`/admin/productos?creado=${encodeURIComponent(parsed.data.slug)}`);
        return;
      }
      await adminFetch(`/api/admin/products/${encodeURIComponent(parsed.data.slug)}`, { method: "PUT", body: parsed.data });
      setSaved(
        parsed.data.active
          ? "Cambios guardados. La home y la ficha ya muestran la nueva versión."
          : "Cambios guardados. El producto está inactivo: no se muestra en la tienda.",
      );
    } catch (error) {
      if (error instanceof AdminApiError) {
        setErrors(Object.keys(error.fields).length ? error.fields : error.field ? { [error.field]: error.message } : {});
      }
      setServerError(errorMessage(error));
      setFocusSummary((n) => n + 1);
    } finally {
      setSaving(false);
    }
  }

  const messages = useMemo(() => Object.entries(errors).map(([path, msg]) => `${labelFor(path, f)}: ${msg}`), [errors, f]);

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-6">
      <div ref={summaryRef} tabIndex={-1} aria-live="assertive" className="outline-none">
        {(serverError || messages.length > 0) && (
          <Notice tone="error" title={serverError ?? "Revisa los campos marcados"}>
            {messages.length > 0 && (
              <ul className="m-0 mt-1 list-disc pl-5">
                {[...new Set(messages)].slice(0, 12).map((m) => (
                  <li key={m}>{m}</li>
                ))}
              </ul>
            )}
          </Notice>
        )}
      </div>
      <div aria-live="polite">{saved && <Notice tone="ok">{saved}</Notice>}</div>

      <Section title="Datos básicos">
        <div className="grid gap-4 md:grid-cols-2">
          <TextField
            label="Nombre"
            value={f.name}
            onChange={(v) => set("name", v)}
            error={err("name")}
            required
            maxLength={120}
          />
          <TextField
            label="Slug (URL)"
            value={f.slug}
            onChange={(v) => set("slug", v.toLowerCase())}
            error={err("slug")}
            required
            readOnly={mode === "edit"}
            maxLength={80}
            hint={mode === "edit" ? "El slug es el ID del producto y no se puede cambiar." : `Se verá en /productos/${f.slug || "mi-colchon"}. Solo minúsculas, números y guiones.`}
            mono
          />
        </div>
        <TextField
          label="Descripción corta"
          value={f.shortDescription}
          onChange={(v) => set("shortDescription", v)}
          error={err("shortDescription")}
          maxLength={240}
          hint="Una línea para las tarjetas de la home."
        />
        <div className="grid gap-4 sm:grid-cols-[1fr_12rem] sm:items-start">
          <TextField
            label="Etiqueta de la tarjeta"
            value={f.badgeText}
            onChange={(v) => set("badgeText", v)}
            error={err("badge")}
            maxLength={24}
            hint="Opcional. Por ejemplo «Más vendido» o «Nuevo». Vacío = sin etiqueta."
          />
          <div>
            <label className="label" htmlFor="badge-tone">
              Estilo de la etiqueta
            </label>
            <select
              id="badge-tone"
              className="field"
              value={f.badgeTone}
              disabled={!f.badgeText.trim()}
              onChange={(e) => set("badgeTone", e.target.value === "nuevo" ? "nuevo" : "destacado")}
            >
              <option value="destacado">Destacado (con estrella)</option>
              <option value="nuevo">Nuevo</option>
            </select>
          </div>
        </div>
        <TextField
          label="Descripción"
          value={f.description}
          onChange={(v) => set("description", v)}
          error={err("description")}
          maxLength={5000}
          multiline
        />
        <label className="flex items-center gap-3">
          <input type="checkbox" className="h-5 w-5 accent-[var(--aji)]" checked={f.active} onChange={(e) => set("active", e.target.checked)} />
          <span>
            <b>Activo</b> <span className="text-sm text-muted">— visible en la tienda y disponible para comprar</span>
          </span>
        </label>
      </Section>

      <ImagesSection images={f.images} onChange={(v) => set("images", v)} error={err("images") ?? firstWithPrefix(errors, "images.")} />

      <Section title="Opciones" description="Lo que el cliente elige en la ficha (p. ej. Medida, Núcleo, Funda).">
        {err("options") && <FieldError>{err("options")}</FieldError>}
        <div className="grid gap-4">
          {f.options.map((opt, i) => (
            <fieldset key={i} className="rounded-card border border-line p-4">
              <legend className="px-1 text-sm font-semibold">Opción {i + 1}</legend>
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-48 flex-1">
                  <TextField
                    label="Nombre de la opción"
                    value={opt.name}
                    onChange={(v) => setF((s) => renameOption(s, i, v))}
                    error={err(`options.${i}.name`)}
                    maxLength={40}
                  />
                </div>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => setF((s) => ({ ...s, options: s.options.filter((_, j) => j !== i) }))}
                >
                  Quitar opción
                </button>
              </div>
              <p className="label mt-3">Valores</p>
              {err(`options.${i}.values`) && <FieldError>{err(`options.${i}.values`)}</FieldError>}
              <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
                {opt.values.map((value, j) => (
                  <li key={j} className="flex items-center gap-1">
                    <input
                      className="field w-40 !py-1.5 text-sm"
                      aria-label={`${opt.name || `Opción ${i + 1}`}: valor ${j + 1}`}
                      value={value}
                      maxLength={60}
                      aria-invalid={Boolean(err(`options.${i}.values.${j}`))}
                      onChange={(e) => setF((s) => renameValue(s, i, j, e.target.value))}
                    />
                    <button
                      type="button"
                      className="icon-btn !h-8 !w-8 text-sm"
                      aria-label={`Quitar el valor ${value || j + 1}`}
                      onClick={() =>
                        setF((s) => ({
                          ...s,
                          options: s.options.map((o, k) => (k === i ? { ...o, values: o.values.filter((_, m) => m !== j) } : o)),
                        }))
                      }
                    >
                      ×
                    </button>
                  </li>
                ))}
                <li>
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={() =>
                      setF((s) => ({
                        ...s,
                        options: s.options.map((o, k) => (k === i ? { ...o, values: [...o.values, ""] } : o)),
                      }))
                    }
                  >
                    + Valor
                  </button>
                </li>
              </ul>
            </fieldset>
          ))}
        </div>
        <div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={f.options.length >= 6}
            onClick={() => setF((s) => ({ ...s, options: [...s.options, { name: "", values: [""] }] }))}
          >
            + Añadir opción
          </button>
        </div>
      </Section>

      <DetailsSection f={f} setF={setF} error={firstWithPrefix(errors, "optionDetails")} />

      <Section title="Características" description="Puntos clave que se muestran en la ficha (uno por línea).">
        <ul className="m-0 grid list-none gap-2 p-0">
          {f.features.map((feat, i) => (
            <li key={i} className="flex items-center gap-2">
              <input
                className="field"
                aria-label={`Característica ${i + 1}`}
                value={feat}
                maxLength={200}
                aria-invalid={Boolean(err(`features.${i}`))}
                onChange={(e) => set("features", f.features.map((x, j) => (j === i ? e.target.value : x)))}
              />
              <button
                type="button"
                className="icon-btn flex-none"
                aria-label={`Quitar la característica ${i + 1}`}
                onClick={() => set("features", f.features.filter((_, j) => j !== i))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        <div>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            disabled={f.features.length >= 20}
            onClick={() => set("features", [...f.features, ""])}
          >
            + Añadir característica
          </button>
        </div>
      </Section>

      <VariantsSection f={f} setF={setF} errors={errors} />

      <div className="sticky bottom-0 z-10 -mx-5 flex flex-wrap items-center gap-3 border-t border-line bg-bg/95 px-5 py-4 backdrop-blur">
        <button type="submit" className="btn btn-primary" disabled={saving}>
          {saving ? "Guardando…" : mode === "create" ? "Crear producto" : "Guardar cambios"}
        </button>
        <Link href="/admin/productos" className="btn btn-ghost">
          {mode === "create" ? "Cancelar" : "Volver"}
        </Link>
        {mode === "edit" && f.active && (
          <Link href={`/productos/${f.slug}`} target="_blank" rel="noopener" className="text-sm text-muted underline">
            Ver en la tienda
          </Link>
        )}
      </div>
    </form>
  );
}

/* ---------- Imágenes ---------- */

function ImagesSection({ images, onChange, error }: { images: string[]; onChange: (v: string[]) => void; error?: string }) {
  const [library, setLibrary] = useState<string[] | null>(null);
  const [libraryError, setLibraryError] = useState(false);
  const [url, setUrl] = useState("");
  const [urlError, setUrlError] = useState<string | null>(null);
  const urlId = useId();

  useEffect(() => {
    let active = true;
    fetch("/api/catalog/images")
      .then((r) => (r.ok ? (r.json() as Promise<{ images: string[] }>) : Promise.reject(new Error(String(r.status)))))
      .then((d) => active && setLibrary(d.images))
      .catch(() => active && setLibraryError(true));
    return () => {
      active = false;
    };
  }, []);

  const move = (i: number, delta: number) => {
    const next = [...images];
    const j = i + delta;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };
  const toggle = (src: string) => onChange(images.includes(src) ? images.filter((x) => x !== src) : [...images, src]);
  const addUrl = () => {
    const v = url.trim();
    if (!isAllowedImageUrl(v)) {
      setUrlError("Usa una ruta /images/… o una URL https de images.unsplash.com o Firebase Storage.");
      return;
    }
    if (images.includes(v)) {
      setUrlError("Esa imagen ya está añadida.");
      return;
    }
    onChange([...images, v]);
    setUrl("");
    setUrlError(null);
  };

  return (
    <Section title="Imágenes" description="La primera es la principal (tarjeta de la home y galería).">
      {error && <FieldError>{error}</FieldError>}
      {images.length === 0 ? (
        <p className="text-sm text-muted">Sin imágenes. Elige alguna de la biblioteca o añade una URL.</p>
      ) : (
        <ol className="m-0 grid list-none gap-2 p-0">
          {images.map((src, i) => (
            <li key={src} className="flex flex-wrap items-center gap-3 rounded-card border border-line p-2">
              {isAllowedImageUrl(src) ? (
                <Image src={src} alt="" width={120} height={120} className="h-14 w-14 flex-none rounded-lg object-cover" />
              ) : (
                <span className="h-14 w-14 flex-none rounded-lg bg-tint" aria-hidden="true" />
              )}
              <span className="mono min-w-0 flex-1 text-xs break-all">
                {i === 0 && <span className="pill !ml-0 mr-2">Principal</span>}
                {src}
              </span>
              <span className="flex gap-1">
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Subir imagen ${i + 1}`}>
                  ↑
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => move(i, 1)}
                  disabled={i === images.length - 1}
                  aria-label={`Bajar imagen ${i + 1}`}
                >
                  ↓
                </button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => toggle(src)} aria-label={`Quitar imagen ${i + 1}`}>
                  Quitar
                </button>
              </span>
            </li>
          ))}
        </ol>
      )}

      <div>
        <p className="label">Biblioteca (web/public/images)</p>
        {libraryError && <p className="text-sm text-muted">No se ha podido cargar la biblioteca; puedes escribir la ruta abajo.</p>}
        {!library && !libraryError && <p className="text-sm text-muted">Cargando imágenes…</p>}
        {library && (
          <ul className="m-0 grid list-none grid-cols-3 gap-2 p-0 sm:grid-cols-5 lg:grid-cols-7">
            {library.map((src) => {
              const selected = images.includes(src);
              return (
                <li key={src}>
                  <button
                    type="button"
                    aria-pressed={selected}
                    title={src}
                    onClick={() => toggle(src)}
                    className={`relative block w-full overflow-hidden rounded-lg border-2 ${selected ? "border-aji" : "border-transparent"}`}
                  >
                    <Image src={src} alt={src.replace("/images/", "")} width={160} height={160} className="aspect-square w-full object-cover" />
                    {selected && (
                      <span className="mono absolute top-1 right-1 rounded bg-aji px-1.5 text-xs text-on-accent">{images.indexOf(src) + 1}</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div>
        <label htmlFor={urlId} className="label">
          Añadir por ruta o URL
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            id={urlId}
            className="field min-w-0 flex-1"
            placeholder="/images/mi-foto.jpg o https://images.unsplash.com/…"
            value={url}
            aria-invalid={Boolean(urlError)}
            aria-describedby={urlError ? `${urlId}-err` : undefined}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addUrl();
              }
            }}
          />
          <button type="button" className="btn btn-ghost btn-sm" onClick={addUrl}>
            Añadir
          </button>
        </div>
        {urlError && <FieldError id={`${urlId}-err`}>{urlError}</FieldError>}
        <p className="mt-1 text-xs text-muted">
          Para subir fotos nuevas, cópialas en web/public/images y vuelve a desplegar (la subida directa a Firebase Storage es una
          mejora pendiente).
        </p>
      </div>
    </Section>
  );
}

/* ---------- Detalles de opciones ---------- */

function DetailsSection({
  f,
  setF,
  error,
}: {
  f: ProductFormState;
  setF: React.Dispatch<React.SetStateAction<ProductFormState>>;
  error?: string;
}) {
  const update = (opt: string, value: string, rows: ProductFormState["details"][string][string]) =>
    setF((s) => ({ ...s, details: { ...s.details, [opt]: { ...(s.details[opt] ?? {}), [value]: rows } } }));

  return (
    <Section
      title="Detalles de opciones"
      description="Ficha técnica de cada valor (p. ej. alturaCm, garantiaAnos del núcleo, descripcion de la funda). La tabla de núcleos usa los de «Núcleo»."
    >
      {error && <FieldError>{error}</FieldError>}
      {f.options.filter((o) => o.name.trim()).map((opt) => (
        <details key={opt.name} className="rounded-card border border-line p-4" open={Boolean(f.details[opt.name])}>
          <summary className="cursor-pointer font-semibold">{opt.name}</summary>
          <div className="mt-3 grid gap-4">
            {opt.values.filter(Boolean).map((value) => {
              const rows = f.details[opt.name]?.[value] ?? [];
              return (
                <div key={value}>
                  <p className="label">{value}</p>
                  <ul className="m-0 grid list-none gap-2 p-0">
                    {rows.map((row, i) => (
                      <li key={i} className="grid grid-cols-[1fr_1.4fr_auto] gap-2">
                        <input
                          className="field mono !py-1.5 text-sm"
                          aria-label={`${opt.name} ${value}: campo ${i + 1}`}
                          placeholder="campo"
                          value={row.key}
                          onChange={(e) => update(opt.name, value, rows.map((r, j) => (j === i ? { ...r, key: e.target.value } : r)))}
                        />
                        <input
                          className="field !py-1.5 text-sm"
                          aria-label={`${opt.name} ${value}: valor del campo ${row.key || i + 1}`}
                          placeholder="valor"
                          value={row.value}
                          onChange={(e) => update(opt.name, value, rows.map((r, j) => (j === i ? { ...r, value: e.target.value } : r)))}
                        />
                        <button
                          type="button"
                          className="icon-btn !h-9 !w-9"
                          aria-label={`Quitar el campo ${row.key || i + 1}`}
                          onClick={() => update(opt.name, value, rows.filter((_, j) => j !== i))}
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                  <button
                    type="button"
                    className="mt-2 text-sm text-aji-ink underline"
                    onClick={() => update(opt.name, value, [...rows, { key: "", value: "" }])}
                  >
                    + Añadir campo a {value}
                  </button>
                </div>
              );
            })}
          </div>
        </details>
      ))}
    </Section>
  );
}

/* ---------- Variantes ---------- */

function VariantsSection({
  f,
  setF,
  errors,
}: {
  f: ProductFormState;
  setF: React.Dispatch<React.SetStateAction<ProductFormState>>;
  errors: Record<string, string>;
}) {
  const [prefix, setPrefix] = useState(() => skuPrefixFromSlug(f.slug));
  const [prefixTouched, setPrefixTouched] = useState(Boolean(f.slug));
  const [basePrice, setBasePrice] = useState("499");
  const [info, setInfo] = useState<string | null>(null);
  const [adjust, setAdjust] = useState({ target: "", amount: "" });
  const ids = useId();

  useEffect(() => {
    if (!prefixTouched) setPrefix(skuPrefixFromSlug(f.slug));
  }, [f.slug, prefixTouched]);

  const names = f.options.map((o) => o.name).filter(Boolean);
  const orphans = orphanVariants(f);
  const pairs = f.options.flatMap((o) => o.values.filter(Boolean).map((v) => `${o.name}=${v}`));

  function generate() {
    const price = parsePrice(basePrice);
    if (!Number.isFinite(price) || price < 0) {
      setInfo("Indica un precio base válido para las variantes nuevas.");
      return;
    }
    const map = new Map<AdminVariant, FormVariant>();
    const existing = f.variants.map((v) => {
      const a: AdminVariant = { sku: v.sku, options: v.options, price: parsePrice(v.price) || 0, currency: "EUR", inStock: v.inStock };
      map.set(a, v);
      return a;
    });
    const options = f.options.map((o) => ({ name: o.name.trim(), values: o.values.map((v) => v.trim()).filter(Boolean) }));
    const result = generateVariants({ options, existing, prefix, basePrice: price });
    const next: FormVariant[] = result.variants.map(
      (v) => map.get(v) ?? { sku: v.sku, options: v.options, price: String(v.price), inStock: v.inStock },
    );
    // Las variantes que ya no encajan se conservan al final para que el usuario decida.
    setF((s) => ({ ...s, variants: [...next, ...result.orphaned.map((o) => map.get(o)!)] }));
    setInfo(
      result.added > 0
        ? `${result.added} variante${result.added === 1 ? "" : "s"} nueva${result.added === 1 ? "" : "s"} a ${formatPrice(price)}. Revisa precios y stock.`
        : "No faltaba ninguna combinación.",
    );
  }

  function applyAdjust() {
    const amount = parsePrice(adjust.amount);
    const [opt, value] = adjust.target.split("=");
    if (!adjust.target || !Number.isFinite(amount)) {
      setInfo("Elige una opción y un importe (puede ser negativo).");
      return;
    }
    setF((s) => ({
      ...s,
      variants: s.variants.map((v) => {
        if (v.options[opt] !== value) return v;
        const current = parsePrice(v.price);
        return { ...v, price: String(Math.round(((Number.isFinite(current) ? current : 0) + amount) * 100) / 100) };
      }),
    }));
    setInfo(`Precio ajustado en las variantes con ${opt} = ${value}.`);
  }

  const setVariant = (i: number, patch: Partial<FormVariant>) =>
    setF((s) => ({ ...s, variants: s.variants.map((v, j) => (j === i ? { ...v, ...patch } : v)) }));

  return (
    <Section
      title={`Variantes (${f.variants.length})`}
      description="Una por combinación de opciones, con SKU único, precio en euros (IVA incluido) y stock."
    >
      {errors.variants && <FieldError>{errors.variants}</FieldError>}
      <div className="grid gap-3 rounded-card bg-tint p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
        <div>
          <label className="label" htmlFor={`${ids}-prefix`}>
            Prefijo de SKU
          </label>
          <input
            id={`${ids}-prefix`}
            className="field mono"
            value={prefix}
            maxLength={8}
            onChange={(e) => {
              setPrefixTouched(true);
              setPrefix(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ""));
            }}
          />
        </div>
        <div>
          <label className="label" htmlFor={`${ids}-base`}>
            Precio base (€) de las nuevas
          </label>
          <input id={`${ids}-base`} className="field mono" inputMode="decimal" value={basePrice} onChange={(e) => setBasePrice(e.target.value)} />
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={generate} disabled={names.length === 0}>
          Generar combinaciones
        </button>
      </div>

      {f.variants.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-[1fr_10rem_auto] sm:items-end">
          <div>
            <label className="label" htmlFor={`${ids}-adj`}>
              Ajustar precio de las variantes con…
            </label>
            <select
              id={`${ids}-adj`}
              className="field"
              value={adjust.target}
              onChange={(e) => setAdjust((a) => ({ ...a, target: e.target.value }))}
            >
              <option value="">Elige opción y valor</option>
              {pairs.map((p) => (
                <option key={p} value={p}>
                  {p.replace("=", ": ")}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor={`${ids}-amt`}>
              Importe (± €)
            </label>
            <input
              id={`${ids}-amt`}
              className="field mono"
              inputMode="decimal"
              placeholder="110"
              value={adjust.amount}
              onChange={(e) => setAdjust((a) => ({ ...a, amount: e.target.value }))}
            />
          </div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={applyAdjust}>
            Sumar al precio
          </button>
        </div>
      )}

      <div aria-live="polite">{info && <p className="text-sm text-muted">{info}</p>}</div>

      {orphans.length > 0 && (
        <Notice tone="warn" title={`${orphans.length} variante${orphans.length === 1 ? "" : "s"} no encaja${orphans.length === 1 ? "" : "n"} con las opciones`}>
          Usan opciones o valores que ya no existen.{" "}
          <button
            type="button"
            className="underline"
            onClick={() => setF((s) => ({ ...s, variants: s.variants.filter((v) => !orphans.includes(v)) }))}
          >
            Quitar las que sobran
          </button>
        </Notice>
      )}

      {f.variants.length === 0 ? (
        <p className="text-sm text-muted">Sin variantes. Define las opciones y pulsa «Generar combinaciones».</p>
      ) : (
        <div className="cores-wrap">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <caption className="sr-only">Variantes del producto</caption>
            <thead>
              <tr className="border-b border-line text-left">
                <th scope="col" className="label px-3 py-2">SKU</th>
                {names.map((n) => (
                  <th key={n} scope="col" className="label px-3 py-2">
                    {n}
                  </th>
                ))}
                <th scope="col" className="label px-3 py-2">Precio (€)</th>
                <th scope="col" className="label px-3 py-2">En stock</th>
                <th scope="col" className="px-3 py-2">
                  <span className="sr-only">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {f.variants.map((v, i) => {
                const label = Object.values(v.options).join(" · ") || v.sku;
                const rowError = errors[`variants.${i}.sku`] ?? errors[`variants.${i}.price`] ?? errors[`variants.${i}.options`];
                return (
                  <tr key={i} className={`border-b border-line last:border-0 ${rowError ? "bg-[color-mix(in_srgb,var(--danger)_8%,transparent)]" : ""}`}>
                    <td className="px-3 py-1.5">
                      <input
                        className="field mono !py-1.5 text-xs"
                        aria-label={`SKU de ${label}`}
                        value={v.sku}
                        maxLength={40}
                        aria-invalid={Boolean(errors[`variants.${i}.sku`])}
                        onChange={(e) => setVariant(i, { sku: e.target.value.toUpperCase() })}
                      />
                    </td>
                    {names.map((n) => (
                      <td key={n} className={`px-3 py-1.5 ${f.options.find((o) => o.name === n)?.values.includes(v.options[n]) ? "" : "text-danger"}`}>
                        {v.options[n] ?? "—"}
                      </td>
                    ))}
                    <td className="px-3 py-1.5">
                      <input
                        className="field mono w-28 !py-1.5 text-right"
                        inputMode="decimal"
                        aria-label={`Precio de ${label}`}
                        value={v.price}
                        aria-invalid={Boolean(errors[`variants.${i}.price`])}
                        onChange={(e) => setVariant(i, { price: e.target.value })}
                      />
                    </td>
                    <td className="px-3 py-1.5 text-center">
                      <input
                        type="checkbox"
                        className="h-5 w-5 accent-[var(--aji)]"
                        aria-label={`${label} en stock`}
                        checked={v.inStock}
                        onChange={(e) => setVariant(i, { inStock: e.target.checked })}
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <button
                        type="button"
                        className="icon-btn !h-8 !w-8"
                        aria-label={`Quitar la variante ${label}`}
                        onClick={() => setF((s) => ({ ...s, variants: s.variants.filter((_, j) => j !== i) }))}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

/* ---------- Piezas ---------- */

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="card flex flex-col gap-4 p-5 md:p-6">
      <div>
        <h3 id={id} className="text-xl font-bold">
          {title}
        </h3>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function FieldError({ children, id }: { children: ReactNode; id?: string }) {
  return (
    <p id={id} className="mt-1 text-sm text-danger">
      {children}
    </p>
  );
}

function TextField(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
  hint?: string;
  required?: boolean;
  readOnly?: boolean;
  multiline?: boolean;
  maxLength?: number;
  mono?: boolean;
}) {
  const id = useId();
  const describedBy = [props.hint ? `${id}-hint` : null, props.error ? `${id}-err` : null].filter(Boolean).join(" ") || undefined;
  const common = {
    id,
    className: `field${props.mono ? " mono" : ""}${props.readOnly ? " opacity-70" : ""}`,
    value: props.value,
    required: props.required,
    readOnly: props.readOnly,
    maxLength: props.maxLength,
    "aria-invalid": Boolean(props.error),
    "aria-describedby": describedBy,
  };
  return (
    <div>
      <label htmlFor={id} className="label">
        {props.label}
        {props.required && <span aria-hidden="true"> *</span>}
      </label>
      {props.multiline ? (
        <textarea {...common} rows={5} onChange={(e) => props.onChange(e.target.value)} />
      ) : (
        <input {...common} onChange={(e) => props.onChange(e.target.value)} />
      )}
      {props.hint && (
        <p id={`${id}-hint`} className="mt-1 text-xs text-muted">
          {props.hint}
        </p>
      )}
      {props.error && <FieldError id={`${id}-err`}>{props.error}</FieldError>}
    </div>
  );
}

function firstWithPrefix(errors: Record<string, string>, prefix: string): string | undefined {
  const key = Object.keys(errors).find((k) => k.startsWith(prefix));
  return key ? errors[key] : undefined;
}

const FIELD_LABELS: Record<string, string> = {
  slug: "Slug",
  name: "Nombre",
  shortDescription: "Descripción corta",
  badge: "Etiqueta de la tarjeta",
  description: "Descripción",
  images: "Imágenes",
  options: "Opciones",
  optionDetails: "Detalles de opciones",
  features: "Características",
  variants: "Variantes",
  active: "Activo",
};

/** "variants.3.price" → "Variante 4 (CAF-…) · precio". */
export function labelFor(path: string, f: ProductFormState): string {
  const [root, index, field] = path.split(".");
  if (root === "variants" && index !== undefined && /^\d+$/.test(index)) {
    const v = f.variants[Number(index)];
    const what = field === "price" ? "precio" : field === "sku" ? "SKU" : field === "options" ? "opciones" : "";
    return `Variante ${Number(index) + 1}${v?.sku ? ` (${v.sku})` : ""}${what ? ` · ${what}` : ""}`;
  }
  if (root === "options" && index !== undefined && /^\d+$/.test(index)) {
    return `Opción ${Number(index) + 1}${f.options[Number(index)]?.name ? ` (${f.options[Number(index)].name})` : ""}`;
  }
  return FIELD_LABELS[root] ?? root;
}
