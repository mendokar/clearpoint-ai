import { beforeEach, describe, expect, it, vi } from "vitest";
import { checkoutSessionStatus } from "@/lib/checkout-status";

const verifyBearer = vi.fn();
const retrieve = vi.fn();

vi.mock("@/lib/firebase/admin", () => ({
  isAdminConfigured: () => true,
  verifyBearer: (h: string | null) => verifyBearer(h),
}));
vi.mock("@/lib/stripe", async (orig) => ({
  ...(await orig<typeof import("@/lib/stripe")>()),
  isStripeConfigured: () => true,
  getStripe: () => ({ checkout: { sessions: { retrieve } } }),
}));

const { GET } = await import("@/app/api/checkout/session/route");

const req = (id: string, token: string | null = "good") =>
  new Request(`http://localhost:3000/api/checkout/session?session_id=${encodeURIComponent(id)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
const statusOf = async (res: Response) => ((await res.json()) as { status: string }).status;

beforeEach(() => {
  retrieve.mockReset();
  verifyBearer.mockImplementation(async (h: string | null) => (h === "Bearer good" ? { uid: "u1" } : null));
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("checkoutSessionStatus", () => {
  it("solo reconoce sesiones del propio usuario y distingue pagada, en proceso y sin pagar", () => {
    const mine = { metadata: { uid: "u1" } };
    expect(checkoutSessionStatus({ ...mine, payment_status: "paid", status: "complete" }, "u1")).toBe("paid");
    expect(checkoutSessionStatus({ ...mine, payment_status: "unpaid", status: "complete" }, "u1")).toBe("processing");
    expect(checkoutSessionStatus({ ...mine, payment_status: "unpaid", status: "open" }, "u1")).toBe("unpaid");
    expect(checkoutSessionStatus({ ...mine, payment_status: "unpaid", status: "expired" }, "u1")).toBe("unpaid");
    expect(checkoutSessionStatus({ metadata: { uid: "otro" }, payment_status: "paid" }, "u1")).toBe("not_found");
    expect(checkoutSessionStatus({ payment_status: "paid" }, "u1")).toBe("not_found");
    expect(checkoutSessionStatus(null, "u1")).toBe("not_found");
  });
});

describe("GET /api/checkout/session (QA: la página de éxito confirmaba pagos inventados)", () => {
  it("sin token → 401 y no consulta Stripe", async () => {
    expect((await GET(req("cs_test_abcdef", null))).status).toBe(401);
    expect(retrieve).not.toHaveBeenCalled();
  });

  it("identificador inventado que Stripe no conoce → not_found", async () => {
    retrieve.mockRejectedValue(Object.assign(new Error("No such checkout.session"), { code: "resource_missing", statusCode: 404 }));
    const res = await GET(req("cs_test_inventado789"));
    expect(res.status).toBe(200);
    expect(await statusOf(res)).toBe("not_found");
  });

  it("formato no válido → not_found sin llamar a Stripe", async () => {
    expect(await statusOf(await GET(req("../../admin")))).toBe("not_found");
    expect(retrieve).not.toHaveBeenCalled();
  });

  it("sesión pagada de otro usuario → not_found (no revela que existe)", async () => {
    retrieve.mockResolvedValue({ metadata: { uid: "otro" }, payment_status: "paid", status: "complete" });
    expect(await statusOf(await GET(req("cs_test_ajena123")))).toBe("not_found");
  });

  it("sesión propia pagada → paid; abierta → unpaid", async () => {
    retrieve.mockResolvedValueOnce({ metadata: { uid: "u1" }, payment_status: "paid", status: "complete" });
    expect(await statusOf(await GET(req("cs_test_mia123")))).toBe("paid");
    retrieve.mockResolvedValueOnce({ metadata: { uid: "u1" }, payment_status: "unpaid", status: "open" });
    expect(await statusOf(await GET(req("cs_test_mia456")))).toBe("unpaid");
  });

  it("error de Stripe distinto → 502 sin detalles internos", async () => {
    retrieve.mockRejectedValue(new Error("boom interno"));
    const res = await GET(req("cs_test_mia789"));
    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain("boom");
  });
});
