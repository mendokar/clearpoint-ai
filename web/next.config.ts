import path from "node:path";
import type { NextConfig } from "next";
import { securityHeaders } from "./security-headers.mjs";
import { ALLOWED_IMAGE_HOSTS } from "./lib/catalog/image-hosts";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // El catálogo y la política viven en ../data (compartidos con el agente).
  outputFileTracingRoot: path.join(__dirname, ".."),
  serverExternalPackages: ["firebase-admin"],
  // Imágenes https que se pueden asignar a un producto desde el panel (pasan por /_next/image).
  images: {
    remotePatterns: ALLOWED_IMAGE_HOSTS.map((hostname) => ({ protocol: "https" as const, hostname, pathname: "/**" })),
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders({
          agentUrl: process.env.NEXT_PUBLIC_AGENT_URL,
          authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
          dev: process.env.NODE_ENV !== "production",
        }),
      },
      // El panel no se indexa (además de robots en el metadata de app/admin/layout.tsx).
      { source: "/admin/:path*", headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }] },
    ];
  },
  webpack(config) {
    // Importa los .md como texto (data/shipping_policy.md).
    config.module.rules.push({ test: /\.md$/, type: "asset/source" });
    return config;
  },
};

export default nextConfig;
