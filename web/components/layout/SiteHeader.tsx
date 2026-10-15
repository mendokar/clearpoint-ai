"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { cartCount, useCart } from "@/lib/cart/store";
import { useHydrated } from "@/lib/cart/useHydrated";
import { LogoMark } from "./Logo";

const NAV = [
  { href: "/#productos", label: "Colchones" },
  { href: "/#nucleos", label: "Núcleos" },
  { href: "/#taller", label: "El taller" },
  { href: "/envios-y-devoluciones", label: "Envíos y devoluciones" },
  { href: "/pedidos", label: "Mis pedidos" },
];

export function SiteHeader() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const hydrated = useHydrated();
  const count = useCart((s) => cartCount(s.lines));
  const shownCount = hydrated ? count : 0;

  useEffect(() => setOpen(false), [pathname]);

  return (
    <>
      <div className="topbar">
        <div className="wrap">
          <span>Envío gratis a la España peninsular en 24 a 72 h</span>
          <span>30 noches de prueba</span>
          <span>Cosido a mano en Medellín</span>
        </div>
      </div>
      <header className="site-header">
        <div className="wrap">
          <Link className="logo" href="/" aria-label="Colchones Contoso, inicio">
            <LogoMark />
            <span>
              <b>contoso</b>
              <small>colchones</small>
            </span>
          </Link>
          <nav className={`main-nav${open ? " open" : ""}`} id="main-nav" aria-label="Principal">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                aria-current={pathname === item.href ? "page" : undefined}
                onClick={() => setOpen(false)}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="header-actions">
            <AccountButton />
            <Link
              className="icon-btn"
              href="/carrito"
              aria-label={shownCount ? `Carrito, ${shownCount} ${shownCount === 1 ? "producto" : "productos"}` : "Carrito vacío"}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M5 7h14l-1.5 12h-11z" />
                <path d="M9 7a3 3 0 0 1 6 0" />
              </svg>
              {shownCount > 0 && (
                <span className="badge" aria-hidden="true">
                  {shownCount > 99 ? "99+" : shownCount}
                </span>
              )}
            </Link>
            <button
              className="icon-btn menu-toggle"
              type="button"
              aria-label={open ? "Cerrar menú" : "Abrir menú"}
              aria-expanded={open}
              aria-controls="main-nav"
              onClick={() => setOpen((o) => !o)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
              </svg>
            </button>
          </div>
        </div>
      </header>
    </>
  );
}

function AccountButton() {
  const { user, loading, signOut } = useAuth();
  const [menu, setMenu] = useState(false);
  const pathname = usePathname();
  useEffect(() => setMenu(false), [pathname]);

  if (loading || !user) {
    return (
      <Link className="icon-btn" href="/login" aria-label="Iniciar sesión">
        <UserIcon />
      </Link>
    );
  }

  const name = user.displayName || user.email || "Mi cuenta";
  const initial = name.trim().charAt(0).toUpperCase();

  return (
    <div className="relative">
      <button
        type="button"
        className="icon-btn overflow-hidden"
        aria-label={`Mi cuenta: ${name}`}
        aria-expanded={menu}
        aria-haspopup="menu"
        onClick={() => setMenu((m) => !m)}
      >
        {user.photoURL ? (
          // eslint-disable-next-line @next/next/no-img-element -- foto de perfil de Google, dominio externo
          <img src={user.photoURL} alt="" className="h-full w-full rounded-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          <span className="font-display text-base font-bold" aria-hidden="true">
            {initial}
          </span>
        )}
      </button>
      {menu && (
        <div
          role="menu"
          className="absolute top-[calc(100%+8px)] right-0 z-30 w-60 rounded-card border border-line bg-surface p-2 shadow-[0_12px_32px_rgba(44,27,18,.18)]"
          onKeyDown={(e) => e.key === "Escape" && setMenu(false)}
        >
          <p className="truncate px-3 pt-1 pb-2 text-sm text-muted">
            <span className="block font-semibold text-ink">{user.displayName ?? "Hola"}</span>
            {user.email}
          </p>
          <Link role="menuitem" href="/pedidos" className="block rounded-lg px-3 py-2 text-sm no-underline hover:bg-tint">
            Mis pedidos
          </Link>
          <button
            role="menuitem"
            type="button"
            onClick={() => void signOut()}
            className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-tint"
          >
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}

function UserIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
    </svg>
  );
}
