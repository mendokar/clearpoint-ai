"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

const REDUCED = "(prefers-reduced-motion: reduce)";

/** true si el usuario pide menos movimiento. En SSR y sin matchMedia devuelve false. */
export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(REDUCED).matches;
}

const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);

/**
 * Interpola un número hacia `value` con requestAnimationFrame (para precios y totales).
 * Con movimiento reducido salta directamente al valor final.
 */
export function useTweenNumber(value: number, duration = 450): number {
  const [shown, setShown] = useState(value);
  const shownRef = useRef(value);
  shownRef.current = shown;

  useEffect(() => {
    if (prefersReducedMotion() || typeof requestAnimationFrame !== "function") {
      setShown(value);
      return;
    }
    const from = shownRef.current;
    if (from === value) return;
    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setShown(from + (value - from) * easeOut(t));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return shown;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Atrapa el foco dentro de `ref` mientras `active`: Tab y Mayús+Tab ciclan entre los elementos
 * enfocables. Al desactivarse devuelve el foco al elemento que lo tenía antes.
 */
export function useFocusTrap<T extends HTMLElement>(
  ref: RefObject<T | null>,
  active: boolean,
  { initial }: { initial?: RefObject<HTMLElement | null> } = {},
) {
  useEffect(() => {
    if (!active) return;
    const root = ref.current;
    if (!root) return;
    const previous = document.activeElement as HTMLElement | null;
    const focusables = () =>
      Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.closest("[hidden],[inert]"));

    const first = initial?.current ?? focusables()[0] ?? root;
    // Tras el primer frame para no pelear con la animación de entrada.
    const raf = requestAnimationFrame(() => first.focus({ preventScroll: true }));

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const list = focusables();
      if (list.length === 0) {
        e.preventDefault();
        return;
      }
      const firstEl = list[0];
      const lastEl = list[list.length - 1];
      const current = document.activeElement;
      if (e.shiftKey && (current === firstEl || !root.contains(current))) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && (current === lastEl || !root.contains(current))) {
        e.preventDefault();
        firstEl.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKey);
      if (previous && document.contains(previous)) previous.focus({ preventScroll: true });
    };
  }, [active, ref, initial]);
}
