"use client";

import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "@/lib/motion/hooks";

/**
 * Número que sube de 0 a `to` al entrar en pantalla. En el HTML (y sin JS) ya pone `to`; solo se
 * reinicia a 0 si el elemento está fuera de la pantalla al montar, así nunca se ve un 0 "atascado".
 */
export function CountUp({ to, duration = 1400 }: { to: number; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [n, setN] = useState(to);

  useEffect(() => {
    const el = ref.current;
    if (!el || prefersReducedMotion() || typeof IntersectionObserver === "undefined") return;
    if (el.getBoundingClientRect().top < window.innerHeight) return;
    setN(0);
    let raf = 0;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        const start = performance.now();
        const tick = (now: number) => {
          const t = Math.min(1, (now - start) / duration);
          setN(Math.round(to * (1 - Math.pow(1 - t, 4))));
          if (t < 1) raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
      },
      { threshold: 0.6 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
      setN(to);
    };
  }, [to, duration]);

  return (
    <span ref={ref}>
      <span className="count-num" aria-hidden="true">
        {n}
      </span>
      <span className="sr-only">{to}</span>
    </span>
  );
}
