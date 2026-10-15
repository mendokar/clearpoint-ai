import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { render } from "@react-email/render";
import { createElement } from "react";
import OrderConfirmationEmail from "@/emails/OrderConfirmation";
import { LogEmailSender, type EmailSender, type OrderEmail } from "./sender";

/** Envía los emails transaccionales con la cuenta de Gmail configurada (SMTP + contraseña de aplicación). */
export class GmailEmailSender implements EmailSender {
  private transport: Transporter;

  constructor(
    private user: string,
    appPassword: string,
    private fromName: string,
    private siteUrl: string,
  ) {
    this.transport = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,
      secure: true,
      // Google muestra la contraseña de aplicación en grupos de 4 con espacios.
      auth: { user, pass: appPassword.replace(/\s+/g, "") },
    });
  }

  async sendOrderConfirmation(order: OrderEmail) {
    if (!order.email) throw new Error("El pedido no tiene email");
    const element = createElement(OrderConfirmationEmail, { order, siteUrl: this.siteUrl });
    const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
    await this.transport.sendMail({
      from: { name: this.fromName, address: this.user },
      to: order.email,
      subject: `Pedido ${order.orderNumber} confirmado · Colchones Contoso`,
      html,
      text,
      headers: { "X-Entity-Ref-ID": order.id },
    });
  }
}

/** Devuelve el sender de Gmail si está configurado; si no, uno que solo registra el aviso. */
export function getEmailSender(siteUrl: string): EmailSender {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return new LogEmailSender();
  return new GmailEmailSender(user, pass, process.env.EMAIL_FROM_NAME || "Colchones Contoso", siteUrl);
}
