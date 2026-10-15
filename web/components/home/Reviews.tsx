const DEMO_REVIEWS = [
  {
    stars: 5,
    text: "Llevaba años levantándome con dolor lumbar. Con el Cafetal Ceiba+ duermo del tirón y me levanto bien.",
    name: "Valentina R.",
    detail: "Cafetal · 150×190 · Ceiba+",
    slug: "colchon-cafetal",
  },
  {
    stars: 5,
    text: "En Sevilla el calor no perdona. El Caribe con funda de algodón es el primer colchón con el que no sudo.",
    name: "Javier M.",
    detail: "Caribe · 160×200 · Brisa",
    slug: "colchon-caribe",
  },
  {
    stars: 4,
    text: "Le pregunté al asistente por mi pedido a las once de la noche y me dio el número de seguimiento al momento.",
    name: "Camila S.",
    detail: "Caribe · 135×190 · Ceiba+",
    slug: "colchon-caribe",
  },
  {
    stars: 5,
    text: "Lo pedí a medida para una cama antigua de mi abuela. Encajó perfecto y la funda Térmica Páramo es una maravilla en invierno.",
    name: "Lucía P.",
    detail: "Cafetal · A medida · Brisa",
    slug: "colchon-cafetal",
  },
];

/** Opiniones de ejemplo (demo), no son reseñas reales. */
export function Reviews({ slug, title = "Lo que dicen quienes ya duermen en Contoso" }: { slug?: string; title?: string }) {
  const list = (slug ? DEMO_REVIEWS.filter((r) => r.slug === slug) : DEMO_REVIEWS.slice(0, 3)).slice(0, 3);
  return (
    <>
      <div className="section-head">
        <div>
          <span className="eyebrow">Opiniones</span>
          <h2>{title}</h2>
        </div>
        <p className="mono text-xs text-muted">Opiniones de ejemplo para la demo</p>
      </div>
      <div className="grid gap-5 md:grid-cols-3">
        {list.map((r) => (
          <article key={r.name} className="card flex flex-col gap-4 p-6">
            <div className="tracking-[.15em] text-panela" role="img" aria-label={`${r.stars} de 5 estrellas`}>
              {"★".repeat(r.stars)}
              {"☆".repeat(5 - r.stars)}
            </div>
            <blockquote className="m-0 text-[.98rem]">{r.text}</blockquote>
            <footer className="mt-auto text-sm text-muted">
              <b className="block text-ink">{r.name}</b>
              {r.detail}
            </footer>
          </article>
        ))}
      </div>
    </>
  );
}
