/**
 * Cliente del asistente (único módulo que conoce el contrato SSE del agente).
 *
 * Petición: POST ${NEXT_PUBLIC_AGENT_URL}/chat
 *   body {messages: [{role: "user" | "assistant", content}]}
 *   Authorization: Bearer <Firebase ID token> (opcional; sin él no hay tools de pedidos)
 * Respuesta: text/event-stream con eventos
 *   token      {text}            fragmento de texto a concatenar
 *   tool_start {name}            el agente consulta una tool
 *   replace    {text}            sustituye el texto completo (filtro de salida)
 *   done       {provider}        fin; proveedor LLM usado
 *   error      {code?, message}  error durante el stream
 * Errores HTTP antes del stream: JSON {error: {code, message}}
 *   400 message_too_long|empty · 401 unauthorized · 422 invalid_request
 *   429 rate_limited (Retry-After) · 503 llm_unavailable|auth_unavailable · 500 internal_error
 * Contrato definitivo: agent/README.md ("Contrato de /chat y eventos SSE").
 */

export type ChatRole = "user" | "assistant";
export type ChatMessage = { role: ChatRole; content: string };

export type ChatEvent =
  | { type: "token"; text: string }
  | { type: "tool_start"; name: string }
  | { type: "replace"; text: string }
  | { type: "done"; provider: string | null }
  | { type: "error"; code?: string; message: string };

export type ChatErrorKind = "unauthorized" | "rate_limited" | "network" | "unavailable" | "invalid" | "not_configured";

export class ChatError extends Error {
  constructor(
    public kind: ChatErrorKind,
    message: string,
    public retryAfter?: number,
  ) {
    super(message);
  }
}

export const MAX_USER_CHARS = 1000;
export const MAX_ASSISTANT_CHARS = 4000;
export const MAX_HISTORY = 20;

/** Ajusta el historial a los límites del agente: últimos 20 mensajes, sin vacíos, asistente ≤ 4000. */
export function prepareHistory(messages: ChatMessage[]): ChatMessage[] {
  return messages
    .filter((m) => m.content.trim())
    .map((m) => (m.role === "assistant" ? { ...m, content: m.content.slice(0, MAX_ASSISTANT_CHARS) } : m))
    .slice(-MAX_HISTORY);
}

export function agentUrl(): string | null {
  const url = process.env.NEXT_PUBLIC_AGENT_URL?.replace(/\/+$/, "");
  return url || null;
}

/** Convierte un bloque SSE ("event: x\ndata: {...}") en un evento tipado. */
export function parseSseBlock(block: string): ChatEvent | null {
  let event = "message";
  const dataLines: string[] = [];
  for (const rawLine of block.split("\n")) {
    const line = rawLine.replace(/\r$/, "");
    if (!line || line.startsWith(":")) continue;
    const idx = line.indexOf(":");
    const field = idx === -1 ? line : line.slice(0, idx);
    const value = idx === -1 ? "" : line.slice(idx + 1).replace(/^ /, "");
    if (field === "event") event = value;
    else if (field === "data") dataLines.push(value);
  }
  if (!dataLines.length) return null;
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(dataLines.join("\n")) as Record<string, unknown>;
  } catch {
    return null;
  }
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  switch (event) {
    case "token":
      return { type: "token", text: str(data.text) };
    case "tool_start":
      return { type: "tool_start", name: str(data.name) };
    case "replace":
      return { type: "replace", text: str(data.text) };
    case "done":
      return { type: "done", provider: typeof data.provider === "string" ? data.provider : null };
    case "error":
      return {
        type: "error",
        code: str(data.code) || undefined,
        message: str(data.message) || "El asistente no está disponible en este momento.",
      };
    default:
      return null;
  }
}

/** Lee un ReadableStream SSE y emite eventos, tolerando bloques partidos entre chunks. */
export async function* readSse(stream: ReadableStream<Uint8Array>): AsyncGenerator<ChatEvent> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      let sep: number;
      while ((sep = buffer.indexOf("\n\n")) !== -1) {
        const block = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);
        const evt = parseSseBlock(block);
        if (evt) yield evt;
      }
    }
    buffer += decoder.decode();
    if (buffer.trim()) {
      const evt = parseSseBlock(buffer);
      if (evt) yield evt;
    }
  } finally {
    reader.releaseLock();
  }
}

async function errorMessage(res: Response): Promise<string | null> {
  try {
    const body = (await res.json()) as { error?: { message?: string } | string; detail?: string };
    if (typeof body.error === "string") return body.error;
    return body.error?.message ?? body.detail ?? null;
  } catch {
    return null;
  }
}

/** Envía la conversación y devuelve el iterador de eventos. Lanza ChatError en errores HTTP o de red. */
export async function streamChat(args: {
  messages: ChatMessage[];
  token?: string | null;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  baseUrl?: string | null;
}): Promise<AsyncGenerator<ChatEvent>> {
  const base = args.baseUrl === undefined ? agentUrl() : args.baseUrl;
  if (!base) throw new ChatError("not_configured", "El asistente no está configurado en este entorno.");
  const doFetch = args.fetchImpl ?? fetch;

  const headers: Record<string, string> = { "Content-Type": "application/json", Accept: "text/event-stream" };
  if (args.token) headers.Authorization = `Bearer ${args.token}`;

  let res: Response;
  try {
    res = await doFetch(`${base}/chat`, {
      method: "POST",
      headers,
      body: JSON.stringify({ messages: prepareHistory(args.messages) }),
      signal: args.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ChatError("network", "No hemos podido conectar con el asistente. Revisa tu conexión.");
  }

  if (res.status === 401) {
    throw new ChatError("unauthorized", "Tu sesión ha caducado. Inicia sesión de nuevo para consultar tus pedidos.");
  }
  if (res.status === 429) {
    const retry = Number(res.headers.get("Retry-After")) || undefined;
    throw new ChatError(
      "rate_limited",
      (await errorMessage(res)) ?? "Has enviado demasiados mensajes. Espera unos minutos.",
      retry,
    );
  }
  if (res.status === 400 || res.status === 422) {
    throw new ChatError("invalid", (await errorMessage(res)) ?? "El mensaje no es válido.");
  }
  if (!res.ok || !res.body) {
    throw new ChatError("unavailable", (await errorMessage(res)) ?? "El asistente no está disponible en este momento.");
  }
  return readSse(res.body);
}

/** Etiquetas en español para las tools del agente. */
export const TOOL_LABELS: Record<string, string> = {
  list_products: "Consultando el catálogo",
  get_product: "Consultando el colchón",
  get_shipping_policy: "Revisando la política de envíos",
  list_my_orders: "Buscando tus pedidos",
  get_my_order: "Consultando tu pedido",
};
