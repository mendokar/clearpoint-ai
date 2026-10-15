"use client";

import { useEffect, useRef, useState } from "react";
import { useToasts, type Toast } from "@/lib/ui/toast";
import { CloseIcon } from "./Icons";

/** Región de avisos breves (aria-live). Se pausan al pasar el ratón o con el foco dentro. */
export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  return (
    <div className="toaster" role="region" aria-label="Avisos">
      <div role="status" aria-live="polite" className="contents">
        {toasts.map((t) => (
          <ToastItem key={t.id} toast={t} />
        ))}
      </div>
    </div>
  );
}

function ToastItem({ toast }: { toast: Toast }) {
  const dismiss = useToasts((s) => s.dismiss);
  const [leaving, setLeaving] = useState(false);
  const [paused, setPaused] = useState(false);
  const remaining = useRef(toast.duration ?? (toast.action ? 8000 : 4500));

  useEffect(() => {
    if (leaving) {
      const t = setTimeout(() => dismiss(toast.id), 200);
      return () => clearTimeout(t);
    }
    if (paused) return;
    const started = Date.now();
    const t = setTimeout(() => setLeaving(true), remaining.current);
    return () => {
      clearTimeout(t);
      remaining.current = Math.max(800, remaining.current - (Date.now() - started));
    };
  }, [leaving, paused, dismiss, toast.id]);

  return (
    <div
      className="toast"
      data-tone={toast.tone ?? "info"}
      data-leaving={leaving}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <span className="toast-dot" aria-hidden="true" />
      <span className="min-w-0 flex-1">{toast.text}</span>
      {toast.action && (
        <button
          type="button"
          onClick={() => {
            toast.action?.run();
            setLeaving(true);
          }}
        >
          {toast.action.label}
        </button>
      )}
      <button type="button" aria-label="Cerrar aviso" onClick={() => setLeaving(true)} className="!p-1 !text-bg/70">
        <CloseIcon className="h-4 w-4" />
      </button>
    </div>
  );
}
