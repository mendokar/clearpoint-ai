import "server-only";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { revalidatePath } from "next/cache";
import type { AdminProduct } from "../catalog/admin-schema";
import { parseFirestoreProduct } from "../catalog/repository";
import type { Product } from "../catalog/types";
import { AdminStoreError } from "./errors";

export { AdminStoreError };

/**
 * Escrituras del catálogo desde el panel (Admin SDK; las reglas siguen sin permitir escrituras de cliente).
 * Las comprobaciones de unicidad (slug y SKU en todo el catálogo) se hacen dentro de una transacción.
 */

export type AdminProductRow = Product & { createdAt?: string | null; updatedAt?: string | null };
export type InvalidProductRow = { slug: string; error: string };

const products = (db: Firestore) => db.collection("products");

/** Todos los productos, también los inactivos. Los documentos que no cumplen el esquema se listan aparte. */
export async function listAllProducts(db: Firestore): Promise<{ products: AdminProductRow[]; invalid: InvalidProductRow[] }> {
  const snap = await products(db).get();
  const valid: AdminProductRow[] = [];
  const invalid: InvalidProductRow[] = [];
  for (const doc of snap.docs) {
    const parsed = parseFirestoreProduct(doc.data());
    if (parsed.success) valid.push(parsed.data as AdminProductRow);
    else invalid.push({ slug: doc.id, error: parsed.error.issues[0]?.message ?? "Documento no válido" });
  }
  valid.sort((a, b) => a.name.localeCompare(b.name, "es"));
  return { products: valid, invalid };
}

export async function getProductForAdmin(db: Firestore, slug: string): Promise<AdminProductRow | null> {
  const doc = await products(db).doc(slug).get();
  if (!doc.exists) return null;
  const parsed = parseFirestoreProduct(doc.data());
  if (!parsed.success) throw new AdminStoreError(422, "El producto guardado no cumple el esquema; revísalo en Firestore.");
  return parsed.data as AdminProductRow;
}

function priceFrom(input: AdminProduct): number {
  return Math.min(...input.variants.map((v) => v.price));
}

function toDocument(input: AdminProduct) {
  return {
    ...input,
    variants: input.variants.map((v) => ({ ...v, currency: "EUR" })),
    priceFrom: priceFrom(input),
    currency: "EUR",
    updatedAt: FieldValue.serverTimestamp(),
  };
}

type TxLike = Parameters<Parameters<Firestore["runTransaction"]>[0]>[0];

/** SKU de `input` que ya usa OTRO producto del catálogo. */
async function findSkuClash(tx: TxLike, db: Firestore, input: AdminProduct): Promise<{ sku: string; slug: string } | null> {
  const wanted = new Set(input.variants.map((v) => v.sku));
  const all = await tx.get(products(db));
  for (const doc of all.docs) {
    if (doc.id === input.slug) continue;
    const variants = (doc.data()?.variants ?? []) as { sku?: unknown }[];
    for (const v of variants) {
      if (typeof v?.sku === "string" && wanted.has(v.sku)) return { sku: v.sku, slug: doc.id };
    }
  }
  return null;
}

export async function createProduct(db: Firestore, input: AdminProduct): Promise<void> {
  const ref = products(db).doc(input.slug);
  await db.runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (existing.exists) throw new AdminStoreError(409, `Ya existe un producto con el slug "${input.slug}".`, "slug");
    const clash = await findSkuClash(tx, db, input);
    if (clash) throw new AdminStoreError(409, `El SKU ${clash.sku} ya lo usa el producto "${clash.slug}".`, "variants");
    tx.set(ref, { ...toDocument(input), createdAt: FieldValue.serverTimestamp() });
  });
}

/** Sustituye el producto entero. El slug es el ID del documento y no se puede cambiar. */
export async function updateProduct(db: Firestore, slug: string, input: AdminProduct): Promise<void> {
  if (input.slug !== slug) throw new AdminStoreError(400, "El slug no se puede cambiar después de crear el producto.", "slug");
  const ref = products(db).doc(slug);
  await db.runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (!existing.exists) throw new AdminStoreError(404, "El producto no existe.");
    const clash = await findSkuClash(tx, db, input);
    if (clash) throw new AdminStoreError(409, `El SKU ${clash.sku} ya lo usa el producto "${clash.slug}".`, "variants");
    const createdAt = existing.data()?.createdAt;
    tx.set(ref, { ...toDocument(input), ...(createdAt ? { createdAt } : {}) });
  });
}

export async function setProductActive(db: Firestore, slug: string, active: boolean): Promise<void> {
  const ref = products(db).doc(slug);
  await db.runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (!existing.exists) throw new AdminStoreError(404, "El producto no existe.");
    tx.update(ref, { active, updatedAt: FieldValue.serverTimestamp() });
  });
}

export async function deleteProduct(db: Firestore, slug: string): Promise<void> {
  const ref = products(db).doc(slug);
  await db.runTransaction(async (tx) => {
    const existing = await tx.get(ref);
    if (!existing.exists) throw new AdminStoreError(404, "El producto no existe.");
    tx.delete(ref);
  });
}

/** Regenera al momento la home (lista), la ficha y el resto de fichas (sección "también te puede gustar"). */
export function revalidateCatalog(slug: string) {
  try {
    revalidatePath("/");
    revalidatePath(`/productos/${slug}`);
    revalidatePath("/productos/[slug]", "page");
  } catch (err) {
    // Fuera de una petición de Next (p. ej. scripts) no hay caché que invalidar.
    console.warn("[admin] no se pudo revalidar", err instanceof Error ? err.message : String(err));
  }
}
