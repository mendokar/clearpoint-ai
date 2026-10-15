// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const clear = vi.fn();
const fetchMyOrder = vi.fn();
let sessionId = "cs_test_inventado789";

vi.mock("next/navigation", () => ({ useSearchParams: () => new URLSearchParams({ session_id: sessionId }) }));
vi.mock("@/components/auth/AuthProvider", () => ({
  useAuth: () => ({ user: { uid: "u1" }, loading: false, getToken: async () => "tok" }),
}));
vi.mock("@/lib/cart/store", async (orig) => ({
  ...(await orig<typeof import("@/lib/cart/store")>()),
  useCart: (sel: (s: { clear: () => void }) => unknown) => sel({ clear }),
}));
vi.mock("@/lib/orders/client", () => ({ fetchMyOrder: (id: string) => fetchMyOrder(id) }));

const { CheckoutSuccess } = await import("@/components/orders/CheckoutSuccess");

const mockStatus = (status: string) =>
  vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ status }), { status: 200 })));

beforeEach(() => {
  clear.mockReset();
  fetchMyOrder.mockReset();
  fetchMyOrder.mockResolvedValue(null);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("CheckoutSuccess", () => {
  it("con un session_id inventado no confirma el pago, no vacía el carrito ni busca el pedido", async () => {
    mockStatus("not_found");
    render(<CheckoutSuccess />);
    expect(await screen.findByText("No encontramos este pago")).toBeTruthy();
    expect(screen.queryByText(/se ha completado/)).toBeNull();
    expect(clear).not.toHaveBeenCalled();
    expect(fetchMyOrder).not.toHaveBeenCalled();
  });

  it("si Stripe dice que no se pagó, lo indica y conserva el carrito", async () => {
    mockStatus("unpaid");
    render(<CheckoutSuccess />);
    expect(await screen.findByText("El pago no se completó")).toBeTruthy();
    expect(clear).not.toHaveBeenCalled();
  });

  it("con pago confirmado vacía el carrito y muestra el pedido cuando el webhook lo guarda", async () => {
    sessionId = "cs_test_real123";
    mockStatus("paid");
    fetchMyOrder.mockResolvedValue({ id: "cs_test_real123", orderNumber: "CP-000130", total: 449, currency: "EUR", email: "ana@example.com" });
    render(<CheckoutSuccess />);
    expect(await screen.findByText("CP-000130")).toBeTruthy();
    await waitFor(() => expect(clear).toHaveBeenCalled());
  });
});
