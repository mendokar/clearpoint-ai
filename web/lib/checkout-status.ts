/**
 * Estado de una sesión de Stripe Checkout tal como lo ve el cliente que la creó.
 * La página de pago completado lo consulta en servidor para no confirmar pagos que no existen
 * (defecto de QA: /checkout/exito?session_id=cs_test_inventado decía "Tu pago se ha completado").
 */
export type CheckoutSessionStatus = "paid" | "processing" | "unpaid" | "not_found";

export type SessionLike = {
  status?: string | null;
  payment_status?: string | null;
  client_reference_id?: string | null;
  metadata?: Record<string, string> | null;
};

export function checkoutSessionStatus(session: SessionLike | null | undefined, uid: string): CheckoutSessionStatus {
  // Una sesión de otro usuario se trata igual que una inexistente: no se revela que existe.
  if (!session) return "not_found";
  const owner = session.metadata?.uid ?? session.client_reference_id ?? null;
  if (!owner || owner !== uid) return "not_found";
  if (session.payment_status === "paid") return "paid";
  if (session.status === "complete") return "processing"; // pago asíncrono aún sin confirmar
  return "unpaid"; // abierta (no se pagó) o caducada
}
