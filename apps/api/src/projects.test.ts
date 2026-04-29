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
      firstName: "Project",
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

async function createCompany(name: string) {
  return prisma.company.create({
    data: {
      name
    }
  });
}

describe("Projects submission type", () => {
  before(async () => {
    const config: AppConfig = {
      port: 0,
      databaseUrl: resolveDatabaseUrl(process.env, "test"),
      appOrigin: "http://localhost:5173",
      notificationBaseUrl: "http://localhost:5173",
      legacyRecoveryEndpointsEnabled: true,
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
    await prisma.deadline.deleteMany();
    await prisma.obligation.deleteMany();
    await prisma.legalDocument.deleteMany();
    await prisma.taskStateEntry.deleteMany();
    await prisma.project.deleteMany();
    await prisma.authorityContact.deleteMany();
    await prisma.authority.deleteMany();
    await prisma.facility.deleteMany();
    await prisma.site.deleteMany();
    await prisma.company.deleteMany();
    await prisma.user.deleteMany();
    await prisma.externalOrganization.deleteMany();
  });

  it("keeps submissionType unset when not provided", async () => {
    const user = await createUser({
      email: "project-unset@example.com",
      password: "ValidPassword1!"
    });
    const company = await createCompany("Unset Company");
    const cookie = await login(user.email, "ValidPassword1!");

    const response = await request("/projects", {
      method: "POST",
      cookie,
      body: {
        title: "Projekt ohne Einreichtyp",
        companyId: company.id
      }
    });

    assert.equal(response.status, 201);
    const payload = (await response.json()) as {
      project: {
        submissionType?: string;
      };
    };

    assert.equal(payload.project.submissionType, undefined);
  });

  it("persists a selected submissionType and allows changing it", async () => {
    const user = await createUser({
      email: "project-submission-type@example.com",
      password: "ValidPassword1!"
    });
    const company = await createCompany("Submission Type Company");
    const cookie = await login(user.email, "ValidPassword1!");

    const createResponse = await request("/projects", {
      method: "POST",
      cookie,
      body: {
        title: "Projekt mit Einreichtyp",
        companyId: company.id,
        submissionType: "AWG"
      }
    });
    assert.equal(createResponse.status, 201);
    const createdPayload = (await createResponse.json()) as {
      project: { id: string; submissionType?: string };
    };
    assert.equal(createdPayload.project.submissionType, "AWG");

    const storedCreated = await prisma.project.findUniqueOrThrow({
      where: {
        id: createdPayload.project.id
      },
      select: {
        submissionType: true
      }
    });
    assert.equal(storedCreated.submissionType, "AWG");

    const updateResponse = await request(`/projects/${createdPayload.project.id}`, {
      method: "PATCH",
      cookie,
      body: {
        submissionType: "UVP_UVE"
      }
    });

    assert.equal(updateResponse.status, 200);
    const updatedPayload = (await updateResponse.json()) as {
      project: {
        submissionType?: string;
      };
    };

    assert.equal(updatedPayload.project.submissionType, "UVP_UVE");

    const storedUpdated = await prisma.project.findUniqueOrThrow({
      where: {
        id: createdPayload.project.id
      },
      select: {
        submissionType: true
      }
    });
    assert.equal(storedUpdated.submissionType, "UVP_UVE");
  });

  it("accepts active internal users for project owner and internal participants", async () => {
    const admin = await createUser({
      email: "project-internal-owner-admin@example.com",
      password: "ValidPassword1!",
      role: "ADMIN"
    });
    const owner = await createUser({
      email: "project-internal-owner@example.com",
      password: "ValidPassword1!"
    });
    const participant = await createUser({
      email: "project-internal-participant@example.com",
      password: "ValidPassword1!"
    });
    const company = await createCompany("Internal Project Roles Company");
    const cookie = await login(admin.email, "ValidPassword1!");

    const response = await request("/projects", {
      method: "POST",
      cookie,
      body: {
        title: "Projekt mit internen Rollen",
        companyId: company.id,
        ownerUserId: owner.id,
        internalParticipants: [{ userId: participant.id }],
        participantUserIds: [participant.id]
      }
    });

    assert.equal(response.status, 201);
    const payload = (await response.json()) as {
      project: {
        ownerUserId?: string;
        participantUserIds: string[];
      };
    };
    assert.equal(payload.project.ownerUserId, owner.id);
    assert.deepEqual(payload.project.participantUserIds, [participant.id]);
  });

  it("rejects an external user as project owner", async () => {
    const admin = await createUser({
      email: "project-external-owner-admin@example.com",
      password: "ValidPassword1!",
      role: "ADMIN"
    });
    const externalOrg = await prisma.externalOrganization.create({
      data: {
        name: "External Owner Org",
        type: "SERVICE_PROVIDER"
      }
    });
    const externalUser = await createUser({
      email: "project-external-owner@example.com",
      password: "ValidPassword1!",
      role: "EXTERNAL",
      type: "EXTERNAL",
      externalOrgId: externalOrg.id
    });
    const company = await createCompany("External Owner Company");
    const cookie = await login(admin.email, "ValidPassword1!");

    const response = await request("/projects", {
      method: "POST",
      cookie,
      body: {
        title: "Projekt mit externem Owner",
        companyId: company.id,
        ownerUserId: externalUser.id
      }
    });

    assert.equal(response.status, 400);
    const payload = (await response.json()) as { message: string };
    assert.equal(payload.message, "Owner user must be an active internal user.");
  });

  it("rejects an external user as project deputy", async () => {
    const admin = await createUser({
      email: "project-external-deputy-admin@example.com",
      password: "ValidPassword1!",
      role: "ADMIN"
    });
    const externalOrg = await prisma.externalOrganization.create({
      data: {
        name: "External Deputy Org",
        type: "SERVICE_PROVIDER"
      }
    });
    const externalUser = await createUser({
      email: "project-external-deputy@example.com",
      password: "ValidPassword1!",
      role: "EXTERNAL",
      type: "EXTERNAL",
      externalOrgId: externalOrg.id
    });
    const company = await createCompany("External Deputy Company");
    const cookie = await login(admin.email, "ValidPassword1!");

    const response = await request("/projects", {
      method: "POST",
      cookie,
      body: {
        title: "Projekt mit externer Stellvertretung",
        companyId: company.id,
        deputyUserId: externalUser.id
      }
    });

    assert.equal(response.status, 400);
    const payload = (await response.json()) as { message: string };
    assert.equal(payload.message, "Deputy user must be an active internal user.");
  });

  it("rejects archived users as project owner", async () => {
    const admin = await createUser({
      email: "project-archived-owner-admin@example.com",
      password: "ValidPassword1!",
      role: "ADMIN"
    });
    const archivedOwner = await createUser({
      email: "project-archived-owner@example.com",
      password: "ValidPassword1!",
      isArchived: true
    });
    const company = await createCompany("Archived Owner Company");
    const cookie = await login(admin.email, "ValidPassword1!");

    const response = await request("/projects", {
      method: "POST",
      cookie,
      body: {
        title: "Projekt mit archiviertem Owner",
        companyId: company.id,
        ownerUserId: archivedOwner.id
      }
    });

    assert.equal(response.status, 400);
    const payload = (await response.json()) as { message: string };
    assert.equal(payload.message, "Owner user must be an active internal user.");
  });

  it("rejects external users in internal project participants", async () => {
    const admin = await createUser({
      email: "project-external-participant-admin@example.com",
      password: "ValidPassword1!",
      role: "ADMIN"
    });
    const externalOrg = await prisma.externalOrganization.create({
      data: {
        name: "External Internal Participant Org",
        type: "SERVICE_PROVIDER"
      }
    });
    const externalUser = await createUser({
      email: "project-external-internal-participant@example.com",
      password: "ValidPassword1!",
      role: "EXTERNAL",
      type: "EXTERNAL",
      externalOrgId: externalOrg.id
    });
    const company = await createCompany("External Internal Participant Company");
    const cookie = await login(admin.email, "ValidPassword1!");

    const response = await request("/projects", {
      method: "POST",
      cookie,
      body: {
        title: "Projekt mit externem internem Teilnehmer",
        companyId: company.id,
        internalParticipants: [{ userId: externalUser.id }],
        participantUserIds: [externalUser.id]
      }
    });

    assert.equal(response.status, 400);
    const payload = (await response.json()) as { message: string };
    assert.equal(payload.message, "Internal project participants must be active internal users.");
  });

  it("accepts external users through externalParticipants", async () => {
    const admin = await createUser({
      email: "project-external-participants-admin@example.com",
      password: "ValidPassword1!",
      role: "ADMIN"
    });
    const externalOrg = await prisma.externalOrganization.create({
      data: {
        name: "External Participants Org",
        type: "SERVICE_PROVIDER"
      }
    });
    const externalUser = await createUser({
      email: "project-external-participant@example.com",
      password: "ValidPassword1!",
      role: "EXTERNAL",
      type: "EXTERNAL",
      externalOrgId: externalOrg.id
    });
    const company = await createCompany("External Participants Company");
    const cookie = await login(admin.email, "ValidPassword1!");

    const response = await request("/projects", {
      method: "POST",
      cookie,
      body: {
        title: "Projekt mit externen Teilnehmern",
        companyId: company.id,
        externalParticipants: [
          {
            id: "ep-test-1",
            type: "SERVICE_PROVIDER",
            externalUserId: externalUser.id,
            name: "Externer Teilnehmer",
            isArchived: false
          }
        ]
      }
    });

    assert.equal(response.status, 201);
    const payload = (await response.json()) as {
      project: {
        externalParticipants: Array<{
          externalOrgId?: string;
          externalUserId?: string;
        }>;
      };
    };
    assert.equal(payload.project.externalParticipants[0]?.externalUserId, externalUser.id);
    assert.equal(payload.project.externalParticipants[0]?.externalOrgId, externalOrg.id);
  });

  it("rejects invalid submissionType values", async () => {
    const user = await createUser({
      email: "project-invalid-submission-type@example.com",
      password: "ValidPassword1!"
    });
    const company = await createCompany("Invalid Submission Type Company");
    const cookie = await login(user.email, "ValidPassword1!");

    const response = await request("/projects", {
      method: "POST",
      cookie,
      body: {
        title: "Projekt mit ungueltigem Einreichtyp",
        companyId: company.id,
        submissionType: "INVALID"
      }
    });

    assert.equal(response.status, 400);
    const payload = (await response.json()) as { message: string };
    assert.equal(
      payload.message,
      "Invalid project submission type. Allowed values: GEWERBE, AWG, UVP_UVE."
    );
  });

  it("blocks legal document bulk replace while downstream obligations exist", async () => {
    const user = await createUser({
      email: "legal-doc-bulk-downstream@example.com",
      password: "ValidPassword1!",
      role: "ADMIN"
    });
    const company = await createCompany("LegalDoc Downstream Company");
    const project = await prisma.project.create({
      data: {
        id: "project-legal-doc-downstream",
        title: "Projekt mit Rechtsdokument",
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
        id: "legal-doc-with-obligation",
        projectId: project.id,
        type: "NOTICE",
        title: "Bescheid mit Auflage",
        attachments: []
      }
    });
    await prisma.obligation.create({
      data: {
        id: "obligation-downstream",
        legalDocId: legalDoc.id,
        title: "Bestehende Auflage",
        level: "MANDATORY",
        scheduleType: "ONCE",
        emailReminderEnabled: false,
        evidenceRequirements: {}
      }
    });
    const cookie = await login(user.email, "ValidPassword1!");

    const response = await request("/admin/internal/legal-docs/bulk-replace", {
      method: "PUT",
      cookie,
      body: []
    });

    assert.equal(response.status, 409);
    assert.equal(await prisma.legalDocument.count(), 1);
    assert.equal(await prisma.obligation.count(), 1);
  });

  it("blocks legal document bulk delete while linked deadlines exist", async () => {
    const user = await createUser({
      email: "legal-doc-bulk-delete-deadline@example.com",
      password: "ValidPassword1!",
      role: "ADMIN"
    });
    const company = await createCompany("LegalDoc Deadline Company");
    const project = await prisma.project.create({
      data: {
        id: "project-legal-doc-deadline",
        title: "Projekt mit verlinkter Frist",
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
        id: "legal-doc-with-deadline",
        projectId: project.id,
        type: "NOTICE",
        title: "Bescheid mit Frist",
        attachments: []
      }
    });
    await prisma.deadline.create({
      data: {
        id: "deadline-linked-to-legal-doc",
        title: "Verlinkte Frist",
        dueDate: "2026-05-01",
        status: "OPEN",
        projectId: project.id,
        legalDocId: legalDoc.id,
        emailReminderEnabled: false,
        evidence: []
      }
    });
    const cookie = await login(user.email, "ValidPassword1!");

    const response = await request("/admin/internal/legal-docs/bulk-delete", {
      method: "DELETE",
      cookie
    });

    assert.equal(response.status, 409);
    assert.equal(await prisma.legalDocument.count(), 1);
    assert.equal(await prisma.deadline.count({ where: { legalDocId: legalDoc.id } }), 1);
  });
});
