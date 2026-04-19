import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { resolveExplicitAdminCredentials } from "./adminCredentials.js";

const originalAdminEmail = process.env.ADMIN_EMAIL;
const originalAdminPassword = process.env.ADMIN_PASSWORD;

afterEach(() => {
  restoreEnv();
});

describe("admin credential guards", () => {
  it("rejects missing bootstrap email", () => {
    delete process.env.ADMIN_EMAIL;
    process.env.ADMIN_PASSWORD = "ValidPassword1!";

    assert.throws(
      () => resolveExplicitAdminCredentials("bootstrap"),
      /Bootstrap requires explicit ADMIN_EMAIL\./
    );
  });

  it("rejects missing bootstrap password", () => {
    process.env.ADMIN_EMAIL = "admin@example.com";
    delete process.env.ADMIN_PASSWORD;

    assert.throws(
      () => resolveExplicitAdminCredentials("bootstrap"),
      /Bootstrap requires explicit ADMIN_PASSWORD\./
    );
  });

  it("rejects placeholder bootstrap password even with a custom email", () => {
    process.env.ADMIN_EMAIL = "ops@example.com";
    process.env.ADMIN_PASSWORD = "ChangeMe123!";

    assert.throws(
      () => resolveExplicitAdminCredentials("bootstrap"),
      /Bootstrap refuses placeholder ADMIN_PASSWORD "ChangeMe123!"\./
    );
  });

  it("rejects placeholder seed password", () => {
    process.env.ADMIN_EMAIL = "seed-admin@example.com";
    process.env.ADMIN_PASSWORD = "ChangeMe123!";

    assert.throws(
      () => resolveExplicitAdminCredentials("seed"),
      /Seed refuses placeholder ADMIN_PASSWORD "ChangeMe123!"\./
    );
  });

  it("accepts explicit seed credentials", () => {
    process.env.ADMIN_EMAIL = "Admin@Example.com ";
    process.env.ADMIN_PASSWORD = "ValidPassword1!";

    assert.deepEqual(resolveExplicitAdminCredentials("seed"), {
      adminEmail: "admin@example.com",
      adminPassword: "ValidPassword1!"
    });
  });
});

function restoreEnv() {
  if (originalAdminEmail === undefined) {
    delete process.env.ADMIN_EMAIL;
  } else {
    process.env.ADMIN_EMAIL = originalAdminEmail;
  }

  if (originalAdminPassword === undefined) {
    delete process.env.ADMIN_PASSWORD;
  } else {
    process.env.ADMIN_PASSWORD = originalAdminPassword;
  }
}
