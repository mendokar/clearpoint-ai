/**
 * Avanza el estado de un pedido (demo, sin panel de administración).
 *   npx tsx update-order-status.ts CP-000123 shipped [--carrier SEUR] [--tracking SE123] [--eta 2026-10-20]
 * Añade la entrada a statusHistory y, al pasar a "shipped", rellena carrier,
 * trackingNumber y estimatedDelivery (valores por defecto si no se indican).
 */
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { db, fail, initAdmin } from "./lib/admin";

const STATUSES = ["paid", "preparing", "shipped", "delivered", "cancelled"] as const;
type Status = (typeof STATUSES)[number];

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : undefined;
}

function addBusinessDays(date: Date, days: number): Date {
  const d = new Date(date);
  while (days > 0) {
    d.setDate(d.getDate() + 1);
    if (d.getDay() !== 0 && d.getDay() !== 6) days -= 1;
  }
  return d;
}

async function main() {
  const [orderNumber, status] = process.argv.slice(2) as [string | undefined, string | undefined];
  if (!orderNumber || !/^CP-\d{6}$/.test(orderNumber) || !status || !STATUSES.includes(status as Status)) {
    fail(`Uso: tsx update-order-status.ts <CP-000123> <${STATUSES.join("|")}> [--carrier X] [--tracking Y] [--eta AAAA-MM-DD]`);
  }
  initAdmin();

  const snap = await db().collection("orders").where("orderNumber", "==", orderNumber).limit(1).get();
  const doc = snap.docs[0];
  if (!doc) fail(`No existe el pedido ${orderNumber}`);

  const now = Timestamp.now();
  const update: Record<string, unknown> = {
    status,
    statusHistory: FieldValue.arrayUnion({ status, at: now }),
    updatedAt: now,
  };
  if (status === "shipped") {
    const eta = arg("--eta") ?? addBusinessDays(new Date(), 2).toISOString().slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(eta)) fail("--eta debe tener formato AAAA-MM-DD");
    update.carrier = arg("--carrier") ?? doc.get("carrier") ?? "SEUR";
    update.trackingNumber =
      arg("--tracking") ?? doc.get("trackingNumber") ?? `SE${Math.floor(1e9 + Math.random() * 9e9)}`;
    update.estimatedDelivery = eta;
  }
  if (status === "delivered" && !doc.get("estimatedDelivery")) {
    update.estimatedDelivery = new Date().toISOString().slice(0, 10);
  }

  await doc.ref.update(update);
  const after = (await doc.ref.get()).data() ?? {};
  console.log(`✓ ${orderNumber} (${doc.id}) → ${status}`);
  if (status === "shipped") {
    console.log(`  transportista: ${after.carrier} · seguimiento: ${after.trackingNumber} · entrega estimada: ${after.estimatedDelivery}`);
  }
  console.log(`  historial: ${(after.statusHistory as { status: string }[]).map((h) => h.status).join(" → ")}`);
}

main().then(
  () => process.exit(0),
  (err) => fail(err instanceof Error ? err.message : String(err)),
);
