import { describe, expect, it, vi } from "vitest";
import { useCart } from "@/lib/cart/store";
import { cartSubtotal } from "@/lib/cart/store";

vi.mock("@/lib/catalog/repository", async (orig) => {
  const mod = await orig<typeof import("@/lib/catalog/repository")>();
  const local = mod.createLocalCatalog();
  return { ...mod, getCatalog: () => local };
});
const { POST } = await import("@/app/api/cart/quote/route");

const req = (body: unknown) =>
  new Request("http://localhost:3000/api/cart/quote", { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) });

describe("POST /api/cart/quote", () => {
  it("devuelve precio actual, agotado y retirado sin exigir sesión", async () => {
    const res = await POST(req({ skus: ["CAF-090190-BRI-ALG", "NO-EXISTE-123"] }));
    expect(res.status).toBe(200);
    const { lines } = (await res.json()) as { lines: { sku: string; status: string; unitPrice?: number }[] };
    const ok = lines.find((l) => l.sku === "CAF-090190-BRI-ALG")!;
    expect(["ok", "out_of_stock"]).toContain(ok.status);
    expect(typeof ok.unitPrice).toBe("number");
    expect(lines.find((l) => l.sku === "NO-EXISTE-123")).toEqual({ sku: "NO-EXISTE-123", status: "unavailable" });
  });

  it("rechaza cuerpos no válidos, SKU mal formados y más de 20 líneas", async () => {
    expect((await POST(req("no-json"))).status).toBe(400);
    expect((await POST(req({ skus: ["../../x"] }))).status).toBe(400);
    expect((await POST(req({ skus: Array.from({ length: 21 }, (_, i) => `SKU-${i}AA`) }))).status).toBe(400);
    expect((await POST(req({ skus: ["CAF-090190-BRI-ALG"], price: 1 }))).status).toBe(400);
  });
});

describe("applyQuote", () => {
  it("aplica precios, devuelve los cambios y excluye del total lo que no se puede comprar", () => {
    useCart.setState({
      lines: [
        { sku: "A-001", slug: "a", name: "A", options: {}, unitPrice: 100, quantity: 2 },
        { sku: "B-001", slug: "b", name: "B", options: {}, unitPrice: 50, quantity: 1 },
        { sku: "C-001", slug: "c", name: "C", options: {}, unitPrice: 10, quantity: 1 },
      ],
    });
    const changes = useCart.getState().applyQuote([
      { sku: "A-001", status: "ok", unitPrice: 120 },
      { sku: "B-001", status: "unavailable" },
      { sku: "C-001", status: "out_of_stock", unitPrice: 10 },
    ]);
    expect(changes).toEqual([{ sku: "A-001", name: "A", from: 100, to: 120 }]);
    expect(cartSubtotal(useCart.getState().lines)).toBe(240);
  });
});
