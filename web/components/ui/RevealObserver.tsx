"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { prefersReducedMotion } from "@/lib/motion/hooks";

/**
 * Revelado al hacer scroll para cualquier elemento con `data-reveal` (o `data-reveal="stagger"` para
 * escalonar sus hijos). El contenido es visible en el HTML: solo aquí, ya con JS, se "arman" (ocultan)
 * los elementos que están por debajo de la pantalla, y se muestran al entrar en ella.
 * Sin IntersectionObserver o con movimiento reducido no se toca nada.
 */
export function RevealObserver() {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined" || prefersReducedMotion()) return;
    const timers = new Set<ReturnType<typeof setTimeout>>();

    const show = (el: Element) => {
      el.setAttribute("data-reveal-state", "in");
      // Al terminar se quita la transición del revelado para no interferir con los hovers.
      const t = setTimeout(() => {
        el.setAttribute("data-reveal-state", "done");
        timers.delete(t);
      }, 1500);
      timers.add(t);
    };

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            io.unobserve(e.target);
            show(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );

    const arm = (root: ParentNode) => {
      const vh = window.innerHeight;
      root.querySelectorAll("[data-reveal]:not([data-reveal-state])").forEach((el) => {
        const r = el.getBoundingClientRect();
        // Lo que ya se ve (o queda por encima) no se anima: evita parpadeos y saltos.
        if (r.top < vh * 0.92) {
          el.setAttribute("data-reveal-state", "done");
          return;
        }
        el.setAttribute("data-reveal-state", "armed");
        io.observe(el);
      });
    };

    const raf = requestAnimationFrame(() => arm(document));
    // Contenido que aparece después (carrito hidratado, pedidos cargados…).
    const mo = new MutationObserver((records) => {
      for (const r of records) {
        r.addedNodes.forEach((n) => {
          if (n instanceof Element) {
            if (n.matches("[data-reveal]") && n.parentNode) arm(n.parentNode);
            else arm(n);
          }
        });
      }
    });
    const main = document.getElementById("contenido") ?? document.body;
    mo.observe(main, { childList: true, subtree: true });

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      mo.disconnect();
      timers.forEach(clearTimeout);
      // Nada se queda oculto al cambiar de ruta.
      document
        .querySelectorAll('[data-reveal-state="armed"], [data-reveal-state="in"]')
        .forEach((el) => el.setAttribute("data-reveal-state", "done"));
    };
  }, [pathname]);

  return null;
}
