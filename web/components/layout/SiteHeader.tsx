"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/components/auth/AuthProvider";
import { BagIcon, LockIcon, MoonIcon, NeedleIcon, TruckIcon } from "@/components/ui/Icons";
import { cartCount, useCart } from "@/lib/cart/store";
import { useHydrated } from "@/lib/cart/useHydrated";
import { toast } from "@/lib/ui/toast";
import { LogoMark } from "./Logo";
import { AdminNavLink } from "@/components/admin/AdminNavLink";

const TOPBAR = [
  { icon: TruckIcon, text: "Envío gratis a la España peninsular en 24 a 72 h" },
  { icon: MoonIcon, text: "30 noches de prueba en casa" },
  { icon: LockIcon, text: "Pago seguro con Stripe" },
  { icon: NeedleIcon, text: "Cosido a mano en Bogotá" },
];

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
  const topbarRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const bumping = useBump(hydrated ? count : null);

  useEffect(() => setOpen(false), [pathname]);

  // La cabecera se compacta y gana sombra en cuanto la barra superior sale de pantalla.
  useEffect(() => {
    const el = topbarRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setScrolled(!e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Escape cierra el menú móvil.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <TopBar ref={topbarRef} />
      <header className="site-header" data-scrolled={scrolled}>
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
              className={`icon-btn${bumping ? " is-bumping" : ""}`}
              href="/carrito"
              aria-label={shownCount ? `Carrito, ${shownCount} ${shownCount === 1 ? "producto" : "productos"}` : "Carrito vacío"}
            >
              <BagIcon />
              {shownCount > 0 && (
                <span className={`badge${bumping ? " is-bumping" : ""}`} aria-hidden="true">
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
          className="account-menu absolute top-[calc(100%+8px)] right-0 z-30 w-60 rounded-card border border-line bg-surface p-2 shadow-[0_12px_32px_rgba(44,27,18,.18)]"
          onKeyDown={(e) => e.key === "Escape" && setMenu(false)}
        >
          <p className="truncate px-3 pt-1 pb-2 text-sm text-muted">
            <span className="block font-semibold text-ink">{user.displayName ?? "Hola"}</span>
            {user.email}
          </p>
          <Link role="menuitem" href="/pedidos" className="block rounded-lg px-3 py-2 text-sm no-underline hover:bg-tint">
            Mis pedidos
          </Link>
          <AdminNavLink
            role="menuitem"
            onClick={() => setMenu(false)}
            className="block rounded-lg px-3 py-2 text-sm font-semibold text-aji-ink no-underline hover:bg-tint"
          />
          <button
            role="menuitem"
            type="button"
            onClick={() =>
              void signOut().then(() => toast({ text: "Has cerrado sesión. ¡Hasta pronto!", tone: "ok" }))
            }
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

/** Marca "bump" durante medio segundo cuando el número sube (al añadir al carrito). */
function useBump(value: number | null): boolean {
  const prev = useRef(value);
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (value !== null && prev.current !== null && value > prev.current) {
      setOn(false);
      const raf = requestAnimationFrame(() => setOn(true));
      const t = setTimeout(() => setOn(false), 600);
      prev.current = value;
      return () => {
        cancelAnimationFrame(raf);
        clearTimeout(t);
      };
    }
    prev.current = value;
  }, [value]);
  return on;
}

/** Barra superior en marquesina. Se pausa al pasar el ratón, con el foco o con el botón (WCAG 2.2.2). */
function TopBar({ ref }: { ref: React.Ref<HTMLDivElement> }) {
  const [paused, setPaused] = useState(false);
  const group = (hidden: boolean) => (
    <div className="marquee-group" aria-hidden={hidden || undefined}>
      {[...TOPBAR, ...TOPBAR].map(({ icon: Icon, text }, i) => (
        <span className="marquee-item" key={i} aria-hidden={i >= TOPBAR.length || undefined}>
          <Icon />
          {text}
        </span>
      ))}
    </div>
  );
  return (
    <div ref={ref} className="topbar" data-paused={paused}>
      <div className="marquee">
        {group(false)}
        {group(true)}
      </div>
      <button
        type="button"
        className="marquee-pause"
        onClick={() => setPaused((p) => !p)}
        aria-label={paused ? "Reanudar los mensajes" : "Pausar los mensajes"}
        aria-pressed={paused}
      >
        <svg viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
          {paused ? <path d="M3 2l7 4-7 4z" /> : <path d="M3 2h2v8H3zM7 2h2v8H7z" />}
        </svg>
      </button>
    </div>
  );
}
