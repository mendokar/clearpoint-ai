/**
 * Hosts externos (https) permitidos para imágenes de producto. `next.config.ts` los usa en
 * `images.remotePatterns` (next/image los sirve a través de `/_next/image`, así que la CSP no cambia)
 * y el esquema de administración rechaza cualquier otro host.
 */
export const ALLOWED_IMAGE_HOSTS = [
  "images.unsplash.com",
  "firebasestorage.googleapis.com",
  "storage.googleapis.com",
] as const;
