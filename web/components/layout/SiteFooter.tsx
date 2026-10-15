import Link from "next/link";
import { LogoMark } from "./Logo";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="wayuu" role="presentation" />
      <div className="wrap cols">
        <div className="brand">
          <Link className="logo" href="/" aria-label="Colchones Contoso, inicio">
            <LogoMark />
            <span>
              <b>contoso</b>
            </span>
          </Link>
          <p>Colchones cosidos a mano en Medellín y enviados a toda España.</p>
        </div>
        <div>
          <h4>Colchones</h4>
          <ul>
            <li><Link href="/productos/colchon-cafetal">Colchón Cafetal</Link></li>
            <li><Link href="/productos/colchon-caribe">Colchón Caribe</Link></li>
            <li><Link href="/#nucleos">Núcleos</Link></li>
          </ul>
        </div>
        <div>
          <h4>Ayuda</h4>
          <ul>
            <li><Link href="/envios-y-devoluciones">Envíos y devoluciones</Link></li>
            <li><Link href="/pedidos">Mis pedidos</Link></li>
            <li><Link href="/#asistente">Asistente</Link></li>
          </ul>
        </div>
        <div>
          <h4>Contacto</h4>
          <ul>
            <li>hola@contoso.example</li>
            <li className="mono">+34 900 000 000</li>
            <li>L a V, 8:00 a 16:00</li>
          </ul>
        </div>
      </div>
      <div className="wrap legal">
        <span>© 2026 Colchones Contoso · Tienda de demostración</span>
        <span>Fotos de Unsplash · Pagos de prueba con Stripe</span>
      </div>
    </footer>
  );
}
