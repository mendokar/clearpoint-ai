import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import nextConfig from "@/next.config";
import { buildCsp } from "@/security-headers.mjs";

const ROOT = path.resolve(__dirname, "../..");

async function headerMap(env: Record<string, string> = {}) {
  const saved = { ...process.env };
  Object.assign(process.env, env);
  try {
    const rules = await nextConfig.headers!();
    const all = rules.find((r) => r.source === "/:path*")!;
    return Object.fromEntries(all.headers.map((h) => [h.key.toLowerCase(), h.value]));
  } finally {
    process.env = saved;
  }
}

describe("cabeceras de seguridad (next.config)", () => {
  it("expone CSP, X-Frame-Options, X-Content-Type-Options y Referrer-Policy", async () => {
    const h = await headerMap();
    expect(h["content-security-policy"]).toBeTruthy();
    expect(h["x-frame-options"]).toBe("DENY");
    expect(h["x-content-type-options"]).toBe("nosniff");
    expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  });

  it("la CSP restringe orígenes y permite Firebase, Google y el agente", async () => {
    const h = await headerMap({
      NODE_ENV: "production",
      NEXT_PUBLIC_AGENT_URL: "https://agent.example.run.app/",
      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "demo.firebaseapp.com",
    });
    const csp = h["content-security-policy"];
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toMatch(/connect-src [^;]*https:\/\/agent\.example\.run\.app/);
    expect(csp).toMatch(/connect-src [^;]*https:\/\/identitytoolkit\.googleapis\.com/);
    expect(csp).toMatch(/connect-src [^;]*https:\/\/securetoken\.googleapis\.com/);
    expect(csp).toMatch(/connect-src [^;]*https:\/\/firestore\.googleapis\.com/);
    expect(csp).toMatch(/script-src [^;]*https:\/\/apis\.google\.com/);
    expect(csp).toMatch(/frame-src [^;]*https:\/\/accounts\.google\.com/);
    expect(csp).toMatch(/frame-src [^;]*https:\/\/demo\.firebaseapp\.com/);
    expect(csp).toMatch(/form-action [^;]*https:\/\/checkout\.stripe\.com/);
    expect(csp).not.toMatch(/(script|connect|default)-src [^;]*\*(?!\.)/); // sin comodines sueltos
  });

  it("la CSP permite subir y mostrar fotos de Firebase Storage sin abrir nada más", () => {
    const csp = buildCsp({ dev: false });
    const directive = (name: string) => csp.split("; ").find((d) => d.startsWith(`${name} `)) ?? "";
    expect(directive("connect-src")).toContain("https://firebasestorage.googleapis.com");
    expect(directive("img-src")).toContain("https://firebasestorage.googleapis.com");
    expect(directive("img-src")).toContain("blob:"); // vista previa local antes de subir
    // blob: y Storage solo donde hacen falta
    for (const d of ["default-src", "script-src", "connect-src", "frame-src", "object-src"]) {
      expect(directive(d), d).not.toContain("blob:");
    }
    for (const d of ["default-src", "script-src", "frame-src", "form-action"]) {
      expect(directive(d), d).not.toContain("firebasestorage");
    }
    expect(directive("img-src")).not.toMatch(/(^| )(https:|\*|http:)( |$)/); // sin esquemas o comodines abiertos
    expect(directive("connect-src")).not.toMatch(/(^| )(https:|\*|http:)( |$)/);
    expect(directive("connect-src")).not.toContain("storage.googleapis.com ");
  });

  it("'unsafe-eval' solo en desarrollo", () => {
    expect(buildCsp({ dev: true })).toContain("'unsafe-eval'");
    expect(buildCsp({ dev: false })).not.toContain("'unsafe-eval'");
  });

  it("una NEXT_PUBLIC_AGENT_URL inválida no rompe la CSP", () => {
    expect(() => buildCsp({ agentUrl: "no es una url" })).not.toThrow();
  });
});

// ── Frontera NEXT_PUBLIC_ ───────────────────────────────────────────────────────
const SECRET_HINTS = /SECRET|PRIVATE|PASSWORD|WEBHOOK|ADMIN|CREDENTIAL|SERVICE_ACCOUNT|GMAIL|TOKEN|SK_|ANTHROPIC|OPENAI/;
const SERVER_SECRETS = ["FIREBASE_ADMIN_CREDENTIALS", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "GMAIL_APP_PASSWORD"];

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (["node_modules", ".next", "tests", "coverage", "public"].includes(name)) continue;
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|mjs|js)$/.test(name)) out.push(p);
  }
  return out;
}

const sources = walk(ROOT).map((f) => ({ file: path.relative(ROOT, f), text: readFileSync(f, "utf8") }));

describe("variables de entorno", () => {
  it(".env.example no contiene valores y ninguna NEXT_PUBLIC_ tiene nombre de secreto", () => {
    const lines = readFileSync(path.join(ROOT, ".env.example"), "utf8")
      .split("\n")
      .filter((l) => /^[A-Z0-9_]+=/.test(l));
    expect(lines.length).toBeGreaterThan(5);
    for (const l of lines) {
      const [name, value] = l.split("=");
      expect(value, `${name} debe ir vacío`).toBe("");
      if (name.startsWith("NEXT_PUBLIC_")) expect(name).not.toMatch(SECRET_HINTS);
    }
    for (const s of SERVER_SECRETS) expect(lines.map((l) => l.split("=")[0])).toContain(s);
    // El bucket de Storage es configuración pública (las reglas de Storage son la protección).
    expect(lines).toContain("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=");
  });

  it("el código no usa ninguna NEXT_PUBLIC_ con nombre de secreto", () => {
    for (const { file, text } of sources) {
      for (const m of text.matchAll(/NEXT_PUBLIC_[A-Z0-9_]+/g)) {
        expect(m[0], file).not.toMatch(SECRET_HINTS);
      }
    }
  });

  it("los secretos solo se leen en módulos de servidor (server-only o route handlers)", () => {
    for (const { file, text } of sources) {
      const usesSecret = SERVER_SECRETS.some((s) => text.includes(`process.env.${s}`));
      if (!usesSecret) continue;
      const isServer = text.includes('import "server-only"') || /app\/api\/.*route\.ts$/.test(file);
      expect(isServer, `${file} lee un secreto sin ser módulo de servidor`).toBe(true);
      expect(text, file).not.toMatch(/^"use client"/m);
    }
  });

  it("los componentes cliente solo leen variables NEXT_PUBLIC_", () => {
    for (const { file, text } of sources) {
      if (!/^["']use client["']/m.test(text)) continue;
      for (const m of text.matchAll(/process\.env\.([A-Z0-9_]+)/g)) {
        expect(m[1], file).toMatch(/^(NEXT_PUBLIC_|NODE_ENV$)/);
      }
    }
  });

  it("ningún componente usa dangerouslySetInnerHTML", () => {
    for (const { file, text } of sources) expect(text, file).not.toContain("dangerouslySetInnerHTML");
  });
});
