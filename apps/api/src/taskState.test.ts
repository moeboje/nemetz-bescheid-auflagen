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

async function createUser(email: string, password: string) {
  return prisma.user.create({
    data: {
      firstName: "Task",
      lastName: "Tester",
      email,
      role: "COMPLIANCE_EDITOR",
      type: "INTERNAL",
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

async function seedObligation(evidenceRequirements: {
  requirePhoto?: boolean;
  requireDocument?: boolean;
  requireReport?: boolean;
}) {
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

  it("accepts completion with photo and report for photo and document requirements", async () => {
    const user = await createUser("task-state-accept@example.com", "ValidPassword1!");
    const obligation = await seedObligation({ requirePhoto: true, requireDocument: true });
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

    assert.equal(response.status, 200);
    const payload = (await response.json()) as {
      taskStateEntry: { status: string; evidence: Array<{ attachments: Array<{ kind: string }> }> };
    };
    assert.equal(payload.taskStateEntry.status, "DONE");
    assert.deepEqual(
      payload.taskStateEntry.evidence[0].attachments.map((item) => item.kind).sort(),
      ["PHOTO", "REPORT"]
    );
  });

  it("rejects completion when a required document is missing", async () => {
    const user = await createUser("task-state-reject@example.com", "ValidPassword1!");
    const obligation = await seedObligation({ requireDocument: true });
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
    const obligation = await seedObligation({ requireDocument: true });
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
});
