import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import raw from "../../../data/catalog.json";
import { CatalogUnavailableError, createFirestoreCatalog, parseFirestoreProduct, toPlain } from "@/lib/catalog/repository";
import { CheckoutError, priceCart } from "@/lib/checkout";
import { FakeFirestore } from "../helpers/fakeFirestore";

/** Imita un Timestamp de Firestore: objeto de clase con toDate(), no serializable para Next.js. */
class FakeTimestamp {
  constructor(private ms: number) {}
  toDate() {
    return new Date(this.ms);
  }
}

const isPlain = (v: unknown): boolean => {
  if (v === null || typeof v !== "object") return true;
  if (Array.isArray(v)) return v.every(isPlain);
  const proto = Object.getPrototypeOf(v);
  return (proto === Object.prototype || proto === null) && Object.values(v).every(isPlain);
};

describe("producto leído de Firestore", () => {
  it("convierte los Timestamp a ISO y deja un objeto plano apto para componentes de cliente", () => {
    const doc = { ...raw.products[0], updatedAt: new FakeTimestamp(Date.UTC(2026, 9, 15, 8, 0, 0)) };
    const parsed = parseFirestoreProduct(doc);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect((parsed.data as Record<string, unknown>).updatedAt).toBe("2026-10-15T08:00:00.000Z");
    expect(isPlain(parsed.data)).toBe(true);
  });

  it("convierte Timestamp anidados y deja intactos los demás valores", () => {
    expect(toPlain({ a: [new FakeTimestamp(0)], b: { c: 1, d: "x", e: null } })).toEqual({
      a: ["1970-01-01T00:00:00.000Z"],
      b: { c: 1, d: "x", e: null },
    });
  });
});

describe("repositorio en modo Firestore: sin volver nunca al JSON", () => {
  const product = (slug: string, extra: Record<string, unknown> = {}) => ({ ...structuredClone(raw.products[0]), slug, ...extra });

  it("cero productos en Firestore → lista vacía (no los del JSON)", async () => {
    const repo = createFirestoreCatalog(new FakeFirestore() as never);
    expect(await repo.listProducts()).toEqual([]);
  });

  it("un producto borrado o inexistente no reaparece desde el JSON", async () => {
    const db = new FakeFirestore();
    const repo = createFirestoreCatalog(db as never);
    expect(await repo.getProduct("colchon-cafetal")).toBeNull();
    expect(await repo.findBySku("CAF-090190-BRI-ALG")).toBeNull();
  });

  it("solo lista activos, y un producto nuevo creado en Firestore aparece", async () => {
    const db = new FakeFirestore();
    db.store.set("products/colchon-nuevo", product("colchon-nuevo", { name: "Colchón Nuevo" }));
    db.store.set("products/colchon-cafetal", product("colchon-cafetal", { active: false }));
    const repo = createFirestoreCatalog(db as never);
    expect((await repo.listProducts()).map((p) => p.slug)).toEqual(["colchon-nuevo"]);
    expect(await repo.getProduct("colchon-cafetal")).toBeNull();
    expect((await repo.getProduct("colchon-nuevo"))?.name).toBe("Colchón Nuevo");
  });

  it("si Firestore falla lanza CatalogUnavailableError (no datos del JSON)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const db = new FakeFirestore();
    db.failWith = new Error("UNAVAILABLE");
    const repo = createFirestoreCatalog(db as never);
    await expect(repo.listProducts()).rejects.toBeInstanceOf(CatalogUnavailableError);
    await expect(repo.getProduct("colchon-cafetal")).rejects.toBeInstanceOf(CatalogUnavailableError);
    await expect(repo.findBySku("CAF-090190-BRI-ALG")).rejects.toBeInstanceOf(CatalogUnavailableError);
  });

  it("checkout con Firestore: precio de Firestore, producto inactivo → 400, variante sin stock → 409", async () => {
    const db = new FakeFirestore();
    const p = product("colchon-cafetal");
    p.variants[0].price = 123.45;
    p.variants[1].inStock = false;
    db.store.set("products/colchon-cafetal", p);
    const repo = createFirestoreCatalog(db as never);
    const lines = await priceCart({ items: [{ sku: p.variants[0].sku, quantity: 1 }] }, repo);
    expect(lines[0].unitAmount).toBe(12345);
    await expect(priceCart({ items: [{ sku: p.variants[1].sku, quantity: 1 }] }, repo)).rejects.toMatchObject({ status: 409 });

    db.store.set("products/colchon-cafetal", { ...p, active: false });
    const err = await priceCart({ items: [{ sku: p.variants[0].sku, quantity: 1 }] }, repo).catch((e) => e);
    expect(err).toBeInstanceOf(CheckoutError);
    expect(err.status).toBe(400);
  });
});
