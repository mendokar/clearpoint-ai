/**
 * Asigna o quita el rol de administrador (custom claim `admin: true`) a un usuario de Firebase Auth.
 *   npx tsx --env-file=.env set-admin.ts persona@ejemplo.com            # asigna
 *   npx tsx --env-file=.env set-admin.ts persona@ejemplo.com --revoke   # quita y cierra sus sesiones
 * Idempotente. El usuario debe existir (haberse registrado o entrado con Google al menos una vez).
 * Tras asignarlo, basta con recargar /admin: la web pide un ID token nuevo (getIdTokenResult(true)).
 */
import { auth, fail, initAdmin } from "./lib/admin";
import { parseArgs, setAdmin, SetAdminError } from "./lib/set-admin";
import { parseAdminEmails } from "../web/lib/admin/allowlist";

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    fail(err instanceof Error ? err.message : String(err));
  }
  initAdmin();
  const result = await setAdmin(auth(), args.email, args.revoke, parseAdminEmails(process.env.ADMIN_EMAILS));
  const messages = {
    granted: `✓ ${args.email} (${result.uid}) ahora es administrador. Que recargue /admin para refrescar su token.`,
    revoked: `✓ ${args.email} (${result.uid}) ya no es administrador; sus sesiones se han revocado.`,
    unchanged: `= ${args.email} (${result.uid}) ya estaba ${args.revoke ? "sin" : "con"} rol de administrador; no se ha cambiado nada.`,
  };
  console.log(messages[result.status]);
}

main().then(
  () => process.exit(0),
  (err) => fail(err instanceof SetAdminError || err instanceof Error ? err.message : String(err)),
);
