import "server-only";
import rawCatalog from "../../../data/catalog.json";
import { catalogSchema, type Product, type Variant } from "./types";
import { getAdminDb, isAdminConfigured } from "../firebase/admin";

/**
 * Repositorio de catálogo en servidor.
 * - Con credenciales de Firebase Admin: lee la colección `products` de Firestore.
 * - Sin credenciales (desarrollo): usa `data/catalog.json`, empaquetado en el build.
 * Si Firestore falla, se registra y se usa el JSON para que la tienda siga navegable.
 */
export interface CatalogRepository {
  listProducts(): Promise<Product[]>;
  getProduct(slug: string): Promise<Product | null>;
  findBySku(sku: string): Promise<{ product: Product; variant: Variant } | null>;
}

const localProducts: Product[] = catalogSchema.parse(rawCatalog).products;

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
  private fallback = new LocalCatalogRepository();

  async listProducts() {
    try {
      const snap = await getAdminDb().collection("products").where("active", "==", true).get();
      const products: Product[] = [];
      for (const doc of snap.docs) {
        const parsed = catalogSchema.shape.products.element.safeParse(doc.data());
        if (parsed.success) products.push(parsed.data);
        else console.error("[catalog] producto inválido en Firestore", { id: doc.id });
      }
      if (products.length === 0) return this.fallback.listProducts();
      return products.sort((a, b) => a.name.localeCompare(b.name, "es"));
    } catch (err) {
      console.error("[catalog] Firestore no disponible, se usa el catálogo local", errMsg(err));
      return this.fallback.listProducts();
    }
  }
  async getProduct(slug: string) {
    if (!/^[a-z0-9-]{1,80}$/.test(slug)) return null;
    try {
      const doc = await getAdminDb().collection("products").doc(slug).get();
      if (!doc.exists) return null;
      const parsed = catalogSchema.shape.products.element.safeParse(doc.data());
      return parsed.success && parsed.data.active ? parsed.data : null;
    } catch (err) {
      console.error("[catalog] Firestore no disponible, se usa el catálogo local", errMsg(err));
      return this.fallback.getProduct(slug);
    }
  }
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
  repo ??= isAdminConfigured() ? new FirestoreCatalogRepository() : new LocalCatalogRepository();
  return repo;
}

/** Repositorio sobre el JSON local (desarrollo y tests). */
export function createLocalCatalog(): CatalogRepository {
  return new LocalCatalogRepository();
}

/** Catálogo local sin pasar por Firestore (para generateStaticParams). */
export function localSlugs(): string[] {
  return localProducts.filter((p) => p.active).map((p) => p.slug);
}
