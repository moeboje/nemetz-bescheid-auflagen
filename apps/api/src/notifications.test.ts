import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { after, before, beforeEach, describe, it } from "node:test";
import type { AddressInfo } from "node:net";
import { Prisma } from "@prisma/client";
import { type AppConfig, resolveDatabaseUrl } from "./config.js";
import {
  createAndDispatchPasswordResetNotification,
  dispatchPendingNotifications,
  enqueueDeadlineAssignmentNotificationsForChange,
  runNotificationDispatchCycle
} from "./notifications.js";
import { prisma } from "./prisma.js";
import { hashPassword } from "./security.js";

let notificationServer: http.Server;
let webhookBaseUrl = "";
const capturedNotifications: Array<Record<string, unknown>> = [];

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

describe("Notifications", () => {
  before(async () => {
    notificationServer = http.createServer((req, res) => {
      const chunks: Buffer[] = [];

      req.on("data", (chunk) => {
        chunks.push(Buffer.from(chunk));
      });

      req.on("end", () => {
        const body = chunks.length > 0 ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {};
        if (req.url === "/fail") {
          res.writeHead(500, {
            "Content-Type": "application/json"
          });
          res.end(JSON.stringify({ ok: false, message: "Simulated delivery failure" }));
          return;
        }
        capturedNotifications.push(body as Record<string, unknown>);
        res.writeHead(200, {
          "Content-Type": "application/json"
        });
        res.end(JSON.stringify({ ok: true, flowRunId: "flow-run-1" }));
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
      now: new Date("2026-04-19T08:00:00.000Z")
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
      now: new Date("2026-04-19T08:00:00.000Z")
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
      now: new Date("2026-04-19T08:00:00.000Z")
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
