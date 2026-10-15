// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import raw from "../../../data/catalog.json";
import { catalogSchema } from "@/lib/catalog/types";

vi.mock("@/components/auth/AuthProvider", () => ({
  useAuth: () => ({ user: null, loading: false, configured: true, getToken: async () => null }),
}));
vi.mock("next/navigation", () => ({ usePathname: () => "/productos/colchon-caribe" }));
vi.mock("next/image", () => ({
  // eslint-disable-next-line @next/next/no-img-element
  default: (props: Record<string, unknown>) => <img src={String(props.src)} alt={String(props.alt ?? "")} />,
}));

const { ProductConfigurator, ADD_TIMINGS } = await import("@/components/product/ProductConfigurator");
const { CartDrawer } = await import("@/components/cart/CartDrawer");
const { useCart } = await import("@/lib/cart/store");
const { useCartDrawer } = await import("@/lib/cart/drawer");

const caribe = catalogSchema.parse(raw).products.find((p) => p.slug === "colchon-caribe")!;

function renderPage() {
  return render(
    <>
      <ProductConfigurator product={caribe} />
      <CartDrawer />
    </>,
  );
}

const mainAdd = () => screen.getAllByRole("button", { name: /Añadir al carrito/ })[0];
const dialog = () => screen.getByRole("dialog", { hidden: true });

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  useCart.setState({ lines: [] });
  useCartDrawer.setState({ open: false, lastSku: null });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  delete document.documentElement.dataset.buybar;
});

describe("Añadir al carrito y mini-carrito", () => {
  it("pasa por cargando → añadido → reposo y abre el drawer con el producto", async () => {
    renderPage();
    expect(dialog().closest(".drawer-root")?.getAttribute("data-open")).toBe("false");

    fireEvent.click(mainAdd());
    expect(screen.getAllByText("Añadiendo…").length).toBeGreaterThan(0);
    expect(useCart.getState().lines).toHaveLength(0);

    await act(async () => vi.advanceTimersByTime(ADD_TIMINGS.loading));
    expect(useCart.getState().lines).toHaveLength(1);
    expect(screen.getAllByText("Añadido").length).toBeGreaterThan(0);

    const root = dialog().closest(".drawer-root")!;
    expect(root.getAttribute("data-open")).toBe("true");
    expect(screen.getByRole("dialog", { name: "Añadido al carrito" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Ver carrito/ }).getAttribute("href")).toBe("/carrito");
    // Sin sesión, el pago lleva a iniciar sesión.
    expect(screen.getByRole("link", { name: /Inicia sesión para pagar/ }).getAttribute("href")).toBe("/login?next=/carrito");

    await act(async () => vi.advanceTimersByTime(ADD_TIMINGS.done));
    expect(mainAdd()).toBeTruthy();
  });

  it("Escape cierra el drawer y el foco queda atrapado dentro mientras está abierto", async () => {
    renderPage();
    fireEvent.click(mainAdd());
    await act(async () => vi.advanceTimersByTime(ADD_TIMINGS.loading + 20));

    const panel = screen.getByRole("dialog", { name: "Añadido al carrito" });
    const focusables = Array.from(panel.querySelectorAll<HTMLElement>("a[href], button:not([disabled])"));
    const first = focusables[0];
    const last = focusables[focusables.length - 1];

    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(first);
    first.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);

    fireEvent.keyDown(document, { key: "Escape" });
    expect(useCartDrawer.getState().open).toBe(false);
    expect(panel.closest(".drawer-root")?.getAttribute("data-open")).toBe("false");
  });

  it("el botón de cerrar y el fondo cierran el drawer", async () => {
    renderPage();
    act(() => useCartDrawer.getState().show());
    fireEvent.click(screen.getByRole("button", { name: "Cerrar el carrito", hidden: true }));
    expect(useCartDrawer.getState().open).toBe(false);
  });
});

describe("Barra fija de compra en móvil", () => {
  it("aparece cuando el botón principal queda por encima de la pantalla", async () => {
    renderPage();
    const bar = document.querySelector(".buybar")!;
    expect(bar.getAttribute("data-show")).toBe("false");

    const btn = mainAdd();
    btn.getBoundingClientRect = () => ({ top: -120, bottom: -60, left: 0, right: 0, width: 0, height: 0, x: 0, y: 0, toJSON() {} });
    await act(async () => {
      fireEvent.scroll(window);
      vi.advanceTimersByTime(50);
    });
    expect(bar.getAttribute("data-show")).toBe("true");
    expect(document.documentElement.dataset.buybar).toBe("true");

    // Su botón también añade al carrito.
    fireEvent.click(bar.querySelector("button")!);
    await act(async () => vi.advanceTimersByTime(ADD_TIMINGS.loading));
    expect(useCart.getState().lines).toHaveLength(1);
  });
});
