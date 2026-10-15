import { describe, expect, it, vi } from "vitest";
import {
  buildUploadPath,
  compressImage,
  ImageUploadError,
  MAX_SOURCE_BYTES,
  MAX_UPLOAD_BYTES,
  randomSuffix,
  scaledSize,
  uploadErrorMessage,
  validateImageFile,
  validateUploadBlob,
  WEBP_QUALITY,
  type CompressEnv,
} from "@/lib/admin/imageUpload";
import { isAllowedImageUrl } from "@/lib/catalog/admin-schema";
import { DEFAULT_STORAGE_BUCKET, remoteImagePatterns, storageBucketName } from "@/lib/catalog/image-hosts";

const MB = 1024 * 1024;
const file = (name: string, type: string, size: number) => new File([new Uint8Array(size)], name, { type });

describe("validación previa de ficheros", () => {
  it.each([
    ["foto.jpg", "image/jpeg"],
    ["foto.png", "image/png"],
    ["foto.webp", "image/webp"],
    ["foto.avif", "image/avif"],
  ])("%s (%s) es válido", (name, type) => {
    expect(validateImageFile({ name, type, size: 2 * MB })).toBeNull();
  });

  it.each([
    ["logo.svg", "image/svg+xml"],
    ["anim.gif", "image/gif"],
    ["foto.heic", "image/heic"],
    ["doc.pdf", "application/pdf"],
    ["sin-tipo", ""],
  ])("%s (%s) se rechaza con mensaje en español", (name, type) => {
    expect(validateImageFile({ name, type, size: 1000 })).toBe(`«${name}» no es una imagen JPEG, PNG, WebP o AVIF.`);
  });

  it("rechaza ficheros vacíos y los que superan el máximo de origen (20 MB)", () => {
    expect(validateImageFile({ name: "a.jpg", type: "image/jpeg", size: 0 })).toMatch(/está vacío/);
    expect(validateImageFile({ name: "a.jpg", type: "image/jpeg", size: MAX_SOURCE_BYTES })).toBeNull();
    expect(validateImageFile({ name: "a.jpg", type: "image/jpeg", size: MAX_SOURCE_BYTES + 1 })).toMatch(/el máximo es 20 MB/);
  });

  it("lo que se sube debe pesar menos de 5 MB (igual que las reglas de Storage)", () => {
    expect(validateUploadBlob("a.webp", { type: "image/webp", size: MAX_UPLOAD_BYTES - 1 })).toBeNull();
    expect(validateUploadBlob("a.webp", { type: "image/webp", size: MAX_UPLOAD_BYTES })).toMatch(/máximo es 5 MB/);
    expect(validateUploadBlob("a.svg", { type: "image/svg+xml", size: 10 })).toMatch(/no es una imagen/);
  });
});

describe("nombre del fichero en Storage", () => {
  it("products/<slug>/<timestamp>-<aleatorio>.webp", () => {
    expect(buildUploadPath("colchon-cafetal", { now: 1760000000000, random: "ab12cd34" })).toBe(
      "products/colchon-cafetal/1760000000000-ab12cd34.webp",
    );
  });

  it("la extensión sigue al tipo cuando se sube el original", () => {
    expect(buildUploadPath("colchon-cafetal", { now: 1, random: "abcd", contentType: "image/jpeg" })).toMatch(/\.jpg$/);
    expect(buildUploadPath("colchon-cafetal", { now: 1, random: "abcd", contentType: "image/png" })).toMatch(/\.png$/);
    expect(buildUploadPath("colchon-cafetal", { now: 1, random: "abcd", contentType: "image/avif" })).toMatch(/\.avif$/);
  });

  it("por defecto usa la hora actual y un sufijo aleatorio distinto cada vez", () => {
    vi.spyOn(Date, "now").mockReturnValue(1234567890123);
    const a = buildUploadPath("colchon-nuevo");
    const b = buildUploadPath("colchon-nuevo");
    expect(a).toMatch(/^products\/colchon-nuevo\/1234567890123-[a-z0-9]{8}\.webp$/);
    expect(a).not.toBe(b);
    expect(randomSuffix(12)).toMatch(/^[a-z0-9]{12}$/);
  });

  it.each(["", "ab", "Colchon", "colchon_nuevo", "../otro", "colchon/../x", "-colchon", "a".repeat(81)])(
    "slug no válido %j → error (no se sube nada fuera de products/<slug>/)",
    (slug) => {
      expect(() => buildUploadPath(slug)).toThrow(ImageUploadError);
    },
  );

  it("un sufijo con caracteres raros se rechaza", () => {
    expect(() => buildUploadPath("colchon-nuevo", { random: "../x" })).toThrow(ImageUploadError);
  });
});

describe("tamaño de la imagen comprimida", () => {
  it("lado mayor máximo 1600 px manteniendo proporción, sin ampliar", () => {
    expect(scaledSize(4000, 3000)).toEqual({ width: 1600, height: 1200 });
    expect(scaledSize(3000, 4000)).toEqual({ width: 1200, height: 1600 });
    expect(scaledSize(1600, 900)).toEqual({ width: 1600, height: 900 });
    expect(scaledSize(800, 600)).toEqual({ width: 800, height: 600 });
  });
});

function fakeEnv(opts: { width: number; height: number; outType?: string; outSize?: number; decodeFails?: boolean }) {
  const drawImage = vi.fn();
  const convertToBlob = vi.fn(async ({ type }: { type: string; quality: number }) =>
    new Blob([new Uint8Array(opts.outSize ?? 1000)], { type: opts.outType ?? type }),
  );
  const createCanvas = vi.fn((...size: [number, number]) => ({ size, getContext: () => ({ drawImage }), convertToBlob }));
  const close = vi.fn();
  const env: CompressEnv = {
    createImageBitmap: vi.fn(async () => {
      if (opts.decodeFails) throw new Error("decode");
      return { width: opts.width, height: opts.height, close };
    }),
    createCanvas,
  };
  return { env, drawImage, convertToBlob, createCanvas, close };
}

describe("compresión en el navegador", () => {
  it("redimensiona a 1600 px y codifica a WebP con calidad 0,82", async () => {
    const f = fakeEnv({ width: 4000, height: 2000 });
    const out = await compressImage(file("grande.jpg", "image/jpeg", 8 * MB), f.env);
    expect(out.contentType).toBe("image/webp");
    expect(out.compressed).toBe(true);
    expect(f.createCanvas).toHaveBeenCalledWith(1600, 800);
    expect(f.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1600, 800);
    expect(f.convertToBlob).toHaveBeenCalledWith({ type: "image/webp", quality: WEBP_QUALITY });
    expect(f.close).toHaveBeenCalled();
  });

  it("usa toBlob si el canvas no tiene convertToBlob", async () => {
    const toBlob = vi.fn((cb: (b: Blob | null) => void, type: string) => cb(new Blob([new Uint8Array(10)], { type })));
    const env: CompressEnv = {
      createImageBitmap: async () => ({ width: 3200, height: 3200 }),
      createCanvas: () => ({ getContext: () => ({ drawImage: () => {} }), toBlob }),
    };
    const out = await compressImage(file("a.png", "image/png", 3 * MB), env);
    expect(out.contentType).toBe("image/webp");
    expect(toBlob).toHaveBeenCalledWith(expect.any(Function), "image/webp", WEBP_QUALITY);
  });

  it("sin createImageBitmap/canvas sube el original si cumple los límites", async () => {
    const original = file("a.jpg", "image/jpeg", 2 * MB);
    const out = await compressImage(original, {});
    expect(out).toEqual({ blob: original, contentType: "image/jpeg", compressed: false });
  });

  it("sin compresión posible y con 5 MB o más → error claro", async () => {
    await expect(compressImage(file("a.jpg", "image/jpeg", 6 * MB), {})).rejects.toThrow(
      /este navegador no puede comprimirla; el máximo es 5 MB/,
    );
  });

  it("si el navegador no codifica WebP (devuelve PNG) usa el original", async () => {
    const f = fakeEnv({ width: 3000, height: 2000, outType: "image/png" });
    const original = file("a.jpg", "image/jpeg", 1 * MB);
    expect((await compressImage(original, f.env)).blob).toBe(original);
  });

  it("si no sabe decodificar el formato (p. ej. AVIF) usa el original", async () => {
    const f = fakeEnv({ width: 1, height: 1, decodeFails: true });
    const original = file("a.avif", "image/avif", 1 * MB);
    const out = await compressImage(original, f.env);
    expect(out.blob).toBe(original);
    expect(out.contentType).toBe("image/avif");
  });

  it("una foto ya pequeña que no mejora al comprimir se sube tal cual", async () => {
    const f = fakeEnv({ width: 800, height: 600, outSize: 5000 });
    const original = file("a.webp", "image/webp", 3000);
    expect((await compressImage(original, f.env)).blob).toBe(original);
  });
});

describe("mensajes de error de Storage", () => {
  it.each([
    ["storage/unauthorized", /No tienes permiso/],
    ["storage/canceled", /cancelada/],
    ["storage/quota-exceeded", /cuota/],
    ["storage/retry-limit-exceeded", /conexión/],
    ["storage/unauthenticated", /sesión/],
    ["storage/unknown", /No se ha podido subir/],
  ])("%s → mensaje en español", (code, msg) => {
    expect(uploadErrorMessage({ code, message: "Firebase Storage: internal detail" })).toMatch(msg);
  });

  it("no filtra mensajes internos de errores inesperados", () => {
    expect(uploadErrorMessage(new TypeError("Cannot read properties of undefined"))).toBe(
      "No se ha podido subir la foto. Inténtalo de nuevo.",
    );
    expect(uploadErrorMessage(new ImageUploadError("Mensaje propio"))).toBe("Mensaje propio");
  });
});

describe("bucket permitido en las URLs de imagen", () => {
  const url = (bucket: string) => `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/products%2Fcolchon%2F1-a.webp?alt=media`;

  it("por defecto, el bucket del proyecto", () => {
    expect(storageBucketName()).toBe(DEFAULT_STORAGE_BUCKET);
    expect(isAllowedImageUrl(url(DEFAULT_STORAGE_BUCKET))).toBe(true);
  });

  it("con NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET, solo ese bucket (admite gs://)", () => {
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET", "gs://otro-proyecto.appspot.com");
    expect(storageBucketName()).toBe("otro-proyecto.appspot.com");
    expect(isAllowedImageUrl(url("otro-proyecto.appspot.com"))).toBe(true);
    expect(isAllowedImageUrl(url(DEFAULT_STORAGE_BUCKET))).toBe(false);
  });

  it("un valor raro en la variable no abre la validación", () => {
    vi.stubEnv("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET", "evil/../x");
    expect(storageBucketName()).toBe(DEFAULT_STORAGE_BUCKET);
  });

  it("rechaza rutas con .. y otros buckets aunque el host sea de Google", () => {
    expect(isAllowedImageUrl(`https://firebasestorage.googleapis.com/v0/b/${DEFAULT_STORAGE_BUCKET}/o/products%2F..%2F..%2Fx`)).toBe(false);
    expect(isAllowedImageUrl(`https://firebasestorage.googleapis.com/v0/b/${DEFAULT_STORAGE_BUCKET}x/o/products%2Fa.webp`)).toBe(false);
    expect(isAllowedImageUrl(`https://firebasestorage.googleapis.com/v0/b/${DEFAULT_STORAGE_BUCKET}/o/../../b/otro/o/products%2Fa.webp`)).toBe(false);
  });

  it("next.config solo optimiza imágenes de Storage de ese bucket", () => {
    const patterns = remoteImagePatterns();
    expect(patterns).toContainEqual({
      protocol: "https",
      hostname: "firebasestorage.googleapis.com",
      pathname: `/v0/b/${DEFAULT_STORAGE_BUCKET}/o/**`,
    });
    expect(patterns.find((p) => p.hostname === "storage.googleapis.com")?.pathname).toBe(`/${DEFAULT_STORAGE_BUCKET}/**`);
  });
});
