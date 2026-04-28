import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import { after, before, beforeEach, describe, it } from "node:test";
import { createApp } from "./app.js";
import { type AppConfig, resolveDatabaseUrl } from "./config.js";
import { prisma } from "./prisma.js";
import { hashPassword } from "./security.js";

let baseUrl = "";
let server: ReturnType<ReturnType<typeof createApp>["listen"]>;
let requestCounter = 0;

async function request(pathname: string, options: { method?: string; body?: unknown; cookie?: string } = {}) {
  const headers: Record<string, string> = {};
  requestCounter += 1;
  headers["X-Forwarded-For"] = `127.0.1.${(requestCounter % 200) + 1}`;

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
  isArchived?: boolean;
}) {
  return prisma.user.create({
    data: {
      firstName: "Test",
      lastName: "User",
      email: args.email,
      role: args.role ?? "USER",
      type: args.type ?? "INTERNAL",
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

async function createNotification(args: {
  recipientUserId?: string;
  recipientEmail: string;
  status: string;
  idempotencyKey: string;
  eventType?: string;
  entityId?: string;
  lastError?: string | null;
  scheduledFor?: Date;
  claimedAt?: Date | null;
  claimToken?: string | null;
  attemptCount?: number;
  lastAttemptAt?: Date | null;
  providerReference?: string | null;
}) {
  return prisma.notificationOutbox.create({
    data: {
      eventType: args.eventType ?? "ASSIGNMENT_ASSIGNED",
      entityType: "DEADLINE",
      entityId: args.entityId ?? args.idempotencyKey,
      recipientUserId: args.recipientUserId,
      recipientEmail: args.recipientEmail,
      subject: "Test notification",
      payloadJson: {
        title: "Test notification",
        message: "Test notification.",
        severity: "INFO"
      },
      status: args.status,
      scheduledFor: args.scheduledFor,
      claimedAt: args.claimedAt,
      claimToken: args.claimToken,
      attemptCount: args.attemptCount,
      lastAttemptAt: args.lastAttemptAt,
      lastError: args.lastError,
      providerReference: args.providerReference,
      idempotencyKey: args.idempotencyKey
    }
  });
}

async function seedBaseRoles() {
  await Promise.all([
    prisma.role.upsert({
      where: { key: "ADMIN" },
      update: { labelDe: "Admin", isSystem: true, isArchived: false },
      create: { key: "ADMIN", labelDe: "Admin", isSystem: true }
    }),
    prisma.role.upsert({
      where: { key: "USER" },
      update: { labelDe: "Benutzer", isSystem: true, isArchived: false },
      create: { key: "USER", labelDe: "Benutzer", isSystem: true }
    })
  ]);
}

describe("Admin Notifications API", () => {
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
      resetTokenTtlMinutes: 120,
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
    await prisma.notificationDeliveryAttempt.deleteMany();
    await prisma.notificationWorkerStatus.deleteMany();
    await prisma.notificationSettings.deleteMany();
    await prisma.notificationOutbox.deleteMany();
    await prisma.passwordResetToken.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.user.deleteMany();
    await prisma.role.deleteMany();
    await seedBaseRoles();
  });

  it("admin can list overview and detail with attempt history", async () => {
    const admin = await createUser({
      email: "notifications-admin@example.com",
      password: "ValidPassword1!",
      role: "ADMIN"
    });
    const recipient = await createUser({
      email: "recipient@example.com",
      password: "ValidPassword1!"
    });
    const outbox = await prisma.notificationOutbox.create({
      data: {
        eventType: "DEADLINE_OVERDUE",
        entityType: "DEADLINE",
        entityId: "deadline-1",
        recipientUserId: recipient.id,
        recipientEmail: recipient.email,
        recipientName: "Recipient User",
        subject: "Frist ueberfaellig",
        payloadJson: {
          title: "Frist ueberfaellig",
          message: "Die Frist ist ueberfaellig.",
          severity: "CRITICAL",
          linkPath: "/compliance/deadlines/deadline-1",
          entity: {
            type: "DEADLINE",
            id: "deadline-1",
            label: "Deadline 1"
          }
        },
        status: "FAILED",
        scheduledFor: new Date("2026-04-20T07:00:00.000Z"),
        attemptCount: 1,
        lastAttemptAt: new Date("2026-04-20T07:05:00.000Z"),
        lastError: "Simulated failure",
        idempotencyKey: "deadline-overdue:deadline-1:recipient"
      }
    });

    await prisma.notificationDeliveryAttempt.create({
      data: {
        notificationId: outbox.id,
        attemptNumber: 1,
        outcome: "FAILED",
        startedAt: new Date("2026-04-20T07:05:00.000Z"),
        finishedAt: new Date("2026-04-20T07:05:05.000Z"),
        httpStatus: 500,
        errorSummary: "Simulated failure"
      }
    });

    await prisma.notificationWorkerStatus.create({
      data: {
        workerKey: "EMAIL_DISPATCH",
        lastStartedAt: new Date("2026-04-20T07:00:00.000Z"),
        lastFinishedAt: new Date("2026-04-20T07:06:00.000Z"),
        lastSuccessfulAt: new Date("2026-04-19T07:06:00.000Z"),
        lastOutcome: "FAILED",
        lastError: "Simulated failure",
        lastClaimedCount: 1,
        lastProcessedCount: 1
      }
    });

    const cookie = await login(admin.email, "ValidPassword1!");

    const overviewResponse = await request("/admin/notifications/overview", { cookie });
    assert.equal(overviewResponse.status, 200);
    const overviewPayload = (await overviewResponse.json()) as {
      summary: { failedCount: number };
      workerStatus: { workerKey: string };
    };
    assert.equal(overviewPayload.summary.failedCount, 1);
    assert.equal(overviewPayload.workerStatus.workerKey, "EMAIL_DISPATCH");

    const listResponse = await request("/admin/notifications?status=FAILED", { cookie });
    assert.equal(listResponse.status, 200);
    const listPayload = (await listResponse.json()) as { total: number; items: Array<{ id: string; eventType: string }> };
    assert.equal(listPayload.total, 1);
    assert.equal(listPayload.items[0]?.eventType, "DEADLINE_OVERDUE");

    const detailResponse = await request(`/admin/notifications/${outbox.id}`, { cookie });
    assert.equal(detailResponse.status, 200);
    const detailPayload = (await detailResponse.json()) as {
      attempts: Array<{ outcome: string; httpStatus?: number }>;
      payload: { link?: string };
    };
    assert.equal(detailPayload.attempts.length, 1);
    assert.equal(detailPayload.attempts[0]?.outcome, "FAILED");
    assert.equal(detailPayload.attempts[0]?.httpStatus, 500);
    assert.equal(detailPayload.payload.link, "http://localhost:5173/compliance/deadlines/deadline-1");
  });

  it("attention filter only lists failed, retry and stale claimed notifications", async () => {
    const admin = await createUser({
      email: "attention-admin@example.com",
      password: "ValidPassword1!",
      role: "ADMIN"
    });
    const target = await createUser({
      email: "attention-target@example.com",
      password: "ValidPassword1!"
    });

    const failed = await prisma.notificationOutbox.create({
      data: {
        eventType: "DEADLINE_OVERDUE",
        entityType: "DEADLINE",
        entityId: "deadline-attention-failed",
        recipientUserId: target.id,
        recipientEmail: target.email,
        subject: "Frist ueberfaellig",
        payloadJson: {
          title: "Frist ueberfaellig",
          message: "FAILED entry.",
          severity: "CRITICAL"
        },
        status: "FAILED",
        lastError: "Delivery failed",
        idempotencyKey: "deadline-overdue:deadline-attention-failed:target"
      }
    });

    const retry = await prisma.notificationOutbox.create({
      data: {
        eventType: "DEADLINE_DUE_SOON",
        entityType: "DEADLINE",
        entityId: "deadline-attention-retry",
        recipientUserId: target.id,
        recipientEmail: target.email,
        subject: "Frist bald faellig",
        payloadJson: {
          title: "Frist bald faellig",
          message: "RETRY entry.",
          severity: "WARNING"
        },
        status: "RETRY",
        lastError: "Retry scheduled",
        idempotencyKey: "deadline-due-soon:deadline-attention-retry:target"
      }
    });

    const staleClaimed = await prisma.notificationOutbox.create({
      data: {
        eventType: "ASSIGNMENT_ASSIGNED",
        entityType: "DEADLINE",
        entityId: "deadline-attention-stale-claimed",
        recipientUserId: target.id,
        recipientEmail: target.email,
        subject: "Neue Zuweisung",
        payloadJson: {
          title: "Neue Zuweisung",
          message: "Stale claimed entry.",
          severity: "INFO"
        },
        status: "CLAIMED",
        claimedAt: new Date(Date.now() - 301_000),
        claimToken: "stale-attention-token",
        attemptCount: 1,
        idempotencyKey: "deadline-assigned:deadline-attention-stale-claimed:OWNER:target"
      }
    });

    const freshClaimed = await prisma.notificationOutbox.create({
      data: {
        eventType: "ASSIGNMENT_ASSIGNED",
        entityType: "DEADLINE",
        entityId: "deadline-attention-fresh-claimed",
        recipientUserId: target.id,
        recipientEmail: target.email,
        subject: "Neue Zuweisung",
        payloadJson: {
          title: "Neue Zuweisung",
          message: "Fresh claimed entry.",
          severity: "INFO"
        },
        status: "CLAIMED",
        claimedAt: new Date(),
        claimToken: "fresh-attention-token",
        attemptCount: 1,
        idempotencyKey: "deadline-assigned:deadline-attention-fresh-claimed:OWNER:target"
      }
    });

    const pending = await prisma.notificationOutbox.create({
      data: {
        eventType: "ASSIGNMENT_ASSIGNED",
        entityType: "DEADLINE",
        entityId: "deadline-attention-pending",
        recipientUserId: target.id,
        recipientEmail: target.email,
        subject: "Neue Zuweisung",
        payloadJson: {
          title: "Neue Zuweisung",
          message: "Pending entry.",
          severity: "INFO"
        },
        status: "PENDING",
        idempotencyKey: "deadline-assigned:deadline-attention-pending:OWNER:target"
      }
    });

    const sent = await prisma.notificationOutbox.create({
      data: {
        eventType: "DEADLINE_DUE_SOON",
        entityType: "DEADLINE",
        entityId: "deadline-attention-sent",
        recipientUserId: target.id,
        recipientEmail: target.email,
        subject: "Frist bald faellig",
        payloadJson: {
          title: "Frist bald faellig",
          message: "Sent entry.",
          severity: "WARNING"
        },
        status: "SENT",
        sentAt: new Date(),
        idempotencyKey: "deadline-due-soon:deadline-attention-sent:target"
      }
    });

    const cancelled = await prisma.notificationOutbox.create({
      data: {
        eventType: "DEADLINE_DUE_SOON",
        entityType: "DEADLINE",
        entityId: "deadline-attention-cancelled",
        recipientUserId: target.id,
        recipientEmail: target.email,
        subject: "Frist bald faellig",
        payloadJson: {
          title: "Frist bald faellig",
          message: "Cancelled entry.",
          severity: "WARNING"
        },
        status: "CANCELLED",
        idempotencyKey: "deadline-due-soon:deadline-attention-cancelled:target"
      }
    });

    const cookie = await login(admin.email, "ValidPassword1!");

    const response = await request("/admin/notifications?status=ATTENTION&pageSize=20", { cookie });
    assert.equal(response.status, 200);

    const payload = (await response.json()) as {
      total: number;
      items: Array<{ id: string }>;
    };

    const ids = new Set(payload.items.map((item) => item.id));
    assert.equal(payload.total, 3);
    assert.equal(ids.has(failed.id), true);
    assert.equal(ids.has(retry.id), true);
    assert.equal(ids.has(staleClaimed.id), true);
    assert.equal(ids.has(freshClaimed.id), false);
    assert.equal(ids.has(pending.id), false);
    assert.equal(ids.has(sent.id), false);
    assert.equal(ids.has(cancelled.id), false);
  });

  it("view-only notification admin can read but not retry", async () => {
    await prisma.role.create({
      data: {
        key: "NOTIFICATION_AUDITOR",
        labelDe: "Notification Auditor",
        descriptionDe: "Kann Versandhistorie ansehen.",
        permissionsJson: ["admin.access", "notifications.view"]
      }
    });

    const auditor = await createUser({
      email: "auditor@example.com",
      password: "ValidPassword1!",
      role: "NOTIFICATION_AUDITOR"
    });

    const outbox = await prisma.notificationOutbox.create({
      data: {
        eventType: "ASSIGNMENT_ASSIGNED",
        entityType: "DEADLINE",
        entityId: "deadline-2",
        recipientEmail: "target@example.com",
        subject: "Neue Zuweisung",
        payloadJson: {
          title: "Neue Zuweisung",
          message: "Neue Zuweisung.",
          severity: "INFO"
        },
        status: "FAILED",
        lastError: "Needs retry",
        idempotencyKey: "assignment:deadline-2:user-1"
      }
    });

    const cookie = await login(auditor.email, "ValidPassword1!");

    const overviewResponse = await request("/admin/notifications/overview", { cookie });
    assert.equal(overviewResponse.status, 200);

    const retryResponse = await request(`/admin/notifications/${outbox.id}/retry`, {
      method: "POST",
      cookie
    });
    assert.equal(retryResponse.status, 403);
  });

  it("admin can retry failed notifications, cancel queued notifications, and reset links stay protected", async () => {
    const admin = await createUser({
      email: "retry-admin@example.com",
      password: "ValidPassword1!",
      role: "ADMIN"
    });
    const target = await createUser({
      email: "retry-target@example.com",
      password: "ValidPassword1!"
    });

    const failed = await prisma.notificationOutbox.create({
      data: {
        eventType: "DEADLINE_DUE_SOON",
        entityType: "DEADLINE",
        entityId: "deadline-retry",
        recipientUserId: target.id,
        recipientEmail: target.email,
        subject: "Frist bald faellig",
        payloadJson: {
          title: "Frist bald faellig",
          message: "Frist bald faellig.",
          severity: "WARNING"
        },
        status: "FAILED",
        lastError: "Temporary problem",
        attemptCount: 2,
        idempotencyKey: "deadline-due-soon:deadline-retry:target"
      }
    });

    const pending = await prisma.notificationOutbox.create({
      data: {
        eventType: "ASSIGNMENT_ASSIGNED",
        entityType: "DEADLINE",
        entityId: "deadline-cancel",
        recipientUserId: target.id,
        recipientEmail: target.email,
        subject: "Neue Zuweisung",
        payloadJson: {
          title: "Neue Zuweisung",
          message: "Neue Zuweisung.",
          severity: "INFO"
        },
        status: "PENDING",
        idempotencyKey: "deadline-assigned:deadline-cancel:OWNER:target"
      }
    });

    const resetToken = await prisma.passwordResetToken.create({
      data: {
        userId: target.id,
        tokenHash: "hashed-token",
        expiresAt: new Date(Date.now() + 60_000)
      }
    });

    const resetRow = await prisma.notificationOutbox.create({
      data: {
        eventType: "PASSWORD_RESET_LINK",
        entityType: "USER",
        entityId: target.id,
        recipientUserId: target.id,
        recipientEmail: target.email,
        subject: "Passwort zuruecksetzen",
        payloadJson: {
          title: "Passwort zuruecksetzen",
          message: "Reset-Link",
          severity: "INFO",
          expiresAt: new Date(Date.now() + 60_000).toISOString()
        },
        status: "FAILED",
        lastError: "Delivery failed",
        idempotencyKey: `password-reset:${resetToken.id}`
      }
    });

    const cookie = await login(admin.email, "ValidPassword1!");

    const retryResponse = await request(`/admin/notifications/${failed.id}/retry`, {
      method: "POST",
      cookie
    });
    assert.equal(retryResponse.status, 200);
    const retriedRow = await prisma.notificationOutbox.findUniqueOrThrow({ where: { id: failed.id } });
    assert.equal(retriedRow.status, "PENDING");
    assert.equal(retriedRow.lastError, null);

    const cancelResponse = await request(`/admin/notifications/${pending.id}/cancel`, {
      method: "POST",
      cookie
    });
    assert.equal(cancelResponse.status, 200);
    const cancelledRow = await prisma.notificationOutbox.findUniqueOrThrow({ where: { id: pending.id } });
    assert.equal(cancelledRow.status, "CANCELLED");

    const resetRetryResponse = await request(`/admin/notifications/${resetRow.id}/retry`, {
      method: "POST",
      cookie
    });
    assert.equal(resetRetryResponse.status, 400);
  });

  it("retry is idempotent for PENDING and repeated retry requests", async () => {
    const admin = await createUser({
      email: "retry-idempotent-admin@example.com",
      password: "ValidPassword1!",
      role: "ADMIN"
    });
    const target = await createUser({
      email: "retry-idempotent-target@example.com",
      password: "ValidPassword1!"
    });
    const cookie = await login(admin.email, "ValidPassword1!");

    const failed = await createNotification({
      recipientUserId: target.id,
      recipientEmail: target.email,
      status: "FAILED",
      lastError: "Failure to retry",
      attemptCount: 2,
      idempotencyKey: "retry-idempotent-failed"
    });
    const retry = await createNotification({
      recipientUserId: target.id,
      recipientEmail: target.email,
      status: "RETRY",
      scheduledFor: new Date(Date.now() + 60_000),
      lastError: "Retry to requeue",
      attemptCount: 3,
      lastAttemptAt: new Date(Date.now() - 60_000),
      idempotencyKey: "retry-idempotent-retry"
    });
    const pending = await createNotification({
      recipientUserId: target.id,
      recipientEmail: target.email,
      status: "PENDING",
      lastError: "Pending diagnostic should remain",
      providerReference: "pending-provider-reference",
      idempotencyKey: "retry-idempotent-pending"
    });

    assert.equal((await request(`/admin/notifications/${failed.id}/retry`, { method: "POST", cookie })).status, 200);
    assert.equal((await request(`/admin/notifications/${retry.id}/retry`, { method: "POST", cookie })).status, 200);
    assert.equal((await request(`/admin/notifications/${pending.id}/retry`, { method: "POST", cookie })).status, 200);
    assert.equal((await request(`/admin/notifications/${failed.id}/retry`, { method: "POST", cookie })).status, 200);

    const failedAfter = await prisma.notificationOutbox.findUniqueOrThrow({ where: { id: failed.id } });
    assert.equal(failedAfter.status, "PENDING");
    assert.equal(failedAfter.lastError, null);

    const retryAfter = await prisma.notificationOutbox.findUniqueOrThrow({ where: { id: retry.id } });
    assert.equal(retryAfter.status, "PENDING");
    assert.equal(retryAfter.lastError, null);

    const pendingAfter = await prisma.notificationOutbox.findUniqueOrThrow({ where: { id: pending.id } });
    assert.equal(pendingAfter.status, "PENDING");
    assert.equal(pendingAfter.lastError, "Pending diagnostic should remain");
    assert.equal(pendingAfter.providerReference, "pending-provider-reference");
  });

  it("cancel supports failed notifications and is idempotent for CANCELLED", async () => {
    const admin = await createUser({
      email: "cancel-idempotent-admin@example.com",
      password: "ValidPassword1!",
      role: "ADMIN"
    });
    const target = await createUser({
      email: "cancel-idempotent-target@example.com",
      password: "ValidPassword1!"
    });
    const cookie = await login(admin.email, "ValidPassword1!");

    const pending = await createNotification({
      recipientUserId: target.id,
      recipientEmail: target.email,
      status: "PENDING",
      idempotencyKey: "cancel-idempotent-pending"
    });
    const retry = await createNotification({
      recipientUserId: target.id,
      recipientEmail: target.email,
      status: "RETRY",
      lastError: "Retry before cancel",
      idempotencyKey: "cancel-idempotent-retry"
    });
    const failed = await createNotification({
      recipientUserId: target.id,
      recipientEmail: target.email,
      status: "FAILED",
      lastError: "Failed before cancel",
      idempotencyKey: "cancel-idempotent-failed"
    });
    const cancelled = await createNotification({
      recipientUserId: target.id,
      recipientEmail: target.email,
      status: "CANCELLED",
      lastError: "Already cancelled",
      idempotencyKey: "cancel-idempotent-cancelled"
    });

    assert.equal((await request(`/admin/notifications/${pending.id}/cancel`, { method: "POST", cookie })).status, 200);
    assert.equal((await request(`/admin/notifications/${retry.id}/cancel`, { method: "POST", cookie })).status, 200);
    assert.equal((await request(`/admin/notifications/${failed.id}/cancel`, { method: "POST", cookie })).status, 200);
    assert.equal((await request(`/admin/notifications/${cancelled.id}/cancel`, { method: "POST", cookie })).status, 200);
    assert.equal((await request(`/admin/notifications/${pending.id}/cancel`, { method: "POST", cookie })).status, 200);

    for (const id of [pending.id, retry.id, failed.id, cancelled.id]) {
      const row = await prisma.notificationOutbox.findUniqueOrThrow({ where: { id } });
      assert.equal(row.status, "CANCELLED");
    }

    const failedAfter = await prisma.notificationOutbox.findUniqueOrThrow({ where: { id: failed.id } });
    assert.equal(failedAfter.lastError, "Failed before cancel");

    const cancelledAfter = await prisma.notificationOutbox.findUniqueOrThrow({ where: { id: cancelled.id } });
    assert.equal(cancelledAfter.lastError, "Already cancelled");
  });

  it("keeps SENT protected and treats CANCELLED cancel as idempotent no-op", async () => {
    const admin = await createUser({
      email: "protected-admin@example.com",
      password: "ValidPassword1!",
      role: "ADMIN"
    });
    const target = await createUser({
      email: "protected-target@example.com",
      password: "ValidPassword1!"
    });

    const sent = await prisma.notificationOutbox.create({
      data: {
        eventType: "DEADLINE_DUE_SOON",
        entityType: "DEADLINE",
        entityId: "deadline-protected-sent",
        recipientUserId: target.id,
        recipientEmail: target.email,
        subject: "Frist bald faellig",
        payloadJson: {
          title: "Frist bald faellig",
          message: "Already sent.",
          severity: "WARNING"
        },
        status: "SENT",
        sentAt: new Date(),
        idempotencyKey: "deadline-due-soon:deadline-protected-sent:target"
      }
    });

    const cancelled = await prisma.notificationOutbox.create({
      data: {
        eventType: "ASSIGNMENT_ASSIGNED",
        entityType: "DEADLINE",
        entityId: "deadline-protected-cancelled",
        recipientUserId: target.id,
        recipientEmail: target.email,
        subject: "Neue Zuweisung",
        payloadJson: {
          title: "Neue Zuweisung",
          message: "Already cancelled.",
          severity: "INFO"
        },
        status: "CANCELLED",
        lastError: "Cancelled by admin",
        idempotencyKey: "deadline-assigned:deadline-protected-cancelled:OWNER:target"
      }
    });

    const cookie = await login(admin.email, "ValidPassword1!");

    assert.equal(
      (await request(`/admin/notifications/${sent.id}/retry`, { method: "POST", cookie })).status,
      400
    );
    assert.equal(
      (await request(`/admin/notifications/${sent.id}/cancel`, { method: "POST", cookie })).status,
      400
    );
    assert.equal(
      (await request(`/admin/notifications/${cancelled.id}/retry`, { method: "POST", cookie })).status,
      400
    );
    assert.equal(
      (await request(`/admin/notifications/${cancelled.id}/cancel`, { method: "POST", cookie })).status,
      200
    );

    const sentRow = await prisma.notificationOutbox.findUniqueOrThrow({ where: { id: sent.id } });
    assert.equal(sentRow.status, "SENT");

    const cancelledRow = await prisma.notificationOutbox.findUniqueOrThrow({ where: { id: cancelled.id } });
    assert.equal(cancelledRow.status, "CANCELLED");
  });

  it("only allows retry and cancel for stale claimed notifications", async () => {
    const admin = await createUser({
      email: "claimed-admin@example.com",
      password: "ValidPassword1!",
      role: "ADMIN"
    });
    const target = await createUser({
      email: "claimed-target@example.com",
      password: "ValidPassword1!"
    });

    const freshClaimed = await prisma.notificationOutbox.create({
      data: {
        eventType: "ASSIGNMENT_ASSIGNED",
        entityType: "DEADLINE",
        entityId: "deadline-claimed-fresh",
        recipientUserId: target.id,
        recipientEmail: target.email,
        subject: "Neue Zuweisung",
        payloadJson: {
          title: "Neue Zuweisung",
          message: "Frisch geclaimt.",
          severity: "INFO"
        },
        status: "CLAIMED",
        claimedAt: new Date(),
        claimToken: "fresh-claim-token",
        attemptCount: 1,
        idempotencyKey: "deadline-assigned:deadline-claimed-fresh:OWNER:target"
      }
    });

    const staleRetry = await prisma.notificationOutbox.create({
      data: {
        eventType: "DEADLINE_DUE_SOON",
        entityType: "DEADLINE",
        entityId: "deadline-claimed-stale-retry",
        recipientUserId: target.id,
        recipientEmail: target.email,
        subject: "Frist bald faellig",
        payloadJson: {
          title: "Frist bald faellig",
          message: "Stale claim fuer Retry.",
          severity: "WARNING"
        },
        status: "CLAIMED",
        claimedAt: new Date(Date.now() - 301_000),
        claimToken: "stale-retry-token",
        attemptCount: 2,
        idempotencyKey: "deadline-due-soon:deadline-claimed-stale-retry:target"
      }
    });

    const staleCancel = await prisma.notificationOutbox.create({
      data: {
        eventType: "ASSIGNMENT_ASSIGNED",
        entityType: "DEADLINE",
        entityId: "deadline-claimed-stale-cancel",
        recipientUserId: target.id,
        recipientEmail: target.email,
        subject: "Neue Zuweisung",
        payloadJson: {
          title: "Neue Zuweisung",
          message: "Stale claim fuer Cancel.",
          severity: "INFO"
        },
        status: "CLAIMED",
        claimedAt: new Date(Date.now() - 301_000),
        claimToken: "stale-cancel-token",
        attemptCount: 1,
        idempotencyKey: "deadline-assigned:deadline-claimed-stale-cancel:OWNER:target"
      }
    });

    const cookie = await login(admin.email, "ValidPassword1!");

    const freshRetryResponse = await request(`/admin/notifications/${freshClaimed.id}/retry`, {
      method: "POST",
      cookie
    });
    assert.equal(freshRetryResponse.status, 400);

    const freshCancelResponse = await request(`/admin/notifications/${freshClaimed.id}/cancel`, {
      method: "POST",
      cookie
    });
    assert.equal(freshCancelResponse.status, 400);

    const staleRetryResponse = await request(`/admin/notifications/${staleRetry.id}/retry`, {
      method: "POST",
      cookie
    });
    assert.equal(staleRetryResponse.status, 200);
    const retriedRow = await prisma.notificationOutbox.findUniqueOrThrow({ where: { id: staleRetry.id } });
    assert.equal(retriedRow.status, "PENDING");
    assert.equal(retriedRow.claimedAt, null);
    assert.equal(retriedRow.claimToken, null);

    const staleCancelResponse = await request(`/admin/notifications/${staleCancel.id}/cancel`, {
      method: "POST",
      cookie
    });
    assert.equal(staleCancelResponse.status, 200);
    const cancelledRow = await prisma.notificationOutbox.findUniqueOrThrow({ where: { id: staleCancel.id } });
    assert.equal(cancelledRow.status, "CANCELLED");
    assert.equal(cancelledRow.claimedAt, null);
    assert.equal(cancelledRow.claimToken, null);
  });

  it("returns 409 when retry loses the race against a fresh worker claim", async () => {
    const admin = await createUser({
      email: "retry-race-admin@example.com",
      password: "ValidPassword1!",
      role: "ADMIN"
    });
    const target = await createUser({
      email: "retry-race-target@example.com",
      password: "ValidPassword1!"
    });

    const failed = await prisma.notificationOutbox.create({
      data: {
        eventType: "DEADLINE_DUE_SOON",
        entityType: "DEADLINE",
        entityId: "deadline-race-retry",
        recipientUserId: target.id,
        recipientEmail: target.email,
        subject: "Frist bald faellig",
        payloadJson: {
          title: "Frist bald faellig",
          message: "Race retry.",
          severity: "WARNING"
        },
        status: "FAILED",
        lastError: "Temporary problem",
        idempotencyKey: "deadline-due-soon:deadline-race-retry:target"
      }
    });

    const cookie = await login(admin.email, "ValidPassword1!");
    const delegate = prisma.notificationOutbox as any;
    const originalFindUnique = delegate.findUnique.bind(prisma.notificationOutbox);
    let injected = false;

    delegate.findUnique = async (args: unknown) => {
      const result = await originalFindUnique(args);
      if (!injected && result?.id === failed.id) {
        injected = true;
        await prisma.notificationOutbox.update({
          where: {
            id: failed.id
          },
          data: {
            status: "CLAIMED",
            claimedAt: new Date(),
            claimToken: "worker-retry-claim-token"
          }
        });
      }
      return result;
    };

    try {
      const response = await request(`/admin/notifications/${failed.id}/retry`, {
        method: "POST",
        cookie
      });
      assert.equal(response.status, 409);
      const payload = (await response.json()) as { message: string };
      assert.equal(payload.message, "Notification wurde inzwischen von einem Worker uebernommen oder veraendert.");
    } finally {
      delegate.findUnique = originalFindUnique;
    }

    const row = await prisma.notificationOutbox.findUniqueOrThrow({
      where: {
        id: failed.id
      }
    });
    assert.equal(row.status, "CLAIMED");
    assert.ok(row.claimedAt);
    assert.equal(row.claimToken, "worker-retry-claim-token");
  });

  it("returns 409 when cancel loses the race against a fresh worker claim", async () => {
    const admin = await createUser({
      email: "cancel-race-admin@example.com",
      password: "ValidPassword1!",
      role: "ADMIN"
    });
    const target = await createUser({
      email: "cancel-race-target@example.com",
      password: "ValidPassword1!"
    });

    const pending = await prisma.notificationOutbox.create({
      data: {
        eventType: "ASSIGNMENT_ASSIGNED",
        entityType: "DEADLINE",
        entityId: "deadline-race-cancel",
        recipientUserId: target.id,
        recipientEmail: target.email,
        subject: "Neue Zuweisung",
        payloadJson: {
          title: "Neue Zuweisung",
          message: "Race cancel.",
          severity: "INFO"
        },
        status: "PENDING",
        idempotencyKey: "deadline-assigned:deadline-race-cancel:OWNER:target"
      }
    });

    const cookie = await login(admin.email, "ValidPassword1!");
    const delegate = prisma.notificationOutbox as any;
    const originalFindUnique = delegate.findUnique.bind(prisma.notificationOutbox);
    let injected = false;

    delegate.findUnique = async (args: unknown) => {
      const result = await originalFindUnique(args);
      if (!injected && result?.id === pending.id) {
        injected = true;
        await prisma.notificationOutbox.update({
          where: {
            id: pending.id
          },
          data: {
            status: "CLAIMED",
            claimedAt: new Date(),
            claimToken: "worker-cancel-claim-token"
          }
        });
      }
      return result;
    };

    try {
      const response = await request(`/admin/notifications/${pending.id}/cancel`, {
        method: "POST",
        cookie
      });
      assert.equal(response.status, 409);
      const payload = (await response.json()) as { message: string };
      assert.equal(payload.message, "Notification wurde inzwischen von einem Worker uebernommen oder veraendert.");
    } finally {
      delegate.findUnique = originalFindUnique;
    }

    const row = await prisma.notificationOutbox.findUniqueOrThrow({
      where: {
        id: pending.id
      }
    });
    assert.equal(row.status, "CLAIMED");
    assert.ok(row.claimedAt);
    assert.equal(row.claimToken, "worker-cancel-claim-token");
  });

  it("returns 409 when retry loses the race against fresh worker retry state", async () => {
    const admin = await createUser({
      email: "retry-race-retry-admin@example.com",
      password: "ValidPassword1!",
      role: "ADMIN"
    });
    const target = await createUser({
      email: "retry-race-retry-target@example.com",
      password: "ValidPassword1!"
    });
    const retry = await createNotification({
      recipientUserId: target.id,
      recipientEmail: target.email,
      status: "RETRY",
      lastError: "Original retry state",
      attemptCount: 1,
      idempotencyKey: "retry-race-worker-retry"
    });

    const cookie = await login(admin.email, "ValidPassword1!");
    const delegate = prisma.notificationOutbox as any;
    const originalFindUnique = delegate.findUnique.bind(prisma.notificationOutbox);
    const workerLastAttemptAt = new Date();
    let injected = false;

    delegate.findUnique = async (args: unknown) => {
      const result = await originalFindUnique(args);
      if (!injected && result?.id === retry.id) {
        injected = true;
        await prisma.notificationOutbox.update({
          where: {
            id: retry.id
          },
          data: {
            status: "RETRY",
            scheduledFor: new Date(Date.now() + 300_000),
            lastError: "Fresh worker retry state",
            attemptCount: 2,
            lastAttemptAt: workerLastAttemptAt,
            claimedAt: null,
            claimToken: null
          }
        });
      }
      return result;
    };

    try {
      const response = await request(`/admin/notifications/${retry.id}/retry`, {
        method: "POST",
        cookie
      });
      assert.equal(response.status, 409);
      const payload = (await response.json()) as { message: string };
      assert.equal(payload.message, "Notification wurde inzwischen von einem Worker uebernommen oder veraendert.");
    } finally {
      delegate.findUnique = originalFindUnique;
    }

    const row = await prisma.notificationOutbox.findUniqueOrThrow({
      where: {
        id: retry.id
      }
    });
    assert.equal(row.status, "RETRY");
    assert.equal(row.lastError, "Fresh worker retry state");
    assert.equal(row.attemptCount, 2);
    assert.ok(row.lastAttemptAt);
  });

  it("treats retry race as no-op when worker already reached PENDING", async () => {
    const admin = await createUser({
      email: "retry-race-pending-admin@example.com",
      password: "ValidPassword1!",
      role: "ADMIN"
    });
    const target = await createUser({
      email: "retry-race-pending-target@example.com",
      password: "ValidPassword1!"
    });
    const retry = await createNotification({
      recipientUserId: target.id,
      recipientEmail: target.email,
      status: "RETRY",
      lastError: "Original retry state",
      attemptCount: 1,
      idempotencyKey: "retry-race-worker-pending"
    });

    const cookie = await login(admin.email, "ValidPassword1!");
    const delegate = prisma.notificationOutbox as any;
    const originalFindUnique = delegate.findUnique.bind(prisma.notificationOutbox);
    let injected = false;

    delegate.findUnique = async (args: unknown) => {
      const result = await originalFindUnique(args);
      if (!injected && result?.id === retry.id) {
        injected = true;
        await prisma.notificationOutbox.update({
          where: {
            id: retry.id
          },
          data: {
            status: "PENDING",
            scheduledFor: new Date(Date.now() + 120_000),
            lastError: "Fresh worker pending state",
            providerReference: "fresh-provider-reference",
            attemptCount: 2,
            lastAttemptAt: new Date(),
            claimedAt: null,
            claimToken: null
          }
        });
      }
      return result;
    };

    try {
      const response = await request(`/admin/notifications/${retry.id}/retry`, {
        method: "POST",
        cookie
      });
      assert.equal(response.status, 200);
    } finally {
      delegate.findUnique = originalFindUnique;
    }

    const row = await prisma.notificationOutbox.findUniqueOrThrow({
      where: {
        id: retry.id
      }
    });
    assert.equal(row.status, "PENDING");
    assert.equal(row.lastError, "Fresh worker pending state");
    assert.equal(row.providerReference, "fresh-provider-reference");
    assert.equal(row.attemptCount, 2);
  });

  it("returns 409 when cancel loses the race against fresh worker retry state", async () => {
    const admin = await createUser({
      email: "cancel-race-retry-admin@example.com",
      password: "ValidPassword1!",
      role: "ADMIN"
    });
    const target = await createUser({
      email: "cancel-race-retry-target@example.com",
      password: "ValidPassword1!"
    });
    const pending = await createNotification({
      recipientUserId: target.id,
      recipientEmail: target.email,
      status: "PENDING",
      attemptCount: 0,
      idempotencyKey: "cancel-race-worker-retry"
    });

    const cookie = await login(admin.email, "ValidPassword1!");
    const delegate = prisma.notificationOutbox as any;
    const originalFindUnique = delegate.findUnique.bind(prisma.notificationOutbox);
    let injected = false;

    delegate.findUnique = async (args: unknown) => {
      const result = await originalFindUnique(args);
      if (!injected && result?.id === pending.id) {
        injected = true;
        await prisma.notificationOutbox.update({
          where: {
            id: pending.id
          },
          data: {
            status: "RETRY",
            scheduledFor: new Date(Date.now() + 300_000),
            lastError: "Fresh worker retry state",
            attemptCount: 1,
            lastAttemptAt: new Date(),
            claimedAt: null,
            claimToken: null
          }
        });
      }
      return result;
    };

    try {
      const response = await request(`/admin/notifications/${pending.id}/cancel`, {
        method: "POST",
        cookie
      });
      assert.equal(response.status, 409);
      const payload = (await response.json()) as { message: string };
      assert.equal(payload.message, "Notification wurde inzwischen von einem Worker uebernommen oder veraendert.");
    } finally {
      delegate.findUnique = originalFindUnique;
    }

    const row = await prisma.notificationOutbox.findUniqueOrThrow({
      where: {
        id: pending.id
      }
    });
    assert.equal(row.status, "RETRY");
    assert.equal(row.lastError, "Fresh worker retry state");
    assert.equal(row.attemptCount, 1);
  });

  it("treats cancel race as no-op when worker already reached CANCELLED", async () => {
    const admin = await createUser({
      email: "cancel-race-cancelled-admin@example.com",
      password: "ValidPassword1!",
      role: "ADMIN"
    });
    const target = await createUser({
      email: "cancel-race-cancelled-target@example.com",
      password: "ValidPassword1!"
    });
    const pending = await createNotification({
      recipientUserId: target.id,
      recipientEmail: target.email,
      status: "PENDING",
      attemptCount: 0,
      idempotencyKey: "cancel-race-worker-cancelled"
    });

    const cookie = await login(admin.email, "ValidPassword1!");
    const delegate = prisma.notificationOutbox as any;
    const originalFindUnique = delegate.findUnique.bind(prisma.notificationOutbox);
    let injected = false;

    delegate.findUnique = async (args: unknown) => {
      const result = await originalFindUnique(args);
      if (!injected && result?.id === pending.id) {
        injected = true;
        await prisma.notificationOutbox.update({
          where: {
            id: pending.id
          },
          data: {
            status: "CANCELLED",
            lastError: "Worker cancellation reason",
            attemptCount: 1,
            lastAttemptAt: new Date(),
            claimedAt: null,
            claimToken: null
          }
        });
      }
      return result;
    };

    try {
      const response = await request(`/admin/notifications/${pending.id}/cancel`, {
        method: "POST",
        cookie
      });
      assert.equal(response.status, 200);
    } finally {
      delegate.findUnique = originalFindUnique;
    }

    const row = await prisma.notificationOutbox.findUniqueOrThrow({
      where: {
        id: pending.id
      }
    });
    assert.equal(row.status, "CANCELLED");
    assert.equal(row.lastError, "Worker cancellation reason");
    assert.equal(row.attemptCount, 1);
  });

  it("admin can update global notification settings", async () => {
    const admin = await createUser({
      email: "settings-admin@example.com",
      password: "ValidPassword1!",
      role: "ADMIN"
    });

    const cookie = await login(admin.email, "ValidPassword1!");

    const updateResponse = await request("/admin/notifications/settings", {
      method: "PATCH",
      cookie,
      body: {
        defaultDueSoonDays: 10,
        deadlineDueSoonEnabled: false,
        assignmentAssignedEnabled: true,
        dailyDigestEnabled: true,
        weeklyDigestEnabled: false,
        dailyDigestHourLocal: 8,
        weeklyDigestWeekday: 2
      }
    });

    assert.equal(updateResponse.status, 200);

    const settingsResponse = await request("/admin/notifications/settings", {
      cookie
    });
    assert.equal(settingsResponse.status, 200);
    const settingsPayload = (await settingsResponse.json()) as {
      settings: { defaultDueSoonDays: number; deadlineDueSoonEnabled: boolean; dailyDigestEnabled: boolean };
    };
    assert.equal(settingsPayload.settings.defaultDueSoonDays, 10);
    assert.equal(settingsPayload.settings.deadlineDueSoonEnabled, false);
    assert.equal(settingsPayload.settings.dailyDigestEnabled, true);

    const auditEntry = await prisma.auditLog.findFirst({
      where: {
        action: "NOTIFICATION_SETTINGS_UPDATED",
        actorUserId: admin.id
      }
    });
    assert.ok(auditEntry);
  });
});
