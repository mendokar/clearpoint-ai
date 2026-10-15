"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Notice } from "@/components/ui/Notice";
import { SkeletonGroup, SkeletonRow } from "@/components/ui/Skeleton";
import { AdminApiError, adminFetch, errorMessage } from "@/lib/admin/client";
import type { Product } from "@/lib/catalog/types";
import { ProductForm } from "./ProductForm";
import { productToForm } from "./productFormModel";

/** Carga el producto por la API de administración (incluidos inactivos) y abre el formulario. */
export function ProductEditor({ slug }: { slug: string }) {
  const [product, setProduct] = useState<Product | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    adminFetch<{ product: Product }>(`/api/admin/products/${encodeURIComponent(slug)}`)
      .then((d) => active && setProduct(d.product))
      .catch((err) => {
        if (!active) return;
        if (err instanceof AdminApiError && (err.status === 404 || err.status === 400)) setProduct(null);
        else setError(errorMessage(err));
      });
    return () => {
      active = false;
    };
  }, [slug]);

  if (error) return <Notice tone="error" title="No se ha podido cargar el producto">{error}</Notice>;
  if (product === null) {
    return (
      <div className="mt-4">
        <Notice tone="warn" title="Producto no encontrado">
          No existe ningún producto con el slug «{slug}». <Link href="/admin/productos" className="underline">Volver a la lista</Link>
        </Notice>
      </div>
    );
  }
  if (!product) {
    return (
      <SkeletonGroup label="Cargando el producto…" className="mt-4 grid gap-4">
        <SkeletonRow media={false} />
        <SkeletonRow media={false} />
      </SkeletonGroup>
    );
  }
  return (
    <>
      <h2 className="mt-2 mb-6 text-3xl font-extrabold">{product.name}</h2>
      <ProductForm mode="edit" initial={productToForm(product)} />
    </>
  );
}
