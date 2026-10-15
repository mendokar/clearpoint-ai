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

export function optionsLabel(options: Record<string, string>): string {
  return Object.values(options).join(" · ");
}
