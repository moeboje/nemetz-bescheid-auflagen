import { Prisma, type NotificationOutbox, type PrismaClient, type User as PrismaUser } from "@prisma/client";
import { generateOpaqueToken, hashToken } from "./security.js";
import type { AppConfig } from "./config.js";
import { getAllowExternalUsers } from "./securitySettings.js";
import { getEffectiveNotificationSettings } from "./notificationSettings.js";

type DbClient = PrismaClient | Prisma.TransactionClient;

export type NotificationEventType =
  | "PASSWORD_RESET_LINK"
  | "DEADLINE_DUE_SOON"
  | "DEADLINE_OVERDUE"
  | "ASSIGNMENT_ASSIGNED";

export type NotificationStatus = "PENDING" | "CLAIMED" | "SENT" | "RETRY" | "FAILED" | "CANCELLED";
export type NotificationSeverity = "INFO" | "WARNING" | "CRITICAL";

type RecipientSnapshot = Pick<PrismaUser, "id" | "email" | "firstName" | "lastName" | "isArchived" | "type">;

export type StoredNotificationEntity = {
  type: "USER" | "DEADLINE" | "TASK" | "PROJECT" | "LEGAL_DOC" | "OBLIGATION";
  id: string;
  label?: string;
};

export type StoredProjectReference = {
  id: string;
  title: string;
};

export type StoredNotificationPayload = {
  title: string;
  message: string;
  severity: NotificationSeverity;
  linkPath?: string;
  entity?: StoredNotificationEntity;
  project?: StoredProjectReference;
  expiresAt?: string;
};

type PowerAutomateNotificationPayload = {
  notificationId: string;
  eventType: NotificationEventType;
  recipient: {
    email: string;
    displayName?: string;
  };
  subject: string;
  title: string;
  message: string;
  link?: string;
  severity: NotificationSeverity;
  entity?: StoredNotificationEntity;
  project?: StoredProjectReference;
  expiresAt?: string;
  createdAt: string;
  fromLabel?: string;
};

type DeadlineNotificationContext = {
  id: string;
  title: string;
  dueDate: string;
  status: string;
  isArchived: boolean;
  ownerUserId: string | null;
  deputyUserId: string | null;
  emailReminderEnabled: boolean;
  emailReminderDaysBefore: number | null;
  updatedAt: Date;
  project: {
    id: string;
    title: string;
  } | null;
  ownerUser: RecipientSnapshot | null;
  deputyUser: RecipientSnapshot | null;
};

type PasswordResetDeliveryResult = {
  notificationId: string;
  expiresAt: Date;
  deliveryStatus: "SENT" | "FAILED";
  deliveryError?: string;
  resetLink?: string;
};

type NotificationDispatchCounts = {
  claimed: number;
  sent: number;
  retried: number;
  failed: number;
  cancelled: number;
};

export type NotificationDispatchCycleResult = {
  generated: number;
  stalePasswordResetsFailed: number;
  dispatch: NotificationDispatchCounts;
};

export const EMAIL_DISPATCH_WORKER_KEY = "EMAIL_DISPATCH";

const DEADLINE_NOTIFICATION_INCLUDE = {
  project: {
    select: {
      id: true,
      title: true
    }
  },
  ownerUser: {
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      isArchived: true,
      type: true
    }
  },
  deputyUser: {
    select: {
      id: true,
      email: true,
      firstName: true,
      lastName: true,
      isArchived: true,
      type: true
    }
  }
} satisfies Prisma.DeadlineInclude;

const RETRY_BACKOFF_MINUTES = [1, 5, 15, 60, 360];
const PASSWORD_RESET_STALE_ERROR =
  "Password reset delivery must be reissued because the secure reset link is not stored for async retry.";
const MAX_ERROR_LENGTH = 1_000;

class NotificationDispatchError extends Error {
  retryable: boolean;
  httpStatus?: number;

  constructor(message: string, retryable: boolean, httpStatus?: number) {
    super(message);
    this.name = "NotificationDispatchError";
    this.retryable = retryable;
    this.httpStatus = httpStatus;
  }
}

function toJsonInput(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}

function normalizeErrorMessage(value: unknown) {
  const message = value instanceof Error ? value.message : typeof value === "string" ? value : "Unknown notification error.";
  return message.slice(0, MAX_ERROR_LENGTH);
}

function trimTrailingSlash(value: string) {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function isLocalhostUrl(url: URL) {
  return url.hostname === "localhost" || url.hostname === "127.0.0.1";
}

function getNotificationBaseUrl(config: AppConfig) {
  const raw = (config.notificationBaseUrl || config.appOrigin || "").trim();
  if (!raw) {
    throw new NotificationDispatchError("NOTIFICATION_BASE_URL or APP_ORIGIN must be configured.", false);
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new NotificationDispatchError("NOTIFICATION_BASE_URL must be a valid absolute URL.", false);
  }

  if (config.nodeEnv === "production" && parsed.protocol !== "https:" && !isLocalhostUrl(parsed)) {
    throw new NotificationDispatchError("NOTIFICATION_BASE_URL must use HTTPS in production.", false);
  }

  return trimTrailingSlash(parsed.toString());
}

export function buildPortalUrl(config: AppConfig, relativePath: string) {
  const base = new URL(`${getNotificationBaseUrl(config)}/`);
  const normalizedPath = relativePath.trim().replace(/^\/+/, "");
  return new URL(normalizedPath, base).toString();
}

export function buildResetPasswordLink(config: AppConfig, rawToken: string) {
  const tokenQuery = `reset-password?token=${encodeURIComponent(rawToken)}`;
  return buildPortalUrl(config, tokenQuery);
}

function getDisplayName(user: Pick<PrismaUser, "firstName" | "lastName"> | null | undefined) {
  if (!user) {
    return "";
  }

  return `${user.firstName} ${user.lastName}`.trim();
}

function isDeliverableEmail(email: string | null | undefined) {
  const normalized = typeof email === "string" ? email.trim() : "";
  return normalized.includes("@") && normalized.includes(".");
}

function canReceiveNotification(user: RecipientSnapshot | null | undefined, allowExternalUsers: boolean) {
  if (!user || user.isArchived || !isDeliverableEmail(user.email)) {
    return false;
  }

  if (String(user.type).trim().toUpperCase() === "EXTERNAL" && !allowExternalUsers) {
    return false;
  }

  return true;
}

function buildDeadlineLinkPath(deadlineId: string) {
  return `/compliance/deadlines/${encodeURIComponent(deadlineId)}`;
}

function formatDateLabel(isoDate: string) {
  const match = isoDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) {
    return isoDate;
  }
  return `${match[3]}.${match[2]}.${match[1]}`;
}

function addDaysToIsoDate(isoDate: string, days: number) {
  const parsed = new Date(`${isoDate}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return "";
  }
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

function getTodayIso(now: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(now);
}

export function parseStoredPayload(payload: NotificationOutbox["payloadJson"]): StoredNotificationPayload {
  const row = payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, unknown>) : {};

  const entity =
    row.entity && typeof row.entity === "object" && !Array.isArray(row.entity)
      ? (row.entity as StoredNotificationEntity)
      : undefined;

  const project =
    row.project && typeof row.project === "object" && !Array.isArray(row.project)
      ? (row.project as StoredProjectReference)
      : undefined;

  return {
    title: typeof row.title === "string" ? row.title : "",
    message: typeof row.message === "string" ? row.message : "",
    severity:
      row.severity === "WARNING" || row.severity === "CRITICAL" || row.severity === "INFO"
        ? row.severity
        : "INFO",
    linkPath: typeof row.linkPath === "string" ? row.linkPath : undefined,
    entity,
    project,
    expiresAt: typeof row.expiresAt === "string" ? row.expiresAt : undefined
  };
}

function getRetryDelayMinutes(attemptCount: number) {
  const index = Math.max(0, Math.min(attemptCount - 1, RETRY_BACKOFF_MINUTES.length - 1));
  return RETRY_BACKOFF_MINUTES[index];
}

async function createOutboxEntryIfMissing(
  prisma: DbClient,
  data: Prisma.NotificationOutboxCreateInput
): Promise<NotificationOutbox | null> {
  try {
    return await prisma.notificationOutbox.create({
      data
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002" &&
      Array.isArray(error.meta?.target) &&
      error.meta.target.includes("idempotencyKey")
    ) {
      return null;
    }
    throw error;
  }
}

async function loadDeadlineNotificationContext(prisma: DbClient, deadlineId: string) {
  return prisma.deadline.findUnique({
    where: {
      id: deadlineId
    },
    include: DEADLINE_NOTIFICATION_INCLUDE
  }) as Promise<DeadlineNotificationContext | null>;
}

function getDeadlineRecipients(deadline: DeadlineNotificationContext, allowExternalUsers: boolean) {
  const dedupe = new Set<string>();
  const recipients: Array<{ role: "OWNER" | "DEPUTY"; user: RecipientSnapshot }> = [];

  if (canReceiveNotification(deadline.ownerUser, allowExternalUsers)) {
    dedupe.add(deadline.ownerUser!.id);
    recipients.push({
      role: "OWNER",
      user: deadline.ownerUser!
    });
  }

  if (
    canReceiveNotification(deadline.deputyUser, allowExternalUsers) &&
    !dedupe.has(deadline.deputyUser!.id)
  ) {
    recipients.push({
      role: "DEPUTY",
      user: deadline.deputyUser!
    });
  }

  return recipients;
}

async function enqueueDeadlineEvent(
  prisma: DbClient,
  args: {
    eventType: Extract<NotificationEventType, "DEADLINE_DUE_SOON" | "DEADLINE_OVERDUE">;
    deadline: DeadlineNotificationContext;
    recipient: RecipientSnapshot;
    subject: string;
    payload: StoredNotificationPayload;
    idempotencyKey: string;
    scheduledFor: Date;
  }
) {
  return createOutboxEntryIfMissing(prisma, {
    eventType: args.eventType,
    entityType: "DEADLINE",
    entityId: args.deadline.id,
    recipientEmail: args.recipient.email,
    recipientName: getDisplayName(args.recipient),
    subject: args.subject,
    payloadJson: toJsonInput(args.payload),
    status: "PENDING",
    scheduledFor: args.scheduledFor,
    idempotencyKey: args.idempotencyKey,
    recipientUser: {
      connect: {
        id: args.recipient.id
      }
    }
  });
}

async function markClaimedNotification(
  prisma: PrismaClient,
  entryId: string,
  claimToken: string,
  update: Prisma.NotificationOutboxUpdateManyMutationInput
) {
  await prisma.notificationOutbox.updateMany({
    where: {
      id: entryId,
      claimToken
    },
    data: update
  });
}

async function postToPowerAutomate(
  config: AppConfig,
  payload: PowerAutomateNotificationPayload
): Promise<{ providerReference?: string; httpStatus?: number }> {
  if (config.notificationDryRun) {
    return {
      providerReference: "dry-run"
    };
  }

  if (!config.notificationDispatchEnabled) {
    throw new NotificationDispatchError("Notification dispatch is disabled.", false);
  }

  if (!config.powerAutomateNotificationWebhookUrl.trim()) {
    throw new NotificationDispatchError("POWER_AUTOMATE_NOTIFICATION_WEBHOOK_URL is not configured.", false);
  }

  if (!config.powerAutomateNotificationSecret.trim()) {
    throw new NotificationDispatchError("POWER_AUTOMATE_NOTIFICATION_SECRET is not configured.", false);
  }

  let response: Response;
  try {
    response = await fetch(config.powerAutomateNotificationWebhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Notification-Secret": config.powerAutomateNotificationSecret,
        "X-Notification-Id": payload.notificationId
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(config.notificationDispatchTimeoutMs)
    });
  } catch (error) {
    throw new NotificationDispatchError(normalizeErrorMessage(error), true);
  }

  let responseBody: unknown = null;
  try {
    responseBody = await response.json();
  } catch {
    responseBody = null;
  }

  if (!response.ok) {
    const message =
      responseBody && typeof responseBody === "object" && responseBody !== null && "message" in responseBody
        ? String((responseBody as { message?: unknown }).message ?? response.statusText)
        : response.statusText || "Power Automate request failed.";
    throw new NotificationDispatchError(message, response.status >= 500 || response.status === 429, response.status);
  }

  const providerReference =
    responseBody && typeof responseBody === "object" && responseBody !== null
      ? String(
          (responseBody as { flowRunId?: unknown; messageId?: unknown }).flowRunId ??
            (responseBody as { messageId?: unknown }).messageId ??
            ""
        ) || undefined
      : undefined;

  return {
    providerReference,
    httpStatus: response.status
  };
}

async function createDeliveryAttempt(
  prisma: DbClient,
  args: {
    entry: NotificationOutbox;
    attemptNumber: number;
    startedAt: Date;
    finishedAt: Date;
    outcome: "SENT" | "RETRY" | "FAILED" | "CANCELLED";
    httpStatus?: number;
    errorSummary?: string;
    providerReference?: string;
    triggeredByUserId?: string;
  }
) {
  await prisma.notificationDeliveryAttempt.create({
    data: {
      notificationId: args.entry.id,
      attemptNumber: args.attemptNumber,
      outcome: args.outcome,
      startedAt: args.startedAt,
      finishedAt: args.finishedAt,
      httpStatus: args.httpStatus,
      errorSummary: args.errorSummary ?? null,
      providerReference: args.providerReference ?? null,
      triggeredByUserId: args.triggeredByUserId ?? null
    }
  });
}

async function markWorkerStarted(prisma: PrismaClient, startedAt: Date) {
  await prisma.notificationWorkerStatus.upsert({
    where: {
      workerKey: EMAIL_DISPATCH_WORKER_KEY
    },
    update: {
      lastStartedAt: startedAt,
      updatedAt: startedAt
    },
    create: {
      workerKey: EMAIL_DISPATCH_WORKER_KEY,
      lastStartedAt: startedAt
    }
  });
}

async function markWorkerFinished(
  prisma: PrismaClient,
  args: {
    finishedAt: Date;
    outcome: "SUCCESS" | "FAILED";
    error?: string;
    claimedCount: number;
    processedCount: number;
  }
) {
  await prisma.notificationWorkerStatus.upsert({
    where: {
      workerKey: EMAIL_DISPATCH_WORKER_KEY
    },
    update: {
      lastFinishedAt: args.finishedAt,
      lastSuccessfulAt: args.outcome === "SUCCESS" ? args.finishedAt : undefined,
      lastOutcome: args.outcome,
      lastError: args.error ?? null,
      lastClaimedCount: args.claimedCount,
      lastProcessedCount: args.processedCount,
      updatedAt: args.finishedAt
    },
    create: {
      workerKey: EMAIL_DISPATCH_WORKER_KEY,
      lastFinishedAt: args.finishedAt,
      lastSuccessfulAt: args.outcome === "SUCCESS" ? args.finishedAt : null,
      lastOutcome: args.outcome,
      lastError: args.error ?? null,
      lastClaimedCount: args.claimedCount,
      lastProcessedCount: args.processedCount
    }
  });
}

function buildPowerAutomatePayload(
  config: AppConfig,
  entry: NotificationOutbox,
  payload: StoredNotificationPayload,
  options?: {
    linkOverride?: string;
  }
): PowerAutomateNotificationPayload {
  const link = options?.linkOverride ?? (payload.linkPath ? buildPortalUrl(config, payload.linkPath) : undefined);

  return {
    notificationId: entry.id,
    eventType: entry.eventType as NotificationEventType,
    recipient: {
      email: entry.recipientEmail,
      displayName: entry.recipientName ?? undefined
    },
    subject: entry.subject,
    title: payload.title,
    message: payload.message,
    link,
    severity: payload.severity,
    entity: payload.entity,
    project: payload.project,
    expiresAt: payload.expiresAt,
    createdAt: entry.createdAt.toISOString(),
    fromLabel: config.notificationFromLabel || undefined
  };
}

async function getDispatchCancellationReason(
  prisma: PrismaClient,
  entry: NotificationOutbox,
  allowExternalUsers: boolean
) {
  if (!isDeliverableEmail(entry.recipientEmail)) {
    return "Recipient email is missing or invalid.";
  }

  if (entry.recipientUserId) {
    const user = await prisma.user.findUnique({
      where: {
        id: entry.recipientUserId
      },
      select: {
        id: true,
        isArchived: true,
        type: true
      }
    });

    if (!user || user.isArchived) {
      return "Recipient user is no longer active.";
    }

    if (String(user.type).trim().toUpperCase() === "EXTERNAL" && !allowExternalUsers) {
      return "Recipient user is external while external access is disabled.";
    }
  }

  if (entry.entityType !== "DEADLINE" || !entry.entityId) {
    return "";
  }

  const deadline = await prisma.deadline.findUnique({
    where: {
      id: entry.entityId
    },
    select: {
      id: true,
      status: true,
      isArchived: true,
      ownerUserId: true,
      deputyUserId: true
    }
  });

  if (!deadline || deadline.isArchived) {
    return "Deadline is no longer active.";
  }

  if ((entry.eventType === "DEADLINE_DUE_SOON" || entry.eventType === "DEADLINE_OVERDUE") && deadline.status === "DONE") {
    return "Deadline is already completed.";
  }

  if (
    entry.eventType === "ASSIGNMENT_ASSIGNED" &&
    entry.recipientUserId &&
    deadline.ownerUserId !== entry.recipientUserId &&
    deadline.deputyUserId !== entry.recipientUserId
  ) {
    return "Assignment no longer applies to the recipient.";
  }

  return "";
}

async function dispatchClaimedEntry(
  prisma: PrismaClient,
  config: AppConfig,
  entry: NotificationOutbox,
  claimToken: string,
  options?: {
    linkOverride?: string;
    allowExternalUsers?: boolean;
    maxAttemptsOverride?: number;
    disableRetry?: boolean;
    triggeredByUserId?: string;
  }
) {
  const startedAt = new Date();
  const payload = parseStoredPayload(entry.payloadJson);
  const allowExternalUsers =
    typeof options?.allowExternalUsers === "boolean"
      ? options.allowExternalUsers
      : await getAllowExternalUsers(prisma);

  const cancellationReason = await getDispatchCancellationReason(prisma, entry, allowExternalUsers);
  if (cancellationReason) {
    await markClaimedNotification(prisma, entry.id, claimToken, {
      status: "CANCELLED",
      lastError: cancellationReason,
      claimToken: null
    });
    await createDeliveryAttempt(prisma, {
      entry,
      attemptNumber: entry.attemptCount,
      startedAt,
      finishedAt: new Date(),
      outcome: "CANCELLED",
      errorSummary: cancellationReason,
      triggeredByUserId: options?.triggeredByUserId
    });
    return {
      outcome: "cancelled" as const
    };
  }

  try {
    const provider = await postToPowerAutomate(config, buildPowerAutomatePayload(config, entry, payload, options));
    const sentAt = new Date();

    await markClaimedNotification(prisma, entry.id, claimToken, {
      status: "SENT",
      sentAt,
      lastError: null,
      providerReference: provider.providerReference ?? null,
      claimToken: null
    });
    await createDeliveryAttempt(prisma, {
      entry,
      attemptNumber: entry.attemptCount,
      startedAt,
      finishedAt: sentAt,
      outcome: "SENT",
      httpStatus: provider.httpStatus,
      providerReference: provider.providerReference,
      triggeredByUserId: options?.triggeredByUserId
    });

    return {
      outcome: "sent" as const
    };
  } catch (error) {
    const normalizedError = normalizeErrorMessage(error);
    const httpStatus = error instanceof NotificationDispatchError ? error.httpStatus : undefined;
    const retryable =
      !options?.disableRetry && error instanceof NotificationDispatchError ? error.retryable : false;
    const maxAttempts = options?.maxAttemptsOverride ?? config.notificationMaxAttempts;

    if (!retryable || entry.attemptCount >= maxAttempts) {
      await markClaimedNotification(prisma, entry.id, claimToken, {
        status: "FAILED",
        lastError: normalizedError,
        claimToken: null
      });
      await createDeliveryAttempt(prisma, {
        entry,
        attemptNumber: entry.attemptCount,
        startedAt,
        finishedAt: new Date(),
        outcome: "FAILED",
        httpStatus,
        errorSummary: normalizedError,
        triggeredByUserId: options?.triggeredByUserId
      });
      return {
        outcome: "failed" as const,
        error: normalizedError
      };
    }

    const retryAt = new Date(Date.now() + getRetryDelayMinutes(entry.attemptCount) * 60_000);
    await markClaimedNotification(prisma, entry.id, claimToken, {
      status: "RETRY",
      scheduledFor: retryAt,
      lastError: normalizedError,
      claimToken: null,
      claimedAt: null
    });
    await createDeliveryAttempt(prisma, {
      entry,
      attemptNumber: entry.attemptCount,
      startedAt,
      finishedAt: new Date(),
      outcome: "RETRY",
      httpStatus,
      errorSummary: normalizedError,
      triggeredByUserId: options?.triggeredByUserId
    });

    return {
      outcome: "retry" as const,
      error: normalizedError
    };
  }
}

export async function createAndDispatchPasswordResetNotification(
  prisma: PrismaClient,
  config: AppConfig,
  args: {
    user: RecipientSnapshot;
    ttlMinutes: number;
    now?: Date;
  }
): Promise<PasswordResetDeliveryResult> {
  const allowExternalUsers = await getAllowExternalUsers(prisma);
  if (!canReceiveNotification(args.user, allowExternalUsers)) {
    throw new NotificationDispatchError("User does not have a deliverable email address.", false);
  }

  const now = args.now ?? new Date();
  const rawToken = generateOpaqueToken(32);
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(now.getTime() + args.ttlMinutes * 60_000);
  const claimToken = generateOpaqueToken(18);
  const resetLink = buildResetPasswordLink(config, rawToken);
  const subject = "Passwort fuer das Nemetz Portal zuruecksetzen";
  const storedPayload: StoredNotificationPayload = {
    title: "Passwort zuruecksetzen",
    message: "Du kannst ueber den folgenden Link ein neues Passwort vergeben.",
    severity: "INFO",
    expiresAt: expiresAt.toISOString(),
    entity: {
      type: "USER",
      id: args.user.id,
      label: getDisplayName(args.user) || args.user.email
    }
  };

  const created = await prisma.$transaction(async (tx) => {
    const token = await tx.passwordResetToken.create({
      data: {
        userId: args.user.id,
        tokenHash,
        expiresAt
      }
    });

    const entry = await tx.notificationOutbox.create({
      data: {
        eventType: "PASSWORD_RESET_LINK",
        entityType: "USER",
        entityId: args.user.id,
        recipientEmail: args.user.email,
        recipientName: getDisplayName(args.user),
        subject,
        payloadJson: toJsonInput(storedPayload),
        status: "CLAIMED",
        scheduledFor: now,
        claimedAt: now,
        claimToken,
        attemptCount: 1,
        lastAttemptAt: now,
        idempotencyKey: `password-reset:${token.id}`,
        recipientUser: {
          connect: {
            id: args.user.id
          }
        }
      }
    });

    return {
      entry,
      tokenId: token.id
    };
  });

  const entry = created.entry;
  const startedAt = new Date();

  try {
    const provider = await postToPowerAutomate(
      config,
      buildPowerAutomatePayload(config, entry, storedPayload, {
        linkOverride: resetLink
      })
    );
    const sentAt = new Date();

    await prisma.$transaction(async (tx) => {
      await tx.notificationOutbox.updateMany({
        where: {
          id: entry.id,
          claimToken
        },
        data: {
          status: "SENT",
          sentAt,
          lastError: null,
          providerReference: provider.providerReference ?? null,
          claimToken: null
        }
      });
      await createDeliveryAttempt(tx, {
        entry,
        attemptNumber: entry.attemptCount,
        startedAt,
        finishedAt: sentAt,
        outcome: "SENT",
        httpStatus: provider.httpStatus,
        providerReference: provider.providerReference
      });
      await tx.passwordResetToken.updateMany({
        where: {
          userId: args.user.id,
          usedAt: null,
          id: {
            not: created.tokenId
          }
        },
        data: {
          usedAt: sentAt
        }
      });
      await tx.user.update({
        where: {
          id: args.user.id
        },
        data: {
          lastPasswordResetAt: sentAt
        }
      });
    });

    return {
      notificationId: entry.id,
      expiresAt,
      deliveryStatus: "SENT",
      resetLink: config.nodeEnv === "production" && !config.notificationDryRun ? undefined : resetLink
    };
  } catch (error) {
    const finishedAt = new Date();
    const normalizedError = normalizeErrorMessage(error);
    const httpStatus = error instanceof NotificationDispatchError ? error.httpStatus : undefined;
    const isUnknownDeliveryState = error instanceof NotificationDispatchError ? error.retryable : true;

    await prisma.$transaction(async (tx) => {
      await tx.notificationOutbox.updateMany({
        where: {
          id: entry.id,
          claimToken
        },
        data: {
          status: "FAILED",
          lastError: normalizedError,
          providerReference: null,
          claimToken: null
        }
      });
      await createDeliveryAttempt(tx, {
        entry,
        attemptNumber: entry.attemptCount,
        startedAt,
        finishedAt,
        outcome: "FAILED",
        httpStatus,
        errorSummary: normalizedError
      });

      if (!isUnknownDeliveryState) {
        await tx.passwordResetToken.updateMany({
          where: {
            id: created.tokenId,
            usedAt: null
          },
          data: {
            usedAt: finishedAt
          }
        });
      }
    });

    return {
      notificationId: entry.id,
      expiresAt,
      deliveryStatus: "FAILED",
      deliveryError: normalizedError,
      resetLink: config.nodeEnv === "production" && !config.notificationDryRun ? undefined : resetLink
    };
  }

}

export async function enqueueDeadlineAssignmentNotificationsForChange(
  prisma: DbClient,
  deadlineId: string,
  previous: {
    ownerUserId?: string | null;
    deputyUserId?: string | null;
  }
) {
  const deadline = await loadDeadlineNotificationContext(prisma, deadlineId);
  if (!deadline || deadline.isArchived) {
    return 0;
  }

  const notificationSettings = await getEffectiveNotificationSettings(prisma);
  if (!notificationSettings.assignmentAssignedEnabled) {
    return 0;
  }

  const allowExternalUsers = await getAllowExternalUsers(prisma);
  const recipients = getDeadlineRecipients(deadline, allowExternalUsers);
  let created = 0;

  for (const recipient of recipients) {
    const previousRecipientId = recipient.role === "OWNER" ? previous.ownerUserId ?? null : previous.deputyUserId ?? null;
    const currentRecipientId = recipient.role === "OWNER" ? deadline.ownerUserId : deadline.deputyUserId;

    if (!currentRecipientId || currentRecipientId === previousRecipientId) {
      continue;
    }

    const subject = `Neue Zuweisung: ${deadline.title}`;
    const payload: StoredNotificationPayload = {
      title: "Neue Zuweisung",
      message:
        recipient.role === "OWNER"
          ? `Dir wurde die Frist "${deadline.title}" zugewiesen.`
          : `Du wurdest als Stellvertretung fuer die Frist "${deadline.title}" zugewiesen.`,
      severity: "INFO",
      linkPath: buildDeadlineLinkPath(deadline.id),
      entity: {
        type: "DEADLINE",
        id: deadline.id,
        label: deadline.title
      },
      project: deadline.project
        ? {
            id: deadline.project.id,
            title: deadline.project.title
          }
        : undefined
    };

    const entry = await createOutboxEntryIfMissing(prisma, {
      eventType: "ASSIGNMENT_ASSIGNED",
      entityType: "DEADLINE",
      entityId: deadline.id,
      recipientEmail: recipient.user.email,
      recipientName: getDisplayName(recipient.user),
      subject,
      payloadJson: toJsonInput(payload),
      status: "PENDING",
      scheduledFor: new Date(),
      idempotencyKey: `deadline-assigned:${deadline.id}:${recipient.role}:${recipient.user.id}:${deadline.updatedAt.toISOString()}`,
      recipientUser: {
        connect: {
          id: recipient.user.id
        }
      }
    });

    if (entry) {
      created += 1;
    }
  }

  return created;
}

export async function generateDeadlineNotificationEntries(
  prisma: PrismaClient,
  config: AppConfig,
  options?: {
    now?: Date;
  }
) {
  const now = options?.now ?? new Date();
  const todayIso = getTodayIso(now, config.notificationTimeZone);
  const notificationSettings = await getEffectiveNotificationSettings(prisma);
  const allowExternalUsers = await getAllowExternalUsers(prisma);
  const deadlines = (await prisma.deadline.findMany({
    where: {
      isArchived: false,
      status: {
        not: "DONE"
      }
    },
    include: DEADLINE_NOTIFICATION_INCLUDE
  })) as DeadlineNotificationContext[];

  let created = 0;

  for (const deadline of deadlines) {
    const recipients = getDeadlineRecipients(deadline, allowExternalUsers);
    if (recipients.length === 0) {
      continue;
    }

    const dueSoonDays = deadline.emailReminderEnabled
      ? deadline.emailReminderDaysBefore ?? notificationSettings.defaultDueSoonDays
      : 0;
    const dueSoonTrigger = deadline.emailReminderEnabled ? addDaysToIsoDate(deadline.dueDate, -dueSoonDays) : "";

    for (const recipient of recipients) {
      if (notificationSettings.deadlineDueSoonEnabled && deadline.emailReminderEnabled && dueSoonTrigger === todayIso) {
        const subject = `Frist bald faellig: ${deadline.title}`;
        const dueSoon = await enqueueDeadlineEvent(prisma, {
          eventType: "DEADLINE_DUE_SOON",
          deadline,
          recipient: recipient.user,
          subject,
          payload: {
            title: "Frist bald faellig",
            message: `Die Frist "${deadline.title}" ist am ${formatDateLabel(deadline.dueDate)} faellig.`,
            severity: "WARNING",
            linkPath: buildDeadlineLinkPath(deadline.id),
            entity: {
              type: "DEADLINE",
              id: deadline.id,
              label: deadline.title
            },
            project: deadline.project
              ? {
                  id: deadline.project.id,
                  title: deadline.project.title
                }
              : undefined
          },
          idempotencyKey: `deadline-due-soon:${deadline.id}:${recipient.user.id}:${deadline.dueDate}:${dueSoonDays}`,
          scheduledFor: now
        });

        if (dueSoon) {
          created += 1;
        }
      }

      if (deadline.dueDate < todayIso) {
        const subject = `Frist ueberfaellig: ${deadline.title}`;
        const overdue = await enqueueDeadlineEvent(prisma, {
          eventType: "DEADLINE_OVERDUE",
          deadline,
          recipient: recipient.user,
          subject,
          payload: {
            title: "Frist ueberfaellig",
            message: `Die Frist "${deadline.title}" ist seit ${formatDateLabel(deadline.dueDate)} ueberfaellig.`,
            severity: "CRITICAL",
            linkPath: buildDeadlineLinkPath(deadline.id),
            entity: {
              type: "DEADLINE",
              id: deadline.id,
              label: deadline.title
            },
            project: deadline.project
              ? {
                  id: deadline.project.id,
                  title: deadline.project.title
                }
              : undefined
          },
          idempotencyKey: `deadline-overdue:${deadline.id}:${recipient.user.id}:${deadline.dueDate}`,
          scheduledFor: now
        });

        if (overdue) {
          created += 1;
        }
      }
    }
  }

  return created;
}

export async function failStalePasswordResetNotifications(
  prisma: PrismaClient,
  config: AppConfig,
  options?: {
    now?: Date;
  }
) {
  const now = options?.now ?? new Date();
  const leaseCutoff = new Date(now.getTime() - config.notificationClaimLeaseSeconds * 1_000);
  const result = await prisma.notificationOutbox.updateMany({
    where: {
      eventType: "PASSWORD_RESET_LINK",
      OR: [
        {
          status: {
            in: ["PENDING", "RETRY"] satisfies NotificationStatus[]
          }
        },
        {
          status: "CLAIMED",
          claimedAt: {
            lt: leaseCutoff
          }
        }
      ]
    },
    data: {
      status: "FAILED",
      lastError: PASSWORD_RESET_STALE_ERROR,
      claimToken: null
    }
  });

  return result.count;
}

async function claimPendingEntries(
  prisma: PrismaClient,
  config: AppConfig,
  options?: {
    now?: Date;
    batchSize?: number;
  }
) {
  const now = options?.now ?? new Date();
  const batchSize = options?.batchSize ?? config.notificationDispatchBatchSize;
  const claimToken = generateOpaqueToken(18);
  const staleClaimCutoff = new Date(now.getTime() - config.notificationClaimLeaseSeconds * 1_000);

  const claimedRows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    WITH claimable AS (
      SELECT "id"
      FROM "NotificationOutbox"
      WHERE "eventType" <> 'PASSWORD_RESET_LINK'
        AND (
          ("status" IN ('PENDING', 'RETRY') AND "scheduledFor" <= ${now})
          OR ("status" = 'CLAIMED' AND "claimedAt" < ${staleClaimCutoff})
        )
      ORDER BY "scheduledFor" ASC, "createdAt" ASC
      LIMIT ${batchSize}
      FOR UPDATE SKIP LOCKED
    )
    UPDATE "NotificationOutbox" AS queue
    SET
      "status" = 'CLAIMED',
      "claimedAt" = ${now},
      "claimToken" = ${claimToken},
      "lastAttemptAt" = ${now},
      "attemptCount" = queue."attemptCount" + 1,
      "updatedAt" = ${now}
    FROM claimable
    WHERE queue."id" = claimable."id"
    RETURNING queue."id"
  `);

  if (claimedRows.length === 0) {
    return [];
  }

  return prisma.notificationOutbox.findMany({
    where: {
      claimToken
    },
    orderBy: [
      {
        scheduledFor: "asc"
      },
      {
        createdAt: "asc"
      }
    ]
  });
}

export async function dispatchPendingNotifications(
  prisma: PrismaClient,
  config: AppConfig,
  options?: {
    now?: Date;
    batchSize?: number;
  }
) {
  const counts: NotificationDispatchCounts = {
    claimed: 0,
    sent: 0,
    retried: 0,
    failed: 0,
    cancelled: 0
  };

  if (!config.notificationDispatchEnabled && !config.notificationDryRun) {
    return counts;
  }

  const allowExternalUsers = await getAllowExternalUsers(prisma);

  while (true) {
    const claimed = await claimPendingEntries(prisma, config, options);
    if (claimed.length === 0) {
      return counts;
    }

    counts.claimed += claimed.length;

    for (const entry of claimed) {
      const result = await dispatchClaimedEntry(prisma, config, entry, entry.claimToken ?? "", {
        allowExternalUsers
      });

      if (result.outcome === "sent") {
        counts.sent += 1;
      } else if (result.outcome === "retry") {
        counts.retried += 1;
      } else if (result.outcome === "failed") {
        counts.failed += 1;
      } else if (result.outcome === "cancelled") {
        counts.cancelled += 1;
      }
    }
  }
}

export async function runNotificationDispatchCycle(
  prisma: PrismaClient,
  config: AppConfig,
  options?: {
    now?: Date;
    batchSize?: number;
  }
): Promise<NotificationDispatchCycleResult> {
  const startedAt = options?.now ?? new Date();
  await markWorkerStarted(prisma, startedAt);

  try {
    const generated = await generateDeadlineNotificationEntries(prisma, config, {
      now: options?.now
    });
    const stalePasswordResetsFailed = await failStalePasswordResetNotifications(prisma, config, {
      now: options?.now
    });
    const dispatch = await dispatchPendingNotifications(prisma, config, {
      now: options?.now,
      batchSize: options?.batchSize
    });

    await markWorkerFinished(prisma, {
      finishedAt: new Date(),
      outcome: "SUCCESS",
      claimedCount: dispatch.claimed,
      processedCount: dispatch.sent + dispatch.retried + dispatch.failed + dispatch.cancelled
    });

    return {
      generated,
      stalePasswordResetsFailed,
      dispatch
    };
  } catch (error) {
    await markWorkerFinished(prisma, {
      finishedAt: new Date(),
      outcome: "FAILED",
      error: normalizeErrorMessage(error),
      claimedCount: 0,
      processedCount: 0
    });
    throw error;
  }
}
