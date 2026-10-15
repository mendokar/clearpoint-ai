import { describe, expect, it } from "vitest";
import raw from "../../../data/catalog.json";
import { initialSelection, resolveSelection, valueState } from "@/components/product/selection";
import { createLocalCatalog } from "@/lib/catalog/repository";
import { catalogSchema, findVariant, lowestPrice, type Product } from "@/lib/catalog/types";
import { priceCart } from "@/lib/checkout";

const products = catalogSchema.parse(raw).products;
const cafetal = products.find((p) => p.slug === "colchon-cafetal")!;
const caribe = products.find((p) => p.slug === "colchon-caribe")!;

describe("catálogo", () => {
  it("data/catalog.json cumple el esquema y cada SKU es único", () => {
    const skus = products.flatMap((p) => p.variants.map((v) => v.sku));
    expect(new Set(skus).size).toBe(skus.length);
    expect(products.map((p) => p.slug)).toEqual(["colchon-cafetal", "colchon-caribe"]);
  });

  it("cada variante usa solo valores declarados en options", () => {
    for (const p of products) {
      for (const v of p.variants) {
        for (const o of p.options) expect(o.values).toContain(v.options[o.name]);
      }
    }
  });

  it("findVariant resuelve la variante por opciones", () => {
    const v = findVariant(cafetal, { Medida: "150×190", Núcleo: "Ceiba+", Funda: "Térmica Páramo" });
    expect(v?.sku).toBe("CAF-150190-CEI-TER");
    expect(v?.price).toBe(719);
    expect(findVariant(cafetal, { Medida: "180×200", Núcleo: "Brisa", Funda: "Algodón Tolima" })).toBeUndefined();
    expect(findVariant(cafetal, { Medida: "90×190" })).toBeUndefined();
  });

  it("lowestPrice es el 'desde' de la ficha", () => {
    expect(lowestPrice(cafetal)).toBe(349);
    expect(lowestPrice(caribe)).toBe(449);
  });

  it("findBySku del repositorio local", async () => {
    const repo = createLocalCatalog();
    expect((await repo.findBySku("CAR-MEDIDA-CEI-TER"))?.variant.price).toBe(1039);
    expect(await repo.findBySku("NOPE")).toBeNull();
    expect(await repo.getProduct("../etc/passwd")).toBeNull();
  });
});

describe("configurador: solo combinaciones existentes", () => {
  it("la selección inicial es una variante en stock", () => {
    const sel = initialSelection(cafetal);
    expect(findVariant(cafetal, sel)?.inStock).toBe(true);
  });

  it("cambiar una opción mantiene una variante válida", () => {
    let sel = initialSelection(cafetal);
    for (const o of cafetal.options) {
      for (const value of o.values) {
        sel = resolveSelection(cafetal, sel, o.name, value);
        expect(findVariant(cafetal, sel)).toBeDefined();
        expect(sel[o.name]).toBe(value);
      }
    }
  });

  it("si la combinación exacta no existe, salta a la más parecida", () => {
    const sparse: Product = {
      ...cafetal,
      variants: [
        { sku: "A-1", options: { Medida: "90×190", Núcleo: "Brisa", Funda: "Algodón Tolima" }, price: 1, currency: "EUR", inStock: true },
        { sku: "A-2", options: { Medida: "160×200", Núcleo: "Ceiba+", Funda: "Algodón Tolima" }, price: 2, currency: "EUR", inStock: true },
      ],
    };
    const sel = resolveSelection(sparse, { Medida: "90×190", Núcleo: "Brisa", Funda: "Algodón Tolima" }, "Medida", "160×200");
    expect(findVariant(sparse, sel)?.sku).toBe("A-2");
    expect(valueState(sparse, sel, "Medida", "135×190")).toBe("missing");
    // un valor sin ninguna variante no cambia la selección
    expect(resolveSelection(sparse, sel, "Medida", "135×190")).toEqual(sel);
  });

  it("marca como agotada la combinación sin stock", () => {
    const sel = { Medida: "90×190", Núcleo: "Ceiba+", Funda: "Algodón Tolima" };
    expect(valueState(cafetal, sel, "Funda", "Térmica Páramo")).toBe("out");
    expect(valueState(cafetal, sel, "Funda", "Algodón Tolima")).toBe("ok");
  });
});

describe("cálculo de importes en servidor", () => {
  it("subtotal = Σ precio de catálogo × cantidad (en céntimos)", async () => {
    const lines = await priceCart(
      { items: [{ sku: "CAF-090190-BRI-ALG", quantity: 2 }, { sku: "CAR-135190-CEI-ALG", quantity: 1 }] },
      createLocalCatalog(),
    );
    const total = lines.reduce((s, l) => s + l.unitAmount * l.quantity, 0);
    expect(total).toBe(349_00 * 2 + 599_00);
  });
});
