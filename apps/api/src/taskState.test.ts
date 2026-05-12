import assert from "node:assert/strict";
import { once } from "node:events";
import fs from "node:fs/promises";
import { after, before, beforeEach, describe, it } from "node:test";
import type { AddressInfo } from "node:net";
import { createApp } from "./app.js";
import { resolveDatabaseUrl, type AppConfig } from "./config.js";
import { resolveStoredDocumentPath } from "./documentStorage.js";
import { prisma } from "./prisma.js";
import { hashPassword } from "./security.js";

let baseUrl = "";
let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
let requestCounter = 0;
let appConfig: AppConfig;

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

async function createUser(email: string, password: string, role = "COMPLIANCE_EDITOR") {
  return prisma.user.create({
    data: {
      firstName: "Task",
      lastName: "Tester",
      email,
      role,
      type: "INTERNAL",
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

async function seedObligation(evidenceRequirements: {
  requirePhoto?: boolean;
  requireDocument?: boolean;
  requireReport?: boolean;
}, accessUserId?: string) {
  const company = await prisma.company.create({
    data: {
      name: `Task State Company ${requestCounter}`
    }
  });
  const project = await prisma.project.create({
    data: {
      id: `project-task-state-${requestCounter}`,
      title: "Task State Project",
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
      id: `legal-doc-task-state-${requestCounter}`,
      projectId: project.id,
      type: "NOTICE",
      title: "Task State Legal Doc",
      attachments: []
    }
  });
  const obligation = await prisma.obligation.create({
    data: {
      id: `obligation-task-state-${requestCounter}`,
      legalDocId: legalDoc.id,
      title: "Task State Obligation",
      level: "MANDATORY",
      scheduleType: "ONCE",
      firstDueDate: "2026-05-01",
      emailReminderEnabled: false,
      evidenceRequirements: {
        requirePhoto: Boolean(evidenceRequirements.requirePhoto),
        requireDocument: Boolean(evidenceRequirements.requireDocument),
        requireReport: Boolean(evidenceRequirements.requireReport)
      }
    }
  });

  if (accessUserId) {
    await prisma.projectAccess.create({
      data: {
        projectId: project.id,
        userId: accessUserId,
        accessRole: "PROJECT_EDITOR"
      }
    });
  }

  return obligation;
}

function taskInstanceId(obligationId: string) {
  return `obligation:${obligationId}:2026-05-01`;
}

function attachment(kind: "PHOTO" | "DOCUMENT" | "REPORT", filename: string, mime?: string) {
  return {
    id: `att-${kind}-${filename}`,
    kind,
    filename,
    mime,
    addedAt: "2026-04-29",
    storage: "indexeddb"
  };
}

async function uploadEvidenceDocument(
  cookie: string,
  ownerId: string,
  filename = "nachweis.pdf",
  mimeType = "application/pdf"
) {
  requestCounter += 1;
  const form = new FormData();
  form.set("ownerType", "TASK_EVIDENCE");
  form.set("ownerId", ownerId);
  form.set("file", new Blob(["task-evidence-content"], { type: mimeType }), filename);

  const headers = new Headers();
  headers.set("X-Forwarded-For", `127.0.0.${(requestCounter % 200) + 1}`);
  headers.set("Cookie", cookie);

  return fetch(`${baseUrl}/documents`, {
    method: "POST",
    headers,
    body: form
  });
}

async function removeUploadedDocumentFile(documentId: string) {
  const document = await prisma.document.findUniqueOrThrow({
    where: {
      id: documentId
    },
    select: {
      storagePath: true
    }
  });
  const absoluteFilePath = resolveStoredDocumentPath(appConfig, document.storagePath);
  assert.ok(absoluteFilePath);
  await fs.rm(absoluteFilePath, { force: true });
}

describe("Task state evidence requirements", () => {
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
    appConfig = config;

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
    await prisma.document.deleteMany();
    await prisma.obligation.deleteMany();
    await prisma.legalDocument.deleteMany();
    await prisma.project.deleteMany();
    await prisma.company.deleteMany();
    await prisma.user.deleteMany();
    await prisma.externalOrganization.deleteMany();
    await prisma.role.deleteMany();
  });

  it("requires tasks.view in addition to project access for task-state reads", async () => {
    await createRole("TASK_PROJECT_ONLY", ["projects.view"]);
    await createRole("TASK_READER_ONLY", ["tasks.view"]);

    const projectOnlyUser = await createUser(
      "task-state-project-only@example.com",
      "ValidPassword1!",
      "TASK_PROJECT_ONLY"
    );
    const taskReader = await createUser(
      "task-state-reader-only@example.com",
      "ValidPassword1!",
      "TASK_READER_ONLY"
    );
    const domainNoAccessUser = await createUser(
      "task-state-reader-no-access@example.com",
      "ValidPassword1!",
      "TASK_READER_ONLY"
    );
    const obligation = await seedObligation({}, projectOnlyUser.id);
    const project = await prisma.project.findFirstOrThrow({
      where: {
        legalDocuments: {
          some: {
            obligations: {
              some: {
                id: obligation.id
              }
            }
          }
        }
      },
      select: {
        id: true
      }
    });
    await prisma.projectAccess.create({
      data: {
        projectId: project.id,
        userId: taskReader.id,
        accessRole: "PROJECT_VIEWER"
      }
    });
    const id = taskInstanceId(obligation.id);
    await prisma.taskStateEntry.create({
      data: {
        taskInstanceId: id,
        status: "OPEN",
        evidence: []
      }
    });

    const projectOnlyCookie = await login(projectOnlyUser.email, "ValidPassword1!");
    const taskReaderCookie = await login(taskReader.email, "ValidPassword1!");
    const domainNoAccessCookie = await login(domainNoAccessUser.email, "ValidPassword1!");

    const projectOnlyList = await request("/task-state", { cookie: projectOnlyCookie });
    assert.equal(projectOnlyList.status, 200);
    assert.deepEqual(await projectOnlyList.json(), {});

    const scopedList = await request("/task-state", { cookie: taskReaderCookie });
    assert.equal(scopedList.status, 200);
    const scopedPayload = (await scopedList.json()) as Record<string, unknown>;
    assert.deepEqual(Object.keys(scopedPayload), [id]);

    const domainNoAccessList = await request("/task-state", { cookie: domainNoAccessCookie });
    assert.equal(domainNoAccessList.status, 200);
    assert.deepEqual(await domainNoAccessList.json(), {});
  });

  it("rejects completion with only client-side attachments for required evidence", async () => {
    const user = await createUser("task-state-client-only-reject@example.com", "ValidPassword1!");
    const obligation = await seedObligation({ requirePhoto: true, requireDocument: true }, user.id);
    const cookie = await login(user.email, "ValidPassword1!");
    const id = taskInstanceId(obligation.id);

    const response = await request(`/task-state/${encodeURIComponent(id)}/complete`, {
      method: "POST",
      cookie,
      body: {
        outcome: "OK",
        note: "Erledigt",
        attachments: [
          attachment("REPORT", "pruefdokument.pdf", "application/pdf"),
          attachment("PHOTO", "foto.jpg", "image/jpeg")
        ]
      }
    });

    assert.equal(response.status, 400);
    const payload = (await response.json()) as { missingAttachmentKinds: string[] };
    assert.deepEqual(payload.missingAttachmentKinds, ["PHOTO", "DOCUMENT"]);
    assert.equal(await prisma.taskStateEntry.findUnique({ where: { taskInstanceId: id } }), null);
  });

  it("accepts completion with a server-side TASK_EVIDENCE document for a document requirement", async () => {
    const user = await createUser("task-state-server-doc-accept@example.com", "ValidPassword1!");
    const obligation = await seedObligation({ requireDocument: true }, user.id);
    const cookie = await login(user.email, "ValidPassword1!");
    const id = taskInstanceId(obligation.id);

    const uploadResponse = await uploadEvidenceDocument(cookie, id, "nachweis.pdf", "application/pdf");
    assert.equal(uploadResponse.status, 201);
    const uploadPayload = (await uploadResponse.json()) as { document: { id: string } };

    const response = await request(`/task-state/${encodeURIComponent(id)}/complete`, {
      method: "POST",
      cookie,
      body: {
        outcome: "OK",
        attachments: [],
        evidenceDocumentIds: [uploadPayload.document.id]
      }
    });

    assert.equal(response.status, 200);
    const payload = (await response.json()) as { taskStateEntry: { status: string } };
    assert.equal(payload.taskStateEntry.status, "DONE");
  });

  it("accepts completion with an existing server-side TASK_EVIDENCE document for a document requirement", async () => {
    const user = await createUser("task-state-server-doc-existing@example.com", "ValidPassword1!");
    const obligation = await seedObligation({ requireDocument: true }, user.id);
    const cookie = await login(user.email, "ValidPassword1!");
    const id = taskInstanceId(obligation.id);

    const uploadResponse = await uploadEvidenceDocument(cookie, id, "existing-nachweis.pdf", "application/pdf");
    assert.equal(uploadResponse.status, 201);

    const response = await request(`/task-state/${encodeURIComponent(id)}/complete`, {
      method: "POST",
      cookie,
      body: {
        outcome: "OK",
        attachments: []
      }
    });

    assert.equal(response.status, 200);
    const payload = (await response.json()) as { taskStateEntry: { status: string } };
    assert.equal(payload.taskStateEntry.status, "DONE");
  });

  it("rejects completion with an explicit TASK_EVIDENCE document whose file is missing", async () => {
    const user = await createUser("task-state-server-doc-file-missing-explicit@example.com", "ValidPassword1!");
    const obligation = await seedObligation({ requireDocument: true }, user.id);
    const cookie = await login(user.email, "ValidPassword1!");
    const id = taskInstanceId(obligation.id);

    const uploadResponse = await uploadEvidenceDocument(cookie, id, "missing-file-nachweis.pdf", "application/pdf");
    assert.equal(uploadResponse.status, 201);
    const uploadPayload = (await uploadResponse.json()) as { document: { id: string } };
    await removeUploadedDocumentFile(uploadPayload.document.id);

    const response = await request(`/task-state/${encodeURIComponent(id)}/complete`, {
      method: "POST",
      cookie,
      body: {
        outcome: "OK",
        attachments: [],
        evidenceDocumentIds: [uploadPayload.document.id]
      }
    });

    assert.equal(response.status, 400);
    const payload = (await response.json()) as { errorCode?: string };
    assert.equal(payload.errorCode, "FILE_MISSING");
    assert.equal(await prisma.taskStateEntry.findUnique({ where: { taskInstanceId: id } }), null);
  });

  it("does not count existing TASK_EVIDENCE metadata when the backing file is missing", async () => {
    const user = await createUser("task-state-server-doc-file-missing-existing@example.com", "ValidPassword1!");
    const obligation = await seedObligation({ requireDocument: true }, user.id);
    const cookie = await login(user.email, "ValidPassword1!");
    const id = taskInstanceId(obligation.id);

    const uploadResponse = await uploadEvidenceDocument(cookie, id, "missing-existing-nachweis.pdf", "application/pdf");
    assert.equal(uploadResponse.status, 201);
    const uploadPayload = (await uploadResponse.json()) as { document: { id: string } };
    await removeUploadedDocumentFile(uploadPayload.document.id);

    const response = await request(`/task-state/${encodeURIComponent(id)}/complete`, {
      method: "POST",
      cookie,
      body: {
        outcome: "OK",
        attachments: []
      }
    });

    assert.equal(response.status, 400);
    const payload = (await response.json()) as { missingAttachmentKinds: string[] };
    assert.deepEqual(payload.missingAttachmentKinds, ["DOCUMENT"]);
    assert.equal(await prisma.taskStateEntry.findUnique({ where: { taskInstanceId: id } }), null);
  });

  it("accepts a new valid evidence document when an existing TASK_EVIDENCE file is missing", async () => {
    const user = await createUser("task-state-server-doc-missing-existing-valid-new@example.com", "ValidPassword1!");
    const obligation = await seedObligation({ requireDocument: true }, user.id);
    const cookie = await login(user.email, "ValidPassword1!");
    const id = taskInstanceId(obligation.id);

    const missingUploadResponse = await uploadEvidenceDocument(cookie, id, "missing-existing.pdf", "application/pdf");
    assert.equal(missingUploadResponse.status, 201);
    const missingUploadPayload = (await missingUploadResponse.json()) as { document: { id: string } };
    await removeUploadedDocumentFile(missingUploadPayload.document.id);

    const validUploadResponse = await uploadEvidenceDocument(cookie, id, "new-valid.pdf", "application/pdf");
    assert.equal(validUploadResponse.status, 201);
    const validUploadPayload = (await validUploadResponse.json()) as { document: { id: string } };

    const response = await request(`/task-state/${encodeURIComponent(id)}/complete`, {
      method: "POST",
      cookie,
      body: {
        outcome: "OK",
        attachments: [],
        evidenceDocumentIds: [validUploadPayload.document.id]
      }
    });

    assert.equal(response.status, 200);
    const payload = (await response.json()) as { taskStateEntry: { status: string } };
    assert.equal(payload.taskStateEntry.status, "DONE");
  });

  it("accepts explicit document evidence together with existing valid photo evidence", async () => {
    const user = await createUser("task-state-server-doc-existing-photo-explicit-doc@example.com", "ValidPassword1!");
    const obligation = await seedObligation({ requirePhoto: true, requireDocument: true }, user.id);
    const cookie = await login(user.email, "ValidPassword1!");
    const id = taskInstanceId(obligation.id);

    const photoUploadResponse = await uploadEvidenceDocument(cookie, id, "existing-photo.jpg", "image/jpeg");
    assert.equal(photoUploadResponse.status, 201);

    const documentUploadResponse = await uploadEvidenceDocument(cookie, id, "new-document.pdf", "application/pdf");
    assert.equal(documentUploadResponse.status, 201);
    const documentUploadPayload = (await documentUploadResponse.json()) as { document: { id: string } };

    const response = await request(`/task-state/${encodeURIComponent(id)}/complete`, {
      method: "POST",
      cookie,
      body: {
        outcome: "OK",
        attachments: [],
        evidenceDocumentIds: [documentUploadPayload.document.id]
      }
    });

    assert.equal(response.status, 200);
    const payload = (await response.json()) as { taskStateEntry: { status: string } };
    assert.equal(payload.taskStateEntry.status, "DONE");
  });

  it("accepts explicit photo evidence together with existing valid document evidence", async () => {
    const user = await createUser("task-state-server-doc-existing-doc-explicit-photo@example.com", "ValidPassword1!");
    const obligation = await seedObligation({ requirePhoto: true, requireDocument: true }, user.id);
    const cookie = await login(user.email, "ValidPassword1!");
    const id = taskInstanceId(obligation.id);

    const documentUploadResponse = await uploadEvidenceDocument(cookie, id, "existing-document.pdf", "application/pdf");
    assert.equal(documentUploadResponse.status, 201);

    const photoUploadResponse = await uploadEvidenceDocument(cookie, id, "new-photo.jpg", "image/jpeg");
    assert.equal(photoUploadResponse.status, 201);
    const photoUploadPayload = (await photoUploadResponse.json()) as { document: { id: string } };

    const response = await request(`/task-state/${encodeURIComponent(id)}/complete`, {
      method: "POST",
      cookie,
      body: {
        outcome: "OK",
        attachments: [],
        evidenceDocumentIds: [photoUploadPayload.document.id]
      }
    });

    assert.equal(response.status, 200);
    const payload = (await response.json()) as { taskStateEntry: { status: string } };
    assert.equal(payload.taskStateEntry.status, "DONE");
  });

  it("does not count missing existing photo evidence when explicit document evidence is valid", async () => {
    const user = await createUser("task-state-server-doc-missing-photo-explicit-doc@example.com", "ValidPassword1!");
    const obligation = await seedObligation({ requirePhoto: true, requireDocument: true }, user.id);
    const cookie = await login(user.email, "ValidPassword1!");
    const id = taskInstanceId(obligation.id);

    const missingPhotoUploadResponse = await uploadEvidenceDocument(cookie, id, "missing-photo.jpg", "image/jpeg");
    assert.equal(missingPhotoUploadResponse.status, 201);
    const missingPhotoUploadPayload = (await missingPhotoUploadResponse.json()) as { document: { id: string } };
    await removeUploadedDocumentFile(missingPhotoUploadPayload.document.id);

    const documentUploadResponse = await uploadEvidenceDocument(cookie, id, "new-document.pdf", "application/pdf");
    assert.equal(documentUploadResponse.status, 201);
    const documentUploadPayload = (await documentUploadResponse.json()) as { document: { id: string } };

    const response = await request(`/task-state/${encodeURIComponent(id)}/complete`, {
      method: "POST",
      cookie,
      body: {
        outcome: "OK",
        attachments: [],
        evidenceDocumentIds: [documentUploadPayload.document.id]
      }
    });

    assert.equal(response.status, 400);
    const payload = (await response.json()) as { missingAttachmentKinds: string[] };
    assert.deepEqual(payload.missingAttachmentKinds, ["PHOTO"]);
    assert.equal(await prisma.taskStateEntry.findUnique({ where: { taskInstanceId: id } }), null);
  });

  it("rejects completion when the server-side evidence document has the wrong kind", async () => {
    const user = await createUser("task-state-server-doc-kind-reject@example.com", "ValidPassword1!");
    const obligation = await seedObligation({ requireDocument: true }, user.id);
    const cookie = await login(user.email, "ValidPassword1!");
    const id = taskInstanceId(obligation.id);

    const uploadResponse = await uploadEvidenceDocument(cookie, id, "foto.jpg", "image/jpeg");
    assert.equal(uploadResponse.status, 201);
    const uploadPayload = (await uploadResponse.json()) as { document: { id: string } };

    const response = await request(`/task-state/${encodeURIComponent(id)}/complete`, {
      method: "POST",
      cookie,
      body: {
        outcome: "OK",
        attachments: [],
        evidenceDocumentIds: [uploadPayload.document.id]
      }
    });

    assert.equal(response.status, 400);
    const payload = (await response.json()) as { missingAttachmentKinds: string[] };
    assert.deepEqual(payload.missingAttachmentKinds, ["DOCUMENT"]);
    assert.equal(await prisma.taskStateEntry.findUnique({ where: { taskInstanceId: id } }), null);
  });

  it("rejects completion with server-side evidence from another task owner", async () => {
    const user = await createUser("task-state-server-doc-foreign-reject@example.com", "ValidPassword1!");
    const sourceObligation = await seedObligation({ requireDocument: true }, user.id);
    requestCounter += 1;
    const targetObligation = await seedObligation({ requireDocument: true }, user.id);
    const cookie = await login(user.email, "ValidPassword1!");
    const sourceId = taskInstanceId(sourceObligation.id);
    const targetId = taskInstanceId(targetObligation.id);

    const uploadResponse = await uploadEvidenceDocument(cookie, sourceId, "fremder-nachweis.pdf", "application/pdf");
    assert.equal(uploadResponse.status, 201);
    const uploadPayload = (await uploadResponse.json()) as { document: { id: string } };

    const response = await request(`/task-state/${encodeURIComponent(targetId)}/complete`, {
      method: "POST",
      cookie,
      body: {
        outcome: "OK",
        attachments: [],
        evidenceDocumentIds: [uploadPayload.document.id]
      }
    });

    assert.equal(response.status, 400);
    const payload = (await response.json()) as { message: string };
    assert.equal(payload.message, "Invalid evidence documents.");
    assert.equal(await prisma.taskStateEntry.findUnique({ where: { taskInstanceId: targetId } }), null);
  });

  it("rejects completion with an archived server-side evidence document", async () => {
    const user = await createUser("task-state-server-doc-archived-reject@example.com", "ValidPassword1!");
    const obligation = await seedObligation({ requireDocument: true }, user.id);
    const cookie = await login(user.email, "ValidPassword1!");
    const id = taskInstanceId(obligation.id);

    const uploadResponse = await uploadEvidenceDocument(cookie, id, "archivierter-nachweis.pdf", "application/pdf");
    assert.equal(uploadResponse.status, 201);
    const uploadPayload = (await uploadResponse.json()) as { document: { id: string } };
    await prisma.document.update({
      where: {
        id: uploadPayload.document.id
      },
      data: {
        isArchived: true
      }
    });

    const response = await request(`/task-state/${encodeURIComponent(id)}/complete`, {
      method: "POST",
      cookie,
      body: {
        outcome: "OK",
        attachments: [],
        evidenceDocumentIds: [uploadPayload.document.id]
      }
    });

    assert.equal(response.status, 400);
    const payload = (await response.json()) as { message: string };
    assert.equal(payload.message, "Invalid evidence documents.");
    assert.equal(await prisma.taskStateEntry.findUnique({ where: { taskInstanceId: id } }), null);
  });

  it("rejects completion with an evidence document id from the wrong owner type", async () => {
    const user = await createUser("task-state-server-doc-owner-type-reject@example.com", "ValidPassword1!");
    const obligation = await seedObligation({ requireDocument: true }, user.id);
    const cookie = await login(user.email, "ValidPassword1!");
    const id = taskInstanceId(obligation.id);

    const wrongOwnerDocument = await prisma.document.create({
      data: {
        ownerType: "PROJECT",
        ownerId: id,
        filename: "wrong-owner-type.pdf",
        originalFilename: "wrong-owner-type.pdf",
        mimeType: "application/pdf",
        sizeBytes: 12,
        storagePath: "documents/test/wrong-owner-type.pdf",
        sha256: "wrong-owner-type"
      }
    });

    const response = await request(`/task-state/${encodeURIComponent(id)}/complete`, {
      method: "POST",
      cookie,
      body: {
        outcome: "OK",
        attachments: [],
        evidenceDocumentIds: [wrongOwnerDocument.id]
      }
    });

    assert.equal(response.status, 400);
    const payload = (await response.json()) as { message: string };
    assert.equal(payload.message, "Invalid evidence documents.");
    assert.equal(await prisma.taskStateEntry.findUnique({ where: { taskInstanceId: id } }), null);
  });

  it("rejects completion when a required document is missing", async () => {
    const user = await createUser("task-state-reject@example.com", "ValidPassword1!");
    const obligation = await seedObligation({ requireDocument: true }, user.id);
    const cookie = await login(user.email, "ValidPassword1!");
    const id = taskInstanceId(obligation.id);

    const response = await request(`/task-state/${encodeURIComponent(id)}/complete`, {
      method: "POST",
      cookie,
      body: {
        outcome: "OK",
        attachments: [attachment("PHOTO", "foto.jpg", "image/jpeg")]
      }
    });

    assert.equal(response.status, 400);
    const payload = (await response.json()) as { missingAttachmentKinds: string[] };
    assert.deepEqual(payload.missingAttachmentKinds, ["DOCUMENT"]);
    assert.equal(await prisma.taskStateEntry.findUnique({ where: { taskInstanceId: id } }), null);
  });

  it("rejects direct DONE status when required evidence is still missing", async () => {
    const user = await createUser("task-state-status-reject@example.com", "ValidPassword1!");
    const obligation = await seedObligation({ requireDocument: true }, user.id);
    const cookie = await login(user.email, "ValidPassword1!");

    const response = await request(`/task-state/${encodeURIComponent(taskInstanceId(obligation.id))}/status`, {
      method: "POST",
      cookie,
      body: {
        status: "DONE"
      }
    });

    assert.equal(response.status, 400);
    const payload = (await response.json()) as { missingAttachmentKinds: string[] };
    assert.deepEqual(payload.missingAttachmentKinds, ["DOCUMENT"]);
  });

  it("allows evidence completion for users with tasks.complete", async () => {
    await createRole("TASK_COMPLETE_ONLY", ["tasks.view", "tasks.complete"]);
    const user = await createUser("task-state-evidence-complete@example.com", "ValidPassword1!", "TASK_COMPLETE_ONLY");
    const obligation = await seedObligation({}, user.id);
    const cookie = await login(user.email, "ValidPassword1!");
    const id = taskInstanceId(obligation.id);

    const response = await request(`/task-state/${encodeURIComponent(id)}/evidence`, {
      method: "POST",
      cookie,
      body: {
        outcome: "OK",
        note: "Nachweis eingereicht"
      }
    });

    assert.equal(response.status, 200);
    const payload = (await response.json()) as { taskStateEntry: { status: string; completedByUserId?: string } };
    assert.equal(payload.taskStateEntry.status, "DONE");
    assert.equal(payload.taskStateEntry.completedByUserId, user.id);
  });

  it("rejects evidence completion for users with tasks.edit but without tasks.complete", async () => {
    await createRole("TASK_EDIT_ONLY", ["tasks.view", "tasks.edit"]);
    const user = await createUser("task-state-evidence-edit-only@example.com", "ValidPassword1!", "TASK_EDIT_ONLY");
    const obligation = await seedObligation({}, user.id);
    const cookie = await login(user.email, "ValidPassword1!");
    const id = taskInstanceId(obligation.id);

    const response = await request(`/task-state/${encodeURIComponent(id)}/evidence`, {
      method: "POST",
      cookie,
      body: {
        outcome: "OK",
        note: "Should be blocked"
      }
    });

    assert.equal(response.status, 403);

    const trailingSlashResponse = await request(`/task-state/${encodeURIComponent(id)}/evidence/`, {
      method: "POST",
      cookie,
      body: {
        outcome: "OK",
        note: "Should be blocked"
      }
    });

    assert.equal(trailingSlashResponse.status, 403);
    assert.equal(await prisma.taskStateEntry.findUnique({ where: { taskInstanceId: id } }), null);
  });

  it("keeps complete and DONE status protected while allowing edit-only reopen", async () => {
    await createRole("TASK_EDIT_REOPEN_ONLY", ["tasks.view", "tasks.edit"]);
    const user = await createUser("task-state-edit-only-reopen@example.com", "ValidPassword1!", "TASK_EDIT_REOPEN_ONLY");
    const obligation = await seedObligation({}, user.id);
    const cookie = await login(user.email, "ValidPassword1!");
    const id = taskInstanceId(obligation.id);

    const completeResponse = await request(`/task-state/${encodeURIComponent(id)}/complete`, {
      method: "POST",
      cookie,
      body: {
        outcome: "OK",
        note: "Should be blocked"
      }
    });
    assert.equal(completeResponse.status, 403);

    const trailingSlashCompleteResponse = await request(`/task-state/${encodeURIComponent(id)}/complete/`, {
      method: "POST",
      cookie,
      body: {
        outcome: "OK",
        note: "Should be blocked"
      }
    });
    assert.equal(trailingSlashCompleteResponse.status, 403);

    const openResponse = await request(`/task-state/${encodeURIComponent(id)}/status`, {
      method: "POST",
      cookie,
      body: {
        status: "OPEN"
      }
    });
    assert.equal(openResponse.status, 200);
    const openPayload = (await openResponse.json()) as { taskStateEntry: { status: string } };
    assert.equal(openPayload.taskStateEntry.status, "OPEN");

    const trailingSlashOpenResponse = await request(`/task-state/${encodeURIComponent(id)}/status/`, {
      method: "POST",
      cookie,
      body: {
        status: "OPEN"
      }
    });
    assert.equal(trailingSlashOpenResponse.status, 200);
    const trailingSlashOpenPayload = (await trailingSlashOpenResponse.json()) as { taskStateEntry: { status: string } };
    assert.equal(trailingSlashOpenPayload.taskStateEntry.status, "OPEN");

    const inProgressResponse = await request(`/task-state/${encodeURIComponent(id)}/status`, {
      method: "POST",
      cookie,
      body: {
        status: "IN_PROGRESS"
      }
    });
    assert.equal(inProgressResponse.status, 200);
    const inProgressPayload = (await inProgressResponse.json()) as { taskStateEntry: { status: string } };
    assert.equal(inProgressPayload.taskStateEntry.status, "IN_PROGRESS");

    const trailingSlashInProgressResponse = await request(`/task-state/${encodeURIComponent(id)}/status/`, {
      method: "POST",
      cookie,
      body: {
        status: "IN_PROGRESS"
      }
    });
    assert.equal(trailingSlashInProgressResponse.status, 200);
    const trailingSlashInProgressPayload = (await trailingSlashInProgressResponse.json()) as {
      taskStateEntry: { status: string };
    };
    assert.equal(trailingSlashInProgressPayload.taskStateEntry.status, "IN_PROGRESS");

    const statusResponse = await request(`/task-state/${encodeURIComponent(id)}/status`, {
      method: "POST",
      cookie,
      body: {
        status: "DONE"
      }
    });
    assert.equal(statusResponse.status, 403);

    const trailingSlashStatusResponse = await request(`/task-state/${encodeURIComponent(id)}/status/`, {
      method: "POST",
      cookie,
      body: {
        status: "DONE"
      }
    });
    assert.equal(trailingSlashStatusResponse.status, 403);

    await prisma.taskStateEntry.update({
      where: {
        taskInstanceId: id
      },
      data: {
        status: "DONE",
        completedAt: new Date(),
        completedByUserId: user.id,
        completedByLabel: "Task Tester",
        evidence: []
      }
    });

    const reopenResponse = await request(`/task-state/${encodeURIComponent(id)}/reopen`, {
      method: "POST",
      cookie
    });
    assert.equal(reopenResponse.status, 200);
    const payload = (await reopenResponse.json()) as { taskStateEntry: { status: string } };
    assert.equal(payload.taskStateEntry.status, "OPEN");
  });

  it("uses tasks.complete for DONE status and keeps non-DONE status on tasks.edit", async () => {
    await createRole("TASK_COMPLETE_STATUS_ONLY", ["tasks.view", "tasks.complete"]);
    const user = await createUser("task-state-complete-status-only@example.com", "ValidPassword1!", "TASK_COMPLETE_STATUS_ONLY");
    const obligation = await seedObligation({}, user.id);
    const cookie = await login(user.email, "ValidPassword1!");
    const id = taskInstanceId(obligation.id);

    const openResponse = await request(`/task-state/${encodeURIComponent(id)}/status`, {
      method: "POST",
      cookie,
      body: {
        status: "OPEN"
      }
    });
    assert.equal(openResponse.status, 403);

    const trailingSlashOpenResponse = await request(`/task-state/${encodeURIComponent(id)}/status/`, {
      method: "POST",
      cookie,
      body: {
        status: "OPEN"
      }
    });
    assert.equal(trailingSlashOpenResponse.status, 403);

    const doneResponse = await request(`/task-state/${encodeURIComponent(id)}/status`, {
      method: "POST",
      cookie,
      body: {
        status: "DONE"
      }
    });
    assert.equal(doneResponse.status, 200);
    const donePayload = (await doneResponse.json()) as { taskStateEntry: { status: string; completedByUserId?: string } };
    assert.equal(donePayload.taskStateEntry.status, "DONE");
    assert.equal(donePayload.taskStateEntry.completedByUserId, user.id);

    const trailingSlashDoneResponse = await request(`/task-state/${encodeURIComponent(id)}/status/`, {
      method: "POST",
      cookie,
      body: {
        status: "DONE"
      }
    });
    assert.equal(trailingSlashDoneResponse.status, 200);
    const trailingSlashDonePayload = (await trailingSlashDoneResponse.json()) as {
      taskStateEntry: { status: string; completedByUserId?: string };
    };
    assert.equal(trailingSlashDonePayload.taskStateEntry.status, "DONE");
    assert.equal(trailingSlashDonePayload.taskStateEntry.completedByUserId, user.id);
  });

  it("rejects status changes without tasks.edit or tasks.complete", async () => {
    await createRole("TASK_STATUS_NO_WRITE", ["tasks.view"]);
    const user = await createUser("task-state-status-no-write@example.com", "ValidPassword1!", "TASK_STATUS_NO_WRITE");
    const obligation = await seedObligation({}, user.id);
    const cookie = await login(user.email, "ValidPassword1!");
    const id = taskInstanceId(obligation.id);

    for (const status of ["OPEN", "IN_PROGRESS", "DONE"]) {
      for (const statusPath of ["status", "status/"]) {
        const response = await request(`/task-state/${encodeURIComponent(id)}/${statusPath}`, {
          method: "POST",
          cookie,
          body: {
            status
          }
        });
        assert.equal(response.status, 403);
      }
    }

    assert.equal(await prisma.taskStateEntry.findUnique({ where: { taskInstanceId: id } }), null);
  });

  it("keeps external users fail-closed for task-state status changes", async () => {
    const externalOrg = await prisma.externalOrganization.create({
      data: {
        name: "Task State External Org",
        type: "SERVICE_PROVIDER"
      }
    });
    const externalUser = await prisma.user.create({
      data: {
        firstName: "External",
        lastName: "Task",
        email: "task-state-external-status@example.com",
        role: "EXTERNAL",
        type: "EXTERNAL",
        externalOrgId: externalOrg.id,
        passwordHash: await hashPassword("ValidPassword1!")
      }
    });
    const obligation = await seedObligation({});
    const project = await prisma.project.findFirstOrThrow({
      where: {
        legalDocuments: {
          some: {
            obligations: {
              some: {
                id: obligation.id
              }
            }
          }
        }
      },
      select: {
        id: true
      }
    });
    await prisma.projectAccess.create({
      data: {
        projectId: project.id,
        userId: externalUser.id,
        accessRole: "EXTERNAL_EXECUTOR"
      }
    });
    const cookie = await login(externalUser.email, "ValidPassword1!");
    const id = taskInstanceId(obligation.id);

    for (const statusPath of ["status", "status/"]) {
      const response = await request(`/task-state/${encodeURIComponent(id)}/${statusPath}`, {
        method: "POST",
        cookie,
        body: {
          status: "IN_PROGRESS"
        }
      });

      assert.equal(response.status, 403);
    }
    assert.equal(await prisma.taskStateEntry.findUnique({ where: { taskInstanceId: id } }), null);
  });

  it("rejects legacy reconcile attempts that would complete tasks without tasks.complete", async () => {
    await createRole("TASK_EDIT_RECONCILE_ONLY", ["tasks.view", "tasks.edit"]);
    const user = await createUser(
      "task-state-reconcile-edit-only@example.com",
      "ValidPassword1!",
      "TASK_EDIT_RECONCILE_ONLY"
    );
    const obligation = await seedObligation({}, user.id);
    const cookie = await login(user.email, "ValidPassword1!");
    const id = taskInstanceId(obligation.id);

    const response = await request("/task-state/reconcile-legacy", {
      method: "POST",
      cookie,
      body: {
        taskState: {
          [id]: {
            status: "DONE",
            completedAt: "2026-04-29T08:00:00.000Z",
            completedByUserId: user.id,
            completedByLabel: "Task Tester",
            evidence: []
          }
        }
      }
    });

    assert.equal(response.status, 403);
    assert.equal(await prisma.taskStateEntry.findUnique({ where: { taskInstanceId: id } }), null);
  });
});
