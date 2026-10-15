import { STATUS_LABELS, type OrderStatus } from "@/lib/schemas";

const STYLES: Record<OrderStatus, string> = {
  paid: "bg-tint text-ink",
  preparing: "bg-panela text-[#2C1B12]",
  shipped: "bg-aji text-on-accent",
  delivered: "bg-ok text-bg",
  cancelled: "bg-line text-muted line-through",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={`mono inline-block rounded-md px-2 py-0.5 text-xs font-medium ${STYLES[status] ?? STYLES.paid}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

export const STATUS_FLOW: OrderStatus[] = ["paid", "preparing", "shipped", "delivered"];
