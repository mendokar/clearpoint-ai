import "server-only";
import { SLUG_RE } from "../catalog/admin-schema";

/** Lo mínimo que usamos de un `Bucket` de @google-cloud/storage (permite un doble en los tests). */
export type BucketLike = { name?: string; deleteFiles(query: { prefix: string; force?: boolean }): Promise<unknown> };

export type ImageCleanup = "deleted" | "failed";

/** Carpeta de Storage de un producto. Exige un slug válido para no borrar nunca fuera de `products/<slug>/`. */
export function productImagesPrefix(slug: string): string {
  if (!SLUG_RE.test(slug) || slug.length < 3 || slug.length > 80) throw new Error("Slug no válido");
  return `products/${slug}/`;
}

/**
 * Borra las fotos subidas de un producto (todo `products/<slug>/`) con el Admin SDK. Nunca lanza: si Storage
 * falla se registra y devuelve "failed", para que el borrado del producto no dependa de Storage.
 */
export async function deleteProductImages(getBucket: () => BucketLike, slug: string): Promise<ImageCleanup> {
  try {
    const prefix = productImagesPrefix(slug);
    await getBucket().deleteFiles({ prefix, force: true });
    console.info("[admin] fotos del producto borradas de Storage", { slug, prefix });
    return "deleted";
  } catch (err) {
    console.error("[admin] no se pudieron borrar las fotos de Storage", {
      slug,
      error: err instanceof Error ? err.message : String(err),
    });
    return "failed";
  }
}
