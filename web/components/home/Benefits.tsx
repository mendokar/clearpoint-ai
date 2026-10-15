const ITEMS: { title: string; text: string; icon: React.ReactNode }[] = [
  { title: "Transpirable", text: "Canales de aire que evitan el calor acumulado.", icon: <path d="M4 12c6-4 10 4 16 0s8-2 8-2M4 20c6-4 10 4 16 0s8-2 8-2" /> },
  { title: "Espalda alineada", text: "Firmeza por zonas para hombros, lumbares y cadera.", icon: <><path d="M16 4v24" /><path d="M10 9c3 2 3 5 0 7s-3 5 0 7M22 9c-3 2-3 5 0 7s3 5 0 7" /></> },
  { title: "Independencia de lechos", text: "No notas cuando tu pareja se da la vuelta.", icon: <><rect x="4" y="10" width="11" height="14" rx="2" /><rect x="17" y="10" width="11" height="14" rx="2" /></> },
  { title: "Libre de tóxicos", text: "Espumas certificadas y sin olores químicos.", icon: <><path d="M16 4c6 6 9 10 9 14a9 9 0 0 1-18 0c0-4 3-8 9-14z" /><path d="M12 19l3 3 5-6" /></> },
  { title: "Funda lavable", text: "Se quita con cremallera y va a la lavadora a 40 °C.", icon: <><rect x="6" y="4" width="20" height="24" rx="3" /><circle cx="16" cy="17" r="6" /><path d="M10 8h2" /></> },
  { title: "Hecho a medida", text: "Si tu cama no es estándar, lo cortamos a su medida.", icon: <><path d="M4 24L24 4l4 4L8 28z" /><path d="M9 19l2 2M13 15l2 2M17 11l2 2" /></> },
  { title: "Algodón colombiano", text: "Funda tejida con algodón cultivado en el Tolima.", icon: <><circle cx="16" cy="11" r="5" /><path d="M8 28c0-5 3.5-9 8-9s8 4 8 9" /><path d="M5 14l3 1M27 14l-3 1" /></> },
  { title: "Llega en 24 a 72 h", text: "Envío gratis a la península, con seguimiento.", icon: <><rect x="4" y="9" width="17" height="13" /><path d="M21 13h4l3 4v5h-7" /><circle cx="10" cy="24" r="2.5" /><circle cx="24" cy="24" r="2.5" /></> },
];

export function Benefits({ limit }: { limit?: number }) {
  const items = limit ? ITEMS.slice(0, limit) : ITEMS;
  return (
    <div
      className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line md:grid-cols-4"
      data-reveal="stagger"
    >
      {items.map((b) => (
        <div key={b.title} className="benefit flex flex-col gap-2 bg-surface p-[1.1rem] min-[421px]:p-6">
          <span className="benefit-icon" aria-hidden="true">
            <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="2">
              {b.icon}
            </svg>
          </span>
          <h3 className="text-[1.1rem] font-semibold">{b.title}</h3>
          <p className="text-[.92rem] text-muted">{b.text}</p>
        </div>
      ))}
    </div>
  );
}
