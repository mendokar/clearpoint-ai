import type { Metadata } from "next";
import Link from "next/link";
import { ProductForm } from "@/components/admin/ProductForm";

export const metadata: Metadata = { title: "Nuevo producto" };

export default function NewProductPage() {
  return (
    <>
      <Link href="/admin/productos" className="text-sm text-muted hover:text-aji-ink">
        ← Productos
      </Link>
      <h2 className="mt-2 mb-6 text-3xl font-extrabold">Nuevo producto</h2>
      <ProductForm mode="create" />
    </>
  );
}
