import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { once } from "node:events";
import path from "node:path";
import { tmpdir } from "node:os";
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
const legacyDocumentsStorageDir = path.resolve(currentDir, "..", "legacy-storage", "uploads");
const alternateStorageRoot = path.join(tmpdir(), `nemetz-documents-api-${process.pid}`);
const exactDocumentsUploadRoot = path.join(alternateStorageRoot, "documents");
const exactUploadsRoot = path.join(alternateStorageRoot, "uploads");

let baseUrl = "";
let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
let requestCounter = 0;

async function cleanUploadDir() {
  await fs.rm(uploadDir, { recursive: true, force: true });
  await fs.rm(legacyDocumentsStorageDir, { recursive: true, force: true });
  await fs.rm(alternateStorageRoot, { recursive: true, force: true });
  await fs.mkdir(uploadDir, { recursive: true });
  await fs.mkdir(legacyDocumentsStorageDir, { recursive: true });
  await fs.mkdir(exactDocumentsUploadRoot, { recursive: true });
  await fs.mkdir(exactUploadsRoot, { recursive: true });
}

async function requestTo(apiBaseUrl: string, pathname: string, options: { method?: string; body?: unknown; cookie?: string } = {}) {
  requestCounter += 1;
  const headers = new Headers();
  headers.set("X-Forwarded-For", `127.0.0.${(requestCounter % 200) + 1}`);

  if (options.cookie) {
    headers.set("Cookie", options.cookie);
  }

  if (options.body !== undefined) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(`${apiBaseUrl}${pathname}`, {
    method: options.method ?? "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined
  });
}

async function request(pathname: string, options: { method?: string; body?: unknown; cookie?: string } = {}) {
  return requestTo(baseUrl, pathname, options);
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

async function loginTo(apiBaseUrl: string, email: string, password: string) {
  const response = await requestTo(apiBaseUrl, "/auth/login", {
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

async function login(email: string, password: string) {
  return loginTo(baseUrl, email, password);
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

async function uploadDocumentTo(
  apiBaseUrl: string,
  cookie: string,
  ownerType: string,
  ownerId: string,
  filename = "example.pdf"
) {
  requestCounter += 1;
  const form = new FormData();
  form.set("ownerType", ownerType);
  form.set("ownerId", ownerId);
  form.set("file", new Blob(["test-pdf-content"], { type: "application/pdf" }), filename);

  const headers = new Headers();
  headers.set("X-Forwarded-For", `127.0.0.${(requestCounter % 200) + 1}`);
  headers.set("Cookie", cookie);

  return fetch(`${apiBaseUrl}/documents`, {
    method: "POST",
    headers,
    body: form
  });
}

async function uploadDocument(cookie: string, ownerType: string, ownerId: string, filename = "example.pdf") {
  return uploadDocumentTo(baseUrl, cookie, ownerType, ownerId, filename);
}

async function replaceDocumentFileTo(
  apiBaseUrl: string,
  cookie: string,
  documentId: string,
  filename = "replacement.pdf",
  content = "replacement-content"
) {
  requestCounter += 1;
  const form = new FormData();
  form.set("file", new Blob([content], { type: "application/pdf" }), filename);

  const headers = new Headers();
  headers.set("X-Forwarded-For", `127.0.0.${(requestCounter % 200) + 1}`);
  headers.set("Cookie", cookie);

  return fetch(`${apiBaseUrl}/documents/${encodeURIComponent(documentId)}/file`, {
    method: "PUT",
    headers,
    body: form
  });
}

async function replaceDocumentFile(cookie: string, documentId: string, filename = "replacement.pdf", content = "replacement-content") {
  return replaceDocumentFileTo(baseUrl, cookie, documentId, filename, content);
}

function resolveTestDocumentPath(storagePath: string) {
  const normalized = storagePath.startsWith("uploads/")
    ? storagePath.slice("uploads/".length)
    : storagePath;
  return path.resolve(uploadDir, normalized);
}

function resolveLegacyExactTestDocumentPath(storagePath: string) {
  return path.resolve(legacyDocumentsStorageDir, storagePath.replace(/\\/g, "/"));
}

function storagePathBasename(storagePath: string) {
  return path.posix.basename(storagePath.replace(/\\/g, "/"));
}

function assertBoundedStoragePath(storagePath: string) {
  assert.match(storagePath, /^documents\/\d{4}\/\d{2}\/[^/]+$/);
  assert.ok(Buffer.byteLength(storagePathBasename(storagePath), "utf8") < 255);
}

function makeLongPdfFilename() {
  return `${"a".repeat(236)}.pdf`;
}

async function listUploadFiles(dir = uploadDir): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        return listUploadFiles(fullPath);
      }
      return [fullPath];
    })
  );
  return files.flat().sort();
}

function makeDocumentsTestConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
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
    legacyDocumentsStorageDir,
    documentsMaxUploadBytes: 20 * 1024 * 1024,
    ...overrides
  };
}

async function startDocumentsTestServer(overrides: Partial<AppConfig> = {}) {
  const app = createApp(makeDocumentsTestConfig(overrides));
  const testServer = app.listen(0);
  await once(testServer, "listening");

  const address = testServer.address() as AddressInfo;
  return {
    server: testServer,
    baseUrl: `http://127.0.0.1:${address.port}/api`
  };
}

async function closeTestServer(testServer: ReturnType<ReturnType<typeof createApp>["listen"]>) {
  await new Promise<void>((resolve, reject) => {
    testServer.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

describe("Documents API", () => {
  before(async () => {
    const started = await startDocumentsTestServer();
    server = started.server;
    baseUrl = started.baseUrl;
  });

  after(async () => {
    server.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    await prisma.session.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.document.deleteMany();
    await prisma.taskStateEntry.deleteMany();
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
        createdByUserId?: string;
        createdByLabel?: string;
      };
    };

    assert.equal(payload.ok, true);
    assert.equal(payload.document.ownerType, "PROJECT");
    assert.equal(payload.document.ownerId, project.id);
    assert.ok(payload.document.id);
    assert.equal(payload.document.createdByUserId, user.id);
    assert.equal(payload.document.createdByLabel, "Doc Tester");

    const record = await prisma.document.findUniqueOrThrow({
      where: {
        id: payload.document.id
      }
    });
    assertBoundedStoragePath(record.storagePath);
    assert.equal(record.filename, "permit.pdf");
    assert.equal(record.originalFilename, "permit.pdf");
    const expectedPath = resolveTestDocumentPath(record.storagePath);
    const stat = await fs.stat(expectedPath);
    assert.equal(stat.isFile(), true);
  });

  it("honors UPLOAD_DIR exactly when its basename is not uploads", async () => {
    const started = await startDocumentsTestServer({
      uploadDir: exactDocumentsUploadRoot,
      documentsStorageDir: "storage/uploads",
      legacyDocumentsStorageDir: undefined
    });

    try {
      const user = await createUser("docs-upload-dir-documents@example.com", "ValidPassword1!");
      const project = await seedProject(user.id);
      const cookie = await loginTo(started.baseUrl, user.email, "ValidPassword1!");

      const uploadResponse = await uploadDocumentTo(started.baseUrl, cookie, "PROJECT", project.id, "exact-root.pdf");
      assert.equal(uploadResponse.status, 201);
      const uploadPayload = (await uploadResponse.json()) as { document: { id: string } };
      const record = await prisma.document.findUniqueOrThrow({
        where: {
          id: uploadPayload.document.id
        }
      });

      assertBoundedStoragePath(record.storagePath);
      const expectedPath = path.resolve(exactDocumentsUploadRoot, record.storagePath);
      const nestedUploadsPath = path.resolve(exactDocumentsUploadRoot, "uploads", record.storagePath);
      const stat = await fs.stat(expectedPath);
      assert.equal(stat.isFile(), true);
      await assert.rejects(fs.stat(nestedUploadsPath), { code: "ENOENT" });

      const downloadResponse = await requestTo(started.baseUrl, `/documents/${uploadPayload.document.id}/file`, {
        cookie
      });
      assert.equal(downloadResponse.status, 200);
      assert.equal(await downloadResponse.text(), "test-pdf-content");
    } finally {
      await closeTestServer(started.server);
    }
  });

  it("honors UPLOAD_DIR exactly when its basename is uploads", async () => {
    const started = await startDocumentsTestServer({
      uploadDir: exactUploadsRoot,
      documentsStorageDir: "storage/uploads",
      legacyDocumentsStorageDir: undefined
    });

    try {
      const user = await createUser("docs-upload-dir-uploads@example.com", "ValidPassword1!");
      const project = await seedProject(user.id);
      const cookie = await loginTo(started.baseUrl, user.email, "ValidPassword1!");

      const uploadResponse = await uploadDocumentTo(started.baseUrl, cookie, "PROJECT", project.id, "exact-uploads-root.pdf");
      assert.equal(uploadResponse.status, 201);
      const uploadPayload = (await uploadResponse.json()) as { document: { id: string } };
      const record = await prisma.document.findUniqueOrThrow({
        where: {
          id: uploadPayload.document.id
        }
      });

      assertBoundedStoragePath(record.storagePath);
      const expectedPath = path.resolve(exactUploadsRoot, record.storagePath);
      const doubleUploadsPath = path.resolve(exactUploadsRoot, "uploads", record.storagePath);
      const stat = await fs.stat(expectedPath);
      assert.equal(stat.isFile(), true);
      await assert.rejects(fs.stat(doubleUploadsPath), { code: "ENOENT" });

      const downloadResponse = await requestTo(started.baseUrl, `/documents/${uploadPayload.document.id}/file`, {
        cookie
      });
      assert.equal(downloadResponse.status, 200);
      assert.equal(await downloadResponse.text(), "test-pdf-content");
    } finally {
      await closeTestServer(started.server);
    }
  });

  it("resolves stored uploads-prefixed keys exactly inside UPLOAD_DIR without a legacy root", async () => {
    const started = await startDocumentsTestServer({
      uploadDir: exactDocumentsUploadRoot,
      documentsStorageDir: "storage/uploads",
      legacyDocumentsStorageDir: undefined
    });

    try {
      const user = await createUser("docs-upload-dir-exact-legacy-key@example.com", "ValidPassword1!");
      const project = await seedProject(user.id);
      const cookie = await loginTo(started.baseUrl, user.email, "ValidPassword1!");
      const storagePath = "uploads/current-root-legacy-key";
      const absolutePath = path.resolve(exactDocumentsUploadRoot, storagePath);
      await fs.mkdir(path.dirname(absolutePath), { recursive: true });
      await fs.writeFile(absolutePath, "current-root-legacy-content");

      const document = await prisma.document.create({
        data: {
          ownerType: "PROJECT",
          ownerId: project.id,
          filename: "current-root-legacy.pdf",
          originalFilename: "current-root-legacy.pdf",
          mimeType: "application/pdf",
          sizeBytes: 27,
          storagePath,
          sha256: "current-root-legacy"
        }
      });

      const response = await requestTo(started.baseUrl, `/documents/${document.id}/file`, {
        cookie
      });
      assert.equal(response.status, 200);
      assert.equal(await response.text(), "current-root-legacy-content");
    } finally {
      await closeTestServer(started.server);
    }
  });

  it("uploads a very long filename while keeping the storage key bounded", async () => {
    const user = await createUser("docs-long-upload@example.com", "ValidPassword1!");
    const project = await seedProject(user.id);
    const cookie = await login(user.email, "ValidPassword1!");
    const longFilename = makeLongPdfFilename();

    const uploadResponse = await uploadDocument(cookie, "PROJECT", project.id, longFilename);
    assert.equal(uploadResponse.status, 201);
    const uploadPayload = (await uploadResponse.json()) as {
      document: { id: string; filename: string; originalFilename?: string | null };
    };
    assert.equal(uploadPayload.document.filename, longFilename);
    assert.equal(uploadPayload.document.originalFilename, longFilename);

    const record = await prisma.document.findUniqueOrThrow({
      where: {
        id: uploadPayload.document.id
      }
    });
    assertBoundedStoragePath(record.storagePath);
    assert.equal(record.filename, longFilename);
    assert.equal(record.originalFilename, longFilename);
    assert.ok(!record.storagePath.includes(longFilename));

    const downloadResponse = await request(`/documents/${uploadPayload.document.id}/file`, {
      cookie
    });
    assert.equal(downloadResponse.status, 200);
  });

  it("does not use path traversal filenames in storage keys", async () => {
    const user = await createUser("docs-traversal-filename@example.com", "ValidPassword1!");
    const project = await seedProject(user.id);
    const cookie = await login(user.email, "ValidPassword1!");

    const uploadResponse = await uploadDocument(cookie, "PROJECT", project.id, "../../evil.pdf");
    assert.equal(uploadResponse.status, 201);
    const uploadPayload = (await uploadResponse.json()) as { document: { id: string } };
    const record = await prisma.document.findUniqueOrThrow({
      where: {
        id: uploadPayload.document.id
      }
    });

    assertBoundedStoragePath(record.storagePath);
    assert.ok(!record.storagePath.includes("evil.pdf"));
    assert.ok(resolveTestDocumentPath(record.storagePath).startsWith(uploadDir));

    const response = await request(`/documents/${uploadPayload.document.id}/file`, {
      cookie
    });
    assert.equal(response.status, 200);
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

  it("returns FILE_MISSING when metadata exists but content is gone", async () => {
    const user = await createUser("docs-missing-file@example.com", "ValidPassword1!");
    const project = await seedProject(user.id);
    const cookie = await login(user.email, "ValidPassword1!");

    const uploadResponse = await uploadDocument(cookie, "PROJECT", project.id, "missing-after-upload.pdf");
    assert.equal(uploadResponse.status, 201);
    const uploadPayload = (await uploadResponse.json()) as { document: { id: string } };
    const record = await prisma.document.findUniqueOrThrow({
      where: {
        id: uploadPayload.document.id
      }
    });
    await fs.rm(resolveTestDocumentPath(record.storagePath), { force: true });

    const response = await request(`/documents/${uploadPayload.document.id}/file`, {
      cookie
    });

    assert.equal(response.status, 404);
    const payload = (await response.json()) as { errorCode?: string };
    assert.equal(payload.errorCode, "FILE_MISSING");
  });

  it("deletes missing-file metadata without requiring the physical file", async () => {
    const user = await createUser("docs-delete-missing-file@example.com", "ValidPassword1!");
    const project = await seedProject(user.id);
    const cookie = await login(user.email, "ValidPassword1!");

    const document = await prisma.document.create({
      data: {
        ownerType: "PROJECT",
        ownerId: project.id,
        filename: "missing.pdf",
        mimeType: "application/pdf",
        sizeBytes: 12,
        storagePath: "documents/2026/05/missing.pdf",
        sha256: "missing"
      }
    });

    const deleteResponse = await request(`/documents/${document.id}`, {
      method: "DELETE",
      cookie
    });
    assert.equal(deleteResponse.status, 200);
    const archivedDocument = await prisma.document.findUniqueOrThrow({
      where: {
        id: document.id
      }
    });
    assert.equal(archivedDocument.isArchived, true);

    const listResponse = await request(`/documents?ownerType=PROJECT&ownerId=${encodeURIComponent(project.id)}`, {
      cookie
    });
    assert.equal(listResponse.status, 200);
    const listPayload = (await listResponse.json()) as { items: Array<{ id: string }> };
    assert.equal(listPayload.items.some((item) => item.id === document.id), false);

    const downloadResponse = await request(`/documents/${document.id}/file`, {
      cookie
    });
    assert.equal(downloadResponse.status, 404);
    const downloadPayload = (await downloadResponse.json()) as { errorCode?: string };
    assert.equal(downloadPayload.errorCode, "DOCUMENT_NOT_FOUND");
  });

  it("replaces a missing file and keeps download working across requests", async () => {
    const user = await createUser("docs-replace-missing@example.com", "ValidPassword1!");
    const project = await seedProject(user.id);
    const cookie = await login(user.email, "ValidPassword1!");

    const document = await prisma.document.create({
      data: {
        ownerType: "PROJECT",
        ownerId: project.id,
        filename: "old.pdf",
        mimeType: "application/pdf",
        sizeBytes: 12,
        storagePath: "documents/2026/05/old-missing.pdf",
        sha256: "old"
      }
    });

    const replaceResponse = await replaceDocumentFile(cookie, document.id, "repaired.pdf", "repaired-content");
    assert.equal(replaceResponse.status, 200);
    const replacePayload = (await replaceResponse.json()) as { document: { id: string; filename: string } };
    assert.equal(replacePayload.document.id, document.id);
    assert.equal(replacePayload.document.filename, "repaired.pdf");
    const repairedRecord = await prisma.document.findUniqueOrThrow({
      where: {
        id: document.id
      }
    });
    assertBoundedStoragePath(repairedRecord.storagePath);

    const firstDownload = await request(`/documents/${document.id}/file`, {
      cookie
    });
    assert.equal(firstDownload.status, 200);
    assert.equal(await firstDownload.text(), "repaired-content");

    const secondDownload = await request(`/documents/${document.id}/file`, {
      cookie
    });
    assert.equal(secondDownload.status, 200);
    assert.equal(await secondDownload.text(), "repaired-content");
  });

  it("replaces with a very long filename while keeping the storage key bounded", async () => {
    const user = await createUser("docs-long-replace@example.com", "ValidPassword1!");
    const project = await seedProject(user.id);
    const cookie = await login(user.email, "ValidPassword1!");
    const uploadResponse = await uploadDocument(cookie, "PROJECT", project.id, "short.pdf");
    assert.equal(uploadResponse.status, 201);
    const uploadPayload = (await uploadResponse.json()) as { document: { id: string } };
    const longFilename = makeLongPdfFilename();

    const replaceResponse = await replaceDocumentFile(cookie, uploadPayload.document.id, longFilename, "long-replace");
    assert.equal(replaceResponse.status, 200);
    const replacePayload = (await replaceResponse.json()) as {
      document: { id: string; filename: string; originalFilename?: string | null };
    };
    assert.equal(replacePayload.document.filename, longFilename);
    assert.equal(replacePayload.document.originalFilename, longFilename);

    const record = await prisma.document.findUniqueOrThrow({
      where: {
        id: uploadPayload.document.id
      }
    });
    assertBoundedStoragePath(record.storagePath);
    assert.equal(record.filename, longFilename);
    assert.equal(record.originalFilename, longFilename);
    assert.ok(!record.storagePath.includes(longFilename));

    const response = await request(`/documents/${uploadPayload.document.id}/file`, {
      cookie
    });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "long-replace");
  });

  it("replaces an existing file and removes the old safe file", async () => {
    const user = await createUser("docs-replace-existing@example.com", "ValidPassword1!");
    const project = await seedProject(user.id);
    const cookie = await login(user.email, "ValidPassword1!");

    const uploadResponse = await uploadDocument(cookie, "PROJECT", project.id, "old-name.pdf");
    assert.equal(uploadResponse.status, 201);
    const uploadPayload = (await uploadResponse.json()) as { document: { id: string } };
    const oldRecord = await prisma.document.findUniqueOrThrow({
      where: {
        id: uploadPayload.document.id
      }
    });
    const oldPath = resolveTestDocumentPath(oldRecord.storagePath);

    const replaceResponse = await replaceDocumentFile(cookie, uploadPayload.document.id, "new-name.pdf", "new-content");
    assert.equal(replaceResponse.status, 200);
    const newRecord = await prisma.document.findUniqueOrThrow({
      where: {
        id: uploadPayload.document.id
      }
    });
    assertBoundedStoragePath(newRecord.storagePath);
    assert.notEqual(newRecord.storagePath, oldRecord.storagePath);
    await assert.rejects(fs.stat(oldPath), { code: "ENOENT" });

    const response = await request(`/documents/${uploadPayload.document.id}/file`, {
      cookie
    });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "new-content");
  });

  it("keeps replace successful when old file cleanup fails after the DB update", async (t) => {
    const user = await createUser("docs-replace-cleanup-failure@example.com", "ValidPassword1!");
    const project = await seedProject(user.id);
    const cookie = await login(user.email, "ValidPassword1!");

    const uploadResponse = await uploadDocument(cookie, "PROJECT", project.id, "cleanup-old.pdf");
    assert.equal(uploadResponse.status, 201);
    const uploadPayload = (await uploadResponse.json()) as { document: { id: string } };
    const oldRecord = await prisma.document.findUniqueOrThrow({
      where: {
        id: uploadPayload.document.id
      }
    });
    const oldPath = resolveTestDocumentPath(oldRecord.storagePath);

    const originalUnlink = fs.unlink.bind(fs) as (...args: unknown[]) => Promise<void>;
    t.mock.method(fs, "unlink", async (...args: unknown[]) => {
      if (path.resolve(String(args[0] ?? "")) === oldPath) {
        throw new Error("mock old file cleanup failure");
      }
      return originalUnlink(...args);
    });

    const replaceResponse = await replaceDocumentFile(
      cookie,
      uploadPayload.document.id,
      "cleanup-new.pdf",
      "cleanup-new-content"
    );
    assert.equal(replaceResponse.status, 200);
    const replacePayload = (await replaceResponse.json()) as { ok: boolean; document: { id: string } };
    assert.equal(replacePayload.ok, true);
    assert.equal(replacePayload.document.id, uploadPayload.document.id);

    const newRecord = await prisma.document.findUniqueOrThrow({
      where: {
        id: uploadPayload.document.id
      }
    });
    assert.notEqual(newRecord.storagePath, oldRecord.storagePath);
    assertBoundedStoragePath(newRecord.storagePath);
    assert.equal(await fs.readFile(oldPath, "utf8"), "test-pdf-content");

    const response = await request(`/documents/${uploadPayload.document.id}/file`, {
      cookie
    });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "cleanup-new-content");
  });

  it("keeps replace successful when audit creation fails after the DB update", async () => {
    const user = await createUser("docs-replace-audit-failure@example.com", "ValidPassword1!");
    const project = await seedProject(user.id);
    const cookie = await login(user.email, "ValidPassword1!");

    const uploadResponse = await uploadDocument(cookie, "PROJECT", project.id, "audit-old.pdf");
    assert.equal(uploadResponse.status, 201);
    const uploadPayload = (await uploadResponse.json()) as { document: { id: string } };
    const oldRecord = await prisma.document.findUniqueOrThrow({
      where: {
        id: uploadPayload.document.id
      }
    });

    const originalAuditCreate = prisma.auditLog.create.bind(prisma.auditLog) as (args: unknown) => Promise<unknown>;
    (prisma.auditLog as unknown as { create: (args: unknown) => Promise<unknown> }).create = async (args: unknown) => {
      const createArgs = args as { data?: { action?: unknown } };
      if (createArgs.data?.action === "DOCUMENT_FILE_REPLACED") {
        throw new Error("mock replace audit failure");
      }
      return originalAuditCreate(args);
    };

    let replaceResponse: Response;
    try {
      replaceResponse = await replaceDocumentFile(
        cookie,
        uploadPayload.document.id,
        "audit-new.pdf",
        "audit-new-content"
      );
    } finally {
      (prisma.auditLog as unknown as { create: (args: unknown) => Promise<unknown> }).create = originalAuditCreate;
    }

    assert.equal(replaceResponse.status, 200);
    const replacePayload = (await replaceResponse.json()) as { ok: boolean; document: { id: string } };
    assert.equal(replacePayload.ok, true);
    assert.equal(replacePayload.document.id, uploadPayload.document.id);

    const newRecord = await prisma.document.findUniqueOrThrow({
      where: {
        id: uploadPayload.document.id
      }
    });
    assert.notEqual(newRecord.storagePath, oldRecord.storagePath);
    assertBoundedStoragePath(newRecord.storagePath);

    const response = await request(`/documents/${uploadPayload.document.id}/file`, {
      cookie
    });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "audit-new-content");
  });

  it("keeps legacy upload storage keys readable", async () => {
    const user = await createUser("docs-legacy-key@example.com", "ValidPassword1!");
    const project = await seedProject(user.id);
    const cookie = await login(user.email, "ValidPassword1!");
    const legacyStoragePath = "uploads/legacy-document-content";
    await fs.writeFile(resolveTestDocumentPath(legacyStoragePath), "legacy-content");

    const document = await prisma.document.create({
      data: {
        ownerType: "PROJECT",
        ownerId: project.id,
        filename: "legacy.pdf",
        originalFilename: "legacy.pdf",
        mimeType: "application/pdf",
        sizeBytes: 14,
        storagePath: legacyStoragePath,
        sha256: "legacy"
      }
    });

    const response = await request(`/documents/${document.id}/file`, {
      cookie
    });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "legacy-content");
  });

  it("keeps exact legacy DOCUMENTS_STORAGE_DIR uploads layout readable", async () => {
    const user = await createUser("docs-legacy-exact-key@example.com", "ValidPassword1!");
    const project = await seedProject(user.id);
    const cookie = await login(user.email, "ValidPassword1!");
    const legacyStoragePath = "uploads/legacy-exact-document-content";
    const legacyFilePath = resolveLegacyExactTestDocumentPath(legacyStoragePath);
    await fs.mkdir(path.dirname(legacyFilePath), { recursive: true });
    await fs.writeFile(legacyFilePath, "legacy-exact-content");

    const document = await prisma.document.create({
      data: {
        ownerType: "PROJECT",
        ownerId: project.id,
        filename: "legacy-exact.pdf",
        originalFilename: "legacy-exact.pdf",
        mimeType: "application/pdf",
        sizeBytes: 20,
        storagePath: legacyStoragePath,
        sha256: "legacy-exact"
      }
    });

    const response = await request(`/documents/${document.id}/file`, {
      cookie
    });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "legacy-exact-content");
  });

  it("prefers exact legacy DOCUMENTS_STORAGE_DIR uploads layout over stripped UPLOAD_DIR fallback", async () => {
    const user = await createUser("docs-legacy-shadowing@example.com", "ValidPassword1!");
    const project = await seedProject(user.id);
    const cookie = await login(user.email, "ValidPassword1!");
    const legacyStoragePath = "uploads/shadowed-document-content";
    const legacyFilePath = resolveLegacyExactTestDocumentPath(legacyStoragePath);
    const strippedUploadPath = resolveTestDocumentPath(legacyStoragePath);
    await fs.mkdir(path.dirname(legacyFilePath), { recursive: true });
    await fs.mkdir(path.dirname(strippedUploadPath), { recursive: true });
    await fs.writeFile(legacyFilePath, "real legacy content");
    await fs.writeFile(strippedUploadPath, "stale or unrelated content");

    const document = await prisma.document.create({
      data: {
        ownerType: "PROJECT",
        ownerId: project.id,
        filename: "shadowed.pdf",
        originalFilename: "shadowed.pdf",
        mimeType: "application/pdf",
        sizeBytes: 19,
        storagePath: legacyStoragePath,
        sha256: "shadowed"
      }
    });

    const response = await request(`/documents/${document.id}/file`, {
      cookie
    });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "real legacy content");
  });

  it("uses a new storage key when replacing with the same filename", async () => {
    const user = await createUser("docs-replace-same-name@example.com", "ValidPassword1!");
    const project = await seedProject(user.id);
    const cookie = await login(user.email, "ValidPassword1!");
    const uploadResponse = await uploadDocument(cookie, "PROJECT", project.id, "same-name.pdf");
    assert.equal(uploadResponse.status, 201);
    const uploadPayload = (await uploadResponse.json()) as { document: { id: string } };
    const oldRecord = await prisma.document.findUniqueOrThrow({
      where: {
        id: uploadPayload.document.id
      }
    });

    const replaceResponse = await replaceDocumentFile(cookie, uploadPayload.document.id, "same-name.pdf", "same-name-new");
    assert.equal(replaceResponse.status, 200);
    const newRecord = await prisma.document.findUniqueOrThrow({
      where: {
        id: uploadPayload.document.id
      }
    });

    assert.notEqual(newRecord.storagePath, oldRecord.storagePath);
    assertBoundedStoragePath(newRecord.storagePath);
    const response = await request(`/documents/${uploadPayload.document.id}/file`, {
      cookie
    });
    assert.equal(response.status, 200);
    assert.equal(await response.text(), "same-name-new");
  });

  it("replaces only the resolved old file and leaves alternate legacy candidates intact", async () => {
    const user = await createUser("docs-replace-overlap@example.com", "ValidPassword1!");
    const project = await seedProject(user.id);
    const cookie = await login(user.email, "ValidPassword1!");
    const legacyStoragePath = "uploads/replace-overlap-content";
    const legacyFilePath = resolveLegacyExactTestDocumentPath(legacyStoragePath);
    const strippedUploadPath = resolveTestDocumentPath(legacyStoragePath);
    await fs.mkdir(path.dirname(legacyFilePath), { recursive: true });
    await fs.mkdir(path.dirname(strippedUploadPath), { recursive: true });
    await fs.writeFile(legacyFilePath, "replace real legacy content");
    await fs.writeFile(strippedUploadPath, "replace alternate active content");

    const document = await prisma.document.create({
      data: {
        ownerType: "PROJECT",
        ownerId: project.id,
        filename: "replace-overlap.pdf",
        originalFilename: "replace-overlap.pdf",
        mimeType: "application/pdf",
        sizeBytes: 27,
        storagePath: legacyStoragePath,
        sha256: "replace-overlap"
      }
    });
    const alternateDocument = await prisma.document.create({
      data: {
        ownerType: "PROJECT",
        ownerId: project.id,
        filename: "replace-alternate.pdf",
        originalFilename: "replace-alternate.pdf",
        mimeType: "application/pdf",
        sizeBytes: 32,
        storagePath: "replace-overlap-content",
        sha256: "replace-alternate"
      }
    });

    const replaceResponse = await replaceDocumentFile(cookie, document.id, "replace-new.pdf", "replace new content");
    assert.equal(replaceResponse.status, 200);
    await assert.rejects(fs.stat(legacyFilePath), { code: "ENOENT" });
    assert.equal(await fs.readFile(strippedUploadPath, "utf8"), "replace alternate active content");

    const alternateDownload = await request(`/documents/${alternateDocument.id}/file`, {
      cookie
    });
    assert.equal(alternateDownload.status, 200);
    assert.equal(await alternateDownload.text(), "replace alternate active content");

    const replacedDownload = await request(`/documents/${document.id}/file`, {
      cookie
    });
    assert.equal(replacedDownload.status, 200);
    assert.equal(await replacedDownload.text(), "replace new content");
  });

  it("keeps the old file intact when replacement DB update fails", async () => {
    const user = await createUser("docs-replace-db-failure@example.com", "ValidPassword1!");
    const project = await seedProject(user.id);
    const cookie = await login(user.email, "ValidPassword1!");
    const uploadResponse = await uploadDocument(cookie, "PROJECT", project.id, "db-failure.pdf");
    assert.equal(uploadResponse.status, 201);
    const uploadPayload = (await uploadResponse.json()) as { document: { id: string } };
    const oldRecord = await prisma.document.findUniqueOrThrow({
      where: {
        id: uploadPayload.document.id
      }
    });
    const oldPath = resolveTestDocumentPath(oldRecord.storagePath);
    assert.equal(await fs.readFile(oldPath, "utf8"), "test-pdf-content");

    const originalUpdate = prisma.document.update.bind(prisma.document) as (args: unknown) => Promise<unknown>;
    (prisma.document as unknown as { update: (args: unknown) => Promise<unknown> }).update = async (args: unknown) => {
      const updateArgs = args as { where?: { id?: string }; data?: { storagePath?: unknown } };
      if (updateArgs.where?.id === uploadPayload.document.id && updateArgs.data?.storagePath) {
        throw new Error("mock document update failure");
      }
      return originalUpdate(args);
    };

    let replaceResponse: Response;
    try {
      replaceResponse = await replaceDocumentFile(cookie, uploadPayload.document.id, "db-failure.pdf", "new-content");
    } finally {
      (prisma.document as unknown as { update: (args: unknown) => Promise<unknown> }).update = originalUpdate;
    }
    assert.equal(replaceResponse.status, 500);

    const currentRecord = await prisma.document.findUniqueOrThrow({
      where: {
        id: uploadPayload.document.id
      }
    });
    assert.equal(currentRecord.storagePath, oldRecord.storagePath);
    assert.equal(await fs.readFile(oldPath, "utf8"), "test-pdf-content");
    assert.deepEqual(await listUploadFiles(), [oldPath]);
  });

  it("keeps the old file and document metadata when replacement file write fails", async (t) => {
    const user = await createUser("docs-replace-write-failure@example.com", "ValidPassword1!");
    const project = await seedProject(user.id);
    const cookie = await login(user.email, "ValidPassword1!");
    const uploadResponse = await uploadDocument(cookie, "PROJECT", project.id, "write-failure.pdf");
    assert.equal(uploadResponse.status, 201);
    const uploadPayload = (await uploadResponse.json()) as { document: { id: string } };
    const oldRecord = await prisma.document.findUniqueOrThrow({
      where: {
        id: uploadPayload.document.id
      }
    });
    const oldPath = resolveTestDocumentPath(oldRecord.storagePath);

    const originalWriteFile = fs.writeFile.bind(fs) as (...args: unknown[]) => Promise<void>;
    t.mock.method(fs, "writeFile", async (...args: unknown[]) => {
      if (String(args[0] ?? "").includes(".tmp-")) {
        throw new Error("mock file write failure");
      }
      return originalWriteFile(...args);
    });

    const replaceResponse = await replaceDocumentFile(
      cookie,
      uploadPayload.document.id,
      "write-failure.pdf",
      "new-content"
    );
    assert.equal(replaceResponse.status, 500);

    const currentRecord = await prisma.document.findUniqueOrThrow({
      where: {
        id: uploadPayload.document.id
      }
    });
    assert.equal(currentRecord.storagePath, oldRecord.storagePath);
    assert.equal(await fs.readFile(oldPath, "utf8"), "test-pdf-content");
    assert.deepEqual(await listUploadFiles(), [oldPath]);
  });

  it("blocks path traversal and never deletes files outside the upload root", async () => {
    const user = await createUser("docs-path-traversal@example.com", "ValidPassword1!");
    const project = await seedProject(user.id);
    const cookie = await login(user.email, "ValidPassword1!");
    const outsidePath = path.resolve(uploadDir, "..", "outside-document.pdf");
    await fs.writeFile(outsidePath, "outside");

    const document = await prisma.document.create({
      data: {
        ownerType: "PROJECT",
        ownerId: project.id,
        filename: "unsafe.pdf",
        mimeType: "application/pdf",
        sizeBytes: 7,
        storagePath: "../outside-document.pdf",
        sha256: "unsafe"
      }
    });

    const downloadResponse = await request(`/documents/${document.id}/file`, {
      cookie
    });
    assert.equal(downloadResponse.status, 400);
    const downloadPayload = (await downloadResponse.json()) as { errorCode?: string };
    assert.equal(downloadPayload.errorCode, "INVALID_STORAGE_PATH");

    const deleteResponse = await request(`/documents/${document.id}`, {
      method: "DELETE",
      cookie
    });
    assert.equal(deleteResponse.status, 200);
    assert.equal(await fs.readFile(outsidePath, "utf8"), "outside");

    const absoluteOutsideDocument = await prisma.document.create({
      data: {
        ownerType: "PROJECT",
        ownerId: project.id,
        filename: "outside.pdf",
        mimeType: "application/pdf",
        sizeBytes: 7,
        storagePath: outsidePath,
        sha256: "outside"
      }
    });

    const absoluteDeleteResponse = await request(`/documents/${absoluteOutsideDocument.id}`, {
      method: "DELETE",
      cookie
    });
    assert.equal(absoluteDeleteResponse.status, 200);
    assert.equal(await fs.readFile(outsidePath, "utf8"), "outside");
    await fs.rm(outsidePath, { force: true });
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

  it("allows authorized project document delete and hides the document from lists", async () => {
    const user = await createUser("docs-delete-project@example.com", "ValidPassword1!");
    const project = await seedProject(user.id);
    const cookie = await login(user.email, "ValidPassword1!");

    const uploadResponse = await uploadDocument(cookie, "PROJECT", project.id, "delete-me.pdf");
    assert.equal(uploadResponse.status, 201);
    const uploadPayload = (await uploadResponse.json()) as { document: { id: string } };
    const record = await prisma.document.findUniqueOrThrow({
      where: {
        id: uploadPayload.document.id
      }
    });
    const filePath = resolveTestDocumentPath(record.storagePath);

    const deleteResponse = await request(`/documents/${uploadPayload.document.id}`, {
      method: "DELETE",
      cookie
    });
    assert.equal(deleteResponse.status, 200);
    const archivedRecord = await prisma.document.findUniqueOrThrow({
      where: {
        id: uploadPayload.document.id
      }
    });
    assert.equal(archivedRecord.isArchived, true);
    await assert.rejects(fs.stat(filePath), { code: "ENOENT" });

    const listResponse = await request(`/documents?ownerType=PROJECT&ownerId=${encodeURIComponent(project.id)}`, {
      cookie
    });
    assert.equal(listResponse.status, 200);
    const listPayload = (await listResponse.json()) as { items: Array<{ id: string }> };
    assert.equal(listPayload.items.some((item) => item.id === uploadPayload.document.id), false);

    const downloadResponse = await request(`/documents/${uploadPayload.document.id}/file`, {
      cookie
    });
    assert.equal(downloadResponse.status, 404);
    const downloadPayload = (await downloadResponse.json()) as { errorCode?: string };
    assert.equal(downloadPayload.errorCode, "DOCUMENT_NOT_FOUND");
  });

  it("deletes exact legacy DOCUMENTS_STORAGE_DIR files after archiving the document", async () => {
    const user = await createUser("docs-delete-legacy-exact@example.com", "ValidPassword1!");
    const project = await seedProject(user.id);
    const cookie = await login(user.email, "ValidPassword1!");
    const legacyStoragePath = "uploads/delete-legacy-exact-content";
    const legacyFilePath = resolveLegacyExactTestDocumentPath(legacyStoragePath);
    await fs.mkdir(path.dirname(legacyFilePath), { recursive: true });
    await fs.writeFile(legacyFilePath, "delete-legacy-exact");

    const document = await prisma.document.create({
      data: {
        ownerType: "PROJECT",
        ownerId: project.id,
        filename: "delete-legacy-exact.pdf",
        originalFilename: "delete-legacy-exact.pdf",
        mimeType: "application/pdf",
        sizeBytes: 19,
        storagePath: legacyStoragePath,
        sha256: "delete-legacy-exact"
      }
    });

    const deleteResponse = await request(`/documents/${document.id}`, {
      method: "DELETE",
      cookie
    });
    assert.equal(deleteResponse.status, 200);

    const archivedRecord = await prisma.document.findUniqueOrThrow({
      where: {
        id: document.id
      }
    });
    assert.equal(archivedRecord.isArchived, true);
    await assert.rejects(fs.stat(legacyFilePath), { code: "ENOENT" });

    const listResponse = await request(`/documents?ownerType=PROJECT&ownerId=${encodeURIComponent(project.id)}`, {
      cookie
    });
    assert.equal(listResponse.status, 200);
    const listPayload = (await listResponse.json()) as { items: Array<{ id: string }> };
    assert.equal(listPayload.items.some((item) => item.id === document.id), false);
  });

  it("deletes only the resolved legacy file and leaves stripped alternate documents intact", async () => {
    const user = await createUser("docs-delete-overlap@example.com", "ValidPassword1!");
    const project = await seedProject(user.id);
    const cookie = await login(user.email, "ValidPassword1!");
    const legacyStoragePath = "uploads/delete-overlap-content";
    const legacyFilePath = resolveLegacyExactTestDocumentPath(legacyStoragePath);
    const strippedUploadPath = resolveTestDocumentPath(legacyStoragePath);
    await fs.mkdir(path.dirname(legacyFilePath), { recursive: true });
    await fs.mkdir(path.dirname(strippedUploadPath), { recursive: true });
    await fs.writeFile(legacyFilePath, "delete real legacy content");
    await fs.writeFile(strippedUploadPath, "delete alternate active content");

    const legacyDocument = await prisma.document.create({
      data: {
        ownerType: "PROJECT",
        ownerId: project.id,
        filename: "delete-overlap-legacy.pdf",
        originalFilename: "delete-overlap-legacy.pdf",
        mimeType: "application/pdf",
        sizeBytes: 26,
        storagePath: legacyStoragePath,
        sha256: "delete-overlap-legacy"
      }
    });
    const alternateDocument = await prisma.document.create({
      data: {
        ownerType: "PROJECT",
        ownerId: project.id,
        filename: "delete-overlap-alternate.pdf",
        originalFilename: "delete-overlap-alternate.pdf",
        mimeType: "application/pdf",
        sizeBytes: 31,
        storagePath: "delete-overlap-content",
        sha256: "delete-overlap-alternate"
      }
    });

    const deleteResponse = await request(`/documents/${legacyDocument.id}`, {
      method: "DELETE",
      cookie
    });
    assert.equal(deleteResponse.status, 200);
    await assert.rejects(fs.stat(legacyFilePath), { code: "ENOENT" });
    assert.equal(await fs.readFile(strippedUploadPath, "utf8"), "delete alternate active content");

    const alternateDownload = await request(`/documents/${alternateDocument.id}/file`, {
      cookie
    });
    assert.equal(alternateDownload.status, 200);
    assert.equal(await alternateDownload.text(), "delete alternate active content");
  });

  it("deletes only the first resolved candidate when multiple legacy candidates exist", async () => {
    const user = await createUser("docs-delete-multiple-candidates@example.com", "ValidPassword1!");
    const project = await seedProject(user.id);
    const cookie = await login(user.email, "ValidPassword1!");
    const legacyStoragePath = "uploads/delete-multiple-candidates";
    const legacyExactFilePath = resolveLegacyExactTestDocumentPath(legacyStoragePath);
    const uploadExactFilePath = path.resolve(uploadDir, legacyStoragePath);
    const uploadStrippedFilePath = resolveTestDocumentPath(legacyStoragePath);
    const legacyStrippedFilePath = path.resolve(legacyDocumentsStorageDir, "delete-multiple-candidates");
    for (const filePath of [legacyExactFilePath, uploadExactFilePath, uploadStrippedFilePath, legacyStrippedFilePath]) {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
    }
    await fs.writeFile(legacyExactFilePath, "legacy exact");
    await fs.writeFile(uploadExactFilePath, "upload exact");
    await fs.writeFile(uploadStrippedFilePath, "upload stripped");
    await fs.writeFile(legacyStrippedFilePath, "legacy stripped");

    const document = await prisma.document.create({
      data: {
        ownerType: "PROJECT",
        ownerId: project.id,
        filename: "delete-multiple.pdf",
        originalFilename: "delete-multiple.pdf",
        mimeType: "application/pdf",
        sizeBytes: 12,
        storagePath: legacyStoragePath,
        sha256: "delete-multiple"
      }
    });

    const deleteResponse = await request(`/documents/${document.id}`, {
      method: "DELETE",
      cookie
    });
    assert.equal(deleteResponse.status, 200);
    await assert.rejects(fs.stat(legacyExactFilePath), { code: "ENOENT" });
    assert.equal(await fs.readFile(uploadExactFilePath, "utf8"), "upload exact");
    assert.equal(await fs.readFile(uploadStrippedFilePath, "utf8"), "upload stripped");
    assert.equal(await fs.readFile(legacyStrippedFilePath, "utf8"), "legacy stripped");
  });

  it("cleans up missing exact legacy document metadata without requiring the file", async () => {
    const user = await createUser("docs-delete-missing-legacy-exact@example.com", "ValidPassword1!");
    const project = await seedProject(user.id);
    const cookie = await login(user.email, "ValidPassword1!");

    const document = await prisma.document.create({
      data: {
        ownerType: "PROJECT",
        ownerId: project.id,
        filename: "missing-legacy-exact.pdf",
        originalFilename: "missing-legacy-exact.pdf",
        mimeType: "application/pdf",
        sizeBytes: 14,
        storagePath: "uploads/missing-legacy-exact-content",
        sha256: "missing-legacy-exact"
      }
    });

    const downloadResponse = await request(`/documents/${document.id}/file`, {
      cookie
    });
    assert.equal(downloadResponse.status, 404);
    const downloadPayload = (await downloadResponse.json()) as { errorCode?: string };
    assert.equal(downloadPayload.errorCode, "FILE_MISSING");

    const deleteResponse = await request(`/documents/${document.id}`, {
      method: "DELETE",
      cookie
    });
    assert.equal(deleteResponse.status, 200);

    const archivedRecord = await prisma.document.findUniqueOrThrow({
      where: {
        id: document.id
      }
    });
    assert.equal(archivedRecord.isArchived, true);
  });

  it("keeps active metadata and the file when document archive fails during delete", async () => {
    const user = await createUser("docs-delete-db-failure@example.com", "ValidPassword1!");
    const project = await seedProject(user.id);
    const cookie = await login(user.email, "ValidPassword1!");

    const uploadResponse = await uploadDocument(cookie, "PROJECT", project.id, "delete-db-failure.pdf");
    assert.equal(uploadResponse.status, 201);
    const uploadPayload = (await uploadResponse.json()) as { document: { id: string } };
    const record = await prisma.document.findUniqueOrThrow({
      where: {
        id: uploadPayload.document.id
      }
    });
    const filePath = resolveTestDocumentPath(record.storagePath);
    assert.equal(await fs.readFile(filePath, "utf8"), "test-pdf-content");

    const originalUpdate = prisma.document.update.bind(prisma.document) as (args: unknown) => Promise<unknown>;
    (prisma.document as unknown as { update: (args: unknown) => Promise<unknown> }).update = async (args: unknown) => {
      const updateArgs = args as { where?: { id?: string }; data?: { isArchived?: unknown } };
      if (updateArgs.where?.id === uploadPayload.document.id && updateArgs.data?.isArchived === true) {
        throw new Error("mock document archive failure");
      }
      return originalUpdate(args);
    };

    let deleteResponse: Response;
    try {
      deleteResponse = await request(`/documents/${uploadPayload.document.id}`, {
        method: "DELETE",
        cookie
      });
    } finally {
      (prisma.document as unknown as { update: (args: unknown) => Promise<unknown> }).update = originalUpdate;
    }
    assert.equal(deleteResponse.status, 500);

    const currentRecord = await prisma.document.findUniqueOrThrow({
      where: {
        id: uploadPayload.document.id
      }
    });
    assert.equal(currentRecord.isArchived, false);
    assert.equal(currentRecord.storagePath, record.storagePath);
    assert.equal(await fs.readFile(filePath, "utf8"), "test-pdf-content");

    const downloadResponse = await request(`/documents/${uploadPayload.document.id}/file`, {
      cookie
    });
    assert.equal(downloadResponse.status, 200);
    assert.equal(await downloadResponse.text(), "test-pdf-content");
  });

  it("keeps delete successful when file cleanup fails after archive", async (t) => {
    const user = await createUser("docs-delete-unlink-failure@example.com", "ValidPassword1!");
    const project = await seedProject(user.id);
    const cookie = await login(user.email, "ValidPassword1!");

    const uploadResponse = await uploadDocument(cookie, "PROJECT", project.id, "delete-unlink-failure.pdf");
    assert.equal(uploadResponse.status, 201);
    const uploadPayload = (await uploadResponse.json()) as { document: { id: string } };
    const record = await prisma.document.findUniqueOrThrow({
      where: {
        id: uploadPayload.document.id
      }
    });
    const filePath = resolveTestDocumentPath(record.storagePath);

    const originalUnlink = fs.unlink.bind(fs) as (...args: unknown[]) => Promise<void>;
    t.mock.method(fs, "unlink", async (...args: unknown[]) => {
      if (path.resolve(String(args[0] ?? "")) === filePath) {
        throw new Error("mock unlink failure");
      }
      return originalUnlink(...args);
    });

    const deleteResponse = await request(`/documents/${uploadPayload.document.id}`, {
      method: "DELETE",
      cookie
    });
    assert.equal(deleteResponse.status, 200);

    const archivedRecord = await prisma.document.findUniqueOrThrow({
      where: {
        id: uploadPayload.document.id
      }
    });
    assert.equal(archivedRecord.isArchived, true);
    assert.equal(await fs.readFile(filePath, "utf8"), "test-pdf-content");

    const listResponse = await request(`/documents?ownerType=PROJECT&ownerId=${encodeURIComponent(project.id)}`, {
      cookie
    });
    assert.equal(listResponse.status, 200);
    const listPayload = (await listResponse.json()) as { items: Array<{ id: string }> };
    assert.equal(listPayload.items.some((item) => item.id === uploadPayload.document.id), false);

    const downloadResponse = await request(`/documents/${uploadPayload.document.id}/file`, {
      cookie
    });
    assert.equal(downloadResponse.status, 404);
    const downloadPayload = (await downloadResponse.json()) as { errorCode?: string };
    assert.equal(downloadPayload.errorCode, "DOCUMENT_NOT_FOUND");
  });

  it("keeps delete successful when audit creation fails after archive", async () => {
    const user = await createUser("docs-delete-audit-failure@example.com", "ValidPassword1!");
    const project = await seedProject(user.id);
    const cookie = await login(user.email, "ValidPassword1!");

    const uploadResponse = await uploadDocument(cookie, "PROJECT", project.id, "delete-audit-failure.pdf");
    assert.equal(uploadResponse.status, 201);
    const uploadPayload = (await uploadResponse.json()) as { document: { id: string } };

    const originalAuditCreate = prisma.auditLog.create.bind(prisma.auditLog) as (args: unknown) => Promise<unknown>;
    (prisma.auditLog as unknown as { create: (args: unknown) => Promise<unknown> }).create = async (args: unknown) => {
      const createArgs = args as { data?: { action?: unknown } };
      if (createArgs.data?.action === "DOCUMENT_DELETED") {
        throw new Error("mock delete audit failure");
      }
      return originalAuditCreate(args);
    };

    let deleteResponse: Response;
    try {
      deleteResponse = await request(`/documents/${uploadPayload.document.id}`, {
        method: "DELETE",
        cookie
      });
    } finally {
      (prisma.auditLog as unknown as { create: (args: unknown) => Promise<unknown> }).create = originalAuditCreate;
    }
    assert.equal(deleteResponse.status, 200);

    const archivedRecord = await prisma.document.findUniqueOrThrow({
      where: {
        id: uploadPayload.document.id
      }
    });
    assert.equal(archivedRecord.isArchived, true);

    const listResponse = await request(`/documents?ownerType=PROJECT&ownerId=${encodeURIComponent(project.id)}`, {
      cookie
    });
    assert.equal(listResponse.status, 200);
    const listPayload = (await listResponse.json()) as { items: Array<{ id: string }> };
    assert.equal(listPayload.items.some((item) => item.id === uploadPayload.document.id), false);
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

  it("requires owner write permission for delete and replace", async () => {
    await createRole("PROJECT_DOC_DELETE_VIEWER", ["projects.view"]);
    await createRole("PROJECT_DOC_DELETE_EDITOR", ["projects.view", "projects.edit"]);

    const viewer = await createUser("docs-delete-viewer@example.com", "ValidPassword1!", {
      role: "PROJECT_DOC_DELETE_VIEWER"
    });
    const editor = await createUser("docs-delete-editor@example.com", "ValidPassword1!", {
      role: "PROJECT_DOC_DELETE_EDITOR"
    });
    const project = await seedProject();
    await grantProjectAccess(project.id, viewer.id, "PROJECT_VIEWER");
    await grantProjectAccess(project.id, editor.id, "PROJECT_EDITOR");

    const viewerCookie = await login(viewer.email, "ValidPassword1!");
    const editorCookie = await login(editor.email, "ValidPassword1!");

    const uploadResponse = await uploadDocument(editorCookie, "PROJECT", project.id, "managed.pdf");
    assert.equal(uploadResponse.status, 201);
    const uploadPayload = (await uploadResponse.json()) as { document: { id: string } };

    const replaceResponse = await replaceDocumentFile(viewerCookie, uploadPayload.document.id, "blocked.pdf");
    assert.equal(replaceResponse.status, 403);

    const deleteResponse = await request(`/documents/${uploadPayload.document.id}`, {
      method: "DELETE",
      cookie: viewerCookie
    });
    assert.equal(deleteResponse.status, 403);

    const downloadResponse = await request(`/documents/${uploadPayload.document.id}/file`, {
      cookie: editorCookie
    });
    assert.equal(downloadResponse.status, 200);
  });

  it("uses completion permission for task and deadline evidence uploads", async () => {
    await createRole("TASK_EVIDENCE_EDIT_ONLY", [
      "projects.view",
      "projects.edit",
      "tasks.view",
      "tasks.edit"
    ]);
    await createRole("TASK_EVIDENCE_COMPLETE", ["tasks.view", "tasks.complete"]);

    const editOnlyUser = await createUser("docs-task-evidence-edit-only@example.com", "ValidPassword1!", {
      role: "TASK_EVIDENCE_EDIT_ONLY"
    });
    const completeUser = await createUser("docs-task-evidence-complete@example.com", "ValidPassword1!", {
      role: "TASK_EVIDENCE_COMPLETE"
    });
    const editOnlyBundle = await seedOwnerBundle(editOnlyUser.id, "PROJECT_EDITOR");
    const completeBundle = await seedOwnerBundle(completeUser.id, "PROJECT_EDITOR");
    const editOnlyCookie = await login(editOnlyUser.email, "ValidPassword1!");
    const completeCookie = await login(completeUser.email, "ValidPassword1!");

    const projectUpload = await uploadDocument(
      editOnlyCookie,
      "PROJECT",
      editOnlyBundle.project.id,
      "project-allowed.pdf"
    );
    assert.equal(projectUpload.status, 201);

    const editOnlyTaskEvidenceUpload = await uploadDocument(
      editOnlyCookie,
      "TASK_EVIDENCE",
      editOnlyBundle.taskOwnerId,
      "task-blocked.pdf"
    );
    assert.equal(editOnlyTaskEvidenceUpload.status, 403);

    const completeOnlyTaskEvidenceUpload = await uploadDocument(
      completeCookie,
      "TASK_EVIDENCE",
      completeBundle.taskOwnerId,
      "task-allowed.pdf"
    );
    assert.equal(completeOnlyTaskEvidenceUpload.status, 201);

    const completeOnlyDeadlineUpload = await uploadDocument(
      completeCookie,
      "DEADLINE",
      completeBundle.deadline.id,
      "deadline-allowed.pdf"
    );
    assert.equal(completeOnlyDeadlineUpload.status, 201);
  });

  it("blocks direct task evidence delete and replace fail-closed", async () => {
    await createRole("TASK_EVIDENCE_MANAGER", [
      "projects.view",
      "projects.edit",
      "tasks.view",
      "tasks.edit",
      "tasks.complete"
    ]);
    await createRole("TASK_EVIDENCE_READ_ONLY", ["projects.view", "tasks.view"]);
    const user = await createUser("docs-task-evidence-delete@example.com", "ValidPassword1!", {
      role: "TASK_EVIDENCE_MANAGER"
    });
    const readOnlyUser = await createUser("docs-task-evidence-read-only-delete@example.com", "ValidPassword1!", {
      role: "TASK_EVIDENCE_READ_ONLY"
    });
    const bundle = await seedOwnerBundle(user.id, "PROJECT_EDITOR");
    await grantProjectAccess(bundle.project.id, readOnlyUser.id, "PROJECT_VIEWER");
    const cookie = await login(user.email, "ValidPassword1!");
    const readOnlyCookie = await login(readOnlyUser.email, "ValidPassword1!");

    const uploadResponse = await uploadDocument(cookie, "TASK_EVIDENCE", bundle.taskOwnerId, "task-evidence.pdf");
    assert.equal(uploadResponse.status, 201);
    const uploadPayload = (await uploadResponse.json()) as { document: { id: string } };

    const readOnlyDeleteResponse = await request(`/documents/${uploadPayload.document.id}`, {
      method: "DELETE",
      cookie: readOnlyCookie
    });
    assert.equal(readOnlyDeleteResponse.status, 403);

    const readOnlyReplaceResponse = await replaceDocumentFile(
      readOnlyCookie,
      uploadPayload.document.id,
      "task-read-only-replacement.pdf"
    );
    assert.equal(readOnlyReplaceResponse.status, 403);

    await prisma.taskStateEntry.create({
      data: {
        taskInstanceId: bundle.taskOwnerId,
        status: "DONE",
        evidence: []
      }
    });

    const deleteResponse = await request(`/documents/${uploadPayload.document.id}`, {
      method: "DELETE",
      cookie
    });
    assert.equal(deleteResponse.status, 409);
    const deletePayload = (await deleteResponse.json()) as { errorCode?: string };
    assert.equal(deletePayload.errorCode, "TASK_EVIDENCE_DELETE_BLOCKED");

    const replaceResponse = await replaceDocumentFile(cookie, uploadPayload.document.id, "task-replacement.pdf");
    assert.equal(replaceResponse.status, 409);
    const replacePayload = (await replaceResponse.json()) as { errorCode?: string };
    assert.equal(replacePayload.errorCode, "TASK_EVIDENCE_DELETE_BLOCKED");
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

  it("uploads and downloads legacy decision documents across sessions", async () => {
    await createRole("LEGACY_DECISION_DOCUMENT_EDITOR", ["legalDocs.view", "legalDocs.edit"]);
    const user = await createUser("docs-legacy-upload@example.com", "ValidPassword1!", {
      role: "LEGACY_DECISION_DOCUMENT_EDITOR"
    });
    const bundle = await seedOwnerBundle(user.id, "PROJECT_EDITOR");
    const cookie = await login(user.email, "ValidPassword1!");

    const uploadResponse = await uploadDocument(
      cookie,
      "LEGACY_DECISION",
      bundle.legacyDecision.id,
      "legacy-decision.pdf"
    );
    assert.equal(uploadResponse.status, 201);
    const uploadPayload = (await uploadResponse.json()) as {
      document: { id: string; ownerType: string; ownerId: string; filename: string };
    };
    assert.equal(uploadPayload.document.ownerType, "LEGACY_DECISION");
    assert.equal(uploadPayload.document.ownerId, bundle.legacyDecision.id);
    assert.equal(uploadPayload.document.filename, "legacy-decision.pdf");

    const firstDownload = await request(`/documents/${uploadPayload.document.id}/file`, {
      cookie
    });
    assert.equal(firstDownload.status, 200);
    assert.equal(await firstDownload.text(), "test-pdf-content");

    const reloadCookie = await login(user.email, "ValidPassword1!");
    const reloadDownload = await request(`/documents/${uploadPayload.document.id}/file`, {
      cookie: reloadCookie
    });
    assert.equal(reloadDownload.status, 200);
    assert.equal(await reloadDownload.text(), "test-pdf-content");
  });

  it("repairs and removes missing-file legacy decision document entries", async () => {
    await createRole("LEGACY_DECISION_DOCUMENT_REPAIR", ["legalDocs.view", "legalDocs.edit"]);
    const user = await createUser("docs-legacy-repair@example.com", "ValidPassword1!", {
      role: "LEGACY_DECISION_DOCUMENT_REPAIR"
    });
    const bundle = await seedOwnerBundle(user.id, "PROJECT_EDITOR");
    const cookie = await login(user.email, "ValidPassword1!");

    const missingDocument = await prisma.document.create({
      data: {
        ownerType: "LEGACY_DECISION",
        ownerId: bundle.legacyDecision.id,
        filename: "legacy-missing.pdf",
        mimeType: "application/pdf",
        sizeBytes: 12,
        storagePath: "documents/2026/05/legacy-missing.pdf",
        sha256: "legacy-missing"
      }
    });

    const missingDownload = await request(`/documents/${missingDocument.id}/file`, {
      cookie
    });
    assert.equal(missingDownload.status, 404);
    const missingPayload = (await missingDownload.json()) as { errorCode?: string };
    assert.equal(missingPayload.errorCode, "FILE_MISSING");

    const replaceResponse = await replaceDocumentFile(
      cookie,
      missingDocument.id,
      "legacy-repaired.pdf",
      "legacy-repaired-content"
    );
    assert.equal(replaceResponse.status, 200);
    const replacePayload = (await replaceResponse.json()) as { document: { id: string; filename: string } };
    assert.equal(replacePayload.document.id, missingDocument.id);
    assert.equal(replacePayload.document.filename, "legacy-repaired.pdf");

    const repairedDownload = await request(`/documents/${missingDocument.id}/file`, {
      cookie
    });
    assert.equal(repairedDownload.status, 200);
    assert.equal(await repairedDownload.text(), "legacy-repaired-content");

    const defectiveDocument = await prisma.document.create({
      data: {
        ownerType: "LEGACY_DECISION",
        ownerId: bundle.legacyDecision.id,
        filename: "legacy-defective.pdf",
        mimeType: "application/pdf",
        sizeBytes: 12,
        storagePath: "documents/2026/05/legacy-defective.pdf",
        sha256: "legacy-defective"
      }
    });

    const deleteResponse = await request(`/documents/${defectiveDocument.id}`, {
      method: "DELETE",
      cookie
    });
    assert.equal(deleteResponse.status, 200);
    const archivedDocument = await prisma.document.findUniqueOrThrow({
      where: {
        id: defectiveDocument.id
      }
    });
    assert.equal(archivedDocument.isArchived, true);

    const deletedDownload = await request(`/documents/${defectiveDocument.id}/file`, {
      cookie
    });
    assert.equal(deletedDownload.status, 404);
    const deletedPayload = (await deletedDownload.json()) as { errorCode?: string };
    assert.equal(deletedPayload.errorCode, "DOCUMENT_NOT_FOUND");
  });

  it("enforces legacy decision document read and write permissions", async () => {
    await createRole("LEGACY_DECISION_DOC_WRITER", ["legalDocs.view", "legalDocs.edit"]);
    await createRole("LEGACY_DECISION_DOC_VIEWER", ["legalDocs.view"]);
    await createRole("LEGACY_DECISION_PROJECT_ONLY", ["projects.view"]);

    const writer = await createUser("docs-legacy-writer@example.com", "ValidPassword1!", {
      role: "LEGACY_DECISION_DOC_WRITER"
    });
    const viewer = await createUser("docs-legacy-viewer@example.com", "ValidPassword1!", {
      role: "LEGACY_DECISION_DOC_VIEWER"
    });
    const projectViewerWriter = await createUser("docs-legacy-project-viewer-writer@example.com", "ValidPassword1!", {
      role: "LEGACY_DECISION_DOC_WRITER"
    });
    const projectOnly = await createUser("docs-legacy-project-only@example.com", "ValidPassword1!", {
      role: "LEGACY_DECISION_PROJECT_ONLY"
    });
    const external = await createUser("docs-legacy-external@example.com", "ValidPassword1!", {
      role: "EXTERNAL",
      type: "EXTERNAL"
    });

    const bundle = await seedOwnerBundle(writer.id, "PROJECT_EDITOR");
    await grantProjectAccess(bundle.project.id, viewer.id, "PROJECT_VIEWER");
    await grantProjectAccess(bundle.project.id, projectViewerWriter.id, "PROJECT_VIEWER");
    await grantProjectAccess(bundle.project.id, projectOnly.id, "PROJECT_VIEWER");
    await prisma.projectAccess.create({
      data: {
        projectId: bundle.project.id,
        userId: external.id,
        accessRole: "EXTERNAL_PROJECT_VIEWER"
      }
    });

    const writerCookie = await login(writer.email, "ValidPassword1!");
    const viewerCookie = await login(viewer.email, "ValidPassword1!");
    const projectViewerWriterCookie = await login(projectViewerWriter.email, "ValidPassword1!");
    const projectOnlyCookie = await login(projectOnly.email, "ValidPassword1!");
    const externalCookie = await login(external.email, "ValidPassword1!");

    const uploadResponse = await uploadDocument(
      writerCookie,
      "LEGACY_DECISION",
      bundle.legacyDecision.id,
      "legacy-managed.pdf"
    );
    assert.equal(uploadResponse.status, 201);
    const uploadPayload = (await uploadResponse.json()) as { document: { id: string } };

    const viewerDownload = await request(`/documents/${uploadPayload.document.id}/file`, {
      cookie: viewerCookie
    });
    assert.equal(viewerDownload.status, 200);

    const viewerReplace = await replaceDocumentFile(
      viewerCookie,
      uploadPayload.document.id,
      "viewer-blocked.pdf"
    );
    assert.equal(viewerReplace.status, 403);
    const viewerDelete = await request(`/documents/${uploadPayload.document.id}`, {
      method: "DELETE",
      cookie: viewerCookie
    });
    assert.equal(viewerDelete.status, 403);

    const projectViewerReplace = await replaceDocumentFile(
      projectViewerWriterCookie,
      uploadPayload.document.id,
      "project-viewer-blocked.pdf"
    );
    assert.equal(projectViewerReplace.status, 403);
    const projectViewerDelete = await request(`/documents/${uploadPayload.document.id}`, {
      method: "DELETE",
      cookie: projectViewerWriterCookie
    });
    assert.equal(projectViewerDelete.status, 403);

    const projectOnlyDownload = await request(`/documents/${uploadPayload.document.id}/file`, {
      cookie: projectOnlyCookie
    });
    assert.equal(projectOnlyDownload.status, 403);

    const externalDownload = await request(`/documents/${uploadPayload.document.id}/file`, {
      cookie: externalCookie
    });
    assert.equal(externalDownload.status, 403);

    const writerDownload = await request(`/documents/${uploadPayload.document.id}/file`, {
      cookie: writerCookie
    });
    assert.equal(writerDownload.status, 200);
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
