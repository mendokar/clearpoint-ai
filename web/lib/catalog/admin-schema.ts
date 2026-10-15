import { z } from "zod";
import { ALLOWED_IMAGE_HOSTS, isAllowedStoragePath, storageBucketName } from "./image-hosts";

/**
 * Esquema de entrada del panel de administración para `products/{slug}`.
 * Se usa igual en el formulario (cliente) y en `/api/admin/products` (servidor), y es más estricto que
 * `productSchema` (types.ts), que valida lo que se LEE de Firestore. Todo producto que pasa este esquema
 * pasa también `productSchema`.
 */

export const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const SKU_RE = /^[A-Z0-9-]{3,40}$/; // mismo formato que acepta POST /api/checkout
export const LOCAL_IMAGE_RE = /^\/images\/[A-Za-z0-9][A-Za-z0-9._-]{0,120}\.(?:jpe?g|png|webp|avif)$/i;

export const slugSchema = z
  .string()
  .trim()
  .min(3, "El slug debe tener al menos 3 caracteres.")
  .max(80, "El slug admite como máximo 80 caracteres.")
  .regex(SLUG_RE, "Usa solo minúsculas, números y guiones (p. ej. colchon-nuevo).");

export function isAllowedImageUrl(value: string): boolean {
  if (LOCAL_IMAGE_RE.test(value)) return !value.includes("..");
  if (!value.startsWith("https://") || value.length > 500) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port &&
      (ALLOWED_IMAGE_HOSTS as readonly string[]).includes(url.hostname) &&
      isAllowedStoragePath(url.hostname, url.pathname) && !url.pathname.includes("..");
  } catch {
    return false;
  }
}

const imageSchema = z
  .string()
  .trim()
  .refine(isAllowedImageUrl, {
    message: `Usa una imagen de /images/…, una URL https de images.unsplash.com o una foto de Firebase Storage del bucket ${storageBucketName()}.`,
  });

const text = (max: number, label: string) => z.string().trim().max(max, `${label}: máximo ${max} caracteres.`);

export const adminOptionSchema = z
  .object({
    name: text(40, "Nombre de la opción").min(1, "La opción necesita un nombre."),
    values: z
      .array(text(60, "Valor").min(1, "Los valores no pueden estar vacíos."))
      .min(1, "Cada opción necesita al menos un valor.")
      .max(30, "Máximo 30 valores por opción."),
  })
  .strict();

export const adminVariantSchema = z
  .object({
    sku: z.string().trim().regex(SKU_RE, "SKU no válido: 3–40 caracteres en mayúsculas, números o guiones."),
    options: z.record(z.string()),
    price: z
      .number({ invalid_type_error: "El precio debe ser un número." })
      .min(0, "El precio no puede ser negativo.")
      .max(100_000, "Precio demasiado alto.")
      .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, "Máximo dos decimales."),
    currency: z.literal("EUR").default("EUR"),
    inStock: z.boolean(),
  })
  .strict();

const detailValue = z.union([text(500, "Detalle"), z.number().finite()]);

export const adminProductSchema = z
  .object({
    slug: slugSchema,
    name: text(120, "Nombre").min(2, "Escribe el nombre del producto."),
    shortDescription: text(240, "Descripción corta").default(""),
    description: text(5000, "Descripción").default(""),
    images: z.array(imageSchema).max(12, "Máximo 12 imágenes.").default([]),
    options: z.array(adminOptionSchema).min(1, "Añade al menos una opción (p. ej. Medida).").max(6, "Máximo 6 opciones."),
    optionDetails: z
      .record(z.record(z.record(detailValue)))
      .default({}),
    features: z.array(text(200, "Característica").min(1, "Las características no pueden estar vacías.")).max(20).default([]),
    badge: z
      .object({
        text: text(24, "Etiqueta").min(1, "Escribe el texto de la etiqueta o déjala vacía."),
        tone: z.enum(["destacado", "nuevo"]),
      })
      .strict()
      .nullable()
      .default(null),
    variants: z.array(adminVariantSchema).min(1, "Añade al menos una variante.").max(500, "Máximo 500 variantes."),
    active: z.boolean().default(true),
  })
  .strict()
  .superRefine((p, ctx) => {
    const dupImages = firstDuplicate(p.images);
    if (dupImages !== undefined) {
      ctx.addIssue({ code: "custom", path: ["images"], message: `Imagen repetida: ${dupImages}` });
    }

    const names = p.options.map((o) => o.name);
    const dupName = firstDuplicate(names);
    if (dupName !== undefined) {
      ctx.addIssue({ code: "custom", path: ["options"], message: `Opción repetida: ${dupName}` });
    }
    p.options.forEach((o, i) => {
      const dup = firstDuplicate(o.values);
      if (dup !== undefined) {
        ctx.addIssue({ code: "custom", path: ["options", i, "values"], message: `Valor repetido en ${o.name}: ${dup}` });
      }
    });

    for (const [optName, byValue] of Object.entries(p.optionDetails)) {
      const opt = p.options.find((o) => o.name === optName);
      if (!opt) {
        ctx.addIssue({ code: "custom", path: ["optionDetails", optName], message: `Detalles de una opción que no existe: ${optName}` });
        continue;
      }
      for (const value of Object.keys(byValue)) {
        if (!opt.values.includes(value)) {
          ctx.addIssue({
            code: "custom",
            path: ["optionDetails", optName, value],
            message: `Detalles de un valor que no existe: ${optName} = ${value}`,
          });
        }
      }
    }

    const seenSku = new Map<string, number>();
    const seenCombo = new Map<string, number>();
    p.variants.forEach((v, i) => {
      if (seenSku.has(v.sku)) {
        ctx.addIssue({ code: "custom", path: ["variants", i, "sku"], message: `SKU repetido: ${v.sku}` });
      }
      seenSku.set(v.sku, i);

      const keys = Object.keys(v.options);
      const valid =
        keys.length === p.options.length &&
        p.options.every((o) => typeof v.options[o.name] === "string" && o.values.includes(v.options[o.name]));
      if (!valid) {
        ctx.addIssue({
          code: "custom",
          path: ["variants", i, "options"],
          message: `La variante ${v.sku} debe tener un valor válido para cada opción (${names.join(", ")}).`,
        });
        return;
      }
      const combo = comboKey(p.options.map((o) => o.name), v.options);
      if (seenCombo.has(combo)) {
        ctx.addIssue({
          code: "custom",
          path: ["variants", i, "options"],
          message: `Combinación repetida en ${v.sku}: ${Object.values(v.options).join(" · ")}`,
        });
      }
      seenCombo.set(combo, i);
    });
  });

export type AdminProductInput = z.input<typeof adminProductSchema>;
export type AdminProduct = z.output<typeof adminProductSchema>;
export type AdminVariant = z.output<typeof adminVariantSchema>;
export type AdminOption = z.output<typeof adminOptionSchema>;

/** Cuerpo de PATCH /api/admin/products/[slug]. */
export const productActiveSchema = z.object({ active: z.boolean() }).strict();

export function comboKey(optionNames: string[], options: Record<string, string>): string {
  return JSON.stringify(optionNames.map((n) => options[n] ?? null));
}

function firstDuplicate<T>(items: T[]): T | undefined {
  const seen = new Set<T>();
  for (const item of items) {
    if (seen.has(item)) return item;
    seen.add(item);
  }
  return undefined;
}

/** Errores de Zod como `{ "variants.3.sku": "SKU repetido…" }` para pintarlos junto a cada campo. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    out[key] ??= issue.message;
  }
  return out;
}
