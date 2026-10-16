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
  /** Último estado comprobado con el servidor (ver /api/cart/quote). Sin valor = aún no comprobado. */
  availability?: "ok" | "out_of_stock" | "unavailable";
};

export type PriceChange = { sku: string; name: string; from: number; to: number };

export type QuoteUpdate = {
  sku: string;
  status: "ok" | "out_of_stock" | "unavailable";
  unitPrice?: number;
  name?: string;
  slug?: string;
  options?: Record<string, string>;
};

type CartState = {
  lines: CartLine[];
  add: (line: Omit<CartLine, "quantity">, quantity?: number) => void;
  setQuantity: (sku: string, quantity: number) => void;
  remove: (sku: string) => void;
  clear: () => void;
  /** Aplica precios y disponibilidad del servidor. Devuelve los cambios de precio para avisar al cliente. */
  applyQuote: (updates: QuoteUpdate[]) => PriceChange[];
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
      applyQuote: (updates) => {
        const bySku = new Map(updates.map((u) => [u.sku, u]));
        const changes: PriceChange[] = [];
        set((s) => ({
          lines: s.lines.map((l) => {
            const u = bySku.get(l.sku);
            if (!u) return l;
            if (u.status === "unavailable") return { ...l, availability: "unavailable" };
            const price = typeof u.unitPrice === "number" ? u.unitPrice : l.unitPrice;
            if (price !== l.unitPrice) changes.push({ sku: l.sku, name: u.name ?? l.name, from: l.unitPrice, to: price });
            return {
              ...l,
              unitPrice: price,
              name: u.name ?? l.name,
              slug: u.slug ?? l.slug,
              options: u.options ?? l.options,
              availability: u.status,
            };
          }),
        }));
        return changes;
      },
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

/** Solo cuentan las líneas que se pueden comprar (las agotadas o retiradas no suman). */
export function isPurchasable(line: CartLine): boolean {
  return line.availability !== "unavailable" && line.availability !== "out_of_stock";
}

export function cartSubtotal(lines: CartLine[]): number {
  return Math.round(lines.filter(isPurchasable).reduce((sum, l) => sum + l.unitPrice * 100 * l.quantity, 0)) / 100;
}
