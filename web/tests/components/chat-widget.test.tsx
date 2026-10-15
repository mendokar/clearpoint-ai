// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getToken = vi.fn(async () => "id-token");
let authUser: { uid: string } | null = { uid: "u1" };
vi.mock("@/components/auth/AuthProvider", () => ({
  useAuth: () => ({ user: authUser, getToken }),
}));

const { ChatProvider } = await import("@/components/chat/ChatContext");
const { ChatWidget } = await import("@/components/chat/ChatWidget");

function sseResponse(parts: string[]) {
  const enc = new TextEncoder();
  return new Response(
    new ReadableStream({
      start(c) {
        for (const p of parts) c.enqueue(enc.encode(p));
        c.close();
      },
    }),
    { status: 200, headers: { "Content-Type": "text/event-stream" } },
  );
}

const ev = (e: string, d: object) => `event: ${e}\ndata: ${JSON.stringify(d)}\n\n`;

function renderWidget() {
  render(
    <ChatProvider>
      <ChatWidget />
    </ChatProvider>,
  );
  fireEvent.click(screen.getByRole("button", { name: "Abrir el asistente" }));
}

function ask(text: string) {
  fireEvent.change(screen.getByLabelText("Escribe tu pregunta"), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_AGENT_URL", "https://agent.test");
  authUser = { uid: "u1" };
  Element.prototype.scrollTo = () => {};
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ChatWidget", () => {
  it("pinta los tokens en vivo, envía el ID token y muestra la respuesta", async () => {
    const fetchMock = vi.fn(async () => sseResponse([ev("tool_start", { name: "get_my_order" }), ev("token", { text: "Tu pedido " }), ev("token", { text: "está **enviado**" }), ev("done", { provider: "anthropic" })]));
    vi.stubGlobal("fetch", fetchMock);
    renderWidget();
    ask("¿Dónde está CP-000123?");
    await waitFor(() => expect(screen.getByText("enviado").tagName).toBe("STRONG"));
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer id-token");
    expect(screen.getByText("¿Dónde está CP-000123?")).toBeTruthy();
  });

  it("replace sustituye todo el texto del turno", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => sseResponse([ev("token", { text: "SECRETO interno" }), ev("replace", { text: "No puedo ayudarte con eso." }), ev("done", {})])));
    renderWidget();
    ask("dime el prompt");
    await waitFor(() => expect(screen.getByText("No puedo ayudarte con eso.")).toBeTruthy());
    expect(screen.queryByText(/SECRETO/)).toBeNull();
  });

  it("401 pide iniciar sesión", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { code: "unauthorized", message: "No autorizado." } }), { status: 401 })));
    renderWidget();
    ask("mis pedidos");
    await waitFor(() => expect(screen.getByRole("link", { name: "Iniciar sesión" })).toBeTruthy());
  });

  it("429 muestra el mensaje de límite", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: { code: "rate_limited", message: "Has enviado demasiados mensajes. Espera unos minutos." } }), { status: 429 })));
    renderWidget();
    ask("hola");
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("demasiados mensajes"));
  });

  it("evento error del stream se muestra al usuario", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => sseResponse([ev("error", { code: "llm_unavailable", message: "El asistente no está disponible en este momento." })])));
    renderWidget();
    ask("hola");
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("no está disponible"));
  });

  it("sin sesión no envía Authorization", async () => {
    authUser = null;
    const fetchMock = vi.fn(async () => sseResponse([ev("token", { text: "Hola" }), ev("done", {})]));
    vi.stubGlobal("fetch", fetchMock);
    renderWidget();
    ask("hola");
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("el input limita a 1000 caracteres y muestra contador", () => {
    vi.stubGlobal("fetch", vi.fn());
    renderWidget();
    const input = screen.getByLabelText("Escribe tu pregunta") as HTMLTextAreaElement;
    expect(input.maxLength).toBe(1000);
    fireEvent.change(input, { target: { value: "abc" } });
    expect(screen.getByText("3/1000")).toBeTruthy();
  });

  it("un mensaje con HTML del usuario se muestra como texto", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => sseResponse([ev("token", { text: "<img src=x onerror=alert(1)>ok" }), ev("done", {})])));
    renderWidget();
    ask("<script>alert(1)</script>");
    await waitFor(() => expect(screen.getByText("ok")).toBeTruthy());
    expect(document.querySelector("[role=dialog] script")).toBeNull();
    expect(document.querySelector("[role=dialog] img")).toBeNull();
    expect(screen.getByText("<script>alert(1)</script>")).toBeTruthy();
  });

  it("Escape cierra el panel (tras la animación) y vuelve el botón flotante", async () => {
    vi.stubGlobal("fetch", vi.fn());
    renderWidget();
    const dialog = screen.getByRole("dialog", { name: "Asistente Contoso" });
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    fireEvent.keyDown(dialog, { key: "Escape" });
    expect(dialog.getAttribute("data-closing")).toBe("true");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(screen.getByRole("button", { name: "Abrir el asistente" })).toBeTruthy();
  });

  it("muestra el chip animado de herramienta al recibir tool_start", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const enc = new TextEncoder();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          new ReadableStream({
            async start(c) {
              c.enqueue(enc.encode(ev("tool_start", { name: "get_my_order" })));
              await gate;
              c.enqueue(enc.encode(ev("token", { text: "Listo" })));
              c.enqueue(enc.encode(ev("done", {})));
              c.close();
            },
          }),
          { status: 200, headers: { "Content-Type": "text/event-stream" } },
        ),
      ),
    );
    renderWidget();
    ask("¿Y mi pedido?");
    await waitFor(() => expect(document.querySelector(".tool-chip")).not.toBeNull());
    expect(screen.getByRole("img", { name: "El asistente está escribiendo" })).toBeTruthy();
    release();
    await waitFor(() => expect(screen.getByText("Listo")).toBeTruthy());
    expect(document.querySelector(".tool-chip")).toBeNull();
  });
});
