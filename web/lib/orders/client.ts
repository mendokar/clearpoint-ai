"use client";

import { collection, doc, getDoc, getDocs, limit, orderBy, query, where } from "firebase/firestore";
import { getClientDb } from "../firebase/client";
import type { Order } from "./types";

export type OrderWithId = Order & { id: string };

/** Pedidos del usuario. Las reglas de Firestore solo permiten leer los propios. */
export async function fetchMyOrders(uid: string): Promise<OrderWithId[]> {
  const db = getClientDb();
  if (!db) return [];
  const q = query(collection(db, "orders"), where("userId", "==", uid), orderBy("createdAt", "desc"), limit(50));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Order) }));
}

/** Devuelve null si no existe o si no es del usuario (las reglas deniegan la lectura). */
export async function fetchMyOrder(id: string): Promise<OrderWithId | null> {
  const db = getClientDb();
  if (!db) return null;
  try {
    const snap = await getDoc(doc(db, "orders", id));
    return snap.exists() ? { id: snap.id, ...(snap.data() as Order) } : null;
  } catch (err) {
    if (err && typeof err === "object" && "code" in err && err.code === "permission-denied") return null;
    throw err;
  }
}
