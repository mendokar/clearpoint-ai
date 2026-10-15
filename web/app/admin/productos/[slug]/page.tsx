import type { Metadata } from "next";
import Link from "next/link";
import { ProductEditor } from "@/components/admin/ProductEditor";

export const metadata: Metadata = { title: "Editar producto" };

export default async function EditProductPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return (
    <>
      <Link href="/admin/productos" className="text-sm text-muted hover:text-aji-ink">
        ← Productos
      </Link>
      <ProductEditor slug={decodeURIComponent(slug)} />
    </>
  );
}
