import { describe, expect, it, vi } from "vitest";
import { ChatError, parseSseBlock, prepareHistory, readSse, streamChat, type ChatEvent } from "@/lib/chat/client";

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(c) {
      for (const ch of chunks) c.enqueue(enc.encode(ch));
      c.close();
    },
  });
}

async function collect(gen: AsyncGenerator<ChatEvent>) {
  const out: ChatEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

const sse = (event: string, data: object) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

describe("parseo SSE", () => {
  it("parsea los cinco tipos de evento del contrato", () => {
    expect(parseSseBlock('event: token\ndata: {"text":"Ho"}')).toEqual({ type: "token", text: "Ho" });
    expect(parseSseBlock('event: tool_start\ndata: {"name":"get_my_order"}')).toEqual({ type: "tool_start", name: "get_my_order" });
    expect(parseSseBlock('event: replace\ndata: {"text":"Texto seguro"}')).toEqual({ type: "replace", text: "Texto seguro" });
    expect(parseSseBlock('event: done\ndata: {"provider":"anthropic"}')).toEqual({ type: "done", provider: "anthropic" });
    expect(parseSseBlock('event: error\ndata: {"code":"llm_unavailable","message":"No disponible"}')).toEqual({
      type: "error",
      code: "llm_unavailable",
      message: "No disponible",
    });
  });

  it("ignora comentarios, eventos desconocidos y JSON roto", () => {
    expect(parseSseBlock(": ping")).toBeNull();
    expect(parseSseBlock('event: otro\ndata: {"x":1}')).toBeNull();
    expect(parseSseBlock("event: token\ndata: {roto")).toBeNull();
  });

  it("reconstruye eventos troceados entre chunks (incluido UTF-8 partido)", async () => {
    const full = sse("token", { text: "Colchón " }) + sse("tool_start", { name: "list_my_orders" }) + sse("token", { text: "listo" }) + sse("done", { provider: "openai" });
    const bytes = new TextEncoder().encode(full);
    // trocea byte a byte en bloques de 7 para partir caracteres multibyte y separadores
    const enc = new ReadableStream<Uint8Array>({
      start(c) {
        for (let i = 0; i < bytes.length; i += 7) c.enqueue(bytes.slice(i, i + 7));
        c.close();
      },
    });
    expect(await collect(readSse(enc))).toEqual([
      { type: "token", text: "Colchón " },
      { type: "tool_start", name: "list_my_orders" },
      { type: "token", text: "listo" },
      { type: "done", provider: "openai" },
    ]);
  });

  it("acepta CRLF y un último evento sin línea en blanco final", async () => {
    const events = await collect(readSse(streamOf(['event: token\r\ndata: {"text":"a"}\r\n\r\n', 'event: done\ndata: {"provider":null}'])));
    expect(events).toEqual([
      { type: "token", text: "a" },
      { type: "done", provider: null },
    ]);
  });
});

describe("streamChat", () => {
  const ok = (body: string) =>
    vi.fn(async () => new Response(streamOf([body]), { status: 200, headers: { "Content-Type": "text/event-stream" } }));

  it("envía Authorization si hay token y solo los últimos 20 mensajes", async () => {
    const fetchImpl = ok(sse("done", { provider: "anthropic" }));
    const messages = Array.from({ length: 30 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: `m${i}` }) as const);
    await collect(await streamChat({ messages, token: "tok", fetchImpl, baseUrl: "https://agent.test" }));
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://agent.test/chat");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
    const body = JSON.parse(init.body as string);
    expect(body.messages).toHaveLength(20);
    expect(Object.keys(body)).toEqual(["messages"]);
  });

  it("sin sesión no envía Authorization", async () => {
    const fetchImpl = ok(sse("done", {}));
    await streamChat({ messages: [{ role: "user", content: "hola" }], fetchImpl, baseUrl: "https://agent.test" });
    const init = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it("emite replace y error del stream", async () => {
    const fetchImpl = ok(sse("token", { text: "dato interno" }) + sse("replace", { text: "No puedo compartir eso." }) + sse("error", { code: "llm_unavailable", message: "Caído" }));
    const events = await collect(await streamChat({ messages: [{ role: "user", content: "x" }], fetchImpl, baseUrl: "https://a" }));
    expect(events.map((e) => e.type)).toEqual(["token", "replace", "error"]);
  });

  const statusCase = (status: number, body: object, headers: Record<string, string> = {}) =>
    vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } }));

  it.each([
    [401, "unauthorized", { error: { code: "unauthorized", message: "No autorizado." } }],
    [429, "rate_limited", { error: { code: "rate_limited", message: "Has enviado demasiados mensajes. Espera unos minutos." } }],
    [400, "invalid", { error: { code: "message_too_long", message: "El mensaje supera el máximo de 1000 caracteres." } }],
    [422, "invalid", { error: { code: "invalid_request", message: "La petición no es válida." } }],
    [503, "unavailable", { error: { code: "llm_unavailable", message: "El asistente no está disponible en este momento." } }],
    [500, "unavailable", { error: { code: "internal_error", message: "Ha ocurrido un error inesperado." } }],
  ])("HTTP %i → ChatError %s", async (status, kind, body) => {
    const fetchImpl = statusCase(status, body, status === 429 ? { "Retry-After": "600" } : {});
    const err = await streamChat({ messages: [{ role: "user", content: "x" }], fetchImpl, baseUrl: "https://a" }).catch((e) => e);
    expect(err).toBeInstanceOf(ChatError);
    expect(err.kind).toBe(kind);
    if (status === 429) expect(err.retryAfter).toBe(600);
    if (status !== 401) expect(err.message).toBe(body.error.message);
  });

  it("error de red → ChatError network", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    const err = await streamChat({ messages: [{ role: "user", content: "x" }], fetchImpl, baseUrl: "https://a" }).catch((e) => e);
    expect(err.kind).toBe("network");
  });

  it("sin NEXT_PUBLIC_AGENT_URL → not_configured", async () => {
    const err = await streamChat({ messages: [{ role: "user", content: "x" }], baseUrl: null }).catch((e) => e);
    expect(err.kind).toBe("not_configured");
  });

  it("prepareHistory quita vacíos y recorta respuestas largas del asistente", () => {
    const h = prepareHistory([
      { role: "user", content: "hola" },
      { role: "assistant", content: "" },
      { role: "assistant", content: "x".repeat(5000) },
    ]);
    expect(h).toHaveLength(2);
    expect(h[1].content).toHaveLength(4000);
  });
});
