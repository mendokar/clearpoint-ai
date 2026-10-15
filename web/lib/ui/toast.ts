import { create } from "zustand";

export type Toast = {
  id: number;
  text: string;
  tone?: "ok" | "info";
  action?: { label: string; run: () => void };
  /** ms hasta cerrarse solo (por defecto 4500). */
  duration?: number;
};

type ToastState = {
  toasts: Toast[];
  show: (t: Omit<Toast, "id">) => number;
  dismiss: (id: number) => void;
};

let nextId = 1;

/** Cola de avisos breves (toasts). La pinta <Toaster /> en el layout. */
export const useToasts = create<ToastState>()((set) => ({
  toasts: [],
  show: (t) => {
    const id = nextId++;
    // Máximo 3 a la vez: los más antiguos salen primero.
    set((s) => ({ toasts: [...s.toasts.slice(-2), { ...t, id }] }));
    return id;
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
}));

export const toast = (t: Omit<Toast, "id">) => useToasts.getState().show(t);
