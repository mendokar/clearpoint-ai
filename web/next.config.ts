import path from "node:path";
import type { NextConfig } from "next";
import { securityHeaders } from "./security-headers.mjs";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  reactStrictMode: true,
  // El catálogo y la política viven en ../data (compartidos con el agente).
  outputFileTracingRoot: path.join(__dirname, ".."),
  serverExternalPackages: ["firebase-admin"],
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
    ];
  },
  webpack(config) {
    // Importa los .md como texto (data/shipping_policy.md).
    config.module.rules.push({ test: /\.md$/, type: "asset/source" });
    return config;
  },
};

export default nextConfig;
