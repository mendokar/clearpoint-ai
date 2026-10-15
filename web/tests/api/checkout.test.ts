import { beforeEach, describe, expect, it, vi } from "vitest";

const verifyBearer = vi.fn();
const createSession = vi.fn();

vi.mock("@/lib/firebase/admin", () => ({
  isAdminConfigured: () => true,
  verifyBearer: (h: string | null) => verifyBearer(h),
}));
vi.mock("@/lib/stripe", async (orig) => ({
  ...(await orig<typeof import("@/lib/stripe")>()),
  isStripeConfigured: () => true,
  getStripe: () => ({ checkout: { sessions: { create: createSession } } }),
}));
vi.mock("@/lib/catalog/repository", async (orig) => {
  const mod = await orig<typeof import("@/lib/catalog/repository")>();
  const local = mod.createLocalCatalog();
  return { ...mod, getCatalog: () => local };
});

const { POST } = await import("@/app/api/checkout/route");

function req(body: unknown, token: string | null = "good-token") {
  return new Request("http://localhost:3000/api/checkout", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

beforeEach(() => {
  verifyBearer.mockImplementation(async (h: string | null) =>
    h === "Bearer good-token" ? { uid: "uid-from-token", email: "ana@example.com" } : null,
  );
  createSession.mockResolvedValue({ id: "cs_test_123", url: "https://checkout.stripe.com/c/pay/cs_test_123" });
});

describe("POST /api/checkout · autenticación", () => {
  it("sin token → 401 y no llama a Stripe", async () => {
    const res = await POST(req({ items: [{ sku: "CAF-090190-BRI-ALG", quantity: 1 }] }, null));
    expect(res.status).toBe(401);
    expect(createSession).not.toHaveBeenCalled();
  });

  it("token inválido → 401", async () => {
    const res = await POST(req({ items: [{ sku: "CAF-090190-BRI-ALG", quantity: 1 }] }, "forged"));
    expect(res.status).toBe(401);
    expect(createSession).not.toHaveBeenCalled();
  });
});

describe("POST /api/checkout · validación (Zod)", () => {
  it.each([
    ["sku inexistente", { items: [{ sku: "CAF-999999-XXX-YYY", quantity: 1 }] }],
    ["cantidad 0", { items: [{ sku: "CAF-090190-BRI-ALG", quantity: 0 }] }],
    ["cantidad negativa", { items: [{ sku: "CAF-090190-BRI-ALG", quantity: -2 }] }],
    ["cantidad no entera", { items: [{ sku: "CAF-090190-BRI-ALG", quantity: 1.5 }] }],
    ["cantidad enorme", { items: [{ sku: "CAF-090190-BRI-ALG", quantity: 1_000_000 }] }],
    ["cantidad como texto", { items: [{ sku: "CAF-090190-BRI-ALG", quantity: "1" }] }],
    ["campo extra price", { items: [{ sku: "CAF-090190-BRI-ALG", quantity: 1, price: 1 }] }],
    ["campo extra en raíz (uid)", { items: [{ sku: "CAF-090190-BRI-ALG", quantity: 1 }], uid: "otro" }],
    ["carrito vacío", { items: [] }],
    ["sku con inyección", { items: [{ sku: "'; DROP TABLE--", quantity: 1 }] }],
    ["demasiadas unidades sumando líneas repetidas", { items: Array(3).fill({ sku: "CAF-090190-BRI-ALG", quantity: 5 }) }],
  ])("%s → 400", async (_name, body) => {
    const res = await POST(req(body));
    expect(res.status).toBe(400);
    expect(createSession).not.toHaveBeenCalled();
  });

  it("JSON mal formado → 400", async () => {
    const res = await POST(req("{no json"));
    expect(res.status).toBe(400);
  });

  it("variante agotada → 409", async () => {
    const res = await POST(req({ items: [{ sku: "CAF-090190-CEI-TER", quantity: 1 }] }));
    expect(res.status).toBe(409);
    expect(createSession).not.toHaveBeenCalled();
  });
});

describe("POST /api/checkout · sesión de Stripe", () => {
  it("precios del catálogo del servidor, uid del token y envío solo a ES", async () => {
    const res = await POST(
      req({
        items: [
          { sku: "CAF-150190-CEI-TER", quantity: 2 },
          { sku: "CAR-180200-BRI-ALG", quantity: 1 },
        ],
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ url: "https://checkout.stripe.com/c/pay/cs_test_123" });

    const params = createSession.mock.calls[0][0];
    expect(params.mode).toBe("payment");
    expect(params.currency).toBe("eur");
    expect(params.metadata.uid).toBe("uid-from-token");
    expect(params.client_reference_id).toBe("uid-from-token");
    expect(params.payment_intent_data.metadata.uid).toBe("uid-from-token");
    expect(params.customer_email).toBe("ana@example.com");
    expect(params.shipping_address_collection.allowed_countries).toEqual(["ES"]);
    expect(params.line_items).toHaveLength(2);
    // 719 € y 659 € en catalog.json → céntimos
    expect(params.line_items[0].price_data.unit_amount).toBe(71900);
    expect(params.line_items[0].quantity).toBe(2);
    expect(params.line_items[0].price_data.product_data.metadata.sku).toBe("CAF-150190-CEI-TER");
    expect(params.line_items[1].price_data.unit_amount).toBe(65900);
    expect(params.success_url).toContain("/checkout/exito?session_id={CHECKOUT_SESSION_ID}");
  });

  it("ignora cualquier precio o uid que intente colar el cliente", async () => {
    // Campos extra se rechazan por completo (no se 'limpian' en silencio).
    const res = await POST(req({ items: [{ sku: "CAF-090190-BRI-ALG", quantity: 1, unitPrice: 0.01 }], uid: "victima" }));
    expect(res.status).toBe(400);
    const ok = await POST(req({ items: [{ sku: "CAF-090190-BRI-ALG", quantity: 1 }] }));
    expect(ok.status).toBe(200);
    const params = createSession.mock.calls[0][0];
    expect(params.line_items[0].price_data.unit_amount).toBe(34900);
    expect(params.metadata.uid).toBe("uid-from-token");
  });

  it("agrupa SKUs repetidos en una sola línea", async () => {
    await POST(
      req({
        items: [
          { sku: "CAF-090190-BRI-ALG", quantity: 1 },
          { sku: "CAF-090190-BRI-ALG", quantity: 2 },
        ],
      }),
    );
    const params = createSession.mock.calls[0][0];
    expect(params.line_items).toHaveLength(1);
    expect(params.line_items[0].quantity).toBe(3);
  });

  it("si Stripe falla → 502 con mensaje genérico", async () => {
    createSession.mockRejectedValueOnce(new Error("sk_test_secret leaked?"));
    const res = await POST(req({ items: [{ sku: "CAF-090190-BRI-ALG", quantity: 1 }] }));
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain("sk_test");
  });
});
