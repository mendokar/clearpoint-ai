const eur = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });

export function formatPrice(amount: number, currency = "EUR"): string {
  if (currency === "EUR") return eur.format(amount);
  return new Intl.NumberFormat("es-ES", { style: "currency", currency }).format(amount);
}

export function toDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === "object" && value !== null) {
    const v = value as { toDate?: () => Date; seconds?: number; _seconds?: number };
    if (typeof v.toDate === "function") return v.toDate();
    const s = v.seconds ?? v._seconds;
    if (typeof s === "number") return new Date(s * 1000);
  }
  return null;
}

export function formatDate(value: unknown, withTime = false): string {
  const d = toDate(value);
  if (!d) return "—";
  return new Intl.DateTimeFormat("es-ES", {
    day: "numeric",
    month: "long",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    timeZone: "Europe/Madrid",
  }).format(d);
}

/** Orden de presentación de las opciones de un colchón. Las desconocidas van después, por orden alfabético. */
const OPTION_ORDER = ["Medida", "Núcleo", "Funda"];

/**
 * Opciones en orden estable. Firestore devuelve los mapas con las claves ordenadas alfabéticamente y Stripe
 * en el orden de la sesión, así que no se puede confiar en el orden en que llegan (defecto de QA).
 */
export function orderedOptionEntries(options: Record<string, string> | null | undefined): [string, string][] {
  const rank = (k: string) => {
    const i = OPTION_ORDER.indexOf(k);
    return i === -1 ? OPTION_ORDER.length : i;
  };
  return Object.entries(options ?? {}).sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b, "es"));
}

/** "135×190 · Brisa · Algodón Tolima", siempre en el mismo orden. */
export function formatOptions(options: Record<string, string> | null | undefined, separator = " · "): string {
  return orderedOptionEntries(options)
    .map(([, v]) => v)
    .join(separator);
}

export const optionsLabel = formatOptions;
