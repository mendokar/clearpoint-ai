"use client";

import { getClientAuth } from "../firebase/client";

/**
 * Cliente de `/api/admin/**` para el navegador: añade el ID token vigente. La autorización real la hace el
 * servidor (token verificado + claim `admin`); aquí solo se traducen los errores a mensajes.
 */
export class AdminApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public fields: Record<string, string> = {},
    public field?: string,
  ) {
    super(message);
  }
}

export async function adminFetch<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const user = getClientAuth()?.currentUser;
  if (!user) throw new AdminApiError(401, "Tu sesión ha caducado. Vuelve a iniciar sesión.");
  const token = await user.getIdToken();
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: "no-store",
    });
  } catch {
    throw new AdminApiError(0, "No hemos podido conectar con el servidor. Revisa tu conexión.");
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string; fields?: Record<string, string>; field?: string };
  if (!res.ok) {
    const fallback =
      res.status === 401
        ? "Tu sesión ha caducado. Vuelve a iniciar sesión."
        : res.status === 403
          ? "No tienes permisos de administración."
          : "No se ha podido completar la operación.";
    throw new AdminApiError(res.status, data.error ?? fallback, data.fields ?? {}, data.field);
  }
  return data as T;
}

export function errorMessage(err: unknown): string {
  if (err instanceof AdminApiError) return err.message;
  return "Ha ocurrido un error inesperado. Inténtalo de nuevo.";
}
