import { create } from "zustand";

type DrawerState = {
  open: boolean;
  /** SKU recién añadido, para destacarlo en el mini-carrito. */
  lastSku: string | null;
  show: (sku?: string) => void;
  close: () => void;
};

/** Estado de interfaz del mini-carrito lateral (no se persiste). */
export const useCartDrawer = create<DrawerState>()((set) => ({
  open: false,
  lastSku: null,
  show: (sku) => set({ open: true, lastSku: sku ?? null }),
  close: () => set({ open: false }),
}));
