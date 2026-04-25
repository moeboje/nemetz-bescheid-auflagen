import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { after, before, beforeEach, describe, it } from "node:test";
import type { AddressInfo } from "node:net";
import { Prisma, PrismaClient } from "@prisma/client";
import { type AppConfig, resolveDatabaseUrl } from "./config.js";
import {
  createAndDispatchPasswordResetNotification,
  dispatchPendingNotifications,
  enqueueDeadlineAssignmentNotificationsForChange,
  invalidateOlderPasswordResetTokens,
  runNotificationDispatchCycle
} from "./notifications.js";
import { prisma } from "./prisma.js";
import { hashPassword } from "./security.js";

let notificationServer: http.Server;
let webhookBaseUrl = "";
const capturedNotifications: Array<Record<string, unknown>> = [];
let slowResponseGate: Promise<void> | null = null;
let notifySlowRequestReceived: (() => void) | null = null;

const testConfig: AppConfig = {
  port: 0,
  databaseUrl: resolveDatabaseUrl(process.env, "test"),
  appOrigin: "http://localhost:5173",
  notificationBaseUrl: "http://localhost:5173",
  notificationDispatchEnabled: true,
  notificationDryRun: false,
  notificationFromLabel: "Nemetz Portal",
  powerAutomateNotificationWebhookUrl: "",
  powerAutomateNotificationSecret: "test-notification-secret",
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

async function createUser(email: string) {
  return prisma.user.create({
    data: {
      firstName: "Test",
      lastName: "User",
      email,
      role: "COMPLIANCE_EDITOR",
      type: "INTERNAL",
      passwordHash: await hashPassword("ValidPassword1!")
    }
  });
}

function fixedNow(value: string | Date) {
  const fixed = value instanceof Date ? new Date(value) : new Date(value);
  return () => new Date(fixed);
}

describe("Notifications", () => {
  before(async () => {
    notificationServer = http.createServer((req, res) => {
      const chunks: Buffer[] = [];

      req.on("data", (chunk) => {
        chunks.push(Buffer.from(chunk));
      });

      req.on("end", () => {
        void (async () => {
        const body = chunks.length > 0 ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
        if (req.url === "/fail") {
          res.writeHead(500, {
            "Content-Type": "application/json"
          });
          res.end(JSON.stringify({ ok: false, message: "Simulated delivery failure" }));
          return;
        }
        if (req.url === "/slow-reset") {
          notifySlowRequestReceived?.();
          await slowResponseGate;
          capturedNotifications.push(body as Record<string, unknown>);
          res.writeHead(200, {
            "Content-Type": "application/json"
          });
          res.end(JSON.stringify({ ok: true, flowRunId: "flow-run-slow" }));
          return;
        }
        if (req.url === "/cancel-before-success" || req.url === "/reclaim-before-success") {
          const notificationId =
            body && typeof body === "object" && "notificationId" in body
              ? String((body as { notificationId?: unknown }).notificationId ?? "")
              : "";
          if (notificationId && req.url === "/cancel-before-success") {
            await prisma.notificationOutbox.updateMany({
              where: {
                id: notificationId
              },
              data: {
                status: "CANCELLED",
                claimedAt: null,
                claimToken: null,
                lastError: "Cancelled during dispatch."
              }
            });
          }
          if (notificationId && req.url === "/reclaim-before-success") {
            await prisma.notificationOutbox.updateMany({
              where: {
                id: notificationId
              },
              data: {
                status: "CLAIMED",
                claimedAt: new Date(),
                claimToken: "replacement-claim-token"
              }
            });
          }
          res.writeHead(200, {
            "Content-Type": "application/json"
          });
          res.end(JSON.stringify({ ok: true, flowRunId: "flow-run-race" }));
          return;
        }
        capturedNotifications.push(body as Record<string, unknown>);
        res.writeHead(200, {
          "Content-Type": "application/json"
        });
        res.end(JSON.stringify({ ok: true, flowRunId: "flow-run-1" }));
        })().catch((error: unknown) => {
          res.writeHead(500, {
            "Content-Type": "application/json"
          });
          res.end(JSON.stringify({ ok: false, message: error instanceof Error ? error.message : "Test error" }));
        });
      });
    });

    notificationServer.listen(0);
    await once(notificationServer, "listening");
    const address = notificationServer.address() as AddressInfo;
    webhookBaseUrl = `http://127.0.0.1:${address.port}`;
    testConfig.powerAutomateNotificationWebhookUrl = `${webhookBaseUrl}/notify`;
  });

  after(async () => {
    notificationServer.close();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    capturedNotifications.length = 0;
    slowResponseGate = null;
    notifySlowRequestReceived = null;
    await prisma.notificationDeliveryAttempt.deleteMany();
    await prisma.notificationWorkerStatus.deleteMany();
    await prisma.notificationSettings.deleteMany();
    await prisma.notificationOutbox.deleteMany();
    await prisma.passwordResetToken.deleteMany();
    await prisma.session.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.deadline.deleteMany();
    await prisma.project.deleteMany();
    await prisma.user.deleteMany();
    await prisma.$executeRaw(Prisma.sql`DELETE FROM "SecuritySettings"`);
  });

  it("stores password reset token expiry relative to the token creation time", async () => {
    const user = await createUser("reset-full-ttl@example.com");
    const ttlMinutes = 120;

    const result = await createAndDispatchPasswordResetNotification(prisma, testConfig, {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        isArchived: user.isArchived,
        type: user.type
      },
      ttlMinutes,
      now: fixedNow("2026-04-19T08:00:00.000Z")
    });

    assert.equal(result.deliveryStatus, "SENT");

    const outboxRow = await prisma.notificationOutbox.findUniqueOrThrow({
      where: {
        id: result.notificationId
      }
    });
    const token = await prisma.passwordResetToken.findUniqueOrThrow({
      where: {
        id: outboxRow.idempotencyKey.replace("password-reset:", "")
      }
    });

    assert.equal(token.expiresAt.getTime() - token.createdAt.getTime(), ttlMinutes * 60_000);
    assert.equal(result.expiresAt.toISOString(), token.expiresAt.toISOString());
  });

  it("dispatch cycle generates due-soon and overdue deadline notifications once", async () => {
    const owner = await createUser("deadline-owner@example.com");

    await prisma.deadline.create({
      data: {
        id: "dl-due-soon",
        title: "Due Soon Deadline",
        dueDate: "2026-04-26",
        status: "OPEN",
        ownerUserId: owner.id,
        emailReminderEnabled: true,
        emailReminderDaysBefore: 7,
        evidence: []
      }
    });

    await prisma.deadline.create({
      data: {
        id: "dl-overdue",
        title: "Overdue Deadline",
        dueDate: "2026-04-18",
        status: "OPEN",
        ownerUserId: owner.id,
        emailReminderEnabled: false,
        evidence: []
      }
    });

    const firstRun = await runNotificationDispatchCycle(prisma, testConfig, {
      now: new Date("2026-04-19T08:00:00.000Z")
    });

    assert.equal(firstRun.generated, 2);
    assert.equal(firstRun.dispatch.sent, 2);
    assert.deepEqual(
      capturedNotifications.map((entry) => entry.eventType).sort(),
      ["DEADLINE_DUE_SOON", "DEADLINE_OVERDUE"]
    );

    const secondRun = await runNotificationDispatchCycle(prisma, testConfig, {
      now: new Date("2026-04-19T08:00:00.000Z")
    });

    assert.equal(secondRun.generated, 0);
    assert.equal(secondRun.dispatch.sent, 0);
    assert.equal(capturedNotifications.length, 2);
  });

  it("enqueues assignment notifications idempotently across the same deadline state", async () => {
    const owner = await createUser("assignment-owner@example.com");
    const deputy = await createUser("assignment-deputy@example.com");

    await prisma.deadline.create({
      data: {
        id: "dl-assignment",
        title: "Assigned Deadline",
        dueDate: "2026-05-01",
        status: "OPEN",
        ownerUserId: owner.id,
        evidence: []
      }
    });

    const firstCreate = await enqueueDeadlineAssignmentNotificationsForChange(prisma, "dl-assignment", {
      ownerUserId: null,
      deputyUserId: null
    });
    assert.equal(firstCreate, 1);

    const duplicateCreate = await enqueueDeadlineAssignmentNotificationsForChange(prisma, "dl-assignment", {
      ownerUserId: null,
      deputyUserId: null
    });
    assert.equal(duplicateCreate, 0);

    await prisma.deadline.update({
      where: {
        id: "dl-assignment"
      },
      data: {
        deputyUserId: deputy.id
      }
    });

    const deputyCreate = await enqueueDeadlineAssignmentNotificationsForChange(prisma, "dl-assignment", {
      ownerUserId: owner.id,
      deputyUserId: null
    });
    assert.equal(deputyCreate, 1);
  });

  it("parallel dispatchers do not double-send the same queued notification", async () => {
    const recipient = await createUser("parallel-recipient@example.com");

    await prisma.notificationOutbox.create({
      data: {
        eventType: "ASSIGNMENT_ASSIGNED",
        entityType: "PROJECT",
        entityId: "project-123",
        recipientUserId: recipient.id,
        recipientEmail: recipient.email,
        recipientName: "Test User",
        subject: "Parallel dispatch",
        payloadJson: {
          title: "Parallel dispatch",
          message: "Only one dispatcher should send this message.",
          severity: "INFO",
          linkPath: "/compliance/projects/project-123",
          entity: {
            type: "PROJECT",
            id: "project-123",
            label: "Project 123"
          }
        },
        status: "PENDING",
        scheduledFor: new Date("2026-04-19T08:00:00.000Z"),
        idempotencyKey: "parallel-dispatch-project-123"
      }
    });

    await Promise.all([
      dispatchPendingNotifications(prisma, testConfig, {
        now: new Date("2026-04-19T08:00:00.000Z"),
        batchSize: 1
      }),
      dispatchPendingNotifications(prisma, testConfig, {
        now: new Date("2026-04-19T08:00:00.000Z"),
        batchSize: 1
      })
    ]);

    assert.equal(capturedNotifications.length, 1);
    const row = await prisma.notificationOutbox.findFirstOrThrow({
      where: {
        idempotencyKey: "parallel-dispatch-project-123"
      }
    });
    assert.equal(row.status, "SENT");
    assert.equal(row.attemptCount, 1);
  });

  it("does not finalize a notification when the worker loses its claim to admin cancellation", async () => {
    const recipient = await createUser("lost-claim-cancel@example.com");
    const queued = await prisma.notificationOutbox.create({
      data: {
        eventType: "ASSIGNMENT_ASSIGNED",
        entityType: "PROJECT",
        entityId: "project-lost-claim-cancel",
        recipientUserId: recipient.id,
        recipientEmail: recipient.email,
        recipientName: "Lost Claim Cancel",
        subject: "Lost claim cancel",
        payloadJson: {
          title: "Lost claim cancel",
          message: "This dispatch will lose its claim.",
          severity: "INFO",
          linkPath: "/compliance/projects/project-lost-claim-cancel"
        },
        status: "PENDING",
        scheduledFor: new Date("2026-04-19T08:00:00.000Z"),
        idempotencyKey: "lost-claim-cancel"
      }
    });

    const result = await dispatchPendingNotifications(
      prisma,
      {
        ...testConfig,
        powerAutomateNotificationWebhookUrl: `${webhookBaseUrl}/cancel-before-success`
      },
      {
        now: new Date("2026-04-19T08:00:00.000Z"),
        batchSize: 1
      }
    );

    assert.equal(result.claimed, 1);
    assert.equal(result.sent, 0);
    assert.equal(result.failed, 0);
    assert.equal(result.retried, 0);
    assert.equal(result.cancelled, 0);

    const row = await prisma.notificationOutbox.findUniqueOrThrow({
      where: {
        id: queued.id
      }
    });
    assert.equal(row.status, "CANCELLED");
    assert.equal(row.claimToken, null);
    assert.equal(
      await prisma.notificationDeliveryAttempt.count({
        where: {
          notificationId: queued.id
        }
      }),
      0
    );
  });

  it("does not finalize a notification when another worker has reclaimed it", async () => {
    const recipient = await createUser("lost-claim-reclaim@example.com");
    const queued = await prisma.notificationOutbox.create({
      data: {
        eventType: "ASSIGNMENT_ASSIGNED",
        entityType: "PROJECT",
        entityId: "project-lost-claim-reclaim",
        recipientUserId: recipient.id,
        recipientEmail: recipient.email,
        recipientName: "Lost Claim Reclaim",
        subject: "Lost claim reclaim",
        payloadJson: {
          title: "Lost claim reclaim",
          message: "This dispatch will be reclaimed.",
          severity: "INFO",
          linkPath: "/compliance/projects/project-lost-claim-reclaim"
        },
        status: "PENDING",
        scheduledFor: new Date("2026-04-19T08:00:00.000Z"),
        idempotencyKey: "lost-claim-reclaim"
      }
    });

    const result = await dispatchPendingNotifications(
      prisma,
      {
        ...testConfig,
        powerAutomateNotificationWebhookUrl: `${webhookBaseUrl}/reclaim-before-success`
      },
      {
        now: new Date("2026-04-19T08:00:00.000Z"),
        batchSize: 1
      }
    );

    assert.equal(result.claimed, 1);
    assert.equal(result.sent, 0);
    assert.equal(result.failed, 0);
    assert.equal(result.retried, 0);
    assert.equal(result.cancelled, 0);

    const row = await prisma.notificationOutbox.findUniqueOrThrow({
      where: {
        id: queued.id
      }
    });
    assert.equal(row.status, "CLAIMED");
    assert.equal(row.claimToken, "replacement-claim-token");
    assert.equal(
      await prisma.notificationDeliveryAttempt.count({
        where: {
          notificationId: queued.id
        }
      }),
      0
    );
  });

  it("revokes older password reset tokens only after a new reset link was delivered", async () => {
    const user = await createUser("reset-success@example.com");
    const existingToken = await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: `existing-success-${user.id}`,
        expiresAt: new Date(Date.now() + 60 * 60_000)
      }
    });

    const result = await createAndDispatchPasswordResetNotification(prisma, testConfig, {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        isArchived: user.isArchived,
        type: user.type
      },
      ttlMinutes: 120,
      now: fixedNow("2026-04-19T08:00:00.000Z")
    });

    assert.equal(result.deliveryStatus, "SENT");

    const existingTokenAfter = await prisma.passwordResetToken.findUniqueOrThrow({
      where: {
        id: existingToken.id
      }
    });
    assert.ok(existingTokenAfter.usedAt);

    const newestToken = await prisma.passwordResetToken.findFirstOrThrow({
      where: {
        userId: user.id
      },
      orderBy: {
        createdAt: "desc"
      }
    });
    assert.equal(newestToken.usedAt, null);

    const outboxRow = await prisma.notificationOutbox.findUniqueOrThrow({
      where: {
        id: result.notificationId
      }
    });
    assert.equal(outboxRow.status, "SENT");
  });

  it("keeps a newer reset token active when an older dispatch finishes later", async () => {
    const user = await createUser("reset-parallel@example.com");
    let releaseSlowResponse: () => void = () => {};
    slowResponseGate = new Promise<void>((resolve) => {
      releaseSlowResponse = resolve;
    });
    const slowRequestReceived = new Promise<void>((resolve) => {
      notifySlowRequestReceived = resolve;
    });

    const olderDispatch = createAndDispatchPasswordResetNotification(
      prisma,
      {
        ...testConfig,
        powerAutomateNotificationWebhookUrl: `${webhookBaseUrl}/slow-reset`
      },
      {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          isArchived: user.isArchived,
          type: user.type
        },
        ttlMinutes: 120,
        now: fixedNow("2026-04-19T08:00:00.000Z")
      }
    );

    await slowRequestReceived;

    const newerResult = await createAndDispatchPasswordResetNotification(prisma, testConfig, {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        isArchived: user.isArchived,
        type: user.type
      },
      ttlMinutes: 120,
      now: fixedNow("2026-04-19T08:01:00.000Z")
    });

    releaseSlowResponse();
    const olderResult = await olderDispatch;

    assert.equal(newerResult.deliveryStatus, "SENT");
    assert.equal(olderResult.deliveryStatus, "SENT");

    const newerOutbox = await prisma.notificationOutbox.findUniqueOrThrow({
      where: {
        id: newerResult.notificationId
      }
    });
    const olderOutbox = await prisma.notificationOutbox.findUniqueOrThrow({
      where: {
        id: olderResult.notificationId
      }
    });
    const newerTokenId = newerOutbox.idempotencyKey.replace("password-reset:", "");
    const olderTokenId = olderOutbox.idempotencyKey.replace("password-reset:", "");

    const newerToken = await prisma.passwordResetToken.findUniqueOrThrow({
      where: {
        id: newerTokenId
      }
    });
    const olderToken = await prisma.passwordResetToken.findUniqueOrThrow({
      where: {
        id: olderTokenId
      }
    });

    assert.equal(newerToken.usedAt, null);
    assert.ok(olderToken.usedAt);
  });

  it("serializes password reset token timestamps per user when requests share the same requested time", async () => {
    const user = await createUser("reset-same-now@example.com");
    let releaseSlowResponse: () => void = () => {};
    slowResponseGate = new Promise<void>((resolve) => {
      releaseSlowResponse = resolve;
    });
    const slowRequestReceived = new Promise<void>((resolve) => {
      notifySlowRequestReceived = resolve;
    });
    const sharedNow = new Date("2026-04-19T08:00:00.000Z");

    const olderDispatch = createAndDispatchPasswordResetNotification(
      prisma,
      {
        ...testConfig,
        powerAutomateNotificationWebhookUrl: `${webhookBaseUrl}/slow-reset`
      },
      {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          isArchived: user.isArchived,
          type: user.type
        },
        ttlMinutes: 120,
        now: fixedNow(sharedNow)
      }
    );

    await slowRequestReceived;

    const newerResult = await createAndDispatchPasswordResetNotification(prisma, testConfig, {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        isArchived: user.isArchived,
        type: user.type
      },
      ttlMinutes: 120,
      now: fixedNow(sharedNow)
    });

    releaseSlowResponse();
    const olderResult = await olderDispatch;

    assert.equal(olderResult.deliveryStatus, "SENT");
    assert.equal(newerResult.deliveryStatus, "SENT");

    const tokens = await prisma.passwordResetToken.findMany({
      where: {
        userId: user.id
      },
      orderBy: [
        {
          createdAt: "asc"
        },
        {
          id: "asc"
        }
      ]
    });

    assert.equal(tokens.length, 2);
    assert.ok(tokens[0].createdAt.getTime() < tokens[1].createdAt.getTime());

    const olderOutbox = await prisma.notificationOutbox.findUniqueOrThrow({
      where: {
        id: olderResult.notificationId
      }
    });
    const newerOutbox = await prisma.notificationOutbox.findUniqueOrThrow({
      where: {
        id: newerResult.notificationId
      }
    });

    const olderToken = await prisma.passwordResetToken.findUniqueOrThrow({
      where: {
        id: olderOutbox.idempotencyKey.replace("password-reset:", "")
      }
    });
    const newerToken = await prisma.passwordResetToken.findUniqueOrThrow({
      where: {
        id: newerOutbox.idempotencyKey.replace("password-reset:", "")
      }
    });

    assert.ok(olderToken.usedAt);
    assert.equal(newerToken.usedAt, null);
    assert.equal(olderToken.expiresAt.getTime() - olderToken.createdAt.getTime(), 120 * 60_000);
    assert.equal(newerToken.expiresAt.getTime() - newerToken.createdAt.getTime(), 120 * 60_000);
    assert.equal(olderResult.expiresAt.toISOString(), olderToken.expiresAt.toISOString());
    assert.equal(newerResult.expiresAt.toISOString(), newerToken.expiresAt.toISOString());
  });

  it("evaluates a caller-provided reset timestamp only after the user lock is acquired", async () => {
    const user = await createUser("reset-lock-wait@example.com");
    const lockingClient = new PrismaClient({
      datasources: {
        db: {
          url: testConfig.databaseUrl
        }
      }
    });
    let releaseLock: () => void = () => {};
    const lockReleased = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });
    let signalLockAcquired: () => void = () => {};
    const lockAcquired = new Promise<void>((resolve) => {
      signalLockAcquired = resolve;
    });

    const lockingTransaction = lockingClient.$transaction(async (tx) => {
      await tx.$executeRaw(
        Prisma.sql`SELECT 1 FROM "User" WHERE "id" = ${user.id} FOR UPDATE`
      );
      signalLockAcquired();
      await lockReleased;
    });

    await lockAcquired;

    try {
      const requestStartedAt = Date.now();
      let nowCallCount = 0;
      const dispatchPromise = createAndDispatchPasswordResetNotification(prisma, testConfig, {
        user: {
          id: user.id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          isArchived: user.isArchived,
          type: user.type
        },
        ttlMinutes: 120,
        now: () => {
          nowCallCount += 1;
          return new Date();
        }
      });

      await new Promise((resolve) => {
        setTimeout(resolve, 100);
      });
      releaseLock();

      const result = await dispatchPromise;
      assert.equal(result.deliveryStatus, "SENT");

      const outboxRow = await prisma.notificationOutbox.findUniqueOrThrow({
        where: {
          id: result.notificationId
        }
      });
      const token = await prisma.passwordResetToken.findUniqueOrThrow({
        where: {
          id: outboxRow.idempotencyKey.replace("password-reset:", "")
        }
      });

      assert.equal(nowCallCount, 1);
      assert.ok(
        token.createdAt.getTime() >= requestStartedAt + 75,
        `Expected post-lock token creation time, got ${token.createdAt.toISOString()}`
      );
      assert.equal(token.expiresAt.getTime() - token.createdAt.getTime(), 120 * 60_000);
      assert.equal(result.expiresAt.toISOString(), token.expiresAt.toISOString());
      assert.equal(outboxRow.scheduledFor.toISOString(), token.createdAt.toISOString());
      assert.equal(outboxRow.claimedAt?.toISOString(), token.createdAt.toISOString());
      assert.equal(outboxRow.lastAttemptAt?.toISOString(), token.createdAt.toISOString());
    } finally {
      releaseLock();
      await lockingTransaction;
      await lockingClient.$disconnect();
    }
  });

  it("does not use token id ordering to invalidate reset tokens with equal createdAt", async () => {
    const user = await createUser("reset-equal-created-at@example.com");
    const createdAt = new Date("2026-04-19T08:00:00.000Z");
    const sameTimeLexicographicallyHigherToken = await prisma.passwordResetToken.create({
      data: {
        id: "reset-token-z",
        userId: user.id,
        tokenHash: `same-time-higher-${user.id}`,
        expiresAt: new Date("2026-04-19T10:00:00.000Z"),
        createdAt
      }
    });
    const currentToken = await prisma.passwordResetToken.create({
      data: {
        id: "reset-token-a",
        userId: user.id,
        tokenHash: `same-time-current-${user.id}`,
        expiresAt: new Date("2026-04-19T10:00:00.000Z"),
        createdAt
      }
    });
    const trulyOlderToken = await prisma.passwordResetToken.create({
      data: {
        id: "reset-token-old",
        userId: user.id,
        tokenHash: `truly-older-${user.id}`,
        expiresAt: new Date("2026-04-19T10:00:00.000Z"),
        createdAt: new Date("2026-04-19T07:59:59.999Z")
      }
    });

    await invalidateOlderPasswordResetTokens(prisma, {
      userId: user.id,
      currentTokenId: currentToken.id,
      currentTokenCreatedAt: currentToken.createdAt,
      usedAt: new Date("2026-04-19T08:01:00.000Z")
    });

    const sameTimeAfter = await prisma.passwordResetToken.findUniqueOrThrow({
      where: {
        id: sameTimeLexicographicallyHigherToken.id
      }
    });
    const currentAfter = await prisma.passwordResetToken.findUniqueOrThrow({
      where: {
        id: currentToken.id
      }
    });
    const trulyOlderAfter = await prisma.passwordResetToken.findUniqueOrThrow({
      where: {
        id: trulyOlderToken.id
      }
    });

    assert.equal(sameTimeAfter.usedAt, null);
    assert.equal(currentAfter.usedAt, null);
    assert.ok(trulyOlderAfter.usedAt);
  });

  it("keeps older password reset tokens active when delivery fails definitively", async () => {
    const user = await createUser("reset-failure@example.com");
    const existingToken = await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: `existing-failure-${user.id}`,
        expiresAt: new Date(Date.now() + 60 * 60_000)
      }
    });
    const failingConfig: AppConfig = {
      ...testConfig,
      powerAutomateNotificationWebhookUrl: ""
    };

    const result = await createAndDispatchPasswordResetNotification(prisma, failingConfig, {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        isArchived: user.isArchived,
        type: user.type
      },
      ttlMinutes: 120,
      now: fixedNow("2026-04-19T08:00:00.000Z")
    });

    assert.equal(result.deliveryStatus, "FAILED");

    const existingTokenAfter = await prisma.passwordResetToken.findUniqueOrThrow({
      where: {
        id: existingToken.id
      }
    });
    assert.equal(existingTokenAfter.usedAt, null);

    const storedToken = await prisma.passwordResetToken.findFirstOrThrow({
      where: {
        userId: user.id
      },
      orderBy: {
        createdAt: "desc"
      }
    });
    assert.ok(storedToken.usedAt);

    const outboxRow = await prisma.notificationOutbox.findUniqueOrThrow({
      where: {
        id: result.notificationId
      }
    });
    assert.equal(outboxRow.status, "FAILED");
  });

  it("keeps both older and newly issued reset tokens active when delivery outcome is unknown", async () => {
    const user = await createUser("reset-unknown@example.com");
    const existingToken = await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash: `existing-unknown-${user.id}`,
        expiresAt: new Date(Date.now() + 60 * 60_000)
      }
    });
    const failingConfig: AppConfig = {
      ...testConfig,
      powerAutomateNotificationWebhookUrl: "http://127.0.0.1:1/unreachable"
    };

    const result = await createAndDispatchPasswordResetNotification(prisma, failingConfig, {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        isArchived: user.isArchived,
        type: user.type
      },
      ttlMinutes: 120,
      now: fixedNow("2026-04-19T08:00:00.000Z")
    });

    assert.equal(result.deliveryStatus, "FAILED");

    const existingTokenAfter = await prisma.passwordResetToken.findUniqueOrThrow({
      where: {
        id: existingToken.id
      }
    });
    assert.equal(existingTokenAfter.usedAt, null);

    const newestToken = await prisma.passwordResetToken.findFirstOrThrow({
      where: {
        userId: user.id
      },
      orderBy: {
        createdAt: "desc"
      }
    });
    assert.equal(newestToken.usedAt, null);

    const outboxRow = await prisma.notificationOutbox.findUniqueOrThrow({
      where: {
        id: result.notificationId
      }
    });
    assert.equal(outboxRow.status, "FAILED");
  });
});
