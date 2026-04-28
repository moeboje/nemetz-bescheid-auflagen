import assert from "node:assert/strict";
import { once } from "node:events";
import { after, before, beforeEach, describe, it } from "node:test";
import type { AddressInfo } from "node:net";
import { createApp } from "./app.js";
import { resolveDatabaseUrl, type AppConfig } from "./config.js";
import { prisma } from "./prisma.js";
import { getStoredRolePermissionKeys } from "./rolePermissions.js";
import { hashPassword, verifyPassword } from "./security.js";

let baseUrl = "";
let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
let requestCounter = 0;

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
  mustChangePassword?: boolean;
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
      mustChangePassword: args.mustChangePassword ?? false,
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
      notificationBaseUrl: "http://localhost:5173",
      notificationDispatchEnabled: false,
      notificationDryRun: true,
      notificationFromLabel: "Nemetz Portal",
      powerAutomateNotificationWebhookUrl: "",
      powerAutomateNotificationSecret: "",
      notificationMaxAttempts: 5,
      notificationDispatchBatchSize: 25,
      notificationDispatchTimeoutMs: 15_000,
      notificationClaimLeaseSeconds: 300,
      notificationTimeZone: "Europe/Vienna",
      sessionSecret: "test-secret",
      nodeEnv: "test",
      resetTokenTtlMinutes: 120,
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
    await prisma.notificationOutbox.deleteMany();
    await prisma.passwordResetToken.deleteMany();
    await prisma.mfaPending.deleteMany();
    await prisma.mfaChallenge.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.user.deleteMany();
    await prisma.externalOrganization.deleteMany();
    await prisma.role.deleteMany();
    await seedDefaultRoles();
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
      role: "USER",
      mustChangePassword: true,
      failedLoginCount: 2
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
      items: Array<{
        email: string;
        isArchived: boolean;
        mustChangePassword: boolean;
        failedLoginCount: number;
      }>;
      total: number;
      page: number;
      pageSize: number;
    };

    assert.equal(activePayload.page, 1);
    assert.equal(activePayload.pageSize, 50);
    assert.equal(activePayload.items.some((row) => row.email === "archived-user@example.com"), false);
    const activeUser = activePayload.items.find((row) => row.email === "active-user@example.com");
    assert.equal(activeUser?.mustChangePassword, true);
    assert.equal(activeUser?.failedLoginCount, 2);

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

  it("admin reset-password updates password, clears lock state and writes audit event", async () => {
    const admin = await createUser({
      email: "admin-reset@example.com",
      password: "ValidPassword1!",
      role: "ADMIN"
    });

    const target = await createUser({
      email: "target-reset@example.com",
      password: "ValidPassword1!",
      role: "USER",
      failedLoginCount: 3,
      lockedUntil: new Date(Date.now() + 60_000)
    });
    const resetToken = await prisma.passwordResetToken.create({
      data: {
        userId: target.id,
        tokenHash: `pre-reset-${target.id}`,
        expiresAt: new Date(Date.now() + 15 * 60_000)
      }
    });

    const cookie = await login(admin.email, "ValidPassword1!");

    const response = await request(`/admin/users/${target.id}/reset-password`, {
      method: "POST",
      cookie,
      body: {
        passwordMode: "direct",
        newPassword: "EvenBetterPassword2!",
        mustChangePassword: true
      }
    });

    assert.equal(response.status, 200);
    const payload = (await response.json()) as { ok: boolean; user: { id: string; mustChangePassword: boolean } };
    assert.equal(payload.ok, true);
    assert.equal(payload.user.id, target.id);
    assert.equal(payload.user.mustChangePassword, true);

    const updatedTarget = await prisma.user.findUniqueOrThrow({
      where: {
        id: target.id
      }
    });
    assert.equal(await verifyPassword(updatedTarget.passwordHash, "EvenBetterPassword2!"), true);
    assert.equal(await verifyPassword(updatedTarget.passwordHash, "ValidPassword1!"), false);
    assert.equal(updatedTarget.mustChangePassword, true);
    assert.equal(updatedTarget.failedLoginCount, 0);
    assert.equal(updatedTarget.lockedUntil, null);
    assert.ok(updatedTarget.passwordUpdatedAt);
    const invalidatedResetToken = await prisma.passwordResetToken.findUniqueOrThrow({
      where: {
        id: resetToken.id
      }
    });
    assert.ok(invalidatedResetToken.usedAt, "Expected outstanding reset token to be invalidated");

    const oldPasswordLogin = await request("/auth/login", {
      method: "POST",
      body: {
        email: target.email,
        password: "ValidPassword1!"
      }
    });
    assert.equal(oldPasswordLogin.status, 401);

    const newPasswordLogin = await request("/auth/login", {
      method: "POST",
      body: {
        email: target.email,
        password: "EvenBetterPassword2!"
      }
    });
    assert.equal(newPasswordLogin.status, 200);
    const newPasswordPayload = (await newPasswordLogin.json()) as { ok: boolean; user: { mustChangePassword: boolean } };
    assert.equal(newPasswordPayload.user.mustChangePassword, true);

    const auditEntry = await prisma.auditLog.findFirst({
      where: {
        action: "USER_PASSWORD_RESET_BY_ADMIN",
        actorUserId: admin.id,
        targetUserId: target.id
      }
    });

    assert.ok(auditEntry, "Expected audit entry for admin reset-password");
  });

  it("admin reset-password requires newPassword only for direct mode", async () => {
    const admin = await createUser({
      email: "admin-reset-direct-required@example.com",
      password: "ValidPassword1!",
      role: "ADMIN"
    });

    const target = await createUser({
      email: "target-reset-direct-required@example.com",
      password: "ValidPassword1!",
      role: "USER"
    });

    const cookie = await login(admin.email, "ValidPassword1!");

    const directResponse = await request(`/admin/users/${target.id}/reset-password`, {
      method: "POST",
      cookie,
      body: {
        passwordMode: "direct"
      }
    });

    assert.equal(directResponse.status, 400);
    const directPayload = (await directResponse.json()) as { ok: boolean; message: string };
    assert.match(directPayload.message, /newPassword is required/i);

    const legacyResponse = await request(`/admin/users/${target.id}/reset-password`, {
      method: "POST",
      cookie,
      body: {}
    });

    assert.equal(legacyResponse.status, 200);
  });

  it("admin reset-password link mode works without newPassword, invalidates old tokens and records a sent notification", async () => {
    const admin = await createUser({
      email: "admin-reset-link@example.com",
      password: "ValidPassword1!",
      role: "ADMIN"
    });

    const target = await createUser({
      email: "target-reset-link@example.com",
      password: "ValidPassword1!",
      role: "USER"
    });

    const existingToken = await prisma.passwordResetToken.create({
      data: {
        userId: target.id,
        tokenHash: `pre-link-${target.id}`,
        expiresAt: new Date(Date.now() + 15 * 60_000)
      }
    });

    const cookie = await login(admin.email, "ValidPassword1!");

    const response = await request(`/admin/users/${target.id}/reset-password`, {
      method: "POST",
      cookie,
      body: {
        passwordMode: "link"
      }
    });

    assert.equal(response.status, 200);
    const payload = (await response.json()) as { ok: boolean; resetLink?: string };
    assert.equal(payload.ok, true);
    assert.ok(payload.resetLink, "Expected debug reset link in test mode");

    const existingTokenAfter = await prisma.passwordResetToken.findUniqueOrThrow({
      where: {
        id: existingToken.id
      }
    });
    assert.ok(existingTokenAfter.usedAt, "Expected existing reset token to be invalidated");

    const tokens = await prisma.passwordResetToken.findMany({
      where: {
        userId: target.id
      }
    });
    assert.equal(tokens.length, 2);

    const notification = await prisma.notificationOutbox.findFirst({
      where: {
        eventType: "PASSWORD_RESET_LINK",
        recipientUserId: target.id
      }
    });
    assert.ok(notification, "Expected password reset notification outbox row");
    assert.equal(notification?.status, "SENT");

    const auditEntry = await prisma.auditLog.findFirst({
      where: {
        action: "USER_PASSWORD_RESET_REQUESTED_BY_ADMIN",
        actorUserId: admin.id,
        targetUserId: target.id
      }
    });
    assert.ok(auditEntry, "Expected audit entry for admin link reset");
  });

  it("admin reset-password auto mode generates a temporary password without newPassword", async () => {
    const admin = await createUser({
      email: "admin-reset-auto@example.com",
      password: "ValidPassword1!",
      role: "ADMIN"
    });

    const target = await createUser({
      email: "target-reset-auto@example.com",
      password: "ValidPassword1!",
      role: "USER"
    });

    const existingToken = await prisma.passwordResetToken.create({
      data: {
        userId: target.id,
        tokenHash: `pre-auto-${target.id}`,
        expiresAt: new Date(Date.now() + 15 * 60_000)
      }
    });

    const cookie = await login(admin.email, "ValidPassword1!");

    const response = await request(`/admin/users/${target.id}/reset-password`, {
      method: "POST",
      cookie,
      body: {
        passwordMode: "auto"
      }
    });

    assert.equal(response.status, 200);
    const payload = (await response.json()) as { ok: boolean; temporaryPassword?: string };
    assert.equal(payload.ok, true);
    assert.ok(payload.temporaryPassword, "Expected generated temporary password");

    const updatedTarget = await prisma.user.findUniqueOrThrow({
      where: {
        id: target.id
      }
    });
    assert.equal(await verifyPassword(updatedTarget.passwordHash, payload.temporaryPassword!), true);
    assert.equal(updatedTarget.mustChangePassword, true);

    const invalidatedResetToken = await prisma.passwordResetToken.findUniqueOrThrow({
      where: {
        id: existingToken.id
      }
    });
    assert.ok(invalidatedResetToken.usedAt, "Expected existing reset token to be invalidated after password change");
  });

  it("admin reset-password rejects self-service password changes", async () => {
    const admin = await createUser({
      email: "admin-reset-self@example.com",
      password: "ValidPassword1!",
      role: "ADMIN"
    });

    const cookie = await login(admin.email, "ValidPassword1!");
    const response = await request(`/admin/users/${admin.id}/reset-password`, {
      method: "POST",
      cookie,
      body: {
        passwordMode: "direct",
        newPassword: "EvenBetterPassword2!"
      }
    });

    assert.equal(response.status, 400);
    const payload = (await response.json()) as { ok: boolean; message: string };
    assert.match(payload.message, /personal security settings/i);

    const unchangedAdmin = await prisma.user.findUniqueOrThrow({
      where: {
        id: admin.id
      }
    });
    assert.equal(await verifyPassword(unchangedAdmin.passwordHash, "ValidPassword1!"), true);
    assert.equal(await verifyPassword(unchangedAdmin.passwordHash, "EvenBetterPassword2!"), false);
  });

  it("admin reset-password rejects known placeholder passwords", async () => {
    const admin = await createUser({
      email: "admin-reset-placeholder@example.com",
      password: "ValidPassword1!",
      role: "ADMIN"
    });

    const target = await createUser({
      email: "target-reset-placeholder@example.com",
      password: "ValidPassword1!",
      role: "USER"
    });

    const cookie = await login(admin.email, "ValidPassword1!");
    const response = await request(`/admin/users/${target.id}/reset-password`, {
      method: "POST",
      cookie,
      body: {
        passwordMode: "direct",
        newPassword: "ChangeMe123!"
      }
    });

    assert.equal(response.status, 400);
    const payload = (await response.json()) as { ok: boolean; message: string };
    assert.match(payload.message, /placeholder/i);

    const unchangedTarget = await prisma.user.findUniqueOrThrow({
      where: {
        id: target.id
      }
    });
    assert.equal(await verifyPassword(unchangedTarget.passwordHash, "ValidPassword1!"), true);
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
      cookie,
      body: {
        passwordMode: "direct",
        newPassword: "EvenBetterPassword2!"
      }
    });

    assert.equal(response.status, 404);

    const auditEntry = await prisma.auditLog.findFirst({
      where: {
        action: "USER_PASSWORD_RESET_BY_ADMIN",
        actorUserId: admin.id,
        targetUserId: archivedTarget.id
      }
    });

    assert.equal(auditEntry, null);
  });

  it("non-admin gets 403 on admin reset-password endpoint", async () => {
    const user = await createUser({
      email: "user-reset-403@example.com",
      password: "ValidPassword1!",
      role: "USER"
    });

    const target = await createUser({
      email: "target-reset-403@example.com",
      password: "ValidPassword1!",
      role: "USER"
    });

    const cookie = await login(user.email, "ValidPassword1!");
    const response = await request(`/admin/users/${target.id}/reset-password`, {
      method: "POST",
      cookie,
      body: {
        passwordMode: "direct",
        newPassword: "EvenBetterPassword2!"
      }
    });

    assert.equal(response.status, 403);
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

  it("persists authorities.view for custom roles that include authorities.manage", async () => {
    const admin = await createUser({
      email: "admin-authority-role@example.com",
      password: "ValidPassword1!",
      role: "ADMIN"
    });
    const cookie = await login(admin.email, "ValidPassword1!");

    const createResponse = await request("/admin/roles", {
      method: "POST",
      cookie,
      body: {
        key: "authority-admin-role",
        labelDe: "Behoerden Admin",
        permissionKeys: ["admin.access", "authorities.manage"]
      }
    });

    assert.equal(createResponse.status, 201);
    const storedPermissionKeys = await getStoredRolePermissionKeys(prisma, "AUTHORITY_ADMIN_ROLE");
    assert.deepEqual(storedPermissionKeys, ["admin.access", "authorities.view", "authorities.manage"]);
  });

  it("allows custom roles to persist authorities.view without authorities.manage through create and update", async () => {
    const admin = await createUser({
      email: "admin-authority-view-role@example.com",
      password: "ValidPassword1!",
      role: "ADMIN"
    });
    const cookie = await login(admin.email, "ValidPassword1!");

    const createResponse = await request("/admin/roles", {
      method: "POST",
      cookie,
      body: {
        key: "authority-read-role",
        labelDe: "Behoerden Lesen",
        permissionKeys: ["admin.access", "authorities.view"]
      }
    });

    assert.equal(createResponse.status, 201);
    const createdPayload = (await createResponse.json()) as { role: { id: string } };
    let storedPermissionKeys = await getStoredRolePermissionKeys(prisma, "AUTHORITY_READ_ROLE");
    assert.deepEqual(storedPermissionKeys, ["admin.access", "authorities.view"]);

    const updateResponse = await request(`/admin/roles/${createdPayload.role.id}`, {
      method: "PATCH",
      cookie,
      body: {
        permissionKeys: ["admin.access", "authorities.view"]
      }
    });

    assert.equal(updateResponse.status, 200);
    storedPermissionKeys = await getStoredRolePermissionKeys(prisma, "AUTHORITY_READ_ROLE");
    assert.deepEqual(storedPermissionKeys, ["admin.access", "authorities.view"]);
  });

  it("persists externalOrgs.view for custom roles that include externalOrgs.manage", async () => {
    const admin = await createUser({
      email: "admin-external-org-role@example.com",
      password: "ValidPassword1!",
      role: "ADMIN"
    });
    const cookie = await login(admin.email, "ValidPassword1!");

    const createResponse = await request("/admin/roles", {
      method: "POST",
      cookie,
      body: {
        key: "external-org-admin-role",
        labelDe: "Externe Firmen Admin",
        permissionKeys: ["admin.access", "externalOrgs.manage"]
      }
    });

    assert.equal(createResponse.status, 201);
    const storedPermissionKeys = await getStoredRolePermissionKeys(prisma, "EXTERNAL_ORG_ADMIN_ROLE");
    assert.deepEqual(storedPermissionKeys, ["admin.access", "externalOrgs.view", "externalOrgs.manage"]);
  });

  it("allows custom roles to persist externalOrgs.view without externalOrgs.manage through create and update", async () => {
    const admin = await createUser({
      email: "admin-external-org-view-role@example.com",
      password: "ValidPassword1!",
      role: "ADMIN"
    });
    const cookie = await login(admin.email, "ValidPassword1!");

    const createResponse = await request("/admin/roles", {
      method: "POST",
      cookie,
      body: {
        key: "external-org-read-role",
        labelDe: "Externe Firmen Lesen",
        permissionKeys: ["admin.access", "externalOrgs.view"]
      }
    });

    assert.equal(createResponse.status, 201);
    const createdPayload = (await createResponse.json()) as { role: { id: string } };
    let storedPermissionKeys = await getStoredRolePermissionKeys(prisma, "EXTERNAL_ORG_READ_ROLE");
    assert.deepEqual(storedPermissionKeys, ["admin.access", "externalOrgs.view"]);

    const updateResponse = await request(`/admin/roles/${createdPayload.role.id}`, {
      method: "PATCH",
      cookie,
      body: {
        permissionKeys: ["admin.access", "externalOrgs.view"]
      }
    });

    assert.equal(updateResponse.status, 200);
    storedPermissionKeys = await getStoredRolePermissionKeys(prisma, "EXTERNAL_ORG_READ_ROLE");
    assert.deepEqual(storedPermissionKeys, ["admin.access", "externalOrgs.view"]);
  });

  it("rejects admin sub-section permissions without admin.access on custom roles", async () => {
    const admin = await createUser({
      email: "admin-role-validation@example.com",
      password: "ValidPassword1!",
      role: "ADMIN"
    });
    const cookie = await login(admin.email, "ValidPassword1!");

    const createResponse = await request("/admin/roles", {
      method: "POST",
      cookie,
      body: {
        key: "invalid-role",
        labelDe: "Ungueltige Rolle",
        permissionKeys: ["users.view"]
      }
    });

    assert.equal(createResponse.status, 400);
    const payload = (await createResponse.json()) as { message?: string };
    assert.equal(payload.message, "admin.access is required for admin sub-section permissions.");
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

  it("view-only external org admin can read but cannot manage external organizations", async () => {
    const readOnlyRole = await prisma.role.create({
      data: {
        key: "EXTERNAL_ORG_AUDITOR",
        labelDe: "Externe Firmen Lesen",
        descriptionDe: "Kann externe Firmen ansehen.",
        permissionsJson: ["admin.access", "externalOrgs.view"]
      }
    });
    assert.ok(readOnlyRole);

    const viewer = await createUser({
      email: "external-org-viewer@example.com",
      password: "ValidPassword1!",
      role: "EXTERNAL_ORG_AUDITOR"
    });
    const admin = await createUser({
      email: "external-org-seed-admin@example.com",
      password: "ValidPassword1!",
      role: "ADMIN"
    });
    const adminCookie = await login(admin.email, "ValidPassword1!");

    const createResponse = await request("/admin/external-orgs", {
      method: "POST",
      cookie: adminCookie,
      body: {
        name: "Read Only Org",
        type: "Dienstleister"
      }
    });
    assert.equal(createResponse.status, 201);

    const cookie = await login(viewer.email, "ValidPassword1!");

    const listResponse = await request("/admin/external-orgs", { cookie });
    assert.equal(listResponse.status, 200);

    const lookupResponse = await request("/admin/external-orgs/lookup", { cookie });
    assert.equal(lookupResponse.status, 200);

    const createDeniedResponse = await request("/admin/external-orgs", {
      method: "POST",
      cookie,
      body: {
        name: "Should Fail",
        type: "Kanzlei"
      }
    });
    assert.equal(createDeniedResponse.status, 403);
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
