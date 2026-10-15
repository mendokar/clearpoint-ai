"use client";
import { useEffect, useState } from "react";

/** Evita desajustes de hidratación al leer el carrito persistido en localStorage. */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}
