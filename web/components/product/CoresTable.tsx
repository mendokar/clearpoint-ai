import type { Product } from "@/lib/catalog/types";

type Core = Record<string, string | number>;

/** Tabla comparativa de núcleos (Brisa / Ceiba+) a partir de optionDetails del catálogo. */
export function CoresTable({ product, caption }: { product: Product; caption?: string }) {
  const cores = product.optionDetails?.["Núcleo"] ?? {};
  const names = Object.keys(cores);
  if (names.length === 0) return null;
  const get = (n: string): Core => cores[n] ?? {};
  const rows: { label: string; render: (c: Core) => string; mono?: boolean }[] = [
    { label: "Altura total", render: (c) => (c.alturaCm ? `${c.alturaCm} cm` : "—"), mono: true },
    { label: "Peso máx. por persona", render: (c) => (c.pesoMaxPorPersonaKg ? `${c.pesoMaxPorPersonaKg} kg` : "—"), mono: true },
    { label: "Capas", render: (c) => String(c.capas ?? "—"), mono: true },
    { label: "Zonas de confort", render: (c) => String(c.zonasConfort ?? "—"), mono: true },
    { label: "Canales de aire", render: (c) => (c.extra ? "Más anchos" : "Estándar") },
    { label: "Garantía", render: (c) => (c.garantiaAnos ? `${c.garantiaAnos} años` : "—"), mono: true },
  ];
  const recommended = names[names.length - 1];
  return (
    <div className="cores-wrap">
      <table className="ct">
        {caption && <caption className="sr-only">{caption}</caption>}
        <thead>
          <tr>
            <td />
            {names.map((n) => (
              <th scope="col" key={n}>
                {n}
                {n === recommended && <span className="pill">Recomendado</span>}
                <span className="sub">Núcleo {String(get(n).tipo ?? "").toLowerCase()}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.label}>
              <th scope="row">{row.label}</th>
              {names.map((n) => (
                <td key={n} className={`${row.mono ? "mono " : ""}${n === recommended ? "plus" : ""}`}>
                  {row.render(get(n))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
