import type { AdminProductInput } from "@/lib/catalog/admin-schema";
import type { Product } from "@/lib/catalog/types";

/**
 * Modelo editable del formulario de producto (números como texto, detalles como filas clave/valor) y
 * conversión a/desde el payload que valida `adminProductSchema`. Lógica pura, sin React.
 */
export type DetailRow = { key: string; value: string };
export type FormVariant = { sku: string; options: Record<string, string>; price: string; inStock: boolean };
export type FormOption = { name: string; values: string[] };

export type ProductFormState = {
  slug: string;
  name: string;
  shortDescription: string;
  description: string;
  images: string[];
  options: FormOption[];
  /** optionDetails[opción][valor] = filas clave/valor */
  details: Record<string, Record<string, DetailRow[]>>;
  features: string[];
  /** Etiqueta de la tarjeta en la home; texto vacío = sin etiqueta. */
  badgeText: string;
  badgeTone: "destacado" | "nuevo";
  variants: FormVariant[];
  active: boolean;
};

export const DEFAULT_OPTIONS: FormOption[] = [
  { name: "Medida", values: ["90×190", "135×190", "150×190"] },
  { name: "Núcleo", values: ["Brisa"] },
  { name: "Funda", values: ["Algodón Tolima"] },
];

export function emptyForm(): ProductFormState {
  return {
    slug: "",
    name: "",
    shortDescription: "",
    description: "",
    images: [],
    options: DEFAULT_OPTIONS.map((o) => ({ ...o, values: [...o.values] })),
    details: {},
    features: [],
    badgeText: "",
    badgeTone: "destacado",
    variants: [],
    active: false,
  };
}

export function productToForm(p: Product): ProductFormState {
  const details: ProductFormState["details"] = {};
  for (const [opt, byValue] of Object.entries(p.optionDetails ?? {})) {
    details[opt] = {};
    for (const [value, fields] of Object.entries(byValue)) {
      details[opt][value] = Object.entries(fields).map(([key, v]) => ({ key, value: String(v) }));
    }
  }
  return {
    slug: p.slug,
    name: p.name,
    shortDescription: p.shortDescription ?? "",
    description: p.description ?? "",
    images: [...p.images],
    options: p.options.map((o) => ({ name: o.name, values: [...o.values] })),
    details,
    features: [...p.features],
    badgeText: p.badge?.text ?? "",
    badgeTone: p.badge?.tone ?? "destacado",
    variants: p.variants.map((v) => ({ sku: v.sku, options: { ...v.options }, price: String(v.price), inStock: v.inStock })),
    active: p.active,
  };
}

const NUMERIC = /^-?\d+(?:[.,]\d+)?$/;

/** "499,90" → 499.9; texto no numérico → NaN (lo rechaza el esquema con un mensaje claro). */
export function parsePrice(text: string): number {
  const t = text.trim().replace(",", ".");
  return t === "" || !/^-?\d+(?:\.\d+)?$/.test(t) ? Number.NaN : Number(t);
}

export function formToPayload(f: ProductFormState): AdminProductInput {
  const optionDetails: Record<string, Record<string, Record<string, string | number>>> = {};
  for (const [opt, byValue] of Object.entries(f.details)) {
    for (const [value, rows] of Object.entries(byValue)) {
      const fields: Record<string, string | number> = {};
      for (const row of rows) {
        const key = row.key.trim();
        if (!key) continue;
        const v = row.value.trim();
        fields[key] = NUMERIC.test(v) ? Number(v.replace(",", ".")) : v;
      }
      if (Object.keys(fields).length > 0) {
        optionDetails[opt] ??= {};
        optionDetails[opt][value] = fields;
      }
    }
  }
  return {
    slug: f.slug.trim(),
    name: f.name.trim(),
    shortDescription: f.shortDescription.trim(),
    description: f.description.trim(),
    images: f.images,
    options: f.options.map((o) => ({ name: o.name.trim(), values: o.values.map((v) => v.trim()) })),
    optionDetails,
    features: f.features.map((x) => x.trim()).filter(Boolean),
    badge: f.badgeText.trim() ? { text: f.badgeText.trim(), tone: f.badgeTone } : null,
    variants: f.variants.map((v) => ({
      sku: v.sku.trim().toUpperCase(),
      options: v.options,
      price: parsePrice(v.price),
      currency: "EUR" as const,
      inStock: v.inStock,
    })),
    active: f.active,
  };
}

/** Renombra una opción en variantes y detalles para no dejar combinaciones huérfanas. */
export function renameOption(f: ProductFormState, index: number, newName: string): ProductFormState {
  const oldName = f.options[index]?.name;
  if (oldName === undefined || oldName === newName) return f;
  const options = f.options.map((o, i) => (i === index ? { ...o, name: newName } : o));
  const variants = f.variants.map((v) => {
    if (!(oldName in v.options)) return v;
    const { [oldName]: value, ...rest } = v.options;
    return { ...v, options: { ...rest, [newName]: value } };
  });
  const details = { ...f.details };
  if (details[oldName] && !details[newName]) {
    details[newName] = details[oldName];
    delete details[oldName];
  }
  return { ...f, options, variants, details };
}

/** Renombra un valor de una opción en variantes y detalles. */
export function renameValue(f: ProductFormState, optIndex: number, valueIndex: number, newValue: string): ProductFormState {
  const opt = f.options[optIndex];
  const oldValue = opt?.values[valueIndex];
  if (!opt || oldValue === undefined || oldValue === newValue) return f;
  const clash = opt.values.includes(newValue);
  const options = f.options.map((o, i) =>
    i === optIndex ? { ...o, values: o.values.map((v, j) => (j === valueIndex ? newValue : v)) } : o,
  );
  const variants = clash
    ? f.variants
    : f.variants.map((v) => (v.options[opt.name] === oldValue ? { ...v, options: { ...v.options, [opt.name]: newValue } } : v));
  const details = { ...f.details };
  const byValue = details[opt.name];
  if (!clash && byValue?.[oldValue] && !byValue[newValue]) {
    const { [oldValue]: moved, ...rest } = byValue;
    details[opt.name] = { ...rest, [newValue]: moved };
  }
  return { ...f, options, variants, details };
}

/** Variantes cuyas opciones ya no encajan con las opciones actuales. */
export function orphanVariants(f: ProductFormState): FormVariant[] {
  const names = f.options.map((o) => o.name);
  return f.variants.filter(
    (v) =>
      Object.keys(v.options).length !== names.length ||
      !f.options.every((o) => o.values.includes(v.options[o.name] ?? "\u0000")),
  );
}
