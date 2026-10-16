// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/components/auth/AuthProvider", () => ({
  useAuth: () => ({ user: null, loading: false, configured: true, getToken: async () => null }),
}));
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: (props: Record<string, unknown>) => <img src={String(props.src)} alt={String(props.alt ?? "")} />,
}));

const { CartView } = await import("@/components/cart/CartView");
const { Toaster } = await import("@/components/ui/Toaster");
const { useCart } = await import("@/lib/cart/store");
const { useToasts } = await import("@/lib/ui/toast");

const line = {
  sku: "CAF-090190-BRI-ALG",
  slug: "colchon-cafetal",
  name: "Colchón Cafetal",
  options: { Medida: "90×190", Núcleo: "Brisa", Funda: "Algodón Tolima" },
  unitPrice: 349,
  quantity: 1,
};

beforeEach(() => {
  vi.useFakeTimers();
  // La consulta de precios del carrito responde sin cambios en estas pruebas.
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ lines: [] }), { status: 200 })));
  useCart.setState({ lines: [line] });
  useToasts.setState({ toasts: [] });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("CartView", () => {
  it("el stepper cambia la cantidad dentro de 1–10", () => {
    render(<CartView />);
    const less = screen.getByRole("button", { name: "Quitar una unidad" }) as HTMLButtonElement;
    expect(less.disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Añadir una unidad" }));
    expect(useCart.getState().lines[0].quantity).toBe(2);
    fireEvent.click(less);
    expect(useCart.getState().lines[0].quantity).toBe(1);
  });

  it("eliminar anima la salida, avisa con un toast y Deshacer lo recupera", async () => {
    render(
      <>
        <CartView />
        <Toaster />
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: /^Eliminar Colchón Cafetal/ }));
    expect(document.querySelector(".cart-line")?.getAttribute("data-leaving")).toBe("true");
    await act(async () => vi.advanceTimersByTime(300));
    expect(useCart.getState().lines).toHaveLength(0);
    expect(screen.getByText("Tu carrito está vacío")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Deshacer" }));
    expect(useCart.getState().lines).toEqual([line]);
  });
});
