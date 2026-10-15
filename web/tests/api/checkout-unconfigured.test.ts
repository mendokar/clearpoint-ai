import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/checkout/route";

describe("POST /api/checkout sin credenciales", () => {
  it("responde 503 controlado si faltan Firebase Admin o Stripe", async () => {
    const res = await POST(new Request("http://localhost/api/checkout", { method: "POST", body: "{}" }));
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/no está disponible/);
  });
});
