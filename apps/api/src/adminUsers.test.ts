import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { once } from "node:events";
import path from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import { createApp } from "./app.js";
import { resolveDatabaseUrl, type AppConfig } from "./config.js";
import { prisma } from "./prisma.js";
import { hashPassword } from "./security.js";

const currentFile = fileURLToPath(import.meta.url);
const currentDir = path.dirname(currentFile);
const outboxDir = path.resolve(currentDir, "..", "storage", "mail-outbox");

let baseUrl = "";
let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
let requestCounter = 0;

async function cleanOutbox() {
  await fs.mkdir(outboxDir, { recursive: true });
  const files = await fs.readdir(outboxDir);
  await Promise.all(files.map((file) => fs.rm(path.resolve(outboxDir, file), { force: true })));
}

async function request(pathname: string, options: { method?: string; body?: unknown; cookie?: string } = {}) {
  const headers: Record<string, string> = {};
  requestCounter += 1;
  headers["X-Forwarded-For"] = `127.0.0.${(requestCounter % 200) + 1}`;

  if (options.cookie) {
    headers.Cookie = options.cookie;
  }

  if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  return fetch(`${baseUrl}${pathname}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined
  });
}

function extractSessionCookie(setCookieHeader: string | null) {
  if (!setCookieHeader) {
    return "";
  }

  const match = setCookieHeader.match(/nemetz_session=[^;]+/);
  return match ? match[0] : "";
}

async function createUser(args: {
  email: string;
  password: string;
  role?: string;
  type?: "INTERNAL" | "EXTERNAL";
  isArchived?: boolean;
  failedLoginCount?: number;
  lockedUntil?: Date | null;
}) {
  return prisma.user.create({
    data: {
      firstName: "Test",
      lastName: "User",
      email: args.email,
      role: args.role ?? "USER",
      type: args.type ?? "INTERNAL",
      isArchived: args.isArchived ?? false,
      failedLoginCount: args.failedLoginCount ?? 0,
      lockedUntil: args.lockedUntil ?? null,
      passwordHash: await hashPassword(args.password)
    }
  });
}

async function seedDefaultRoles() {
  await Promise.all([
    prisma.role.upsert({
      where: { key: "ADMIN" },
      update: { labelDe: "Admin", isSystem: true, isArchived: false },
      create: { key: "ADMIN", labelDe: "Admin", isSystem: true }
    }),
    prisma.role.upsert({
      where: { key: "COMPLIANCE" },
      update: { labelDe: "Compliance", isSystem: true, isArchived: false },
      create: { key: "COMPLIANCE", labelDe: "Compliance", isSystem: true }
    }),
    prisma.role.upsert({
      where: { key: "USER" },
      update: { labelDe: "Benutzer", isSystem: true, isArchived: false },
      create: { key: "USER", labelDe: "Benutzer", isSystem: true }
    }),
    prisma.role.upsert({
      where: { key: "EXTERNAL" },
      update: { labelDe: "Extern", isSystem: true, isArchived: false },
      create: { key: "EXTERNAL", labelDe: "Extern", isSystem: true }
    })
  ]);
}

async function login(email: string, password: string) {
  const response = await request("/auth/login", {
    method: "POST",
    body: {
      email,
      password
    }
  });

  assert.equal(response.status, 200);
  const cookie = extractSessionCookie(response.headers.get("set-cookie"));
  assert.ok(cookie, "Expected session cookie");
  return cookie;
}

describe("Admin Users API", () => {
  before(async () => {
    const config: AppConfig = {
      port: 0,
      databaseUrl: resolveDatabaseUrl(process.env, "test"),
      appOrigin: "http://localhost:5173",
      sessionSecret: "test-secret",
      nodeEnv: "test",
      resetTokenTtlMinutes: 30,
      sessionTtlDays: 7,
      cookieSecure: false,
      basePath: "/api",
      authEnableEntra: false,
      entraTenantId: "",
      entraClientId: "",
      entraClientSecret: "",
      entraRedirectUri: "http://localhost:4000/api/auth/entra/callback",
      entraAllowedDomains: ["nemetz-ag.at"],
      entraAutoProvision: false,
      entraScopes: ["openid", "profile", "email"],
      documentsStorageDir: "storage",
      documentsMaxUploadBytes: 20 * 1024 * 1024
    };

    const app = createApp(config);
    server = app.listen(0);
    await once(server, "listening");

    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}/api`;
  });

  after(async () => {
    server.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.session.deleteMany();
    await prisma.passwordResetToken.deleteMany();
    await prisma.mfaPending.deleteMany();
    await prisma.mfaChallenge.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.user.deleteMany();
    await prisma.externalOrganization.deleteMany();
    await prisma.role.deleteMany();
    await seedDefaultRoles();
    await cleanOutbox();
  });

  it("admin can list users with filters and archived=all", async () => {
    const admin = await createUser({
      email: "admin-list@example.com",
      password: "ValidPassword1!",
      role: "ADMIN"
    });

    await createUser({
      email: "active-user@example.com",
      password: "ValidPassword1!",
      role: "USER"
    });

    await createUser({
      email: "archived-user@example.com",
      password: "ValidPassword1!",
      role: "USER",
      isArchived: true
    });

    const cookie = await login(admin.email, "ValidPassword1!");

    const activeResponse = await request("/admin/users?archived=false&page=1&pageSize=50", {
      cookie
    });
    assert.equal(activeResponse.status, 200);

    const activePayload = (await activeResponse.json()) as {
      items: Array<{ email: string; isArchived: boolean }>;
      total: number;
      page: number;
      pageSize: number;
    };

    assert.equal(activePayload.page, 1);
    assert.equal(activePayload.pageSize, 50);
    assert.equal(activePayload.items.some((row) => row.email === "archived-user@example.com"), false);

    const allResponse = await request("/admin/users?archived=all&q=archived-user&page=1&pageSize=10", {
      cookie
    });
    assert.equal(allResponse.status, 200);

    const allPayload = (await allResponse.json()) as {
      items: Array<{ email: string; isArchived: boolean }>;
      total: number;
    };

    assert.equal(allPayload.total, 1);
    assert.equal(allPayload.items[0]?.email, "archived-user@example.com");
    assert.equal(allPayload.items[0]?.isArchived, true);
  });

  it("non-admin gets 403 on admin users endpoints", async () => {
    await createUser({
      email: "admin-403@example.com",
      password: "ValidPassword1!",
      role: "ADMIN"
    });

    const standardUser = await createUser({
      email: "user-403@example.com",
      password: "ValidPassword1!",
      role: "USER"
    });

    const cookie = await login(standardUser.email, "ValidPassword1!");

    const response = await request("/admin/users", {
      cookie
    });

    assert.equal(response.status, 403);
  });

  it("admin can create user and user appears in list", async () => {
    const admin = await createUser({
      email: "admin-create@example.com",
      password: "ValidPassword1!",
      role: "ADMIN"
    });

    const cookie = await login(admin.email, "ValidPassword1!");

    const createResponse = await request("/admin/users", {
      method: "POST",
      cookie,
      body: {
        firstName: "Neue",
        lastName: "Person",
        email: "new-person@example.com",
        phone: "+43 800 123 456",
        role: "USER",
        type: "INTERNAL",
        titleOrPosition: "Umweltbeauftragte"
      }
    });

    assert.equal(createResponse.status, 201);

    const listResponse = await request("/admin/users?archived=all&q=new-person@example.com", {
      cookie
    });

    assert.equal(listResponse.status, 200);
    const listPayload = (await listResponse.json()) as {
      items: Array<{ email: string }>;
      total: number;
    };

    assert.equal(listPayload.total, 1);
    assert.equal(listPayload.items[0]?.email, "new-person@example.com");
  });

  it("archive and restore user works", async () => {
    const admin = await createUser({
      email: "admin-archive@example.com",
      password: "ValidPassword1!",
      role: "ADMIN"
    });

    const target = await createUser({
      email: "target-archive@example.com",
      password: "ValidPassword1!",
      role: "USER"
    });

    const cookie = await login(admin.email, "ValidPassword1!");

    const archiveResponse = await request(`/admin/users/${target.id}/archive`, {
      method: "POST",
      cookie
    });

    assert.equal(archiveResponse.status, 200);
    const archivePayload = (await archiveResponse.json()) as { user: { isArchived: boolean } };
    assert.equal(archivePayload.user.isArchived, true);

    const restoreResponse = await request(`/admin/users/${target.id}/restore`, {
      method: "POST",
      cookie
    });

    assert.equal(restoreResponse.status, 200);
    const restorePayload = (await restoreResponse.json()) as { user: { isArchived: boolean } };
    assert.equal(restorePayload.user.isArchived, false);
  });

  it("admin reset-password writes outbox and audit event", async () => {
    const admin = await createUser({
      email: "admin-reset@example.com",
      password: "ValidPassword1!",
      role: "ADMIN"
    });

    const target = await createUser({
      email: "target-reset@example.com",
      password: "ValidPassword1!",
      role: "USER"
    });

    const cookie = await login(admin.email, "ValidPassword1!");

    const response = await request(`/admin/users/${target.id}/reset-password`, {
      method: "POST",
      cookie
    });

    assert.equal(response.status, 200);
    const payload = (await response.json()) as { ok: boolean; resetLink?: string };
    assert.equal(payload.ok, true);
    assert.equal(payload.resetLink, undefined);

    const outboxFiles = await fs.readdir(outboxDir);
    assert.ok(outboxFiles.length > 0, "Expected mail outbox file to be created");

    const auditEntry = await prisma.auditLog.findFirst({
      where: {
        action: "USER_PASSWORD_RESET_REQUESTED_BY_ADMIN",
        actorUserId: admin.id,
        targetUserId: target.id
      }
    });

    assert.ok(auditEntry, "Expected audit entry for admin reset-password");
  });

  it("admin reset-password is blocked for archived users", async () => {
    const admin = await createUser({
      email: "admin-reset-archived@example.com",
      password: "ValidPassword1!",
      role: "ADMIN"
    });

    const archivedTarget = await createUser({
      email: "target-archived-reset@example.com",
      password: "ValidPassword1!",
      role: "USER",
      isArchived: true
    });

    const cookie = await login(admin.email, "ValidPassword1!");
    const response = await request(`/admin/users/${archivedTarget.id}/reset-password`, {
      method: "POST",
      cookie
    });

    assert.equal(response.status, 404);

    const auditEntry = await prisma.auditLog.findFirst({
      where: {
        action: "USER_PASSWORD_RESET_REQUESTED_BY_ADMIN",
        actorUserId: admin.id,
        targetUserId: archivedTarget.id
      }
    });

    assert.equal(auditEntry, null);
  });

  it("admin can create, update, archive and restore custom roles", async () => {
    const admin = await createUser({
      email: "admin-roles@example.com",
      password: "ValidPassword1!",
      role: "ADMIN"
    });
    const cookie = await login(admin.email, "ValidPassword1!");

    const createResponse = await request("/admin/roles", {
      method: "POST",
      cookie,
      body: {
        key: "quality-manager",
        labelDe: "Qualitaetsmanagement",
        descriptionDe: "Interne Qualitaetsrolle"
      }
    });
    assert.equal(createResponse.status, 201);
    const createdPayload = (await createResponse.json()) as {
      role: {
        id: string;
        key: string;
      };
    };
    assert.equal(createdPayload.role.key, "QUALITY_MANAGER");

    const updateResponse = await request(`/admin/roles/${createdPayload.role.id}`, {
      method: "PATCH",
      cookie,
      body: {
        labelDe: "Qualitaetsmanager"
      }
    });
    assert.equal(updateResponse.status, 200);

    const archiveResponse = await request(`/admin/roles/${createdPayload.role.id}/archive`, {
      method: "POST",
      cookie
    });
    assert.equal(archiveResponse.status, 200);

    const restoreResponse = await request(`/admin/roles/${createdPayload.role.id}/restore`, {
      method: "POST",
      cookie
    });
    assert.equal(restoreResponse.status, 200);

    const auditEntry = await prisma.auditLog.findFirst({
      where: {
        action: "ROLE_ARCHIVED"
      }
    });
    assert.ok(auditEntry);
  });

  it("system roles cannot be archived", async () => {
    const admin = await createUser({
      email: "admin-system-role@example.com",
      password: "ValidPassword1!",
      role: "ADMIN"
    });
    const cookie = await login(admin.email, "ValidPassword1!");

    const systemRole = await prisma.role.findUnique({
      where: {
        key: "ADMIN"
      }
    });
    assert.ok(systemRole);

    const response = await request(`/admin/roles/${systemRole.id}/archive`, {
      method: "POST",
      cookie
    });

    assert.equal(response.status, 400);
  });

  it("admin can manage external organizations", async () => {
    const admin = await createUser({
      email: "admin-external-orgs@example.com",
      password: "ValidPassword1!",
      role: "ADMIN"
    });
    const cookie = await login(admin.email, "ValidPassword1!");

    const createResponse = await request("/admin/external-orgs", {
      method: "POST",
      cookie,
      body: {
        name: "Beispiel Kanzlei",
        type: "Kanzlei",
        email: "kontakt@beispiel-kanzlei.test"
      }
    });
    assert.equal(createResponse.status, 201);
    const createPayload = (await createResponse.json()) as {
      externalOrg: {
        id: string;
        name: string;
      };
    };
    assert.equal(createPayload.externalOrg.name, "Beispiel Kanzlei");

    const patchResponse = await request(`/admin/external-orgs/${createPayload.externalOrg.id}`, {
      method: "PATCH",
      cookie,
      body: {
        phone: "+43 1 123 45 67"
      }
    });
    assert.equal(patchResponse.status, 200);

    const archiveResponse = await request(`/admin/external-orgs/${createPayload.externalOrg.id}/archive`, {
      method: "POST",
      cookie
    });
    assert.equal(archiveResponse.status, 200);

    const restoreResponse = await request(`/admin/external-orgs/${createPayload.externalOrg.id}/restore`, {
      method: "POST",
      cookie
    });
    assert.equal(restoreResponse.status, 200);

    const auditEntry = await prisma.auditLog.findFirst({
      where: {
        action: "EXTERNAL_ORG_RESTORED"
      }
    });
    assert.ok(auditEntry);
  });

  it("user creation validates role definitions and external organization", async () => {
    const admin = await createUser({
      email: "admin-user-validation@example.com",
      password: "ValidPassword1!",
      role: "ADMIN"
    });
    const cookie = await login(admin.email, "ValidPassword1!");

    const invalidRoleResponse = await request("/admin/users", {
      method: "POST",
      cookie,
      body: {
        firstName: "Invalid",
        lastName: "Role",
        email: "invalid-role@example.com",
        role: "NOT_DEFINED",
        type: "INTERNAL"
      }
    });
    assert.equal(invalidRoleResponse.status, 400);

    const missingExternalOrgResponse = await request("/admin/users", {
      method: "POST",
      cookie,
      body: {
        firstName: "External",
        lastName: "MissingOrg",
        email: "external-missing-org@example.com",
        role: "EXTERNAL",
        type: "EXTERNAL"
      }
    });
    assert.equal(missingExternalOrgResponse.status, 400);
  });

  it("prevents last admin self-demotion and self-archive", async () => {
    const admin = await createUser({
      email: "admin-last@example.com",
      password: "ValidPassword1!",
      role: "ADMIN"
    });

    const cookie = await login(admin.email, "ValidPassword1!");

    const demoteResponse = await request(`/admin/users/${admin.id}`, {
      method: "PATCH",
      cookie,
      body: {
        role: "USER",
        type: "INTERNAL"
      }
    });

    assert.equal(demoteResponse.status, 400);

    const archiveResponse = await request(`/admin/users/${admin.id}/archive`, {
      method: "POST",
      cookie
    });

    assert.equal(archiveResponse.status, 400);
  });

  it("unlock resets failedLoginCount and lockedUntil", async () => {
    const admin = await createUser({
      email: "admin-unlock@example.com",
      password: "ValidPassword1!",
      role: "ADMIN"
    });

    const lockedTarget = await createUser({
      email: "locked-user@example.com",
      password: "ValidPassword1!",
      role: "USER",
      failedLoginCount: 5,
      lockedUntil: new Date(Date.now() + 60 * 60 * 1000)
    });

    const cookie = await login(admin.email, "ValidPassword1!");

    const unlockResponse = await request(`/admin/users/${lockedTarget.id}/unlock`, {
      method: "POST",
      cookie
    });

    assert.equal(unlockResponse.status, 200);
    const unlockPayload = (await unlockResponse.json()) as {
      user: {
        failedLoginCount: number;
        lockedUntil?: string;
      };
    };

    assert.equal(unlockPayload.user.failedLoginCount, 0);
    assert.equal(unlockPayload.user.lockedUntil, undefined);

    const updatedTarget = await prisma.user.findUnique({ where: { id: lockedTarget.id } });
    assert.ok(updatedTarget);
    assert.equal(updatedTarget.failedLoginCount, 0);
    assert.equal(updatedTarget.lockedUntil, null);
  });
});
