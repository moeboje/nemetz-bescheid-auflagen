import assert from "node:assert/strict";
import { once } from "node:events";
import { after, before, beforeEach, describe, it } from "node:test";
import type { AddressInfo } from "node:net";
import { createApp } from "./app.js";
import { resolveDatabaseUrl, type AppConfig } from "./config.js";
import { prisma } from "./prisma.js";
import { hashPassword } from "./security.js";

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
  externalOrgId?: string;
  isArchived?: boolean;
}) {
  return prisma.user.create({
    data: {
      firstName: "Obligation",
      lastName: "Tester",
      email: args.email,
      role: args.role ?? "USER",
      type: args.type ?? "INTERNAL",
      externalOrgId: args.externalOrgId,
      isArchived: args.isArchived ?? false,
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

async function seedLegalDoc(projectId = "project-obligations", legalDocId = "legal-doc-obligations") {
  const company = await prisma.company.create({
    data: {
      name: `Company ${projectId}`
    }
  });
  const project = await prisma.project.create({
    data: {
      id: projectId,
      title: `Project ${projectId}`,
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
      id: legalDocId,
      projectId: project.id,
      type: "NOTICE",
      title: `Legal doc ${legalDocId}`,
      attachments: []
    }
  });

  return { company, project, legalDoc };
}

function baseObligationPayload(legalDocId: string) {
  return {
    legalDocId,
    title: "Wiederkehrende Messung",
    level: "MANDATORY",
    scheduleType: "RECURRING",
    firstDueDate: "2026-01-15",
    intervalUnit: "MONTH",
    intervalValue: 6,
    emailReminderEnabled: false,
    evidenceRequirements: {}
  };
}

describe("Obligations API", () => {
  before(async () => {
    const config: AppConfig = {
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
    await prisma.auditLog.deleteMany();
    await prisma.taskStateEntry.deleteMany();
    await prisma.obligation.deleteMany();
    await prisma.legalDocument.deleteMany();
    await prisma.project.deleteMany();
    await prisma.company.deleteMany();
    await prisma.user.deleteMany();
    await prisma.externalOrganization.deleteMany();
    await prisma.role.deleteMany();
  });

  it("creates and updates recurring obligations with an optional recurrenceEndDate", async () => {
    const admin = await createUser({
      email: "obligation-recurring@example.com",
      password: "ValidPassword1!",
      role: "ADMIN"
    });
    const { legalDoc } = await seedLegalDoc();
    const cookie = await login(admin.email, "ValidPassword1!");

    const createResponse = await request("/obligations", {
      method: "POST",
      cookie,
      body: {
        ...baseObligationPayload(legalDoc.id),
        recurrenceEndDate: "2026-12-31"
      }
    });

    assert.equal(createResponse.status, 201);
    const createPayload = (await createResponse.json()) as {
      obligation: { id: string; recurrenceEndDate?: string };
    };
    assert.equal(createPayload.obligation.recurrenceEndDate, "2026-12-31");

    const updateResponse = await request(`/obligations/${createPayload.obligation.id}`, {
      method: "PATCH",
      cookie,
      body: {
        recurrenceEndDate: "2027-06-30"
      }
    });

    assert.equal(updateResponse.status, 200);
    const updatePayload = (await updateResponse.json()) as {
      obligation: { recurrenceEndDate?: string };
    };
    assert.equal(updatePayload.obligation.recurrenceEndDate, "2027-06-30");

    const invalidResponse = await request("/obligations", {
      method: "POST",
      cookie,
      body: {
        ...baseObligationPayload(legalDoc.id),
        recurrenceEndDate: "2025-12-31"
      }
    });

    assert.equal(invalidResponse.status, 400);
  });

  it("rejects project context mismatches between projectId and legalDocId", async () => {
    const admin = await createUser({
      email: "obligation-project-mismatch@example.com",
      password: "ValidPassword1!",
      role: "ADMIN"
    });
    const first = await seedLegalDoc("project-a", "legal-doc-a");
    const second = await seedLegalDoc("project-b", "legal-doc-b");
    const cookie = await login(admin.email, "ValidPassword1!");

    const response = await request("/obligations", {
      method: "POST",
      cookie,
      body: {
        ...baseObligationPayload(second.legalDoc.id),
        projectId: first.project.id
      }
    });

    assert.equal(response.status, 400);
    const payload = (await response.json()) as { message: string };
    assert.match(payload.message, /projectId/i);
  });

  it("validates external execution organization and user references", async () => {
    const admin = await createUser({
      email: "obligation-external-admin@example.com",
      password: "ValidPassword1!",
      role: "ADMIN"
    });
    const { legalDoc } = await seedLegalDoc();
    const cookie = await login(admin.email, "ValidPassword1!");
    const activeOrg = await prisma.externalOrganization.create({
      data: {
        name: "Aktive Messfirma",
        type: "ENGINEERING_OFFICE"
      }
    });
    const otherOrg = await prisma.externalOrganization.create({
      data: {
        name: "Andere Messfirma",
        type: "ENGINEERING_OFFICE"
      }
    });
    const archivedOrg = await prisma.externalOrganization.create({
      data: {
        name: "Archivierte Messfirma",
        type: "ENGINEERING_OFFICE",
        isArchived: true
      }
    });
    const externalUser = await createUser({
      email: "external-obligation@example.com",
      password: "ValidPassword1!",
      role: "EXTERNAL",
      type: "EXTERNAL",
      externalOrgId: activeOrg.id
    });
    const archivedExternalUser = await createUser({
      email: "archived-external-obligation@example.com",
      password: "ValidPassword1!",
      role: "EXTERNAL",
      type: "EXTERNAL",
      externalOrgId: activeOrg.id,
      isArchived: true
    });
    const internalUser = await createUser({
      email: "internal-not-external@example.com",
      password: "ValidPassword1!"
    });

    const validOrgResponse = await request("/obligations", {
      method: "POST",
      cookie,
      body: {
        ...baseObligationPayload(legalDoc.id),
        title: "Mit externer Firma",
        externalOrgId: activeOrg.id
      }
    });
    assert.equal(validOrgResponse.status, 201);

    const validUserResponse = await request("/obligations", {
      method: "POST",
      cookie,
      body: {
        ...baseObligationPayload(legalDoc.id),
        title: "Mit externem User",
        externalUserId: externalUser.id
      }
    });
    assert.equal(validUserResponse.status, 201);
    const validUserPayload = (await validUserResponse.json()) as {
      obligation: { externalOrgId?: string; externalUserId?: string };
    };
    assert.equal(validUserPayload.obligation.externalOrgId, activeOrg.id);
    assert.equal(validUserPayload.obligation.externalUserId, externalUser.id);

    const archivedOrgResponse = await request("/obligations", {
      method: "POST",
      cookie,
      body: {
        ...baseObligationPayload(legalDoc.id),
        externalOrgId: archivedOrg.id
      }
    });
    assert.equal(archivedOrgResponse.status, 400);

    const internalUserResponse = await request("/obligations", {
      method: "POST",
      cookie,
      body: {
        ...baseObligationPayload(legalDoc.id),
        externalUserId: internalUser.id
      }
    });
    assert.equal(internalUserResponse.status, 400);

    const archivedUserResponse = await request("/obligations", {
      method: "POST",
      cookie,
      body: {
        ...baseObligationPayload(legalDoc.id),
        externalUserId: archivedExternalUser.id
      }
    });
    assert.equal(archivedUserResponse.status, 400);

    const mismatchResponse = await request("/obligations", {
      method: "POST",
      cookie,
      body: {
        ...baseObligationPayload(legalDoc.id),
        externalOrgId: otherOrg.id,
        externalUserId: externalUser.id
      }
    });
    assert.equal(mismatchResponse.status, 400);
  });

  it("keeps external users fail-closed for broad domain routes", async () => {
    const org = await prisma.externalOrganization.create({
      data: {
        name: "Fail Closed Partner",
        type: "CONSULTANT"
      }
    });
    const externalUser = await createUser({
      email: "external-fail-closed@example.com",
      password: "ValidPassword1!",
      role: "EXTERNAL",
      type: "EXTERNAL",
      externalOrgId: org.id
    });
    await seedLegalDoc();
    const cookie = await login(externalUser.email, "ValidPassword1!");

    const obligationsResponse = await request("/obligations", {
      cookie
    });
    assert.equal(obligationsResponse.status, 403);

    const projectsResponse = await request("/projects", {
      cookie
    });
    assert.equal(projectsResponse.status, 403);
  });
});
