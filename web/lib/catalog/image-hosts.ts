/**
 * Hosts externos (https) permitidos para imágenes de producto. `next.config.ts` los usa en
 * `images.remotePatterns` (next/image los sirve a través de `/_next/image`) y el esquema de administración
 * rechaza cualquier otro host.
 */
export const ALLOWED_IMAGE_HOSTS = [
  "images.unsplash.com",
  "firebasestorage.googleapis.com",
  "storage.googleapis.com",
] as const;

/** Bucket de Firebase Storage del proyecto (región europe-southwest1). */
export const DEFAULT_STORAGE_BUCKET = "clearpoint-colchones.firebasestorage.app";

const BUCKET_RE = /^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/;

/**
 * Bucket configurado (`NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`, admite `gs://…`) o el del proyecto si falta.
 * Se lee en cada llamada para que los tests puedan cambiarlo; en el navegador Next incrusta el valor en el build.
 */
export function storageBucketName(): string {
  const raw = (process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "").trim().replace(/^gs:\/\//, "").replace(/\/+$/, "");
  return BUCKET_RE.test(raw) ? raw : DEFAULT_STORAGE_BUCKET;
}

/**
 * Las URLs de Storage solo valen si apuntan a NUESTRO bucket (no a cualquier bucket público de Google):
 *  - `https://firebasestorage.googleapis.com/v0/b/<bucket>/o/products%2F…` (lo que devuelve `getDownloadURL`)
 *  - `https://storage.googleapis.com/<bucket>/products/…`
 */
export function isAllowedStoragePath(hostname: string, pathname: string): boolean {
  const bucket = storageBucketName();
  if (hostname === "firebasestorage.googleapis.com") return pathname.startsWith(`/v0/b/${bucket}/o/products%2F`);
  if (hostname === "storage.googleapis.com") return pathname.startsWith(`/${bucket}/products/`);
  return true;
}

/** `images.remotePatterns` de next.config: Unsplash entero y, de Storage, solo la carpeta del bucket. */
export function remoteImagePatterns() {
  const bucket = storageBucketName();
  return [
    { protocol: "https" as const, hostname: "images.unsplash.com", pathname: "/**" },
    { protocol: "https" as const, hostname: "firebasestorage.googleapis.com", pathname: `/v0/b/${bucket}/o/**` },
    { protocol: "https" as const, hostname: "storage.googleapis.com", pathname: `/${bucket}/**` },
  ];
}
