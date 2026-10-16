// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { uid: "u1" }, loading: false, configured: true, getToken: async () => "tok" }),
}));
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: (props: Record<string, unknown>) => <img src={String(props.src)} alt={String(props.alt ?? "")} />,
}));

const { CartView } = await import("@/components/cart/CartView");
const { useCart } = await import("@/lib/cart/store");

const cafetal = {
  sku: "CAF-090190-BRI-ALG",
  slug: "colchon-cafetal",
  name: "Colchón Cafetal",
  options: { Medida: "90×190", Núcleo: "Brisa", Funda: "Algodón Tolima" },
  unitPrice: 123,
  quantity: 1,
};
const caribe = { ...cafetal, sku: "CAR-135190-BRI-ALG", slug: "colchon-caribe", name: "Colchón Caribe", unitPrice: 449 };

const quote = (lines: unknown[]) =>
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ lines }), { status: 200 })));

beforeEach(() => useCart.setState({ lines: [cafetal, caribe] }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("carrito con precios y disponibilidad del servidor (QA)", () => {
  it("actualiza un precio cambiado en el panel y lo avisa", async () => {
    quote([
      { sku: cafetal.sku, status: "ok", unitPrice: 150, name: "Colchón Cafetal" },
      { sku: caribe.sku, status: "ok", unitPrice: 449, name: "Colchón Caribe" },
    ]);
    render(<CartView />);
    expect(await screen.findByText("Precios actualizados")).toBeTruthy();
    await waitFor(() => expect(useCart.getState().lines.find((l) => l.sku === cafetal.sku)?.unitPrice).toBe(150));
    expect(screen.getByText(/123,00\s€ → 150,00\s€/)).toBeTruthy();
  });

  it("marca el producto desactivado, no lo suma y bloquea el pago diciendo cuál es", async () => {
    quote([
      { sku: cafetal.sku, status: "unavailable" },
      { sku: caribe.sku, status: "ok", unitPrice: 449, name: "Colchón Caribe" },
    ]);
    render(<CartView />);
    expect(await screen.findByText("Ya no está a la venta")).toBeTruthy();
    expect(screen.getByText(/Quita Colchón Cafetal para poder pagar/)).toBeTruthy();
    const pay = screen.getByRole("button", { name: /Pagar con tarjeta/ }) as HTMLButtonElement;
    expect(pay.disabled).toBe(true);
    expect(useCart.getState().lines.find((l) => l.sku === cafetal.sku)?.availability).toBe("unavailable");
  });
});
