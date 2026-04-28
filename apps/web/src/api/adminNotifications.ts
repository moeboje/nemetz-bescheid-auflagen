import { apiRequest } from "./client";

export type NotificationSettings = {
  defaultDueSoonDays: number;
  deadlineDueSoonEnabled: boolean;
  assignmentAssignedEnabled: boolean;
  dailyDigestEnabled: boolean;
  weeklyDigestEnabled: boolean;
  dailyDigestHourLocal: number;
  weeklyDigestWeekday: number;
};

export type AdminNotificationDispatchConfig = {
  dispatchEnabled: boolean;
  dryRun: boolean;
  maxAttempts: number;
  batchSize: number;
  timeoutMs: number;
  claimLeaseSeconds: number;
  timeZone: string;
  notificationBaseUrl: string;
  webhookConfigured: boolean;
  secretConfigured: boolean;
};

export type AdminNotificationWorkerStatus = {
  workerKey: string;
  lastStartedAt?: string;
  lastFinishedAt?: string;
  lastSuccessfulAt?: string;
  lastOutcome?: string;
  lastError?: string;
  lastClaimedCount: number;
  lastProcessedCount: number;
} | null;

export type AdminNotificationOverview = {
  summary: {
    pendingCount: number;
    retryCount: number;
    failedCount: number;
    claimedCount: number;
    sentCount: number;
    cancelledCount: number;
    sentToday: number;
    oldestPendingAt?: string;
    oldestPendingEventType?: string;
    staleClaimedCount: number;
  };
  workerStatus: AdminNotificationWorkerStatus;
  dispatchConfig: AdminNotificationDispatchConfig;
  settings: NotificationSettings;
  warnings: string[];
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

export type AdminNotificationsQuery = {
  q?: string;
  recipient?: string;
  status?: string;
  eventType?: string;
  entityType?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  pageSize?: number;
};

function toQueryString(query: AdminNotificationsQuery = {}) {
  const params = new URLSearchParams();

  if (query.q?.trim()) {
    params.set("q", query.q.trim());
  }
  if (query.recipient?.trim()) {
    params.set("recipient", query.recipient.trim());
  }
  if (query.status?.trim()) {
    params.set("status", query.status.trim());
  }
  if (query.eventType?.trim()) {
    params.set("eventType", query.eventType.trim());
  }
  if (query.entityType?.trim()) {
    params.set("entityType", query.entityType.trim());
  }
  if (query.dateFrom?.trim()) {
    params.set("dateFrom", query.dateFrom.trim());
  }
  if (query.dateTo?.trim()) {
    params.set("dateTo", query.dateTo.trim());
  }
  if (typeof query.page === "number" && Number.isFinite(query.page) && query.page > 0) {
    params.set("page", String(Math.trunc(query.page)));
  }
  if (typeof query.pageSize === "number" && Number.isFinite(query.pageSize) && query.pageSize > 0) {
    params.set("pageSize", String(Math.trunc(query.pageSize)));
  }

  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

export async function getAdminNotificationOverview() {
  return apiRequest<AdminNotificationOverview>("/admin/notifications/overview", {
    method: "GET"
  });
}

export async function listAdminNotifications(query: AdminNotificationsQuery = {}) {
  return apiRequest<{ items: AdminNotificationListItem[]; total: number; page: number; pageSize: number }>(
    `/admin/notifications${toQueryString(query)}`,
    {
      method: "GET"
    }
  );
}

export async function getAdminNotificationDetail(id: string) {
  return apiRequest<AdminNotificationDetail>(`/admin/notifications/${encodeURIComponent(id)}`, {
    method: "GET"
  });
}

export async function retryAdminNotification(id: string) {
  const payload = await apiRequest<{ ok: boolean; notification: AdminNotificationListItem }>(
    `/admin/notifications/${encodeURIComponent(id)}/retry`,
    {
      method: "POST"
    }
  );
  return payload.notification;
}

export async function cancelAdminNotification(id: string) {
  const payload = await apiRequest<{ ok: boolean; notification: AdminNotificationListItem }>(
    `/admin/notifications/${encodeURIComponent(id)}/cancel`,
    {
      method: "POST"
    }
  );
  return payload.notification;
}

export async function getAdminNotificationSettings() {
  const payload = await apiRequest<{ settings: NotificationSettings }>("/admin/notifications/settings", {
    method: "GET"
  });
  return payload.settings;
}

export async function updateAdminNotificationSettings(input: Partial<NotificationSettings>) {
  const payload = await apiRequest<{ ok: boolean; settings: NotificationSettings }>("/admin/notifications/settings", {
    method: "PATCH",
    body: input
  });

  return payload.settings;
}
