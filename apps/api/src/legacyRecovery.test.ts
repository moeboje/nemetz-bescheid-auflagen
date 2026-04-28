import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, describe, it } from "node:test";
import { createApp } from "./app.js";
import { type AppConfig, resolveDatabaseUrl } from "./config.js";
import { LEGACY_RECOVERY_ROUTE_DEFINITIONS } from "./legacyRecovery.js";
import { prisma } from "./prisma.js";
import { hashPassword } from "./security.js";

let baseUrl = "";
let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
let requestCounter = 0;

async function request(
  pathname: string,
  options: { method?: string; body?: unknown; cookie?: string } = {}
) {
  const headers: Record<string, string> = {};
  requestCounter += 1;
  headers["X-Forwarded-For"] = `127.0.2.${(requestCounter % 200) + 1}`;

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

async function createUser(args: { email: string; password: string; role?: string }) {
  return prisma.user.create({
    data: {
      firstName: "Legacy",
      lastName: "Recovery",
      email: args.email,
      role: args.role ?? "USER",
      type: "INTERNAL",
      passwordHash: await hashPassword(args.password)
    }
  });
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

function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 0,
    databaseUrl: resolveDatabaseUrl(process.env, "test"),
    appOrigin: "http://localhost:5173",
    notificationBaseUrl: "http://localhost:5173",
    legacyRecoveryEndpointsEnabled: false,
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
    documentsMaxUploadBytes: 20 * 1024 * 1024,
    ...overrides
  };
}

describe("Legacy recovery endpoint guard", () => {
  before(async () => {
    const app = createApp(makeConfig());
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
    await prisma.notificationDeliveryAttempt.deleteMany();
    await prisma.notificationWorkerStatus.deleteMany();
    await prisma.notificationSettings.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.$executeRawUnsafe('DELETE FROM "ProjectChecklistItem"');
    await prisma.$executeRawUnsafe('DELETE FROM "ProjectChecklistSection"');
    await prisma.$executeRawUnsafe('DELETE FROM "ProjectChecklist"');
    await prisma.taskStateEntry.deleteMany();
    await prisma.deadline.deleteMany();
    await prisma.obligation.deleteMany();
    await prisma.legalDocument.deleteMany();
    await prisma.project.deleteMany();
    await prisma.authorityContact.deleteMany();
    await prisma.authority.deleteMany();
    await prisma.facility.deleteMany();
    await prisma.site.deleteMany();
    await prisma.company.deleteMany();
    await prisma.portalSnapshot.deleteMany();
    await prisma.user.deleteMany();
  });

  it("blocks all migrated-domain legacy recovery endpoints by default", async () => {
    const admin = await createUser({
      email: "legacy-guard-admin@example.com",
      password: "ValidPassword1!",
      role: "ADMIN"
    });
    const cookie = await login(admin.email, "ValidPassword1!");

    for (const route of LEGACY_RECOVERY_ROUTE_DEFINITIONS) {
      const response = await request(route.path, {
        method: route.method,
        cookie,
        body: route.method === "DELETE" ? undefined : {}
      });

      assert.equal(
        response.status,
        403,
        `Expected ${route.method} ${route.path} to be blocked without ENABLE_LEGACY_RECOVERY_ENDPOINTS`
      );
      const payload = (await response.json()) as { ok: boolean; message: string };
      assert.equal(payload.ok, false);
      assert.match(payload.message, /disabled by default/i);
    }
  });

  it("also blocks a legacy recovery endpoint when the request path has a trailing slash", async () => {
    const admin = await createUser({
      email: "legacy-guard-trailing-slash@example.com",
      password: "ValidPassword1!",
      role: "ADMIN"
    });
    const cookie = await login(admin.email, "ValidPassword1!");

    const response = await request("/admin/internal/project-checklists/bulk-delete/", {
      method: "DELETE",
      cookie
    });

    assert.equal(response.status, 403);
    const payload = (await response.json()) as { ok: boolean; message: string };
    assert.equal(payload.ok, false);
    assert.match(payload.message, /disabled by default/i);
  });

  it("also blocks a legacy recovery endpoint when the request path uses mixed casing", async () => {
    const admin = await createUser({
      email: "legacy-guard-mixed-case@example.com",
      password: "ValidPassword1!",
      role: "ADMIN"
    });
    const cookie = await login(admin.email, "ValidPassword1!");

    const response = await request("/ADMIN/INTERNAL/PROJECT-CHECKLISTS/BULK-DELETE", {
      method: "DELETE",
      cookie
    });

    assert.equal(response.status, 403);
    const payload = (await response.json()) as { ok: boolean; message: string };
    assert.equal(payload.ok, false);
    assert.match(payload.message, /disabled by default/i);
  });

  it("also blocks a legacy recovery endpoint when the request path uses mixed casing and a trailing slash", async () => {
    const admin = await createUser({
      email: "legacy-guard-mixed-case-trailing@example.com",
      password: "ValidPassword1!",
      role: "ADMIN"
    });
    const cookie = await login(admin.email, "ValidPassword1!");

    const response = await request("/ADMIN/INTERNAL/PROJECT-CHECKLISTS/BULK-DELETE/", {
      method: "DELETE",
      cookie
    });

    assert.equal(response.status, 403);
    const payload = (await response.json()) as { ok: boolean; message: string };
    assert.equal(payload.ok, false);
    assert.match(payload.message, /disabled by default/i);
  });

  it("keeps normal migrated-domain CRUD available while legacy recovery stays blocked", async () => {
    const admin = await createUser({
      email: "legacy-guard-crud@example.com",
      password: "ValidPassword1!",
      role: "ADMIN"
    });
    const company = await prisma.company.create({
      data: {
        name: "Guard Test Company"
      }
    });
    const cookie = await login(admin.email, "ValidPassword1!");

    const response = await request("/projects", {
      method: "POST",
      cookie,
      body: {
        title: "Normal Project CRUD",
        companyId: company.id
      }
    });

    assert.equal(response.status, 201);
    const payload = (await response.json()) as { ok: boolean; project: { title: string } };
    assert.equal(payload.ok, true);
    assert.equal(payload.project.title, "Normal Project CRUD");
  });

  it("allows a legacy recovery endpoint only when ENABLE_LEGACY_RECOVERY_ENDPOINTS is explicitly enabled", async () => {
    server.close();
    await once(server, "close");

    const app = createApp(
      makeConfig({
        legacyRecoveryEndpointsEnabled: true
      })
    );
    server = app.listen(0);
    await once(server, "listening");

    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}/api`;

    const admin = await createUser({
      email: "legacy-guard-enabled@example.com",
      password: "ValidPassword1!",
      role: "ADMIN"
    });
    const cookie = await login(admin.email, "ValidPassword1!");

    const response = await request("/admin/internal/project-checklists/bulk-delete", {
      method: "DELETE",
      cookie
    });

    assert.equal(response.status, 200);
  });
});
