"use client";

import { useEffect, useId, useRef, useState, type DragEvent } from "react";
import { Notice } from "@/components/ui/Notice";
import {
  ACCEPTED_IMAGE_TYPES,
  buildUploadPath,
  compressImage,
  ImageUploadError,
  isCanceledError,
  uploadErrorMessage,
  uploadProductImage,
  validateImageFile,
  validateUploadBlob,
} from "@/lib/admin/imageUpload";
import { getClientStorage, isStorageConfigured } from "@/lib/firebase/client";

type Status = "preparing" | "uploading" | "error" | "canceled";
type Item = { id: number; name: string; preview: string | null; status: Status; progress: number; error?: string };

type Props = {
  /** Slug del producto: las fotos van a `products/<slug>/`. */
  slug: string;
  /** Para productos nuevos hay que escribir antes un slug válido. */
  slugValid: boolean;
  /** Huecos libres (el esquema admite como máximo 12 imágenes). */
  remaining: number;
  /** Se llama con la URL de descarga de cada foto subida. */
  onUploaded: (url: string) => void;
};

function createPreview(file: File): string | null {
  try {
    return typeof URL.createObjectURL === "function" ? URL.createObjectURL(file) : null;
  } catch {
    return null;
  }
}

function revokePreview(url: string | null) {
  if (url && typeof URL.revokeObjectURL === "function") URL.revokeObjectURL(url);
}

/**
 * Subida de fotos de producto a Firebase Storage directamente desde el navegador: arrastrar y soltar o botón
 * (varias a la vez), validación previa, compresión a WebP, progreso por fichero y cancelación. Al terminar cada
 * una se añade su URL de descarga a la lista de imágenes del formulario.
 */
export function ImageUploader({ slug, slugValid, remaining, onUploaded }: Props) {
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);
  const [announce, setAnnounce] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const nextId = useRef(1);
  const cancels = useRef(new Map<number, () => void>());
  const canceled = useRef(new Set<number>());
  const previews = useRef(new Set<string>());
  const mounted = useRef(true);
  const hintId = useId();

  useEffect(() => {
    mounted.current = true;
    const cancelMap = cancels.current;
    const previewSet = previews.current;
    return () => {
      mounted.current = false;
      for (const cancel of cancelMap.values()) cancel();
      for (const url of previewSet) revokePreview(url);
    };
  }, []);

  if (!isStorageConfigured) {
    return (
      <Notice tone="warn" title="Subida de fotos no disponible">
        Falta la variable <code>NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET</code>. Mientras tanto puedes elegir fotos de la
        biblioteca o pegar una URL.
      </Notice>
    );
  }

  const update = (id: number, patch: Partial<Item>) => {
    if (mounted.current) setItems((list) => list.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  };

  const remove = (id: number) => {
    setItems((list) => {
      const it = list.find((x) => x.id === id);
      if (it?.preview) {
        revokePreview(it.preview);
        previews.current.delete(it.preview);
      }
      return list.filter((x) => x.id !== id);
    });
  };

  const active = items.filter((it) => it.status === "preparing" || it.status === "uploading").length;
  const free = Math.max(0, remaining - active);
  const canUpload = slugValid && free > 0;

  async function run(id: number, file: File, folderSlug: string) {
    try {
      const prepared = await compressImage(file);
      if (canceled.current.has(id)) return;
      const tooBig = validateUploadBlob(file.name, prepared.blob);
      if (tooBig) throw new ImageUploadError(tooBig);
      const storage = getClientStorage();
      if (!storage) throw new ImageUploadError("La subida de fotos no está disponible ahora mismo.");
      const path = buildUploadPath(folderSlug, { contentType: prepared.contentType });
      const handle = uploadProductImage(storage, path, prepared.blob, prepared.contentType, (p) =>
        update(id, { progress: p }),
      );
      cancels.current.set(id, handle.cancel);
      update(id, { status: "uploading", progress: 0 });
      const url = await handle.promise;
      cancels.current.delete(id);
      if (!mounted.current) return;
      onUploaded(url);
      setAnnounce(`«${file.name}» subida y añadida a las imágenes.`);
      remove(id);
    } catch (err) {
      cancels.current.delete(id);
      if (canceled.current.has(id) || isCanceledError(err)) {
        update(id, { status: "canceled", error: "Subida cancelada." });
      } else {
        update(id, { status: "error", error: uploadErrorMessage(err) });
      }
    }
  }

  function addFiles(list: FileList | File[] | null) {
    const files = Array.from(list ?? []);
    if (!files.length || !slugValid) return;
    let slots = free;
    const added: Item[] = [];
    const jobs: [number, File][] = [];
    for (const file of files) {
      const id = nextId.current++;
      const error = validateImageFile(file) ?? (slots <= 0 ? `«${file.name}»: un producto admite como máximo 12 imágenes.` : null);
      if (error) {
        added.push({ id, name: file.name, preview: null, status: "error", progress: 0, error });
        continue;
      }
      slots -= 1;
      const preview = createPreview(file);
      if (preview) previews.current.add(preview);
      added.push({ id, name: file.name, preview, status: "preparing", progress: 0 });
      jobs.push([id, file]);
    }
    setItems((prev) => [...prev, ...added]);
    for (const [id, file] of jobs) void run(id, file, slug);
  }

  function cancel(id: number) {
    canceled.current.add(id);
    const c = cancels.current.get(id);
    if (c) c();
    else update(id, { status: "canceled", error: "Subida cancelada." });
  }

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragging(false);
    if (canUpload) addFiles(e.dataTransfer?.files ?? null);
  };

  return (
    <div className="flex flex-col gap-3">
      <div
        data-testid="dropzone"
        onDragOver={(e) => {
          e.preventDefault();
          if (canUpload) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`flex flex-col items-center gap-2 rounded-card border-2 border-dashed p-5 text-center ${
          dragging ? "border-aji bg-tint" : "border-line"
        } ${canUpload ? "" : "opacity-70"}`}
      >
        <p className="text-sm">
          <b>Arrastra aquí las fotos</b> o
        </p>
        <button
          type="button"
          className="btn btn-primary btn-sm"
          disabled={!canUpload}
          aria-describedby={hintId}
          onClick={() => inputRef.current?.click()}
        >
          Subir fotos
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_IMAGE_TYPES.join(",")}
          multiple
          hidden
          aria-label="Elegir fotos para subir"
          data-testid="file-input"
          onChange={(e) => {
            addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <p id={hintId} className="text-xs text-muted">
          {!slugValid
            ? "Escribe primero un slug válido (p. ej. colchon-nuevo): las fotos se guardan en su carpeta."
            : free <= 0
              ? "Ya hay 12 imágenes (el máximo). Quita alguna para subir más."
              : "JPEG, PNG, WebP o AVIF. Se comprimen a WebP (máx. 1600 px) antes de subir; cada foto debe quedar por debajo de 5 MB."}
        </p>
      </div>

      <div aria-live="polite" className="sr-only">
        {announce}
      </div>

      {items.length > 0 && (
        <ul className="m-0 grid list-none gap-2 p-0" aria-label="Fotos en subida">
          {items.map((it) => {
            const busy = it.status === "preparing" || it.status === "uploading";
            const pct = Math.round(it.progress * 100);
            return (
              <li key={it.id} className="flex flex-wrap items-center gap-3 rounded-card border border-line p-2">
                {it.preview ? (
                  // Vista previa local (blob:), no pasa por next/image.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={it.preview} alt="" className="h-14 w-14 flex-none rounded-lg object-cover" />
                ) : (
                  <span className="h-14 w-14 flex-none rounded-lg bg-tint" aria-hidden="true" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="m-0 truncate text-sm font-semibold">{it.name}</p>
                  {busy && (
                    <div className="mt-1 flex items-center gap-2">
                      <progress
                        className="h-2 w-full max-w-64"
                        max={100}
                        value={it.status === "uploading" ? pct : undefined}
                        aria-label={`Progreso de ${it.name}`}
                      />
                      <span className="mono text-xs text-muted">{it.status === "preparing" ? "Comprimiendo…" : `${pct} %`}</span>
                    </div>
                  )}
                  {it.error && (
                    <p className={`m-0 mt-1 text-sm ${it.status === "error" ? "text-danger" : "text-muted"}`} role={it.status === "error" ? "alert" : undefined}>
                      {it.error}
                    </p>
                  )}
                </div>
                {busy ? (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => cancel(it.id)} aria-label={`Cancelar la subida de ${it.name}`}>
                    Cancelar
                  </button>
                ) : (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={() => remove(it.id)} aria-label={`Descartar ${it.name}`}>
                    Descartar
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
