import { Prisma, type PrismaClient } from "@prisma/client";
import { Router, type NextFunction, type Request, type Response } from "express";
import { hasPermission } from "../accessControl.js";
import type { AppConfig } from "../config.js";
import { createPerfTimer } from "../perf.js";
import {
  getAccessibleProjectIds,
  hasDomainReadPermission,
  hasGlobalProjectReadAccess,
  isExternalUser
} from "../projectAccess.js";
import {
  applyNoStoreHeaders,
  requireAuthenticatedRouteUser,
  type RouteUser
} from "./routeAuth.js";

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 10;
const DUE_SOON_DAYS = 30;
const TASK_HORIZON_DAYS = 365;
const COMPLETION_WINDOW_DAYS = 365;
const TASK_STATE_CHUNK_SIZE = 1_000;
const RECURRING_AGGREGATE_BATCH_SIZE = 250;
const OBLIGATION_CANDIDATE_SLICE_MULTIPLIER = 20;
const MIN_OBLIGATION_CANDIDATE_SLICE_LIMIT = 50;
const MAX_OBLIGATION_CANDIDATE_SLICE_LIMIT = 200;
const DISPLAY_CANDIDATE_PAGE_SIZE = 50;
const MAX_DISPLAY_CANDIDATE_PAGES = 4;
const MAX_DISPLAY_CANDIDATE_ROW_SCAN_LIMIT = DISPLAY_CANDIDATE_PAGE_SIZE * MAX_DISPLAY_CANDIDATE_PAGES;
const MAX_DISPLAY_OCCURRENCE_SCANS = 2_000;
const DEFAULT_REMINDER_DAYS_BEFORE = 7;
const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DATE_ONLY_SQL_PATTERN = "^[0-9]{4}-[0-9]{2}-[0-9]{2}$";

type DateOnlyIntervalUnit = "DAY" | "WEEK" | "MONTH" | "QUARTER" | "YEAR";
type DashboardTaskType = "OBLIGATION" | "DEADLINE";
type DashboardTaskStatus = "OPEN" | "IN_PROGRESS" | "DONE" | "OVERDUE";
type DashboardNotificationType = "REMINDER" | "OVERDUE";
type DashboardNotificationEntityType = "TASK" | "DEADLINE";

type DashboardTaskSummaryItem = {
  id: string;
  type: DashboardTaskType;
  title: string;
  dueDate: string;
  status: DashboardTaskStatus;
  assignedTo?: string;
  scopeLabel: string;
  projectId?: string;
  legalDocId?: string;
  obligationId?: string;
  deadlineId?: string;
};

type DashboardNotificationSummaryItem = {
  id: string;
  type: DashboardNotificationType;
  entityType: DashboardNotificationEntityType;
  entityId: string;
  taskInstanceId?: string;
  title: string;
  dueDate: string;
  createdAt: string;
};

type DashboardSummary = {
  generatedAt: string;
  range: {
    dueSoonDays: number;
    taskHorizonDays: number;
    completionWindowDays: number;
    limit: number;
  };
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
  overdueTasks: DashboardTaskSummaryItem[];
  notifications: DashboardNotificationSummaryItem[];
};

type AccessScope = {
  projectIds: string[] | null;
};

type ScopeOverrideValue = {
  companyId: string;
  siteId?: string;
  facilityId?: string;
};

type ScopeNameLookups = {
  companies: Map<string, string>;
  sites: Map<string, string>;
  facilities: Map<string, string>;
};

const projectScopeSelect = {
  id: true,
  title: true,
  companyId: true,
  siteId: true,
  facilityId: true,
  company: {
    select: {
      id: true,
      name: true
    }
  },
  site: {
    select: {
      id: true,
      name: true
    }
  },
  facility: {
    select: {
      id: true,
      name: true
    }
  }
} as const;

const ownerUserSelect = {
  firstName: true,
  lastName: true,
  isArchived: true
} as const;

type ProjectScopeRow = {
  id: string;
  title: string;
  companyId: string;
  siteId: string | null;
  facilityId: string | null;
  company: { id: string; name: string };
  site: { id: string; name: string } | null;
  facility: { id: string; name: string } | null;
};

type OwnerUserRow = {
  firstName: string;
  lastName: string;
  isArchived: boolean;
} | null;

type DashboardDeadlineRow = {
  id: string;
  title: string;
  dueDate: string;
  status: string;
  projectId: string | null;
  legalDocId: string | null;
  ownerUserId: string | null;
  deputyUserId: string | null;
  emailReminderEnabled: boolean;
  emailReminderDaysBefore: number | null;
  ownerUser: OwnerUserRow;
  project: ProjectScopeRow | null;
  legalDocument: {
    id: string;
    projectId: string;
    scopeOverride: Prisma.JsonValue;
    project: ProjectScopeRow;
  } | null;
};

type DashboardObligationRow = {
  id: string;
  legalDocId: string;
  title: string;
  level: string;
  scheduleType: string;
  firstDueDate: string | null;
  recurrenceEndDate: string | null;
  intervalUnit: string | null;
  intervalValue: number | null;
  ownerUserId: string | null;
  deputyUserId: string | null;
  emailReminderEnabled: boolean;
  emailReminderDaysBefore: number | null;
  ownerUser: OwnerUserRow;
  legalDocument: {
    id: string;
    projectId: string;
    scopeOverride: Prisma.JsonValue;
    project: ProjectScopeRow;
  };
};

type GeneratedObligationTask = {
  id: string;
  type: "OBLIGATION";
  obligationId: string;
  title: string;
  dueDate: string;
  assignedToUserId?: string;
  deputyUserId?: string;
  legalDocId: string;
  ownerUser: OwnerUserRow;
  emailReminderEnabled: boolean;
  emailReminderDaysBefore?: number;
  legalDocument: DashboardObligationRow["legalDocument"];
};

type MinimalTaskStateEntry = {
  taskInstanceId: string;
  status: string;
  completedAt: Date | null;
  completedByUserId: string | null;
  updatedAt: Date;
};

type ObligationTaskAggregateCounts = {
  openTaskCount: number;
  overdueTaskCount: number;
  dueSoonTaskCount: number;
  totalWindowTaskCount: number;
  doneWindowTaskCount: number;
};

type RawObligationTaskAggregateCounts = {
  openTaskCount: bigint | number | null;
  overdueTaskCount: bigint | number | null;
  dueSoonTaskCount: bigint | number | null;
  totalWindowTaskCount: bigint | number | null;
  doneWindowTaskCount: bigint | number | null;
};

type ObligationAggregateRow = {
  id: string;
  scheduleType: string;
  firstDueDate: string | null;
  recurrenceEndDate: string | null;
  intervalUnit: string | null;
  intervalValue: number | null;
};

type RecurringObligationRule = {
  obligationId: string;
  seriesStartDate: string;
  recurrenceEndDate?: string;
  intervalUnit: DateOnlyIntervalUnit;
  intervalValue: number;
};

type CompletedRecurringTaskStateRow = {
  taskInstanceId: string;
};

type DisplayCandidateDiagnostics = {
  rowsScanned: number;
  occurrenceCandidatesScanned: number;
  taskStateIdsRequested: number;
  guardReached: boolean;
};

type DashboardDeadlineReminderRow = {
  id: string;
  title: string;
  dueDate: string;
  status: string;
  projectId: string | null;
  legalDocId: string | null;
};

const obligationSummarySelect = {
  id: true,
  legalDocId: true,
  title: true,
  level: true,
  scheduleType: true,
  firstDueDate: true,
  recurrenceEndDate: true,
  intervalUnit: true,
  intervalValue: true,
  ownerUserId: true,
  deputyUserId: true,
  emailReminderEnabled: true,
  emailReminderDaysBefore: true,
  ownerUser: {
    select: ownerUserSelect
  },
  legalDocument: {
    select: {
      id: true,
      projectId: true,
      scopeOverride: true,
      project: {
        select: projectScopeSelect
      }
    }
  }
} satisfies Prisma.ObligationSelect;

const obligationAggregateSelect = {
  id: true,
  scheduleType: true,
  firstDueDate: true,
  recurrenceEndDate: true,
  intervalUnit: true,
  intervalValue: true
} satisfies Prisma.ObligationSelect;

function padDatePart(value: number) {
  return String(value).padStart(2, "0");
}

function formatUtcDateOnly(date: Date) {
  return `${date.getUTCFullYear()}-${padDatePart(date.getUTCMonth() + 1)}-${padDatePart(
    date.getUTCDate()
  )}`;
}

export function todayDateOnlyInTimeZone(now = new Date(), timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const getPart = (type: string) => parts.find((part) => part.type === type)?.value;
  const year = getPart("year");
  const month = getPart("month");
  const day = getPart("day");

  if (!year || !month || !day) {
    throw new Error("Could not derive dashboard date from configured time zone.");
  }

  return `${year}-${month}-${day}`;
}

function normalizeDateOnly(value: string | null | undefined) {
  if (!value || !DATE_ONLY_PATTERN.test(value)) {
    return undefined;
  }

  const [year, month, day] = value.split("-").map((part) => Number(part));
  const parsed = new Date(Date.UTC(year, month - 1, day));
  const normalized = formatUtcDateOnly(parsed);
  return normalized === value ? value : undefined;
}

function addDateOnlyInterval(dateOnly: string, unit: DateOnlyIntervalUnit, value: number) {
  const normalized = normalizeDateOnly(dateOnly);
  if (!normalized) {
    return undefined;
  }

  const [year, month, day] = normalized.split("-").map((part) => Number(part));
  const next = new Date(Date.UTC(year, month - 1, day));
  switch (unit) {
    case "DAY":
      next.setUTCDate(next.getUTCDate() + value);
      break;
    case "WEEK":
      next.setUTCDate(next.getUTCDate() + value * 7);
      break;
    case "QUARTER":
      next.setUTCMonth(next.getUTCMonth() + value * 3);
      break;
    case "YEAR":
      next.setUTCFullYear(next.getUTCFullYear() + value);
      break;
    case "MONTH":
    default:
      next.setUTCMonth(next.getUTCMonth() + value);
      break;
  }
  return formatUtcDateOnly(next);
}

function addDateOnlyDays(dateOnly: string, days: number) {
  const normalized = normalizeDateOnly(dateOnly);
  if (!normalized || !Number.isFinite(days)) {
    return undefined;
  }

  const [year, month, day] = normalized.split("-").map((part) => Number(part));
  const next = new Date(Date.UTC(year, month - 1, day));
  next.setUTCDate(next.getUTCDate() + Math.trunc(days));
  return formatUtcDateOnly(next);
}

function dateOnlyEpochDay(dateOnly: string) {
  const normalized = normalizeDateOnly(dateOnly);
  if (!normalized) {
    return undefined;
  }

  const [year, month, day] = normalized.split("-").map((part) => Number(part));
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

function isIntervalUnit(value: string | null | undefined): value is DateOnlyIntervalUnit {
  return value === "DAY" || value === "WEEK" || value === "MONTH" || value === "QUARTER" || value === "YEAR";
}

function parseLimit(value: unknown) {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = typeof raw === "string" ? Number.parseInt(raw, 10) : NaN;
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_LIMIT;
  }
  return Math.min(Math.trunc(parsed), MAX_LIMIT);
}

function buildObligationTaskInstanceId(obligationId: string, dueDateISO: string) {
  return `obligation:${obligationId}:${dueDateISO}`;
}

function emptySummary(generatedAt: string, limit: number): DashboardSummary {
  return {
    generatedAt,
    range: {
      dueSoonDays: DUE_SOON_DAYS,
      taskHorizonDays: TASK_HORIZON_DAYS,
      completionWindowDays: COMPLETION_WINDOW_DAYS,
      limit
    },
    stats: {
      openTasks: 0,
      overdueTasks: 0,
      tasksDueSoon: 0,
      openDeadlines: 0,
      overdueDeadlines: 0,
      deadlinesDueSoon: 0,
      openObligations: 0,
      completionRatePercent: 0
    },
    overdueTasks: [],
    notifications: []
  };
}

function combineWhere<T extends object>(...clauses: Array<T | null | undefined>): T {
  const active = clauses.filter((clause): clause is T => Boolean(clause && Object.keys(clause).length > 0));
  if (active.length === 0) {
    return {} as T;
  }
  if (active.length === 1) {
    return active[0];
  }
  return { AND: active } as T;
}

function deadlineProjectWhere(scope: AccessScope): Prisma.DeadlineWhereInput | null {
  if (scope.projectIds === null) {
    return {};
  }
  if (scope.projectIds.length === 0) {
    return null;
  }
  return {
    OR: [
      {
        projectId: {
          in: scope.projectIds
        }
      },
      {
        legalDocument: {
          projectId: {
            in: scope.projectIds
          }
        }
      }
    ]
  };
}

function obligationProjectWhere(scope: AccessScope): Prisma.ObligationWhereInput | null {
  if (scope.projectIds === null) {
    return {};
  }
  if (scope.projectIds.length === 0) {
    return null;
  }
  return {
    legalDocument: {
      projectId: {
        in: scope.projectIds
      }
    }
  };
}

function obligationCandidateSliceLimit(limit: number) {
  return Math.min(
    MAX_OBLIGATION_CANDIDATE_SLICE_LIMIT,
    Math.max(MIN_OBLIGATION_CANDIDATE_SLICE_LIMIT, limit * OBLIGATION_CANDIDATE_SLICE_MULTIPLIER)
  );
}

function displayCandidateScanLimit(limit: number) {
  return Math.min(MAX_DISPLAY_CANDIDATE_ROW_SCAN_LIMIT, obligationCandidateSliceLimit(limit));
}

function recurringObligationOverlapWhere(startDate: string, endDate: string): Prisma.ObligationWhereInput {
  return {
    scheduleType: {
      in: ["RECURRING", "ONCE_THEN_RECURRING"]
    },
    AND: [
      {
        OR: [
          {
            firstDueDate: null
          },
          {
            firstDueDate: {
              lte: endDate
            }
          }
        ]
      },
      {
        OR: [
          {
            recurrenceEndDate: null
          },
          {
            recurrenceEndDate: {
              gte: startDate
            }
          }
        ]
      }
    ]
  };
}

async function findObligationSummaryRows(
  prisma: PrismaClient,
  where: Prisma.ObligationWhereInput,
  take: number,
  orderBy: Prisma.ObligationOrderByWithRelationInput[]
): Promise<DashboardObligationRow[]> {
  return prisma.obligation.findMany({
    where,
    select: obligationSummarySelect,
    orderBy,
    take
  }) as Promise<DashboardObligationRow[]>;
}

async function findObligationSummaryRowsByIds(
  prisma: PrismaClient,
  ids: string[]
): Promise<DashboardObligationRow[]> {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  if (uniqueIds.length === 0) {
    return [];
  }

  const rows = (await prisma.obligation.findMany({
    where: {
      id: {
        in: uniqueIds
      }
    },
    select: obligationSummarySelect
  })) as DashboardObligationRow[];
  const orderById = new Map(uniqueIds.map((id, index) => [id, index] as const));
  return rows.sort((left, right) => (orderById.get(left.id) ?? 0) - (orderById.get(right.id) ?? 0));
}

function validDateOnlySql(columnSql: Prisma.Sql) {
  return Prisma.sql`${dateOnlyAsDateSql(columnSql)} IS NOT NULL`;
}

function dateOnlyYearSql(columnSql: Prisma.Sql) {
  return Prisma.sql`split_part(${columnSql}, '-', 1)::int`;
}

function dateOnlyMonthSql(columnSql: Prisma.Sql) {
  return Prisma.sql`split_part(${columnSql}, '-', 2)::int`;
}

function dateOnlyDaySql(columnSql: Prisma.Sql) {
  return Prisma.sql`split_part(${columnSql}, '-', 3)::int`;
}

function dateOnlyAsDateSql(columnSql: Prisma.Sql) {
  const yearSql = dateOnlyYearSql(columnSql);
  const monthSql = dateOnlyMonthSql(columnSql);
  const daySql = dateOnlyDaySql(columnSql);

  return Prisma.sql`CASE
    WHEN ${columnSql} ~ ${DATE_ONLY_SQL_PATTERN} THEN
      CASE
        WHEN ${yearSql} BETWEEN 1 AND 9999 THEN
          CASE
            WHEN ${monthSql} BETWEEN 1 AND 12 THEN
              CASE
                WHEN ${daySql} BETWEEN 1 AND EXTRACT(
                  DAY FROM (
                    make_date(${yearSql}, ${monthSql}, 1)
                    + INTERVAL '1 month'
                    - INTERVAL '1 day'
                  )
                )::int
                THEN make_date(${yearSql}, ${monthSql}, ${daySql})
                ELSE NULL
              END
            ELSE NULL
          END
        ELSE NULL
      END
    ELSE NULL
  END`;
}

function validOnceThenRecurringInitialSql() {
  return Prisma.sql`(
    o."scheduleType" <> 'ONCE_THEN_RECURRING'
    OR (
      o."intervalUnit" IN ('DAY', 'WEEK', 'MONTH', 'QUARTER', 'YEAR')
      AND COALESCE(o."intervalValue", 0) > 0
      AND (
        o."recurrenceEndDate" IS NULL
        OR (
          ${validDateOnlySql(Prisma.sql`o."recurrenceEndDate"`)}
          AND o."firstDueDate" <= o."recurrenceEndDate"
        )
      )
    )
  )`;
}

async function loadSingleOccurrenceOverdueObligationRows(input: {
  prisma: PrismaClient;
  accessScope: AccessScope;
  today: string;
  take: number;
}) {
  const { prisma, accessScope, today, take } = input;
  const projectScopeSql = obligationRawProjectScopeSql(accessScope);
  if (projectScopeSql === null || take <= 0) {
    return [];
  }

  const candidateIds = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT o.id
    FROM "Obligation" o
    INNER JOIN "LegalDocument" ld ON ld.id = o."legalDocId"
    WHERE o."isArchived" = false
      ${projectScopeSql}
      AND o."scheduleType" IN ('ONCE', 'ONCE_THEN_RECURRING')
      AND o."firstDueDate" IS NOT NULL
      AND ${validDateOnlySql(Prisma.sql`o."firstDueDate"`)}
      AND o."firstDueDate" < ${today}
      AND ${validOnceThenRecurringInitialSql()}
      AND NOT EXISTS (
        SELECT 1
        FROM "TaskStateEntry" t
        WHERE t."taskInstanceId" = 'obligation:' || o.id || ':' || o."firstDueDate"
          AND t.status = 'DONE'
      )
    ORDER BY o."firstDueDate" ASC, o.title ASC, o.id ASC
    LIMIT ${take}
  `;

  return findObligationSummaryRowsByIds(prisma, candidateIds.map((candidate) => candidate.id));
}

async function loadSingleOccurrenceReminderObligationRows(input: {
  prisma: PrismaClient;
  accessScope: AccessScope;
  today: string;
  take: number;
}) {
  const { prisma, accessScope, today, take } = input;
  const projectScopeSql = obligationRawProjectScopeSql(accessScope);
  if (projectScopeSql === null || take <= 0) {
    return [];
  }

  const candidateIds = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT o.id
    FROM "Obligation" o
    INNER JOIN "LegalDocument" ld ON ld.id = o."legalDocId"
    WHERE o."isArchived" = false
      ${projectScopeSql}
      AND o."scheduleType" IN ('ONCE', 'ONCE_THEN_RECURRING')
      AND o."emailReminderEnabled" = true
      AND COALESCE(o."emailReminderDaysBefore", ${DEFAULT_REMINDER_DAYS_BEFORE}) >= 0
      AND o."firstDueDate" IS NOT NULL
      AND ${validDateOnlySql(Prisma.sql`o."firstDueDate"`)}
      AND CASE
        WHEN ${validDateOnlySql(Prisma.sql`o."firstDueDate"`)}
        THEN to_char(
          (
            ${dateOnlyAsDateSql(Prisma.sql`o."firstDueDate"`)}
            - (COALESCE(o."emailReminderDaysBefore", ${DEFAULT_REMINDER_DAYS_BEFORE}) * INTERVAL '1 day')
          )::date,
          'YYYY-MM-DD'
        ) = ${today}
        ELSE false
      END
      AND ${validOnceThenRecurringInitialSql()}
      AND NOT EXISTS (
        SELECT 1
        FROM "TaskStateEntry" t
        WHERE t."taskInstanceId" = 'obligation:' || o.id || ':' || o."firstDueDate"
          AND t.status = 'DONE'
      )
    ORDER BY o."firstDueDate" ASC, o.title ASC, o.id ASC
    LIMIT ${take}
  `;

  return findObligationSummaryRowsByIds(prisma, candidateIds.map((candidate) => candidate.id));
}
function emptyObligationTaskAggregateCounts(): ObligationTaskAggregateCounts {
  return {
    openTaskCount: 0,
    overdueTaskCount: 0,
    dueSoonTaskCount: 0,
    totalWindowTaskCount: 0,
    doneWindowTaskCount: 0
  };
}

function toSafeNumber(value: bigint | number | null | undefined) {
  if (typeof value === "bigint") {
    return Number(value);
  }
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function normalizeRawObligationTaskAggregateCounts(
  value: RawObligationTaskAggregateCounts | null | undefined
): ObligationTaskAggregateCounts {
  return {
    openTaskCount: toSafeNumber(value?.openTaskCount),
    overdueTaskCount: toSafeNumber(value?.overdueTaskCount),
    dueSoonTaskCount: toSafeNumber(value?.dueSoonTaskCount),
    totalWindowTaskCount: toSafeNumber(value?.totalWindowTaskCount),
    doneWindowTaskCount: toSafeNumber(value?.doneWindowTaskCount)
  };
}

function addObligationTaskAggregateCounts(
  left: ObligationTaskAggregateCounts,
  right: ObligationTaskAggregateCounts
): ObligationTaskAggregateCounts {
  return {
    openTaskCount: left.openTaskCount + right.openTaskCount,
    overdueTaskCount: left.overdueTaskCount + right.overdueTaskCount,
    dueSoonTaskCount: left.dueSoonTaskCount + right.dueSoonTaskCount,
    totalWindowTaskCount: left.totalWindowTaskCount + right.totalWindowTaskCount,
    doneWindowTaskCount: left.doneWindowTaskCount + right.doneWindowTaskCount
  };
}

function obligationRawProjectScopeSql(scope: AccessScope) {
  if (scope.projectIds === null) {
    return Prisma.empty;
  }
  if (scope.projectIds.length === 0) {
    return null;
  }
  return Prisma.sql`AND ld."projectId" IN (${Prisma.join(scope.projectIds)})`;
}

function deadlineRawProjectScopeSql(scope: AccessScope) {
  if (scope.projectIds === null) {
    return Prisma.empty;
  }
  if (scope.projectIds.length === 0) {
    return null;
  }
  return Prisma.sql`AND (d."projectId" IN (${Prisma.join(scope.projectIds)}) OR ld."projectId" IN (${Prisma.join(scope.projectIds)}))`;
}

function advanceOccurrenceCursorToEarliest(
  cursor: string,
  earliestDate: string,
  unit: DateOnlyIntervalUnit,
  value: number
) {
  let nextCursor = cursor;

  if (unit === "DAY" || unit === "WEEK") {
    const cursorDay = dateOnlyEpochDay(nextCursor);
    const earliestDay = dateOnlyEpochDay(earliestDate);
    const stepDays = unit === "DAY" ? value : value * 7;
    if (cursorDay !== undefined && earliestDay !== undefined && stepDays > 0 && cursorDay < earliestDay) {
      const jumpCount = Math.max(0, Math.floor((earliestDay - cursorDay - 1) / stepDays));
      if (jumpCount > 0) {
        nextCursor = addDateOnlyInterval(nextCursor, unit, value * jumpCount) ?? nextCursor;
      }
    }
  }

  while (nextCursor < earliestDate) {
    const advanced = addDateOnlyInterval(nextCursor, unit, value);
    if (!advanced || advanced <= nextCursor) {
      return undefined;
    }
    nextCursor = advanced;
  }

  return nextCursor;
}

function maxDateOnly(left: string, right: string) {
  return left >= right ? left : right;
}

function minDateOnly(left: string, right: string) {
  return left <= right ? left : right;
}

function dateOnlyFromEpochDay(epochDay: number) {
  return formatUtcDateOnly(new Date(epochDay * 86_400_000));
}

function normalizeRecurringObligationRule(
  obligation: ObligationAggregateRow,
  today: string
): RecurringObligationRule | undefined {
  if (obligation.scheduleType !== "RECURRING" && obligation.scheduleType !== "ONCE_THEN_RECURRING") {
    return undefined;
  }

  const value = obligation.intervalValue ?? 0;
  if (!isIntervalUnit(obligation.intervalUnit) || value <= 0) {
    return undefined;
  }

  const firstDueDate = obligation.firstDueDate ? normalizeDateOnly(obligation.firstDueDate) : undefined;
  const startDate = firstDueDate ?? today;
  if (!normalizeDateOnly(startDate)) {
    return undefined;
  }

  const recurrenceEndDate = obligation.recurrenceEndDate
    ? normalizeDateOnly(obligation.recurrenceEndDate)
    : undefined;
  if (obligation.recurrenceEndDate && !recurrenceEndDate) {
    return undefined;
  }

  let seriesStartDate = startDate;
  if (obligation.scheduleType === "ONCE_THEN_RECURRING") {
    if (!firstDueDate) {
      return undefined;
    }
    const recurringStartDate = addDateOnlyInterval(firstDueDate, obligation.intervalUnit, value);
    if (!recurringStartDate || recurringStartDate <= firstDueDate) {
      return undefined;
    }
    seriesStartDate = recurringStartDate;
  }

  if (recurrenceEndDate && recurrenceEndDate < seriesStartDate) {
    return undefined;
  }

  return {
    obligationId: obligation.id,
    seriesStartDate,
    recurrenceEndDate,
    intervalUnit: obligation.intervalUnit,
    intervalValue: value
  };
}

function effectiveOccurrenceWindow(rule: RecurringObligationRule, windowStart: string, windowEnd: string) {
  const normalizedStart = normalizeDateOnly(windowStart);
  const normalizedEnd = normalizeDateOnly(windowEnd);
  if (!normalizedStart || !normalizedEnd) {
    return undefined;
  }

  const start = maxDateOnly(rule.seriesStartDate, normalizedStart);
  const end = rule.recurrenceEndDate
    ? minDateOnly(rule.recurrenceEndDate, normalizedEnd)
    : normalizedEnd;
  if (start > end) {
    return undefined;
  }

  return { start, end };
}

function getFirstOccurrenceOnOrAfter(rule: RecurringObligationRule, date: string) {
  const normalizedDate = normalizeDateOnly(date);
  if (!normalizedDate) {
    return undefined;
  }
  const earliestDate = maxDateOnly(rule.seriesStartDate, normalizedDate);
  if (rule.recurrenceEndDate && earliestDate > rule.recurrenceEndDate) {
    return undefined;
  }

  if (rule.intervalUnit === "DAY" || rule.intervalUnit === "WEEK") {
    const startDay = dateOnlyEpochDay(rule.seriesStartDate);
    const targetDay = dateOnlyEpochDay(earliestDate);
    const stepDays = rule.intervalUnit === "DAY" ? rule.intervalValue : rule.intervalValue * 7;
    if (startDay === undefined || targetDay === undefined || stepDays <= 0) {
      return undefined;
    }
    const offset = Math.max(0, Math.ceil((targetDay - startDay) / stepDays));
    const occurrenceDate = dateOnlyFromEpochDay(startDay + offset * stepDays);
    if (rule.recurrenceEndDate && occurrenceDate > rule.recurrenceEndDate) {
      return undefined;
    }
    return occurrenceDate;
  }

  const occurrenceDate = advanceOccurrenceCursorToEarliest(
    rule.seriesStartDate,
    earliestDate,
    rule.intervalUnit,
    rule.intervalValue
  );
  if (!occurrenceDate || (rule.recurrenceEndDate && occurrenceDate > rule.recurrenceEndDate)) {
    return undefined;
  }
  return occurrenceDate;
}

function countOccurrencesInWindow(rule: RecurringObligationRule, windowStart: string, windowEnd: string) {
  const window = effectiveOccurrenceWindow(rule, windowStart, windowEnd);
  if (!window) {
    return 0;
  }

  if (rule.intervalUnit === "DAY" || rule.intervalUnit === "WEEK") {
    const firstOccurrence = getFirstOccurrenceOnOrAfter(rule, window.start);
    if (!firstOccurrence || firstOccurrence > window.end) {
      return 0;
    }
    const firstDay = dateOnlyEpochDay(firstOccurrence);
    const endDay = dateOnlyEpochDay(window.end);
    const stepDays = rule.intervalUnit === "DAY" ? rule.intervalValue : rule.intervalValue * 7;
    if (firstDay === undefined || endDay === undefined || stepDays <= 0) {
      return 0;
    }
    return Math.floor((endDay - firstDay) / stepDays) + 1;
  }

  let count = 0;
  let cursor = getFirstOccurrenceOnOrAfter(rule, window.start);
  while (cursor && cursor <= window.end) {
    count += 1;
    const nextCursor = addDateOnlyInterval(cursor, rule.intervalUnit, rule.intervalValue);
    if (!nextCursor || nextCursor <= cursor) {
      break;
    }
    cursor = nextCursor;
  }
  return count;
}

function isDateOnlyInWindow(dateOnly: string, windowStart: string, windowEnd: string) {
  return dateOnly >= windowStart && dateOnly <= windowEnd;
}

function isValidOccurrenceDate(rule: RecurringObligationRule, dateOnly: string) {
  const normalizedDate = normalizeDateOnly(dateOnly);
  if (!normalizedDate) {
    return false;
  }
  if (normalizedDate < rule.seriesStartDate || (rule.recurrenceEndDate && normalizedDate > rule.recurrenceEndDate)) {
    return false;
  }

  if (rule.intervalUnit === "DAY" || rule.intervalUnit === "WEEK") {
    const startDay = dateOnlyEpochDay(rule.seriesStartDate);
    const occurrenceDay = dateOnlyEpochDay(normalizedDate);
    const stepDays = rule.intervalUnit === "DAY" ? rule.intervalValue : rule.intervalValue * 7;
    return (
      startDay !== undefined &&
      occurrenceDay !== undefined &&
      stepDays > 0 &&
      occurrenceDay >= startDay &&
      (occurrenceDay - startDay) % stepDays === 0
    );
  }

  return getFirstOccurrenceOnOrAfter(rule, normalizedDate) === normalizedDate;
}

function parseObligationTaskInstanceId(taskInstanceId: string) {
  if (!taskInstanceId.startsWith("obligation:")) {
    return undefined;
  }
  const parts = taskInstanceId.split(":");
  if (parts.length !== 3 || !parts[1] || !parts[2]) {
    return undefined;
  }
  const dueDate = normalizeDateOnly(parts[2]);
  if (!dueDate) {
    return undefined;
  }
  return {
    obligationId: parts[1],
    dueDate
  };
}

async function loadCompletedRecurringTaskStateRows(
  prisma: PrismaClient,
  obligationIds: string[],
  windowStart: string,
  windowEnd: string
) {
  const uniqueIds = Array.from(new Set(obligationIds.filter(Boolean)));
  const entries: CompletedRecurringTaskStateRow[] = [];

  for (let index = 0; index < uniqueIds.length; index += TASK_STATE_CHUNK_SIZE) {
    const chunk = uniqueIds.slice(index, index + TASK_STATE_CHUNK_SIZE);
    if (chunk.length === 0) {
      continue;
    }
    entries.push(
      ...(await prisma.$queryRaw<CompletedRecurringTaskStateRow[]>`
        SELECT t."taskInstanceId"
        FROM "TaskStateEntry" t
        WHERE t.status = 'DONE'
          AND t."taskInstanceId" LIKE 'obligation:%'
          AND split_part(t."taskInstanceId", ':', 2) IN (${Prisma.join(chunk)})
          AND split_part(t."taskInstanceId", ':', 3) ~ ${DATE_ONLY_SQL_PATTERN}
          AND split_part(t."taskInstanceId", ':', 3) >= ${windowStart}
          AND split_part(t."taskInstanceId", ':', 3) <= ${windowEnd}
      `)
    );
  }

  return entries;
}

async function computeSingleOccurrenceObligationAggregates(input: {
  prisma: PrismaClient;
  accessScope: AccessScope;
  today: string;
  dueSoonEnd: string;
  completionStart: string;
  taskHorizonEnd: string;
}) {
  const { prisma, accessScope, today, dueSoonEnd, completionStart, taskHorizonEnd } = input;
  const projectScopeSql = obligationRawProjectScopeSql(accessScope);
  if (projectScopeSql === null) {
    return emptyObligationTaskAggregateCounts();
  }

  const rows = await prisma.$queryRaw<RawObligationTaskAggregateCounts[]>`
    WITH single_occurrences AS (
      SELECT
        o.id AS "obligationId",
        o."firstDueDate" AS "dueDate"
      FROM "Obligation" o
      INNER JOIN "LegalDocument" ld ON ld.id = o."legalDocId"
      WHERE o."isArchived" = false
        ${projectScopeSql}
        AND o."scheduleType" IN ('ONCE', 'ONCE_THEN_RECURRING')
        AND o."firstDueDate" IS NOT NULL
        AND ${validDateOnlySql(Prisma.sql`o."firstDueDate"`)}
        AND o."firstDueDate" <= ${taskHorizonEnd}
        AND (
          o."scheduleType" <> 'ONCE_THEN_RECURRING'
          OR o."recurrenceEndDate" IS NULL
          OR (
            ${validDateOnlySql(Prisma.sql`o."recurrenceEndDate"`)}
            AND o."firstDueDate" <= o."recurrenceEndDate"
          )
        )
    )
    SELECT
      COUNT(*) FILTER (
        WHERE s."dueDate" >= ${today}
          AND s."dueDate" <= ${taskHorizonEnd}
          AND COALESCE(t.status, 'OPEN') <> 'DONE'
      ) AS "openTaskCount",
      COUNT(*) FILTER (
        WHERE s."dueDate" < ${today}
          AND COALESCE(t.status, 'OPEN') <> 'DONE'
      ) AS "overdueTaskCount",
      COUNT(*) FILTER (
        WHERE s."dueDate" >= ${today}
          AND s."dueDate" <= ${dueSoonEnd}
          AND COALESCE(t.status, 'OPEN') <> 'DONE'
      ) AS "dueSoonTaskCount",
      COUNT(*) FILTER (
        WHERE s."dueDate" >= ${completionStart}
          AND s."dueDate" <= ${today}
      ) AS "totalWindowTaskCount",
      COUNT(*) FILTER (
        WHERE s."dueDate" >= ${completionStart}
          AND s."dueDate" <= ${today}
          AND t.status = 'DONE'
      ) AS "doneWindowTaskCount"
    FROM single_occurrences s
    LEFT JOIN "TaskStateEntry" t
      ON t."taskInstanceId" = 'obligation:' || s."obligationId" || ':' || s."dueDate"
  `;

  return normalizeRawObligationTaskAggregateCounts(rows[0]);
}

async function computeRecurringObligationAggregates(input: {
  prisma: PrismaClient;
  obligationBaseWhere: Prisma.ObligationWhereInput | null;
  today: string;
  dueSoonEnd: string;
  completionStart: string;
  taskHorizonEnd: string;
}) {
  const { prisma, obligationBaseWhere, today, dueSoonEnd, completionStart, taskHorizonEnd } = input;
  if (!obligationBaseWhere) {
    return emptyObligationTaskAggregateCounts();
  }

  const recurringWhere = combineWhere<Prisma.ObligationWhereInput>(
    obligationBaseWhere,
    recurringObligationOverlapWhere(completionStart, taskHorizonEnd)
  );
  const overdueEnd = addDateOnlyDays(today, -1) ?? today;
  const counts = emptyObligationTaskAggregateCounts();
  let lastSeenId: string | undefined;

  while (true) {
    const pageWhere = lastSeenId
      ? combineWhere<Prisma.ObligationWhereInput>(recurringWhere, {
          id: {
            gt: lastSeenId
          }
        })
      : recurringWhere;
    const rows = (await prisma.obligation.findMany({
      where: pageWhere,
      select: obligationAggregateSelect,
      orderBy: [{ id: "asc" }],
      take: RECURRING_AGGREGATE_BATCH_SIZE
    })) as ObligationAggregateRow[];

    if (rows.length === 0) {
      break;
    }

    lastSeenId = rows[rows.length - 1]?.id;
    const rules = rows
      .map((row) => normalizeRecurringObligationRule(row, today))
      .filter((rule): rule is RecurringObligationRule => Boolean(rule));

    for (const rule of rules) {
      counts.openTaskCount += countOccurrencesInWindow(rule, today, taskHorizonEnd);
      counts.overdueTaskCount += countOccurrencesInWindow(rule, completionStart, overdueEnd);
      counts.dueSoonTaskCount += countOccurrencesInWindow(rule, today, dueSoonEnd);
      counts.totalWindowTaskCount += countOccurrencesInWindow(rule, completionStart, today);
    }

    if (rules.length > 0) {
      const rulesByObligationId = new Map(rules.map((rule) => [rule.obligationId, rule] as const));
      const completedTaskStates = await loadCompletedRecurringTaskStateRows(
        prisma,
        rules.map((rule) => rule.obligationId),
        completionStart,
        taskHorizonEnd
      );

      for (const taskState of completedTaskStates) {
        const parsed = parseObligationTaskInstanceId(taskState.taskInstanceId);
        if (!parsed) {
          continue;
        }
        const rule = rulesByObligationId.get(parsed.obligationId);
        if (!rule || !isValidOccurrenceDate(rule, parsed.dueDate)) {
          continue;
        }

        if (isDateOnlyInWindow(parsed.dueDate, today, taskHorizonEnd)) {
          counts.openTaskCount -= 1;
        }
        if (isDateOnlyInWindow(parsed.dueDate, completionStart, overdueEnd)) {
          counts.overdueTaskCount -= 1;
        }
        if (isDateOnlyInWindow(parsed.dueDate, today, dueSoonEnd)) {
          counts.dueSoonTaskCount -= 1;
        }
        if (isDateOnlyInWindow(parsed.dueDate, completionStart, today)) {
          counts.doneWindowTaskCount += 1;
        }
      }
    }

    if (rows.length < RECURRING_AGGREGATE_BATCH_SIZE || !lastSeenId) {
      break;
    }
  }

  counts.openTaskCount = Math.max(0, counts.openTaskCount);
  counts.overdueTaskCount = Math.max(0, counts.overdueTaskCount);
  counts.dueSoonTaskCount = Math.max(0, counts.dueSoonTaskCount);

  return counts;
}

async function computeObligationSummaryAggregates(input: {
  prisma: PrismaClient;
  accessScope: AccessScope;
  obligationBaseWhere: Prisma.ObligationWhereInput | null;
  today: string;
  dueSoonEnd: string;
  completionStart: string;
  taskHorizonEnd: string;
}) {
  const { prisma, accessScope, obligationBaseWhere, today, dueSoonEnd, completionStart, taskHorizonEnd } = input;
  if (!obligationBaseWhere) {
    return emptyObligationTaskAggregateCounts();
  }

  const [singleOccurrenceCounts, recurringCounts] = await Promise.all([
    computeSingleOccurrenceObligationAggregates({
      prisma,
      accessScope,
      today,
      dueSoonEnd,
      completionStart,
      taskHorizonEnd
    }),
    computeRecurringObligationAggregates({
      prisma,
      obligationBaseWhere,
      today,
      dueSoonEnd,
      completionStart,
      taskHorizonEnd
    })
  ]);

  return addObligationTaskAggregateCounts(singleOccurrenceCounts, recurringCounts);
}

function normalizeTaskStateStatus(value: string | null | undefined): Exclude<DashboardTaskStatus, "OVERDUE"> {
  if (value === "DONE") {
    return "DONE";
  }
  if (value === "IN_PROGRESS") {
    return "IN_PROGRESS";
  }
  return "OPEN";
}

function normalizeDeadlineStatus(value: string | null | undefined, dueDate: string, today: string): DashboardTaskStatus {
  if (value === "DONE") {
    return "DONE";
  }
  return dueDate < today ? "OVERDUE" : "OPEN";
}

function formatUserLabel(user: OwnerUserRow) {
  if (!user) {
    return undefined;
  }
  const label = [user.firstName, user.lastName].map((part) => part.trim()).filter(Boolean).join(" ");
  if (!label) {
    return undefined;
  }
  return user.isArchived ? `${label} (Archiviert)` : label;
}

function parseScopeOverride(value: Prisma.JsonValue): ScopeOverrideValue | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const row = value as { companyId?: unknown; siteId?: unknown; facilityId?: unknown };
  if (typeof row.companyId !== "string" || !row.companyId.trim()) {
    return undefined;
  }

  return {
    companyId: row.companyId,
    siteId: typeof row.siteId === "string" && row.siteId.trim() ? row.siteId : undefined,
    facilityId: typeof row.facilityId === "string" && row.facilityId.trim() ? row.facilityId : undefined
  };
}

function emptyScopeNameLookups(): ScopeNameLookups {
  return {
    companies: new Map(),
    sites: new Map(),
    facilities: new Map()
  };
}

function projectScopeLabel(project: ProjectScopeRow | null | undefined) {
  if (!project) {
    return "";
  }

  const companyName = project.company?.name ?? project.companyId;
  if (!project.siteId) {
    return companyName;
  }

  const siteName = project.site?.name ?? project.siteId;
  if (!project.facilityId) {
    return `${companyName} / ${siteName}`;
  }

  const facilityName = project.facility?.name ?? project.facilityId;
  return `${companyName} / ${siteName} / ${facilityName}`;
}

function scopeOverrideLabel(scopeOverride: ScopeOverrideValue, lookups: ScopeNameLookups) {
  const companyName = lookups.companies.get(scopeOverride.companyId) ?? scopeOverride.companyId;
  if (!scopeOverride.siteId) {
    return companyName;
  }

  const siteName = lookups.sites.get(scopeOverride.siteId) ?? scopeOverride.siteId;
  if (!scopeOverride.facilityId) {
    return `${companyName} / ${siteName}`;
  }

  const facilityName = lookups.facilities.get(scopeOverride.facilityId) ?? scopeOverride.facilityId;
  return `${companyName} / ${siteName} / ${facilityName}`;
}

function legalDocScopeLabel(
  legalDocument: DashboardObligationRow["legalDocument"] | DashboardDeadlineRow["legalDocument"],
  scopeLookups: ScopeNameLookups
) {
  if (!legalDocument) {
    return "";
  }

  const scopeOverride = parseScopeOverride(legalDocument.scopeOverride);
  if (scopeOverride) {
    return scopeOverrideLabel(scopeOverride, scopeLookups);
  }

  return projectScopeLabel(legalDocument.project);
}

async function loadScopeOverrideLookups(
  prisma: PrismaClient,
  legalDocuments: Array<DashboardObligationRow["legalDocument"] | DashboardDeadlineRow["legalDocument"] | null | undefined>
): Promise<ScopeNameLookups> {
  const companyIds = new Set<string>();
  const siteIds = new Set<string>();
  const facilityIds = new Set<string>();

  for (const legalDocument of legalDocuments) {
    const scopeOverride = legalDocument ? parseScopeOverride(legalDocument.scopeOverride) : undefined;
    if (!scopeOverride) {
      continue;
    }
    companyIds.add(scopeOverride.companyId);
    if (scopeOverride.siteId) {
      siteIds.add(scopeOverride.siteId);
    }
    if (scopeOverride.facilityId) {
      facilityIds.add(scopeOverride.facilityId);
    }
  }

  if (companyIds.size === 0 && siteIds.size === 0 && facilityIds.size === 0) {
    return emptyScopeNameLookups();
  }

  const [companies, sites, facilities] = await Promise.all([
    companyIds.size > 0
      ? prisma.company.findMany({
          where: {
            id: {
              in: Array.from(companyIds)
            }
          },
          select: {
            id: true,
            name: true
          }
        })
      : Promise.resolve([]),
    siteIds.size > 0
      ? prisma.site.findMany({
          where: {
            id: {
              in: Array.from(siteIds)
            }
          },
          select: {
            id: true,
            name: true
          }
        })
      : Promise.resolve([]),
    facilityIds.size > 0
      ? prisma.facility.findMany({
          where: {
            id: {
              in: Array.from(facilityIds)
            }
          },
          select: {
            id: true,
            name: true
          }
        })
      : Promise.resolve([])
  ]);

  return {
    companies: new Map(companies.map((company) => [company.id, company.name] as const)),
    sites: new Map(sites.map((site) => [site.id, site.name] as const)),
    facilities: new Map(facilities.map((facility) => [facility.id, facility.name] as const))
  };
}

function createGeneratedObligationTask(
  obligation: DashboardObligationRow,
  dueDateISO: string
): GeneratedObligationTask | undefined {
  const dueDate = normalizeDateOnly(dueDateISO);
  if (!dueDate) {
    return undefined;
  }

  return {
    id: buildObligationTaskInstanceId(obligation.id, dueDate),
    type: "OBLIGATION",
    obligationId: obligation.id,
    title: obligation.title,
    dueDate,
    assignedToUserId: obligation.ownerUserId ?? undefined,
    deputyUserId: obligation.deputyUserId ?? undefined,
    legalDocId: obligation.legalDocId,
    ownerUser: obligation.ownerUser,
    emailReminderEnabled: obligation.emailReminderEnabled,
    emailReminderDaysBefore: obligation.emailReminderDaysBefore ?? undefined,
    legalDocument: obligation.legalDocument
  };
}

function nextRecurringOccurrence(
  rule: RecurringObligationRule,
  currentDate: string
) {
  const nextDate = addDateOnlyInterval(currentDate, rule.intervalUnit, rule.intervalValue);
  if (!nextDate || nextDate <= currentDate) {
    return undefined;
  }
  if (rule.recurrenceEndDate && nextDate > rule.recurrenceEndDate) {
    return undefined;
  }
  return nextDate;
}

function emptyDisplayCandidateDiagnostics(): DisplayCandidateDiagnostics {
  return {
    rowsScanned: 0,
    occurrenceCandidatesScanned: 0,
    taskStateIdsRequested: 0,
    guardReached: false
  };
}

function mergeDisplayCandidateDiagnostics(
  target: DisplayCandidateDiagnostics,
  source: DisplayCandidateDiagnostics
) {
  target.rowsScanned += source.rowsScanned;
  target.occurrenceCandidatesScanned += source.occurrenceCandidatesScanned;
  target.taskStateIdsRequested += source.taskStateIdsRequested;
  target.guardReached = target.guardReached || source.guardReached;
}

function sortGeneratedObligationTasks(items: GeneratedObligationTask[]) {
  return [...items].sort((left, right) => {
    const dueDate = left.dueDate.localeCompare(right.dueDate);
    if (dueDate !== 0) {
      return dueDate;
    }
    const title = left.title.localeCompare(right.title);
    if (title !== 0) {
      return title;
    }
    return left.id.localeCompare(right.id);
  });
}

function collectRecurringOverdueDisplayCandidates(input: {
  obligations: DashboardObligationRow[];
  today: string;
  completionStart: string;
  overdueEnd: string;
  completedTaskInstanceIds: Set<string>;
  maxOccurrenceScans: number;
}) {
  const {
    obligations,
    today,
    completionStart,
    overdueEnd,
    completedTaskInstanceIds,
    maxOccurrenceScans
  } = input;
  const tasks: GeneratedObligationTask[] = [];
  const diagnostics = emptyDisplayCandidateDiagnostics();

  for (const obligation of obligations) {
    diagnostics.rowsScanned += 1;
    const rule = normalizeRecurringObligationRule(obligation, today);
    let cursor = rule ? getFirstOccurrenceOnOrAfter(rule, completionStart) : undefined;

    while (rule && cursor && cursor <= overdueEnd) {
      if (diagnostics.occurrenceCandidatesScanned >= maxOccurrenceScans) {
        diagnostics.guardReached = true;
        return { tasks, diagnostics };
      }

      diagnostics.occurrenceCandidatesScanned += 1;
      const taskInstanceId = buildObligationTaskInstanceId(obligation.id, cursor);
      if (!completedTaskInstanceIds.has(taskInstanceId)) {
        const task = createGeneratedObligationTask(obligation, cursor);
        if (task) {
          tasks.push(task);
        }
        break;
      }

      cursor = nextRecurringOccurrence(rule, cursor);
    }
  }

  return { tasks, diagnostics };
}

function collectRecurringReminderDisplayCandidates(input: {
  obligations: DashboardObligationRow[];
  today: string;
  taskHorizonEnd: string;
  maxOccurrenceScans: number;
}) {
  const { obligations, today, taskHorizonEnd, maxOccurrenceScans } = input;
  const tasks: GeneratedObligationTask[] = [];
  const diagnostics = emptyDisplayCandidateDiagnostics();

  for (const obligation of obligations) {
    diagnostics.rowsScanned += 1;
    if (diagnostics.occurrenceCandidatesScanned >= maxOccurrenceScans) {
      diagnostics.guardReached = true;
      break;
    }

    const reminderDays = obligation.emailReminderDaysBefore ?? DEFAULT_REMINDER_DAYS_BEFORE;
    if (reminderDays < 0) {
      continue;
    }
    const dueDate = addDateOnlyDays(today, reminderDays);
    if (!dueDate || dueDate > taskHorizonEnd) {
      continue;
    }

    diagnostics.occurrenceCandidatesScanned += 1;
    const rule = normalizeRecurringObligationRule(obligation, today);
    if (!rule || !isValidOccurrenceDate(rule, dueDate)) {
      continue;
    }
    const task = createGeneratedObligationTask(obligation, dueDate);
    if (task) {
      tasks.push(task);
    }
  }

  return { tasks, diagnostics };
}

async function loadOverdueObligationDisplayCandidates(input: {
  prisma: PrismaClient;
  accessScope: AccessScope;
  obligationBaseWhere: Prisma.ObligationWhereInput | null;
  today: string;
  completionStart: string;
  limit: number;
}) {
  const { prisma, accessScope, obligationBaseWhere, today, completionStart, limit } = input;
  const diagnostics = emptyDisplayCandidateDiagnostics();
  if (!obligationBaseWhere) {
    return { tasks: [] satisfies GeneratedObligationTask[], diagnostics };
  }

  const take = displayCandidateScanLimit(limit);
  const overdueEnd = addDateOnlyDays(today, -1) ?? today;
  const recurringWhere = combineWhere<Prisma.ObligationWhereInput>(
    obligationBaseWhere,
    recurringObligationOverlapWhere(completionStart, overdueEnd)
  );

  const [singleRows, recurringRows] = await Promise.all([
    loadSingleOccurrenceOverdueObligationRows({
      prisma,
      accessScope,
      today,
      take
    }),
    findObligationSummaryRows(
      prisma,
      recurringWhere,
      take,
      [{ firstDueDate: "asc" }, { title: "asc" }, { id: "asc" }]
    )
  ]);

  diagnostics.rowsScanned += singleRows.length;
  diagnostics.occurrenceCandidatesScanned += singleRows.length;
  diagnostics.taskStateIdsRequested += singleRows.length;
  const singleTasks = singleRows
    .map((row) => (row.firstDueDate ? createGeneratedObligationTask(row, row.firstDueDate) : undefined))
    .filter((task): task is GeneratedObligationTask => Boolean(task));

  const completedRows = await loadCompletedRecurringTaskStateRows(
    prisma,
    recurringRows.map((row) => row.id),
    completionStart,
    overdueEnd
  );
  diagnostics.taskStateIdsRequested += completedRows.length;
  const recurringResult = collectRecurringOverdueDisplayCandidates({
    obligations: recurringRows,
    today,
    completionStart,
    overdueEnd,
    completedTaskInstanceIds: new Set(completedRows.map((row) => row.taskInstanceId)),
    maxOccurrenceScans: MAX_DISPLAY_OCCURRENCE_SCANS
  });
  mergeDisplayCandidateDiagnostics(diagnostics, recurringResult.diagnostics);

  return {
    tasks: sortGeneratedObligationTasks([...singleTasks, ...recurringResult.tasks]).slice(0, take),
    diagnostics
  };
}

async function loadReminderObligationDisplayCandidates(input: {
  prisma: PrismaClient;
  accessScope: AccessScope;
  obligationBaseWhere: Prisma.ObligationWhereInput | null;
  today: string;
  taskHorizonEnd: string;
  limit: number;
}) {
  const { prisma, accessScope, obligationBaseWhere, today, taskHorizonEnd, limit } = input;
  const diagnostics = emptyDisplayCandidateDiagnostics();
  if (!obligationBaseWhere) {
    return { tasks: [] satisfies GeneratedObligationTask[], diagnostics };
  }

  const take = displayCandidateScanLimit(limit);
  const recurringWhere = combineWhere<Prisma.ObligationWhereInput>(
    obligationBaseWhere,
    {
      emailReminderEnabled: true
    },
    recurringObligationOverlapWhere(today, taskHorizonEnd)
  );

  const [singleRows, recurringRows] = await Promise.all([
    loadSingleOccurrenceReminderObligationRows({
      prisma,
      accessScope,
      today,
      take
    }),
    findObligationSummaryRows(
      prisma,
      recurringWhere,
      take,
      [{ firstDueDate: "asc" }, { title: "asc" }, { id: "asc" }]
    )
  ]);

  diagnostics.rowsScanned += singleRows.length;
  diagnostics.occurrenceCandidatesScanned += singleRows.length;
  diagnostics.taskStateIdsRequested += singleRows.length;
  const singleTasks = singleRows
    .map((row) => (row.firstDueDate ? createGeneratedObligationTask(row, row.firstDueDate) : undefined))
    .filter((task): task is GeneratedObligationTask => Boolean(task));
  const recurringResult = collectRecurringReminderDisplayCandidates({
    obligations: recurringRows,
    today,
    taskHorizonEnd,
    maxOccurrenceScans: MAX_DISPLAY_OCCURRENCE_SCANS
  });
  mergeDisplayCandidateDiagnostics(diagnostics, recurringResult.diagnostics);
  diagnostics.taskStateIdsRequested += recurringResult.tasks.length;

  return {
    tasks: sortGeneratedObligationTasks([...singleTasks, ...recurringResult.tasks]).slice(0, take),
    diagnostics
  };
}

async function loadTaskStateMap(
  prisma: PrismaClient,
  taskInstanceIds: string[]
) {
  const uniqueIds = Array.from(new Set(taskInstanceIds.filter(Boolean)));
  const entries: MinimalTaskStateEntry[] = [];

  for (let index = 0; index < uniqueIds.length; index += TASK_STATE_CHUNK_SIZE) {
    const chunk = uniqueIds.slice(index, index + TASK_STATE_CHUNK_SIZE);
    entries.push(
      ...(await prisma.taskStateEntry.findMany({
        where: {
          taskInstanceId: {
            in: chunk
          }
        },
        select: {
          taskInstanceId: true,
          status: true,
          completedAt: true,
          completedByUserId: true,
          updatedAt: true
        }
      }))
    );
  }

  return new Map(entries.map((entry) => [entry.taskInstanceId, entry] as const));
}

function toObligationTaskSummaryItem(
  task: GeneratedObligationTask,
  status: DashboardTaskStatus,
  scopeLookups: ScopeNameLookups
): DashboardTaskSummaryItem {
  return {
    id: task.id,
    type: "OBLIGATION",
    title: task.title,
    dueDate: task.dueDate,
    status,
    assignedTo: formatUserLabel(task.ownerUser),
    scopeLabel: legalDocScopeLabel(task.legalDocument, scopeLookups),
    projectId: task.legalDocument.projectId,
    legalDocId: task.legalDocId,
    obligationId: task.obligationId
  };
}

function toDeadlineTaskSummaryItem(
  deadline: DashboardDeadlineRow,
  status: DashboardTaskStatus,
  scopeLookups: ScopeNameLookups
): DashboardTaskSummaryItem {
  const projectId = deadline.projectId ?? deadline.legalDocument?.projectId ?? undefined;
  return {
    id: `deadline:${deadline.id}`,
    type: "DEADLINE",
    title: deadline.title,
    dueDate: deadline.dueDate,
    status,
    assignedTo: formatUserLabel(deadline.ownerUser),
    scopeLabel: deadline.legalDocument
      ? legalDocScopeLabel(deadline.legalDocument, scopeLookups)
      : projectScopeLabel(deadline.project),
    projectId,
    legalDocId: deadline.legalDocId ?? undefined,
    deadlineId: deadline.id
  };
}

function toDeadlineReminderTaskSummaryItem(
  deadline: DashboardDeadlineReminderRow,
  today: string
): DashboardTaskSummaryItem {
  const projectId = deadline.projectId ?? undefined;
  return {
    id: `deadline:${deadline.id}`,
    type: "DEADLINE",
    title: deadline.title,
    dueDate: deadline.dueDate,
    status: normalizeDeadlineStatus(deadline.status, deadline.dueDate, today),
    scopeLabel: "",
    projectId,
    legalDocId: deadline.legalDocId ?? undefined,
    deadlineId: deadline.id
  };
}

function toNotification(
  item: DashboardTaskSummaryItem,
  generatedAt: string,
  type: DashboardNotificationType
): DashboardNotificationSummaryItem {
  const isDeadline = item.type === "DEADLINE" && item.deadlineId;
  return {
    id:
      type === "REMINDER"
        ? `reminder:${item.id}:${item.dueDate}`
        : isDeadline
        ? `overdue:deadline:${item.deadlineId}`
        : `overdue:${item.id}`,
    type,
    entityType: isDeadline ? "DEADLINE" : "TASK",
    entityId: isDeadline ? item.deadlineId! : item.id,
    taskInstanceId: item.id,
    title: item.title,
    dueDate: item.dueDate,
    createdAt: generatedAt
  };
}

function sortTasksByDueDateAndTitle(items: DashboardTaskSummaryItem[]) {
  return [...items].sort((left, right) => {
    const dueDate = left.dueDate.localeCompare(right.dueDate);
    if (dueDate !== 0) {
      return dueDate;
    }
    return left.title.localeCompare(right.title);
  });
}

function dedupeObligationTasksByObligation(items: DashboardTaskSummaryItem[]) {
  const byObligationId = new Map<string, DashboardTaskSummaryItem>();
  const remainingItems: DashboardTaskSummaryItem[] = [];

  for (const item of sortTasksByDueDateAndTitle(items)) {
    if (item.type !== "OBLIGATION" || !item.obligationId) {
      remainingItems.push(item);
      continue;
    }
    if (!byObligationId.has(item.obligationId)) {
      byObligationId.set(item.obligationId, item);
    }
  }

  return [...byObligationId.values(), ...remainingItems];
}

async function loadDeadlineReminderRows(input: {
  prisma: PrismaClient;
  accessScope: AccessScope;
  today: string;
  take: number;
}) {
  const { prisma, accessScope, today, take } = input;
  const projectScopeSql = deadlineRawProjectScopeSql(accessScope);
  if (projectScopeSql === null || take <= 0) {
    return [] satisfies DashboardDeadlineReminderRow[];
  }

  const candidateIds = await prisma.$queryRaw<Array<{ id: string }>>`
    WITH reminder_candidates AS (
      SELECT
        d.id,
        d.title,
        d."dueDate",
        COALESCE(d."emailReminderDaysBefore", ${DEFAULT_REMINDER_DAYS_BEFORE}) AS "reminderDaysBefore",
        ${dateOnlyAsDateSql(Prisma.sql`d."dueDate"`)} AS "normalizedDueDate"
      FROM "Deadline" d
      LEFT JOIN "LegalDocument" ld ON ld.id = d."legalDocId"
      WHERE d."isArchived" = false
        ${projectScopeSql}
        AND d.status <> 'DONE'
        AND d."emailReminderEnabled" = true
        AND d."dueDate" IS NOT NULL
    )
    SELECT id
    FROM reminder_candidates
    WHERE "normalizedDueDate" IS NOT NULL
      AND to_char("normalizedDueDate", 'YYYY-MM-DD') >= ${today}
      AND "reminderDaysBefore" >= 0
      AND to_char(
        (
          "normalizedDueDate"
          - ("reminderDaysBefore" * INTERVAL '1 day')
        )::date,
        'YYYY-MM-DD'
      ) = ${today}
    ORDER BY "dueDate" ASC, title ASC, id ASC
    LIMIT ${take}
  `;
  const ids = candidateIds.map((candidate) => candidate.id);
  if (ids.length === 0) {
    return [] satisfies DashboardDeadlineReminderRow[];
  }

  const rows = await prisma.deadline.findMany({
    where: {
      id: {
        in: ids
      }
    },
    select: {
      id: true,
      title: true,
      dueDate: true,
      status: true,
      projectId: true,
      legalDocId: true
    }
  });
  const orderById = new Map(ids.map((id, index) => [id, index] as const));
  return rows.sort((left, right) => (orderById.get(left.id) ?? 0) - (orderById.get(right.id) ?? 0));
}

async function buildSummary(input: {
  prisma: PrismaClient;
  user: RouteUser;
  generatedAt: string;
  today: string;
  limit: number;
}) {
  const { prisma, user, generatedAt, today, limit } = input;
  const dueSoonEnd = addDateOnlyDays(today, DUE_SOON_DAYS) ?? today;
  const completionStart = addDateOnlyDays(today, -COMPLETION_WINDOW_DAYS) ?? today;
  const taskHorizonEnd = addDateOnlyDays(today, TASK_HORIZON_DAYS) ?? today;
  const summary = emptySummary(generatedAt, limit);

  if (isExternalUser(user)) {
    return summary;
  }

  const projectIds = hasGlobalProjectReadAccess(user)
    ? null
    : await getAccessibleProjectIds(prisma, user);
  const accessScope = { projectIds };
  const deadlineScopeWhere = deadlineProjectWhere(accessScope);
  const obligationScopeWhere = obligationProjectWhere(accessScope);
  const canReadDeadlines = hasDomainReadPermission(user, "deadlines") && deadlineScopeWhere !== null;
  const canReadObligations = hasDomainReadPermission(user, "obligations") && obligationScopeWhere !== null;
  const canViewTasks = hasDomainReadPermission(user, "tasks");
  const canUseDeadlineTasks = canViewTasks && canReadDeadlines;
  const canUseObligationTasks = canViewTasks && canReadObligations;
  const displayCandidateLimit = obligationCandidateSliceLimit(limit);

  const deadlineBaseWhere = canReadDeadlines
    ? combineWhere<Prisma.DeadlineWhereInput>({ isArchived: false }, deadlineScopeWhere)
    : null;
  const obligationBaseWhere = canReadObligations
    ? combineWhere<Prisma.ObligationWhereInput>({ isArchived: false }, obligationScopeWhere)
    : null;

  const [
    openDeadlines,
    overdueDeadlines,
    deadlinesDueSoon,
    openDeadlineTasks,
    overdueDeadlineTasks,
    dueSoonDeadlineTasks,
    totalWindowDeadlineTasks,
    doneWindowDeadlineTasks,
    overdueDeadlineRows,
    reminderDeadlineRows,
    openObligations,
    obligationAggregates,
    overdueObligationCandidates,
    reminderObligationCandidates
  ] = await Promise.all([
    deadlineBaseWhere
      ? prisma.deadline.count({
          where: combineWhere<Prisma.DeadlineWhereInput>(deadlineBaseWhere, { status: { not: "DONE" } })
        })
      : Promise.resolve(0),
    deadlineBaseWhere
      ? prisma.deadline.count({
          where: combineWhere<Prisma.DeadlineWhereInput>(deadlineBaseWhere, {
            status: { not: "DONE" },
            dueDate: { lt: today }
          })
        })
      : Promise.resolve(0),
    deadlineBaseWhere
      ? prisma.deadline.count({
          where: combineWhere<Prisma.DeadlineWhereInput>(deadlineBaseWhere, {
            status: { not: "DONE" },
            dueDate: { gte: today, lte: dueSoonEnd }
          })
        })
      : Promise.resolve(0),
    canUseDeadlineTasks && deadlineBaseWhere
      ? prisma.deadline.count({
          where: combineWhere<Prisma.DeadlineWhereInput>(deadlineBaseWhere, {
            status: { not: "DONE" },
            dueDate: { gte: today }
          })
        })
      : Promise.resolve(0),
    canUseDeadlineTasks && deadlineBaseWhere
      ? prisma.deadline.count({
          where: combineWhere<Prisma.DeadlineWhereInput>(deadlineBaseWhere, {
            status: { not: "DONE" },
            dueDate: { lt: today }
          })
        })
      : Promise.resolve(0),
    canUseDeadlineTasks && deadlineBaseWhere
      ? prisma.deadline.count({
          where: combineWhere<Prisma.DeadlineWhereInput>(deadlineBaseWhere, {
            status: { not: "DONE" },
            dueDate: { gte: today, lte: dueSoonEnd }
          })
        })
      : Promise.resolve(0),
    canUseDeadlineTasks && deadlineBaseWhere
      ? prisma.deadline.count({
          where: combineWhere<Prisma.DeadlineWhereInput>(deadlineBaseWhere, {
            dueDate: { gte: completionStart, lte: today }
          })
        })
      : Promise.resolve(0),
    canUseDeadlineTasks && deadlineBaseWhere
      ? prisma.deadline.count({
          where: combineWhere<Prisma.DeadlineWhereInput>(deadlineBaseWhere, {
            status: "DONE",
            dueDate: { gte: completionStart, lte: today }
          })
        })
      : Promise.resolve(0),
    canUseDeadlineTasks && deadlineBaseWhere
      ? prisma.deadline.findMany({
          where: combineWhere<Prisma.DeadlineWhereInput>(deadlineBaseWhere, {
            status: { not: "DONE" },
            dueDate: { lt: today }
          }),
          select: {
            id: true,
            title: true,
            dueDate: true,
            status: true,
            projectId: true,
            legalDocId: true,
            ownerUserId: true,
            deputyUserId: true,
            emailReminderEnabled: true,
            emailReminderDaysBefore: true,
            ownerUser: {
              select: ownerUserSelect
            },
            project: {
              select: projectScopeSelect
            },
            legalDocument: {
              select: {
                id: true,
                projectId: true,
                scopeOverride: true,
                project: {
                  select: projectScopeSelect
                }
              }
            }
          },
          orderBy: [{ dueDate: "asc" }, { title: "asc" }, { id: "asc" }],
          take: limit
        })
      : Promise.resolve([]),
    canUseDeadlineTasks && deadlineBaseWhere
      ? loadDeadlineReminderRows({
          prisma,
          accessScope,
          today,
          take: displayCandidateLimit
        })
      : Promise.resolve([]),
    obligationBaseWhere ? prisma.obligation.count({ where: obligationBaseWhere }) : Promise.resolve(0),
    canUseObligationTasks
      ? computeObligationSummaryAggregates({
          prisma,
          accessScope,
          obligationBaseWhere,
          today,
          dueSoonEnd,
          completionStart,
          taskHorizonEnd
        })
      : Promise.resolve(emptyObligationTaskAggregateCounts()),
    canUseObligationTasks
      ? loadOverdueObligationDisplayCandidates({
          prisma,
          accessScope,
          obligationBaseWhere,
          today,
          completionStart,
          limit
        })
      : Promise.resolve({
          tasks: [] satisfies GeneratedObligationTask[],
          diagnostics: emptyDisplayCandidateDiagnostics()
        }),
    canUseObligationTasks
      ? loadReminderObligationDisplayCandidates({
          prisma,
          accessScope,
          obligationBaseWhere,
          today,
          taskHorizonEnd,
          limit
        })
      : Promise.resolve({
          tasks: [] satisfies GeneratedObligationTask[],
          diagnostics: emptyDisplayCandidateDiagnostics()
        })
  ]);

  const obligationDisplayTasks = [
    ...overdueObligationCandidates.tasks,
    ...reminderObligationCandidates.tasks
  ];
  const taskStateById = await loadTaskStateMap(
    prisma,
    obligationDisplayTasks.map((task) => task.id)
  );
  const scopeLookups = await loadScopeOverrideLookups(prisma, [
    ...obligationDisplayTasks.map((task) => task.legalDocument),
    ...overdueDeadlineRows.map((deadline) => deadline.legalDocument)
  ]);
  const overdueObligationTasks: DashboardTaskSummaryItem[] = [];
  const reminderObligationTasks: DashboardTaskSummaryItem[] = [];

  for (const task of overdueObligationCandidates.tasks) {
    const stored = taskStateById.get(task.id);
    const storedStatus = normalizeTaskStateStatus(stored?.status);
    const status: DashboardTaskStatus = storedStatus !== "DONE" && task.dueDate < today ? "OVERDUE" : storedStatus;

    if (status === "OVERDUE") {
      overdueObligationTasks.push(toObligationTaskSummaryItem(task, status, scopeLookups));
    }
  }

  for (const task of reminderObligationCandidates.tasks) {
    const stored = taskStateById.get(task.id);
    const storedStatus = normalizeTaskStateStatus(stored?.status);
    const status: DashboardTaskStatus = storedStatus !== "DONE" && task.dueDate < today ? "OVERDUE" : storedStatus;

    if (task.emailReminderEnabled && status !== "DONE") {
      reminderObligationTasks.push(toObligationTaskSummaryItem(task, status, scopeLookups));
    }
  }

  const overdueDeadlineTaskItems = overdueDeadlineRows.map((deadline) =>
    toDeadlineTaskSummaryItem(deadline, normalizeDeadlineStatus(deadline.status, deadline.dueDate, today), scopeLookups)
  );
  const reminderDeadlineTaskItems = reminderDeadlineRows.map((deadline) =>
    toDeadlineReminderTaskSummaryItem(deadline, today)
  );
  const uniqueOverdueObligationTasks = dedupeObligationTasksByObligation(overdueObligationTasks);
  const uniqueReminderObligationTasks = dedupeObligationTasksByObligation(reminderObligationTasks);

  const overdueTasks = sortTasksByDueDateAndTitle([
    ...uniqueOverdueObligationTasks,
    ...overdueDeadlineTaskItems
  ]).slice(0, limit);
  const reminderTasks = sortTasksByDueDateAndTitle([
    ...uniqueReminderObligationTasks,
    ...reminderDeadlineTaskItems
  ]).slice(0, limit);
  const notifications = [
    ...reminderTasks.map((item) => toNotification(item, generatedAt, "REMINDER")),
    ...overdueTasks.map((item) => toNotification(item, generatedAt, "OVERDUE"))
  ].slice(0, limit);
  const totalWindowTasks = obligationAggregates.totalWindowTaskCount + totalWindowDeadlineTasks;
  const doneWindowTasks = obligationAggregates.doneWindowTaskCount + doneWindowDeadlineTasks;

  return {
    ...summary,
    stats: {
      openTasks: obligationAggregates.openTaskCount + openDeadlineTasks,
      overdueTasks: obligationAggregates.overdueTaskCount + overdueDeadlineTasks,
      tasksDueSoon: obligationAggregates.dueSoonTaskCount + dueSoonDeadlineTasks,
      openDeadlines,
      overdueDeadlines,
      deadlinesDueSoon,
      openObligations,
      completionRatePercent:
        totalWindowTasks > 0 ? Math.round((doneWindowTasks / totalWindowTasks) * 100) : 0
    },
    overdueTasks,
    notifications
  } satisfies DashboardSummary;
}

export const dashboardSummaryTestInternals = {
  displayCandidateScanLimit,
  maxDisplayOccurrenceScans: MAX_DISPLAY_OCCURRENCE_SCANS,
  collectRecurringOverdueDisplayCandidates,
  collectRecurringReminderDisplayCandidates,
  loadOverdueObligationDisplayCandidates,
  loadReminderObligationDisplayCandidates,
  computeRecurringObligationAggregates,
  buildObligationTaskInstanceId,
  recurringAggregateBatchSize: RECURRING_AGGREGATE_BATCH_SIZE
};

export function createDashboardRouter(
  prisma: PrismaClient,
  config: Pick<AppConfig, "perfLoggingEnabled" | "nodeEnv" | "notificationTimeZone">
) {
  const router = Router();

  router.get("/dashboard/summary", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);
      const perf = createPerfTimer(config, req, "dashboard.summary");
      const user = await perf.measure("auth", async () => requireAuthenticatedRouteUser(req, res, prisma));
      if (!user) {
        return;
      }

      if (!hasPermission(user.permissionKeys, "dashboard.view")) {
        res.status(403).json({ ok: false, message: "Forbidden." });
        return;
      }

      const limit = parseLimit(req.query.limit);
      const generatedAt = new Date().toISOString();
      const today = todayDateOnlyInTimeZone(new Date(), config.notificationTimeZone);
      const summary = await perf.measure("summary queries", async () =>
        buildSummary({
          prisma,
          user,
          generatedAt,
          today,
          limit
        })
      );

      perf.mark("response", {
        overdueTaskCount: summary.overdueTasks.length,
        notificationCount: summary.notifications.length
      });
      res.json(summary);
    } catch (error) {
      next(error);
    }
  });

  return router;
}
