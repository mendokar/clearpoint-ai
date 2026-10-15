import { beforeEach, describe, expect, it, vi } from "vitest";
import { authErrorMessage, SILENT_AUTH_ERRORS } from "@/lib/auth/errors";
import { formatDate, formatPrice, toDate } from "@/lib/format";
import { formatOrderNumber } from "@/lib/orders/types";
import { safeNext } from "@/components/auth/RequireAuth";

describe("mensajes de error de auth en español", () => {
  it("traduce los códigos relevantes", () => {
    expect(authErrorMessage({ code: "auth/invalid-credential" })).toBe("Correo o contraseña incorrectos.");
    expect(authErrorMessage({ code: "auth/account-exists-with-different-credential" })).toMatch(/correo y contraseña/);
    expect(authErrorMessage({ code: "auth/unauthorized-domain" })).toMatch(/dominio no está autorizado/);
    expect(authErrorMessage({ code: "auth/network-request-failed" })).toMatch(/conexión/);
    expect(authErrorMessage(new Error("x"))).toMatch(/Algo ha fallado/);
    expect(SILENT_AUTH_ERRORS.has("auth/popup-closed-by-user")).toBe(true);
  });
});

describe("redirección segura tras login", () => {
  it.each([
    [null, "/pedidos"],
    ["/carrito", "/carrito"],
    ["//evil.com", "/pedidos"],
    ["https://evil.com", "/pedidos"],
    ["/\\evil.com", "/pedidos"],
  ])("%s → %s", (input, expected) => expect(safeNext(input)).toBe(expected));
});

describe("formato", () => {
  it("precios en EUR y fechas en Europe/Madrid", () => {
    expect(formatPrice(1039).replace(/\s/g, " ")).toBe("1039,00 €");
    expect(formatOrderNumber(123)).toBe("CP-000123");
    expect(toDate({ seconds: 0 })?.toISOString()).toBe("1970-01-01T00:00:00.000Z");
    expect(toDate("no-fecha")).toBeNull();
    expect(formatDate("2026-10-15T07:55:00Z")).toBe("15 de octubre de 2026");
    expect(formatDate(null)).toBe("—");
  });
});

describe("firebase-admin: verifyBearer", () => {
  const verifyIdToken = vi.fn();
  beforeEach(() => {
    vi.resetModules();
    vi.doMock("firebase-admin/app", () => ({ cert: vi.fn(() => ({})), getApps: () => [], initializeApp: vi.fn(() => ({})) }));
    vi.doMock("firebase-admin/auth", () => ({ getAuth: () => ({ verifyIdToken }) }));
    vi.doMock("firebase-admin/firestore", () => ({ getFirestore: vi.fn() }));
    vi.stubEnv(
      "FIREBASE_ADMIN_CREDENTIALS",
      Buffer.from(JSON.stringify({ project_id: "p", client_email: "e@p.iam", private_key: "k" })).toString("base64"),
    );
  });

  it("rechaza cabeceras ausentes o mal formadas sin llamar a Firebase", async () => {
    const { verifyBearer } = await import("@/lib/firebase/admin");
    expect(await verifyBearer(null)).toBeNull();
    expect(await verifyBearer("Basic abc")).toBeNull();
    expect(await verifyBearer("Bearer ")).toBeNull();
    expect(await verifyBearer(`Bearer ${"a".repeat(5000)}`)).toBeNull();
    expect(verifyIdToken).not.toHaveBeenCalled();
  });

  it("devuelve el token decodificado o null si Firebase lo rechaza", async () => {
    const { verifyBearer } = await import("@/lib/firebase/admin");
    verifyIdToken.mockResolvedValueOnce({ uid: "u1" });
    expect(await verifyBearer("Bearer good")).toEqual({ uid: "u1" });
    verifyIdToken.mockRejectedValueOnce(new Error("expired"));
    expect(await verifyBearer("Bearer expired")).toBeNull();
  });
});

describe("EmailSender", () => {
  beforeEach(() => vi.resetModules());

  it("sin RESEND_API_KEY usa el sender que solo registra", async () => {
    const { getEmailSender } = await import("@/lib/email/resend");
    const { LogEmailSender } = await import("@/lib/email/sender");
    expect(getEmailSender("http://localhost:3000")).toBeInstanceOf(LogEmailSender);
  });

  it("con Resend envía al email del pedido y propaga errores", async () => {
    const send = vi.fn().mockResolvedValueOnce({ data: { id: "1" }, error: null }).mockResolvedValueOnce({ data: null, error: { name: "validation_error", message: "dominio" } });
    vi.doMock("resend", () => ({ Resend: vi.fn(() => ({ emails: { send } })) }));
    vi.stubEnv("RESEND_API_KEY", "re_test_fake");
    vi.stubEnv("EMAIL_FROM", "Contoso <onboarding@resend.dev>");
    const { getEmailSender } = await import("@/lib/email/resend");
    const sender = getEmailSender("https://tienda.test");
    const order = {
      id: "cs_test_1",
      orderNumber: "CP-000124",
      email: "ana@example.com",
      items: [],
      total: 1,
      shipping: 0,
      shippingAddress: null,
    } as unknown as Parameters<typeof sender.sendOrderConfirmation>[0];
    await sender.sendOrderConfirmation(order);
    expect(send.mock.calls[0][0]).toMatchObject({ to: "ana@example.com", subject: expect.stringContaining("CP-000124") });
    await expect(sender.sendOrderConfirmation(order)).rejects.toThrow(/Resend/);
  });
});
