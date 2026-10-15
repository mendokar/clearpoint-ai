"use client";

import Link from "next/link";
import { useCallback, useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import {
  agentUrl,
  ChatError,
  MAX_USER_CHARS,
  streamChat,
  TOOL_LABELS,
  type ChatMessage,
} from "@/lib/chat/client";
import { ChatMarkdown } from "./ChatMarkdown";
import { useChatUi } from "./ChatContext";

type UiMessage = ChatMessage & { id: number; pending?: boolean };
type Notice = { tone: "error" | "info"; text: string; login?: boolean } | null;

const SUGGESTIONS = [
  "¿Qué colchón me recomiendas si duermo de lado?",
  "¿Cuánto tarda el envío a Baleares?",
  "¿Dónde está mi último pedido?",
];

let nextId = 1;

export function ChatWidget() {
  const { open, setOpen } = useChatUi();
  const { user, getToken } = useAuth();
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [tool, setTool] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const abortRef = useRef<AbortController | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fabRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const configured = Boolean(agentUrl());

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages, tool, notice]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const close = useCallback(() => {
    setOpen(false);
    requestAnimationFrame(() => fabRef.current?.focus());
  }, [setOpen]);

  const send = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content || busy) return;
      if (content.length > MAX_USER_CHARS) {
        setNotice({ tone: "error", text: `El mensaje no puede superar ${MAX_USER_CHARS} caracteres.` });
        return;
      }
      setNotice(null);
      setInput("");
      const history: ChatMessage[] = [
        ...messages.filter((m) => m.content).map(({ role, content }) => ({ role, content })),
        { role: "user", content },
      ];
      const userMsg: UiMessage = { id: nextId++, role: "user", content };
      const botId = nextId++;
      setMessages((m) => [...m, userMsg, { id: botId, role: "assistant", content: "", pending: true }]);
      setBusy(true);
      setTool(null);

      const controller = new AbortController();
      abortRef.current = controller;
      const update = (fn: (prev: string) => string, pending = true) =>
        setMessages((m) => m.map((msg) => (msg.id === botId ? { ...msg, content: fn(msg.content), pending } : msg)));

      try {
        const token = user ? await getToken() : null;
        const events = await streamChat({ messages: history, token, signal: controller.signal });
        for await (const evt of events) {
          if (evt.type === "token") {
            setTool(null);
            update((prev) => prev + evt.text);
          } else if (evt.type === "replace") {
            update(() => evt.text);
          } else if (evt.type === "tool_start") {
            setTool(TOOL_LABELS[evt.name] ?? "Consultando datos de la tienda");
          } else if (evt.type === "error") {
            setNotice({ tone: "error", text: evt.message });
            break;
          } else if (evt.type === "done") {
            break;
          }
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (err instanceof ChatError) {
          setNotice({ tone: "error", text: err.message, login: err.kind === "unauthorized" });
        } else {
          setNotice({ tone: "error", text: "Algo ha fallado con el asistente. Inténtalo de nuevo." });
        }
      } finally {
        setMessages((m) =>
          m
            .map((msg) => (msg.id === botId ? { ...msg, pending: false } : msg))
            .filter((msg) => !(msg.id === botId && !msg.content)),
        );
        setTool(null);
        setBusy(false);
        abortRef.current = null;
      }
    },
    [busy, messages, user, getToken],
  );

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void send(input);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  };

  return (
    <>
      {!open && (
        <button ref={fabRef} className="fab" type="button" aria-label="Abrir el asistente" onClick={() => setOpen(true)}>
          <i aria-hidden="true" />
          ¿Te ayudo?
        </button>
      )}
      {open && (
        <div
          role="dialog"
          aria-modal="false"
          aria-labelledby={titleId}
          onKeyDown={(e) => e.key === "Escape" && close()}
          className="fixed inset-0 z-40 flex flex-col bg-surface sm:inset-auto sm:right-5 sm:bottom-5 sm:h-[min(640px,calc(100dvh-40px))] sm:w-[400px] sm:rounded-[20px] sm:border sm:border-line sm:shadow-[0_18px_48px_rgba(44,27,18,.28)]"
        >
          <div className="wayuu shrink-0 sm:rounded-t-[20px]" role="presentation" />
          <header className="flex items-center gap-3 border-b border-line px-4 py-3">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-aji text-on-accent" aria-hidden="true">
              <i className="block h-2.5 w-2.5 rounded-full bg-on-accent" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 id={titleId} className="text-lg font-semibold">
                Asistente Contoso
              </h2>
              <p className="truncate text-xs text-muted">
                {user ? "Puedo consultar tus pedidos" : "Inicia sesión para preguntar por tus pedidos"}
              </p>
            </div>
            <button type="button" onClick={close} className="icon-btn" aria-label="Cerrar el asistente">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </header>

          <div ref={listRef} className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 py-4 text-[.95rem]" aria-live="polite">
            {!configured && (
              <p className="rounded-card border border-panela bg-tint px-3 py-2 text-sm">
                El asistente no está configurado en este entorno (falta NEXT_PUBLIC_AGENT_URL).
              </p>
            )}
            {messages.length === 0 && (
              <div className="flex flex-col gap-3">
                <p className="max-w-[88%] self-start rounded-[14px] rounded-bl-[4px] bg-tint px-4 py-3">
                  ¡Hola! Te ayudo a elegir colchón, con envíos y devoluciones y, si inicias sesión, con tus pedidos.
                </p>
                <p className="mono text-xs tracking-widest text-muted uppercase">Prueba con</p>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      type="button"
                      disabled={!configured || busy}
                      onClick={() => void send(s)}
                      className="rounded-full border border-line bg-bg px-3 py-1.5 text-left text-sm hover:border-aji"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m) =>
              m.role === "user" ? (
                <div
                  key={m.id}
                  className="max-w-[88%] self-end rounded-[14px] rounded-br-[4px] bg-ink px-4 py-2.5 whitespace-pre-wrap text-bg"
                >
                  <span className="sr-only">Tú: </span>
                  {m.content}
                </div>
              ) : (
                <div key={m.id} className="max-w-[88%] self-start rounded-[14px] rounded-bl-[4px] bg-tint px-4 py-2.5">
                  <span className="sr-only">Asistente: </span>
                  {m.content ? <ChatMarkdown text={m.content} /> : <TypingDots />}
                </div>
              ),
            )}
            {tool && (
              <p className="mono flex items-center gap-2 self-start text-xs text-muted" role="status">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-panela" aria-hidden="true" />
                {tool}…
              </p>
            )}
            {notice && (
              <div role="alert" className="rounded-card border border-danger bg-surface px-3 py-2 text-sm">
                {notice.text}
                {notice.login && (
                  <>
                    {" "}
                    <Link href="/login" className="font-semibold text-aji-ink underline" onClick={close}>
                      Iniciar sesión
                    </Link>
                  </>
                )}
              </div>
            )}
          </div>

          <form onSubmit={onSubmit} className="border-t border-line p-3 pb-[calc(.75rem+env(safe-area-inset-bottom,0px))]">
            <label htmlFor="chat-input" className="sr-only">
              Escribe tu pregunta
            </label>
            <div className="flex items-end gap-2 rounded-[22px] border border-line bg-bg py-1.5 pr-1.5 pl-4 focus-within:border-panela">
              <textarea
                id="chat-input"
                ref={inputRef}
                rows={1}
                value={input}
                maxLength={MAX_USER_CHARS}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Escribe tu pregunta…"
                aria-describedby="chat-limit"
                disabled={!configured}
                className="max-h-32 min-h-[2.25rem] flex-1 resize-none bg-transparent py-1.5 text-base outline-none placeholder:text-muted focus-visible:outline-none"
              />
              {busy ? (
                <button
                  type="button"
                  onClick={() => abortRef.current?.abort()}
                  className="btn btn-ghost btn-sm"
                  aria-label="Detener respuesta"
                >
                  Parar
                </button>
              ) : (
                <button type="submit" className="btn btn-primary btn-sm" disabled={!configured || !input.trim()}>
                  Enviar
                </button>
              )}
            </div>
            <div className="mt-1.5 flex justify-between gap-3 px-2 text-[.7rem] text-muted">
              <p id="chat-limit">Máximo {MAX_USER_CHARS} caracteres. Solo consulta: no puede modificar ni cancelar pedidos. Puede equivocarse.</p>
              <span
                className={`mono flex-none ${input.length > MAX_USER_CHARS * 0.9 ? "text-danger" : ""}`}
                aria-hidden="true"
              >
                {input.length}/{MAX_USER_CHARS}
              </span>
            </div>
          </form>
        </div>
      )}
    </>
  );
}

function TypingDots() {
  return (
    <span className="inline-flex gap-1 py-1" aria-label="El asistente está escribiendo">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1.5 w-1.5 animate-bounce rounded-full bg-muted"
          style={{ animationDelay: `${i * 120}ms` }}
        />
      ))}
    </span>
  );
}
