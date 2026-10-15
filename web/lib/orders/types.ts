import type { OrderStatus } from "../schemas";

export type OrderItem = {
  productSlug: string;
  name: string;
  sku: string;
  options: Record<string, string>;
  unitPrice: number;
  quantity: number;
};

export type ShippingAddress = {
  name: string;
  line1: string;
  line2?: string | null;
  city: string;
  postalCode: string;
  state?: string | null;
  country: string;
};

/** Documento `orders/{stripeSessionId}`. Importes en euros (como el catálogo). */
export type Order = {
  orderNumber: string;
  userId: string;
  email: string;
  status: OrderStatus;
  statusHistory: { status: OrderStatus; at: unknown }[];
  items: OrderItem[];
  subtotal: number;
  shipping: number;
  total: number;
  currency: string;
  shippingAddress: ShippingAddress | null;
  carrier: string | null;
  trackingNumber: string | null;
  estimatedDelivery: string | null;
  stripePaymentIntentId: string | null;
  createdAt: unknown;
  updatedAt: unknown;
};

export function formatOrderNumber(n: number): string {
  return `CP-${String(n).padStart(6, "0")}`;
}
