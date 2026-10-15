import "server-only";
import policyMd from "../../data/shipping_policy.md";
import { getAdminDb, isAdminConfigured } from "./firebase/admin";

/** Política de envíos: Firestore `content/shipping_policy` si hay credenciales; si no, data/shipping_policy.md. */
export async function getShippingPolicy(): Promise<string> {
  if (isAdminConfigured()) {
    try {
      const snap = await getAdminDb().collection("content").doc("shipping_policy").get();
      const body = snap.data()?.body_md;
      if (typeof body === "string" && body.trim()) return body;
    } catch (err) {
      console.error("[content] Firestore no disponible, se usa la política local", err instanceof Error ? err.message : err);
    }
  }
  return policyMd;
}
