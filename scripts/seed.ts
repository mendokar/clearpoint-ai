/**
 * Seed idempotente de Firestore y Firebase Auth:
 *  - products/{slug}            ← data/catalog.json
 *  - content/shipping_policy    ← data/shipping_policy.md
 *  - 2 usuarios demo en Auth    ← DEMO1_EMAIL/DEMO1_PASSWORD, DEMO2_EMAIL/DEMO2_PASSWORD
 *  - users/{uid}                ← perfil de los usuarios demo
 *  - orders/{id}                ← data/demo_orders.json (DEMO_UID_1/2 → uid reales)
 *  - counters/orders            ← al menos el mayor número de pedido demo
 * Ejecutar varias veces deja el mismo resultado (set con IDs fijos, usuarios por email).
 */
import { readFileSync } from "node:fs";
import { Timestamp } from "firebase-admin/firestore";
import { z } from "zod";
import { auth, db, fail, initAdmin, readJson } from "./lib/admin";

const DATA = new URL("../data/", import.meta.url);

const catalogSchema = z.object({
  products: z.array(z.object({ slug: z.string().regex(/^[a-z0-9-]+$/), name: z.string() }).passthrough()).min(1),
});
const orderSchema = z
  .object({
    id: z.string().regex(/^cs_[A-Za-z0-9_]+$/),
    orderNumber: z.string().regex(/^CP-\d{6}$/),
    userId: z.string(),
    statusHistory: z.array(z.object({ status: z.string(), at: z.string() })),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .passthrough();
const ordersSchema = z.object({ orders: z.array(orderSchema) });

function env(name: string): string {
  const v = process.env[name];
  if (!v) fail(`Falta la variable ${name}`);
  return v;
}

async function upsertUser(email: string, password: string, displayName: string): Promise<string> {
  if (password.length < 8) fail(`La contraseña de ${email} debe tener al menos 8 caracteres`);
  try {
    const existing = await auth().getUserByEmail(email);
    await auth().updateUser(existing.uid, { password, displayName, emailVerified: true });
    return existing.uid;
  } catch (err) {
    if ((err as { code?: string }).code !== "auth/user-not-found") throw err;
    const created = await auth().createUser({ email, password, displayName, emailVerified: true });
    return created.uid;
  }
}

const ts = (iso: string) => Timestamp.fromDate(new Date(iso));

async function main() {
  initAdmin();
  const now = Timestamp.now();

  // 1. Productos
  const catalog = catalogSchema.parse(readJson(new URL("catalog.json", DATA)));
  const batch = db().batch();
  for (const p of catalog.products) {
    batch.set(db().collection("products").doc(p.slug), { ...p, updatedAt: now });
  }

  // 2. Política de envíos
  const policy = readFileSync(new URL("shipping_policy.md", DATA), "utf8");
  batch.set(db().collection("content").doc("shipping_policy"), {
    title: "Envíos y devoluciones",
    body_md: policy,
    updatedAt: now,
  });
  await batch.commit();
  console.log(`✓ ${catalog.products.length} productos y la política de envíos`);

  // 3. Usuarios demo (contraseñas SOLO desde variables de entorno)
  const demo1Email = process.env.DEMO1_EMAIL ?? "demo1@contoso.example";
  const demo2Email = process.env.DEMO2_EMAIL ?? "demo2@contoso.example";
  const uid1 = await upsertUser(demo1Email, env("DEMO1_PASSWORD"), "Demo Uno");
  const uid2 = await upsertUser(demo2Email, env("DEMO2_PASSWORD"), "Demo Dos");
  const uidMap: Record<string, { uid: string; email: string }> = {
    DEMO_UID_1: { uid: uid1, email: demo1Email },
    DEMO_UID_2: { uid: uid2, email: demo2Email },
  };
  for (const [uid, email, name] of [
    [uid1, demo1Email, "Demo Uno"],
    [uid2, demo2Email, "Demo Dos"],
  ] as const) {
    const ref = db().collection("users").doc(uid);
    const snap = await ref.get();
    await ref.set(
      { email, displayName: name, photoURL: null, provider: "password", updatedAt: now, ...(snap.exists ? {} : { createdAt: now }) },
      { merge: true },
    );
  }
  console.log(`✓ usuarios demo: ${demo1Email} (${uid1}), ${demo2Email} (${uid2})`);

  // 4. Pedidos demo
  const { orders } = ordersSchema.parse(readJson(new URL("demo_orders.json", DATA)));
  let maxNumber = 0;
  const ordersBatch = db().batch();
  for (const o of orders) {
    const owner = uidMap[o.userId];
    if (!owner) fail(`Pedido ${o.orderNumber}: userId desconocido ${o.userId}`);
    const { id, ...rest } = o;
    ordersBatch.set(db().collection("orders").doc(id), {
      ...rest,
      userId: owner.uid,
      email: owner.email,
      statusHistory: o.statusHistory.map((h) => ({ status: h.status, at: ts(h.at) })),
      createdAt: ts(o.createdAt),
      updatedAt: ts(o.updatedAt),
    });
    maxNumber = Math.max(maxNumber, Number(o.orderNumber.slice(3)));
  }
  await ordersBatch.commit();

  // 5. Contador: nunca retrocede (los pedidos reales siguen después de los demo)
  await db().runTransaction(async (tx) => {
    const ref = db().collection("counters").doc("orders");
    const current = ((await tx.get(ref)).data()?.value as number | undefined) ?? 0;
    tx.set(ref, { value: Math.max(current, maxNumber), updatedAt: now }, { merge: true });
  });
  console.log(`✓ ${orders.length} pedidos demo; contador de pedidos ≥ ${maxNumber}`);
}

main().then(
  () => process.exit(0),
  (err) => fail(err instanceof Error ? err.message : String(err)),
);
