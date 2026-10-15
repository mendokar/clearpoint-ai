import type { Order } from "../orders/types";

export type OrderEmail = Order & { id: string };

/** Estados que generan un email al cliente cuando se cambian desde el panel. */
export const NOTIFIABLE_STATUSES = ["shipped", "delivered", "cancelled"] as const;
export type NotifiableStatus = (typeof NOTIFIABLE_STATUSES)[number];

export function isNotifiableStatus(status: string): status is NotifiableStatus {
  return (NOTIFIABLE_STATUSES as readonly string[]).includes(status);
}

/** Abstracción del envío de emails transaccionales (implementación actual: Gmail por SMTP). */
export interface EmailSender {
  /** Al cliente, tras el pago. */
  sendOrderConfirmation(order: OrderEmail): Promise<void>;
  /** A la tienda (ADMIN_NOTIFICATION_EMAIL o GMAIL_USER), cuando entra un pedido. */
  sendNewOrderAlert(order: OrderEmail): Promise<void>;
  /** Al cliente, cuando el pedido pasa a Enviado, Entregado o Cancelado. */
  sendOrderStatusUpdate(order: OrderEmail, status: NotifiableStatus): Promise<void>;
}

/** Sin proveedor configurado: no envía nada y lo deja registrado. */
export class LogEmailSender implements EmailSender {
  async sendOrderConfirmation(order: OrderEmail) {
    console.warn("[email] GMAIL_USER/GMAIL_APP_PASSWORD sin configurar; no se envía confirmación", {
      orderNumber: order.orderNumber,
    });
  }
  async sendNewOrderAlert(order: OrderEmail) {
    console.warn("[email] GMAIL_USER/GMAIL_APP_PASSWORD sin configurar; no se avisa a la tienda", {
      orderNumber: order.orderNumber,
    });
  }
  async sendOrderStatusUpdate(order: OrderEmail, status: NotifiableStatus) {
    console.warn("[email] GMAIL_USER/GMAIL_APP_PASSWORD sin configurar; no se notifica el cambio de estado", {
      orderNumber: order.orderNumber,
      status,
    });
  }
}
