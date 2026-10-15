import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb, isAdminConfigured, verifyBearer } from "@/lib/firebase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/users/me — crea o actualiza `users/{uid}` con los datos del token
 * verificado (el cliente no puede escribir en `users`). No acepta cuerpo:
 * todo sale del ID token, así que nadie puede escribir el perfil de otro.
 */
export async function POST(req: Request) {
  if (!isAdminConfigured()) {
    return NextResponse.json({ error: "Servicio no disponible." }, { status: 503 });
  }
  const user = await verifyBearer(req.headers.get("authorization"));
  if (!user) return NextResponse.json({ error: "No autorizado." }, { status: 401 });

  const ref = getAdminDb().collection("users").doc(user.uid);
  const provider = user.firebase?.sign_in_provider ?? "unknown";
  const profile = {
    email: user.email ?? null,
    displayName: typeof user.name === "string" ? user.name.slice(0, 120) : null,
    photoURL: typeof user.picture === "string" && user.picture.startsWith("https://") ? user.picture : null,
    provider,
    updatedAt: FieldValue.serverTimestamp(),
  };

  await getAdminDb().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (snap.exists) tx.set(ref, profile, { merge: true });
    else tx.set(ref, { ...profile, createdAt: FieldValue.serverTimestamp() });
  });

  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
