/**
 * Avanza el estado de un pedido desde la terminal (el panel /admin/pedidos hace lo mismo con interfaz).
 *   npx tsx update-order-status.ts CP-000123 preparing
 *   npx tsx update-order-status.ts CP-000123 shipped [--carrier SEUR] [--tracking SE123] [--eta 2026-10-20]
 *   npx tsx update-order-status.ts CP-000123 paid --force     # salta la validación de transiciones (demos)
 * Usa las MISMAS reglas que el panel (web/lib/orders/status.ts): paid → preparing → shipped → delivered y
 * cancelled desde paid/preparing. Añade la entrada a statusHistory; al pasar a "shipped" rellena carrier,
 * trackingNumber y estimatedDelivery (con valores por defecto si no se indican). No envía emails.
 */
import { Timestamp } from "firebase-admin/firestore";
import {
  addBusinessDays,
  isOrderStatus,
  ORDER_STATUSES,
  planStatusChange,
  STATUS_LABELS,
  StatusChangeError,
} from "../web/lib/orders/status";
import { db, fail, initAdmin } from "./lib/admin";

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const [orderNumber, status] = process.argv.slice(2) as [string | undefined, string | undefined];
  if (!orderNumber || !/^CP-\d{6}$/.test(orderNumber) || !isOrderStatus(status)) {
    fail(
      `Uso: tsx update-order-status.ts <CP-000123> <${ORDER_STATUSES.join("|")}> [--carrier X] [--tracking Y] [--eta AAAA-MM-DD] [--force]`,
    );
  }
  const force = process.argv.includes("--force");
  initAdmin();

  const snap = await db().collection("orders").where("orderNumber", "==", orderNumber).limit(1).get();
  const doc = snap.docs[0];
  if (!doc) fail(`No existe el pedido ${orderNumber}`);

  const current = doc.get("status");
  if (!isOrderStatus(current)) fail(`El pedido ${orderNumber} tiene un estado desconocido: ${String(current)}`);

  const now = new Date();
  let plan;
  try {
    plan = planStatusChange(
      { status: current, estimatedDelivery: doc.get("estimatedDelivery") ?? null },
      {
        status,
        carrier: arg("--carrier") ?? doc.get("carrier") ?? "SEUR",
        trackingNumber: arg("--tracking") ?? doc.get("trackingNumber") ?? `SE${Math.floor(1e9 + Math.random() * 9e9)}`,
        estimatedDelivery: arg("--eta") ?? addBusinessDays(now, 2).toISOString().slice(0, 10),
      },
      now,
      { force },
    );
  } catch (err) {
    if (err instanceof StatusChangeError) fail(`${err.message}${err.code === "invalid_transition" ? " (usa --force para forzarlo en una demo)" : ""}`);
    throw err;
  }

  const at = Timestamp.fromDate(now);
  const history = (doc.get("statusHistory") as unknown[] | undefined) ?? [];
  await doc.ref.update({ ...plan.update, statusHistory: [...history, { status, at }], updatedAt: at });

  const after = (await doc.ref.get()).data() ?? {};
  console.log(`✓ ${orderNumber} (${doc.id}) → ${STATUS_LABELS[status]}`);
  if (status === "shipped") {
    console.log(`  transportista: ${after.carrier} · seguimiento: ${after.trackingNumber} · entrega estimada: ${after.estimatedDelivery}`);
  }
  console.log(`  historial: ${(after.statusHistory as { status: string }[]).map((h) => h.status).join(" → ")}`);
}

main().then(
  () => process.exit(0),
  (err) => fail(err instanceof Error ? err.message : String(err)),
);
