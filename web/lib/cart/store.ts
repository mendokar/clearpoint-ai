import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export const MAX_QTY_PER_LINE = 10;

/**
 * Línea del carrito. El precio es SOLO informativo para la interfaz:
 * el servidor recalcula siempre el precio desde el catálogo al pagar.
 */
export type CartLine = {
  sku: string;
  slug: string;
  name: string;
  options: Record<string, string>;
  unitPrice: number;
  image?: string;
  quantity: number;
};

type CartState = {
  lines: CartLine[];
  add: (line: Omit<CartLine, "quantity">, quantity?: number) => void;
  setQuantity: (sku: string, quantity: number) => void;
  remove: (sku: string) => void;
  clear: () => void;
};

const clampQty = (n: number) => Math.max(1, Math.min(MAX_QTY_PER_LINE, Math.floor(n)));

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      lines: [],
      add: (line, quantity = 1) =>
        set((s) => {
          const existing = s.lines.find((l) => l.sku === line.sku);
          if (existing) {
            return {
              lines: s.lines.map((l) =>
                l.sku === line.sku ? { ...l, ...line, quantity: clampQty(l.quantity + quantity) } : l,
              ),
            };
          }
          return { lines: [...s.lines, { ...line, quantity: clampQty(quantity) }] };
        }),
      setQuantity: (sku, quantity) =>
        set((s) => ({
          lines: s.lines.map((l) => (l.sku === sku ? { ...l, quantity: clampQty(quantity) } : l)),
        })),
      remove: (sku) => set((s) => ({ lines: s.lines.filter((l) => l.sku !== sku) })),
      clear: () => set({ lines: [] }),
    }),
    {
      name: "contoso-cart",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ lines: s.lines }),
    },
  ),
);

export function cartCount(lines: CartLine[]): number {
  return lines.reduce((n, l) => n + l.quantity, 0);
}

export function cartSubtotal(lines: CartLine[]): number {
  return Math.round(lines.reduce((sum, l) => sum + l.unitPrice * 100 * l.quantity, 0)) / 100;
}
