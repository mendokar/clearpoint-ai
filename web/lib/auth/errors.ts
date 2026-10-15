/** Traduce códigos de error de Firebase Auth a mensajes en español. */
const MESSAGES: Record<string, string> = {
  "auth/invalid-email": "El correo no tiene un formato válido.",
  "auth/missing-password": "Escribe tu contraseña.",
  "auth/weak-password": "La contraseña debe tener al menos 6 caracteres.",
  "auth/email-already-in-use": "Ya existe una cuenta con ese correo. Inicia sesión.",
  "auth/invalid-credential": "Correo o contraseña incorrectos.",
  "auth/wrong-password": "Correo o contraseña incorrectos.",
  "auth/user-not-found": "Correo o contraseña incorrectos.",
  "auth/user-disabled": "Esta cuenta está desactivada. Escríbenos a hola@contoso.example.",
  "auth/too-many-requests": "Demasiados intentos. Espera unos minutos y vuelve a probar.",
  "auth/network-request-failed": "No hay conexión. Revisa tu red e inténtalo de nuevo.",
  "auth/account-exists-with-different-credential":
    "Ese correo ya tiene una cuenta con contraseña. Inicia sesión con tu correo y contraseña.",
  "auth/unauthorized-domain":
    "Este dominio no está autorizado para iniciar sesión con Google. Avisa al equipo de la tienda.",
  "auth/operation-not-allowed": "Este método de acceso no está habilitado en la tienda.",
  "auth/popup-blocked": "El navegador ha bloqueado la ventana de Google.",
  "auth/internal-error": "No hemos podido completar el acceso. Inténtalo de nuevo.",
};

/** Errores que no merecen un mensaje alarmante (el usuario cerró la ventana). */
export const SILENT_AUTH_ERRORS = new Set([
  "auth/popup-closed-by-user",
  "auth/cancelled-popup-request",
  "auth/user-cancelled",
]);

export function authErrorCode(err: unknown): string {
  if (err && typeof err === "object" && "code" in err && typeof err.code === "string") return err.code;
  return "unknown";
}

export function authErrorMessage(err: unknown): string {
  return MESSAGES[authErrorCode(err)] ?? "Algo ha fallado. Inténtalo de nuevo en unos segundos.";
}
