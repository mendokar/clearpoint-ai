// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** Doble de un UploadTask de firebase/storage: guardamos los callbacks para dispararlos desde el test. */
type FakeTask = {
  path: string;
  data: Blob;
  metadata: { contentType?: string; cacheControl?: string };
  next?: (s: { bytesTransferred: number; totalBytes: number }) => void;
  error?: (e: unknown) => void;
  complete?: () => void;
  cancel: ReturnType<typeof vi.fn>;
  snapshot: { ref: { fullPath: string } };
};

let tasks: FakeTask[] = [];
let configured = true;
const getDownloadURL = vi.fn();

vi.mock("firebase/storage", () => ({
  ref: (_storage: unknown, path: string) => ({ fullPath: path }),
  uploadBytesResumable: (r: { fullPath: string }, data: Blob, metadata: FakeTask["metadata"]) => {
    const task: FakeTask = {
      path: r.fullPath,
      data,
      metadata,
      snapshot: { ref: r },
      cancel: vi.fn(() => {
        task.error?.({ code: "storage/canceled" });
        return true;
      }),
      on(_event: string, next: FakeTask["next"], error: FakeTask["error"], complete: FakeTask["complete"]) {
        Object.assign(task, { next, error, complete });
        return () => {};
      },
    } as FakeTask & { on: unknown };
    tasks.push(task);
    return task;
  },
  getDownloadURL: (r: { fullPath: string }) => getDownloadURL(r),
}));

vi.mock("@/lib/firebase/client", () => ({
  get isStorageConfigured() {
    return configured;
  },
  getClientStorage: () => ({ app: "fake" }),
}));

const { ImageUploader } = await import("@/components/admin/ImageUploader");

const BUCKET_URL = "https://firebasestorage.googleapis.com/v0/b/clearpoint-colchones.firebasestorage.app/o/";
const MB = 1024 * 1024;
const jpg = (name = "foto.jpg", size = 1000) => new File([new Uint8Array(size)], name, { type: "image/jpeg" });

const onUploaded = vi.fn();

function setup(props: Partial<Parameters<typeof ImageUploader>[0]> = {}) {
  return render(<ImageUploader slug="colchon-nuevo" slugValid remaining={12} onUploaded={onUploaded} {...props} />);
}

function choose(...files: File[]) {
  fireEvent.change(screen.getByTestId("file-input"), { target: { files } });
}

beforeEach(() => {
  tasks = [];
  configured = true;
  onUploaded.mockReset();
  getDownloadURL.mockReset();
  getDownloadURL.mockImplementation(async (r: { fullPath: string }) => `${BUCKET_URL}${encodeURIComponent(r.fullPath)}?alt=media&token=t`);
  // jsdom no implementa createObjectURL (vista previa) ni createImageBitmap (se sube el original).
  URL.createObjectURL = vi.fn(() => "blob:http://localhost/preview");
  URL.revokeObjectURL = vi.fn();
});
afterEach(cleanup);

describe("ImageUploader", () => {
  it("sin bucket configurado oculta el botón y avisa", () => {
    configured = false;
    setup();
    expect(screen.queryByRole("button", { name: "Subir fotos" })).toBeNull();
    expect(screen.getByText(/Subida de fotos no disponible/)).toBeTruthy();
    expect(screen.getByText("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET")).toBeTruthy();
  });

  it("producto nuevo sin slug válido: botón desactivado y soltar ficheros no sube nada", () => {
    setup({ slug: "Mal Slug", slugValid: false });
    const button = screen.getByRole("button", { name: "Subir fotos" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByText(/Escribe primero un slug válido/)).toBeTruthy();
    fireEvent.drop(screen.getByTestId("dropzone"), { dataTransfer: { files: [jpg()] } });
    expect(tasks).toHaveLength(0);
  });

  it("sube a products/<slug>/<timestamp>-<aleatorio>, muestra progreso y añade la URL al terminar", async () => {
    const { container } = setup();
    choose(jpg("cama.jpg"));
    await waitFor(() => expect(tasks).toHaveLength(1));
    const task = tasks[0];
    // jsdom no puede comprimir: se sube el original (JPEG) con su extensión.
    expect(task.path).toMatch(/^products\/colchon-nuevo\/\d{13}-[a-z0-9]{8}\.jpg$/);
    expect(task.metadata.contentType).toBe("image/jpeg");
    expect(task.metadata.cacheControl).toContain("immutable");
    expect(container.querySelector("img")?.getAttribute("src")).toBe("blob:http://localhost/preview");

    act(() => task.next!({ bytesTransferred: 45, totalBytes: 100 }));
    expect(screen.getByText("45 %")).toBeTruthy();
    expect((screen.getByLabelText("Progreso de cama.jpg") as HTMLProgressElement).value).toBe(45);

    await act(async () => task.complete!());
    await waitFor(() => expect(onUploaded).toHaveBeenCalledTimes(1));
    expect(onUploaded.mock.calls[0][0]).toMatch(/^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/clearpoint-colchones\.firebasestorage\.app\/o\/products%2Fcolchon-nuevo%2F/);
    expect(screen.queryByText("cama.jpg")).toBeNull(); // sale de la cola: ya está en la lista de imágenes
    expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:http://localhost/preview");
    expect(screen.getByText("«cama.jpg» subida y añadida a las imágenes.")).toBeTruthy();
  });

  it("varias fotos a la vez arrastrando y soltando", async () => {
    setup();
    fireEvent.drop(screen.getByTestId("dropzone"), { dataTransfer: { files: [jpg("a.jpg"), jpg("b.jpg")] } });
    await waitFor(() => expect(tasks).toHaveLength(2));
    expect(new Set(tasks.map((t) => t.path)).size).toBe(2);
    await act(async () => {
      tasks[1].complete!();
      tasks[0].complete!();
    });
    await waitFor(() => expect(onUploaded).toHaveBeenCalledTimes(2));
  });

  it("un error de Storage se muestra en español y no añade nada", async () => {
    setup();
    choose(jpg("a.jpg"));
    await waitFor(() => expect(tasks).toHaveLength(1));
    act(() => tasks[0].error!({ code: "storage/unauthorized", message: "Firebase Storage: User does not have permission" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/No tienes permiso para subir fotos/);
    expect(screen.queryByText(/User does not have permission/)).toBeNull();
    expect(onUploaded).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Descartar a.jpg" }));
    expect(screen.queryByText("a.jpg")).toBeNull();
  });

  it("Cancelar detiene la subida y no añade la URL", async () => {
    setup();
    choose(jpg("a.jpg"));
    await waitFor(() => expect(tasks).toHaveLength(1));
    fireEvent.click(await screen.findByRole("button", { name: "Cancelar la subida de a.jpg" }));
    expect(tasks[0].cancel).toHaveBeenCalled();
    expect(await screen.findByText("Subida cancelada.")).toBeTruthy();
    expect(onUploaded).not.toHaveBeenCalled();
    expect(getDownloadURL).not.toHaveBeenCalled();
  });

  it("valida tipo y tamaño antes de subir", async () => {
    setup();
    choose(
      new File(["<svg/>"], "logo.svg", { type: "image/svg+xml" }),
      new File([new Uint8Array(21 * MB)], "enorme.jpg", { type: "image/jpeg" }),
      new File([new Uint8Array(6 * MB)], "grande.jpg", { type: "image/jpeg" }), // jsdom no comprime → > 5 MB
    );
    expect(await screen.findByText("«logo.svg» no es una imagen JPEG, PNG, WebP o AVIF.")).toBeTruthy();
    expect(screen.getByText(/«enorme\.jpg» pesa 21 MB; el máximo es 20 MB/)).toBeTruthy();
    expect(await screen.findByText(/«grande\.jpg» pesa 6 MB y este navegador no puede comprimirla/)).toBeTruthy();
    expect(tasks).toHaveLength(0);
  });

  it("respeta el máximo de 12 imágenes por producto", async () => {
    setup({ remaining: 1 });
    choose(jpg("a.jpg"), jpg("b.jpg"));
    await waitFor(() => expect(tasks).toHaveLength(1));
    expect(screen.getByText("«b.jpg»: un producto admite como máximo 12 imágenes.")).toBeTruthy();
  });

  it("sin huecos libres el botón se desactiva", () => {
    setup({ remaining: 0 });
    expect((screen.getByRole("button", { name: "Subir fotos" }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Ya hay 12 imágenes/)).toBeTruthy();
  });
});
