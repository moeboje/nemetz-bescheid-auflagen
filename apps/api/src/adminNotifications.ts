import { Prisma, type NotificationOutbox, type PrismaClient } from "@prisma/client";
import type { AppConfig } from "./config.js";
import { EMAIL_DISPATCH_WORKER_KEY, buildPortalUrl, parseStoredPayload } from "./notifications.js";
import { getEffectiveNotificationSettings } from "./notificationSettings.js";

export type AdminNotificationListFilters = {
  q?: string;
  recipient?: string;
  status?: string;
  eventType?: string;
  entityType?: string;
  dateFrom?: string;
  dateTo?: string;
  page: number;
  pageSize: number;
};

export type AdminNotificationListItem = {
  id: string;
  eventType: string;
  entityType?: string;
  entityId?: string;
  recipientUserId?: string;
  recipientEmail: string;
  recipientName?: string;
  subject: string;
  title: string;
  message: string;
  severity: string;
  status: string;
  scheduledFor: string;
  claimedAt?: string;
  sentAt?: string;
  attemptCount: number;
  lastAttemptAt?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string;
  entity?: Record<string, unknown>;
  project?: Record<string, unknown>;
  link?: string;
};

export type AdminNotificationDetail = AdminNotificationListItem & {
  claimTokenPresent: boolean;
  claimedAt?: string;
  providerReference?: string;
  payload: {
    title: string;
    message: string;
    severity: string;
    linkPath?: string;
    link?: string;
    entity?: Record<string, unknown>;
    project?: Record<string, unknown>;
    expiresAt?: string;
  };
  attempts: Array<{
    id: string;
    attemptNumber: number;
    outcome: string;
    startedAt: string;
    finishedAt: string;
    httpStatus?: number;
    errorSummary?: string;
    providerReference?: string;
    triggeredByUserId?: string;
  }>;
  passwordReset?: {
    expiresAt?: string;
    usedAt?: string;
    state: "ACTIVE" | "USED" | "EXPIRED" | "MISSING";
  };
};

function toIso(value: Date | null | undefined) {
  return value ? value.toISOString() : undefined;
}

function buildNotificationListItem(config: AppConfig, entry: NotificationOutbox): AdminNotificationListItem {
  const payload = parseStoredPayload(entry.payloadJson);

  return {
    id: entry.id,
    eventType: entry.eventType,
    entityType: entry.entityType ?? undefined,
    entityId: entry.entityId ?? undefined,
    recipientUserId: entry.recipientUserId ?? undefined,
    recipientEmail: entry.recipientEmail,
    recipientName: entry.recipientName ?? undefined,
    subject: entry.subject,
    title: payload.title,
    message: payload.message,
    severity: payload.severity,
    status: entry.status,
    scheduledFor: entry.scheduledFor.toISOString(),
    claimedAt: toIso(entry.claimedAt),
    sentAt: toIso(entry.sentAt),
    attemptCount: entry.attemptCount,
    lastAttemptAt: toIso(entry.lastAttemptAt),
    lastError: entry.lastError ?? undefined,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
    expiresAt: payload.expiresAt,
    entity: payload.entity,
    project: payload.project,
    link: payload.linkPath ? buildPortalUrl(config, payload.linkPath) : undefined
  };
}

function getStaleClaimCutoff(config: AppConfig, now: Date) {
  return new Date(now.getTime() - config.notificationClaimLeaseSeconds * 1_000);
}

function isStaleClaimedEntry(
  entry: Pick<NotificationOutbox, "status" | "claimedAt">,
  staleClaimCutoff: Date
) {
  return entry.status === "CLAIMED" && Boolean(entry.claimedAt && entry.claimedAt < staleClaimCutoff);
}

function buildStaleClaimWhere(staleClaimCutoff: Date): Prisma.NotificationOutboxWhereInput {
  return {
    status: "CLAIMED",
    claimedAt: {
      lt: staleClaimCutoff
    }
  };
}

function buildObservedSnapshotWhere(
  entry: Pick<
    NotificationOutbox,
    "id" | "status" | "updatedAt" | "claimedAt" | "claimToken" | "attemptCount" | "lastAttemptAt"
  >
): Prisma.NotificationOutboxWhereInput {
  return {
    id: entry.id,
    status: entry.status,
    updatedAt: entry.updatedAt,
    claimedAt: entry.claimedAt,
    claimToken: entry.claimToken,
    attemptCount: entry.attemptCount,
    lastAttemptAt: entry.lastAttemptAt
  };
}

function buildRetryTransitionWhere(entry: NotificationOutbox, staleClaimCutoff: Date): Prisma.NotificationOutboxWhereInput {
  return {
    AND: [
      buildObservedSnapshotWhere(entry),
      {
        OR: [{ status: "FAILED" }, { status: "RETRY" }, buildStaleClaimWhere(staleClaimCutoff)]
      }
    ]
  };
}

function buildCancelTransitionWhere(entry: NotificationOutbox, staleClaimCutoff: Date): Prisma.NotificationOutboxWhereInput {
  return {
    AND: [
      buildObservedSnapshotWhere(entry),
      {
        OR: [{ status: "PENDING" }, { status: "RETRY" }, { status: "FAILED" }, buildStaleClaimWhere(staleClaimCutoff)]
      }
    ]
  };
}

async function loadUpdatedNotificationOrConflict(
  prisma: PrismaClient,
  config: AppConfig,
  targetStatus: "PENDING" | "CANCELLED",
  notificationId: string
): Promise<
  | { kind: "missing" }
  | { kind: "conflict"; message: string }
  | { kind: "ok"; entry: AdminNotificationListItem }
> {
  const current = await prisma.notificationOutbox.findUnique({
    where: {
      id: notificationId
    }
  });

  if (!current) {
    return { kind: "missing" };
  }

  if (current.status === targetStatus) {
    return {
      kind: "ok",
      entry: buildNotificationListItem(config, current)
    };
  }

  return {
    kind: "conflict",
    message: "Notification wurde inzwischen von einem Worker uebernommen oder veraendert."
  };
}

function getPasswordResetTokenId(idempotencyKey: string) {
  return idempotencyKey.startsWith("password-reset:") ? idempotencyKey.slice("password-reset:".length) : "";
}

export async function getAdminNotificationOverview(prisma: PrismaClient, config: AppConfig) {
  const now = new Date();
  const staleClaimCutoff = getStaleClaimCutoff(config, now);

  const [grouped, oldestPending, staleClaimedCount, workerStatus, notificationSettings, sentTodayRows] =
    await Promise.all([
      prisma.notificationOutbox.groupBy({
        by: ["status"],
        _count: {
          _all: true
        }
      }),
      prisma.notificationOutbox.findFirst({
        where: {
          status: {
            in: ["PENDING", "RETRY"]
          }
        },
        orderBy: [
          {
            scheduledFor: "asc"
          },
          {
            createdAt: "asc"
          }
        ],
        select: {
          id: true,
          scheduledFor: true,
          eventType: true
        }
      }),
      prisma.notificationOutbox.count({
        where: {
          status: "CLAIMED",
          claimedAt: {
            lt: staleClaimCutoff
          }
        }
      }),
      prisma.notificationWorkerStatus.findUnique({
        where: {
          workerKey: EMAIL_DISPATCH_WORKER_KEY
        }
      }),
      getEffectiveNotificationSettings(prisma),
      prisma.$queryRaw<Array<{ count: number }>>(Prisma.sql`
        SELECT COUNT(*)::int AS "count"
        FROM "NotificationOutbox"
        WHERE "sentAt" IS NOT NULL
          AND ("sentAt" AT TIME ZONE ${config.notificationTimeZone})::date = (NOW() AT TIME ZONE ${config.notificationTimeZone})::date
      `)
    ]);

  const counts = Object.fromEntries(grouped.map((row) => [row.status, row._count._all]));
  const pendingCount = Number(counts.PENDING ?? 0);
  const retryCount = Number(counts.RETRY ?? 0);
  const failedCount = Number(counts.FAILED ?? 0);
  const claimedCount = Number(counts.CLAIMED ?? 0);
  const sentCount = Number(counts.SENT ?? 0);
  const cancelledCount = Number(counts.CANCELLED ?? 0);
  const sentToday = sentTodayRows[0]?.count ?? 0;
  const warnings: string[] = [];

  if (!config.notificationDispatchEnabled) {
    warnings.push("Notification-Dispatch ist global deaktiviert.");
  }

  if (config.notificationDryRun) {
    warnings.push("Notification-Dispatch laeuft im Dry-Run-Modus.");
  }

  if (!config.powerAutomateNotificationWebhookUrl.trim()) {
    warnings.push("Power-Automate-Webhook ist nicht konfiguriert.");
  }

  if (!config.powerAutomateNotificationSecret.trim()) {
    warnings.push("Power-Automate-Secret ist nicht konfiguriert.");
  }

  if (staleClaimedCount > 0) {
    warnings.push(`${staleClaimedCount} Benachrichtigungen haengen im CLAIMED-Status.`);
  }

  if ((pendingCount > 0 || retryCount > 0) && !workerStatus?.lastSuccessfulAt) {
    warnings.push("Es gibt offene Benachrichtigungen, aber noch keinen erfolgreichen Dispatcher-Lauf.");
  }

  return {
    summary: {
      pendingCount,
      retryCount,
      failedCount,
      claimedCount,
      sentCount,
      cancelledCount,
      sentToday,
      oldestPendingAt: oldestPending?.scheduledFor.toISOString(),
      oldestPendingEventType: oldestPending?.eventType,
      staleClaimedCount
    },
    workerStatus: workerStatus
      ? {
          workerKey: workerStatus.workerKey,
          lastStartedAt: toIso(workerStatus.lastStartedAt),
          lastFinishedAt: toIso(workerStatus.lastFinishedAt),
          lastSuccessfulAt: toIso(workerStatus.lastSuccessfulAt),
          lastOutcome: workerStatus.lastOutcome ?? undefined,
          lastError: workerStatus.lastError ?? undefined,
          lastClaimedCount: workerStatus.lastClaimedCount,
          lastProcessedCount: workerStatus.lastProcessedCount
        }
      : null,
    dispatchConfig: {
      dispatchEnabled: config.notificationDispatchEnabled,
      dryRun: config.notificationDryRun,
      maxAttempts: config.notificationMaxAttempts,
      batchSize: config.notificationDispatchBatchSize,
      timeoutMs: config.notificationDispatchTimeoutMs,
      claimLeaseSeconds: config.notificationClaimLeaseSeconds,
      timeZone: config.notificationTimeZone,
      notificationBaseUrl: config.notificationBaseUrl || config.appOrigin,
      webhookConfigured: Boolean(config.powerAutomateNotificationWebhookUrl.trim()),
      secretConfigured: Boolean(config.powerAutomateNotificationSecret.trim())
    },
    settings: notificationSettings,
    warnings
  };
}

export async function listAdminNotifications(
  prisma: PrismaClient,
  config: AppConfig,
  filters: AdminNotificationListFilters
) {
  const and: Prisma.NotificationOutboxWhereInput[] = [];
  const staleClaimCutoff = getStaleClaimCutoff(config, new Date());

  if (filters.status && filters.status !== "ALL") {
    if (filters.status === "ATTENTION") {
      and.push({
        OR: [{ status: "FAILED" }, { status: "RETRY" }, buildStaleClaimWhere(staleClaimCutoff)]
      });
    } else {
      and.push({ status: filters.status });
    }
  }

  if (filters.eventType && filters.eventType !== "ALL") {
    and.push({ eventType: filters.eventType });
  }

  if (filters.entityType && filters.entityType !== "ALL") {
    and.push({ entityType: filters.entityType });
  }

  if (filters.dateFrom) {
    and.push({
      createdAt: {
        gte: new Date(`${filters.dateFrom}T00:00:00.000Z`)
      }
    });
  }

  if (filters.dateTo) {
    and.push({
      createdAt: {
        lte: new Date(`${filters.dateTo}T23:59:59.999Z`)
      }
    });
  }

  if (filters.recipient?.trim()) {
    and.push({
      OR: [
        {
          recipientEmail: {
            contains: filters.recipient.trim(),
            mode: "insensitive"
          }
        },
        {
          recipientName: {
            contains: filters.recipient.trim(),
            mode: "insensitive"
          }
        }
      ]
    });
  }

  if (filters.q?.trim()) {
    and.push({
      OR: [
        {
          subject: {
            contains: filters.q.trim(),
            mode: "insensitive"
          }
        },
        {
          recipientEmail: {
            contains: filters.q.trim(),
            mode: "insensitive"
          }
        },
        {
          recipientName: {
            contains: filters.q.trim(),
            mode: "insensitive"
          }
        },
        {
          entityId: {
            contains: filters.q.trim(),
            mode: "insensitive"
          }
        }
      ]
    });
  }

  const where: Prisma.NotificationOutboxWhereInput = and.length > 0 ? { AND: and } : {};

  const [total, items] = await Promise.all([
    prisma.notificationOutbox.count({ where }),
    prisma.notificationOutbox.findMany({
      where,
      orderBy: [
        {
          createdAt: "desc"
        }
      ],
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize
    })
  ]);

  return {
    items: items.map((entry) => buildNotificationListItem(config, entry)),
    total,
    page: filters.page,
    pageSize: filters.pageSize
  };
}

export async function getAdminNotificationDetail(prisma: PrismaClient, config: AppConfig, notificationId: string) {
  const entry = await prisma.notificationOutbox.findUnique({
    where: {
      id: notificationId
    },
    include: {
      deliveryAttempts: {
        orderBy: {
          createdAt: "desc"
        }
      }
    }
  });

  if (!entry) {
    return null;
  }

  const payload = parseStoredPayload(entry.payloadJson);
  const detail: AdminNotificationDetail = {
    ...buildNotificationListItem(config, entry),
    claimTokenPresent: Boolean(entry.claimToken),
    claimedAt: toIso(entry.claimedAt),
    providerReference: entry.providerReference ?? undefined,
    payload: {
      title: payload.title,
      message: payload.message,
      severity: payload.severity,
      linkPath: payload.linkPath,
      link: payload.linkPath ? buildPortalUrl(config, payload.linkPath) : undefined,
      entity: payload.entity,
      project: payload.project,
      expiresAt: payload.expiresAt
    },
    attempts: entry.deliveryAttempts.map((attempt) => ({
      id: attempt.id,
      attemptNumber: attempt.attemptNumber,
      outcome: attempt.outcome,
      startedAt: attempt.startedAt.toISOString(),
      finishedAt: attempt.finishedAt.toISOString(),
      httpStatus: attempt.httpStatus ?? undefined,
      errorSummary: attempt.errorSummary ?? undefined,
      providerReference: attempt.providerReference ?? undefined,
      triggeredByUserId: attempt.triggeredByUserId ?? undefined
    }))
  };

  if (entry.eventType === "PASSWORD_RESET_LINK") {
    const tokenId = getPasswordResetTokenId(entry.idempotencyKey);
    if (!tokenId) {
      detail.passwordReset = {
        state: "MISSING"
      };
      return detail;
    }

    const token = await prisma.passwordResetToken.findUnique({
      where: {
        id: tokenId
      }
    });

    if (!token) {
      detail.passwordReset = {
        state: "MISSING"
      };
      return detail;
    }

    detail.passwordReset = {
      expiresAt: token.expiresAt.toISOString(),
      usedAt: toIso(token.usedAt),
      state: token.usedAt ? "USED" : token.expiresAt < new Date() ? "EXPIRED" : "ACTIVE"
    };
  }

  return detail;
}

export async function retryAdminNotification(
  prisma: PrismaClient,
  config: AppConfig,
  notificationId: string
) {
  const now = new Date();
  const staleClaimCutoff = getStaleClaimCutoff(config, now);
  const entry = await prisma.notificationOutbox.findUnique({
    where: {
      id: notificationId
    }
  });

  if (!entry) {
    return { kind: "missing" as const };
  }

  if (entry.eventType === "PASSWORD_RESET_LINK") {
    return { kind: "forbidden" as const, message: "Passwort-Reset-Links muessen ueber die Benutzerverwaltung neu ausgeloest werden." };
  }

  if (entry.status === "PENDING") {
    return {
      kind: "ok" as const,
      entry: buildNotificationListItem(config, entry)
    };
  }

  const isStaleClaim = isStaleClaimedEntry(entry, staleClaimCutoff);
  const canRetry = entry.status === "FAILED" || entry.status === "RETRY" || isStaleClaim;
  if (!canRetry) {
    return { kind: "invalid" as const, message: "Nur PENDING, FAILED, RETRY oder stale CLAIMED koennen erneut eingeplant werden." };
  }

  const result = await prisma.notificationOutbox.updateMany({
    where: buildRetryTransitionWhere(entry, staleClaimCutoff),
    data: {
      status: "PENDING",
      scheduledFor: now,
      claimedAt: null,
      claimToken: null,
      lastError: null,
      providerReference: null
    }
  });

  if (result.count !== 1) {
    return loadUpdatedNotificationOrConflict(prisma, config, "PENDING", notificationId);
  }

  const updated = await prisma.notificationOutbox.findUniqueOrThrow({
    where: {
      id: entry.id
    }
  });

  return {
    kind: "ok" as const,
    entry: buildNotificationListItem(config, updated)
  };
}

export async function cancelAdminNotification(
  prisma: PrismaClient,
  config: AppConfig,
  notificationId: string
) {
  const staleClaimCutoff = getStaleClaimCutoff(config, new Date());
  const entry = await prisma.notificationOutbox.findUnique({
    where: {
      id: notificationId
    }
  });

  if (!entry) {
    return { kind: "missing" as const };
  }

  if (entry.status === "CANCELLED") {
    return {
      kind: "ok" as const,
      entry: buildNotificationListItem(config, entry)
    };
  }

  const isStaleClaim = isStaleClaimedEntry(entry, staleClaimCutoff);
  const canCancel = entry.status === "PENDING" || entry.status === "RETRY" || entry.status === "FAILED" || isStaleClaim;
  if (!canCancel) {
    return { kind: "invalid" as const, message: "Nur PENDING, RETRY, FAILED oder stale CLAIMED koennen abgebrochen werden." };
  }

  const result = await prisma.notificationOutbox.updateMany({
    where: buildCancelTransitionWhere(entry, staleClaimCutoff),
    data: {
      status: "CANCELLED",
      claimedAt: null,
      claimToken: null,
      lastError: entry.lastError ?? "Von Admin abgebrochen."
    }
  });

  if (result.count !== 1) {
    return loadUpdatedNotificationOrConflict(prisma, config, "CANCELLED", notificationId);
  }

  const updated = await prisma.notificationOutbox.findUniqueOrThrow({
    where: {
      id: entry.id
    }
  });

  return {
    kind: "ok" as const,
    entry: buildNotificationListItem(config, updated)
  };
}
