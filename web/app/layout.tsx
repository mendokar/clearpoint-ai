import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, DM_Mono, Figtree } from "next/font/google";
import { AuthProvider } from "@/components/auth/AuthProvider";
import { ChatProvider } from "@/components/chat/ChatContext";
import { ChatWidget } from "@/components/chat/ChatWidget";
import { SiteFooter } from "@/components/layout/SiteFooter";
import { SiteHeader } from "@/components/layout/SiteHeader";
import "./globals.css";

const bricolage = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  variable: "--font-bricolage",
  display: "swap",
});
const figtree = Figtree({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-figtree", display: "swap" });
const dmMono = DM_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-dm-mono", display: "swap" });

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: { default: "Colchones Contoso · Cosidos a mano en Colombia", template: "%s · Colchones Contoso" },
  description:
    "Colchones de matrimonio e individuales cosidos a mano en Medellín con algodón del Tolima. Envío gratis a la península y 30 noches de prueba.",
  openGraph: { locale: "es_ES", siteName: "Colchones Contoso", type: "website" },
  icons: { icon: "/icon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#F7EEE4" },
    { media: "(prefers-color-scheme: dark)", color: "#1B120D" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={`${bricolage.variable} ${figtree.variable} ${dmMono.variable}`}>
      <body>
        <a href="#contenido" className="sr-only-focusable btn btn-primary btn-sm !fixed top-2 left-2 z-50">
          Saltar al contenido
        </a>
        <AuthProvider>
          <ChatProvider>
            <SiteHeader />
            <main id="contenido">{children}</main>
            <SiteFooter />
            <ChatWidget />
          </ChatProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
