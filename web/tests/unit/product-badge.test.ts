import { describe, expect, it } from "vitest";
import raw from "../../../data/catalog.json";
import { adminProductSchema } from "@/lib/catalog/admin-schema";
import { productSchema } from "@/lib/catalog/types";
import { formToPayload, productToForm } from "@/components/admin/productFormModel";

const caribe = productSchema.parse(raw.products.find((p) => p.slug === "colchon-caribe"));

describe("etiqueta de producto (antes fijada en el código, ahora es un dato)", () => {
  it("viene del catálogo sembrado en Firestore", () => {
    expect(caribe.badge).toEqual({ text: "Más vendido", tone: "destacado" });
    expect(productSchema.parse({ ...caribe, badge: undefined }).badge).toBeNull();
  });

  it("el panel la edita y la quita dejando el texto vacío", () => {
    const form = productToForm(caribe);
    expect(form.badgeText).toBe("Más vendido");
    expect(formToPayload({ ...form, badgeText: "  Oferta  ", badgeTone: "nuevo" }).badge).toEqual({ text: "Oferta", tone: "nuevo" });
    expect(formToPayload({ ...form, badgeText: "   " }).badge).toBeNull();
    expect(adminProductSchema.safeParse(formToPayload(form)).success).toBe(true);
  });

  it("el servidor rechaza etiquetas demasiado largas o con estilos desconocidos", () => {
    const base = formToPayload(productToForm(caribe));
    expect(adminProductSchema.safeParse({ ...base, badge: { text: "x".repeat(25), tone: "destacado" } }).success).toBe(false);
    expect(adminProductSchema.safeParse({ ...base, badge: { text: "Top", tone: "rojo" } }).success).toBe(false);
  });
});
