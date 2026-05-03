import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
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

async function createUser(email: string, password: string, role = "COMPLIANCE_EDITOR") {
  return prisma.user.create({
    data: {
      firstName: "Deadline",
      lastName: "Tester",
      email,
      role,
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

async function seedProject(accessUserId?: string) {
  const company = await prisma.company.create({
    data: {
      name: `Deadline Company ${randomUUID()}`
    }
  });
  const project = await prisma.project.create({
    data: {
      id: `deadline-project-${randomUUID()}`,
      title: "Deadline Project",
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
        accessRole: "PROJECT_EDITOR"
      }
    });
  }

  return project;
}

async function seedDeadline(args: {
  id?: string;
  status?: "OPEN" | "DONE";
  emailReminderEnabled?: boolean;
  emailReminderDaysBefore?: number | null;
  accessUserId?: string;
  projectId?: string;
} = {}) {
  const status = args.status ?? "OPEN";
  const project = args.projectId ? null : args.accessUserId ? await seedProject(args.accessUserId) : null;
  return prisma.deadline.create({
    data: {
      id: args.id ?? `deadline-${randomUUID()}`,
      title: "Deadline permission test",
      dueDate: "2026-05-01",
      status,
      projectId: args.projectId ?? project?.id,
      emailReminderEnabled: args.emailReminderEnabled ?? false,
      emailReminderDaysBefore: args.emailReminderDaysBefore ?? null,
      completedAt: status === "DONE" ? new Date("2026-04-29T10:00:00.000Z") : null,
      evidence: []
    }
  });
}

function deadlinePayload() {
  return {
    title: "Deadline reminder test",
    dueDate: "2026-05-01",
    emailReminderEnabled: false
  };
}

describe("Deadlines API", () => {
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
    await prisma.notificationDeliveryAttempt.deleteMany();
    await prisma.notificationOutbox.deleteMany();
    await prisma.session.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.taskStateEntry.deleteMany();
    await prisma.deadline.deleteMany();
    await prisma.legalDocument.deleteMany();
    await prisma.project.deleteMany();
    await prisma.company.deleteMany();
    await prisma.user.deleteMany();
    await prisma.externalOrganization.deleteMany();
    await prisma.role.deleteMany();
  });

  it("requires deadlines.view in addition to project access for reads", async () => {
    await createRole("DEADLINE_PROJECT_ONLY", ["projects.view"]);
    await createRole("DEADLINE_READER_ONLY", ["deadlines.view"]);

    const projectOnlyUser = await createUser(
      "deadline-project-only@example.com",
      "ValidPassword1!",
      "DEADLINE_PROJECT_ONLY"
    );
    const deadlineReader = await createUser(
      "deadline-reader-only@example.com",
      "ValidPassword1!",
      "DEADLINE_READER_ONLY"
    );
    const domainNoAccessUser = await createUser(
      "deadline-reader-no-access@example.com",
      "ValidPassword1!",
      "DEADLINE_READER_ONLY"
    );
    const firstProject = await seedProject();
    const secondProject = await seedProject();
    const firstDeadline = await seedDeadline({
      id: "deadline-domain-first",
      projectId: firstProject.id
    });
    const secondDeadline = await seedDeadline({
      id: "deadline-domain-second",
      projectId: secondProject.id
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
          userId: deadlineReader.id,
          accessRole: "PROJECT_VIEWER"
        }
      ]
    });

    const projectOnlyCookie = await login(projectOnlyUser.email, "ValidPassword1!");
    const deadlineReaderCookie = await login(deadlineReader.email, "ValidPassword1!");
    const domainNoAccessCookie = await login(domainNoAccessUser.email, "ValidPassword1!");

    const projectOnlyList = await request("/deadlines", { cookie: projectOnlyCookie });
    assert.equal(projectOnlyList.status, 200);
    assert.deepEqual(await projectOnlyList.json(), []);
    const projectOnlyDetail = await request(`/deadlines/${firstDeadline.id}`, { cookie: projectOnlyCookie });
    assert.equal(projectOnlyDetail.status, 403);
    const projectOnlyMissingDetail = await request("/deadlines/does-not-exist", { cookie: projectOnlyCookie });
    assert.equal(projectOnlyMissingDetail.status, 403);

    const scopedList = await request("/deadlines", { cookie: deadlineReaderCookie });
    assert.equal(scopedList.status, 200);
    const scopedPayload = (await scopedList.json()) as Array<{ id: string }>;
    assert.deepEqual(scopedPayload.map((entry) => entry.id), [firstDeadline.id]);
    const hiddenDetail = await request(`/deadlines/${secondDeadline.id}`, { cookie: deadlineReaderCookie });
    assert.equal(hiddenDetail.status, 403);

    const domainNoAccessList = await request("/deadlines", { cookie: domainNoAccessCookie });
    assert.equal(domainNoAccessList.status, 200);
    assert.deepEqual(await domainNoAccessList.json(), []);
  });

  it("rejects deadline completion for deadlines.create without tasks.complete", async () => {
    await createRole("DEADLINE_CREATE_ONLY", ["deadlines.view", "deadlines.create"]);
    const user = await createUser(
      "deadline-create-only@example.com",
      "ValidPassword1!",
      "DEADLINE_CREATE_ONLY"
    );
    const deadline = await seedDeadline({ accessUserId: user.id });
    const cookie = await login(user.email, "ValidPassword1!");

    const completeResponse = await request(`/deadlines/${deadline.id}/complete`, {
      method: "POST",
      cookie,
      body: {
        note: "Should be blocked"
      }
    });
    assert.equal(completeResponse.status, 403);

    const statusResponse = await request(`/deadlines/${deadline.id}/status`, {
      method: "POST",
      cookie,
      body: {
        status: "DONE"
      }
    });
    assert.equal(statusResponse.status, 403);

    const stored = await prisma.deadline.findUniqueOrThrow({ where: { id: deadline.id } });
    assert.equal(stored.status, "OPEN");
    assert.equal(stored.completedAt, null);
  });

  it("allows deadline completion for tasks.complete without deadlines.create", async () => {
    await createRole("DEADLINE_TASK_COMPLETE", ["deadlines.view", "tasks.complete"]);
    const user = await createUser(
      "deadline-task-complete@example.com",
      "ValidPassword1!",
      "DEADLINE_TASK_COMPLETE"
    );
    const completeDeadline = await seedDeadline({ accessUserId: user.id });
    const statusDeadline = await seedDeadline({ accessUserId: user.id });
    const cookie = await login(user.email, "ValidPassword1!");

    const completeResponse = await request(`/deadlines/${completeDeadline.id}/complete`, {
      method: "POST",
      cookie,
      body: {
        note: "Done"
      }
    });
    assert.equal(completeResponse.status, 200);
    const completePayload = (await completeResponse.json()) as { deadline: { status: string } };
    assert.equal(completePayload.deadline.status, "DONE");

    const statusResponse = await request(`/deadlines/${statusDeadline.id}/status`, {
      method: "POST",
      cookie,
      body: {
        status: "DONE"
      }
    });
    assert.equal(statusResponse.status, 200);
    const statusPayload = (await statusResponse.json()) as { deadline: { status: string } };
    assert.equal(statusPayload.deadline.status, "DONE");
  });

  it("uses tasks.edit for deadline reopen and non-DONE status changes", async () => {
    await createRole("DEADLINE_TASK_EDIT", ["deadlines.view", "tasks.edit"]);
    const user = await createUser("deadline-task-edit@example.com", "ValidPassword1!", "DEADLINE_TASK_EDIT");
    const reopenDeadline = await seedDeadline({ status: "DONE", accessUserId: user.id });
    const statusDeadline = await seedDeadline({ status: "DONE", accessUserId: user.id });
    const cookie = await login(user.email, "ValidPassword1!");

    const reopenResponse = await request(`/deadlines/${reopenDeadline.id}/reopen`, {
      method: "POST",
      cookie
    });
    assert.equal(reopenResponse.status, 200);
    const reopenPayload = (await reopenResponse.json()) as { deadline: { status: string } };
    assert.equal(reopenPayload.deadline.status, "OPEN");

    const statusResponse = await request(`/deadlines/${statusDeadline.id}/status`, {
      method: "POST",
      cookie,
      body: {
        status: "OPEN"
      }
    });
    assert.equal(statusResponse.status, 200);
    const statusPayload = (await statusResponse.json()) as { deadline: { status: string } };
    assert.equal(statusPayload.deadline.status, "OPEN");
  });

  it("rejects deadline reopen without tasks.edit", async () => {
    await createRole("DEADLINE_TASK_COMPLETE_ONLY", ["deadlines.view", "tasks.complete"]);
    const user = await createUser(
      "deadline-no-reopen@example.com",
      "ValidPassword1!",
      "DEADLINE_TASK_COMPLETE_ONLY"
    );
    const reopenDeadline = await seedDeadline({ status: "DONE", accessUserId: user.id });
    const statusDeadline = await seedDeadline({ status: "DONE", accessUserId: user.id });
    const cookie = await login(user.email, "ValidPassword1!");

    const reopenResponse = await request(`/deadlines/${reopenDeadline.id}/reopen`, {
      method: "POST",
      cookie
    });
    assert.equal(reopenResponse.status, 403);

    const statusResponse = await request(`/deadlines/${statusDeadline.id}/status`, {
      method: "POST",
      cookie,
      body: {
        status: "OPEN"
      }
    });
    assert.equal(statusResponse.status, 403);

    const stored = await prisma.deadline.findUniqueOrThrow({ where: { id: statusDeadline.id } });
    assert.equal(stored.status, "DONE");
  });

  it("rejects generic deadline patch completion for deadlines.edit without tasks.complete", async () => {
    await createRole("DEADLINE_PATCH_EDIT_ONLY", ["deadlines.view", "deadlines.edit"]);
    const user = await createUser(
      "deadline-patch-no-complete@example.com",
      "ValidPassword1!",
      "DEADLINE_PATCH_EDIT_ONLY"
    );
    const deadline = await seedDeadline({ accessUserId: user.id });
    const cookie = await login(user.email, "ValidPassword1!");

    const response = await request(`/deadlines/${deadline.id}`, {
      method: "PATCH",
      cookie,
      body: {
        status: "DONE"
      }
    });
    assert.equal(response.status, 403);

    const stored = await prisma.deadline.findUniqueOrThrow({ where: { id: deadline.id } });
    assert.equal(stored.status, "OPEN");
    assert.equal(stored.completedAt, null);
  });

  it("rejects generic deadline patch reopen for deadlines.edit without tasks.edit", async () => {
    await createRole("DEADLINE_PATCH_EDIT_NO_REOPEN", ["deadlines.view", "deadlines.edit"]);
    const user = await createUser(
      "deadline-patch-no-reopen@example.com",
      "ValidPassword1!",
      "DEADLINE_PATCH_EDIT_NO_REOPEN"
    );
    const deadline = await seedDeadline({ status: "DONE", accessUserId: user.id });
    const cookie = await login(user.email, "ValidPassword1!");

    const response = await request(`/deadlines/${deadline.id}`, {
      method: "PATCH",
      cookie,
      body: {
        status: "OPEN"
      }
    });
    assert.equal(response.status, 403);

    const stored = await prisma.deadline.findUniqueOrThrow({ where: { id: deadline.id } });
    assert.equal(stored.status, "DONE");
    assert.ok(stored.completedAt);
  });

  it("allows generic deadline patch completion with deadlines.edit and tasks.complete", async () => {
    await createRole("DEADLINE_PATCH_COMPLETE", [
      "deadlines.view",
      "deadlines.edit",
      "tasks.complete"
    ]);
    const user = await createUser(
      "deadline-patch-complete@example.com",
      "ValidPassword1!",
      "DEADLINE_PATCH_COMPLETE"
    );
    const deadline = await seedDeadline({ accessUserId: user.id });
    const cookie = await login(user.email, "ValidPassword1!");

    const response = await request(`/deadlines/${deadline.id}`, {
      method: "PATCH",
      cookie,
      body: {
        status: "DONE"
      }
    });
    assert.equal(response.status, 200);
    const payload = (await response.json()) as { deadline: { status: string; completedAt?: string } };
    assert.equal(payload.deadline.status, "DONE");
    assert.ok(payload.deadline.completedAt);
  });

  it("allows generic deadline patch reopen with deadlines.edit and tasks.edit", async () => {
    await createRole("DEADLINE_PATCH_REOPEN", ["deadlines.view", "deadlines.edit", "tasks.edit"]);
    const user = await createUser(
      "deadline-patch-reopen@example.com",
      "ValidPassword1!",
      "DEADLINE_PATCH_REOPEN"
    );
    const deadline = await seedDeadline({ status: "DONE", accessUserId: user.id });
    const cookie = await login(user.email, "ValidPassword1!");

    const response = await request(`/deadlines/${deadline.id}`, {
      method: "PATCH",
      cookie,
      body: {
        status: "OPEN"
      }
    });
    assert.equal(response.status, 200);
    const payload = (await response.json()) as {
      deadline: { status: string; completedAt?: string; completedByUserId?: string };
    };
    assert.equal(payload.deadline.status, "OPEN");
    assert.equal(payload.deadline.completedAt, undefined);
    assert.equal(payload.deadline.completedByUserId, undefined);
  });

  it("allows generic deadline patch edits without task permissions when status is omitted", async () => {
    await createRole("DEADLINE_PATCH_NON_STATUS_EDIT", ["deadlines.view", "deadlines.edit"]);
    const user = await createUser(
      "deadline-patch-non-status@example.com",
      "ValidPassword1!",
      "DEADLINE_PATCH_NON_STATUS_EDIT"
    );
    const deadline = await seedDeadline({ accessUserId: user.id });
    const cookie = await login(user.email, "ValidPassword1!");

    const response = await request(`/deadlines/${deadline.id}`, {
      method: "PATCH",
      cookie,
      body: {
        title: "Updated without task permission"
      }
    });
    assert.equal(response.status, 200);
    const payload = (await response.json()) as { deadline: { title: string; status: string } };
    assert.equal(payload.deadline.title, "Updated without task permission");
    assert.equal(payload.deadline.status, "OPEN");
  });

  it("allows generic deadline patch with unchanged status without task permissions", async () => {
    await createRole("DEADLINE_PATCH_SAME_STATUS", ["deadlines.view", "deadlines.edit"]);
    const user = await createUser(
      "deadline-patch-same-status@example.com",
      "ValidPassword1!",
      "DEADLINE_PATCH_SAME_STATUS"
    );
    const deadline = await seedDeadline({ status: "DONE", accessUserId: user.id });
    const cookie = await login(user.email, "ValidPassword1!");

    const response = await request(`/deadlines/${deadline.id}`, {
      method: "PATCH",
      cookie,
      body: {
        title: "Same status update",
        status: "DONE"
      }
    });
    assert.equal(response.status, 200);
    const payload = (await response.json()) as { deadline: { title: string; status: string } };
    assert.equal(payload.deadline.title, "Same status update");
    assert.equal(payload.deadline.status, "DONE");
  });

  it("keeps deadline archive and restore protected by deadlines.archive", async () => {
    await createRole("DEADLINE_ARCHIVER", ["deadlines.view", "deadlines.archive"]);
    const user = await createUser("deadline-archive@example.com", "ValidPassword1!", "DEADLINE_ARCHIVER");
    const deadline = await seedDeadline({ accessUserId: user.id });
    const cookie = await login(user.email, "ValidPassword1!");

    const archiveResponse = await request(`/deadlines/${deadline.id}/archive`, {
      method: "POST",
      cookie
    });
    assert.equal(archiveResponse.status, 200);

    const restoreResponse = await request(`/deadlines/${deadline.id}/restore`, {
      method: "POST",
      cookie
    });
    assert.equal(restoreResponse.status, 200);
  });

  it("keeps normal deadline create and edit permissions unchanged", async () => {
    await createRole("DEADLINE_WRITER", ["deadlines.view", "deadlines.create", "deadlines.edit"]);
    const user = await createUser("deadline-writer@example.com", "ValidPassword1!", "DEADLINE_WRITER");
    const project = await seedProject(user.id);
    const cookie = await login(user.email, "ValidPassword1!");

    const createResponse = await request("/deadlines", {
      method: "POST",
      cookie,
      body: {
        ...deadlinePayload(),
        projectId: project.id
      }
    });
    assert.equal(createResponse.status, 201);
    const createPayload = (await createResponse.json()) as { deadline: { id: string; title: string } };
    assert.equal(createPayload.deadline.title, "Deadline reminder test");

    const updateResponse = await request(`/deadlines/${createPayload.deadline.id}`, {
      method: "PATCH",
      cookie,
      body: {
        title: "Updated deadline"
      }
    });
    assert.equal(updateResponse.status, 200);
    const updatePayload = (await updateResponse.json()) as { deadline: { title: string } };
    assert.equal(updatePayload.deadline.title, "Updated deadline");
  });

  it("persists deadline reminder day 0 and keeps the existing default for missing values", async () => {
    const admin = await createUser("deadline-reminder@example.com", "ValidPassword1!", "ADMIN");
    const cookie = await login(admin.email, "ValidPassword1!");

    const createResponse = await request("/deadlines", {
      method: "POST",
      cookie,
      body: {
        ...deadlinePayload(),
        emailReminderEnabled: true,
        emailReminderDaysBefore: 0
      }
    });
    assert.equal(createResponse.status, 201);
    const createPayload = (await createResponse.json()) as {
      deadline: { id: string; emailReminderDaysBefore?: number };
    };
    assert.equal(createPayload.deadline.emailReminderDaysBefore, 0);

    const detailResponse = await request(`/deadlines/${createPayload.deadline.id}`, {
      cookie
    });
    assert.equal(detailResponse.status, 200);
    const detailPayload = (await detailResponse.json()) as {
      deadline: { emailReminderDaysBefore?: number };
    };
    assert.equal(detailPayload.deadline.emailReminderDaysBefore, 0);

    const listResponse = await request("/deadlines", {
      cookie
    });
    assert.equal(listResponse.status, 200);
    const listPayload = (await listResponse.json()) as Array<{ id: string; emailReminderDaysBefore?: number }>;
    assert.equal(
      listPayload.find((deadline) => deadline.id === createPayload.deadline.id)?.emailReminderDaysBefore,
      0
    );

    const seeded = await seedDeadline({
      emailReminderEnabled: true,
      emailReminderDaysBefore: 7
    });
    const updateResponse = await request(`/deadlines/${seeded.id}`, {
      method: "PATCH",
      cookie,
      body: {
        emailReminderDaysBefore: 0
      }
    });
    assert.equal(updateResponse.status, 200);
    const updatePayload = (await updateResponse.json()) as {
      deadline: { emailReminderDaysBefore?: number };
    };
    assert.equal(updatePayload.deadline.emailReminderDaysBefore, 0);

    const negativeUpdateResponse = await request(`/deadlines/${seeded.id}`, {
      method: "PATCH",
      cookie,
      body: {
        emailReminderDaysBefore: -1
      }
    });
    assert.equal(negativeUpdateResponse.status, 400);

    const defaultResponse = await request("/deadlines", {
      method: "POST",
      cookie,
      body: {
        ...deadlinePayload(),
        title: "Default reminder",
        emailReminderEnabled: true
      }
    });
    assert.equal(defaultResponse.status, 201);
    const defaultPayload = (await defaultResponse.json()) as {
      deadline: { emailReminderDaysBefore?: number };
    };
    assert.equal(defaultPayload.deadline.emailReminderDaysBefore, 7);

    const negativeResponse = await request("/deadlines", {
      method: "POST",
      cookie,
      body: {
        ...deadlinePayload(),
        title: "Negative reminder",
        emailReminderEnabled: true,
        emailReminderDaysBefore: -1
      }
    });
    assert.equal(negativeResponse.status, 400);
  });
});
