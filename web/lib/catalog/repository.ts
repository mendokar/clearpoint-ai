import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import rawCatalog from "../../../data/catalog.json";
import { catalogSchema, type Product, type Variant } from "./types";
import { getAdminDb, isAdminConfigured } from "../firebase/admin";

/**
 * Repositorio de catálogo en servidor.
 * - Con credenciales de Firebase Admin: la colección `products` de Firestore es la ÚNICA fuente de verdad.
 *   Cero productos, o un producto inexistente/inactivo, es una respuesta válida (no se vuelve al JSON:
 *   un producto borrado desde el panel no puede reaparecer). Si Firestore falla se lanza
 *   `CatalogUnavailableError`: las páginas ISR conservan la última versión buena generada, la API de pago
 *   responde 503 y una página sin versión previa muestra `app/error.tsx`. Nunca se sirven datos del JSON.
 * - Sin credenciales (desarrollo local y tests): `data/catalog.json`, empaquetado en el build. El JSON es
 *   también la semilla inicial de `scripts/seed.ts`.
 */
export interface CatalogRepository {
  listProducts(): Promise<Product[]>;
  getProduct(slug: string): Promise<Product | null>;
  findBySku(sku: string): Promise<{ product: Product; variant: Variant } | null>;
}

/** Firestore no ha respondido: error controlado, nunca datos viejos. */
export class CatalogUnavailableError extends Error {
  constructor(cause?: unknown) {
    super("El catálogo no está disponible ahora mismo.");
    this.name = "CatalogUnavailableError";
    if (cause !== undefined) (this as { cause?: unknown }).cause = cause;
  }
}

const localProducts: Product[] = catalogSchema.parse(rawCatalog).products;

/**
 * Convierte un documento de Firestore en datos planos serializables: los `Timestamp` (cualquier objeto con
 * `toDate()`) pasan a ISO 8601. Next.js solo puede pasar objetos planos a componentes de cliente, y el
 * esquema de producto conserva los campos extra (`updatedAt` del seed).
 */
export function toPlain(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();
  const maybeTs = value as { toDate?: unknown };
  if (typeof maybeTs.toDate === "function") {
    const date = (maybeTs.toDate as () => Date).call(value);
    return date instanceof Date && !Number.isNaN(date.getTime()) ? date.toISOString() : null;
  }
  if (Array.isArray(value)) return value.map(toPlain);
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, toPlain(v)]));
}

/** Valida un producto leído de Firestore ya convertido a datos planos. */
export function parseFirestoreProduct(data: unknown) {
  return catalogSchema.shape.products.element.safeParse(toPlain(data));
}

class LocalCatalogRepository implements CatalogRepository {
  async listProducts() {
    return localProducts.filter((p) => p.active);
  }
  async getProduct(slug: string) {
    return localProducts.find((p) => p.slug === slug && p.active) ?? null;
  }
  async findBySku(sku: string) {
    return findIn(await this.listProducts(), sku);
  }
}

class FirestoreCatalogRepository implements CatalogRepository {
  constructor(private db: () => Firestore) {}

  async listProducts() {
    let docs;
    try {
      docs = (await this.db().collection("products").where("active", "==", true).get()).docs;
    } catch (err) {
      console.error("[catalog] Firestore no disponible", errMsg(err));
      throw new CatalogUnavailableError(err);
    }
    const products: Product[] = [];
    for (const doc of docs) {
      const parsed = parseFirestoreProduct(doc.data());
      if (parsed.success && parsed.data.active) products.push(parsed.data);
      else if (!parsed.success) console.error("[catalog] producto inválido en Firestore", { id: doc.id });
    }
    return products.sort((a, b) => a.name.localeCompare(b.name, "es"));
  }
  async getProduct(slug: string) {
    if (!/^[a-z0-9-]{1,80}$/.test(slug)) return null;
    let doc;
    try {
      doc = await this.db().collection("products").doc(slug).get();
    } catch (err) {
      console.error("[catalog] Firestore no disponible", errMsg(err));
      throw new CatalogUnavailableError(err);
    }
    if (!doc.exists) return null;
    const parsed = parseFirestoreProduct(doc.data());
    if (!parsed.success) console.error("[catalog] producto inválido en Firestore", { id: slug });
    return parsed.success && parsed.data.active ? parsed.data : null;
  }
  /** Solo productos activos: un producto desactivado o borrado no se puede comprar. */
  async findBySku(sku: string) {
    return findIn(await this.listProducts(), sku);
  }
}

function findIn(products: Product[], sku: string) {
  for (const product of products) {
    const variant = product.variants.find((v) => v.sku === sku);
    if (variant) return { product, variant };
  }
  return null;
}

function errMsg(err: unknown) {
  return err instanceof Error ? err.message : String(err);
}

let repo: CatalogRepository | null = null;
export function getCatalog(): CatalogRepository {
  repo ??= isAdminConfigured() ? new FirestoreCatalogRepository(getAdminDb) : new LocalCatalogRepository();
  return repo;
}

/** Repositorio sobre el JSON local (desarrollo y tests). */
export function createLocalCatalog(): CatalogRepository {
  return new LocalCatalogRepository();
}

/** Repositorio sobre una instancia concreta de Firestore (tests con dobles o emulador). */
export function createFirestoreCatalog(db: Firestore | (() => Firestore)): CatalogRepository {
  return new FirestoreCatalogRepository(typeof db === "function" ? db : () => db);
}

/** Slugs de los productos activos de la fuente vigente (Firestore con credenciales; JSON sin ellas). */
export async function activeSlugs(): Promise<string[]> {
  return (await getCatalog().listProducts()).map((p) => p.slug);
}
