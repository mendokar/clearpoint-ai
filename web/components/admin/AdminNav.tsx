"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/admin", label: "Resumen", exact: true },
  { href: "/admin/productos", label: "Productos" },
  { href: "/admin/pedidos", label: "Pedidos" },
];

/** Pestañas del panel. */
export function AdminNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Secciones del panel" className="mb-8 overflow-x-auto overflow-y-hidden border-b border-line">
      <ul className="m-0 flex min-w-max list-none gap-1 p-0">
        {LINKS.map((l) => {
          const active = l.exact ? pathname === l.href : pathname.startsWith(l.href);
          return (
            <li key={l.href}>
              <Link
                href={l.href}
                aria-current={active ? "page" : undefined}
                className={`-mb-px inline-block border-b-2 px-4 py-2.5 font-medium no-underline transition-colors ${
                  active ? "border-aji text-aji-ink" : "border-transparent text-muted hover:text-ink"
                }`}
              >
                {l.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
