/** Paleta y formato compartidos por las plantillas nuevas (aviso a la tienda y cambios de estado). */
export const emailColors = {
  bg: "#F7EEE4",
  surface: "#FFFAF4",
  ink: "#2C1B12",
  muted: "#6E5546",
  line: "#E2CDBA",
  aji: "#D9542B",
  panela: "#C4862C",
};

export const eur = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" });

/** "2026-10-22" → "jueves, 22 de octubre de 2026" (la fecha es local, sin zona horaria). */
export function longDate(iso: string | null | undefined): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso ?? "";
  const d = new Date(`${iso}T12:00:00Z`);
  return new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(d);
}
