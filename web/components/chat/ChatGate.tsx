"use client";

import { usePathname } from "next/navigation";
import { ChatWidget } from "./ChatWidget";

/**
 * El asistente es para clientes. En el panel de administración no se muestra: su botón flotante tapaba
 * la barra de acciones del formulario en móvil (QA, ronda 4).
 */
export function ChatGate() {
  const pathname = usePathname();
  if (pathname?.startsWith("/admin")) return null;
  return <ChatWidget />;
}
