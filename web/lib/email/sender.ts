import type { Order } from "../orders/types";

export type OrderEmail = Order & { id: string };

/** Abstracción del envío de emails transaccionales (implementación actual: Resend). */
export interface EmailSender {
  sendOrderConfirmation(order: OrderEmail): Promise<void>;
}

/** Sin proveedor configurado: no envía nada y lo deja registrado. */
export class LogEmailSender implements EmailSender {
  async sendOrderConfirmation(order: OrderEmail) {
    console.warn("[email] RESEND_API_KEY/EMAIL_FROM sin configurar; no se envía confirmación", {
      orderNumber: order.orderNumber,
    });
  }
}
