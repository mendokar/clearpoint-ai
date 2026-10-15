import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { deleteObject, getBytes, getMetadata, listAll, ref, uploadBytes, type FirebaseStorage } from "firebase/storage";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

const BUCKET = "gs://clearpoint-colchones.firebasestorage.app";
const MB = 1024 * 1024;
const EXISTING = "products/colchon-cafetal/1700000000000-seed01.webp";

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-contoso",
    storage: { rules: readFileSync(fileURLToPath(new URL("../storage.rules", import.meta.url)), "utf8") },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearStorage();
  await env.withSecurityRulesDisabled(async (ctx) => {
    await uploadBytes(ref(ctx.storage(BUCKET), EXISTING), bytes(1024), { contentType: "image/webp" });
    await uploadBytes(ref(ctx.storage(BUCKET), "private/notas.txt"), bytes(10), { contentType: "text/plain" });
  });
});

function bytes(n: number): Uint8Array {
  return new Uint8Array(n).fill(7);
}

const ADMIN_EMAIL = "admin@contoso.example";
const admin = (): FirebaseStorage =>
  env.authenticatedContext("admin-1", { admin: true, email: ADMIN_EMAIL, email_verified: true }).storage(BUCKET);
const fakeAdmin = (): FirebaseStorage =>
  env.authenticatedContext("user-2", { admin: "true", email: ADMIN_EMAIL, email_verified: true }).storage(BUCKET);
/** Claim admin correcto pero con otro email. */
const otherEmailAdmin = (): FirebaseStorage =>
  env.authenticatedContext("admin-2", { admin: true, email: "otro@contoso.example", email_verified: true }).storage(BUCKET);
/** admin@contoso.example con claim pero sin verificar el email. */
const unverifiedAdmin = (): FirebaseStorage =>
  env.authenticatedContext("admin-3", { admin: true, email: ADMIN_EMAIL, email_verified: false }).storage(BUCKET);
/** admin@contoso.example verificado pero sin el claim. */
const emailOnly = (): FirebaseStorage =>
  env.authenticatedContext("admin-4", { email: ADMIN_EMAIL, email_verified: true }).storage(BUCKET);
const user = (): FirebaseStorage => env.authenticatedContext("alice").storage(BUCKET);
const anon = (): FirebaseStorage => env.unauthenticatedContext().storage(BUCKET);

const upload = (s: FirebaseStorage, path: string, size = 2048, contentType = "image/webp") =>
  uploadBytes(ref(s, path), bytes(size), { contentType });

const NEW = "products/colchon-cafetal/1760000000000-abc123.webp";

describe("subida de fotos de producto", () => {
  it("un admin sube una imagen válida (webp, jpeg, png, avif)", async () => {
    await assertSucceeds(upload(admin(), NEW));
    await assertSucceeds(upload(admin(), "products/colchon-cafetal/1-a.jpg", 2048, "image/jpeg"));
    await assertSucceeds(upload(admin(), "products/colchon-cafetal/1-b.png", 2048, "image/png"));
    await assertSucceeds(upload(admin(), "products/colchon-cafetal/1-c.avif", 2048, "image/avif"));
  });

  it("un usuario normal no puede subir", async () => {
    await assertFails(upload(user(), NEW));
  });

  it("un anónimo no puede subir", async () => {
    await assertFails(upload(anon(), NEW));
  });

  it('un claim admin en texto ("true") no vale', async () => {
    await assertFails(upload(fakeAdmin(), NEW));
  });

  it("un usuario con claim admin pero otro email no puede subir", async () => {
    await assertFails(upload(otherEmailAdmin(), NEW));
  });

  it("admin@contoso.example sin email verificado no puede subir", async () => {
    await assertFails(upload(unverifiedAdmin(), NEW));
  });

  it("admin@contoso.example verificado pero sin claim admin no puede subir", async () => {
    await assertFails(upload(emailOnly(), NEW));
  });

  it("un email parecido (mayúsculas o con espacios) no cuenta", async () => {
    const s = env
      .authenticatedContext("admin-5", { admin: true, email: "Admin@Contoso.example", email_verified: true })
      .storage(BUCKET);
    await assertFails(upload(s, NEW));
  });

  it("rechaza ficheros de 5 MB o más (y acepta justo por debajo)", async () => {
    await assertFails(upload(admin(), NEW, 5 * MB));
    await assertFails(upload(admin(), NEW, 6 * MB));
    await assertSucceeds(upload(admin(), NEW, 5 * MB - 1));
  });

  it("rechaza tipos que no son jpeg/png/webp/avif", async () => {
    await assertFails(upload(admin(), "products/colchon-cafetal/1-x.svg", 100, "image/svg+xml"));
    await assertFails(upload(admin(), "products/colchon-cafetal/1-x.gif", 100, "image/gif"));
    await assertFails(upload(admin(), "products/colchon-cafetal/1-x.html", 100, "text/html"));
    await assertFails(upload(admin(), "products/colchon-cafetal/1-x.webp", 100, "application/octet-stream"));
  });

  it("rechaza slugs con formato no válido", async () => {
    await assertFails(upload(admin(), "products/Colchon-Cafetal/1-a.webp"));
    await assertFails(upload(admin(), "products/colchon_cafetal/1-a.webp"));
    await assertFails(upload(admin(), "products/ab/1-a.webp"));
    await assertFails(upload(admin(), "products/-colchon/1-a.webp"));
    await assertFails(upload(admin(), `products/${"a".repeat(81)}/1-a.webp`));
  });

  it("rechaza rutas fuera de products/{slug}/{fichero}", async () => {
    await assertFails(upload(admin(), "otra/carpeta/1-a.webp"));
    await assertFails(upload(admin(), "1-a.webp"));
    await assertFails(upload(admin(), "products/1-a.webp"));
    await assertFails(upload(admin(), "products/colchon-cafetal/sub/1-a.webp"));
  });
});

describe("lectura", () => {
  it("las fotos de producto son públicas (también sin sesión)", async () => {
    await assertSucceeds(getMetadata(ref(anon(), EXISTING)));
    await assertSucceeds(getBytes(ref(anon(), EXISTING)));
    await assertSucceeds(getBytes(ref(user(), EXISTING)));
  });

  it("fuera de products/ no se puede leer, ni siendo admin", async () => {
    await assertFails(getBytes(ref(anon(), "private/notas.txt")));
    await assertFails(getBytes(ref(admin(), "private/notas.txt")));
  });

  it("listar la carpeta de un producto solo lo puede un admin", async () => {
    await assertFails(listAll(ref(anon(), "products/colchon-cafetal")));
    await assertFails(listAll(ref(user(), "products/colchon-cafetal")));
    await assertSucceeds(listAll(ref(admin(), "products/colchon-cafetal")));
  });
});

describe("borrado", () => {
  it("un admin puede borrar una foto de producto", async () => {
    await assertSucceeds(deleteObject(ref(admin(), EXISTING)));
  });

  it("usuario normal, anónimo y claim en texto no pueden borrar", async () => {
    await assertFails(deleteObject(ref(user(), EXISTING)));
    await assertFails(deleteObject(ref(anon(), EXISTING)));
    await assertFails(deleteObject(ref(fakeAdmin(), EXISTING)));
  });

  it("claim admin con otro email o sin verificar no puede borrar ni listar", async () => {
    await assertFails(deleteObject(ref(otherEmailAdmin(), EXISTING)));
    await assertFails(deleteObject(ref(unverifiedAdmin(), EXISTING)));
    await assertFails(listAll(ref(otherEmailAdmin(), "products/colchon-cafetal")));
  });

  it("nadie borra fuera de products/ (ni un admin)", async () => {
    await assertFails(deleteObject(ref(admin(), "private/notas.txt")));
  });
});
