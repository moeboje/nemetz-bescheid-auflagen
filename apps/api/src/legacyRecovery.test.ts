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

async function createRole(key: string, permissionKeys: string[]) {
  return prisma.role.create({
    data: {
      key,
      labelDe: key,
      isSystem: false,
      permissionsJson: permissionKeys
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

async function seedLegacyLegalDoc(prefix: string) {
  const company = await prisma.company.create({
    data: {
      name: `Legacy Recovery Company ${prefix}`
    }
  });
  const project = await prisma.project.create({
    data: {
      id: `legacy-project-${prefix}`,
      title: `Legacy Recovery Project ${prefix}`,
      companyId: company.id,
      participantUserIds: [],
      internalParticipants: [],
      externalParticipants: [],
      attachments: [],
      dependsOnProjectIds: [],
      referenceLegalDocIds: []
    }
  });
  const legalDoc = await prisma.legalDocument.create({
    data: {
      id: `legacy-legal-doc-${prefix}`,
      projectId: project.id,
      type: "NOTICE",
      title: `Legacy Recovery Legal Doc ${prefix}`,
      attachments: []
    }
  });

  return { company, project, legalDoc };
}

function buildLegacyObligationPayload(legalDocId: string, id: string, title = `Legacy Obligation ${id}`) {
  return {
    id,
    legalDocId,
    title,
    level: "MANDATORY",
    scheduleType: "ONCE",
    emailReminderEnabled: false,
    evidenceRequirements: {}
  };
}

async function seedLegacyObligation(id: string, title = `Legacy Obligation ${id}`) {
  const { legalDoc } = await seedLegacyLegalDoc(id);
  return prisma.obligation.create({
    data: buildLegacyObligationPayload(legalDoc.id, id, title)
  });
}

async function seedLegacyObligationWithExactId(
  prefix: string,
  id: string,
  title = `Legacy Obligation ${id}`
) {
  const { legalDoc } = await seedLegacyLegalDoc(prefix);
  return prisma.obligation.create({
    data: buildLegacyObligationPayload(legalDoc.id, id, title)
  });
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

async function restartServer(overrides: Partial<AppConfig> = {}) {
  server.close();
  await once(server, "close");

  const app = createApp(makeConfig(overrides));
  server = app.listen(0);
  await once(server, "listening");

  const address = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${address.port}/api`;
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
    await prisma.commentRevision.deleteMany();
    await prisma.comment.deleteMany();
    await prisma.document.deleteMany();
    await prisma.$executeRawUnsafe('DELETE FROM "ProjectChecklistItem"');
    await prisma.$executeRawUnsafe('DELETE FROM "ProjectChecklistSection"');
    await prisma.$executeRawUnsafe('DELETE FROM "ProjectChecklist"');
    await prisma.taskStateEntry.deleteMany();
    await prisma.deadline.deleteMany();
    await prisma.obligation.deleteMany();
    await prisma.legalDocument.deleteMany();
    await prisma.project.deleteMany();
    await prisma.submissionType.deleteMany();
    await prisma.legalMatter.deleteMany();
    await prisma.procedureType.deleteMany();
    await prisma.authorityContact.deleteMany();
    await prisma.authority.deleteMany();
    await prisma.facility.deleteMany();
    await prisma.site.deleteMany();
    await prisma.company.deleteMany();
    await prisma.portalSnapshot.deleteMany();
    await prisma.user.deleteMany();
    await prisma.role.deleteMany();
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

  it("blocks all obligation legacy recovery path variants by default", async () => {
    const admin = await createUser({
      email: "legacy-guard-obligations@example.com",
      password: "ValidPassword1!",
      role: "ADMIN"
    });
    const cookie = await login(admin.email, "ValidPassword1!");

    const cases = [
      { method: "DELETE", path: "/admin/internal/obligations/bulk-delete" },
      { method: "DELETE", path: "/admin/internal/obligations/bulk-delete/" },
      { method: "DELETE", path: "/admin//internal//obligations//bulk-delete//" },
      { method: "DELETE", path: "/ADMIN/INTERNAL/OBLIGATIONS/BULK-DELETE" },
      { method: "PUT", path: "/admin/internal/obligations/bulk-replace", body: [] },
      { method: "POST", path: "/admin/internal/obligations/backfill-from-snapshot", body: {} },
      { method: "POST", path: "/admin/internal/obligations/rollback-to-snapshot", body: {} }
    ] as const;

    for (const entry of cases) {
      const response = await request(entry.path, {
        method: entry.method,
        cookie,
        body: "body" in entry ? entry.body : undefined
      });

      assert.equal(response.status, 403, `Expected ${entry.method} ${entry.path} to be blocked`);
      const payload = (await response.json()) as { ok: boolean; message: string };
      assert.equal(payload.ok, false);
      assert.match(payload.message, /disabled by default/i);
    }
  });

  it("blocks procedure master data bulk-replace path variants by default", async () => {
    const admin = await createUser({
      email: "legacy-guard-procedure-master-data@example.com",
      password: "ValidPassword1!",
      role: "ADMIN"
    });
    const cookie = await login(admin.email, "ValidPassword1!");
    const body = {
      legalMatters: [],
      procedureTypes: [],
      submissionTypes: []
    };

    const cases = [
      "/admin/internal/procedure-master-data/bulk-replace",
      "/admin/internal/procedure-master-data/bulk-replace/",
      "/admin//internal//procedure-master-data//bulk-replace//",
      "/ADMIN/INTERNAL/PROCEDURE-MASTER-DATA/BULK-REPLACE"
    ];

    for (const path of cases) {
      const response = await request(path, {
        method: "PUT",
        cookie,
        body
      });

      assert.equal(response.status, 403, `Expected PUT ${path} to be blocked`);
      const payload = (await response.json()) as { ok: boolean; message: string };
      assert.equal(payload.ok, false);
      assert.match(payload.message, /disabled by default/i);
    }
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
    await restartServer({
      legacyRecoveryEndpointsEnabled: true
    });

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

  it("allows enabled procedure master data bulk-replace only with master data permission", async () => {
    await restartServer({
      legacyRecoveryEndpointsEnabled: true
    });

    await createRole("LEGACY_GUARD_ADMIN_ONLY", ["admin.access"]);
    const admin = await createUser({
      email: "legacy-guard-procedure-master-enabled@example.com",
      password: "ValidPassword1!",
      role: "ADMIN"
    });
    const limitedAdmin = await createUser({
      email: "legacy-guard-procedure-master-limited@example.com",
      password: "ValidPassword1!",
      role: "LEGACY_GUARD_ADMIN_ONLY"
    });
    const adminCookie = await login(admin.email, "ValidPassword1!");
    const limitedCookie = await login(limitedAdmin.email, "ValidPassword1!");
    const body = {
      legalMatters: [],
      procedureTypes: [],
      submissionTypes: []
    };

    const allowedResponse = await request("/admin/internal/procedure-master-data/bulk-replace", {
      method: "PUT",
      cookie: adminCookie,
      body
    });
    assert.equal(allowedResponse.status, 200);

    const forbiddenResponse = await request("/admin/internal/procedure-master-data/bulk-replace", {
      method: "PUT",
      cookie: limitedCookie,
      body
    });
    assert.equal(forbiddenResponse.status, 403);
  });

  it("allows enabled obligation bulk-delete only when no blocking dependencies exist", async () => {
    await restartServer({
      legacyRecoveryEndpointsEnabled: true
    });

    const admin = await createUser({
      email: "legacy-obligation-bulk-delete-allowed@example.com",
      password: "ValidPassword1!",
      role: "ADMIN"
    });
    const cookie = await login(admin.email, "ValidPassword1!");
    await seedLegacyObligation("bulk-delete-allowed-a");
    await seedLegacyObligation("bulk-delete-allowed-b");

    const response = await request("/admin/internal/obligations/bulk-delete", {
      method: "DELETE",
      cookie
    });

    assert.equal(response.status, 200);
    assert.equal(await prisma.obligation.count(), 0);
  });

  it("blocks enabled obligation bulk-delete with blockers and prevents partial deletes", async () => {
    await restartServer({
      legacyRecoveryEndpointsEnabled: true
    });

    const admin = await createUser({
      email: "legacy-obligation-bulk-delete-blocked@example.com",
      password: "ValidPassword1!",
      role: "ADMIN"
    });
    const cookie = await login(admin.email, "ValidPassword1!");
    const safe = await seedLegacyObligation("bulk-delete-safe");
    const taskStateBlocked = await seedLegacyObligation("bulk-delete-task-state");
    const documentBlocked = await seedLegacyObligation("bulk-delete-document");
    const taskEvidenceBlocked = await seedLegacyObligation("bulk-delete-task-evidence");
    const commentBlocked = await seedLegacyObligation("bulk-delete-comment");

    await prisma.taskStateEntry.create({
      data: {
        taskInstanceId: `obligation:${taskStateBlocked.id}:2026-01-15`,
        status: "OPEN",
        evidence: []
      }
    });
    await prisma.document.create({
      data: {
        ownerType: "OBLIGATION",
        ownerId: documentBlocked.id,
        filename: "bulk-delete.pdf",
        mimeType: "application/pdf",
        sizeBytes: 10,
        storagePath: "test/bulk-delete.pdf",
        createdByUserId: admin.id
      }
    });
    await prisma.document.create({
      data: {
        ownerType: "TASK_EVIDENCE",
        ownerId: `obligation:${taskEvidenceBlocked.id}:2026-04-01`,
        filename: "bulk-delete-task-evidence.pdf",
        mimeType: "application/pdf",
        sizeBytes: 10,
        storagePath: "test/bulk-delete-task-evidence.pdf",
        createdByUserId: admin.id
      }
    });
    await prisma.comment.create({
      data: {
        entityType: "OBLIGATION",
        entityId: commentBlocked.id,
        authorUserId: admin.id,
        body: "Bulk delete must stay blocked."
      }
    });

    const response = await request("/admin/internal/obligations/bulk-delete", {
      method: "DELETE",
      cookie
    });

    assert.equal(response.status, 409);
    const payload = (await response.json()) as {
      errorCode?: string;
      blockingDependencies?: Array<{ obligationId: string; kind: string; count: number }>;
    };
    assert.equal(payload.errorCode, "OBLIGATION_DELETE_BLOCKED");
    const blockers = payload.blockingDependencies ?? [];
    assert.ok(blockers.some((entry) => entry.obligationId === taskStateBlocked.id && entry.kind === "TASK_STATE"));
    assert.ok(blockers.some((entry) => entry.obligationId === documentBlocked.id && entry.kind === "DOCUMENT"));
    assert.ok(blockers.some((entry) => entry.obligationId === taskEvidenceBlocked.id && entry.kind === "DOCUMENT"));
    assert.ok(blockers.some((entry) => entry.obligationId === commentBlocked.id && entry.kind === "COMMENT"));
    assert.equal(await prisma.obligation.count(), 5);
    assert.ok(await prisma.obligation.findUnique({ where: { id: safe.id } }));
    assert.ok(await prisma.obligation.findUnique({ where: { id: taskStateBlocked.id } }));
    assert.ok(await prisma.obligation.findUnique({ where: { id: documentBlocked.id } }));
    assert.ok(await prisma.obligation.findUnique({ where: { id: taskEvidenceBlocked.id } }));
    assert.ok(await prisma.obligation.findUnique({ where: { id: commentBlocked.id } }));
  });

  it("preserves exact whitespace-padded ids when checking enabled obligation bulk-delete blockers", async () => {
    await restartServer({
      legacyRecoveryEndpointsEnabled: true
    });

    const admin = await createUser({
      email: "legacy-obligation-bulk-delete-whitespace@example.com",
      password: "ValidPassword1!",
      role: "ADMIN"
    });
    const cookie = await login(admin.email, "ValidPassword1!");
    const obligationId = " bulk-delete-whitespace ";
    const blocked = await seedLegacyObligationWithExactId("bulk-delete-whitespace", obligationId);
    const safe = await seedLegacyObligation("bulk-delete-whitespace-safe");

    await prisma.document.create({
      data: {
        ownerType: "OBLIGATION",
        ownerId: obligationId,
        filename: "bulk-delete-whitespace.pdf",
        mimeType: "application/pdf",
        sizeBytes: 10,
        storagePath: "test/bulk-delete-whitespace.pdf",
        createdByUserId: admin.id
      }
    });

    const response = await request("/admin/internal/obligations/bulk-delete", {
      method: "DELETE",
      cookie
    });

    assert.equal(response.status, 409);
    const payload = (await response.json()) as {
      blockingDependencies?: Array<{ obligationId: string; kind: string; count: number }>;
    };
    const blockers = payload.blockingDependencies ?? [];
    assert.ok(blockers.some((entry) => entry.obligationId === obligationId && entry.kind === "DOCUMENT"));
    assert.ok(await prisma.obligation.findUnique({ where: { id: blocked.id } }));
    assert.ok(await prisma.obligation.findUnique({ where: { id: safe.id } }));
  });

  it("blocks enabled obligation bulk-replace while existing blocked obligations exist", async () => {
    await restartServer({
      legacyRecoveryEndpointsEnabled: true
    });

    const admin = await createUser({
      email: "legacy-obligation-bulk-replace-blocked@example.com",
      password: "ValidPassword1!",
      role: "ADMIN"
    });
    const cookie = await login(admin.email, "ValidPassword1!");
    const existing = await seedLegacyObligation("bulk-replace-existing");
    const { legalDoc: replacementLegalDoc } = await seedLegacyLegalDoc("bulk-replace-replacement");
    await prisma.taskStateEntry.create({
      data: {
        taskInstanceId: `obligation:${existing.id}:2026-01-15`,
        status: "OPEN",
        evidence: []
      }
    });

    const response = await request("/admin/internal/obligations/bulk-replace", {
      method: "PUT",
      cookie,
      body: [buildLegacyObligationPayload(replacementLegalDoc.id, "bulk-replace-new")]
    });

    assert.equal(response.status, 409);
    assert.ok(await prisma.obligation.findUnique({ where: { id: existing.id } }));
    assert.equal(await prisma.obligation.findUnique({ where: { id: "bulk-replace-new" } }), null);
  });

  it("preserves exact whitespace-padded ids when checking enabled obligation bulk-replace blockers", async () => {
    await restartServer({
      legacyRecoveryEndpointsEnabled: true
    });

    const admin = await createUser({
      email: "legacy-obligation-bulk-replace-whitespace@example.com",
      password: "ValidPassword1!",
      role: "ADMIN"
    });
    const cookie = await login(admin.email, "ValidPassword1!");
    const obligationId = " bulk-replace-whitespace ";
    const existing = await seedLegacyObligationWithExactId("bulk-replace-whitespace", obligationId);
    const { legalDoc: replacementLegalDoc } = await seedLegacyLegalDoc("bulk-replace-whitespace-replacement");

    await prisma.document.create({
      data: {
        ownerType: "OBLIGATION",
        ownerId: obligationId,
        filename: "bulk-replace-whitespace.pdf",
        mimeType: "application/pdf",
        sizeBytes: 10,
        storagePath: "test/bulk-replace-whitespace.pdf",
        createdByUserId: admin.id
      }
    });

    const response = await request("/admin/internal/obligations/bulk-replace", {
      method: "PUT",
      cookie,
      body: [buildLegacyObligationPayload(replacementLegalDoc.id, "bulk-replace-whitespace-new")]
    });

    assert.equal(response.status, 409);
    assert.ok(await prisma.obligation.findUnique({ where: { id: existing.id } }));
    assert.equal(await prisma.obligation.findUnique({ where: { id: "bulk-replace-whitespace-new" } }), null);
  });

  it("blocks enabled obligation backfill-from-snapshot while existing blocked obligations exist", async () => {
    await restartServer({
      legacyRecoveryEndpointsEnabled: true
    });

    const admin = await createUser({
      email: "legacy-obligation-backfill-blocked@example.com",
      password: "ValidPassword1!",
      role: "ADMIN"
    });
    const cookie = await login(admin.email, "ValidPassword1!");
    const existing = await seedLegacyObligation("backfill-existing");
    const { legalDoc: snapshotLegalDoc } = await seedLegacyLegalDoc("backfill-snapshot");
    await prisma.document.create({
      data: {
        ownerType: "OBLIGATION",
        ownerId: existing.id,
        filename: "backfill.pdf",
        mimeType: "application/pdf",
        sizeBytes: 10,
        storagePath: "test/backfill.pdf",
        createdByUserId: admin.id
      }
    });
    await prisma.portalSnapshot.create({
      data: {
        scopeKey: "default",
        payload: {
          obligations: [buildLegacyObligationPayload(snapshotLegalDoc.id, "backfill-new")]
        }
      }
    });

    const response = await request("/admin/internal/obligations/backfill-from-snapshot", {
      method: "POST",
      cookie,
      body: {}
    });

    assert.equal(response.status, 409);
    assert.ok(await prisma.obligation.findUnique({ where: { id: existing.id } }));
    assert.equal(await prisma.obligation.findUnique({ where: { id: "backfill-new" } }), null);
  });

  it("preserves exact whitespace-padded ids when checking enabled obligation backfill blockers", async () => {
    await restartServer({
      legacyRecoveryEndpointsEnabled: true
    });

    const admin = await createUser({
      email: "legacy-obligation-backfill-whitespace@example.com",
      password: "ValidPassword1!",
      role: "ADMIN"
    });
    const cookie = await login(admin.email, "ValidPassword1!");
    const obligationId = " backfill-whitespace ";
    const existing = await seedLegacyObligationWithExactId("backfill-whitespace", obligationId);
    const { legalDoc: snapshotLegalDoc } = await seedLegacyLegalDoc("backfill-whitespace-snapshot");

    await prisma.document.create({
      data: {
        ownerType: "OBLIGATION",
        ownerId: obligationId,
        filename: "backfill-whitespace.pdf",
        mimeType: "application/pdf",
        sizeBytes: 10,
        storagePath: "test/backfill-whitespace.pdf",
        createdByUserId: admin.id
      }
    });
    await prisma.portalSnapshot.create({
      data: {
        scopeKey: "default",
        payload: {
          obligations: [buildLegacyObligationPayload(snapshotLegalDoc.id, "backfill-whitespace-new")]
        }
      }
    });

    const response = await request("/admin/internal/obligations/backfill-from-snapshot", {
      method: "POST",
      cookie,
      body: {}
    });

    assert.equal(response.status, 409);
    assert.ok(await prisma.obligation.findUnique({ where: { id: existing.id } }));
    assert.equal(await prisma.obligation.findUnique({ where: { id: "backfill-whitespace-new" } }), null);
  });

  it("blocks enabled obligation rollback-to-snapshot while existing blocked obligations exist", async () => {
    await restartServer({
      legacyRecoveryEndpointsEnabled: true
    });

    const admin = await createUser({
      email: "legacy-obligation-rollback-blocked@example.com",
      password: "ValidPassword1!",
      role: "ADMIN"
    });
    const cookie = await login(admin.email, "ValidPassword1!");
    const existing = await seedLegacyObligation("rollback-existing");
    await prisma.comment.create({
      data: {
        entityType: "OBLIGATION",
        entityId: existing.id,
        authorUserId: admin.id,
        body: "Rollback must stay blocked."
      }
    });
    const previousPayload = {
      obligations: [{ id: "previous-snapshot-obligation" }]
    };
    await prisma.portalSnapshot.create({
      data: {
        scopeKey: "default",
        payload: previousPayload
      }
    });

    const response = await request("/admin/internal/obligations/rollback-to-snapshot", {
      method: "POST",
      cookie,
      body: {}
    });

    assert.equal(response.status, 409);
    const snapshot = await prisma.portalSnapshot.findUniqueOrThrow({
      where: {
        scopeKey: "default"
      }
    });
    assert.deepEqual(snapshot.payload, previousPayload);
  });

  it("preserves exact whitespace-padded ids when checking enabled obligation rollback blockers", async () => {
    await restartServer({
      legacyRecoveryEndpointsEnabled: true
    });

    const admin = await createUser({
      email: "legacy-obligation-rollback-whitespace@example.com",
      password: "ValidPassword1!",
      role: "ADMIN"
    });
    const cookie = await login(admin.email, "ValidPassword1!");
    const obligationId = " rollback-whitespace ";
    const existing = await seedLegacyObligationWithExactId("rollback-whitespace", obligationId);

    await prisma.document.create({
      data: {
        ownerType: "OBLIGATION",
        ownerId: obligationId,
        filename: "rollback-whitespace.pdf",
        mimeType: "application/pdf",
        sizeBytes: 10,
        storagePath: "test/rollback-whitespace.pdf",
        createdByUserId: admin.id
      }
    });
    const previousPayload = {
      obligations: [{ id: "previous-rollback-whitespace" }]
    };
    await prisma.portalSnapshot.create({
      data: {
        scopeKey: "default",
        payload: previousPayload
      }
    });

    const response = await request("/admin/internal/obligations/rollback-to-snapshot", {
      method: "POST",
      cookie,
      body: {}
    });

    assert.equal(response.status, 409);
    assert.ok(await prisma.obligation.findUnique({ where: { id: existing.id } }));
    const snapshot = await prisma.portalSnapshot.findUniqueOrThrow({
      where: {
        scopeKey: "default"
      }
    });
    assert.deepEqual(snapshot.payload, previousPayload);
  });
});
