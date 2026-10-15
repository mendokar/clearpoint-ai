import type { Metadata } from "next";
import { ProductsAdmin } from "@/components/admin/ProductsAdmin";

export const metadata: Metadata = { title: "Productos" };

export default async function AdminProductsPage({ searchParams }: { searchParams: Promise<{ creado?: string }> }) {
  const { creado } = await searchParams;
  return <ProductsAdmin created={typeof creado === "string" ? creado.slice(0, 80) : undefined} />;
}
