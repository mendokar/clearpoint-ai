"use client";

import { Children, useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Carrusel con scroll-snap en móvil (desliza con el dedo; puntos para saltar) y rejilla en escritorio.
 * Sin JS sigue siendo un carril desplazable.
 */
export function ReviewsTrack({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const count = Children.count(children);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const first = el.firstElementChild as HTMLElement | null;
        if (!first) return;
        const step = first.offsetWidth + parseFloat(getComputedStyle(el).columnGap || "0");
        setActive(Math.min(count - 1, Math.round(el.scrollLeft / Math.max(1, step))));
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [count]);

  const go = (i: number) => {
    const el = ref.current;
    const target = el?.children[i] as HTMLElement | undefined;
    if (el && target) el.scrollTo({ left: target.offsetLeft - el.offsetLeft - 20, behavior: "smooth" });
  };

  return (
    <>
      <div ref={ref} className="reviews-track" data-reveal="stagger" tabIndex={0} aria-label="Opiniones (desliza para ver más)" role="region">
        {children}
      </div>
      {count > 1 && (
        <div className="reviews-dots mt-1 flex justify-center gap-1 md:hidden">
          {Array.from({ length: count }, (_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Ver opinión ${i + 1} de ${count}`}
              aria-current={i === active ? "true" : undefined}
              onClick={() => go(i)}
            >
              <span aria-hidden="true" />
            </button>
          ))}
        </div>
      )}
    </>
  );
}
