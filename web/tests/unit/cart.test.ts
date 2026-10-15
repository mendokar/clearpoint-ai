// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const line = {
  sku: "CAF-090190-BRI-ALG",
  slug: "colchon-cafetal",
  name: "Colchón Cafetal",
  options: { Medida: "90×190", Núcleo: "Brisa", Funda: "Algodón Tolima" },
  unitPrice: 349,
};
const other = { ...line, sku: "CAR-135190-CEI-ALG", slug: "colchon-caribe", name: "Colchón Caribe", unitPrice: 599.5 };

async function freshStore() {
  vi.resetModules();
  return import("@/lib/cart/store");
}

beforeEach(() => localStorage.clear());

describe("carrito (Zustand)", () => {
  it("añade, fusiona la misma variante, cambia cantidad y elimina", async () => {
    const { useCart, cartCount, cartSubtotal } = await freshStore();
    const s = () => useCart.getState();
    s().add(line);
    s().add(line, 2);
    expect(s().lines).toHaveLength(1);
    expect(s().lines[0].quantity).toBe(3);
    s().add(other);
    expect(cartCount(s().lines)).toBe(4);
    expect(cartSubtotal(s().lines)).toBe(349 * 3 + 599.5);
    s().setQuantity(line.sku, 1);
    expect(s().lines[0].quantity).toBe(1);
    s().remove(line.sku);
    expect(s().lines.map((l) => l.sku)).toEqual([other.sku]);
    s().clear();
    expect(s().lines).toEqual([]);
  });

  it("acota la cantidad entre 1 y 10", async () => {
    const { useCart, MAX_QTY_PER_LINE } = await freshStore();
    const s = () => useCart.getState();
    s().add(line, 50);
    expect(s().lines[0].quantity).toBe(MAX_QTY_PER_LINE);
    s().setQuantity(line.sku, 0);
    expect(s().lines[0].quantity).toBe(1);
    s().setQuantity(line.sku, -5);
    expect(s().lines[0].quantity).toBe(1);
    s().setQuantity(line.sku, 2.7);
    expect(s().lines[0].quantity).toBe(2);
  });

  it("persiste en localStorage y se rehidrata", async () => {
    const first = await freshStore();
    first.useCart.getState().add(line, 2);
    expect(JSON.parse(localStorage.getItem("contoso-cart")!).state.lines[0].quantity).toBe(2);

    const second = await freshStore();
    await second.useCart.persist.rehydrate();
    expect(second.useCart.getState().lines[0]).toMatchObject({ sku: line.sku, quantity: 2 });
  });

  it("subtotal sin errores de coma flotante", async () => {
    const { cartSubtotal } = await freshStore();
    expect(cartSubtotal([{ ...line, unitPrice: 0.1, quantity: 3 }])).toBe(0.3);
  });
});
