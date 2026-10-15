import Stripe from "stripe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeFirestore } from "../helpers/fakeFirestore";

const WEBHOOK_SECRET = "whsec_test_fake_secret";
const stripe = new Stripe("sk_test_fake_not_real", { apiVersion: "2025-08-27.basil" });
const listLineItems = vi.fn();
const sendOrderConfirmation = vi.fn();
let db: FakeFirestore;

vi.mock("@/lib/firebase/admin", () => ({
  isAdminConfigured: () => true,
  getAdminDb: () => db,
}));
vi.mock("@/lib/stripe", () => ({
  isStripeConfigured: () => true,
  getStripe: () => ({ webhooks: stripe.webhooks, checkout: { sessions: { listLineItems } } }),
}));
vi.mock("@/lib/email/resend", () => ({
  getEmailSender: () => ({ sendOrderConfirmation }),
}));

const { POST } = await import("@/app/api/webhooks/stripe/route");

function session(overrides: Partial<Stripe.Checkout.Session> = {}): Stripe.Checkout.Session {
  return {
    id: "cs_test_abc123",
    object: "checkout.session",
    payment_status: "paid",
    status: "complete",
    metadata: { uid: "uid-123" },
    client_reference_id: "uid-123",
    customer_details: { email: "ana@example.com", name: "Ana", address: null } as Stripe.Checkout.Session.CustomerDetails,
    customer_email: null,
    amount_subtotal: 71900,
    amount_total: 71900,
    currency: "eur",
    shipping_cost: { amount_total: 0 } as Stripe.Checkout.Session.ShippingCost,
    collected_information: {
      shipping_details: {
        name: "Ana Pérez",
        address: { line1: "Calle Mayor 1", line2: null, city: "Madrid", postal_code: "28013", state: "M", country: "ES" },
      },
    } as Stripe.Checkout.Session.CollectedInformation,
    payment_intent: "pi_test_1",
    ...overrides,
  } as Stripe.Checkout.Session;
}

function signedRequest(event: object, secret = WEBHOOK_SECRET) {
  const payload = JSON.stringify(event);
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret });
  return new Request("http://localhost/api/webhooks/stripe", {
    method: "POST",
    headers: { "stripe-signature": header, "content-type": "application/json" },
    body: payload,
  });
}

const event = (obj: Stripe.Checkout.Session, type = "checkout.session.completed", id = "evt_1") => ({
  id,
  object: "event",
  type,
  data: { object: obj },
});

beforeEach(() => {
  vi.stubEnv("STRIPE_WEBHOOK_SECRET", WEBHOOK_SECRET);
  db = new FakeFirestore();
  listLineItems.mockResolvedValue({
    data: [
      {
        quantity: 1,
        description: "Colchón Cafetal",
        amount_subtotal: 71900,
        price: {
          unit_amount: 71900,
          product: {
            name: "Colchón Cafetal",
            metadata: {
              sku: "CAF-150190-CEI-TER",
              slug: "colchon-cafetal",
              options: JSON.stringify({ Medida: "150×190", Núcleo: "Ceiba+", Funda: "Térmica Páramo" }),
            },
          },
        },
      },
    ],
  });
  sendOrderConfirmation.mockResolvedValue(undefined);
});

describe("POST /api/webhooks/stripe", () => {
  it("firma inválida → 400 sin crear nada", async () => {
    const res = await POST(signedRequest(event(session()), "whsec_otro_secreto"));
    expect(res.status).toBe(400);
    expect(db.writes).toHaveLength(0);
    expect(sendOrderConfirmation).not.toHaveBeenCalled();
  });

  it("sin cabecera de firma → 400", async () => {
    const res = await POST(new Request("http://localhost/api/webhooks/stripe", { method: "POST", body: "{}" }));
    expect(res.status).toBe(400);
    expect(db.writes).toHaveLength(0);
  });

  it("cuerpo alterado tras firmar → 400", async () => {
    const payload = JSON.stringify(event(session()));
    const header = stripe.webhooks.generateTestHeaderString({ payload, secret: WEBHOOK_SECRET });
    const tampered = payload.replace("uid-123", "uid-atacante");
    const res = await POST(
      new Request("http://localhost/api/webhooks/stripe", { method: "POST", headers: { "stripe-signature": header }, body: tampered }),
    );
    expect(res.status).toBe(400);
    expect(db.writes).toHaveLength(0);
  });

  it("otro tipo de evento → 200 ignorado", async () => {
    const res = await POST(signedRequest(event(session(), "checkout.session.expired")));
    expect(res.status).toBe(200);
    expect((await res.json()).ignored).toBe("checkout.session.expired");
    expect(db.writes).toHaveLength(0);
  });

  it("payment_status distinto de paid → ignorado", async () => {
    const res = await POST(signedRequest(event(session({ payment_status: "unpaid" }))));
    expect(res.status).toBe(200);
    expect(db.writes).toHaveLength(0);
    expect(sendOrderConfirmation).not.toHaveBeenCalled();
  });

  it("crea orders/{sessionId} con número CP-000001, dirección y statusHistory", async () => {
    const res = await POST(signedRequest(event(session())));
    expect(res.status).toBe(200);
    const order = db.store.get("orders/cs_test_abc123")!;
    expect(order.orderNumber).toBe("CP-000001");
    expect(order.userId).toBe("uid-123");
    expect(order.status).toBe("paid");
    expect(order.statusHistory).toEqual([{ status: "paid", at: expect.any(Date) }]);
    expect(order.total).toBe(719);
    expect(order.currency).toBe("EUR");
    expect(order.items).toEqual([
      {
        productSlug: "colchon-cafetal",
        name: "Colchón Cafetal",
        sku: "CAF-150190-CEI-TER",
        options: { Medida: "150×190", Núcleo: "Ceiba+", Funda: "Térmica Páramo" },
        unitPrice: 719,
        quantity: 1,
      },
    ]);
    expect(order.shippingAddress).toMatchObject({ name: "Ana Pérez", city: "Madrid", postalCode: "28013", country: "ES" });
    expect(order.stripePaymentIntentId).toBe("pi_test_1");
    expect(sendOrderConfirmation).toHaveBeenCalledTimes(1);
  });

  it("evento repetido no duplica el pedido ni consume número (idempotencia)", async () => {
    await POST(signedRequest(event(session())));
    await POST(signedRequest(event(session(), "checkout.session.completed", "evt_retry")));
    await Promise.all([POST(signedRequest(event(session()))), POST(signedRequest(event(session())))]);
    const orders = [...db.store.keys()].filter((k) => k.startsWith("orders/"));
    expect(orders).toEqual(["orders/cs_test_abc123"]);
    expect(db.store.get("counters/orders")!.value).toBe(1);
    expect(sendOrderConfirmation).toHaveBeenCalledTimes(1);
  });

  it("orderNumber secuencial con formato CP-000123", async () => {
    db.store.set("counters/orders", { value: 122 });
    await POST(signedRequest(event(session({ id: "cs_test_a" }))));
    await POST(signedRequest(event(session({ id: "cs_test_b" }))));
    expect(db.store.get("orders/cs_test_a")!.orderNumber).toBe("CP-000123");
    expect(db.store.get("orders/cs_test_b")!.orderNumber).toBe("CP-000124");
    expect(String(db.store.get("orders/cs_test_b")!.orderNumber)).toMatch(/^CP-\d{6}$/);
  });

  it("si falla el email, el pedido se guarda igualmente", async () => {
    sendOrderConfirmation.mockRejectedValueOnce(new Error("Resend caído"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(signedRequest(event(session())));
    expect(res.status).toBe(200);
    expect(db.store.get("orders/cs_test_abc123")).toBeDefined();
    expect(spy).toHaveBeenCalled();
  });

  it("si falla Firestore → 500 para que Stripe reintente", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    db.runTransaction = () => Promise.reject(new Error("unavailable"));
    const res = await POST(signedRequest(event(session())));
    expect(res.status).toBe(500);
  });

  it("sin STRIPE_WEBHOOK_SECRET → 503", async () => {
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await POST(signedRequest(event(session())));
    expect(res.status).toBe(503);
  });
});
