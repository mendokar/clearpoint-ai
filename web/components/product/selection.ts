import { findVariant, type Product } from "@/lib/catalog/types";

/** Primera variante en stock (o la primera) como selección inicial. */
export function initialSelection(product: Product): Record<string, string> {
  const v = product.variants.find((x) => x.inStock) ?? product.variants[0];
  return v ? { ...v.options } : {};
}

/**
 * Aplica un cambio de opción garantizando que la selección resultante
 * corresponde a una variante existente. Si la combinación exacta no existe,
 * se elige la variante más parecida (prioriza en stock).
 */
export function resolveSelection(
  product: Product,
  current: Record<string, string>,
  option: string,
  value: string,
): Record<string, string> {
  const wanted = { ...current, [option]: value };
  if (findVariant(product, wanted)) return wanted;
  const candidates = product.variants.filter((v) => v.options[option] === value);
  if (candidates.length === 0) return current;
  const score = (opts: Record<string, string>) =>
    Object.entries(current).filter(([k, val]) => k !== option && opts[k] === val).length;
  const best = [...candidates].sort(
    (a, b) => Number(b.inStock) - Number(a.inStock) || score(b.options) - score(a.options),
  )[0];
  return { ...best.options };
}

/** Estado de un valor dado el resto de la selección: disponible, agotado o inexistente. */
export function valueState(
  product: Product,
  current: Record<string, string>,
  option: string,
  value: string,
): "ok" | "out" | "missing" {
  const exact = findVariant(product, { ...current, [option]: value });
  if (exact) return exact.inStock ? "ok" : "out";
  return product.variants.some((v) => v.options[option] === value) ? "ok" : "missing";
}
