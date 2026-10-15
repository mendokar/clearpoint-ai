import { getDownloadURL, ref, uploadBytesResumable, type FirebaseStorage } from "firebase/storage";
import { SLUG_RE } from "../catalog/admin-schema";

/**
 * Subida de fotos de producto desde el panel, directa del navegador a Firebase Storage (sin pasar por las
 * funciones de Vercel). La seguridad la ponen las reglas (`firebase/storage.rules`): solo un admin, solo
 * `products/<slug>/…`, < 5 MB y JPEG/PNG/WebP/AVIF. Aquí se repiten esas comprobaciones para dar mensajes claros
 * antes de subir.
 */

/** Error con un mensaje en español apto para mostrar tal cual. */
export class ImageUploadError extends Error {}

/** Límite de las reglas de Storage (`request.resource.size < 5 MB`) para lo que se sube. */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
/** Lo que se acepta elegir: más que lo que se sube, porque se comprime en el navegador antes de subir. */
export const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"] as const;
export type AcceptedImageType = (typeof ACCEPTED_IMAGE_TYPES)[number];
export const MAX_IMAGE_SIDE = 1600;
export const WEBP_QUALITY = 0.82;

const EXTENSIONS: Record<AcceptedImageType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
};

export function isAcceptedImageType(type: string): type is AcceptedImageType {
  return (ACCEPTED_IMAGE_TYPES as readonly string[]).includes(type);
}

function mb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toLocaleString("es-ES", { maximumFractionDigits: 1 })} MB`;
}

/** Validación previa de un fichero elegido. Devuelve el mensaje de error (en español) o null si vale. */
export function validateImageFile(file: { name: string; type: string; size: number }): string | null {
  if (!isAcceptedImageType(file.type)) return `«${file.name}» no es una imagen JPEG, PNG, WebP o AVIF.`;
  if (file.size === 0) return `«${file.name}» está vacío.`;
  if (file.size > MAX_SOURCE_BYTES) return `«${file.name}» pesa ${mb(file.size)}; el máximo es ${mb(MAX_SOURCE_BYTES)}.`;
  return null;
}

/** Comprobación final de lo que se va a subir (tras comprimir), igual que las reglas de Storage. */
export function validateUploadBlob(name: string, blob: { type: string; size: number }): string | null {
  if (!isAcceptedImageType(blob.type)) return `«${name}» no es una imagen JPEG, PNG, WebP o AVIF.`;
  if (blob.size >= MAX_UPLOAD_BYTES) {
    return `«${name}» pesa ${mb(blob.size)} incluso después de comprimirla; el máximo es 5 MB.`;
  }
  return null;
}

export function randomSuffix(length = 8): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

/** `products/<slug>/<timestamp>-<aleatorio>.<ext>` (WebP salvo que se suba el original sin comprimir). */
export function buildUploadPath(
  slug: string,
  opts: { now?: number; random?: string; contentType?: AcceptedImageType } = {},
): string {
  if (!SLUG_RE.test(slug) || slug.length < 3 || slug.length > 80) throw new ImageUploadError("Escribe primero un slug válido para subir fotos.");
  const random = opts.random ?? randomSuffix();
  if (!/^[a-z0-9]{4,32}$/.test(random)) throw new ImageUploadError("Sufijo aleatorio no válido.");
  const ext = EXTENSIONS[opts.contentType ?? "image/webp"];
  return `products/${slug}/${opts.now ?? Date.now()}-${random}.${ext}`;
}

/** Escala para que el lado mayor no pase de `max` (nunca amplía). */
export function scaledSize(width: number, height: number, max = MAX_IMAGE_SIDE): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= max) return { width, height };
  const k = max / longest;
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}

export type PreparedImage = { blob: Blob; contentType: AcceptedImageType; compressed: boolean };

type Canvas2D = { drawImage(img: unknown, x: number, y: number, w: number, h: number): void };
type CanvasLike = {
  getContext(type: "2d"): Canvas2D | null;
  convertToBlob?: (opts: { type: string; quality: number }) => Promise<Blob>;
  toBlob?: (cb: (b: Blob | null) => void, type: string, quality: number) => void;
};
type BitmapLike = { width: number; height: number; close?: () => void };

/** Dependencias del navegador, inyectables en los tests. */
export type CompressEnv = {
  createImageBitmap?: (blob: Blob) => Promise<BitmapLike>;
  createCanvas?: (width: number, height: number) => CanvasLike;
};

function browserEnv(): CompressEnv {
  const g = globalThis as unknown as {
    createImageBitmap?: (b: Blob) => Promise<BitmapLike>;
    OffscreenCanvas?: new (w: number, h: number) => CanvasLike;
    document?: { createElement(tag: "canvas"): CanvasLike & { width: number; height: number } };
  };
  return {
    createImageBitmap: typeof g.createImageBitmap === "function" ? (b) => g.createImageBitmap!(b) : undefined,
    createCanvas: g.OffscreenCanvas
      ? (w, h) => new g.OffscreenCanvas!(w, h)
      : g.document
        ? (w, h) => Object.assign(g.document!.createElement("canvas"), { width: w, height: h })
        : undefined,
  };
}

function canvasToBlob(canvas: CanvasLike, type: string, quality: number): Promise<Blob | null> {
  if (canvas.convertToBlob) return canvas.convertToBlob({ type, quality });
  if (canvas.toBlob) return new Promise((resolve) => canvas.toBlob!(resolve, type, quality));
  return Promise.resolve(null);
}

/**
 * Comprime en el navegador a WebP (lado mayor ≤ 1600 px, calidad 0,82). Si el navegador no puede (sin
 * `createImageBitmap`/canvas, formato que no sabe decodificar o sin codificador WebP, como Safari antiguo, que
 * devuelve PNG) se usa el original. También se usa el original si ya era pequeño y comprimir no lo mejora.
 * Lanza un Error con mensaje en español si no hay forma de cumplir los límites.
 */
export async function compressImage(file: File, env: CompressEnv = browserEnv()): Promise<PreparedImage> {
  const original = (): PreparedImage => {
    const error = validateUploadBlob(file.name, file);
    if (error) throw new ImageUploadError(error.replace("incluso después de comprimirla", "y este navegador no puede comprimirla"));
    return { blob: file, contentType: file.type as AcceptedImageType, compressed: false };
  };
  if (!env.createImageBitmap || !env.createCanvas) return original();

  let blob: Blob | null = null;
  let resized = false;
  try {
    const bitmap = await env.createImageBitmap(file);
    const size = scaledSize(bitmap.width, bitmap.height);
    resized = size.width !== bitmap.width || size.height !== bitmap.height;
    const canvas = env.createCanvas(size.width, size.height);
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(bitmap, 0, 0, size.width, size.height);
      blob = await canvasToBlob(canvas, "image/webp", WEBP_QUALITY);
    }
    bitmap.close?.();
  } catch {
    blob = null;
  }
  if (!blob || blob.type !== "image/webp" || blob.size === 0) return original();
  // Sin redimensionar y más grande que el original: mejor el original si cumple los límites.
  if (!resized && blob.size >= file.size && !validateUploadBlob(file.name, file)) return original();
  return { blob, contentType: "image/webp", compressed: true };
}

export type UploadHandle = { promise: Promise<string>; cancel: () => void };

/**
 * Sube con `uploadBytesResumable` (progreso y cancelación) y resuelve con la URL de descarga
 * (`https://firebasestorage.googleapis.com/v0/b/<bucket>/o/products%2F…?alt=media&token=…`).
 */
export function uploadProductImage(
  storage: FirebaseStorage,
  path: string,
  blob: Blob,
  contentType: AcceptedImageType,
  onProgress: (fraction: number) => void,
): UploadHandle {
  const task = uploadBytesResumable(ref(storage, path), blob, {
    contentType,
    cacheControl: "public, max-age=31536000, immutable",
  });
  const promise = new Promise<string>((resolve, reject) => {
    task.on(
      "state_changed",
      (snap) => onProgress(snap.totalBytes > 0 ? snap.bytesTransferred / snap.totalBytes : 0),
      reject,
      () => {
        getDownloadURL(task.snapshot.ref).then(resolve, reject);
      },
    );
  });
  return { promise, cancel: () => void task.cancel() };
}

export function isCanceledError(err: unknown): boolean {
  return (err as { code?: unknown } | null)?.code === "storage/canceled";
}

/** Errores del SDK de Storage → mensaje en español (sin detalles internos). */
export function uploadErrorMessage(err: unknown): string {
  const code = (err as { code?: unknown } | null)?.code;
  switch (code) {
    case "storage/canceled":
      return "Subida cancelada.";
    case "storage/unauthorized":
      return "No tienes permiso para subir fotos. Solo la cuenta de administración de la tienda, con el email verificado, puede hacerlo (recarga la página si acabas de recibir el rol).";
    case "storage/unauthenticated":
      return "Tu sesión ha caducado. Vuelve a iniciar sesión.";
    case "storage/quota-exceeded":
      return "Se ha superado la cuota de Firebase Storage.";
    case "storage/retry-limit-exceeded":
    case "storage/server-file-wrong-size":
      return "Problema de conexión al subir la foto. Inténtalo de nuevo.";
    case "storage/bucket-not-found":
    case "storage/project-not-found":
    case "storage/no-default-bucket":
      return "El bucket de Firebase Storage no existe o no está configurado.";
    default:
      return err instanceof ImageUploadError ? err.message : "No se ha podido subir la foto. Inténtalo de nuevo.";
  }
}
