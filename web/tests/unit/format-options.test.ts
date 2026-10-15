import { describe, expect, it } from "vitest";
import { formatOptions, orderedOptionEntries } from "@/lib/format";

describe("formatOptions (QA: opciones en distinto orden en el detalle del pedido)", () => {
  it("ordena siempre Medida · Núcleo · Funda, venga como venga el mapa", () => {
    const deFirestore = { Funda: "Algodón Tolima", Medida: "90×190", Núcleo: "Brisa" }; // orden alfabético
    const deStripe = { Núcleo: "Brisa", Funda: "Algodón Tolima", Medida: "135×190" };
    expect(formatOptions(deFirestore)).toBe("90×190 · Brisa · Algodón Tolima");
    expect(formatOptions(deStripe)).toBe("135×190 · Brisa · Algodón Tolima");
  });

  it("pone las opciones desconocidas al final y admite otro separador", () => {
    expect(formatOptions({ Color: "Arena", Funda: "Térmica Páramo", Medida: "150×190" }, ", ")).toBe(
      "150×190, Térmica Páramo, Arena",
    );
    expect(orderedOptionEntries(undefined)).toEqual([]);
  });
});
