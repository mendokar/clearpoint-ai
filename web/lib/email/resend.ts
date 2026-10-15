import "server-only";
import { Resend } from "resend";
import { createElement } from "react";
import OrderConfirmationEmail from "@/emails/OrderConfirmation";
import { LogEmailSender, type EmailSender, type OrderEmail } from "./sender";

export class ResendEmailSender implements EmailSender {
  private client: Resend;
  constructor(
    apiKey: string,
    private from: string,
    private siteUrl: string,
  ) {
    this.client = new Resend(apiKey);
  }

  async sendOrderConfirmation(order: OrderEmail) {
    if (!order.email) throw new Error("El pedido no tiene email");
    const { error } = await this.client.emails.send({
      from: this.from,
      to: order.email,
      subject: `Pedido ${order.orderNumber} confirmado · Colchones Contoso`,
      react: createElement(OrderConfirmationEmail, { order, siteUrl: this.siteUrl }),
      headers: { "X-Entity-Ref-ID": order.id },
    });
    if (error) throw new Error(`Resend: ${error.name}: ${error.message}`);
  }
}

export function getEmailSender(siteUrl: string): EmailSender {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!key || !from) return new LogEmailSender();
  return new ResendEmailSender(key, from, siteUrl);
}
