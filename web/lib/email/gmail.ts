import "server-only";
import nodemailer, { type Transporter } from "nodemailer";
import { render } from "@react-email/render";
import { createElement } from "react";
import NewOrderAlertEmail from "@/emails/NewOrderAlert";
import OrderConfirmationEmail from "@/emails/OrderConfirmation";
import OrderStatusUpdateEmail from "@/emails/OrderStatusUpdate";
import { LogEmailSender, type EmailSender, type NotifiableStatus, type OrderEmail } from "./sender";

const STATUS_SUBJECTS: Record<NotifiableStatus, string> = {
  shipped: "va de camino",
  delivered: "entregado",
  cancelled: "cancelado",
};

/** Envía los emails transaccionales con la cuenta de Gmail configurada (SMTP + contraseña de aplicación). */
export class GmailEmailSender implements EmailSender {
  private transport: Transporter;

  constructor(
    private user: string,
    appPassword: string,
    private fromName: string,
    private siteUrl: string,
    /** Destinatario de los avisos a la tienda (ADMIN_NOTIFICATION_EMAIL; por defecto, la propia cuenta). */
    private adminEmail: string = user,
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

  async sendNewOrderAlert(order: OrderEmail) {
    const element = createElement(NewOrderAlertEmail, { order, siteUrl: this.siteUrl });
    const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
    await this.transport.sendMail({
      from: { name: this.fromName, address: this.user },
      to: this.adminEmail,
      subject: `Nuevo pedido ${order.orderNumber} · ${new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(order.total)}`,
      html,
      text,
      headers: { "X-Entity-Ref-ID": `${order.id}-admin` },
    });
  }

  async sendOrderStatusUpdate(order: OrderEmail, status: NotifiableStatus) {
    if (!order.email) throw new Error("El pedido no tiene email");
    const element = createElement(OrderStatusUpdateEmail, { order, status, siteUrl: this.siteUrl });
    const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
    await this.transport.sendMail({
      from: { name: this.fromName, address: this.user },
      to: order.email,
      subject: `Pedido ${order.orderNumber} ${STATUS_SUBJECTS[status]} · Colchones Contoso`,
      html,
      text,
      headers: { "X-Entity-Ref-ID": `${order.id}-${status}` },
    });
  }
}

/** Devuelve el sender de Gmail si está configurado; si no, uno que solo registra el aviso. */
export function getEmailSender(siteUrl: string): EmailSender {
  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) return new LogEmailSender();
  const admin = process.env.ADMIN_NOTIFICATION_EMAIL?.trim() || user;
  return new GmailEmailSender(user, pass, process.env.EMAIL_FROM_NAME || "Colchones Contoso", siteUrl, admin);
}
