import { readdir } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

/**
 * GET /api/catalog/images — nombres de las fotos de `public/images` para el selector del panel.
 * Se genera en el BUILD (`force-static`), cuando `public/` está en disco (en Vercel las funciones no
 * lo tienen). No es un dato privado: esos ficheros ya se sirven públicamente en `/images/…`.
 */
export const dynamic = "force-static";

const IMAGE_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}\.(?:jpe?g|png|webp|avif)$/i;

export async function GET() {
  let files: string[] = [];
  try {
    files = await readdir(path.join(process.cwd(), "public", "images"));
  } catch {
    files = [];
  }
  const images = files.filter((f) => IMAGE_FILE.test(f)).sort().map((f) => `/images/${f}`);
  return NextResponse.json({ images });
}
