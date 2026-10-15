import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeFirestore } from "../helpers/fakeFirestore";

const verifyBearer = vi.fn();
const sendOrderStatusUpdate = vi.fn();
let db: FakeFirestore;

vi.mock("@/lib/firebase/admin", () => ({
  isAdminConfigured: () => true,
  getAdminDb: () => db,
  verifyBearer: (h: string | null, opts?: unknown) => verifyBearer(h, opts),
}));
vi.mock("@/lib/email/gmail", () => ({
  getEmailSender: () => ({ sendOrderConfirmation: vi.fn(), sendNewOrderAlert: vi.fn(), sendOrderStatusUpdate }),
}));

const list = await import("@/app/api/admin/orders/route");
const item = await import("@/app/api/admin/orders/[id]/route");
const summary = await import("@/app/api/admin/summary/route");
const { getOrdersSummary, startOfTodayMadrid } = await import("@/lib/admin/orders");

function order(n: number, status: string, createdAt: string, extra: Record<string, unknown> = {}) {
  return {
    orderNumber: `CP-${String(n).padStart(6, "0")}`,
    userId: n % 2 ? "alice" : "bob",
    email: n % 2 ? "alice@example.com" : "bob@example.com",
    status,
    statusHistory: [{ status: "paid", at: new Date(createdAt) }],
    items: [{ productSlug: "colchon-cafetal", name: "Colchón Cafetal", sku: "CAF-090190-BRI-ALG", options: { Medida: "90×190" }, unitPrice: 349, quantity: 1 }],
    subtotal: 349,
    shipping: 0,
    total: 349,
    currency: "EUR",
    shippingAddress: null,
    carrier: null,
    trackingNumber: null,
    estimatedDelivery: null,
    stripePaymentIntentId: null,
    createdAt: new Date(createdAt),
    updatedAt: new Date(createdAt),
    ...extra,
  };
}

const req = (method: string, url = "http://localhost/api/admin/orders", body?: unknown, token: string | null = "admin-token") =>
  new Request(url, {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const patch = (id: string, body: unknown, token: string | null = "admin-token") =>
  item.PATCH(req("PATCH", `http://localhost/api/admin/orders/${id}`, body, token), ctx(id));

beforeEach(() => {
  db = new FakeFirestore();
  db.store.set("orders/cs_test_paid01", order(1, "paid", "2026-10-15T09:00:00Z"));
  db.store.set("orders/cs_test_prep01", order(2, "preparing", "2026-10-14T09:00:00Z"));
  db.store.set("orders/cs_test_ship01", order(3, "shipped", "2026-10-13T09:00:00Z", { carrier: "SEUR", trackingNumber: "SE1", estimatedDelivery: "2026-10-16" }));
  db.store.set("orders/cs_test_deli01", order(4, "delivered", "2026-10-12T09:00:00Z"));
  db.store.set("orders/cs_test_canc01", order(5, "cancelled", "2026-10-11T09:00:00Z"));
  verifyBearer.mockImplementation(async (h: string | null) => {
    if (h === "Bearer admin-token") return { uid: "admin-1", email: "admin@contoso.example", email_verified: true, admin: true };
    if (h === "Bearer user-token") return { uid: "alice" };
    return null;
  });
  sendOrderStatusUpdate.mockReset().mockResolvedValue(undefined);
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("autorización de /api/admin/orders", () => {
  it("sin token → 401; usuario normal → 403 (aunque sea el dueño del pedido)", async () => {
    expect((await list.GET(req("GET", undefined, undefined, null))).status).toBe(401);
    expect((await list.GET(req("GET", undefined, undefined, "user-token"))).status).toBe(403);
    expect((await item.GET(req("GET", undefined, undefined, "user-token"), ctx("cs_test_paid01"))).status).toBe(403);
    expect((await patch("cs_test_paid01", { status: "preparing" }, null)).status).toBe(401);
    expect((await patch("cs_test_paid01", { status: "preparing" }, "user-token")).status).toBe(403);
    expect((await summary.GET(req("GET", undefined, undefined, "user-token"))).status).toBe(403);
    expect(db.store.get("orders/cs_test_paid01")!.status).toBe("paid");
  });
});

describe("listado", () => {
  it("todos los pedidos, del más reciente al más antiguo", async () => {
    const body = await (await list.GET(req("GET"))).json();
    expect(body.orders.map((o: { orderNumber: string }) => o.orderNumber)).toEqual([
      "CP-000001",
      "CP-000002",
      "CP-000003",
      "CP-000004",
      "CP-000005",
    ]);
    expect(body.orders[0].createdAt).toBe("2026-10-15T09:00:00.000Z"); // fechas planas (ISO)
    expect(body.nextCursor).toBeNull();
  });

  it("filtra por estado", async () => {
    const body = await (await list.GET(req("GET", "http://localhost/api/admin/orders?status=shipped"))).json();
    expect(body.orders.map((o: { id: string }) => o.id)).toEqual(["cs_test_ship01"]);
  });

  it("pagina con cursor", async () => {
    const first = await (await list.GET(req("GET", "http://localhost/api/admin/orders?limit=2"))).json();
    expect(first.orders).toHaveLength(2);
    expect(first.nextCursor).toBe("cs_test_prep01");
    const second = await (await list.GET(req("GET", `http://localhost/api/admin/orders?limit=2&cursor=${first.nextCursor}`))).json();
    expect(second.orders.map((o: { id: string }) => o.id)).toEqual(["cs_test_ship01", "cs_test_deli01"]);
    const third = await (await list.GET(req("GET", `http://localhost/api/admin/orders?limit=2&cursor=${second.nextCursor}`))).json();
    expect(third.orders.map((o: { id: string }) => o.id)).toEqual(["cs_test_canc01"]);
    expect(third.nextCursor).toBeNull();
  });

  it("busca por número de pedido", async () => {
    const body = await (await list.GET(req("GET", "http://localhost/api/admin/orders?orderNumber=CP-000004"))).json();
    expect(body.orders.map((o: { id: string }) => o.id)).toEqual(["cs_test_deli01"]);
  });

  it.each(["status=enviado", "limit=0", "limit=999", "cursor=../../x", "orderNumber=123", "otro=1"])("filtro no válido %s → 400", async (q) => {
    expect((await list.GET(req("GET", `http://localhost/api/admin/orders?${q}`))).status).toBe(400);
  });
});

describe("detalle y revisión", () => {
  it("abrir el detalle marca reviewedAt una sola vez", async () => {
    const res = await item.GET(req("GET"), ctx("cs_test_paid01"));
    expect(res.status).toBe(200);
    const first = db.store.get("orders/cs_test_paid01")!.reviewedAt;
    expect(first).toBeInstanceOf(Date);
    await item.GET(req("GET"), ctx("cs_test_paid01"));
    expect(db.store.get("orders/cs_test_paid01")!.reviewedAt).toBe(first);
  });

  it("ID no válido → 400; inexistente → 404 sin crear documento", async () => {
    expect((await item.GET(req("GET"), ctx("abc"))).status).toBe(400);
    expect((await item.GET(req("GET"), ctx("cs_test_nope00"))).status).toBe(404);
    expect(db.store.has("orders/cs_test_nope00")).toBe(false);
  });
});

describe("cambio de estado", () => {
  it("paid → preparing añade a statusHistory, no envía email (no aplica)", async () => {
    const res = await patch("cs_test_paid01", { status: "preparing" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.email).toBe("not_applicable");
    expect(body.order.status).toBe("preparing");
    const doc = db.store.get("orders/cs_test_paid01")!;
    expect((doc.statusHistory as { status: string }[]).map((h) => h.status)).toEqual(["paid", "preparing"]);
    expect(doc.updatedAt).toBeInstanceOf(Date);
    expect(sendOrderStatusUpdate).not.toHaveBeenCalled();
  });

  it("preparing → shipped exige transportista, seguimiento y fecha", async () => {
    const res = await patch("cs_test_prep01", { status: "shipped" });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/transportista/);
    expect((await patch("cs_test_prep01", { status: "shipped", carrier: "SEUR", trackingNumber: "SE123" })).status).toBe(400);
    expect(
      (await patch("cs_test_prep01", { status: "shipped", carrier: "SEUR", trackingNumber: "SE123", estimatedDelivery: "2026-02-31" })).status,
    ).toBe(400);
    expect(db.store.get("orders/cs_test_prep01")!.status).toBe("preparing");
    expect(sendOrderStatusUpdate).not.toHaveBeenCalled();
  });

  it("preparing → shipped guarda los datos de envío y avisa al cliente una vez", async () => {
    const res = await patch("cs_test_prep01", {
      status: "shipped",
      carrier: "SEUR",
      trackingNumber: "SE48201937",
      estimatedDelivery: "2026-10-22",
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.email).toBe("sent");
    expect(body.order).toMatchObject({ status: "shipped", carrier: "SEUR", trackingNumber: "SE48201937", estimatedDelivery: "2026-10-22" });
    expect(sendOrderStatusUpdate).toHaveBeenCalledTimes(1);
    expect(sendOrderStatusUpdate.mock.calls[0][0]).toMatchObject({ orderNumber: "CP-000002", trackingNumber: "SE48201937" });
    expect(sendOrderStatusUpdate.mock.calls[0][1]).toBe("shipped");
    expect((db.store.get("orders/cs_test_prep01")!.notifiedStatuses as Record<string, unknown>).shipped).toBeInstanceOf(Date);

    // Repetir el mismo estado es una transición inválida: 409 y ningún email más.
    const again = await patch("cs_test_prep01", { status: "shipped", carrier: "SEUR", trackingNumber: "SE48201937", estimatedDelivery: "2026-10-22" });
    expect(again.status).toBe(409);
    expect(sendOrderStatusUpdate).toHaveBeenCalledTimes(1);
  });

  it("no reenvía un aviso ya registrado en notifiedStatuses", async () => {
    db.store.set("orders/cs_test_ship01", { ...db.store.get("orders/cs_test_ship01")!, notifiedStatuses: { delivered: new Date(0) } });
    const body = await (await patch("cs_test_ship01", { status: "delivered" })).json();
    expect(body.email).toBe("already_sent");
    expect(body.order.status).toBe("delivered");
    expect(sendOrderStatusUpdate).not.toHaveBeenCalled();
  });

  it("notifyCustomer: false cambia el estado sin email", async () => {
    const body = await (await patch("cs_test_ship01", { status: "delivered", notifyCustomer: false })).json();
    expect(body.email).toBe("skipped");
    expect(body.order.status).toBe("delivered");
    expect(sendOrderStatusUpdate).not.toHaveBeenCalled();
  });

  it("si el email falla, el estado se guarda y no se marca como avisado", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    sendOrderStatusUpdate.mockRejectedValueOnce(new Error("SMTP caído"));
    const res = await patch("cs_test_paid01", { status: "cancelled" });
    expect(res.status).toBe(200);
    expect((await res.json()).email).toBe("failed");
    const doc = db.store.get("orders/cs_test_paid01")!;
    expect(doc.status).toBe("cancelled");
    expect(doc.notifiedStatuses).toBeUndefined();
  });

  it("shipped → delivered sin fecha previa pone la de hoy", async () => {
    db.store.set("orders/cs_test_ship01", { ...db.store.get("orders/cs_test_ship01")!, estimatedDelivery: null });
    await patch("cs_test_ship01", { status: "delivered" });
    expect(db.store.get("orders/cs_test_ship01")!.estimatedDelivery).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it.each([
    ["cs_test_paid01", "shipped"], // no se salta preparing
    ["cs_test_paid01", "delivered"],
    ["cs_test_paid01", "paid"],
    ["cs_test_prep01", "paid"], // no retrocede
    ["cs_test_ship01", "cancelled"], // no se cancela tras enviar
    ["cs_test_ship01", "preparing"],
    ["cs_test_deli01", "cancelled"], // final
    ["cs_test_canc01", "preparing"], // final
  ])("%s → %s no permitido → 409", async (id, status) => {
    const before = structuredClone(db.store.get(`orders/${id}`));
    const extra = status === "shipped" ? { carrier: "SEUR", trackingNumber: "SE1", estimatedDelivery: "2026-10-22" } : {};
    const res = await patch(id, { status, ...extra });
    expect(res.status).toBe(409);
    expect(db.store.get(`orders/${id}`)).toEqual(before);
    expect(sendOrderStatusUpdate).not.toHaveBeenCalled();
  });

  it("cancelled desde paid y desde preparing está permitido", async () => {
    expect((await patch("cs_test_paid01", { status: "cancelled" })).status).toBe(200);
    expect((await patch("cs_test_prep01", { status: "cancelled" })).status).toBe(200);
  });

  it.each([
    ["estado desconocido", { status: "lost" }],
    ["campo extra", { status: "preparing", userId: "otro" }],
    ["seguimiento con inyección", { status: "shipped", carrier: "SEUR", trackingNumber: "<script>", estimatedDelivery: "2026-10-22" }],
    ["sin estado", {}],
  ])("%s → 400", async (_n, body) => {
    expect((await patch("cs_test_prep01", body)).status).toBe(400);
  });

  it("pedido inexistente → 404", async () => {
    expect((await patch("cs_test_nope00", { status: "preparing" })).status).toBe(404);
  });
});

describe("resumen del panel", () => {
  it("medianoche de Madrid en horario de verano e invierno", () => {
    expect(startOfTodayMadrid(new Date("2026-10-15T12:00:00Z")).toISOString()).toBe("2026-10-14T22:00:00.000Z");
    expect(startOfTodayMadrid(new Date("2026-12-15T23:30:00Z")).toISOString()).toBe("2026-12-15T23:00:00.000Z");
  });

  it("cuenta pedidos y facturación de hoy (sin cancelados), pendientes, sin revisar y enviados", async () => {
    db.store.set("orders/cs_test_today2", order(6, "cancelled", "2026-10-15T10:00:00Z", { total: 1000 }));
    db.store.set("orders/cs_test_today3", order(7, "paid", "2026-10-15T11:00:00Z", { total: 500.5, reviewedAt: new Date() }));
    const s = await getOrdersSummary(db as never, new Date("2026-10-15T15:00:00Z"));
    expect(s).toEqual({
      today: { orders: 3, revenue: 849.5 },
      pendingPreparation: 2,
      unreviewed: 1,
      preparing: 1,
      shipped: 1,
    });
  });

  it("GET /api/admin/summary responde con el resumen", async () => {
    const res = await summary.GET(req("GET"));
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ pendingPreparation: 1, preparing: 1, shipped: 1 });
  });
});
