import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseArgs, setAdmin, SetAdminError, type AdminAuthLike } from "../lib/set-admin";

/** Doble de firebase-admin/auth en memoria que registra las escrituras. */
function fakeAuth(users: Record<string, { uid: string; customClaims?: Record<string, unknown> }>) {
  const calls: { setClaims: [string, Record<string, unknown> | null][]; revoked: string[] } = { setClaims: [], revoked: [] };
  const auth: AdminAuthLike = {
    async getUserByEmail(email) {
      const u = users[email];
      if (!u) throw Object.assign(new Error("not found"), { code: "auth/user-not-found" });
      return { ...u, email };
    },
    async setCustomUserClaims(uid, claims) {
      calls.setClaims.push([uid, claims]);
      const entry = Object.values(users).find((u) => u.uid === uid)!;
      entry.customClaims = claims ?? undefined;
    },
    async revokeRefreshTokens(uid) {
      calls.revoked.push(uid);
    },
  };
  return { auth, calls };
}

describe("parseArgs", () => {
  it("acepta email y --revoke en cualquier orden y normaliza el email", () => {
    assert.deepEqual(parseArgs(["Ana@Example.com"]), { email: "ana@example.com", revoke: false });
    assert.deepEqual(parseArgs(["--revoke", "ana@example.com"]), { email: "ana@example.com", revoke: true });
  });
  it("rechaza argumentos ausentes, emails mal formados y opciones desconocidas", () => {
    assert.throws(() => parseArgs([]), SetAdminError);
    assert.throws(() => parseArgs(["no-es-email"]), SetAdminError);
    assert.throws(() => parseArgs(["a@b.com", "c@d.com"]), SetAdminError);
    assert.throws(() => parseArgs(["a@b.com", "--force"]), SetAdminError);
  });
});

describe("setAdmin", () => {
  it("asigna el claim conservando los demás", async () => {
    const { auth, calls } = fakeAuth({ "ana@example.com": { uid: "u1", customClaims: { plan: "pro" } } });
    assert.deepEqual(await setAdmin(auth, "ana@example.com", false, ["ana@example.com"]), { uid: "u1", status: "granted" });
    assert.deepEqual(calls.setClaims, [["u1", { plan: "pro", admin: true }]]);
    assert.deepEqual(calls.revoked, []);
  });

  it("es idempotente: si ya es admin no escribe", async () => {
    const { auth, calls } = fakeAuth({ "ana@example.com": { uid: "u1", customClaims: { admin: true } } });
    assert.equal((await setAdmin(auth, "ana@example.com", false, ["ana@example.com"])).status, "unchanged");
    assert.equal(calls.setClaims.length, 0);
  });

  it("--revoke quita solo el claim admin y revoca las sesiones", async () => {
    const { auth, calls } = fakeAuth({ "ana@example.com": { uid: "u1", customClaims: { admin: true, plan: "pro" } } });
    assert.equal((await setAdmin(auth, "ana@example.com", true)).status, "revoked");
    assert.deepEqual(calls.setClaims, [["u1", { plan: "pro" }]]);
    assert.deepEqual(calls.revoked, ["u1"]);
  });

  it("--revoke sin más claims los deja a null", async () => {
    const { auth, calls } = fakeAuth({ "ana@example.com": { uid: "u1", customClaims: { admin: true } } });
    await setAdmin(auth, "ana@example.com", true);
    assert.deepEqual(calls.setClaims, [["u1", null]]);
  });

  it("--revoke sobre quien no es admin no escribe ni revoca", async () => {
    const { auth, calls } = fakeAuth({ "ana@example.com": { uid: "u1" } });
    assert.equal((await setAdmin(auth, "ana@example.com", true)).status, "unchanged");
    assert.equal(calls.setClaims.length, 0);
    assert.equal(calls.revoked.length, 0);
  });

  it("usuario inexistente → error explicativo", async () => {
    const { auth } = fakeAuth({});
    await assert.rejects(setAdmin(auth, "nadie@example.com", false, ["nadie@example.com"]), /No existe ningún usuario/);
  });

  it("no concede el rol a correos fuera de la lista permitida (por defecto solo admin@contoso.example)", async () => {
    const { auth, calls } = fakeAuth({ "ana@example.com": { uid: "u1", customClaims: {} } });
    await assert.rejects(setAdmin(auth, "ana@example.com", false), /no está en la lista de administradores/);
    await assert.rejects(setAdmin(auth, "ana@example.com", false, ["admin@contoso.example"]), /no está en la lista/);
    assert.equal(calls.setClaims.length, 0);
  });

  it("quitar el rol funciona aunque el correo no esté en la lista", async () => {
    const { auth, calls } = fakeAuth({ "ana@example.com": { uid: "u1", customClaims: { admin: true } } });
    assert.equal((await setAdmin(auth, "ana@example.com", true)).status, "revoked");
    assert.deepEqual(calls.revoked, ["u1"]);
  });
});
