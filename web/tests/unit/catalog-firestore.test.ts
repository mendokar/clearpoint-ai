import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import raw from "../../../data/catalog.json";
import { parseFirestoreProduct, toPlain } from "@/lib/catalog/repository";

/** Imita un Timestamp de Firestore: objeto de clase con toDate(), no serializable para Next.js. */
class FakeTimestamp {
  constructor(private ms: number) {}
  toDate() {
    return new Date(this.ms);
  }
}

const isPlain = (v: unknown): boolean => {
  if (v === null || typeof v !== "object") return true;
  if (Array.isArray(v)) return v.every(isPlain);
  const proto = Object.getPrototypeOf(v);
  return (proto === Object.prototype || proto === null) && Object.values(v).every(isPlain);
};

describe("producto leído de Firestore", () => {
  it("convierte los Timestamp a ISO y deja un objeto plano apto para componentes de cliente", () => {
    const doc = { ...raw.products[0], updatedAt: new FakeTimestamp(Date.UTC(2026, 9, 15, 8, 0, 0)) };
    const parsed = parseFirestoreProduct(doc);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect((parsed.data as Record<string, unknown>).updatedAt).toBe("2026-10-15T08:00:00.000Z");
    expect(isPlain(parsed.data)).toBe(true);
  });

  it("convierte Timestamp anidados y deja intactos los demás valores", () => {
    expect(toPlain({ a: [new FakeTimestamp(0)], b: { c: 1, d: "x", e: null } })).toEqual({
      a: ["1970-01-01T00:00:00.000Z"],
      b: { c: 1, d: "x", e: null },
    });
  });
});
