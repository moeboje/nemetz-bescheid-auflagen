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

describe("Comments API", () => {
  before(async () => {
    const config: AppConfig = {
      port: 0,
      databaseUrl: resolveDatabaseUrl(process.env, "test"),
      appOrigin: "http://localhost:5173",
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
    await prisma.user.deleteMany();
  });

  it("creates comment with first revision", async () => {
    const author = await createUser({
      email: "comment-create@example.com",
      password: "ValidPassword1!"
    });
    const cookie = await login(author.email, "ValidPassword1!");

    const response = await request("/comments", {
      method: "POST",
      cookie,
      body: {
        entityType: "PROJECT",
        entityId: "project-100",
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
    assert.equal(payload.comment.entityId, "project-100");
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
    const cookie = await login(author.email, "ValidPassword1!");

    const createResponse = await request("/comments", {
      method: "POST",
      cookie,
      body: {
        entityType: "LEGAL_DOC",
        entityId: "legal-doc-200",
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
    const cookie = await login(author.email, "ValidPassword1!");

    const createResponse = await request("/comments", {
      method: "POST",
      cookie,
      body: {
        entityType: "PROJECT",
        entityId: "project-201",
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

    const authorCookie = await login(author.email, "ValidPassword1!");
    const otherCookie = await login(other.email, "ValidPassword1!");
    const adminCookie = await login(admin.email, "ValidPassword1!");

    const createResponse = await request("/comments", {
      method: "POST",
      cookie: authorCookie,
      body: {
        entityType: "PROJECT",
        entityId: "project-202",
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
    const cookie = await login(author.email, "ValidPassword1!");

    const firstCreate = await request("/comments", {
      method: "POST",
      cookie,
      body: {
        entityType: "PROJECT",
        entityId: "project-203",
        body: "Erster"
      }
    });
    const firstPayload = (await firstCreate.json()) as { comment: { id: string } };

    const secondCreate = await request("/comments", {
      method: "POST",
      cookie,
      body: {
        entityType: "PROJECT",
        entityId: "project-203",
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

    const listResponse = await request("/comments?entityType=PROJECT&entityId=project-203", {
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

  it("soft delete hides body in list response", async () => {
    const author = await createUser({
      email: "comment-soft-delete@example.com",
      password: "ValidPassword1!"
    });
    const cookie = await login(author.email, "ValidPassword1!");

    const createResponse = await request("/comments", {
      method: "POST",
      cookie,
      body: {
        entityType: "LEGAL_DOC",
        entityId: "legal-doc-204",
        body: "Sensibler Text"
      }
    });
    const created = (await createResponse.json()) as { comment: { id: string } };

    const deleteResponse = await request(`/comments/${created.comment.id}/delete`, {
      method: "POST",
      cookie
    });
    assert.equal(deleteResponse.status, 200);

    const listResponse = await request("/comments?entityType=LEGAL_DOC&entityId=legal-doc-204", {
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
