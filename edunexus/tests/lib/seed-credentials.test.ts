import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  parseSeedCredentials,
  readSeedCredentials,
  requireStaffEntry,
  resolveSeedPassword,
} from "../../src/lib/seed-credentials";
import { join } from "node:path";

const GOOD = JSON.stringify({
  defaultPassword: "Admin@12345",
  staff: [
    { email: "admin@edunexus.edu.ng", name: "System Administrator", role: "SUPER_ADMIN" },
    { email: "registrar@edunexus.edu.ng", name: "College Registrar", role: "REGISTRAR" },
  ],
});

describe("parseSeedCredentials", () => {
  it("accepts the canonical shape", () => {
    const parsed = parseSeedCredentials(GOOD);
    assert.equal(parsed.defaultPassword, "Admin@12345");
    assert.equal(parsed.staff.length, 2);
  });

  it("rejects a missing or empty defaultPassword", () => {
    assert.throws(() => parseSeedCredentials(JSON.stringify({ staff: [] })), /defaultPassword/);
    assert.throws(
      () => parseSeedCredentials(JSON.stringify({ defaultPassword: "", staff: [] })),
      /defaultPassword/
    );
  });

  it("rejects a missing or empty staff array", () => {
    assert.throws(() => parseSeedCredentials(JSON.stringify({ defaultPassword: "x" })), /staff/);
    assert.throws(
      () => parseSeedCredentials(JSON.stringify({ defaultPassword: "x", staff: [] })),
      /staff/
    );
  });

  it("rejects staff entries missing any required field", () => {
    for (const field of ["email", "name", "role"]) {
      const bad = { defaultPassword: "x", staff: [{ email: "a@b.c", name: "A", role: "SUPER_ADMIN" }] };
      delete (bad.staff[0] as Record<string, unknown>)[field];
      assert.throws(() => parseSeedCredentials(JSON.stringify(bad)), new RegExp(field));
    }
  });

  it("rejects duplicate staff emails case-insensitively", () => {
    const dup = {
      defaultPassword: "x",
      staff: [
        { email: "admin@edunexus.edu.ng", name: "One", role: "SUPER_ADMIN" },
        { email: "ADMIN@EDUNEXUS.EDU.NG", name: "Two", role: "REGISTRAR" },
      ],
    };
    assert.throws(() => parseSeedCredentials(JSON.stringify(dup)), /duplicate staff email/i);
  });
});

describe("resolveSeedPassword", () => {
  const credentials = { defaultPassword: "Admin@12345" };

  it("uses the file value when no override is set", () => {
    assert.equal(resolveSeedPassword(credentials), "Admin@12345");
  });

  it("lets SEED_ADMIN_PASSWORD override the file", () => {
    assert.equal(resolveSeedPassword(credentials, "Override@99"), "Override@99");
  });

  it("throws when neither source provides a password", () => {
    assert.throws(() => resolveSeedPassword({ defaultPassword: "" }, undefined), /No seed password/);
    assert.throws(() => resolveSeedPassword({ defaultPassword: "x" }, ""), /No seed password/);
  });
});

describe("requireStaffEntry", () => {
  const credentials = parseSeedCredentials(GOOD);

  it("finds entries case-insensitively", () => {
    assert.equal(requireStaffEntry(credentials, "ADMIN@edunexus.edu.ng").role, "SUPER_ADMIN");
  });

  it("throws for unknown emails (Laravel seeder parity)", () => {
    assert.throws(() => requireStaffEntry(credentials, "ghost@edunexus.edu.ng"), /no staff entry/);
  });
});

describe("readSeedCredentials (real shared file)", () => {
  // The actual file both seeders consume — this is the cross-app contract.
  const credentials = readSeedCredentials(join(import.meta.dirname, "..", ".."));

  it("contains the canonical smoke-test admin", () => {
    const admin = requireStaffEntry(credentials, "admin@edunexus.edu.ng");
    assert.equal(admin.role, "SUPER_ADMIN");
  });

  it("smoke.mjs dependencies exist: admissions officer + super admin", () => {
    assert.equal(requireStaffEntry(credentials, "admissions@edunexus.edu.ng").role, "ADMISSIONS_OFFICER");
  });

  it("defaultPassword is set and all 8 staff roles are present", () => {
    assert.ok(credentials.defaultPassword.length > 0);
    const roles = credentials.staff.map((s) => s.role);
    for (const role of [
      "SUPER_ADMIN", "ADMIN", "REGISTRAR", "ADMISSIONS_OFFICER",
      "ACADEMIC_OFFICER", "BURSARY_OFFICER", "HOD", "LECTURER",
    ]) {
      assert.ok(roles.includes(role), `missing role ${role}`);
    }
  });
});
