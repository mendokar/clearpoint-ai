import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OrderEmail } from "@/lib/email/sender";

const order = {
  id: "cs_test_42",
  orderNumber: "CP-000142",
  email: "ana@example.com",
  userId: "u1",
  status: "shipped",
  statusHistory: [],
  items: [
    {
      productSlug: "colchon-cafetal",
      name: "Colchón Cafetal",
      sku: "CAF-150190-BRI-ALG",
      // Desordenadas a propósito: la plantilla usa formatOptions (Medida · Núcleo · Funda).
      options: { Funda: "Algodón Tolima", Medida: "150×190", Núcleo: "Brisa" },
      unitPrice: 499,
      quantity: 2,
    },
  ],
  subtotal: 998,
  shipping: 45,
  total: 1043,
  currency: "EUR",
  shippingAddress: { name: "Ana Pérez", line1: "Calle Mayor 1", city: "Palma", postalCode: "07001", country: "ES" },
  carrier: "SEUR",
  trackingNumber: "SE48201937",
  estimatedDelivery: "2026-10-22",
  stripePaymentIntentId: "pi_test",
  createdAt: "2026-10-15T08:00:00.000Z",
  updatedAt: "2026-10-15T08:00:00.000Z",
} as unknown as OrderEmail;

const sendMail = vi.fn();

beforeEach(() => {
  vi.resetModules();
  sendMail.mockReset().mockResolvedValue({ messageId: "1" });
  vi.doMock("nodemailer", () => ({ default: { createTransport: () => ({ sendMail }) } }));
  vi.stubEnv("GMAIL_USER", "contoso.tienda@gmail.com");
  vi.stubEnv("GMAIL_APP_PASSWORD", "abcd efgh ijkl mnop");
});

describe("aviso de pedido nuevo a la tienda", () => {
  it("va a ADMIN_NOTIFICATION_EMAIL con número, total, artículos, dirección y enlace al panel", async () => {
    vi.stubEnv("ADMIN_NOTIFICATION_EMAIL", "pedidos@contoso.example");
    const { getEmailSender } = await import("@/lib/email/gmail");
    await getEmailSender("https://tienda.test").sendNewOrderAlert(order);
    const mail = sendMail.mock.calls[0][0];
    expect(mail.to).toBe("pedidos@contoso.example");
    expect(mail.subject).toContain("CP-000142");
    expect(mail.subject).toMatch(/1043,00/);
    expect(mail.html).toContain("https://tienda.test/admin/pedidos/cs_test_42");
    expect(mail.text).toContain("Colchón Cafetal × 2");
    expect(mail.text).toContain("150×190 · Brisa · Algodón Tolima");
    expect(mail.text).toContain("Calle Mayor 1");
    expect(mail.text).toContain("07001 Palma");
  });

  it("sin ADMIN_NOTIFICATION_EMAIL usa GMAIL_USER", async () => {
    const { getEmailSender } = await import("@/lib/email/gmail");
    await getEmailSender("https://tienda.test").sendNewOrderAlert(order);
    expect(sendMail.mock.calls[0][0].to).toBe("contoso.tienda@gmail.com");
  });

  it("propaga el error de SMTP (quien llama lo registra sin bloquear el pedido)", async () => {
    sendMail.mockRejectedValueOnce(new Error("SMTP caído"));
    const { getEmailSender } = await import("@/lib/email/gmail");
    await expect(getEmailSender("https://tienda.test").sendNewOrderAlert(order)).rejects.toThrow(/SMTP/);
  });
});

describe("email al cliente por cambio de estado", () => {
  it("Enviado: transportista, seguimiento y fecha estimada, con el nombre de estado de la web", async () => {
    const { getEmailSender } = await import("@/lib/email/gmail");
    await getEmailSender("https://tienda.test").sendOrderStatusUpdate(order, "shipped");
    const mail = sendMail.mock.calls[0][0];
    expect(mail.to).toBe("ana@example.com");
    expect(mail.subject).toBe("Pedido CP-000142 va de camino · Colchones Contoso");
    expect(mail.text).toContain("Enviado");
    expect(mail.text).toContain("SEUR");
    expect(mail.text).toContain("SE48201937");
    expect(mail.text).toContain("22 de octubre de 2026");
    expect(mail.html).toContain("https://tienda.test/pedidos/cs_test_42");
  });

  it.each([
    ["delivered", "entregado", "Entregado"],
    ["cancelled", "cancelado", "Cancelado"],
  ] as const)("%s → asunto y etiqueta correctos", async (status, subject, label) => {
    const { getEmailSender } = await import("@/lib/email/gmail");
    await getEmailSender("https://tienda.test").sendOrderStatusUpdate(order, status);
    const mail = sendMail.mock.calls[0][0];
    expect(mail.subject).toContain(subject);
    expect(mail.text).toContain(label);
    expect(mail.text).not.toContain("SE48201937");
  });

  it("rechaza un pedido sin email", async () => {
    const { getEmailSender } = await import("@/lib/email/gmail");
    await expect(
      getEmailSender("https://tienda.test").sendOrderStatusUpdate({ ...order, email: "" }, "delivered"),
    ).rejects.toThrow(/email/);
    expect(sendMail).not.toHaveBeenCalled();
  });

  it("sin Gmail configurado solo se registra", async () => {
    vi.stubEnv("GMAIL_USER", "");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { getEmailSender } = await import("@/lib/email/gmail");
    const sender = getEmailSender("https://tienda.test");
    await sender.sendNewOrderAlert(order);
    await sender.sendOrderStatusUpdate(order, "shipped");
    expect(sendMail).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(2);
  });
});
