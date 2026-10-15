"use client";

import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

type ChatUi = { open: boolean; setOpen: (open: boolean) => void };
const Ctx = createContext<ChatUi | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const value = useMemo(() => ({ open, setOpen }), [open]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useChatUi(): ChatUi {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useChatUi debe usarse dentro de <ChatProvider>");
  return ctx;
}

/** Botón que abre el asistente desde cualquier parte (p. ej. el hero). */
export function OpenChatButton({ className, children }: { className?: string; children: ReactNode }) {
  const { setOpen } = useChatUi();
  return (
    <button type="button" className={className} onClick={() => setOpen(true)}>
      {children}
    </button>
  );
}
