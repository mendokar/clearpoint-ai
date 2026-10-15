import { beforeEach, describe, expect, it, vi } from "vitest";
import { FakeFirestore } from "../helpers/fakeFirestore";

const verifyBearer = vi.fn();
let db: FakeFirestore;

vi.mock("@/lib/firebase/admin", () => ({
  isAdminConfigured: () => true,
  getAdminDb: () => db,
  verifyBearer: (h: string | null) => verifyBearer(h),
}));

const { POST } = await import("@/app/api/users/me/route");

const req = (token?: string, body?: unknown) =>
  new Request("http://localhost/api/users/me", {
    method: "POST",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: body ? JSON.stringify(body) : undefined,
  });

beforeEach(() => {
  db = new FakeFirestore();
  verifyBearer.mockImplementation(async (h: string | null) =>
    h === "Bearer google-token"
      ? {
          uid: "uid-google",
          email: "ana@gmail.com",
          name: "Ana",
          picture: "https://lh3.googleusercontent.com/a/x",
          firebase: { sign_in_provider: "google.com" },
        }
      : null,
  );
});

describe("POST /api/users/me", () => {
  it("sin token → 401", async () => {
    expect((await POST(req())).status).toBe(401);
    expect(db.writes).toHaveLength(0);
  });

  it("token inválido → 401", async () => {
    expect((await POST(req("bad"))).status).toBe(401);
    expect(db.writes).toHaveLength(0);
  });

  it("escribe solo users/{uid del token}, ignorando el cuerpo", async () => {
    const res = await POST(req("google-token", { uid: "victima", email: "hack@evil.com", provider: "admin" }));
    expect(res.status).toBe(200);
    expect(db.writes).toEqual(["users/uid-google"]);
    const user = db.store.get("users/uid-google")!;
    expect(user).toMatchObject({
      email: "ana@gmail.com",
      displayName: "Ana",
      photoURL: "https://lh3.googleusercontent.com/a/x",
      provider: "google.com",
    });
    expect(user.createdAt).toBeDefined();
    expect(db.store.has("users/victima")).toBe(false);
  });

  it("es idempotente: un segundo acceso no cambia createdAt", async () => {
    await POST(req("google-token"));
    db.store.set("users/uid-google", { ...db.store.get("users/uid-google")!, createdAt: "original" });
    await POST(req("google-token"));
    expect(db.store.get("users/uid-google")!.createdAt).toBe("original");
  });
});
