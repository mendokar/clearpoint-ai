import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { collection, doc, getDoc, getDocs, query, setDoc, updateDoc, deleteDoc, where } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-contoso",
    firestore: { rules: readFileSync(fileURLToPath(new URL("../firestore.rules", import.meta.url)), "utf8") },
  });
});

afterAll(async () => {
  await env?.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, "products/colchon-cafetal"), { name: "Colchón Cafetal", active: true });
    await setDoc(doc(db, "content/shipping_policy"), { body_md: "# Envíos" });
    await setDoc(doc(db, "users/alice"), { email: "alice@example.com" });
    await setDoc(doc(db, "orders/cs_test_alice"), { userId: "alice", orderNumber: "CP-000001", createdAt: 1 });
    await setDoc(doc(db, "orders/cs_test_bob"), { userId: "bob", orderNumber: "CP-000002", createdAt: 2 });
  });
});

const alice = () => env.authenticatedContext("alice").firestore();
const anon = () => env.unauthenticatedContext().firestore();

describe("orders", () => {
  it("el dueño puede leer su pedido", async () => {
    await assertSucceeds(getDoc(doc(alice(), "orders/cs_test_alice")));
  });
  it("no se puede leer el pedido de otro usuario", async () => {
    await assertFails(getDoc(doc(alice(), "orders/cs_test_bob")));
  });
  it("un anónimo no puede leer pedidos", async () => {
    await assertFails(getDoc(doc(anon(), "orders/cs_test_alice")));
  });
  it("la consulta filtrada por el propio uid está permitida", async () => {
    await assertSucceeds(getDocs(query(collection(alice(), "orders"), where("userId", "==", "alice"))));
  });
  it("una consulta sin filtro por uid se deniega (no lista pedidos ajenos)", async () => {
    await assertFails(getDocs(collection(alice(), "orders")));
  });
  it("el cliente no puede crear, modificar ni borrar pedidos", async () => {
    await assertFails(setDoc(doc(alice(), "orders/cs_test_new"), { userId: "alice" }));
    await assertFails(updateDoc(doc(alice(), "orders/cs_test_alice"), { status: "delivered" }));
    await assertFails(deleteDoc(doc(alice(), "orders/cs_test_alice")));
  });
});

describe("products y content", () => {
  it("lectura pública", async () => {
    await assertSucceeds(getDoc(doc(anon(), "products/colchon-cafetal")));
    await assertSucceeds(getDoc(doc(anon(), "content/shipping_policy")));
  });
  it("escritura denegada incluso autenticado", async () => {
    await assertFails(setDoc(doc(alice(), "products/colchon-cafetal"), { name: "hack" }));
    await assertFails(setDoc(doc(alice(), "content/shipping_policy"), { body_md: "hack" }));
    await assertFails(setDoc(doc(anon(), "products/nuevo"), { name: "hack" }));
  });
});

describe("users", () => {
  it("cada usuario lee solo su perfil", async () => {
    await assertSucceeds(getDoc(doc(alice(), "users/alice")));
    await assertFails(getDoc(doc(alice(), "users/bob")));
    await assertFails(getDoc(doc(anon(), "users/alice")));
  });
  it("el cliente no puede escribir perfiles (se hace en /api/users/me)", async () => {
    await assertFails(setDoc(doc(alice(), "users/alice"), { email: "x" }));
  });
});

describe("colecciones no declaradas", () => {
  it("counters y cualquier otra ruta están denegadas", async () => {
    await assertFails(getDoc(doc(alice(), "counters/orders")));
    await assertFails(setDoc(doc(alice(), "counters/orders"), { value: 1 }));
  });
});
