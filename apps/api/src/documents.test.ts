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
  requestCounter += 1;
  const headers = new Headers();
  headers.set("X-Forwarded-For", `127.0.0.${(requestCounter % 200) + 1}`);

  if (options.cookie) {
    headers.set("Cookie", options.cookie);
  }

  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
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

async function createUser(email: string, password: string, options?: { role?: string; type?: "INTERNAL" | "EXTERNAL" }) {
  return prisma.user.create({
    data: {
      firstName: "Doc",
      lastName: "Tester",
      email,
      role: options?.role ?? "USER",
      type: options?.type ?? "INTERNAL",
      passwordHash: await hashPassword(password)
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

async function seedProject(
  accessUserId?: string,
  accessRole: "PROJECT_VIEWER" | "PROJECT_EDITOR" = "PROJECT_EDITOR"
) {
  const company = await prisma.company.create({
    data: {
      name: `Documents Company ${randomUUID()}`
    }
  });
  const project = await prisma.project.create({
    data: {
      id: `documents-project-${randomUUID()}`,
      title: "Documents Project",
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

async function grantProjectAccess(
  projectId: string,
  userId: string,
  accessRole: "PROJECT_VIEWER" | "PROJECT_EDITOR" = "PROJECT_EDITOR"
) {
  return prisma.projectAccess.create({
    data: {
      projectId,
      userId,
      accessRole
    }
  });
}

async function seedLegalDocument(projectId: string) {
  return prisma.legalDocument.create({
    data: {
      id: `documents-legal-doc-${randomUUID()}`,
      projectId,
      type: "NOTICE",
      title: "Documents Legal Doc",
      attachments: []
    }
  });
}

async function seedObligation(legalDocId: string) {
  return prisma.obligation.create({
    data: {
      id: `documents-obligation-${randomUUID()}`,
      legalDocId,
      title: "Documents Obligation",
      level: "MANDATORY",
      scheduleType: "ONCE",
      firstDueDate: "2026-05-01",
      emailReminderEnabled: false,
      evidenceRequirements: {}
    }
  });
}

async function seedDeadline(projectId: string) {
  return prisma.deadline.create({
    data: {
      id: `documents-deadline-${randomUUID()}`,
      projectId,
      title: "Documents Deadline",
      dueDate: "2026-05-01",
      status: "OPEN",
      emailReminderEnabled: false,
      evidence: []
    }
  });
}

async function seedLegacyDecision(projectId: string) {
  return prisma.legacyDecision.create({
    data: {
      id: `documents-legacy-${randomUUID()}`,
      projectId,
      title: "Documents Legacy Decision",
      legacyStatus: "ARCHIVE_ONLY",
      reviewStatus: "NOT_REVIEWED"
    }
  });
}

function taskInstanceId(obligationId: string) {
  return `obligation:${obligationId}:2026-05-01`;
}

async function seedOwnerBundle(
  accessUserId?: string,
  accessRole: "PROJECT_VIEWER" | "PROJECT_EDITOR" = "PROJECT_EDITOR"
) {
  const project = await seedProject(accessUserId, accessRole);
  const legalDoc = await seedLegalDocument(project.id);
  const obligation = await seedObligation(legalDoc.id);
  const deadline = await seedDeadline(project.id);
  const legacyDecision = await seedLegacyDecision(project.id);

  return {
    project,
    legalDoc,
    obligation,
    deadline,
    legacyDecision,
    taskOwnerId: taskInstanceId(obligation.id)
  };
}

async function uploadDocument(cookie: string, ownerType: string, ownerId: string, filename = "example.pdf") {
  requestCounter += 1;
  const form = new FormData();
  form.set("ownerType", ownerType);
  form.set("ownerId", ownerId);
  form.set("file", new Blob(["test-pdf-content"], { type: "application/pdf" }), filename);

  const headers = new Headers();
  headers.set("X-Forwarded-For", `127.0.0.${(requestCounter % 200) + 1}`);
  headers.set("Cookie", cookie);

  return fetch(`${baseUrl}/documents`, {
    method: "POST",
    headers,
    body: form
  });
}

describe("Documents API", () => {
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
    await prisma.company.deleteMany();
    await prisma.user.deleteMany();
    await prisma.role.deleteMany();
    await cleanUploadDir();
  });

  it("upload requires auth", async () => {
    const form = new FormData();
    form.set("ownerType", "PROJECT");
    form.set("ownerId", "project-auth-1");
    form.set("file", new Blob(["content"], { type: "application/pdf" }), "auth-check.pdf");

    const response = await fetch(`${baseUrl}/documents`, {
      method: "POST",
      body: form
    });

    assert.equal(response.status, 401);
  });

  it("upload stores document and returns id", async () => {
    const user = await createUser("docs-upload@example.com", "ValidPassword1!");
    const project = await seedProject(user.id);
    const cookie = await login(user.email, "ValidPassword1!");

    const uploadResponse = await uploadDocument(cookie, "PROJECT", project.id, "permit.pdf");
    assert.equal(uploadResponse.status, 201);

    const payload = (await uploadResponse.json()) as {
      ok: boolean;
      document: {
        id: string;
        ownerType: string;
        ownerId: string;
        filename: string;
      };
    };

    assert.equal(payload.ok, true);
    assert.equal(payload.document.ownerType, "PROJECT");
    assert.equal(payload.document.ownerId, project.id);
    assert.ok(payload.document.id);

    const expectedPath = path.resolve(uploadDir, payload.document.id);
    const stat = await fs.stat(expectedPath);
    assert.equal(stat.isFile(), true);
  });

  it("download returns content with inline headers for pdf", async () => {
    const user = await createUser("docs-download@example.com", "ValidPassword1!");
    const project = await seedProject(user.id);
    const legalDoc = await seedLegalDocument(project.id);
    const cookie = await login(user.email, "ValidPassword1!");

    const uploadResponse = await uploadDocument(cookie, "LEGAL_DOC", legalDoc.id, "notice.pdf");
    assert.equal(uploadResponse.status, 201);
    const uploadPayload = (await uploadResponse.json()) as { document: { id: string } };

    const response = await request(`/documents/${uploadPayload.document.id}/file`, {
      cookie
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "application/pdf");
    assert.match(response.headers.get("content-disposition") || "", /inline;/);
    assert.equal(response.headers.get("cache-control"), "private, no-store");
  });

  it("listing returns only documents of requested owner", async () => {
    const user = await createUser("docs-list@example.com", "ValidPassword1!");
    const firstProject = await seedProject(user.id);
    const secondProject = await seedProject(user.id);
    const cookie = await login(user.email, "ValidPassword1!");

    const firstUpload = await uploadDocument(cookie, "PROJECT", firstProject.id, "a.pdf");
    assert.equal(firstUpload.status, 201);
    const firstPayload = (await firstUpload.json()) as { document: { id: string } };
    const secondUpload = await uploadDocument(cookie, "PROJECT", secondProject.id, "b.pdf");
    assert.equal(secondUpload.status, 201);

    const response = await request(`/documents?ownerType=PROJECT&ownerId=${encodeURIComponent(firstProject.id)}`, {
      cookie
    });

    assert.equal(response.status, 200);
    const payload = (await response.json()) as { items: Array<{ id: string; ownerId: string }> };

    assert.equal(payload.items.length, 1);
    assert.equal(payload.items[0]?.id, firstPayload.document.id);
    assert.equal(payload.items[0]?.ownerId, firstProject.id);
  });

  it("scopes document reads and downloads by stored owner type", async () => {
    await createRole("TASK_DOC_READER", ["tasks.view"]);
    await createRole("PROJECT_DOC_READER", ["projects.view"]);
    await createRole("LEGAL_DOC_READER", ["legalDocs.view"]);

    const uploader = await createUser("docs-owner-upload@example.com", "ValidPassword1!", {
      role: "ADMIN"
    });
    const taskReader = await createUser("docs-task-reader@example.com", "ValidPassword1!", {
      role: "TASK_DOC_READER"
    });
    const projectReader = await createUser("docs-project-reader@example.com", "ValidPassword1!", {
      role: "PROJECT_DOC_READER"
    });
    const legalDocReader = await createUser("docs-legal-reader@example.com", "ValidPassword1!", {
      role: "LEGAL_DOC_READER"
    });

    const uploaderCookie = await login(uploader.email, "ValidPassword1!");
    const taskReaderCookie = await login(taskReader.email, "ValidPassword1!");
    const projectReaderCookie = await login(projectReader.email, "ValidPassword1!");
    const legalDocReaderCookie = await login(legalDocReader.email, "ValidPassword1!");

    const taskBundle = await seedOwnerBundle(taskReader.id, "PROJECT_VIEWER");
    const projectBundle = await seedOwnerBundle(projectReader.id, "PROJECT_VIEWER");
    const legalDocBundle = await seedOwnerBundle(legalDocReader.id, "PROJECT_VIEWER");
    const deadlineBundle = await seedOwnerBundle();

    const taskUpload = await uploadDocument(uploaderCookie, "TASK_EVIDENCE", taskBundle.taskOwnerId, "task.pdf");
    const projectUpload = await uploadDocument(uploaderCookie, "PROJECT", projectBundle.project.id, "project.pdf");
    const legalDocUpload = await uploadDocument(uploaderCookie, "LEGAL_DOC", legalDocBundle.legalDoc.id, "legal.pdf");
    const deadlineUpload = await uploadDocument(uploaderCookie, "DEADLINE", deadlineBundle.deadline.id, "deadline.pdf");

    const taskDocument = (await taskUpload.json()) as { document: { id: string } };
    const projectDocument = (await projectUpload.json()) as { document: { id: string } };
    const legalDocDocument = (await legalDocUpload.json()) as { document: { id: string } };
    const deadlineDocument = (await deadlineUpload.json()) as { document: { id: string } };

    assert.equal(taskUpload.status, 201);
    assert.equal(projectUpload.status, 201);
    assert.equal(legalDocUpload.status, 201);
    assert.equal(deadlineUpload.status, 201);

    const taskList = await request(`/documents?ownerType=TASK_EVIDENCE&ownerId=${encodeURIComponent(taskBundle.taskOwnerId)}`, {
      cookie: taskReaderCookie
    });
    assert.equal(taskList.status, 200);
    const taskMetadata = await request(`/documents/${taskDocument.document.id}`, {
      cookie: taskReaderCookie
    });
    assert.equal(taskMetadata.status, 200);
    const taskDownload = await request(`/documents/${taskDocument.document.id}/file`, {
      cookie: taskReaderCookie
    });
    assert.equal(taskDownload.status, 200);

    const taskReaderProjectMetadata = await request(`/documents/${projectDocument.document.id}`, {
      cookie: taskReaderCookie
    });
    assert.equal(taskReaderProjectMetadata.status, 403);
    const taskReaderProjectDownload = await request(`/documents/${projectDocument.document.id}/file`, {
      cookie: taskReaderCookie
    });
    assert.equal(taskReaderProjectDownload.status, 403);
    const taskReaderLegalMetadata = await request(`/documents/${legalDocDocument.document.id}`, {
      cookie: taskReaderCookie
    });
    assert.equal(taskReaderLegalMetadata.status, 403);
    const taskReaderLegalDownload = await request(`/documents/${legalDocDocument.document.id}/file`, {
      cookie: taskReaderCookie
    });
    assert.equal(taskReaderLegalDownload.status, 403);
    const taskReaderDeadlineMetadata = await request(`/documents/${deadlineDocument.document.id}`, {
      cookie: taskReaderCookie
    });
    assert.equal(taskReaderDeadlineMetadata.status, 403);

    const projectMetadata = await request(`/documents/${projectDocument.document.id}`, {
      cookie: projectReaderCookie
    });
    assert.equal(projectMetadata.status, 200);
    const projectDownload = await request(`/documents/${projectDocument.document.id}/file`, {
      cookie: projectReaderCookie
    });
    assert.equal(projectDownload.status, 200);
    const projectReaderLegalMetadata = await request(`/documents/${legalDocDocument.document.id}`, {
      cookie: projectReaderCookie
    });
    assert.equal(projectReaderLegalMetadata.status, 403);

    const legalDocMetadata = await request(`/documents/${legalDocDocument.document.id}`, {
      cookie: legalDocReaderCookie
    });
    assert.equal(legalDocMetadata.status, 200);
    const legalDocDownload = await request(`/documents/${legalDocDocument.document.id}/file`, {
      cookie: legalDocReaderCookie
    });
    assert.equal(legalDocDownload.status, 200);
    const legalDocReaderProjectMetadata = await request(`/documents/${projectDocument.document.id}`, {
      cookie: legalDocReaderCookie
    });
    assert.equal(legalDocReaderProjectMetadata.status, 403);
  });

  it("checks document domain permission before resolving owners", async () => {
    await createRole("DOC_PROJECT_ONLY", ["projects.view"]);
    await createRole("DOC_LEGAL_READER_ONLY", ["legalDocs.view"]);

    const projectOnlyUser = await createUser("docs-project-only-domain@example.com", "ValidPassword1!", {
      role: "DOC_PROJECT_ONLY"
    });
    const legalReader = await createUser("docs-legal-domain-only@example.com", "ValidPassword1!", {
      role: "DOC_LEGAL_READER_ONLY"
    });
    const projectOnlyCookie = await login(projectOnlyUser.email, "ValidPassword1!");
    const legalReaderCookie = await login(legalReader.email, "ValidPassword1!");

    const orphanLegalDocument = await prisma.document.create({
      data: {
        ownerType: "LEGAL_DOC",
        ownerId: "missing-legal-doc-owner",
        filename: "orphan-legal.pdf",
        mimeType: "application/pdf",
        sizeBytes: 12,
        storagePath: "uploads/missing-legal",
        sha256: "orphan-legal"
      }
    });
    const unsupportedOwnerDocument = await prisma.document.create({
      data: {
        ownerType: "UNKNOWN_OWNER",
        ownerId: "missing-owner",
        filename: "unsupported.pdf",
        mimeType: "application/pdf",
        sizeBytes: 12,
        storagePath: "uploads/missing-unsupported",
        sha256: "unsupported"
      }
    });

    const projectOnlyMetadata = await request(`/documents/${orphanLegalDocument.id}`, {
      cookie: projectOnlyCookie
    });
    assert.equal(projectOnlyMetadata.status, 403);
    const projectOnlyList = await request("/documents?ownerType=LEGAL_DOC&ownerId=missing-legal-doc-owner", {
      cookie: projectOnlyCookie
    });
    assert.equal(projectOnlyList.status, 403);
    const projectOnlyTaskList = await request("/documents?ownerType=TASK_EVIDENCE&ownerId=obligation:missing:2026-05-01", {
      cookie: projectOnlyCookie
    });
    assert.equal(projectOnlyTaskList.status, 403);
    const projectOnlyLegacyList = await request("/documents?ownerType=LEGACY_DECISION&ownerId=missing-legacy", {
      cookie: projectOnlyCookie
    });
    assert.equal(projectOnlyLegacyList.status, 403);

    const legalReaderMetadata = await request(`/documents/${orphanLegalDocument.id}`, {
      cookie: legalReaderCookie
    });
    assert.equal(legalReaderMetadata.status, 404);
    const legalReaderUpload = await uploadDocument(legalReaderCookie, "LEGAL_DOC", "missing-legal-doc-owner", "blocked.pdf");
    assert.equal(legalReaderUpload.status, 403);

    const unsupportedMetadata = await request(`/documents/${unsupportedOwnerDocument.id}`, {
      cookie: legalReaderCookie
    });
    assert.equal(unsupportedMetadata.status, 403);
  });

  it("requires owner write permission for upload and rejects unsupported owner types", async () => {
    await createRole("PROJECT_DOC_VIEWER", ["projects.view"]);
    await createRole("PROJECT_DOC_EDITOR", ["projects.view", "projects.edit"]);

    const viewer = await createUser("docs-project-viewer@example.com", "ValidPassword1!", {
      role: "PROJECT_DOC_VIEWER"
    });
    const editor = await createUser("docs-project-editor@example.com", "ValidPassword1!", {
      role: "PROJECT_DOC_EDITOR"
    });
    const project = await seedProject();
    await grantProjectAccess(project.id, viewer.id, "PROJECT_VIEWER");
    await grantProjectAccess(project.id, editor.id, "PROJECT_EDITOR");

    const viewerCookie = await login(viewer.email, "ValidPassword1!");
    const editorCookie = await login(editor.email, "ValidPassword1!");

    const viewerUpload = await uploadDocument(viewerCookie, "PROJECT", project.id, "blocked.pdf");
    assert.equal(viewerUpload.status, 403);

    const editorUpload = await uploadDocument(editorCookie, "PROJECT", project.id, "allowed.pdf");
    assert.equal(editorUpload.status, 201);

    const unsupportedUpload = await uploadDocument(editorCookie, "UNKNOWN", project.id, "unknown.pdf");
    assert.equal(unsupportedUpload.status, 400);
  });

  it("admin can access all supported document owner domains", async () => {
    const admin = await createUser("docs-admin-all@example.com", "ValidPassword1!", {
      role: "ADMIN"
    });
    const bundle = await seedOwnerBundle();
    const adminCookie = await login(admin.email, "ValidPassword1!");

    for (const [ownerType, ownerId] of [
      ["PROJECT", bundle.project.id],
      ["LEGAL_DOC", bundle.legalDoc.id],
      ["OBLIGATION", bundle.obligation.id],
      ["DEADLINE", bundle.deadline.id],
      ["TASK_EVIDENCE", bundle.taskOwnerId],
      ["LEGACY_DECISION", bundle.legacyDecision.id]
    ] as const) {
      const uploadResponse = await uploadDocument(adminCookie, ownerType, ownerId, `${ownerType}.pdf`);
      assert.equal(uploadResponse.status, 201);
      const uploadPayload = (await uploadResponse.json()) as { document: { id: string } };

      const metadataResponse = await request(`/documents/${uploadPayload.document.id}`, {
        cookie: adminCookie
      });
      assert.equal(metadataResponse.status, 200);

      const downloadResponse = await request(`/documents/${uploadPayload.document.id}/file`, {
        cookie: adminCookie
      });
      assert.equal(downloadResponse.status, 200);
    }
  });

  it("external users are forbidden from document endpoints", async () => {
    const internalUser = await createUser("docs-internal@example.com", "ValidPassword1!");
    const externalUser = await createUser("docs-external@example.com", "ValidPassword1!", {
      role: "EXTERNAL",
      type: "EXTERNAL"
    });
    const project = await seedProject(internalUser.id);

    const internalCookie = await login(internalUser.email, "ValidPassword1!");
    const externalCookie = await login(externalUser.email, "ValidPassword1!");

    const uploadResponse = await uploadDocument(internalCookie, "PROJECT", project.id, "authz.pdf");
    assert.equal(uploadResponse.status, 201);
    const uploadPayload = (await uploadResponse.json()) as { document: { id: string } };

    const externalUpload = await uploadDocument(externalCookie, "PROJECT", project.id, "blocked.pdf");
    assert.equal(externalUpload.status, 403);

    const externalList = await request(`/documents?ownerType=PROJECT&ownerId=${encodeURIComponent(project.id)}`, {
      cookie: externalCookie
    });
    assert.equal(externalList.status, 403);

    const externalGet = await request(`/documents/${uploadPayload.document.id}`, {
      cookie: externalCookie
    });
    assert.equal(externalGet.status, 403);

    const externalDownload = await request(`/documents/${uploadPayload.document.id}/file`, {
      cookie: externalCookie
    });
    assert.equal(externalDownload.status, 403);
  });
});
