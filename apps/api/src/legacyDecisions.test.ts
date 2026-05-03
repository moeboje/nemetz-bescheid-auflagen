import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
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
const uploadDir = path.resolve(currentDir, "..", "storage", "uploads");

let baseUrl = "";
let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
let requestCounter = 0;

async function cleanUploadDir() {
  await fs.rm(uploadDir, { recursive: true, force: true });
  await fs.mkdir(uploadDir, { recursive: true });
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
  externalOrgId?: string;
}) {
  return prisma.user.create({
    data: {
      firstName: "Legacy",
      lastName: "Tester",
      email: args.email,
      role: args.role ?? "USER",
      type: args.type ?? "INTERNAL",
      externalOrgId: args.externalOrgId,
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

async function seedProject(accessUserId?: string, accessRole: "PROJECT_VIEWER" | "PROJECT_EDITOR" = "PROJECT_EDITOR") {
  const company = await prisma.company.create({
    data: {
      name: `Legacy Decision Company ${randomUUID()}`
    }
  });
  const project = await prisma.project.create({
    data: {
      id: `legacy-project-${randomUUID()}`,
      title: "Legacy Decision Project",
      companyId: company.id,
      participantUserIds: [],
      internalParticipants: [],
      externalParticipants: [],
      attachments: [],
      dependsOnProjectIds: [],
      referenceLegalDocIds: []
    }
  });

  if (accessUserId) {
    await prisma.projectAccess.create({
      data: {
        projectId: project.id,
        userId: accessUserId,
        accessRole
      }
    });
  }

  return project;
}

async function seedLegalDocument(projectId: string) {
  return prisma.legalDocument.create({
    data: {
      id: `legacy-linked-legal-doc-${randomUUID()}`,
      projectId,
      type: "NOTICE",
      title: "Linked legal document",
      attachments: []
    }
  });
}

async function uploadLegacyDecisionDocument(cookie: string, legacyDecisionId: string) {
  requestCounter += 1;
  const form = new FormData();
  form.set("ownerType", "LEGACY_DECISION");
  form.set("ownerId", legacyDecisionId);
  form.set("file", new Blob(["legacy-content"], { type: "application/pdf" }), "legacy.pdf");

  const headers = new Headers();
  headers.set("X-Forwarded-For", `127.0.0.${(requestCounter % 200) + 1}`);
  headers.set("Cookie", cookie);

  return fetch(`${baseUrl}/documents`, {
    method: "POST",
    headers,
    body: form
  });
}

describe("Legacy Decisions API", () => {
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
    await prisma.document.deleteMany();
    await prisma.legacyDecision.deleteMany();
    await prisma.deadline.deleteMany();
    await prisma.obligation.deleteMany();
    await prisma.legalDocument.deleteMany();
    await prisma.project.deleteMany();
    await prisma.authorityContact.deleteMany();
    await prisma.authority.deleteMany();
    await prisma.company.deleteMany();
    await prisma.user.deleteMany();
    await prisma.externalOrganization.deleteMany();
    await prisma.role.deleteMany();
    await cleanUploadDir();
  });

  it("creates and reads a legacy decision only with project access", async () => {
    const user = await createUser({
      email: "legacy-create@example.com",
      password: "ValidPassword1!"
    });
    const blockedUser = await createUser({
      email: "legacy-create-blocked@example.com",
      password: "ValidPassword1!"
    });
    const project = await seedProject(user.id, "PROJECT_EDITOR");
    const cookie = await login(user.email, "ValidPassword1!");
    const blockedCookie = await login(blockedUser.email, "ValidPassword1!");

    const createResponse = await request(`/projects/${project.id}/legacy-decisions`, {
      method: "POST",
      cookie,
      body: {
        title: "Altbescheid 1994",
        fileNumber: "GZ-1994-1",
        issuedAt: "1994-05-01",
        legacyStatus: "NEEDS_REVIEW",
        relevanceNote: "Historisch relevant, noch nicht bewertet"
      }
    });
    assert.equal(createResponse.status, 201);
    const createPayload = (await createResponse.json()) as {
      legacyDecision: { id: string; title: string; legacyStatus: string };
    };
    assert.equal(createPayload.legacyDecision.title, "Altbescheid 1994");
    assert.equal(createPayload.legacyDecision.legacyStatus, "NEEDS_REVIEW");

    const blockedDetail = await request(`/legacy-decisions/${createPayload.legacyDecision.id}`, {
      cookie: blockedCookie
    });
    assert.equal(blockedDetail.status, 403);

    const listResponse = await request(`/projects/${project.id}/legacy-decisions`, { cookie });
    assert.equal(listResponse.status, 200);
    const listPayload = (await listResponse.json()) as Array<{ id: string }>;
    assert.deepEqual(listPayload.map((entry) => entry.id), [createPayload.legacyDecision.id]);
  });

  it("creates legacy decisions with legalDocs.create and project write access, without projects.create", async () => {
    await createRole("LEGACY_CREATE_ONLY", ["legalDocs.create"]);
    await createRole("LEGACY_READ_ONLY", ["legalDocs.view"]);

    const creator = await createUser({
      email: "legacy-create-without-project-create@example.com",
      password: "ValidPassword1!",
      role: "LEGACY_CREATE_ONLY"
    });
    const noLegalCreate = await createUser({
      email: "legacy-create-no-legal-create@example.com",
      password: "ValidPassword1!",
      role: "LEGACY_READ_ONLY"
    });
    const projectViewer = await createUser({
      email: "legacy-create-project-viewer@example.com",
      password: "ValidPassword1!",
      role: "LEGACY_CREATE_ONLY"
    });
    const project = await seedProject(creator.id, "PROJECT_EDITOR");
    await prisma.projectAccess.createMany({
      data: [
        {
          projectId: project.id,
          userId: noLegalCreate.id,
          accessRole: "PROJECT_EDITOR"
        },
        {
          projectId: project.id,
          userId: projectViewer.id,
          accessRole: "PROJECT_VIEWER"
        }
      ]
    });

    const creatorCookie = await login(creator.email, "ValidPassword1!");
    const noLegalCreateCookie = await login(noLegalCreate.email, "ValidPassword1!");
    const projectViewerCookie = await login(projectViewer.email, "ValidPassword1!");

    const createResponse = await request(`/projects/${project.id}/legacy-decisions`, {
      method: "POST",
      cookie: creatorCookie,
      body: {
        title: "Altbescheid ohne projects.create"
      }
    });
    assert.equal(createResponse.status, 201);

    const missingDomainPermission = await request(`/projects/${project.id}/legacy-decisions`, {
      method: "POST",
      cookie: noLegalCreateCookie,
      body: {
        title: "Altbescheid ohne LegalDoc Create"
      }
    });
    assert.equal(missingDomainPermission.status, 403);

    const missingProjectWrite = await request(`/projects/${project.id}/legacy-decisions`, {
      method: "POST",
      cookie: projectViewerCookie,
      body: {
        title: "Altbescheid ohne Projektschreibzugriff"
      }
    });
    assert.equal(missingProjectWrite.status, 403);
  });

  it("lists only legacy decisions from accessible projects and keeps external users fail-closed", async () => {
    const user = await createUser({
      email: "legacy-list@example.com",
      password: "ValidPassword1!"
    });
    const externalOrg = await prisma.externalOrganization.create({
      data: {
        name: "Legacy External Org",
        type: "SERVICE_PROVIDER"
      }
    });
    const externalUser = await createUser({
      email: "legacy-list-external@example.com",
      password: "ValidPassword1!",
      role: "EXTERNAL",
      type: "EXTERNAL",
      externalOrgId: externalOrg.id
    });
    const firstProject = await seedProject(user.id, "PROJECT_VIEWER");
    const secondProject = await seedProject();
    await prisma.projectAccess.create({
      data: {
        projectId: firstProject.id,
        userId: externalUser.id,
        accessRole: "EXTERNAL_PROJECT_VIEWER"
      }
    });
    const firstLegacyDecision = await prisma.legacyDecision.create({
      data: {
        id: "legacy-accessible",
        projectId: firstProject.id,
        title: "Accessible Legacy Decision"
      }
    });
    await prisma.legacyDecision.create({
      data: {
        id: "legacy-hidden",
        projectId: secondProject.id,
        title: "Hidden Legacy Decision"
      }
    });
    const cookie = await login(user.email, "ValidPassword1!");
    const externalCookie = await login(externalUser.email, "ValidPassword1!");

    const listResponse = await request("/legacy-decisions", { cookie });
    assert.equal(listResponse.status, 200);
    const listPayload = (await listResponse.json()) as Array<{ id: string }>;
    assert.deepEqual(listPayload.map((entry) => entry.id), [firstLegacyDecision.id]);

    const externalList = await request("/legacy-decisions", { cookie: externalCookie });
    assert.equal(externalList.status, 200);
    assert.deepEqual(await externalList.json(), []);

    const externalProjectList = await request(`/projects/${firstProject.id}/legacy-decisions`, {
      cookie: externalCookie
    });
    assert.equal(externalProjectList.status, 403);
  });

  it("requires legalDocs.view in addition to project access for legacy decision reads", async () => {
    await createRole("LEGACY_PROJECT_ONLY", ["projects.view"]);
    await createRole("LEGACY_READER_ONLY", ["legalDocs.view"]);

    const projectOnlyUser = await createUser({
      email: "legacy-project-only@example.com",
      password: "ValidPassword1!",
      role: "LEGACY_PROJECT_ONLY"
    });
    const legacyReader = await createUser({
      email: "legacy-reader-only@example.com",
      password: "ValidPassword1!",
      role: "LEGACY_READER_ONLY"
    });
    const firstProject = await seedProject();
    const secondProject = await seedProject();
    const firstLegacyDecision = await prisma.legacyDecision.create({
      data: {
        id: "legacy-domain-visible",
        projectId: firstProject.id,
        title: "Visible Legacy Decision"
      }
    });
    const hiddenLegacyDecision = await prisma.legacyDecision.create({
      data: {
        id: "legacy-domain-hidden",
        projectId: secondProject.id,
        title: "Hidden Legacy Decision"
      }
    });
    await prisma.projectAccess.createMany({
      data: [
        {
          projectId: firstProject.id,
          userId: projectOnlyUser.id,
          accessRole: "PROJECT_VIEWER"
        },
        {
          projectId: firstProject.id,
          userId: legacyReader.id,
          accessRole: "PROJECT_VIEWER"
        }
      ]
    });

    const projectOnlyCookie = await login(projectOnlyUser.email, "ValidPassword1!");
    const legacyReaderCookie = await login(legacyReader.email, "ValidPassword1!");

    const projectOnlyList = await request("/legacy-decisions", { cookie: projectOnlyCookie });
    assert.equal(projectOnlyList.status, 200);
    assert.deepEqual(await projectOnlyList.json(), []);
    const projectOnlyProjectList = await request(`/projects/${firstProject.id}/legacy-decisions`, {
      cookie: projectOnlyCookie
    });
    assert.equal(projectOnlyProjectList.status, 403);
    const projectOnlyMissingDetail = await request("/legacy-decisions/does-not-exist", {
      cookie: projectOnlyCookie
    });
    assert.equal(projectOnlyMissingDetail.status, 403);

    const scopedList = await request("/legacy-decisions", { cookie: legacyReaderCookie });
    assert.equal(scopedList.status, 200);
    const scopedPayload = (await scopedList.json()) as Array<{ id: string }>;
    assert.deepEqual(scopedPayload.map((entry) => entry.id), [firstLegacyDecision.id]);
    const hiddenDetail = await request(`/legacy-decisions/${hiddenLegacyDecision.id}`, {
      cookie: legacyReaderCookie
    });
    assert.equal(hiddenDetail.status, 403);
  });

  it("validates status values and same-project legal document links", async () => {
    const user = await createUser({
      email: "legacy-validation@example.com",
      password: "ValidPassword1!"
    });
    const project = await seedProject(user.id, "PROJECT_EDITOR");
    const otherProject = await seedProject();
    const otherLegalDoc = await seedLegalDocument(otherProject.id);
    const cookie = await login(user.email, "ValidPassword1!");

    const invalidStatus = await request(`/projects/${project.id}/legacy-decisions`, {
      method: "POST",
      cookie,
      body: {
        title: "Invalid status",
        legacyStatus: "ACTIVE"
      }
    });
    assert.equal(invalidStatus.status, 400);

    const invalidLink = await request(`/projects/${project.id}/legacy-decisions`, {
      method: "POST",
      cookie,
      body: {
        title: "Invalid linked legal doc",
        linkedLegalDocId: otherLegalDoc.id
      }
    });
    assert.equal(invalidLink.status, 400);
    const payload = (await invalidLink.json()) as { message: string };
    assert.equal(payload.message, "linkedLegalDocId must belong to the same project.");
  });

  it("protects legacy decision documents by the underlying project", async () => {
    await createRole("LEGACY_DOCUMENT_PROJECT_ONLY", ["projects.view"]);
    const admin = await createUser({
      email: "legacy-doc-admin@example.com",
      password: "ValidPassword1!",
      role: "ADMIN"
    });
    const reader = await createUser({
      email: "legacy-doc-reader@example.com",
      password: "ValidPassword1!"
    });
    const blockedUser = await createUser({
      email: "legacy-doc-blocked@example.com",
      password: "ValidPassword1!"
    });
    const projectOnlyUser = await createUser({
      email: "legacy-doc-project-only@example.com",
      password: "ValidPassword1!",
      role: "LEGACY_DOCUMENT_PROJECT_ONLY"
    });
    const project = await seedProject(reader.id, "PROJECT_VIEWER");
    await prisma.projectAccess.create({
      data: {
        projectId: project.id,
        userId: projectOnlyUser.id,
        accessRole: "PROJECT_VIEWER"
      }
    });
    const legacyDecision = await prisma.legacyDecision.create({
      data: {
        id: "legacy-document-owner",
        projectId: project.id,
        title: "Document Owner Legacy Decision"
      }
    });
    const adminCookie = await login(admin.email, "ValidPassword1!");
    const readerCookie = await login(reader.email, "ValidPassword1!");
    const blockedCookie = await login(blockedUser.email, "ValidPassword1!");
    const projectOnlyCookie = await login(projectOnlyUser.email, "ValidPassword1!");

    const uploadResponse = await uploadLegacyDecisionDocument(adminCookie, legacyDecision.id);
    assert.equal(uploadResponse.status, 201);
    const uploadPayload = (await uploadResponse.json()) as { document: { id: string } };

    const readerDownload = await request(`/documents/${uploadPayload.document.id}/file`, {
      cookie: readerCookie
    });
    assert.equal(readerDownload.status, 200);

    const blockedDownload = await request(`/documents/${uploadPayload.document.id}/file`, {
      cookie: blockedCookie
    });
    assert.equal(blockedDownload.status, 403);

    const projectOnlyDownload = await request(`/documents/${uploadPayload.document.id}/file`, {
      cookie: projectOnlyCookie
    });
    assert.equal(projectOnlyDownload.status, 403);
  });

  it("archives and restores legacy decisions without creating active compliance objects", async () => {
    const user = await createUser({
      email: "legacy-archive@example.com",
      password: "ValidPassword1!",
      role: "COMPLIANCE_MANAGER"
    });
    const project = await seedProject();
    const legacyDecision = await prisma.legacyDecision.create({
      data: {
        id: "legacy-archive-restore",
        projectId: project.id,
        title: "Archive Restore Legacy Decision"
      }
    });
    const cookie = await login(user.email, "ValidPassword1!");

    const archiveResponse = await request(`/legacy-decisions/${legacyDecision.id}/archive`, {
      method: "POST",
      cookie
    });
    assert.equal(archiveResponse.status, 200);
    const archivePayload = (await archiveResponse.json()) as { legacyDecision: { isArchived: boolean } };
    assert.equal(archivePayload.legacyDecision.isArchived, true);

    const restoreResponse = await request(`/legacy-decisions/${legacyDecision.id}/restore`, {
      method: "POST",
      cookie
    });
    assert.equal(restoreResponse.status, 200);
    const restorePayload = (await restoreResponse.json()) as { legacyDecision: { isArchived: boolean } };
    assert.equal(restorePayload.legacyDecision.isArchived, false);
    assert.equal(await prisma.obligation.count(), 0);
    assert.equal(await prisma.deadline.count(), 0);
    assert.equal(await prisma.taskStateEntry.count(), 0);
  });
});
