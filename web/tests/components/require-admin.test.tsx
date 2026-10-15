// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const replace = vi.fn();
const getIdTokenResult = vi.fn();
let auth: { user: { uid: string } | null; loading: boolean; configured: boolean };

vi.mock("@/components/auth/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }), usePathname: () => "/admin/pedidos" }));
vi.mock("@/lib/firebase/client", () => ({
  getClientAuth: () => (auth.user ? { currentUser: { uid: auth.user.uid, getIdTokenResult } } : { currentUser: null }),
}));

const { RequireAdmin } = await import("@/components/admin/RequireAdmin");
const { AdminNavLink } = await import("@/components/admin/AdminNavLink");

beforeEach(() => {
  replace.mockReset();
  getIdTokenResult.mockReset();
  auth = { user: { uid: "u1" }, loading: false, configured: true };
});
afterEach(cleanup);

describe("RequireAdmin", () => {
  it("sin sesión redirige al login con next", async () => {
    auth = { user: null, loading: false, configured: true };
    render(<RequireAdmin>secreto</RequireAdmin>);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/login?next=%2Fadmin%2Fpedidos"));
    expect(screen.queryByText("secreto")).toBeNull();
  });

  it("sin claim admin redirige al inicio y no pinta el panel", async () => {
    getIdTokenResult.mockResolvedValue({ claims: {} });
    render(<RequireAdmin>secreto</RequireAdmin>);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
    expect(screen.queryByText("secreto")).toBeNull();
  });

  it("con claim admin refresca el token (getIdTokenResult(true)) y muestra el panel", async () => {
    getIdTokenResult.mockResolvedValue({ claims: { admin: true, email: "admin@contoso.example", email_verified: true } });
    render(<RequireAdmin>secreto</RequireAdmin>);
    expect(await screen.findByText("secreto")).toBeTruthy();
    expect(getIdTokenResult).toHaveBeenCalledWith(true);
    expect(replace).not.toHaveBeenCalled();
  });

  it("claim admin en otra cuenta o sin correo verificado no entra (solo admin@contoso.example)", async () => {
    getIdTokenResult.mockResolvedValue({ claims: { admin: true, email: "otro@example.com", email_verified: true } });
    const { unmount } = render(<RequireAdmin>secreto</RequireAdmin>);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
    expect(screen.queryByText("secreto")).toBeNull();
    unmount();
    replace.mockClear();
    getIdTokenResult.mockResolvedValue({ claims: { admin: true, email: "admin@contoso.example", email_verified: false } });
    render(<RequireAdmin>secreto</RequireAdmin>);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
    expect(screen.queryByText("secreto")).toBeNull();
  });

  it("claim mal tipado (\"true\" como texto) no cuenta", async () => {
    getIdTokenResult.mockResolvedValue({ claims: { admin: "true" } });
    render(<RequireAdmin>secreto</RequireAdmin>);
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/"));
  });
});

describe("AdminNavLink", () => {
  it("solo aparece para administradores", async () => {
    getIdTokenResult.mockResolvedValue({ claims: {} });
    const { unmount } = render(<AdminNavLink />);
    await waitFor(() => expect(getIdTokenResult).toHaveBeenCalledWith(false));
    expect(screen.queryByText("Panel de administración")).toBeNull();
    unmount();
    getIdTokenResult.mockResolvedValue({ claims: { admin: true, email: "admin@contoso.example", email_verified: true } });
    render(<AdminNavLink />);
    expect((await screen.findByText("Panel de administración")).getAttribute("href")).toBe("/admin");
  });
});
