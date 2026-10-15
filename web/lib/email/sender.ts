import type { Order } from "../orders/types";

export type OrderEmail = Order & { id: string };

/** Abstracción del envío de emails transaccionales (implementación actual: Gmail por SMTP). */
export interface EmailSender {
  sendOrderConfirmation(order: OrderEmail): Promise<void>;
}

/** Sin proveedor configurado: no envía nada y lo deja registrado. */
export class LogEmailSender implements EmailSender {
  async sendOrderConfirmation(order: OrderEmail) {
    console.warn("[email] GMAIL_USER/GMAIL_APP_PASSWORD sin configurar; no se envía confirmación", {
      orderNumber: order.orderNumber,
    });
  }
}
