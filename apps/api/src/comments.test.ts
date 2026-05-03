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

async function createUser(args: { email: string; password: string; role?: string }) {
  return prisma.user.create({
    data: {
      firstName: "Comment",
      lastName: "Tester",
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

async function seedProject(accessUserId?: string, accessRole: "PROJECT_VIEWER" | "PROJECT_EDITOR" = "PROJECT_EDITOR") {
  const company = await prisma.company.create({
    data: {
      name: `Comment Company ${requestCounter}`
    }
  });
  const project = await prisma.project.create({
    data: {
      id: `comment-project-${requestCounter}`,
      title: "Comment Project",
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
      id: `comment-legal-doc-${requestCounter}`,
      projectId,
      type: "NOTICE",
      title: "Comment Legal Doc",
      attachments: []
    }
  });
}

describe("Comments API", () => {
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
    await prisma.commentRevision.deleteMany();
    await prisma.comment.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.document.deleteMany();
    await prisma.legalDocument.deleteMany();
    await prisma.project.deleteMany();
    await prisma.company.deleteMany();
    await prisma.user.deleteMany();
    await prisma.role.deleteMany();
  });

  it("creates comment with first revision", async () => {
    const author = await createUser({
      email: "comment-create@example.com",
      password: "ValidPassword1!"
    });
    const project = await seedProject(author.id);
    const cookie = await login(author.email, "ValidPassword1!");

    const response = await request("/comments", {
      method: "POST",
      cookie,
      body: {
        entityType: "PROJECT",
        entityId: project.id,
        body: "Erste Notiz"
      }
    });

    assert.equal(response.status, 201);
    const payload = (await response.json()) as {
      ok: boolean;
      comment: {
        id: string;
        entityType: string;
        entityId: string;
        body: string;
        isEdited: boolean;
        isDeleted: boolean;
      };
    };

    assert.equal(payload.ok, true);
    assert.equal(payload.comment.entityType, "PROJECT");
    assert.equal(payload.comment.entityId, project.id);
    assert.equal(payload.comment.body, "Erste Notiz");
    assert.equal(payload.comment.isEdited, false);
    assert.equal(payload.comment.isDeleted, false);

    const revisions = await prisma.commentRevision.findMany({
      where: {
        commentId: payload.comment.id
      },
      orderBy: {
        revisionNo: "asc"
      }
    });

    assert.equal(revisions.length, 1);
    assert.equal(revisions[0]?.revisionNo, 1);
    assert.equal(revisions[0]?.body, "Erste Notiz");
  });

  it("editing comment creates revision 2", async () => {
    const author = await createUser({
      email: "comment-edit@example.com",
      password: "ValidPassword1!"
    });
    const project = await seedProject(author.id);
    const legalDoc = await seedLegalDocument(project.id);
    const cookie = await login(author.email, "ValidPassword1!");

    const createResponse = await request("/comments", {
      method: "POST",
      cookie,
      body: {
        entityType: "LEGAL_DOC",
        entityId: legalDoc.id,
        body: "Version 1"
      }
    });
    const created = (await createResponse.json()) as { comment: { id: string } };

    const editResponse = await request(`/comments/${created.comment.id}`, {
      method: "PATCH",
      cookie,
      body: {
        body: "Version 2"
      }
    });

    assert.equal(editResponse.status, 200);
    const editPayload = (await editResponse.json()) as {
      revisionNo: number;
      comment: { isEdited: boolean; body: string };
    };
    assert.equal(editPayload.revisionNo, 2);
    assert.equal(editPayload.comment.isEdited, true);
    assert.equal(editPayload.comment.body, "Version 2");

    const revisionsResponse = await request(`/comments/${created.comment.id}/revisions`, {
      cookie
    });
    assert.equal(revisionsResponse.status, 200);
    const revisionsPayload = (await revisionsResponse.json()) as {
      items: Array<{ revisionNo: number; body: string }>;
    };

    assert.equal(revisionsPayload.items.length, 2);
    assert.equal(revisionsPayload.items[0]?.revisionNo, 1);
    assert.equal(revisionsPayload.items[0]?.body, "Version 1");
    assert.equal(revisionsPayload.items[1]?.revisionNo, 2);
    assert.equal(revisionsPayload.items[1]?.body, "Version 2");
  });

  it("cannot edit deleted comments", async () => {
    const author = await createUser({
      email: "comment-edit-deleted@example.com",
      password: "ValidPassword1!"
    });
    const project = await seedProject(author.id);
    const cookie = await login(author.email, "ValidPassword1!");

    const createResponse = await request("/comments", {
      method: "POST",
      cookie,
      body: {
        entityType: "PROJECT",
        entityId: project.id,
        body: "Wird geloescht"
      }
    });
    const created = (await createResponse.json()) as { comment: { id: string } };

    const deleteResponse = await request(`/comments/${created.comment.id}/delete`, {
      method: "POST",
      cookie
    });
    assert.equal(deleteResponse.status, 200);

    const editResponse = await request(`/comments/${created.comment.id}`, {
      method: "PATCH",
      cookie,
      body: {
        body: "Darf nicht gespeichert werden"
      }
    });

    assert.equal(editResponse.status, 400);
  });

  it("non-author cannot edit but admin can", async () => {
    const author = await createUser({
      email: "comment-owner@example.com",
      password: "ValidPassword1!"
    });
    const other = await createUser({
      email: "comment-other@example.com",
      password: "ValidPassword1!"
    });
    const admin = await createUser({
      email: "comment-admin@example.com",
      password: "ValidPassword1!",
      role: "ADMIN"
    });
    const project = await seedProject(author.id);

    const authorCookie = await login(author.email, "ValidPassword1!");
    const otherCookie = await login(other.email, "ValidPassword1!");
    const adminCookie = await login(admin.email, "ValidPassword1!");

    const createResponse = await request("/comments", {
      method: "POST",
      cookie: authorCookie,
      body: {
        entityType: "PROJECT",
        entityId: project.id,
        body: "Autor Kommentar"
      }
    });
    const created = (await createResponse.json()) as { comment: { id: string } };

    const forbiddenEdit = await request(`/comments/${created.comment.id}`, {
      method: "PATCH",
      cookie: otherCookie,
      body: {
        body: "Fremde Aenderung"
      }
    });
    assert.equal(forbiddenEdit.status, 403);

    const adminEdit = await request(`/comments/${created.comment.id}`, {
      method: "PATCH",
      cookie: adminCookie,
      body: {
        body: "Admin Aenderung"
      }
    });
    assert.equal(adminEdit.status, 200);
  });

  it("listing returns comments in chronological order", async () => {
    const author = await createUser({
      email: "comment-list@example.com",
      password: "ValidPassword1!"
    });
    const project = await seedProject(author.id);
    const cookie = await login(author.email, "ValidPassword1!");

    const firstCreate = await request("/comments", {
      method: "POST",
      cookie,
      body: {
        entityType: "PROJECT",
        entityId: project.id,
        body: "Erster"
      }
    });
    const firstPayload = (await firstCreate.json()) as { comment: { id: string } };

    const secondCreate = await request("/comments", {
      method: "POST",
      cookie,
      body: {
        entityType: "PROJECT",
        entityId: project.id,
        body: "Zweiter"
      }
    });
    const secondPayload = (await secondCreate.json()) as { comment: { id: string } };

    await prisma.comment.update({
      where: {
        id: firstPayload.comment.id
      },
      data: {
        createdAt: new Date("2026-01-01T10:00:00.000Z")
      }
    });
    await prisma.comment.update({
      where: {
        id: secondPayload.comment.id
      },
      data: {
        createdAt: new Date("2026-01-01T11:00:00.000Z")
      }
    });

    const listResponse = await request(`/comments?entityType=PROJECT&entityId=${encodeURIComponent(project.id)}`, {
      cookie
    });

    assert.equal(listResponse.status, 200);
    const payload = (await listResponse.json()) as {
      items: Array<{ id: string; body: string }>;
    };
    assert.equal(payload.items.length, 2);
    assert.equal(payload.items[0]?.id, firstPayload.comment.id);
    assert.equal(payload.items[0]?.body, "Erster");
    assert.equal(payload.items[1]?.id, secondPayload.comment.id);
    assert.equal(payload.items[1]?.body, "Zweiter");
  });

  it("rejects invalid entityType", async () => {
    const author = await createUser({
      email: "comment-invalid-entity@example.com",
      password: "ValidPassword1!"
    });
    const cookie = await login(author.email, "ValidPassword1!");

    const response = await request("/comments", {
      method: "POST",
      cookie,
      body: {
        entityType: "TASK",
        entityId: "task-1",
        body: "ungueltig"
      }
    });

    assert.equal(response.status, 400);
  });

  it("requires the commented domain read permission in addition to project access", async () => {
    await createRole("COMMENT_PROJECT_ONLY", ["projects.view"]);
    await createRole("COMMENT_LEGAL_DOC_READER", ["legalDocs.view"]);

    const author = await createUser({
      email: "comment-domain-author@example.com",
      password: "ValidPassword1!"
    });
    const projectOnlyUser = await createUser({
      email: "comment-project-only@example.com",
      password: "ValidPassword1!",
      role: "COMMENT_PROJECT_ONLY"
    });
    const legalDocReader = await createUser({
      email: "comment-legal-reader@example.com",
      password: "ValidPassword1!",
      role: "COMMENT_LEGAL_DOC_READER"
    });
    const project = await seedProject(author.id);
    const legalDoc = await seedLegalDocument(project.id);
    await prisma.projectAccess.createMany({
      data: [
        {
          projectId: project.id,
          userId: projectOnlyUser.id,
          accessRole: "PROJECT_VIEWER"
        },
        {
          projectId: project.id,
          userId: legalDocReader.id,
          accessRole: "PROJECT_VIEWER"
        }
      ]
    });
    const authorCookie = await login(author.email, "ValidPassword1!");
    const projectOnlyCookie = await login(projectOnlyUser.email, "ValidPassword1!");
    const legalDocReaderCookie = await login(legalDocReader.email, "ValidPassword1!");

    const createResponse = await request("/comments", {
      method: "POST",
      cookie: authorCookie,
      body: {
        entityType: "LEGAL_DOC",
        entityId: legalDoc.id,
        body: "Legal doc domain comment"
      }
    });
    assert.equal(createResponse.status, 201);

    const projectOnlyList = await request(`/comments?entityType=LEGAL_DOC&entityId=${encodeURIComponent(legalDoc.id)}`, {
      cookie: projectOnlyCookie
    });
    assert.equal(projectOnlyList.status, 403);

    const legalDocReaderList = await request(`/comments?entityType=LEGAL_DOC&entityId=${encodeURIComponent(legalDoc.id)}`, {
      cookie: legalDocReaderCookie
    });
    assert.equal(legalDocReaderList.status, 200);
    const payload = (await legalDocReaderList.json()) as { items: Array<{ body: string }> };
    assert.equal(payload.items.length, 1);
    assert.equal(payload.items[0]?.body, "Legal doc domain comment");
  });

  it("requires project write access for comment mutations", async () => {
    await createRole("COMMENT_LEGAL_READER_WRITE_SCOPE", ["legalDocs.view"]);
    await createRole("COMMENT_LEGAL_EDITOR_WRITE_SCOPE", ["legalDocs.view", "legalDocs.edit"]);
    await createRole("COMMENT_LEGAL_GLOBAL_READER_WRITE_SCOPE", [
      "projects.viewAll",
      "legalDocs.view",
      "legalDocs.edit"
    ]);
    await createRole("COMMENT_LEGAL_GLOBAL_WRITER_WRITE_SCOPE", [
      "projects.viewAll",
      "projects.edit",
      "legalDocs.view",
      "legalDocs.edit"
    ]);

    const reader = await createUser({
      email: "comment-write-reader@example.com",
      password: "ValidPassword1!",
      role: "COMMENT_LEGAL_READER_WRITE_SCOPE"
    });
    const domainEditorViewer = await createUser({
      email: "comment-write-domain-editor-viewer@example.com",
      password: "ValidPassword1!",
      role: "COMMENT_LEGAL_EDITOR_WRITE_SCOPE"
    });
    const domainEditorWriter = await createUser({
      email: "comment-write-domain-editor-writer@example.com",
      password: "ValidPassword1!",
      role: "COMMENT_LEGAL_EDITOR_WRITE_SCOPE"
    });
    const globalDomainEditorReader = await createUser({
      email: "comment-write-global-reader@example.com",
      password: "ValidPassword1!",
      role: "COMMENT_LEGAL_GLOBAL_READER_WRITE_SCOPE"
    });
    const globalDomainEditorWriter = await createUser({
      email: "comment-write-global-writer@example.com",
      password: "ValidPassword1!",
      role: "COMMENT_LEGAL_GLOBAL_WRITER_WRITE_SCOPE"
    });
    const project = await seedProject();
    const legalDoc = await seedLegalDocument(project.id);
    await prisma.projectAccess.createMany({
      data: [
        {
          projectId: project.id,
          userId: reader.id,
          accessRole: "PROJECT_VIEWER"
        },
        {
          projectId: project.id,
          userId: domainEditorViewer.id,
          accessRole: "PROJECT_VIEWER"
        },
        {
          projectId: project.id,
          userId: domainEditorWriter.id,
          accessRole: "PROJECT_EDITOR"
        }
      ]
    });

    const readerCookie = await login(reader.email, "ValidPassword1!");
    const domainEditorViewerCookie = await login(domainEditorViewer.email, "ValidPassword1!");
    const domainEditorWriterCookie = await login(domainEditorWriter.email, "ValidPassword1!");
    const globalDomainEditorReaderCookie = await login(globalDomainEditorReader.email, "ValidPassword1!");
    const globalDomainEditorWriterCookie = await login(globalDomainEditorWriter.email, "ValidPassword1!");

    const firstCreate = await request("/comments", {
      method: "POST",
      cookie: domainEditorWriterCookie,
      body: {
        entityType: "LEGAL_DOC",
        entityId: legalDoc.id,
        body: "Writable comment"
      }
    });
    assert.equal(firstCreate.status, 201);
    const firstCreated = (await firstCreate.json()) as { comment: { id: string } };

    const readerList = await request(`/comments?entityType=LEGAL_DOC&entityId=${encodeURIComponent(legalDoc.id)}`, {
      cookie: readerCookie
    });
    assert.equal(readerList.status, 200);
    const readerPayload = (await readerList.json()) as { items: Array<{ id: string }> };
    assert.equal(readerPayload.items.length, 1);

    const globalReaderList = await request(`/comments?entityType=LEGAL_DOC&entityId=${encodeURIComponent(legalDoc.id)}`, {
      cookie: globalDomainEditorReaderCookie
    });
    assert.equal(globalReaderList.status, 200);
    const globalReaderPayload = (await globalReaderList.json()) as { items: Array<{ id: string }> };
    assert.equal(globalReaderPayload.items.length, 1);

    const readerCreate = await request("/comments", {
      method: "POST",
      cookie: readerCookie,
      body: {
        entityType: "LEGAL_DOC",
        entityId: legalDoc.id,
        body: "Reader blocked"
      }
    });
    assert.equal(readerCreate.status, 403);

    const viewerCreate = await request("/comments", {
      method: "POST",
      cookie: domainEditorViewerCookie,
      body: {
        entityType: "LEGAL_DOC",
        entityId: legalDoc.id,
        body: "Viewer blocked"
      }
    });
    assert.equal(viewerCreate.status, 403);

    const globalReaderCreate = await request("/comments", {
      method: "POST",
      cookie: globalDomainEditorReaderCookie,
      body: {
        entityType: "LEGAL_DOC",
        entityId: legalDoc.id,
        body: "Global project read must not write"
      }
    });
    assert.equal(globalReaderCreate.status, 403);

    const globalWriterCreate = await request("/comments", {
      method: "POST",
      cookie: globalDomainEditorWriterCookie,
      body: {
        entityType: "LEGAL_DOC",
        entityId: legalDoc.id,
        body: "Global project write allowed"
      }
    });
    assert.equal(globalWriterCreate.status, 201);

    const globalReaderOwnedComment = await prisma.comment.create({
      data: {
        entityType: "LEGAL_DOC",
        entityId: legalDoc.id,
        authorUserId: globalDomainEditorReader.id,
        body: "Global reader direct comment"
      }
    });
    await prisma.commentRevision.create({
      data: {
        commentId: globalReaderOwnedComment.id,
        revisionNo: 1,
        body: "Global reader direct comment",
        createdByUserId: globalDomainEditorReader.id
      }
    });

    const globalReaderEdit = await request(`/comments/${globalReaderOwnedComment.id}`, {
      method: "PATCH",
      cookie: globalDomainEditorReaderCookie,
      body: {
        body: "Global reader edit blocked"
      }
    });
    assert.equal(globalReaderEdit.status, 403);

    const globalReaderDelete = await request(`/comments/${globalReaderOwnedComment.id}/delete`, {
      method: "POST",
      cookie: globalDomainEditorReaderCookie
    });
    assert.equal(globalReaderDelete.status, 403);

    const allowedEdit = await request(`/comments/${firstCreated.comment.id}`, {
      method: "PATCH",
      cookie: domainEditorWriterCookie,
      body: {
        body: "Writable comment edited"
      }
    });
    assert.equal(allowedEdit.status, 200);

    const allowedDelete = await request(`/comments/${firstCreated.comment.id}/delete`, {
      method: "POST",
      cookie: domainEditorWriterCookie
    });
    assert.equal(allowedDelete.status, 200);

    const secondCreate = await request("/comments", {
      method: "POST",
      cookie: domainEditorWriterCookie,
      body: {
        entityType: "LEGAL_DOC",
        entityId: legalDoc.id,
        body: "Will lose project write access"
      }
    });
    assert.equal(secondCreate.status, 201);
    const secondCreated = (await secondCreate.json()) as { comment: { id: string } };
    await prisma.projectAccess.update({
      where: {
        projectId_userId: {
          projectId: project.id,
          userId: domainEditorWriter.id
        }
      },
      data: {
        accessRole: "PROJECT_VIEWER"
      }
    });

    const forbiddenEdit = await request(`/comments/${secondCreated.comment.id}`, {
      method: "PATCH",
      cookie: domainEditorWriterCookie,
      body: {
        body: "Project viewer edit"
      }
    });
    assert.equal(forbiddenEdit.status, 403);

    const forbiddenDelete = await request(`/comments/${secondCreated.comment.id}/delete`, {
      method: "POST",
      cookie: domainEditorWriterCookie
    });
    assert.equal(forbiddenDelete.status, 403);
  });

  it("checks comment domain permission before resolving entities", async () => {
    await createRole("COMMENT_PROJECT_ONLY_PROBE", ["projects.view"]);
    await createRole("COMMENT_LEGAL_READER_ONLY", ["legalDocs.view"]);

    const author = await createUser({
      email: "comment-probe-author@example.com",
      password: "ValidPassword1!"
    });
    const projectOnlyUser = await createUser({
      email: "comment-probe-project-only@example.com",
      password: "ValidPassword1!",
      role: "COMMENT_PROJECT_ONLY_PROBE"
    });
    const legalReader = await createUser({
      email: "comment-probe-legal-reader@example.com",
      password: "ValidPassword1!",
      role: "COMMENT_LEGAL_READER_ONLY"
    });
    const project = await seedProject(author.id);
    const legalDoc = await seedLegalDocument(project.id);
    await prisma.projectAccess.createMany({
      data: [
        {
          projectId: project.id,
          userId: projectOnlyUser.id,
          accessRole: "PROJECT_VIEWER"
        },
        {
          projectId: project.id,
          userId: legalReader.id,
          accessRole: "PROJECT_VIEWER"
        }
      ]
    });
    const authorCookie = await login(author.email, "ValidPassword1!");
    const projectOnlyCookie = await login(projectOnlyUser.email, "ValidPassword1!");
    const legalReaderCookie = await login(legalReader.email, "ValidPassword1!");

    const missingLegalDocList = await request("/comments?entityType=LEGAL_DOC&entityId=missing-legal-doc", {
      cookie: projectOnlyCookie
    });
    assert.equal(missingLegalDocList.status, 403);

    const legalReaderCreate = await request("/comments", {
      method: "POST",
      cookie: legalReaderCookie,
      body: {
        entityType: "LEGAL_DOC",
        entityId: legalDoc.id,
        body: "Blocked write"
      }
    });
    assert.equal(legalReaderCreate.status, 403);

    const document = await prisma.document.create({
      data: {
        ownerType: "LEGAL_DOC",
        ownerId: "missing-legal-doc-owner",
        filename: "comment-document.pdf",
        mimeType: "application/pdf",
        sizeBytes: 12,
        storagePath: "uploads/comment-document",
        sha256: "comment-document"
      }
    });
    const projectOnlyDocumentComments = await request(`/comments?entityType=DOCUMENT&entityId=${encodeURIComponent(document.id)}`, {
      cookie: projectOnlyCookie
    });
    assert.equal(projectOnlyDocumentComments.status, 403);

    const unsupportedDocument = await prisma.document.create({
      data: {
        ownerType: "UNKNOWN_OWNER",
        ownerId: "missing-owner",
        filename: "unsupported-comment-document.pdf",
        mimeType: "application/pdf",
        sizeBytes: 12,
        storagePath: "uploads/unsupported-comment-document",
        sha256: "unsupported-comment-document"
      }
    });
    const unsupportedDocumentComments = await request(`/comments?entityType=DOCUMENT&entityId=${encodeURIComponent(unsupportedDocument.id)}`, {
      cookie: legalReaderCookie
    });
    assert.equal(unsupportedDocumentComments.status, 403);

    const unsupportedComment = await prisma.comment.create({
      data: {
        entityType: "UNKNOWN_ENTITY",
        entityId: "unknown-entity-id",
        authorUserId: author.id,
        body: "Unsupported"
      }
    });
    const unsupportedRevisions = await request(`/comments/${unsupportedComment.id}/revisions`, {
      cookie: authorCookie
    });
    assert.equal(unsupportedRevisions.status, 403);
  });

  it("soft delete hides body in list response", async () => {
    const author = await createUser({
      email: "comment-soft-delete@example.com",
      password: "ValidPassword1!"
    });
    const project = await seedProject(author.id);
    const legalDoc = await seedLegalDocument(project.id);
    const cookie = await login(author.email, "ValidPassword1!");

    const createResponse = await request("/comments", {
      method: "POST",
      cookie,
      body: {
        entityType: "LEGAL_DOC",
        entityId: legalDoc.id,
        body: "Sensibler Text"
      }
    });
    const created = (await createResponse.json()) as { comment: { id: string } };

    const deleteResponse = await request(`/comments/${created.comment.id}/delete`, {
      method: "POST",
      cookie
    });
    assert.equal(deleteResponse.status, 200);

    const listResponse = await request(`/comments?entityType=LEGAL_DOC&entityId=${encodeURIComponent(legalDoc.id)}`, {
      cookie
    });
    assert.equal(listResponse.status, 200);
    const listPayload = (await listResponse.json()) as {
      items: Array<{ id: string; body: string; isDeleted: boolean }>;
    };

    assert.equal(listPayload.items.length, 1);
    assert.equal(listPayload.items[0]?.id, created.comment.id);
    assert.equal(listPayload.items[0]?.isDeleted, true);
    assert.equal(listPayload.items[0]?.body, "");
  });
});
