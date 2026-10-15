// Cabeceras de seguridad compartidas por next.config.ts y los tests.

/** Origen (scheme://host[:port]) de una URL, o null si no es válida. */
function originOf(url) {
  try {
    return url ? new URL(url).origin : null;
  } catch {
    return null;
  }
}

/**
 * CSP compatible con:
 * - Next.js (scripts inline de hidratación → 'unsafe-inline'; 'unsafe-eval' solo en desarrollo).
 * - Stripe Checkout: se navega a checkout.stripe.com (navegación de nivel superior, no la limita CSP).
 * - Firebase Auth/Firestore y el popup/redirect de Google.
 * - El asistente (NEXT_PUBLIC_AGENT_URL).
 */
export function buildCsp({ agentUrl, authDomain, dev = false } = {}) {
  const agent = originOf(agentUrl);
  const auth = authDomain ? `https://${authDomain.replace(/^https?:\/\//, "")}` : null;
  const firebaseConnect = [
    "https://identitytoolkit.googleapis.com",
    "https://securetoken.googleapis.com",
    "https://firestore.googleapis.com",
    "https://www.googleapis.com",
    "https://apis.google.com",
  ];
  const directives = {
    "default-src": ["'self'"],
    "script-src": ["'self'", "'unsafe-inline'", ...(dev ? ["'unsafe-eval'"] : []), "https://apis.google.com"],
    "style-src": ["'self'", "'unsafe-inline'"],
    "img-src": ["'self'", "data:", "blob:", "https://lh3.googleusercontent.com"],
    "font-src": ["'self'", "data:"],
    "connect-src": ["'self'", ...firebaseConnect, ...(agent ? [agent] : []), ...(dev ? ["ws:", "http://localhost:*"] : [])],
    "frame-src": ["https://accounts.google.com", "https://*.firebaseapp.com", ...(auth ? [auth] : [])],
    "form-action": ["'self'", "https://checkout.stripe.com"],
    "frame-ancestors": ["'none'"],
    "base-uri": ["'self'"],
    "object-src": ["'none'"],
    ...(dev ? {} : { "upgrade-insecure-requests": [] }),
  };
  return Object.entries(directives)
    .map(([k, v]) => [k, ...new Set(v)].join(" ").trim())
    .join("; ");
}

export function securityHeaders(opts = {}) {
  return [
    { key: "Content-Security-Policy", value: buildCsp(opts) },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
    // Necesario para que signInWithPopup pueda comunicarse con la ventana de Google.
    { key: "Cross-Origin-Opener-Policy", value: "same-origin-allow-popups" },
    ...(opts.dev ? [] : [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" }]),
  ];
}
