import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { after, before, beforeEach, describe, it } from "node:test";
import type { AddressInfo } from "node:net";
import { createApp } from "./app.js";
import { resolveDatabaseUrl, type AppConfig } from "./config.js";
import { prisma } from "./prisma.js";
import { dashboardSummaryTestInternals, todayDateOnlyInTimeZone } from "./routes/dashboard.js";
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

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

function todayDateOnlyLocal(now = new Date()) {
  return `${now.getFullYear()}-${padDatePart(now.getMonth() + 1)}-${padDatePart(now.getDate())}`;
}

function addDays(dateOnly: string, days: number) {
  const [year, month, day] = dateOnly.split("-").map((part) => Number(part));
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return `${date.getUTCFullYear()}-${padDatePart(date.getUTCMonth() + 1)}-${padDatePart(date.getUTCDate())}`;
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

async function createUser(args: {
  email: string;
  password: string;
  role: string;
  type?: "INTERNAL" | "EXTERNAL";
}) {
  return prisma.user.create({
    data: {
      firstName: "Dashboard",
      lastName: "Tester",
      email: args.email,
      role: args.role,
      type: args.type ?? "INTERNAL",
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

async function seedProject(title: string) {
  const company = await prisma.company.create({
    data: {
      name: `${title} Company`
    }
  });

  return prisma.project.create({
    data: {
      id: `dashboard-project-${randomUUID()}`,
      title,
      companyId: company.id,
      participantUserIds: [],
      internalParticipants: [],
      externalParticipants: [],
      attachments: [],
      dependsOnProjectIds: [],
      referenceLegalDocIds: []
    }
  });
}

async function seedLegalDocument(projectId: string, title: string) {
  return prisma.legalDocument.create({
    data: {
      id: `dashboard-legal-doc-${randomUUID()}`,
      projectId,
      type: "decision",
      title,
      shortDescription: "Short summary",
      detailedDescription: "Detailed description must not leak into dashboard summary.",
      contentSummary: "Content summary must not leak into dashboard summary.",
      attachments: []
    }
  });
}

type TestDashboardObligationRow = Parameters<
  typeof dashboardSummaryTestInternals.collectRecurringOverdueDisplayCandidates
>[0]["obligations"][number];

function makeDashboardObligationRow(
  overrides: Partial<TestDashboardObligationRow>
): TestDashboardObligationRow {
  return {
    id: "dashboard-test-obligation",
    legalDocId: "dashboard-test-legal-doc",
    title: "Dashboard Test Obligation",
    level: "MANDATORY",
    scheduleType: "RECURRING",
    firstDueDate: "2026-05-01",
    recurrenceEndDate: "2026-05-31",
    intervalUnit: "DAY",
    intervalValue: 1,
    ownerUserId: null,
    deputyUserId: null,
    emailReminderEnabled: false,
    emailReminderDaysBefore: null,
    ownerUser: null,
    legalDocument: {
      id: "dashboard-test-legal-doc",
      projectId: "dashboard-test-project",
      scopeOverride: null,
      project: {
        id: "dashboard-test-project",
        title: "Dashboard Test Project",
        companyId: "dashboard-test-company",
        siteId: null,
        facilityId: null,
        company: {
          id: "dashboard-test-company",
          name: "Dashboard Test Company"
        },
        site: null,
        facility: null
      }
    },
    ...overrides
  } as TestDashboardObligationRow;
}

describe("Dashboard summary API", () => {
  it("derives dashboard date-only cutoffs from the configured time zone", () => {
    const aroundViennaMidnight = new Date("2026-05-19T22:30:00.000Z");

    assert.equal(todayDateOnlyInTimeZone(aroundViennaMidnight, "Europe/Vienna"), "2026-05-20");
    assert.equal(todayDateOnlyInTimeZone(aroundViennaMidnight, "UTC"), "2026-05-19");
  });

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
    await prisma.documentApprovalEvent.deleteMany();
    await prisma.documentApprovalRequest.deleteMany();
    await prisma.document.deleteMany();
    await prisma.taskStateEntry.deleteMany();
    await prisma.deadline.deleteMany();
    await prisma.obligation.deleteMany();
    await prisma.legalDocument.deleteMany();
    await prisma.projectAccess.deleteMany();
    await prisma.project.deleteMany();
    await prisma.company.deleteMany();
    await prisma.user.deleteMany();
    await prisma.externalOrganization.deleteMany();
    await prisma.role.deleteMany();
  });

  it("requires authentication", async () => {
    const response = await request("/dashboard/summary");
    assert.equal(response.status, 401);
  });

  it("requires dashboard.view", async () => {
    await createRole("DASHBOARD_NO_VIEW", ["tasks.view", "deadlines.view", "obligations.view"]);
    const user = await createUser({
      email: "dashboard-no-view@example.com",
      password: "ValidPassword1!",
      role: "DASHBOARD_NO_VIEW"
    });
    const cookie = await login(user.email, "ValidPassword1!");

    const response = await request("/dashboard/summary", { cookie });
    assert.equal(response.status, 403);
  });

  it("returns only scoped aggregate data without long texts or documents", async () => {
    await createRole("DASHBOARD_SCOPED", [
      "dashboard.view",
      "tasks.view",
      "deadlines.view",
      "obligations.view"
    ]);
    const user = await createUser({
      email: "dashboard-scoped@example.com",
      password: "ValidPassword1!",
      role: "DASHBOARD_SCOPED"
    });
    const allowedProject = await seedProject("Allowed Dashboard Project");
    const blockedProject = await seedProject("Blocked Dashboard Project");
    await prisma.projectAccess.create({
      data: {
        projectId: allowedProject.id,
        userId: user.id,
        accessRole: "PROJECT_VIEWER"
      }
    });

    const allowedDoc = await seedLegalDocument(allowedProject.id, "Allowed Dashboard Legal Doc");
    const blockedDoc = await seedLegalDocument(blockedProject.id, "Blocked Dashboard Legal Doc");
    const today = todayDateOnlyLocal();
    const overdueDate = addDays(today, -2);
    const dueSoonDate = addDays(today, 5);
    const doneDate = addDays(today, -1);

    await prisma.obligation.createMany({
      data: [
        {
          id: "dashboard-obligation-overdue",
          legalDocId: allowedDoc.id,
          title: "Allowed Overdue Obligation",
          infoTextLong: "Long obligation text must not be present.",
          level: "MANDATORY",
          scheduleType: "ONCE",
          firstDueDate: overdueDate,
          evidenceRequirements: {}
        },
        {
          id: "dashboard-obligation-due-soon",
          legalDocId: allowedDoc.id,
          title: "Allowed Due Soon Obligation",
          infoTextLong: "Another long obligation text must not be present.",
          level: "MANDATORY",
          scheduleType: "ONCE",
          firstDueDate: dueSoonDate,
          emailReminderEnabled: true,
          emailReminderDaysBefore: 5,
          evidenceRequirements: {}
        },
        {
          id: "dashboard-obligation-blocked",
          legalDocId: blockedDoc.id,
          title: "Blocked Overdue Obligation",
          infoTextLong: "Blocked long text",
          level: "MANDATORY",
          scheduleType: "ONCE",
          firstDueDate: overdueDate,
          evidenceRequirements: {}
        }
      ]
    });
    await prisma.deadline.createMany({
      data: [
        {
          id: "dashboard-deadline-overdue",
          title: "Allowed Overdue Deadline",
          description: "Deadline description must not be present.",
          dueDate: overdueDate,
          status: "OPEN",
          projectId: allowedProject.id,
          evidence: []
        },
        {
          id: "dashboard-deadline-due-soon",
          title: "Allowed Due Soon Deadline",
          description: "Deadline description must not be present.",
          dueDate: dueSoonDate,
          status: "OPEN",
          projectId: allowedProject.id,
          emailReminderEnabled: true,
          emailReminderDaysBefore: 5,
          evidence: []
        },
        {
          id: "dashboard-deadline-done",
          title: "Allowed Done Deadline",
          dueDate: doneDate,
          status: "DONE",
          projectId: allowedProject.id,
          completedAt: new Date(`${doneDate}T09:00:00.000Z`),
          evidence: []
        },
        {
          id: "dashboard-deadline-blocked",
          title: "Blocked Overdue Deadline",
          dueDate: overdueDate,
          status: "OPEN",
          projectId: blockedProject.id,
          evidence: []
        }
      ]
    });

    const cookie = await login(user.email, "ValidPassword1!");
    const response = await request("/dashboard/summary?limit=1", { cookie });
    assert.equal(response.status, 200);
    const payload = (await response.json()) as {
      stats: {
        openTasks: number;
        overdueTasks: number;
        tasksDueSoon: number;
        openDeadlines: number;
        overdueDeadlines: number;
        deadlinesDueSoon: number;
        openObligations: number;
        completionRatePercent: number;
      };
      overdueTasks: Array<{ title: string; dueDate: string }>;
      notifications: Array<{ title: string; dueDate: string }>;
    };

    assert.deepEqual(payload.stats, {
      openTasks: 2,
      overdueTasks: 2,
      tasksDueSoon: 2,
      openDeadlines: 2,
      overdueDeadlines: 1,
      deadlinesDueSoon: 1,
      openObligations: 2,
      completionRatePercent: 33
    });
    assert.equal(payload.overdueTasks.length, 1);
    assert.equal(payload.notifications.length, 1);

    const rawPayload = JSON.stringify(payload);
    assert.match(rawPayload, /Allowed/);
    assert.doesNotMatch(rawPayload, /Blocked/);
    assert.doesNotMatch(rawPayload, /infoTextLong/);
    assert.doesNotMatch(rawPayload, /Detailed description/);
    assert.doesNotMatch(rawPayload, /Content summary/);
    assert.doesNotMatch(rawPayload, /Deadline description/);
    assert.doesNotMatch(rawPayload, /documents/);
    assert.doesNotMatch(rawPayload, /storagePath/);
    assert.doesNotMatch(rawPayload, /evidence/);
  });

  it("counts obligation aggregates from the full visible scope while limiting overdue display rows", async () => {
    await createRole("DASHBOARD_OBLIGATION_AGGREGATES", [
      "dashboard.view",
      "tasks.view",
      "obligations.view"
    ]);
    const user = await createUser({
      email: "dashboard-obligation-aggregates@example.com",
      password: "ValidPassword1!",
      role: "DASHBOARD_OBLIGATION_AGGREGATES"
    });
    const allowedProject = await seedProject("Aggregate Allowed Project");
    const blockedProject = await seedProject("Aggregate Blocked Project");
    await prisma.projectAccess.create({
      data: {
        projectId: allowedProject.id,
        userId: user.id,
        accessRole: "PROJECT_VIEWER"
      }
    });
    const allowedDoc = await seedLegalDocument(allowedProject.id, "Aggregate Allowed Legal Doc");
    const blockedDoc = await seedLegalDocument(blockedProject.id, "Aggregate Blocked Legal Doc");
    const today = todayDateOnlyInTimeZone(new Date(), "Europe/Vienna");
    const dueSoonDate = addDays(today, 5);
    const oldOverdueDates = Array.from({ length: 65 }, (_, index) => addDays(today, -500 - index));

    await prisma.obligation.createMany({
      data: [
        ...Array.from({ length: 65 }, (_, index) => ({
          id: `dashboard-aggregate-due-soon-${index}`,
          legalDocId: allowedDoc.id,
          title: `Due Soon ${String(index).padStart(2, "0")}`,
          level: "MANDATORY",
          scheduleType: "ONCE",
          firstDueDate: dueSoonDate,
          evidenceRequirements: {}
        })),
        ...oldOverdueDates.map((dueDate, index) => ({
          id: `dashboard-aggregate-overdue-${index}`,
          legalDocId: allowedDoc.id,
          title: `Old Overdue ${String(index).padStart(2, "0")}`,
          level: "MANDATORY",
          scheduleType: "ONCE",
          firstDueDate: dueDate,
          evidenceRequirements: {}
        })),
        ...Array.from({ length: 10 }, (_, index) => ({
          id: `dashboard-aggregate-blocked-${index}`,
          legalDocId: blockedDoc.id,
          title: `Blocked ${String(index).padStart(2, "0")}`,
          level: "MANDATORY",
          scheduleType: "ONCE",
          firstDueDate: dueSoonDate,
          evidenceRequirements: {}
        }))
      ]
    });

    const cookie = await login(user.email, "ValidPassword1!");
    const response = await request("/dashboard/summary?limit=3", { cookie });
    assert.equal(response.status, 200);
    const payload = (await response.json()) as {
      stats: {
        openTasks: number;
        overdueTasks: number;
        tasksDueSoon: number;
      };
      overdueTasks: Array<{ title: string; dueDate: string }>;
    };

    assert.equal(payload.stats.openTasks, 65);
    assert.equal(payload.stats.tasksDueSoon, 65);
    assert.equal(payload.stats.overdueTasks, 65);
    assert.equal(payload.overdueTasks.length, 3);
    assert.deepEqual(
      payload.overdueTasks.map((task) => task.dueDate),
      [...oldOverdueDates].sort().slice(0, 3)
    );
    assert.doesNotMatch(JSON.stringify(payload), /Blocked/);
  });

  it("computes obligation completion rate from the full task-state source instead of a capped sample", async () => {
    await createRole("DASHBOARD_COMPLETION_AGGREGATES", [
      "dashboard.view",
      "tasks.view",
      "obligations.view"
    ]);
    const user = await createUser({
      email: "dashboard-completion-aggregates@example.com",
      password: "ValidPassword1!",
      role: "DASHBOARD_COMPLETION_AGGREGATES"
    });
    const project = await seedProject("Completion Aggregate Project");
    await prisma.projectAccess.create({
      data: {
        projectId: project.id,
        userId: user.id,
        accessRole: "PROJECT_VIEWER"
      }
    });
    const legalDocument = await seedLegalDocument(project.id, "Completion Aggregate Legal Doc");
    const today = todayDateOnlyInTimeZone(new Date(), "Europe/Vienna");
    const dueDate = addDays(today, -1);
    const doneCount = 50;
    const openCount = 10;

    await prisma.obligation.createMany({
      data: [
        ...Array.from({ length: doneCount }, (_, index) => ({
          id: `dashboard-completion-done-${index}`,
          legalDocId: legalDocument.id,
          title: `A Done ${String(index).padStart(2, "0")}`,
          level: "MANDATORY",
          scheduleType: "ONCE",
          firstDueDate: dueDate,
          evidenceRequirements: {}
        })),
        ...Array.from({ length: openCount }, (_, index) => ({
          id: `dashboard-completion-open-${index}`,
          legalDocId: legalDocument.id,
          title: `Z Open ${String(index).padStart(2, "0")}`,
          level: "MANDATORY",
          scheduleType: "ONCE",
          firstDueDate: dueDate,
          evidenceRequirements: {}
        }))
      ]
    });
    await prisma.taskStateEntry.createMany({
      data: Array.from({ length: doneCount }, (_, index) => ({
        taskInstanceId: `obligation:dashboard-completion-done-${index}:${dueDate}`,
        status: "DONE",
        completedAt: new Date(`${dueDate}T10:00:00.000Z`),
        evidence: []
      }))
    });

    const cookie = await login(user.email, "ValidPassword1!");
    const response = await request("/dashboard/summary?limit=1", { cookie });
    assert.equal(response.status, 200);
    const payload = (await response.json()) as {
      stats: {
        overdueTasks: number;
        completionRatePercent: number;
      };
    };

    assert.equal(payload.stats.overdueTasks, openCount);
    assert.equal(payload.stats.completionRatePercent, 83);
  });

  it("counts recurring obligation occurrences only in the bounded dashboard window and honors recurrenceEndDate", async () => {
    await createRole("DASHBOARD_RECURRENCE_AGGREGATES", [
      "dashboard.view",
      "tasks.view",
      "obligations.view"
    ]);
    const user = await createUser({
      email: "dashboard-recurrence-aggregates@example.com",
      password: "ValidPassword1!",
      role: "DASHBOARD_RECURRENCE_AGGREGATES"
    });
    const project = await seedProject("Recurrence Aggregate Project");
    await prisma.projectAccess.create({
      data: {
        projectId: project.id,
        userId: user.id,
        accessRole: "PROJECT_VIEWER"
      }
    });
    const legalDocument = await seedLegalDocument(project.id, "Recurrence Aggregate Legal Doc");
    const today = todayDateOnlyInTimeZone(new Date(), "Europe/Vienna");
    const startDate = addDays(today, -2);
    const doneDate = addDays(today, -1);
    const recurrenceEndDate = addDays(today, 2);

    await prisma.obligation.create({
      data: {
        id: "dashboard-recurrence-daily",
        legalDocId: legalDocument.id,
        title: "Daily Recurring Obligation",
        level: "MANDATORY",
        scheduleType: "RECURRING",
        firstDueDate: startDate,
        recurrenceEndDate,
        intervalUnit: "DAY",
        intervalValue: 1,
        evidenceRequirements: {}
      }
    });
    await prisma.taskStateEntry.create({
      data: {
        taskInstanceId: `obligation:dashboard-recurrence-daily:${doneDate}`,
        status: "DONE",
        completedAt: new Date(`${doneDate}T10:00:00.000Z`),
        evidence: []
      }
    });

    const cookie = await login(user.email, "ValidPassword1!");
    const response = await request("/dashboard/summary", { cookie });
    assert.equal(response.status, 200);
    const payload = (await response.json()) as {
      stats: {
        openTasks: number;
        overdueTasks: number;
        tasksDueSoon: number;
        completionRatePercent: number;
      };
    };

    assert.equal(payload.stats.openTasks, 3);
    assert.equal(payload.stats.overdueTasks, 1);
    assert.equal(payload.stats.tasksDueSoon, 3);
    assert.equal(payload.stats.completionRatePercent, 33);
  });

  it("computes daily recurring obligation aggregates without relying on materialized occurrence task ids", async () => {
    await createRole("DASHBOARD_DAILY_RECURRENCE_COUNTS", [
      "dashboard.view",
      "tasks.view",
      "obligations.view"
    ]);
    const user = await createUser({
      email: "dashboard-daily-recurrence@example.com",
      password: "ValidPassword1!",
      role: "DASHBOARD_DAILY_RECURRENCE_COUNTS"
    });
    const project = await seedProject("Daily Recurrence Project");
    await prisma.projectAccess.create({
      data: {
        projectId: project.id,
        userId: user.id,
        accessRole: "PROJECT_VIEWER"
      }
    });
    const legalDocument = await seedLegalDocument(project.id, "Daily Recurrence Legal Doc");
    const today = todayDateOnlyInTimeZone(new Date(), "Europe/Vienna");
    const startDate = addDays(today, -365);
    const recurrenceEndDate = addDays(today, 365);
    const donePastDate = addDays(today, -30);
    const doneFutureDate = addDays(today, 10);
    const obligationCount = 25;
    const donePastCount = 5;
    const doneFutureCount = 7;

    await prisma.obligation.createMany({
      data: Array.from({ length: obligationCount }, (_, index) => ({
        id: `dashboard-daily-recurring-${index}`,
        legalDocId: legalDocument.id,
        title: `Daily Recurring ${String(index).padStart(2, "0")}`,
        level: "MANDATORY",
        scheduleType: "RECURRING",
        firstDueDate: startDate,
        recurrenceEndDate,
        intervalUnit: "DAY",
        intervalValue: 1,
        evidenceRequirements: {}
      }))
    });
    await prisma.taskStateEntry.createMany({
      data: [
        ...Array.from({ length: donePastCount }, (_, index) => ({
          taskInstanceId: `obligation:dashboard-daily-recurring-${index}:${donePastDate}`,
          status: "DONE",
          completedAt: new Date(`${donePastDate}T10:00:00.000Z`),
          evidence: []
        })),
        ...Array.from({ length: doneFutureCount }, (_, index) => ({
          taskInstanceId: `obligation:dashboard-daily-recurring-${donePastCount + index}:${doneFutureDate}`,
          status: "DONE",
          completedAt: new Date(`${doneFutureDate}T10:00:00.000Z`),
          evidence: []
        }))
      ]
    });

    const cookie = await login(user.email, "ValidPassword1!");
    const response = await request("/dashboard/summary?limit=1", { cookie });
    assert.equal(response.status, 200);
    const payload = (await response.json()) as {
      stats: {
        openTasks: number;
        overdueTasks: number;
        tasksDueSoon: number;
        completionRatePercent: number;
      };
    };

    assert.equal(payload.stats.openTasks, obligationCount * 366 - doneFutureCount);
    assert.equal(payload.stats.overdueTasks, obligationCount * 365 - donePastCount);
    assert.equal(payload.stats.tasksDueSoon, obligationCount * 31 - doneFutureCount);
    assert.equal(payload.stats.completionRatePercent, 0);
  });

  it("bounds daily recurring display candidates without materializing the full summary window", async () => {
    const project = await seedProject("Bounded Display Project");
    const legalDocument = await seedLegalDocument(project.id, "Bounded Display Legal Doc");
    const today = todayDateOnlyInTimeZone(new Date(), "Europe/Vienna");
    const startDate = addDays(today, -365);
    const recurrenceEndDate = addDays(today, 365);
    const obligationCount = 25;

    await prisma.obligation.createMany({
      data: Array.from({ length: obligationCount }, (_, index) => ({
        id: `dashboard-bounded-display-${index}`,
        legalDocId: legalDocument.id,
        title: `Bounded Display ${String(index).padStart(2, "0")}`,
        level: "MANDATORY",
        scheduleType: "RECURRING",
        firstDueDate: startDate,
        recurrenceEndDate,
        intervalUnit: "DAY",
        intervalValue: 1,
        evidenceRequirements: {}
      }))
    });

    const result = await dashboardSummaryTestInternals.loadOverdueObligationDisplayCandidates({
      prisma,
      accessScope: { projectIds: [project.id] },
      obligationBaseWhere: {
        isArchived: false,
        legalDocument: {
          projectId: project.id
        }
      },
      today,
      completionStart: startDate,
      limit: 1
    });
    const possibleFullExpansion = obligationCount * 365;

    assert.equal(result.tasks.length, obligationCount);
    assert.equal(result.diagnostics.occurrenceCandidatesScanned, obligationCount);
    assert.ok(result.diagnostics.occurrenceCandidatesScanned < possibleFullExpansion);
    assert.ok(result.tasks.length <= dashboardSummaryTestInternals.displayCandidateScanLimit(1));
  });

  it("stops bounded recurring display scans when no open candidate is reachable", () => {
    const today = "2026-05-20";
    const completionStart = addDays(today, -10);
    const overdueEnd = addDays(today, -1);
    const obligation = makeDashboardObligationRow({
      id: "dashboard-guard-recurring",
      firstDueDate: completionStart,
      recurrenceEndDate: overdueEnd,
      intervalUnit: "DAY",
      intervalValue: 1
    });
    const doneIds = new Set(
      Array.from({ length: 10 }, (_, index) =>
        dashboardSummaryTestInternals.buildObligationTaskInstanceId(
          "dashboard-guard-recurring",
          addDays(completionStart, index)
        )
      )
    );

    const result = dashboardSummaryTestInternals.collectRecurringOverdueDisplayCandidates({
      obligations: [obligation],
      today,
      completionStart,
      overdueEnd,
      completedTaskInstanceIds: doneIds,
      maxOccurrenceScans: 3
    });

    assert.deepEqual(result.tasks, []);
    assert.equal(result.diagnostics.occurrenceCandidatesScanned, 3);
    assert.equal(result.diagnostics.guardReached, true);
  });

  it("checks only bounded display TaskState IDs and advances recurring DONE candidates", async () => {
    await createRole("DASHBOARD_RECURRING_DISPLAY_ADVANCE", [
      "dashboard.view",
      "tasks.view",
      "obligations.view"
    ]);
    const user = await createUser({
      email: "dashboard-recurring-display-advance@example.com",
      password: "ValidPassword1!",
      role: "DASHBOARD_RECURRING_DISPLAY_ADVANCE"
    });
    const project = await seedProject("Recurring Display Advance Project");
    await prisma.projectAccess.create({
      data: {
        projectId: project.id,
        userId: user.id,
        accessRole: "PROJECT_VIEWER"
      }
    });
    const legalDocument = await seedLegalDocument(project.id, "Recurring Display Advance Legal Doc");
    const today = todayDateOnlyInTimeZone(new Date(), "Europe/Vienna");
    const firstOverdueDate = addDays(today, -2);
    const nextOpenDate = addDays(today, -1);
    const recurrenceEndDate = addDays(today, 10);

    await prisma.obligation.create({
      data: {
        id: "dashboard-recurring-display-advance",
        legalDocId: legalDocument.id,
        title: "Recurring Display Advance",
        level: "MANDATORY",
        scheduleType: "RECURRING",
        firstDueDate: firstOverdueDate,
        recurrenceEndDate,
        intervalUnit: "DAY",
        intervalValue: 1,
        evidenceRequirements: {}
      }
    });
    await prisma.taskStateEntry.create({
      data: {
        taskInstanceId: `obligation:dashboard-recurring-display-advance:${firstOverdueDate}`,
        status: "DONE",
        completedAt: new Date(`${firstOverdueDate}T10:00:00.000Z`),
        evidence: []
      }
    });

    const displayResult = await dashboardSummaryTestInternals.loadOverdueObligationDisplayCandidates({
      prisma,
      accessScope: { projectIds: [project.id] },
      obligationBaseWhere: {
        isArchived: false,
        legalDocument: {
          projectId: project.id
        }
      },
      today,
      completionStart: addDays(today, -365),
      limit: 1
    });
    assert.deepEqual(displayResult.tasks.map((task) => task.dueDate), [nextOpenDate]);
    assert.equal(displayResult.diagnostics.taskStateIdsRequested, 1);
    assert.equal(displayResult.diagnostics.occurrenceCandidatesScanned, 2);

    const cookie = await login(user.email, "ValidPassword1!");
    const response = await request("/dashboard/summary?limit=1", { cookie });
    assert.equal(response.status, 200);
    const payload = (await response.json()) as {
      overdueTasks: Array<{ title: string; dueDate: string }>;
    };

    assert.deepEqual(payload.overdueTasks.map((task) => [task.title, task.dueDate]), [
      ["Recurring Display Advance", nextOpenDate]
    ]);
  });

  it("pages recurring overdue display candidates past completed rows", async () => {
    await createRole("DASHBOARD_RECURRING_DISPLAY_PAGE_DONE", [
      "dashboard.view",
      "tasks.view",
      "obligations.view"
    ]);
    const user = await createUser({
      email: "dashboard-recurring-display-page-done@example.com",
      password: "ValidPassword1!",
      role: "DASHBOARD_RECURRING_DISPLAY_PAGE_DONE"
    });
    const project = await seedProject("Recurring Display Page Done Project");
    await prisma.projectAccess.create({
      data: {
        projectId: project.id,
        userId: user.id,
        accessRole: "PROJECT_VIEWER"
      }
    });
    const legalDocument = await seedLegalDocument(project.id, "Recurring Display Page Done Legal Doc");
    const today = todayDateOnlyInTimeZone(new Date(), "Europe/Vienna");
    const dueDate = addDays(today, -10);
    const doneCount = 55;

    await prisma.obligation.createMany({
      data: [
        ...Array.from({ length: doneCount }, (_, index) => ({
          id: `dashboard-recurring-page-done-${index}`,
          legalDocId: legalDocument.id,
          title: `A Done Recurring ${String(index).padStart(2, "0")}`,
          level: "MANDATORY",
          scheduleType: "RECURRING",
          firstDueDate: dueDate,
          recurrenceEndDate: dueDate,
          intervalUnit: "DAY",
          intervalValue: 1,
          evidenceRequirements: {}
        })),
        {
          id: "dashboard-recurring-page-open",
          legalDocId: legalDocument.id,
          title: "Z Open Recurring After Done Page",
          level: "MANDATORY",
          scheduleType: "RECURRING",
          firstDueDate: dueDate,
          recurrenceEndDate: dueDate,
          intervalUnit: "DAY",
          intervalValue: 1,
          evidenceRequirements: {}
        }
      ]
    });
    await prisma.taskStateEntry.createMany({
      data: Array.from({ length: doneCount }, (_, index) => ({
        taskInstanceId: `obligation:dashboard-recurring-page-done-${index}:${dueDate}`,
        status: "DONE",
        completedAt: new Date(`${dueDate}T10:00:00.000Z`),
        evidence: []
      }))
    });

    const cookie = await login(user.email, "ValidPassword1!");
    const response = await request("/dashboard/summary?limit=1", { cookie });
    assert.equal(response.status, 200);
    const payload = (await response.json()) as {
      stats: { overdueTasks: number };
      overdueTasks: Array<{ title: string; dueDate: string }>;
    };

    assert.equal(payload.stats.overdueTasks, 1);
    assert.deepEqual(payload.overdueTasks.map((task) => [task.title, task.dueDate]), [
      ["Z Open Recurring After Done Page", dueDate]
    ]);
  });

  it("keeps recurring overdue display scans bounded when all candidates are completed", async () => {
    const project = await seedProject("Recurring Display Guard Project");
    const legalDocument = await seedLegalDocument(project.id, "Recurring Display Guard Legal Doc");
    const today = todayDateOnlyInTimeZone(new Date(), "Europe/Vienna");
    const dueDate = addDays(today, -10);
    const scanLimit = dashboardSummaryTestInternals.displayCandidateScanLimit(10);
    const obligationCount = scanLimit + 5;

    await prisma.obligation.createMany({
      data: Array.from({ length: obligationCount }, (_, index) => ({
        id: `dashboard-recurring-guard-completed-${index}`,
        legalDocId: legalDocument.id,
        title: `A Completed Guard ${String(index).padStart(3, "0")}`,
        level: "MANDATORY",
        scheduleType: "RECURRING",
        firstDueDate: dueDate,
        recurrenceEndDate: dueDate,
        intervalUnit: "DAY",
        intervalValue: 1,
        evidenceRequirements: {}
      }))
    });
    await prisma.taskStateEntry.createMany({
      data: Array.from({ length: obligationCount }, (_, index) => ({
        taskInstanceId: `obligation:dashboard-recurring-guard-completed-${index}:${dueDate}`,
        status: "DONE",
        completedAt: new Date(`${dueDate}T10:00:00.000Z`),
        evidence: []
      }))
    });

    const result = await dashboardSummaryTestInternals.loadOverdueObligationDisplayCandidates({
      prisma,
      accessScope: { projectIds: [project.id] },
      obligationBaseWhere: {
        isArchived: false,
        legalDocument: {
          projectId: project.id
        }
      },
      today,
      completionStart: addDays(today, -365),
      limit: 10
    });

    assert.deepEqual(result.tasks, []);
    assert.equal(result.diagnostics.rowsScanned, scanLimit);
    assert.equal(result.diagnostics.guardReached, true);
  });

  it("computes weekly recurring obligation aggregates and subtracts completed task states by window", async () => {
    await createRole("DASHBOARD_WEEKLY_RECURRENCE_COUNTS", [
      "dashboard.view",
      "tasks.view",
      "obligations.view"
    ]);
    const user = await createUser({
      email: "dashboard-weekly-recurrence@example.com",
      password: "ValidPassword1!",
      role: "DASHBOARD_WEEKLY_RECURRENCE_COUNTS"
    });
    const project = await seedProject("Weekly Recurrence Project");
    await prisma.projectAccess.create({
      data: {
        projectId: project.id,
        userId: user.id,
        accessRole: "PROJECT_VIEWER"
      }
    });
    const legalDocument = await seedLegalDocument(project.id, "Weekly Recurrence Legal Doc");
    const today = todayDateOnlyInTimeZone(new Date(), "Europe/Vienna");
    const startDate = addDays(today, -14);
    const donePastDate = addDays(today, -7);
    const doneFutureDate = addDays(today, 7);
    const recurrenceEndDate = addDays(today, 28);

    await prisma.obligation.createMany({
      data: [0, 1].map((index) => ({
        id: `dashboard-weekly-recurring-${index}`,
        legalDocId: legalDocument.id,
        title: `Weekly Recurring ${index}`,
        level: "MANDATORY",
        scheduleType: "RECURRING",
        firstDueDate: startDate,
        recurrenceEndDate,
        intervalUnit: "WEEK",
        intervalValue: 1,
        evidenceRequirements: {}
      }))
    });
    await prisma.taskStateEntry.createMany({
      data: [
        {
          taskInstanceId: `obligation:dashboard-weekly-recurring-0:${donePastDate}`,
          status: "DONE",
          completedAt: new Date(`${donePastDate}T10:00:00.000Z`),
          evidence: []
        },
        {
          taskInstanceId: `obligation:dashboard-weekly-recurring-1:${doneFutureDate}`,
          status: "DONE",
          completedAt: new Date(`${doneFutureDate}T10:00:00.000Z`),
          evidence: []
        }
      ]
    });

    const cookie = await login(user.email, "ValidPassword1!");
    const response = await request("/dashboard/summary?limit=10", { cookie });
    assert.equal(response.status, 200);
    const payload = (await response.json()) as {
      stats: {
        openTasks: number;
        overdueTasks: number;
        tasksDueSoon: number;
        completionRatePercent: number;
      };
    };

    assert.equal(payload.stats.openTasks, 9);
    assert.equal(payload.stats.overdueTasks, 3);
    assert.equal(payload.stats.tasksDueSoon, 9);
    assert.equal(payload.stats.completionRatePercent, 17);
  });

  it("computes recurring completion rate from all valid task states instead of the display sample", async () => {
    await createRole("DASHBOARD_RECURRING_COMPLETION_FULL_SCOPE", [
      "dashboard.view",
      "tasks.view",
      "obligations.view"
    ]);
    const user = await createUser({
      email: "dashboard-recurring-completion@example.com",
      password: "ValidPassword1!",
      role: "DASHBOARD_RECURRING_COMPLETION_FULL_SCOPE"
    });
    const project = await seedProject("Recurring Completion Project");
    await prisma.projectAccess.create({
      data: {
        projectId: project.id,
        userId: user.id,
        accessRole: "PROJECT_VIEWER"
      }
    });
    const legalDocument = await seedLegalDocument(project.id, "Recurring Completion Legal Doc");
    const today = todayDateOnlyInTimeZone(new Date(), "Europe/Vienna");
    const obligationCount = 20;
    const doneCount = 8;

    await prisma.obligation.createMany({
      data: Array.from({ length: obligationCount }, (_, index) => ({
        id: `dashboard-recurring-completion-${index}`,
        legalDocId: legalDocument.id,
        title: `${index < doneCount ? "A Done" : "Z Open"} Recurring ${String(index).padStart(2, "0")}`,
        level: "MANDATORY",
        scheduleType: "RECURRING",
        firstDueDate: today,
        recurrenceEndDate: today,
        intervalUnit: "WEEK",
        intervalValue: 1,
        evidenceRequirements: {}
      }))
    });
    await prisma.taskStateEntry.createMany({
      data: [
        ...Array.from({ length: doneCount }, (_, index) => ({
          taskInstanceId: `obligation:dashboard-recurring-completion-${index}:${today}`,
          status: "DONE",
          completedAt: new Date(`${today}T10:00:00.000Z`),
          evidence: []
        })),
        {
          taskInstanceId: `obligation:dashboard-recurring-completion-0:${addDays(today, 7)}`,
          status: "DONE",
          completedAt: new Date(`${today}T10:00:00.000Z`),
          evidence: []
        }
      ]
    });

    const cookie = await login(user.email, "ValidPassword1!");
    const response = await request("/dashboard/summary?limit=1", { cookie });
    assert.equal(response.status, 200);
    const payload = (await response.json()) as {
      stats: {
        openTasks: number;
        tasksDueSoon: number;
        completionRatePercent: number;
      };
    };

    assert.equal(payload.stats.openTasks, obligationCount - doneCount);
    assert.equal(payload.stats.tasksDueSoon, obligationCount - doneCount);
    assert.equal(payload.stats.completionRatePercent, 40);
  });

  it("processes recurring obligation aggregates in keyset chunks and scopes completed task states per chunk", async () => {
    const project = await seedProject("Recurring Chunk Aggregate Project");
    const legalDocument = await seedLegalDocument(project.id, "Recurring Chunk Aggregate Legal Doc");
    const today = todayDateOnlyInTimeZone(new Date(), "Europe/Vienna");
    const batchSize = dashboardSummaryTestInternals.recurringAggregateBatchSize;
    const obligationCount = batchSize + 7;
    const doneIndexes = [0, 1, 2, batchSize, batchSize + 1, obligationCount - 1];
    const obligationId = (index: number) => `dashboard-chunk-recurring-${String(index).padStart(4, "0")}`;

    await prisma.obligation.createMany({
      data: Array.from({ length: obligationCount }, (_, index) => ({
        id: obligationId(index),
        legalDocId: legalDocument.id,
        title: `Chunk Recurring ${String(index).padStart(4, "0")}`,
        level: "MANDATORY",
        scheduleType: "RECURRING",
        firstDueDate: today,
        recurrenceEndDate: today,
        intervalUnit: "DAY",
        intervalValue: 1,
        evidenceRequirements: {}
      }))
    });
    await prisma.taskStateEntry.createMany({
      data: [
        ...doneIndexes.map((index) => ({
          taskInstanceId: `obligation:${obligationId(index)}:${today}`,
          status: "DONE",
          completedAt: new Date(`${today}T10:00:00.000Z`),
          evidence: []
        })),
        {
          taskInstanceId: `obligation:${obligationId(0)}:${addDays(today, 1)}`,
          status: "DONE",
          completedAt: new Date(`${today}T10:00:00.000Z`),
          evidence: []
        }
      ]
    });

    const obligationDelegate = prisma.obligation as any;
    const originalFindMany = obligationDelegate.findMany.bind(prisma.obligation);
    const aggregateFindManyCalls: Array<{ take?: number; where?: unknown }> = [];
    const prismaDelegate = prisma as any;
    const originalQueryRaw = prismaDelegate.$queryRaw.bind(prisma);
    const taskStateRawCalls: unknown[][] = [];

    obligationDelegate.findMany = async (args: any) => {
      if (
        args?.select?.intervalUnit === true &&
        args?.select?.intervalValue === true &&
        args?.select?.recurrenceEndDate === true &&
        args?.take === batchSize
      ) {
        aggregateFindManyCalls.push(args);
      }
      return originalFindMany(args);
    };
    prismaDelegate.$queryRaw = async (...args: unknown[]) => {
      taskStateRawCalls.push(args);
      return originalQueryRaw(...args);
    };

    try {
      const counts = await dashboardSummaryTestInternals.computeRecurringObligationAggregates({
        prisma,
        obligationBaseWhere: {
          isArchived: false,
          legalDocument: {
            projectId: project.id
          }
        },
        today,
        dueSoonEnd: addDays(today, 30),
        completionStart: addDays(today, -365),
        taskHorizonEnd: addDays(today, 365)
      });

      assert.equal(counts.openTaskCount, obligationCount - doneIndexes.length);
      assert.equal(counts.overdueTaskCount, 0);
      assert.equal(counts.dueSoonTaskCount, obligationCount - doneIndexes.length);
      assert.equal(counts.totalWindowTaskCount, obligationCount);
      assert.equal(counts.doneWindowTaskCount, doneIndexes.length);
    } finally {
      obligationDelegate.findMany = originalFindMany;
      prismaDelegate.$queryRaw = originalQueryRaw;
    }

    assert.equal(aggregateFindManyCalls.length, 2);
    assert.ok(aggregateFindManyCalls.every((call) => call.take === batchSize));
    assert.match(JSON.stringify(aggregateFindManyCalls[1]?.where), new RegExp(obligationId(batchSize - 1)));
    assert.equal(taskStateRawCalls.length, 2);
  });

  it("keeps recurring obligation aggregate RBAC intact across keyset chunks", async () => {
    await createRole("DASHBOARD_RECURRING_CHUNK_RBAC", [
      "dashboard.view",
      "tasks.view",
      "obligations.view"
    ]);
    const user = await createUser({
      email: "dashboard-recurring-chunk-rbac@example.com",
      password: "ValidPassword1!",
      role: "DASHBOARD_RECURRING_CHUNK_RBAC"
    });
    const allowedProject = await seedProject("Recurring Chunk RBAC Allowed Project");
    const blockedProject = await seedProject("Recurring Chunk RBAC Blocked Project");
    await prisma.projectAccess.create({
      data: {
        projectId: allowedProject.id,
        userId: user.id,
        accessRole: "PROJECT_VIEWER"
      }
    });
    const allowedDoc = await seedLegalDocument(allowedProject.id, "Recurring Chunk RBAC Allowed Doc");
    const blockedDoc = await seedLegalDocument(blockedProject.id, "Recurring Chunk RBAC Blocked Doc");
    const today = todayDateOnlyInTimeZone(new Date(), "Europe/Vienna");
    const allowedCount = dashboardSummaryTestInternals.recurringAggregateBatchSize + 2;

    await prisma.obligation.createMany({
      data: [
        ...Array.from({ length: allowedCount }, (_, index) => ({
          id: `dashboard-chunk-rbac-allowed-${String(index).padStart(4, "0")}`,
          legalDocId: allowedDoc.id,
          title: `Allowed Chunk RBAC ${String(index).padStart(4, "0")}`,
          level: "MANDATORY",
          scheduleType: "RECURRING",
          firstDueDate: today,
          recurrenceEndDate: today,
          intervalUnit: "DAY",
          intervalValue: 1,
          evidenceRequirements: {}
        })),
        ...Array.from({ length: 5 }, (_, index) => ({
          id: `dashboard-chunk-rbac-blocked-${String(index).padStart(4, "0")}`,
          legalDocId: blockedDoc.id,
          title: `Blocked Chunk RBAC ${String(index).padStart(4, "0")}`,
          level: "MANDATORY",
          scheduleType: "RECURRING",
          firstDueDate: today,
          recurrenceEndDate: today,
          intervalUnit: "DAY",
          intervalValue: 1,
          evidenceRequirements: {}
        }))
      ]
    });

    const cookie = await login(user.email, "ValidPassword1!");
    const response = await request("/dashboard/summary?limit=1", { cookie });
    assert.equal(response.status, 200);
    const payload = (await response.json()) as {
      stats: {
        openTasks: number;
        tasksDueSoon: number;
        openObligations: number;
      };
    };

    assert.equal(payload.stats.openTasks, allowedCount);
    assert.equal(payload.stats.tasksDueSoon, allowedCount);
    assert.equal(payload.stats.openObligations, allowedCount);
    assert.doesNotMatch(JSON.stringify(payload), /Blocked Chunk RBAC/);
  });

  it("respects recurring recurrenceEndDate before, inside and after the summary window", async () => {
    await createRole("DASHBOARD_RECURRENCE_END_DATE", [
      "dashboard.view",
      "tasks.view",
      "obligations.view"
    ]);
    const user = await createUser({
      email: "dashboard-recurrence-end-date@example.com",
      password: "ValidPassword1!",
      role: "DASHBOARD_RECURRENCE_END_DATE"
    });
    const project = await seedProject("Recurrence End Project");
    await prisma.projectAccess.create({
      data: {
        projectId: project.id,
        userId: user.id,
        accessRole: "PROJECT_VIEWER"
      }
    });
    const legalDocument = await seedLegalDocument(project.id, "Recurrence End Legal Doc");
    const today = todayDateOnlyInTimeZone(new Date(), "Europe/Vienna");

    await prisma.obligation.createMany({
      data: [
        {
          id: "dashboard-recurring-ended-before-window",
          legalDocId: legalDocument.id,
          title: "Ended Before Window",
          level: "MANDATORY",
          scheduleType: "RECURRING",
          firstDueDate: addDays(today, -390),
          recurrenceEndDate: addDays(today, -370),
          intervalUnit: "DAY",
          intervalValue: 1,
          evidenceRequirements: {}
        },
        {
          id: "dashboard-recurring-ended-in-window",
          legalDocId: legalDocument.id,
          title: "Ended In Window",
          level: "MANDATORY",
          scheduleType: "RECURRING",
          firstDueDate: addDays(today, -2),
          recurrenceEndDate: today,
          intervalUnit: "DAY",
          intervalValue: 1,
          evidenceRequirements: {}
        },
        {
          id: "dashboard-recurring-open-ended",
          legalDocId: legalDocument.id,
          title: "Open Ended",
          level: "MANDATORY",
          scheduleType: "RECURRING",
          firstDueDate: today,
          intervalUnit: "WEEK",
          intervalValue: 1,
          evidenceRequirements: {}
        }
      ]
    });

    const cookie = await login(user.email, "ValidPassword1!");
    const response = await request("/dashboard/summary?limit=10", { cookie });
    assert.equal(response.status, 200);
    const payload = (await response.json()) as {
      stats: {
        openTasks: number;
        overdueTasks: number;
        tasksDueSoon: number;
        completionRatePercent: number;
      };
    };

    assert.equal(payload.stats.openTasks, 54);
    assert.equal(payload.stats.overdueTasks, 2);
    assert.equal(payload.stats.tasksDueSoon, 6);
    assert.equal(payload.stats.completionRatePercent, 0);
  });

  it("keeps recurring obligation aggregates project-scoped", async () => {
    await createRole("DASHBOARD_RECURRING_AGGREGATE_RBAC", [
      "dashboard.view",
      "tasks.view",
      "obligations.view"
    ]);
    const user = await createUser({
      email: "dashboard-recurring-aggregate-rbac@example.com",
      password: "ValidPassword1!",
      role: "DASHBOARD_RECURRING_AGGREGATE_RBAC"
    });
    const allowedProject = await seedProject("Recurring RBAC Allowed Project");
    const blockedProject = await seedProject("Recurring RBAC Blocked Project");
    await prisma.projectAccess.create({
      data: {
        projectId: allowedProject.id,
        userId: user.id,
        accessRole: "PROJECT_VIEWER"
      }
    });
    const allowedDoc = await seedLegalDocument(allowedProject.id, "Recurring RBAC Allowed Legal Doc");
    const blockedDoc = await seedLegalDocument(blockedProject.id, "Recurring RBAC Blocked Legal Doc");
    const today = todayDateOnlyInTimeZone(new Date(), "Europe/Vienna");

    await prisma.obligation.createMany({
      data: [
        {
          id: "dashboard-recurring-rbac-allowed",
          legalDocId: allowedDoc.id,
          title: "Allowed Recurring Aggregate",
          level: "MANDATORY",
          scheduleType: "RECURRING",
          firstDueDate: today,
          recurrenceEndDate: today,
          intervalUnit: "DAY",
          intervalValue: 1,
          evidenceRequirements: {}
        },
        {
          id: "dashboard-recurring-rbac-blocked",
          legalDocId: blockedDoc.id,
          title: "Blocked Recurring Aggregate",
          level: "MANDATORY",
          scheduleType: "RECURRING",
          firstDueDate: today,
          recurrenceEndDate: addDays(today, 30),
          intervalUnit: "DAY",
          intervalValue: 1,
          evidenceRequirements: {}
        }
      ]
    });

    const cookie = await login(user.email, "ValidPassword1!");
    const response = await request("/dashboard/summary?limit=5", { cookie });
    assert.equal(response.status, 200);
    const payload = (await response.json()) as {
      stats: {
        openTasks: number;
        tasksDueSoon: number;
        openObligations: number;
      };
    };

    assert.equal(payload.stats.openTasks, 1);
    assert.equal(payload.stats.tasksDueSoon, 1);
    assert.equal(payload.stats.openObligations, 1);
  });

  it("separates ONCE_THEN_RECURRING initial and recurring occurrences without double-counting aggregates", async () => {
    await createRole("DASHBOARD_ONCE_THEN_RECURRING_COUNTS", [
      "dashboard.view",
      "tasks.view",
      "obligations.view"
    ]);
    const user = await createUser({
      email: "dashboard-once-then-recurring-counts@example.com",
      password: "ValidPassword1!",
      role: "DASHBOARD_ONCE_THEN_RECURRING_COUNTS"
    });
    const project = await seedProject("Once Then Counts Project");
    await prisma.projectAccess.create({
      data: {
        projectId: project.id,
        userId: user.id,
        accessRole: "PROJECT_VIEWER"
      }
    });
    const legalDocument = await seedLegalDocument(project.id, "Once Then Counts Legal Doc");
    const today = todayDateOnlyInTimeZone(new Date(), "Europe/Vienna");

    await prisma.obligation.create({
      data: {
        id: "dashboard-once-then-counts",
        legalDocId: legalDocument.id,
        title: "Once Then Counts",
        level: "MANDATORY",
        scheduleType: "ONCE_THEN_RECURRING",
        firstDueDate: addDays(today, -2),
        recurrenceEndDate: addDays(today, 1),
        intervalUnit: "DAY",
        intervalValue: 1,
        evidenceRequirements: {}
      }
    });

    const cookie = await login(user.email, "ValidPassword1!");
    const response = await request("/dashboard/summary?limit=10", { cookie });
    assert.equal(response.status, 200);
    const payload = (await response.json()) as {
      stats: {
        openTasks: number;
        overdueTasks: number;
        tasksDueSoon: number;
        completionRatePercent: number;
      };
      overdueTasks: Array<{ title: string; obligationId?: string; dueDate: string }>;
    };

    assert.equal(payload.stats.openTasks, 2);
    assert.equal(payload.stats.overdueTasks, 2);
    assert.equal(payload.stats.tasksDueSoon, 2);
    assert.equal(payload.stats.completionRatePercent, 0);
    assert.equal(
      payload.overdueTasks.filter((task) => task.obligationId === "dashboard-once-then-counts").length,
      1
    );
  });

  it("excludes invalid ONCE_THEN_RECURRING initial occurrences from aggregates and display", async () => {
    await createRole("DASHBOARD_INVALID_ONCE_THEN_RECURRING", [
      "dashboard.view",
      "tasks.view",
      "obligations.view"
    ]);
    const user = await createUser({
      email: "dashboard-invalid-once-then-recurring@example.com",
      password: "ValidPassword1!",
      role: "DASHBOARD_INVALID_ONCE_THEN_RECURRING"
    });
    const project = await seedProject("Invalid Once Then Project");
    await prisma.projectAccess.create({
      data: {
        projectId: project.id,
        userId: user.id,
        accessRole: "PROJECT_VIEWER"
      }
    });
    const legalDocument = await seedLegalDocument(project.id, "Invalid Once Then Legal Doc");
    const today = todayDateOnlyInTimeZone(new Date(), "Europe/Vienna");
    const overdueDate = addDays(today, -2);
    const dueSoonDate = addDays(today, 5);

    await prisma.obligation.createMany({
      data: [
        {
          id: "dashboard-invalid-once-then-missing-unit",
          legalDocId: legalDocument.id,
          title: "Invalid Missing Unit Due Soon",
          level: "MANDATORY",
          scheduleType: "ONCE_THEN_RECURRING",
          firstDueDate: dueSoonDate,
          recurrenceEndDate: addDays(today, 30),
          intervalValue: 1,
          emailReminderEnabled: true,
          emailReminderDaysBefore: 5,
          evidenceRequirements: {}
        },
        {
          id: "dashboard-invalid-once-then-zero-value",
          legalDocId: legalDocument.id,
          title: "Invalid Zero Value Overdue",
          level: "MANDATORY",
          scheduleType: "ONCE_THEN_RECURRING",
          firstDueDate: overdueDate,
          recurrenceEndDate: addDays(today, 30),
          intervalUnit: "DAY",
          intervalValue: 0,
          evidenceRequirements: {}
        },
        {
          id: "dashboard-valid-once-overdue",
          legalDocId: legalDocument.id,
          title: "Valid ONCE Overdue",
          level: "MANDATORY",
          scheduleType: "ONCE",
          firstDueDate: overdueDate,
          evidenceRequirements: {}
        },
        {
          id: "dashboard-valid-once-due-soon",
          legalDocId: legalDocument.id,
          title: "Valid ONCE Due Soon",
          level: "MANDATORY",
          scheduleType: "ONCE",
          firstDueDate: dueSoonDate,
          emailReminderEnabled: true,
          emailReminderDaysBefore: 5,
          evidenceRequirements: {}
        }
      ]
    });

    const cookie = await login(user.email, "ValidPassword1!");
    const response = await request("/dashboard/summary?limit=10", { cookie });
    assert.equal(response.status, 200);
    const payload = (await response.json()) as {
      stats: {
        openTasks: number;
        overdueTasks: number;
        tasksDueSoon: number;
      };
      overdueTasks: Array<{ title: string }>;
      notifications: Array<{ title: string }>;
    };

    assert.equal(payload.stats.openTasks, 1);
    assert.equal(payload.stats.overdueTasks, 1);
    assert.equal(payload.stats.tasksDueSoon, 1);
    assert.deepEqual(payload.overdueTasks.map((task) => task.title), ["Valid ONCE Overdue"]);
    assert.ok(payload.notifications.some((notification) => notification.title === "Valid ONCE Due Soon"));
    assert.doesNotMatch(JSON.stringify(payload), /Invalid Missing Unit/);
    assert.doesNotMatch(JSON.stringify(payload), /Invalid Zero Value/);
  });

  it("includes ended ONCE_THEN_RECURRING initial overdues in display candidates", async () => {
    await createRole("DASHBOARD_ENDED_ONCE_THEN_CANDIDATES", [
      "dashboard.view",
      "tasks.view",
      "obligations.view"
    ]);
    const user = await createUser({
      email: "dashboard-ended-once-then@example.com",
      password: "ValidPassword1!",
      role: "DASHBOARD_ENDED_ONCE_THEN_CANDIDATES"
    });
    const project = await seedProject("Ended Once Then Project");
    await prisma.projectAccess.create({
      data: {
        projectId: project.id,
        userId: user.id,
        accessRole: "PROJECT_VIEWER"
      }
    });
    const legalDocument = await seedLegalDocument(project.id, "Ended Once Then Legal Doc");
    const today = todayDateOnlyInTimeZone(new Date(), "Europe/Vienna");
    const firstDueDate = addDays(today, -400);

    await prisma.obligation.create({
      data: {
        id: "dashboard-ended-once-then",
        legalDocId: legalDocument.id,
        title: "Ended Once Then Initial",
        level: "MANDATORY",
        scheduleType: "ONCE_THEN_RECURRING",
        firstDueDate,
        recurrenceEndDate: addDays(today, -390),
        intervalUnit: "DAY",
        intervalValue: 1,
        evidenceRequirements: {}
      }
    });

    const cookie = await login(user.email, "ValidPassword1!");
    const response = await request("/dashboard/summary?limit=5", { cookie });
    assert.equal(response.status, 200);
    const payload = (await response.json()) as {
      stats: { overdueTasks: number };
      overdueTasks: Array<{ title: string; dueDate: string }>;
    };

    assert.equal(payload.stats.overdueTasks, 1);
    assert.deepEqual(payload.overdueTasks.map((task) => [task.title, task.dueDate]), [
      ["Ended Once Then Initial", firstDueDate]
    ]);
  });

  it("does not let older DONE overdue candidates consume slots before an open ended ONCE_THEN_RECURRING initial", async () => {
    await createRole("DASHBOARD_DONE_SLICE_ONCE_THEN", [
      "dashboard.view",
      "tasks.view",
      "obligations.view"
    ]);
    const user = await createUser({
      email: "dashboard-done-slice-once-then@example.com",
      password: "ValidPassword1!",
      role: "DASHBOARD_DONE_SLICE_ONCE_THEN"
    });
    const project = await seedProject("Done Slice Once Then Project");
    await prisma.projectAccess.create({
      data: {
        projectId: project.id,
        userId: user.id,
        accessRole: "PROJECT_VIEWER"
      }
    });
    const legalDocument = await seedLegalDocument(project.id, "Done Slice Once Then Legal Doc");
    const today = todayDateOnlyInTimeZone(new Date(), "Europe/Vienna");
    const openFirstDueDate = addDays(today, -400);
    const doneDueDates = Array.from({ length: 8 }, (_, index) => addDays(today, -500 - index));

    await prisma.obligation.createMany({
      data: [
        ...doneDueDates.map((dueDate, index) => ({
          id: `dashboard-done-slice-once-then-done-${index}`,
          legalDocId: legalDocument.id,
          title: `A Done Slice ${String(index).padStart(2, "0")}`,
          level: "MANDATORY",
          scheduleType: "ONCE",
          firstDueDate: dueDate,
          evidenceRequirements: {}
        })),
        {
          id: "dashboard-done-slice-once-then-open",
          legalDocId: legalDocument.id,
          title: "Open Ended Once Then After Done Slice",
          level: "MANDATORY",
          scheduleType: "ONCE_THEN_RECURRING",
          firstDueDate: openFirstDueDate,
          recurrenceEndDate: addDays(today, -390),
          intervalUnit: "DAY",
          intervalValue: 1,
          evidenceRequirements: {}
        }
      ]
    });
    await prisma.taskStateEntry.createMany({
      data: doneDueDates.map((dueDate, index) => ({
        taskInstanceId: `obligation:dashboard-done-slice-once-then-done-${index}:${dueDate}`,
        status: "DONE",
        completedAt: new Date(`${dueDate}T10:00:00.000Z`),
        evidence: []
      }))
    });

    const cookie = await login(user.email, "ValidPassword1!");
    const response = await request("/dashboard/summary?limit=3", { cookie });
    assert.equal(response.status, 200);
    const payload = (await response.json()) as {
      stats: { overdueTasks: number };
      overdueTasks: Array<{ title: string; dueDate: string }>;
    };

    assert.equal(payload.stats.overdueTasks, 1);
    assert.deepEqual(payload.overdueTasks.map((task) => [task.title, task.dueDate]), [
      ["Open Ended Once Then After Done Slice", openFirstDueDate]
    ]);
  });

  it("does not let older DONE overdue candidates consume slots before an open ONCE overdue", async () => {
    await createRole("DASHBOARD_DONE_SLICE_ONCE", [
      "dashboard.view",
      "tasks.view",
      "obligations.view"
    ]);
    const user = await createUser({
      email: "dashboard-done-slice-once@example.com",
      password: "ValidPassword1!",
      role: "DASHBOARD_DONE_SLICE_ONCE"
    });
    const project = await seedProject("Done Slice Once Project");
    await prisma.projectAccess.create({
      data: {
        projectId: project.id,
        userId: user.id,
        accessRole: "PROJECT_VIEWER"
      }
    });
    const legalDocument = await seedLegalDocument(project.id, "Done Slice Once Legal Doc");
    const today = todayDateOnlyInTimeZone(new Date(), "Europe/Vienna");
    const openDueDate = addDays(today, -400);
    const doneDueDates = Array.from({ length: 8 }, (_, index) => addDays(today, -500 - index));

    await prisma.obligation.createMany({
      data: [
        ...doneDueDates.map((dueDate, index) => ({
          id: `dashboard-done-slice-once-done-${index}`,
          legalDocId: legalDocument.id,
          title: `A Done Once ${String(index).padStart(2, "0")}`,
          level: "MANDATORY",
          scheduleType: "ONCE",
          firstDueDate: dueDate,
          evidenceRequirements: {}
        })),
        {
          id: "dashboard-done-slice-once-open",
          legalDocId: legalDocument.id,
          title: "Open Once After Done Slice",
          level: "MANDATORY",
          scheduleType: "ONCE",
          firstDueDate: openDueDate,
          evidenceRequirements: {}
        }
      ]
    });
    await prisma.taskStateEntry.createMany({
      data: doneDueDates.map((dueDate, index) => ({
        taskInstanceId: `obligation:dashboard-done-slice-once-done-${index}:${dueDate}`,
        status: "DONE",
        completedAt: new Date(`${dueDate}T10:00:00.000Z`),
        evidence: []
      }))
    });

    const cookie = await login(user.email, "ValidPassword1!");
    const response = await request("/dashboard/summary?limit=3", { cookie });
    assert.equal(response.status, 200);
    const payload = (await response.json()) as {
      stats: { overdueTasks: number };
      overdueTasks: Array<{ title: string; dueDate: string }>;
    };

    assert.equal(payload.stats.overdueTasks, 1);
    assert.deepEqual(payload.overdueTasks.map((task) => [task.title, task.dueDate]), [
      ["Open Once After Done Slice", openDueDate]
    ]);
  });

  it("keeps post-DONE-slice overdue candidates project-scoped", async () => {
    await createRole("DASHBOARD_DONE_SLICE_RBAC", [
      "dashboard.view",
      "tasks.view",
      "obligations.view"
    ]);
    const user = await createUser({
      email: "dashboard-done-slice-rbac@example.com",
      password: "ValidPassword1!",
      role: "DASHBOARD_DONE_SLICE_RBAC"
    });
    const allowedProject = await seedProject("Done Slice RBAC Allowed Project");
    const blockedProject = await seedProject("Done Slice RBAC Blocked Project");
    await prisma.projectAccess.create({
      data: {
        projectId: allowedProject.id,
        userId: user.id,
        accessRole: "PROJECT_VIEWER"
      }
    });
    const allowedDoc = await seedLegalDocument(allowedProject.id, "Done Slice RBAC Allowed Doc");
    const blockedDoc = await seedLegalDocument(blockedProject.id, "Done Slice RBAC Blocked Doc");
    const today = todayDateOnlyInTimeZone(new Date(), "Europe/Vienna");
    const dueDate = addDays(today, -400);

    await prisma.obligation.createMany({
      data: [
        {
          id: "dashboard-done-slice-rbac-allowed",
          legalDocId: allowedDoc.id,
          title: "Allowed After Done Slice",
          level: "MANDATORY",
          scheduleType: "ONCE",
          firstDueDate: dueDate,
          evidenceRequirements: {}
        },
        {
          id: "dashboard-done-slice-rbac-blocked",
          legalDocId: blockedDoc.id,
          title: "Blocked After Done Slice",
          level: "MANDATORY",
          scheduleType: "ONCE",
          firstDueDate: dueDate,
          evidenceRequirements: {}
        }
      ]
    });

    const cookie = await login(user.email, "ValidPassword1!");
    const response = await request("/dashboard/summary?limit=5", { cookie });
    assert.equal(response.status, 200);
    const payload = (await response.json()) as {
      overdueTasks: Array<{ title: string }>;
    };

    assert.deepEqual(payload.overdueTasks.map((task) => task.title), ["Allowed After Done Slice"]);
    assert.doesNotMatch(JSON.stringify(payload), /Blocked After Done Slice/);
  });

  it("excludes completed ended ONCE_THEN_RECURRING initial overdue candidates", async () => {
    await createRole("DASHBOARD_ENDED_ONCE_THEN_COMPLETED", [
      "dashboard.view",
      "tasks.view",
      "obligations.view"
    ]);
    const user = await createUser({
      email: "dashboard-ended-once-then-completed@example.com",
      password: "ValidPassword1!",
      role: "DASHBOARD_ENDED_ONCE_THEN_COMPLETED"
    });
    const project = await seedProject("Completed Ended Once Then Project");
    await prisma.projectAccess.create({
      data: {
        projectId: project.id,
        userId: user.id,
        accessRole: "PROJECT_VIEWER"
      }
    });
    const legalDocument = await seedLegalDocument(project.id, "Completed Ended Once Then Legal Doc");
    const today = todayDateOnlyInTimeZone(new Date(), "Europe/Vienna");
    const firstDueDate = addDays(today, -400);

    await prisma.obligation.create({
      data: {
        id: "dashboard-ended-once-then-completed",
        legalDocId: legalDocument.id,
        title: "Completed Ended Once Then Initial",
        level: "MANDATORY",
        scheduleType: "ONCE_THEN_RECURRING",
        firstDueDate,
        recurrenceEndDate: addDays(today, -390),
        intervalUnit: "DAY",
        intervalValue: 1,
        evidenceRequirements: {}
      }
    });
    await prisma.taskStateEntry.create({
      data: {
        taskInstanceId: `obligation:dashboard-ended-once-then-completed:${firstDueDate}`,
        status: "DONE",
        completedAt: new Date(`${firstDueDate}T10:00:00.000Z`),
        evidence: []
      }
    });

    const cookie = await login(user.email, "ValidPassword1!");
    const response = await request("/dashboard/summary?limit=5", { cookie });
    assert.equal(response.status, 200);
    const payload = (await response.json()) as {
      stats: { overdueTasks: number };
      overdueTasks: Array<{ title: string }>;
    };

    assert.equal(payload.stats.overdueTasks, 0);
    assert.deepEqual(payload.overdueTasks, []);
  });

  it("sorts ended ONCE_THEN_RECURRING overdue candidates with ONCE candidates by due date", async () => {
    await createRole("DASHBOARD_ONCE_THEN_CANDIDATE_SORT", [
      "dashboard.view",
      "tasks.view",
      "obligations.view"
    ]);
    const user = await createUser({
      email: "dashboard-once-then-sort@example.com",
      password: "ValidPassword1!",
      role: "DASHBOARD_ONCE_THEN_CANDIDATE_SORT"
    });
    const project = await seedProject("Once Then Sort Project");
    await prisma.projectAccess.create({
      data: {
        projectId: project.id,
        userId: user.id,
        accessRole: "PROJECT_VIEWER"
      }
    });
    const legalDocument = await seedLegalDocument(project.id, "Once Then Sort Legal Doc");
    const today = todayDateOnlyInTimeZone(new Date(), "Europe/Vienna");
    const onceDueDate = addDays(today, -410);
    const onceThenDueDate = addDays(today, -405);

    await prisma.obligation.createMany({
      data: [
        {
          id: "dashboard-sort-once",
          legalDocId: legalDocument.id,
          title: "A Once",
          level: "MANDATORY",
          scheduleType: "ONCE",
          firstDueDate: onceDueDate,
          evidenceRequirements: {}
        },
        {
          id: "dashboard-sort-once-then",
          legalDocId: legalDocument.id,
          title: "B Once Then",
          level: "MANDATORY",
          scheduleType: "ONCE_THEN_RECURRING",
          firstDueDate: onceThenDueDate,
          recurrenceEndDate: addDays(today, -390),
          intervalUnit: "DAY",
          intervalValue: 1,
          evidenceRequirements: {}
        }
      ]
    });

    const cookie = await login(user.email, "ValidPassword1!");
    const response = await request("/dashboard/summary?limit=5", { cookie });
    assert.equal(response.status, 200);
    const payload = (await response.json()) as {
      overdueTasks: Array<{ title: string; dueDate: string }>;
    };

    assert.deepEqual(payload.overdueTasks.map((task) => [task.title, task.dueDate]), [
      ["A Once", onceDueDate],
      ["B Once Then", onceThenDueDate]
    ]);
  });

  it("keeps ended ONCE_THEN_RECURRING overdue candidates project-scoped", async () => {
    await createRole("DASHBOARD_ONCE_THEN_CANDIDATE_RBAC", [
      "dashboard.view",
      "tasks.view",
      "obligations.view"
    ]);
    const user = await createUser({
      email: "dashboard-once-then-rbac@example.com",
      password: "ValidPassword1!",
      role: "DASHBOARD_ONCE_THEN_CANDIDATE_RBAC"
    });
    const allowedProject = await seedProject("Once Then RBAC Allowed Project");
    const blockedProject = await seedProject("Once Then RBAC Blocked Project");
    await prisma.projectAccess.create({
      data: {
        projectId: allowedProject.id,
        userId: user.id,
        accessRole: "PROJECT_VIEWER"
      }
    });
    const blockedDoc = await seedLegalDocument(blockedProject.id, "Blocked Once Then Legal Doc");
    const today = todayDateOnlyInTimeZone(new Date(), "Europe/Vienna");

    await prisma.obligation.create({
      data: {
        id: "dashboard-rbac-blocked-once-then",
        legalDocId: blockedDoc.id,
        title: "Blocked Once Then Initial",
        level: "MANDATORY",
        scheduleType: "ONCE_THEN_RECURRING",
        firstDueDate: addDays(today, -400),
        recurrenceEndDate: addDays(today, -390),
        intervalUnit: "DAY",
        intervalValue: 1,
        evidenceRequirements: {}
      }
    });

    const cookie = await login(user.email, "ValidPassword1!");
    const response = await request("/dashboard/summary?limit=5", { cookie });
    assert.equal(response.status, 200);
    const payload = (await response.json()) as {
      stats: { overdueTasks: number };
      overdueTasks: Array<{ title: string }>;
    };

    assert.equal(payload.stats.overdueTasks, 0);
    assert.deepEqual(payload.overdueTasks, []);
  });

  it("bounds recurring due-soon reminder display candidates", async () => {
    await createRole("DASHBOARD_RECURRING_REMINDER_BOUNDED", [
      "dashboard.view",
      "tasks.view",
      "obligations.view"
    ]);
    const user = await createUser({
      email: "dashboard-recurring-reminder-bounded@example.com",
      password: "ValidPassword1!",
      role: "DASHBOARD_RECURRING_REMINDER_BOUNDED"
    });
    const project = await seedProject("Recurring Reminder Bounded Project");
    await prisma.projectAccess.create({
      data: {
        projectId: project.id,
        userId: user.id,
        accessRole: "PROJECT_VIEWER"
      }
    });
    const legalDocument = await seedLegalDocument(project.id, "Recurring Reminder Bounded Legal Doc");
    const today = todayDateOnlyInTimeZone(new Date(), "Europe/Vienna");
    const startDate = addDays(today, -365);
    const dueDate = addDays(today, 5);

    await prisma.obligation.createMany({
      data: Array.from({ length: 20 }, (_, index) => ({
        id: `dashboard-recurring-reminder-bounded-${index}`,
        legalDocId: legalDocument.id,
        title: `Recurring Reminder Bounded ${String(index).padStart(2, "0")}`,
        level: "MANDATORY",
        scheduleType: "RECURRING",
        firstDueDate: startDate,
        recurrenceEndDate: addDays(today, 365),
        intervalUnit: "DAY",
        intervalValue: 1,
        emailReminderEnabled: true,
        emailReminderDaysBefore: 5,
        evidenceRequirements: {}
      }))
    });

    const displayResult = await dashboardSummaryTestInternals.loadReminderObligationDisplayCandidates({
      prisma,
      accessScope: { projectIds: [project.id] },
      obligationBaseWhere: {
        isArchived: false,
        legalDocument: {
          projectId: project.id
        }
      },
      today,
      taskHorizonEnd: addDays(today, 365),
      limit: 5
    });
    assert.equal(displayResult.tasks.length, 20);
    assert.equal(displayResult.diagnostics.occurrenceCandidatesScanned, 20);

    const cookie = await login(user.email, "ValidPassword1!");
    const response = await request("/dashboard/summary?limit=5", { cookie });
    assert.equal(response.status, 200);
    const payload = (await response.json()) as {
      notifications: Array<{ title: string; type: string; dueDate: string }>;
    };
    const recurringReminders = payload.notifications.filter((notification) =>
      notification.title.startsWith("Recurring Reminder Bounded")
    );

    assert.equal(recurringReminders.length, 5);
    assert.deepEqual(
      recurringReminders.map((notification) => notification.dueDate),
      Array(5).fill(dueDate)
    );
  });

  it("only loads deadline reminder candidates that can trigger today", async () => {
    await createRole("DASHBOARD_DEADLINE_REMINDERS", [
      "dashboard.view",
      "tasks.view",
      "deadlines.view"
    ]);
    const user = await createUser({
      email: "dashboard-deadline-reminders@example.com",
      password: "ValidPassword1!",
      role: "DASHBOARD_DEADLINE_REMINDERS"
    });
    const allowedProject = await seedProject("Reminder Allowed Project");
    const blockedProject = await seedProject("Reminder Blocked Project");
    await prisma.projectAccess.create({
      data: {
        projectId: allowedProject.id,
        userId: user.id,
        accessRole: "PROJECT_VIEWER"
      }
    });
    const today = todayDateOnlyInTimeZone(new Date(), "Europe/Vienna");

    await prisma.deadline.createMany({
      data: [
        ...Array.from({ length: 80 }, (_, index) => ({
          id: `dashboard-reminder-far-${index}`,
          title: `Far Reminder ${String(index).padStart(2, "0")}`,
          dueDate: addDays(today, 500 + index),
          status: "OPEN",
          projectId: allowedProject.id,
          emailReminderEnabled: true,
          emailReminderDaysBefore: 7,
          evidence: []
        })),
        {
          id: "dashboard-reminder-today-zero",
          title: "Reminder Today Zero",
          dueDate: today,
          status: "OPEN",
          projectId: allowedProject.id,
          emailReminderEnabled: true,
          emailReminderDaysBefore: 0,
          evidence: []
        },
        {
          id: "dashboard-reminder-five-days",
          title: "Reminder Five Days",
          dueDate: addDays(today, 5),
          status: "OPEN",
          projectId: allowedProject.id,
          emailReminderEnabled: true,
          emailReminderDaysBefore: 5,
          evidence: []
        },
        {
          id: "dashboard-reminder-not-today",
          title: "Reminder Not Today",
          dueDate: addDays(today, 5),
          status: "OPEN",
          projectId: allowedProject.id,
          emailReminderEnabled: true,
          emailReminderDaysBefore: 4,
          evidence: []
        },
        {
          id: "dashboard-reminder-done",
          title: "Reminder Done",
          dueDate: addDays(today, 2),
          status: "DONE",
          projectId: allowedProject.id,
          emailReminderEnabled: true,
          emailReminderDaysBefore: 2,
          evidence: []
        },
        {
          id: "dashboard-reminder-blocked",
          title: "Reminder Blocked",
          dueDate: addDays(today, 3),
          status: "OPEN",
          projectId: blockedProject.id,
          emailReminderEnabled: true,
          emailReminderDaysBefore: 3,
          evidence: []
        }
      ]
    });

    const cookie = await login(user.email, "ValidPassword1!");
    const response = await request("/dashboard/summary?limit=10", { cookie });
    assert.equal(response.status, 200);
    const payload = (await response.json()) as {
      notifications: Array<{ title: string; type: string; dueDate: string }>;
    };
    const reminderTitles = payload.notifications
      .filter((notification) => notification.type === "REMINDER")
      .map((notification) => notification.title)
      .sort();

    assert.deepEqual(reminderTitles, ["Reminder Five Days", "Reminder Today Zero"]);
    assert.doesNotMatch(JSON.stringify(payload), /Far Reminder|Reminder Not Today|Reminder Done|Reminder Blocked/);
  });

  it("skips invalid legacy deadline reminder due dates without crashing summary", async () => {
    await createRole("DASHBOARD_INVALID_DEADLINE_REMINDERS", [
      "dashboard.view",
      "tasks.view",
      "deadlines.view"
    ]);
    const user = await createUser({
      email: "dashboard-invalid-deadline-reminders@example.com",
      password: "ValidPassword1!",
      role: "DASHBOARD_INVALID_DEADLINE_REMINDERS"
    });
    const project = await seedProject("Invalid Reminder Project");
    await prisma.projectAccess.create({
      data: {
        projectId: project.id,
        userId: user.id,
        accessRole: "PROJECT_VIEWER"
      }
    });
    const today = todayDateOnlyInTimeZone(new Date(), "Europe/Vienna");

    await prisma.deadline.createMany({
      data: [
        {
          id: "dashboard-invalid-reminder-text",
          title: "Invalid Reminder Text",
          dueDate: "not-a-date",
          status: "OPEN",
          projectId: project.id,
          emailReminderEnabled: true,
          emailReminderDaysBefore: 0,
          evidence: []
        },
        {
          id: "dashboard-invalid-reminder-month",
          title: "Invalid Reminder Month",
          dueDate: "2026-99-99",
          status: "OPEN",
          projectId: project.id,
          emailReminderEnabled: true,
          emailReminderDaysBefore: 0,
          evidence: []
        },
        {
          id: "dashboard-invalid-reminder-day",
          title: "Invalid Reminder Day",
          dueDate: "2026-02-31",
          status: "OPEN",
          projectId: project.id,
          emailReminderEnabled: true,
          emailReminderDaysBefore: 0,
          evidence: []
        },
        {
          id: "dashboard-invalid-reminder-compact",
          title: "Invalid Reminder Compact",
          dueDate: "20260520",
          status: "OPEN",
          projectId: project.id,
          emailReminderEnabled: true,
          emailReminderDaysBefore: 0,
          evidence: []
        },
        {
          id: "dashboard-valid-reminder-zero",
          title: "Valid Reminder Zero",
          dueDate: today,
          status: "OPEN",
          projectId: project.id,
          emailReminderEnabled: true,
          emailReminderDaysBefore: 0,
          evidence: []
        },
        {
          id: "dashboard-valid-reminder-three",
          title: "Valid Reminder Three",
          dueDate: addDays(today, 3),
          status: "OPEN",
          projectId: project.id,
          emailReminderEnabled: true,
          emailReminderDaysBefore: 3,
          evidence: []
        },
        {
          id: "dashboard-valid-reminder-not-today",
          title: "Valid Reminder Not Today",
          dueDate: addDays(today, 3),
          status: "OPEN",
          projectId: project.id,
          emailReminderEnabled: true,
          emailReminderDaysBefore: 2,
          evidence: []
        }
      ]
    });

    const cookie = await login(user.email, "ValidPassword1!");
    const response = await request("/dashboard/summary?limit=10", { cookie });
    assert.equal(response.status, 200);
    const payload = (await response.json()) as {
      notifications: Array<{ title: string; type: string }>;
    };
    const reminderNotifications = payload.notifications.filter((notification) => notification.type === "REMINDER");
    const reminderTitles = reminderNotifications.map((notification) => notification.title).sort();

    assert.deepEqual(reminderTitles, ["Valid Reminder Three", "Valid Reminder Zero"]);
    assert.doesNotMatch(JSON.stringify(reminderNotifications), /Invalid Reminder|Valid Reminder Not Today/);
  });

  it("renders legal document scope overrides with scope names in summary rows", async () => {
    await createRole("DASHBOARD_SCOPE_OVERRIDE", [
      "dashboard.view",
      "tasks.view",
      "obligations.view"
    ]);
    const user = await createUser({
      email: "dashboard-scope-override@example.com",
      password: "ValidPassword1!",
      role: "DASHBOARD_SCOPE_OVERRIDE"
    });
    const project = await seedProject("Scope Override Project");
    await prisma.projectAccess.create({
      data: {
        projectId: project.id,
        userId: user.id,
        accessRole: "PROJECT_VIEWER"
      }
    });

    const overrideCompany = await prisma.company.create({
      data: {
        id: `dashboard-company-${randomUUID()}`,
        name: "Override Company"
      }
    });
    const overrideSite = await prisma.site.create({
      data: {
        id: `dashboard-site-${randomUUID()}`,
        companyId: overrideCompany.id,
        name: "Override Site"
      }
    });
    const overrideFacility = await prisma.facility.create({
      data: {
        id: `dashboard-facility-${randomUUID()}`,
        companyId: overrideCompany.id,
        siteId: overrideSite.id,
        name: "Override Facility"
      }
    });
    const legalDocument = await prisma.legalDocument.create({
      data: {
        id: `dashboard-legal-doc-${randomUUID()}`,
        projectId: project.id,
        type: "decision",
        title: "Scope Override Legal Doc",
        shortDescription: "Short summary",
        attachments: [],
        scopeOverride: {
          companyId: overrideCompany.id,
          siteId: overrideSite.id,
          facilityId: overrideFacility.id
        }
      }
    });

    await prisma.obligation.create({
      data: {
        id: "dashboard-obligation-scope-override",
        legalDocId: legalDocument.id,
        title: "Scope Override Obligation",
        level: "MANDATORY",
        scheduleType: "ONCE",
        firstDueDate: addDays(todayDateOnlyLocal(), -1),
        evidenceRequirements: {}
      }
    });

    const cookie = await login(user.email, "ValidPassword1!");
    const response = await request("/dashboard/summary", { cookie });
    assert.equal(response.status, 200);
    const payload = (await response.json()) as {
      overdueTasks: Array<{ title: string; scopeLabel: string }>;
    };
    const task = payload.overdueTasks.find((item) => item.title === "Scope Override Obligation");

    assert.ok(task);
    assert.equal(task.scopeLabel, "Override Company / Override Site / Override Facility");
    assert.doesNotMatch(task.scopeLabel, new RegExp(overrideCompany.id));
    assert.doesNotMatch(task.scopeLabel, new RegExp(overrideSite.id));
    assert.doesNotMatch(task.scopeLabel, new RegExp(overrideFacility.id));
  });

  it("returns an empty scoped summary for external users", async () => {
    const externalUser = await createUser({
      email: "dashboard-external@example.com",
      password: "ValidPassword1!",
      role: "EXTERNAL",
      type: "EXTERNAL"
    });
    const project = await seedProject("External Project");
    await prisma.projectAccess.create({
      data: {
        projectId: project.id,
        userId: externalUser.id,
        accessRole: "EXTERNAL_PROJECT_VIEWER"
      }
    });
    await prisma.deadline.create({
      data: {
        id: "dashboard-external-deadline",
        title: "External Deadline",
        dueDate: addDays(todayDateOnlyLocal(), -1),
        status: "OPEN",
        projectId: project.id,
        evidence: []
      }
    });

    const cookie = await login(externalUser.email, "ValidPassword1!");
    const response = await request("/dashboard/summary", { cookie });
    assert.equal(response.status, 200);
    const payload = (await response.json()) as {
      stats: Record<string, number>;
      overdueTasks: unknown[];
      notifications: unknown[];
    };

    assert.deepEqual(payload.stats, {
      openTasks: 0,
      overdueTasks: 0,
      tasksDueSoon: 0,
      openDeadlines: 0,
      overdueDeadlines: 0,
      deadlinesDueSoon: 0,
      openObligations: 0,
      completionRatePercent: 0
    });
    assert.deepEqual(payload.overdueTasks, []);
    assert.deepEqual(payload.notifications, []);
  });
});
