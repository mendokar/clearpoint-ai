import { describe, expect, it } from "vitest";
import { adminDenyReason, isAllowedAdmin, parseAdminEmails } from "@/lib/admin/allowlist";

const allowed = parseAdminEmails(undefined);

describe("lista de administradores", () => {
  it("por defecto solo admin@contoso.example", () => {
    expect(allowed).toEqual(["admin@contoso.example"]);
    expect(parseAdminEmails(" Admin@Contoso.example , jefa@contoso.example ")).toEqual([
      "admin@contoso.example",
      "jefa@contoso.example",
    ]);
    expect(parseAdminEmails(" , ")).toEqual(["admin@contoso.example"]);
  });

  it("exige claim admin booleano, correo verificado y correo permitido", () => {
    const ok = { admin: true, email: "ADMIN@contoso.example", email_verified: true };
    expect(isAllowedAdmin(ok, allowed)).toBe(true);
    expect(adminDenyReason({ ...ok, admin: "true" }, allowed)).toBe("no_claim");
    expect(adminDenyReason({ ...ok, admin: undefined }, allowed)).toBe("no_claim");
    expect(adminDenyReason({ ...ok, email_verified: false }, allowed)).toBe("email_not_verified");
    expect(adminDenyReason({ ...ok, email: "otro@example.com" }, allowed)).toBe("email_not_allowed");
    expect(adminDenyReason({ ...ok, email: undefined }, allowed)).toBe("email_not_allowed");
    expect(isAllowedAdmin(null, allowed)).toBe(false);
  });
});
