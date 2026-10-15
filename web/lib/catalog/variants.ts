import { comboKey, type AdminOption, type AdminVariant } from "./admin-schema";

/** Utilidades puras del generador de variantes del panel (sin dependencias de React ni Firebase). */

/** Producto cartesiano de los valores de las opciones, en el orden de las opciones. */
export function combinations(options: AdminOption[]): Record<string, string>[] {
  const usable = options.filter((o) => o.name.trim() && o.values.length > 0);
  if (usable.length === 0) return [];
  return usable.reduce<Record<string, string>[]>(
    (acc, opt) => acc.flatMap((combo) => opt.values.map((value) => ({ ...combo, [opt.name]: value }))),
    [{}],
  );
}

/** Fragmento de SKU para un valor: sin tildes, mayúsculas y alfanumérico ("Algodón Tolima" → "ALGODO"). */
export function skuPart(value: string, max = 6): string {
  const clean = value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  return clean.slice(0, max) || "X";
}

/** Prefijo de SKU a partir del slug: "colchon-cafetal" → "CAF". */
export function skuPrefixFromSlug(slug: string): string {
  const words = slug.split("-").filter((w) => w && w !== "colchon");
  const base = words[0] ?? slug;
  return skuPart(base, 3) || "PRD";
}

export function buildSku(prefix: string, combo: Record<string, string>, optionNames: string[]): string {
  return [skuPart(prefix, 8), ...optionNames.map((n) => skuPart(combo[n] ?? ""))].join("-").slice(0, 40);
}

/**
 * Genera una variante por combinación de opciones. Conserva las variantes existentes que encajan
 * (con su SKU, precio y stock) y crea las que faltan con `basePrice` y en stock. Las variantes que ya
 * no corresponden a ninguna combinación se devuelven aparte para que el usuario decida.
 */
export function generateVariants(args: {
  options: AdminOption[];
  existing: AdminVariant[];
  prefix: string;
  basePrice: number;
}): { variants: AdminVariant[]; added: number; orphaned: AdminVariant[] } {
  const names = args.options.filter((o) => o.name.trim() && o.values.length > 0).map((o) => o.name);
  const byCombo = new Map(args.existing.map((v) => [comboKey(names, v.options), v]));
  const usedSkus = new Set(args.existing.map((v) => v.sku));
  const variants: AdminVariant[] = [];
  const kept = new Set<AdminVariant>();
  let added = 0;

  for (const combo of combinations(args.options)) {
    const found = byCombo.get(comboKey(names, combo));
    if (found && Object.keys(found.options).length === names.length) {
      variants.push(found);
      kept.add(found);
      continue;
    }
    let sku = buildSku(args.prefix, combo, names);
    for (let n = 2; usedSkus.has(sku); n += 1) sku = `${buildSku(args.prefix, combo, names).slice(0, 36)}-${n}`;
    usedSkus.add(sku);
    variants.push({ sku, options: combo, price: args.basePrice, currency: "EUR", inStock: true });
    added += 1;
  }
  const orphaned = args.existing.filter((v) => !kept.has(v));
  return { variants, added, orphaned };
}
