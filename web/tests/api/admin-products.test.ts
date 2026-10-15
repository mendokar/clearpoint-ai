import { beforeEach, describe, expect, it, vi } from "vitest";
import raw from "../../../data/catalog.json";
import { FakeFirestore } from "../helpers/fakeFirestore";

const verifyBearer = vi.fn();
const revalidatePath = vi.fn();
let db: FakeFirestore;
let configured = true;

vi.mock("@/lib/firebase/admin", () => ({
  isAdminConfigured: () => configured,
  getAdminDb: () => db,
  verifyBearer: (h: string | null, opts?: unknown) => verifyBearer(h, opts),
}));
vi.mock("next/cache", () => ({ revalidatePath: (...a: unknown[]) => revalidatePath(...a) }));

const list = await import("@/app/api/admin/products/route");
const item = await import("@/app/api/admin/products/[slug]/route");

/** Payload válido para el panel a partir de un producto del JSON semilla (sin campos calculados). */
function payload(overrides: Record<string, unknown> = {}) {
  const p = structuredClone(raw.products[0]) as Record<string, unknown>;
  delete p.priceFrom;
  delete p.currency;
  return { ...p, slug: "colchon-nuevo", name: "Colchón Nuevo", ...overrides } as unknown as Record<string, unknown> & {
    variants: { sku: string; price: number; inStock: boolean; options: Record<string, string> }[];
  };
}

/** Cambia los SKU para no chocar con los del producto semilla. */
function withSkus(p: ReturnType<typeof payload>, prefix: string) {
  p.variants = p.variants.map((v) => ({ ...v, sku: v.sku.replace(/^CAF/, prefix) }));
  return p;
}

const req = (method: string, body?: unknown, token: string | null = "admin-token", raw?: string) =>
  new Request("http://localhost/api/admin/products", {
    method,
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: raw ?? (body === undefined ? undefined : JSON.stringify(body)),
  });
const ctx = (slug: string) => ({ params: Promise.resolve({ slug }) });

beforeEach(() => {
  configured = true;
  db = new FakeFirestore();
  // Producto existente sembrado (como hace scripts/seed.ts)
  db.store.set("products/colchon-cafetal", { ...structuredClone(raw.products[0]), updatedAt: new Date(0) });
  verifyBearer.mockImplementation(async (h: string | null) => {
    if (h === "Bearer admin-token") return { uid: "admin-1", email: "admin@contoso.example", admin: true };
    if (h === "Bearer user-token") return { uid: "user-1", email: "ana@example.com" };
    if (h === "Bearer fake-claim") return { uid: "user-2", admin: "true" }; // claim mal tipado no vale
    return null;
  });
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("autorización de /api/admin/products", () => {
  it.each([
    ["GET lista", () => list.GET(req("GET", undefined, null))],
    ["POST", () => list.POST(req("POST", payload(), null))],
    ["GET uno", () => item.GET(req("GET", undefined, null), ctx("colchon-cafetal"))],
    ["PUT", () => item.PUT(req("PUT", payload(), null), ctx("colchon-cafetal"))],
    ["PATCH", () => item.PATCH(req("PATCH", { active: false }, null), ctx("colchon-cafetal"))],
    ["DELETE", () => item.DELETE(req("DELETE", undefined, null), ctx("colchon-cafetal"))],
  ])("%s sin token → 401", async (_n, call) => {
    expect((await call()).status).toBe(401);
  });

  it.each([
    ["GET lista", (t: string) => list.GET(req("GET", undefined, t))],
    ["POST", (t: string) => list.POST(req("POST", withSkus(payload(), "NEW"), t))],
    ["PATCH", (t: string) => item.PATCH(req("PATCH", { active: false }, t), ctx("colchon-cafetal"))],
    ["DELETE", (t: string) => item.DELETE(req("DELETE", undefined, t), ctx("colchon-cafetal"))],
  ])("%s con usuario sin claim admin → 403 y no escribe", async (_n, call) => {
    expect((await call("user-token")).status).toBe(403);
    expect((await call("fake-claim")).status).toBe(403);
    expect(db.writes).toHaveLength(0);
  });

  it("token inválido → 401", async () => {
    expect((await list.GET(req("GET", undefined, "forged"))).status).toBe(401);
  });

  it("verifica el token comprobando revocación", async () => {
    await list.GET(req("GET"));
    expect(verifyBearer).toHaveBeenCalledWith("Bearer admin-token", { checkRevoked: true });
  });

  it("sin Firebase Admin configurado → 503", async () => {
    configured = false;
    expect((await list.GET(req("GET"))).status).toBe(503);
  });
});

describe("listar y leer", () => {
  it("lista también los inactivos y separa los documentos no válidos", async () => {
    db.store.set("products/oculto", { ...withSkus(payload({ slug: "oculto", name: "Oculto" }), "OCU"), active: false });
    db.store.set("products/roto", { name: 1 });
    const res = await list.GET(req("GET"));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.products.map((p: { slug: string }) => p.slug).sort()).toEqual(["colchon-cafetal", "oculto"]);
    expect(body.invalid).toEqual([expect.objectContaining({ slug: "roto" })]);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("GET de un slug inexistente → 404; slug malicioso → 400", async () => {
    expect((await item.GET(req("GET"), ctx("no-existe"))).status).toBe(404);
    expect((await item.GET(req("GET"), ctx("../users/x"))).status).toBe(400);
  });
});

describe("crear", () => {
  it("crea el producto con priceFrom calculado, updatedAt/createdAt de servidor y revalida la tienda", async () => {
    const res = await list.POST(req("POST", withSkus(payload(), "NEW")));
    expect(res.status).toBe(201);
    const doc = db.store.get("products/colchon-nuevo")!;
    expect(doc.name).toBe("Colchón Nuevo");
    expect(doc.priceFrom).toBe(349);
    expect(doc.currency).toBe("EUR");
    expect(doc.updatedAt).toBeInstanceOf(Date);
    expect(doc.createdAt).toBeInstanceOf(Date);
    expect(revalidatePath).toHaveBeenCalledWith("/");
    expect(revalidatePath).toHaveBeenCalledWith("/productos/colchon-nuevo");
    expect(revalidatePath).toHaveBeenCalledWith("/productos/[slug]", "page");
  });

  it("slug duplicado → 409 sin sobrescribir", async () => {
    const res = await list.POST(req("POST", withSkus(payload({ slug: "colchon-cafetal" }), "NEW")));
    expect(res.status).toBe(409);
    expect((await res.json()).field).toBe("slug");
    expect(db.store.get("products/colchon-cafetal")!.name).toBe("Colchón Cafetal");
  });

  it("SKU que ya usa otro producto → 409", async () => {
    const res = await list.POST(req("POST", payload())); // mismos SKU que colchon-cafetal
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/CAF-090190-BRI-ALG.*colchon-cafetal/);
    expect(db.store.has("products/colchon-nuevo")).toBe(false);
  });

  it("SKU repetido dentro del producto → 400", async () => {
    const p = withSkus(payload(), "NEW");
    p.variants[1].sku = p.variants[0].sku;
    const res = await list.POST(req("POST", p));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.fields["variants.1.sku"]).toMatch(/SKU repetido/);
  });

  it.each([
    ["slug con mayúsculas", { slug: "Colchon Nuevo" }],
    ["slug con barra", { slug: "a/b" }],
    ["sin nombre", { name: "" }],
    ["sin variantes", { variants: [] }],
    ["sin opciones", { options: [] }],
    ["imagen de otro dominio", { images: ["https://evil.example/x.jpg"] }],
    ["imagen javascript:", { images: ["javascript:alert(1)"] }],
    ["imagen con ..", { images: ["/images/../../etc/passwd.jpg"] }],
    ["campo desconocido", { priceFrom: 1 }],
    ["precio negativo", "neg"],
    ["precio en texto", "str"],
    ["variante con valor que no existe", "badopt"],
    ["detalles de una opción inexistente", { optionDetails: { Color: { Rojo: { a: 1 } } } }],
  ])("%s → 400", async (_n, change) => {
    let p = withSkus(payload(), "NEW");
    if (change === "neg") p.variants[0].price = -1;
    else if (change === "str") (p.variants[0] as Record<string, unknown>).price = "100";
    else if (change === "badopt") p.variants[0].options = { ...p.variants[0].options, Medida: "999×999" };
    else p = { ...p, ...(change as object) } as typeof p;
    const res = await list.POST(req("POST", p));
    expect(res.status).toBe(400);
    expect(db.store.has("products/colchon-nuevo")).toBe(false);
  });

  it("JSON mal formado → 400", async () => {
    expect((await list.POST(req("POST", undefined, "admin-token", "{no json"))).status).toBe(400);
  });
});

describe("editar, activar y borrar", () => {
  it("PUT sustituye el producto, conserva createdAt y revalida", async () => {
    db.store.set("products/colchon-cafetal", { ...db.store.get("products/colchon-cafetal")!, createdAt: "original" });
    const p = payload({ slug: "colchon-cafetal", name: "Cafetal renovado" });
    p.variants[0].price = 300;
    p.variants[0].inStock = false;
    const res = await item.PUT(req("PUT", p), ctx("colchon-cafetal"));
    expect(res.status).toBe(200);
    const doc = db.store.get("products/colchon-cafetal")!;
    expect(doc.name).toBe("Cafetal renovado");
    expect(doc.priceFrom).toBe(300);
    expect(doc.createdAt).toBe("original");
    expect(revalidatePath).toHaveBeenCalledWith("/productos/colchon-cafetal");
  });

  it("PUT no puede cambiar el slug (inmutable)", async () => {
    const res = await item.PUT(req("PUT", payload({ slug: "otro-slug" })), ctx("colchon-cafetal"));
    expect(res.status).toBe(400);
    expect(db.store.has("products/otro-slug")).toBe(false);
  });

  it("PUT de un producto inexistente → 404", async () => {
    const res = await item.PUT(req("PUT", withSkus(payload({ slug: "fantasma" }), "FAN")), ctx("fantasma"));
    expect(res.status).toBe(404);
  });

  it("PUT con SKU de otro producto → 409", async () => {
    db.store.set("products/colchon-caribe", structuredClone(raw.products[1]));
    const p = payload({ slug: "colchon-cafetal" });
    p.variants[0].sku = raw.products[1].variants[0].sku;
    expect((await item.PUT(req("PUT", p), ctx("colchon-cafetal"))).status).toBe(409);
  });

  it("PATCH activa/desactiva; cuerpo distinto de {active} → 400", async () => {
    expect((await item.PATCH(req("PATCH", { active: false }), ctx("colchon-cafetal"))).status).toBe(200);
    expect(db.store.get("products/colchon-cafetal")!.active).toBe(false);
    expect((await item.PATCH(req("PATCH", { active: "no" }), ctx("colchon-cafetal"))).status).toBe(400);
    expect((await item.PATCH(req("PATCH", { active: true, name: "x" }), ctx("colchon-cafetal"))).status).toBe(400);
    expect((await item.PATCH(req("PATCH", { active: true }), ctx("no-existe"))).status).toBe(404);
  });

  it("DELETE borra el documento y revalida; borrar otra vez → 404", async () => {
    expect((await item.DELETE(req("DELETE"), ctx("colchon-cafetal"))).status).toBe(200);
    expect(db.store.has("products/colchon-cafetal")).toBe(false);
    expect(revalidatePath).toHaveBeenCalledWith("/");
    expect((await item.DELETE(req("DELETE"), ctx("colchon-cafetal"))).status).toBe(404);
  });

  it("error inesperado de Firestore → 500 genérico sin filtrar detalles", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    db.failWith = new Error("DEADLINE_EXCEEDED secreto interno");
    const res = await list.GET(req("GET"));
    expect(res.status).toBe(500);
    expect(JSON.stringify(await res.json())).not.toContain("secreto");
  });
});
