"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Notice } from "@/components/ui/Notice";
import { SkeletonGroup, SkeletonRow } from "@/components/ui/Skeleton";
import { adminFetch, errorMessage } from "@/lib/admin/client";
import { isAllowedImageUrl } from "@/lib/catalog/admin-schema";
import { lowestPrice, type Product } from "@/lib/catalog/types";
import { formatDate, formatPrice } from "@/lib/format";

type Row = Product & { updatedAt?: string | null };
type ListResponse = { products: Row[]; invalid: { slug: string; error: string }[] };

/** Lista de productos del panel (activos e inactivos) con activar/desactivar y eliminar con confirmación. */
export function ProductsAdmin({ created }: { created?: string }) {
  const [data, setData] = useState<ListResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(created ? `Producto «${created}» creado. Ya está en la tienda si está activo.` : null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await adminFetch<ListResponse>("/api/admin/products"));
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggle(p: Row) {
    setBusy(p.slug);
    setMessage(null);
    setError(null);
    try {
      await adminFetch(`/api/admin/products/${encodeURIComponent(p.slug)}`, { method: "PATCH", body: { active: !p.active } });
      setData((d) => d && { ...d, products: d.products.map((x) => (x.slug === p.slug ? { ...x, active: !p.active } : x)) });
      setMessage(`${p.name} ${p.active ? "desactivado: ya no se muestra ni se puede comprar" : "activado: ya está en la tienda"}.`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  async function remove(slug: string, name: string) {
    setBusy(slug);
    setMessage(null);
    setError(null);
    try {
      await adminFetch(`/api/admin/products/${encodeURIComponent(slug)}`, { method: "DELETE" });
      setData((d) => d && { ...d, products: d.products.filter((x) => x.slug !== slug), invalid: d.invalid.filter((x) => x.slug !== slug) });
      setConfirming(null);
      setMessage(`${name} eliminado.`);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted">
          {data ? `${data.products.length} producto${data.products.length === 1 ? "" : "s"}` : "Cargando productos…"}
        </p>
        <Link href="/admin/productos/nuevo" className="btn btn-primary btn-sm">
          Nuevo producto
        </Link>
      </div>

      <div aria-live="polite">{message && <Notice tone="ok">{message}</Notice>}</div>
      {error && (
        <Notice tone="error" title="Algo ha fallado">
          {error}{" "}
          <button type="button" className="underline" onClick={() => void load()}>
            Reintentar
          </button>
        </Notice>
      )}

      {!data && !error && (
        <SkeletonGroup label="Cargando productos…" className="grid gap-4">
          <SkeletonRow />
          <SkeletonRow />
        </SkeletonGroup>
      )}

      {data && data.products.length === 0 && data.invalid.length === 0 && (
        <div className="card flex flex-col items-start gap-3 p-8">
          <h2 className="text-2xl font-bold">No hay productos</h2>
          <p className="text-muted">La tienda está vacía. Crea el primer colchón para que aparezca en la home.</p>
          <Link href="/admin/productos/nuevo" className="btn btn-primary">
            Crear producto
          </Link>
        </div>
      )}

      {data && data.products.length > 0 && (
        <ul className="m-0 grid list-none gap-4 p-0">
          {data.products.map((p) => {
            const image = p.images.find(isAllowedImageUrl);
            const outOfStock = p.variants.filter((v) => !v.inStock).length;
            return (
              <li key={p.slug} className="card flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-4">
                  {image ? (
                    <Image src={image} alt="" width={160} height={160} className="h-20 w-20 flex-none rounded-xl object-cover" />
                  ) : (
                    <span className="grid h-20 w-20 flex-none place-items-center rounded-xl bg-tint text-xs text-muted">Sin foto</span>
                  )}
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2">
                      <Link href={`/admin/productos/${p.slug}`} className="text-lg font-semibold hover:text-aji-ink">
                        {p.name}
                      </Link>
                      <span
                        className={`mono rounded-md px-2 py-0.5 text-xs ${p.active ? "bg-ok text-bg" : "bg-line text-muted"}`}
                      >
                        {p.active ? "Activo" : "Inactivo"}
                      </span>
                    </p>
                    <p className="mono text-xs text-muted">/{p.slug}</p>
                    <p className="text-sm text-muted">
                      {p.variants.length} variantes · desde {formatPrice(lowestPrice(p))}
                      {outOfStock > 0 && ` · ${outOfStock} sin stock`}
                      {p.updatedAt && ` · actualizado ${formatDate(p.updatedAt, true)}`}
                    </p>
                  </div>
                </div>

                {confirming === p.slug ? (
                  <ConfirmDelete
                    name={p.name}
                    busy={busy === p.slug}
                    onCancel={() => setConfirming(null)}
                    onConfirm={() => void remove(p.slug, p.name)}
                  />
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <Link href={`/admin/productos/${p.slug}`} className="btn btn-ghost btn-sm">
                      Editar
                    </Link>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      aria-pressed={p.active}
                      disabled={busy === p.slug}
                      onClick={() => void toggle(p)}
                    >
                      {p.active ? "Desactivar" : "Activar"}
                    </button>
                    {p.active && (
                      <Link href={`/productos/${p.slug}`} className="btn btn-ghost btn-sm" target="_blank" rel="noopener">
                        Ver en la tienda
                      </Link>
                    )}
                    <button
                      type="button"
                      className="btn btn-sm border-danger text-danger"
                      disabled={busy === p.slug}
                      onClick={() => setConfirming(p.slug)}
                    >
                      Eliminar
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {data && data.invalid.length > 0 && (
        <Notice tone="warn" title="Documentos de producto no válidos">
          <p className="mb-2">Estos documentos de Firestore no cumplen el esquema y no se muestran en la tienda:</p>
          <ul className="m-0 grid list-none gap-2 p-0">
            {data.invalid.map((x) => (
              <li key={x.slug} className="flex flex-wrap items-center gap-2">
                <span className="mono">{x.slug}</span> — {x.error}
                {confirming === x.slug ? (
                  <ConfirmDelete
                    name={x.slug}
                    busy={busy === x.slug}
                    onCancel={() => setConfirming(null)}
                    onConfirm={() => void remove(x.slug, x.slug)}
                  />
                ) : (
                  <button type="button" className="underline" onClick={() => setConfirming(x.slug)}>
                    Eliminar
                  </button>
                )}
              </li>
            ))}
          </ul>
        </Notice>
      )}
    </div>
  );
}

/** Confirmación en línea (sin `confirm()`): el foco va a "Cancelar" para no borrar por accidente. */
function ConfirmDelete({
  name,
  busy,
  onCancel,
  onConfirm,
}: {
  name: string;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => cancelRef.current?.focus(), []);
  return (
    <div
      role="group"
      aria-label={`Confirmar eliminación de ${name}`}
      className="flex flex-col gap-2 rounded-card border border-danger p-3 text-sm"
      onKeyDown={(e) => e.key === "Escape" && onCancel()}
    >
      <p className="font-semibold text-ink">¿Eliminar «{name}»? No se puede deshacer.</p>
      <p className="text-muted">Los pedidos ya realizados conservan sus datos. Si solo quieres ocultarlo, desactívalo.</p>
      <div className="flex flex-wrap gap-2">
        <button ref={cancelRef} type="button" className="btn btn-ghost btn-sm" onClick={onCancel} disabled={busy}>
          Cancelar
        </button>
        <button type="button" className="btn btn-sm border-danger bg-danger text-on-accent" onClick={onConfirm} disabled={busy}>
          {busy ? "Eliminando…" : "Sí, eliminar"}
        </button>
      </div>
    </div>
  );
}
