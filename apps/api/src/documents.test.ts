import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { once } from "node:events";
import path from "node:path";
import { after, before, beforeEach, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import { createApp } from "./app.js";
import type { AppConfig } from "./config.js";
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
      databaseUrl: process.env.DATABASE_URL || "file:./test.db",
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
    await prisma.auditLog.deleteMany();
    await prisma.document.deleteMany();
    await prisma.user.deleteMany();
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
    const cookie = await login(user.email, "ValidPassword1!");

    const uploadResponse = await uploadDocument(cookie, "PROJECT", "project-1", "permit.pdf");
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
    assert.equal(payload.document.ownerId, "project-1");
    assert.ok(payload.document.id);

    const expectedPath = path.resolve(uploadDir, payload.document.id);
    const stat = await fs.stat(expectedPath);
    assert.equal(stat.isFile(), true);
  });

  it("download returns content with inline headers for pdf", async () => {
    const user = await createUser("docs-download@example.com", "ValidPassword1!");
    const cookie = await login(user.email, "ValidPassword1!");

    const uploadResponse = await uploadDocument(cookie, "LEGAL_DOC", "legal-doc-1", "notice.pdf");
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
    const cookie = await login(user.email, "ValidPassword1!");

    const firstUpload = await uploadDocument(cookie, "PROJECT", "project-list-a", "a.pdf");
    const firstPayload = (await firstUpload.json()) as { document: { id: string } };
    const secondUpload = await uploadDocument(cookie, "PROJECT", "project-list-b", "b.pdf");
    assert.equal(secondUpload.status, 201);

    const response = await request("/documents?ownerType=PROJECT&ownerId=project-list-a", {
      cookie
    });

    assert.equal(response.status, 200);
    const payload = (await response.json()) as { items: Array<{ id: string; ownerId: string }> };

    assert.equal(payload.items.length, 1);
    assert.equal(payload.items[0]?.id, firstPayload.document.id);
    assert.equal(payload.items[0]?.ownerId, "project-list-a");
  });

  it("external users are forbidden from document endpoints", async () => {
    const internalUser = await createUser("docs-internal@example.com", "ValidPassword1!");
    const externalUser = await createUser("docs-external@example.com", "ValidPassword1!", {
      role: "EXTERNAL",
      type: "EXTERNAL"
    });

    const internalCookie = await login(internalUser.email, "ValidPassword1!");
    const externalCookie = await login(externalUser.email, "ValidPassword1!");

    const uploadResponse = await uploadDocument(internalCookie, "PROJECT", "project-authz-1", "authz.pdf");
    assert.equal(uploadResponse.status, 201);
    const uploadPayload = (await uploadResponse.json()) as { document: { id: string } };

    const externalUpload = await uploadDocument(externalCookie, "PROJECT", "project-authz-1", "blocked.pdf");
    assert.equal(externalUpload.status, 403);

    const externalList = await request("/documents?ownerType=PROJECT&ownerId=project-authz-1", {
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
