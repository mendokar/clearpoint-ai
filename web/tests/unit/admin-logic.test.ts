import { describe, expect, it } from "vitest";
import raw from "../../../data/catalog.json";
import {
  formToPayload,
  orphanVariants,
  parsePrice,
  productToForm,
  renameOption,
  renameValue,
} from "@/components/admin/productFormModel";
import { adminProductSchema, isAllowedImageUrl, productActiveSchema } from "@/lib/catalog/admin-schema";
import { productSchema } from "@/lib/catalog/types";
import { buildSku, combinations, generateVariants, skuPart, skuPrefixFromSlug } from "@/lib/catalog/variants";
import { STATUS_LABELS as SCHEMA_LABELS } from "@/lib/schemas";
import {
  allowedNextStatuses,
  canTransition,
  isIsoDate,
  planStatusChange,
  STATUS_LABELS,
  StatusChangeError,
} from "@/lib/orders/status";

const seed = productSchema.parse(raw.products[0]);

describe("esquema de administración", () => {
  it("el producto semilla pasa por el formulario y vuelve como payload válido (ida y vuelta)", () => {
    const parsed = adminProductSchema.safeParse(formToPayload(productToForm(seed)));
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.variants).toHaveLength(20);
    expect(parsed.data.optionDetails["Núcleo"]["Brisa"].alturaCm).toBe(22); // los números siguen siendo números
    // Lo que acepta el panel también lo acepta el lector de la tienda
    expect(productSchema.safeParse(parsed.data).success).toBe(true);
  });

  it.each([
    ["/images/colchon-cafetal-1.jpg", true],
    ["https://images.unsplash.com/photo-1?w=1200", true],
    ["https://firebasestorage.googleapis.com/v0/b/x/o/y.jpg", true],
    ["http://images.unsplash.com/x.jpg", false],
    ["https://evil.example/x.jpg", false],
    ["https://user:pw@images.unsplash.com/x.jpg", false],
    ["/images/../secret.jpg", false],
    ["/images/x.svg", false],
    ["javascript:alert(1)", false],
    ["//images.unsplash.com/x.jpg", false],
  ])("imagen %s → %s", (url, ok) => {
    expect(isAllowedImageUrl(url)).toBe(ok);
  });

  it("rechaza combinaciones repetidas, opciones repetidas e imágenes repetidas", () => {
    const base = formToPayload(productToForm(seed));
    const dupCombo = { ...base, variants: [...base.variants, { ...base.variants[0], sku: "CAF-OTRO-1" }] };
    expect(adminProductSchema.safeParse(dupCombo).success).toBe(false);
    const dupOpt = { ...base, options: [...base.options, base.options[0]] };
    expect(adminProductSchema.safeParse(dupOpt).success).toBe(false);
    const dupImg = { ...base, images: ["/images/a.jpg", "/images/a.jpg"] };
    expect(adminProductSchema.safeParse(dupImg).success).toBe(false);
  });

  it("precio con más de dos decimales → error", () => {
    const base = formToPayload(productToForm(seed));
    base.variants[0].price = 10.123;
    expect(adminProductSchema.safeParse(base).success).toBe(false);
    base.variants[0].price = 10.1;
    expect(adminProductSchema.safeParse(base).success).toBe(true);
  });

  it("PATCH solo acepta { active }", () => {
    expect(productActiveSchema.safeParse({ active: true }).success).toBe(true);
    expect(productActiveSchema.safeParse({ active: true, price: 1 }).success).toBe(false);
  });
});

describe("generador de variantes", () => {
  const options = [
    { name: "Medida", values: ["90×190", "135×190"] },
    { name: "Núcleo", values: ["Brisa", "Ceiba+"] },
  ];

  it("producto cartesiano y SKU legibles", () => {
    expect(combinations(options)).toHaveLength(4);
    expect(skuPart("Algodón Tolima")).toBe("ALGODO");
    expect(skuPart("90×190")).toBe("90190");
    expect(skuPrefixFromSlug("colchon-cafetal")).toBe("CAF");
    expect(buildSku("CAF", { Medida: "90×190", Núcleo: "Ceiba+" }, ["Medida", "Núcleo"])).toBe("CAF-90190-CEIBA");
  });

  it("conserva las existentes, crea las que faltan y separa las huérfanas", () => {
    const existing = [
      { sku: "CAF-A", options: { Medida: "90×190", Núcleo: "Brisa" }, price: 349, currency: "EUR" as const, inStock: false },
      { sku: "CAF-OLD", options: { Medida: "200×200", Núcleo: "Brisa" }, price: 999, currency: "EUR" as const, inStock: true },
    ];
    const r = generateVariants({ options, existing, prefix: "CAF", basePrice: 400 });
    expect(r.variants).toHaveLength(4);
    expect(r.added).toBe(3);
    expect(r.variants[0]).toBe(existing[0]); // misma variante: precio y stock intactos
    expect(r.variants.slice(1).every((v) => v.price === 400 && v.inStock)).toBe(true);
    expect(r.orphaned).toEqual([existing[1]]);
    expect(new Set(r.variants.map((v) => v.sku)).size).toBe(4);
  });

  it("evita colisiones de SKU con las existentes", () => {
    const existing = [{ sku: "CAF-90190-BRISA", options: { Medida: "otro", Núcleo: "x" }, price: 1, currency: "EUR" as const, inStock: true }];
    const r = generateVariants({ options, existing, prefix: "CAF", basePrice: 1 });
    const skus = r.variants.map((v) => v.sku);
    expect(skus).toContain("CAF-90190-BRISA-2");
  });
});

describe("modelo del formulario", () => {
  it("renombrar una opción o un valor actualiza variantes y detalles", () => {
    let f = productToForm(seed);
    f = renameValue(f, 1, 0, "Brisa Pro"); // Núcleo: Brisa → Brisa Pro
    expect(f.variants.filter((v) => v.options["Núcleo"] === "Brisa Pro")).toHaveLength(10);
    expect(f.details["Núcleo"]["Brisa Pro"]).toBeDefined();
    f = renameOption(f, 2, "Tejido");
    expect(f.variants.every((v) => "Tejido" in v.options && !("Funda" in v.options))).toBe(true);
    expect(f.details["Tejido"]).toBeDefined();
    expect(orphanVariants(f)).toEqual([]);
  });

  it("quitar un valor deja variantes huérfanas detectables", () => {
    const f = productToForm(seed);
    f.options[1] = { ...f.options[1], values: ["Brisa"] };
    expect(orphanVariants(f)).toHaveLength(10);
  });

  it("parsePrice acepta coma decimal y rechaza texto", () => {
    expect(parsePrice("499,90")).toBe(499.9);
    expect(parsePrice(" 12 ")).toBe(12);
    expect(parsePrice("abc")).toBeNaN();
    expect(parsePrice("")).toBeNaN();
  });
});

describe("reglas de estado de pedido (compartidas con el script)", () => {
  it("transiciones permitidas", () => {
    expect(allowedNextStatuses("paid")).toEqual(["preparing", "cancelled"]);
    expect(allowedNextStatuses("preparing")).toEqual(["shipped", "cancelled"]);
    expect(allowedNextStatuses("shipped")).toEqual(["delivered"]);
    expect(allowedNextStatuses("delivered")).toEqual([]);
    expect(allowedNextStatuses("cancelled")).toEqual([]);
    expect(canTransition("paid", "shipped")).toBe(false);
  });

  it("los nombres son los de la web (misma fuente que lib/schemas)", () => {
    expect(SCHEMA_LABELS).toBe(STATUS_LABELS);
    expect(Object.values(STATUS_LABELS)).toEqual(["Pagado", "En preparación", "Enviado", "Entregado", "Cancelado"]);
  });

  it("error de transición con nombres en español; force lo permite (script de demo)", () => {
    expect(() => planStatusChange({ status: "delivered" }, { status: "paid" }, new Date())).toThrow(/«Entregado» a «Pagado»/);
    expect(planStatusChange({ status: "delivered" }, { status: "paid" }, new Date(), { force: true }).update.status).toBe("paid");
  });

  it("shipped exige los tres datos y una fecha real", () => {
    const now = new Date("2026-10-15T10:00:00Z");
    expect(() => planStatusChange({ status: "preparing" }, { status: "shipped", carrier: "SEUR" }, now)).toThrow(StatusChangeError);
    const plan = planStatusChange(
      { status: "preparing" },
      { status: "shipped", carrier: " SEUR ", trackingNumber: "SE1", estimatedDelivery: "2026-10-20" },
      now,
    );
    expect(plan.update).toEqual({ status: "shipped", carrier: "SEUR", trackingNumber: "SE1", estimatedDelivery: "2026-10-20" });
    expect(plan.historyEntry).toEqual({ status: "shipped", at: now });
    expect(isIsoDate("2026-02-31")).toBe(false);
  });
});
