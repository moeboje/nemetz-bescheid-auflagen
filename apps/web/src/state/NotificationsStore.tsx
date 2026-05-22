import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import { t } from "../i18n";
import { useAuditLog } from "./AuditLogStore";
import { useDeadlines } from "./DeadlinesStore";
import { useObligations } from "./ObligationsStore";
import { loadJSON, saveJSON, STORAGE_KEYS } from "./persistence";
import { shouldAutoLoadDomainStore } from "./routeLoading";
import { useTasks } from "./TasksStore";
import { useUsers } from "./UsersStore";

export type Notification = {
  id: string;
  type: "REMINDER" | "OVERDUE" | "SYSTEM";
  title: string;
  body?: string;
  entityType?: "TASK" | "OBLIGATION" | "DEADLINE" | "LEGAL_DOC" | "PROJECT";
  entityId?: string;
  taskInstanceId?: string;
  dueDate?: string;
  createdAt: string;
  dismissedAt?: string;
  snoozedUntil?: string;
};

export type NotificationTickResult = {
  created: number;
  skipped: number;
};

type NotificationsContextValue = {
  notifications: Notification[];
  activeNotifications: Notification[];
  activeCount: number;
  lastTickAt: string;
  dismissNotification: (id: string) => void;
  snoozeNotification: (id: string, days?: number) => void;
  runDailyTick: (options?: { force?: boolean }) => NotificationTickResult;
  replaceNotifications: (value: Notification[]) => void;
  resetNotifications: () => void;
};

const NotificationsContext = createContext<NotificationsContextValue | undefined>(undefined);

function nowStamp() {
  return new Date().toISOString();
}

function todayISO() {
  return nowStamp().slice(0, 10);
}

function addDays(isoDate: string, days: number) {
  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function normalizeNotification(value: unknown): Notification | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const row = value as Partial<Notification>;
  if (
    typeof row.id !== "string" ||
    !row.id.trim() ||
    typeof row.type !== "string" ||
    !row.type.trim() ||
    typeof row.title !== "string"
  ) {
    return null;
  }
  if (row.type !== "REMINDER" && row.type !== "OVERDUE" && row.type !== "SYSTEM") {
    return null;
  }
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: typeof row.body === "string" ? row.body : undefined,
    entityType:
      row.entityType === "TASK" ||
      row.entityType === "OBLIGATION" ||
      row.entityType === "DEADLINE" ||
      row.entityType === "LEGAL_DOC" ||
      row.entityType === "PROJECT"
        ? row.entityType
        : undefined,
    entityId: typeof row.entityId === "string" ? row.entityId : undefined,
    taskInstanceId:
      typeof row.taskInstanceId === "string" ? row.taskInstanceId : undefined,
    dueDate: typeof row.dueDate === "string" ? row.dueDate : undefined,
    createdAt:
      typeof row.createdAt === "string" && row.createdAt.trim() ? row.createdAt : nowStamp(),
    dismissedAt: typeof row.dismissedAt === "string" ? row.dismissedAt : undefined,
    snoozedUntil: typeof row.snoozedUntil === "string" ? row.snoozedUntil : undefined
  };
}

function normalizeNotifications(value: unknown): Notification[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => normalizeNotification(item))
    .filter((item): item is Notification => Boolean(item))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function isActiveNotification(notification: Notification, today: string) {
  if (notification.dismissedAt) {
    return false;
  }
  if (notification.snoozedUntil && notification.snoozedUntil > today) {
    return false;
  }
  return true;
}

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const { tasks } = useTasks();
  const { obligations } = useObligations();
  const { deadlines } = useDeadlines();
  const { currentUser, getUserLabel } = useUsers();
  const { logEvent } = useAuditLog();
  const canRunDailyTick = shouldAutoLoadDomainStore(location.pathname, "taskState");

  const [notifications, setNotifications] = useState<Notification[]>(() =>
    loadJSON<Notification[]>(STORAGE_KEYS.notifications, {
      fallback: [],
      migrate: (value) => normalizeNotifications(value)
    }) ?? []
  );
  const [lastTickAt, setLastTickAt] = useState<string>(() =>
    loadJSON<string>(STORAGE_KEYS.notificationsLastTickAt, {
      fallback: "",
      migrate: (value) => (typeof value === "string" ? value : "")
    }) ?? ""
  );

  React.useEffect(() => {
    saveJSON(STORAGE_KEYS.notifications, notifications);
  }, [notifications]);

  React.useEffect(() => {
    saveJSON(STORAGE_KEYS.notificationsLastTickAt, lastTickAt);
  }, [lastTickAt]);

  const buildTickNotifications = useCallback(
    (targetDate: string) => {
      const generated: Notification[] = [];
      const obligationById = new Map(obligations.map((obligation) => [obligation.id, obligation]));
      const deadlineById = new Map(deadlines.map((deadline) => [deadline.id, deadline]));
      const createdAt = nowStamp();

      tasks.forEach((task) => {
        if (task.type === "OBLIGATION" && task.obligationId) {
          const obligation = obligationById.get(task.obligationId);
          if (obligation?.emailReminderEnabled) {
            const daysBefore = obligation.emailReminderDaysBefore ?? 7;
            const triggerDateISO = addDays(task.dueDate, -daysBefore);
            if (triggerDateISO && triggerDateISO === targetDate && task.status !== "DONE") {
              generated.push({
                id: `reminder:${task.id}:${triggerDateISO}`,
                type: "REMINDER",
                title: t("notifications.generated.reminderTitle"),
                body: `${task.title} · ${task.dueDate}`,
                entityType: "TASK",
                entityId: task.id,
                taskInstanceId: task.id,
                dueDate: task.dueDate,
                createdAt
              });
            }
          }
          if (task.dueDate < targetDate && task.status !== "DONE") {
            generated.push({
              id: `overdue:${task.id}`,
              type: "OVERDUE",
              title: t("notifications.generated.overdueTitle"),
              body: `${task.title} · ${task.dueDate}`,
              entityType: "TASK",
              entityId: task.id,
              taskInstanceId: task.id,
              dueDate: task.dueDate,
              createdAt
            });
          }
        }

        if (task.type === "DEADLINE" && task.deadlineId) {
          const deadline = deadlineById.get(task.deadlineId);
          if (deadline?.emailReminderEnabled) {
            const daysBefore = deadline.emailReminderDaysBefore ?? 7;
            const triggerDateISO = addDays(task.dueDate, -daysBefore);
            if (triggerDateISO && triggerDateISO === targetDate && task.status !== "DONE") {
              generated.push({
                id: `reminder:deadline:${task.deadlineId}:${triggerDateISO}`,
                type: "REMINDER",
                title: t("notifications.generated.reminderTitle"),
                body: `${task.title} · ${task.dueDate}`,
                entityType: "DEADLINE",
                entityId: task.deadlineId,
                taskInstanceId: task.id,
                dueDate: task.dueDate,
                createdAt
              });
            }
          }
          if (task.dueDate < targetDate && task.status !== "DONE") {
            generated.push({
              id: `overdue:deadline:${task.deadlineId}`,
              type: "OVERDUE",
              title: t("notifications.generated.overdueTitle"),
              body: `${task.title} · ${task.dueDate}`,
              entityType: "DEADLINE",
              entityId: task.deadlineId,
              taskInstanceId: task.id,
              dueDate: task.dueDate,
              createdAt
            });
          }
        }
      });

      return generated;
    },
    [deadlines, obligations, tasks]
  );

  const runDailyTick = useCallback(
    (options?: { force?: boolean }) => {
      const targetDate = todayISO();
      if (!options?.force && lastTickAt === targetDate) {
        return { created: 0, skipped: 0 };
      }

      const generated = buildTickNotifications(targetDate);
      let created = 0;
      let skipped = 0;

      setNotifications((prev) => {
        const byId = new Map(prev.map((item) => [item.id, item] as const));
        generated.forEach((item) => {
          if (byId.has(item.id)) {
            skipped += 1;
          } else {
            byId.set(item.id, item);
            created += 1;
          }
        });
        return Array.from(byId.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      });

      setLastTickAt(targetDate);

      return { created, skipped };
    },
    [buildTickNotifications, lastTickAt]
  );

  React.useEffect(() => {
    if (!canRunDailyTick) {
      return;
    }
    if (!lastTickAt || lastTickAt !== todayISO()) {
      runDailyTick();
    }
  }, [canRunDailyTick, lastTickAt, runDailyTick]);

  const dismissNotification = useCallback(
    (id: string) => {
      const timestamp = nowStamp();
      setNotifications((prev) =>
        prev.map((notification) =>
          notification.id === id ? { ...notification, dismissedAt: timestamp } : notification
        )
      );
      logEvent({
        actorLabel: getUserLabel(currentUser?.id) || "Demo User",
        entityType: "SYSTEM",
        entityId: id,
        action: "NOTIFICATION_DISMISSED",
        summary: "Notification dismissed"
      });
    },
    [currentUser?.id, getUserLabel, logEvent]
  );

  const snoozeNotification = useCallback(
    (id: string, days = 7) => {
      const snoozedUntil = addDays(todayISO(), days);
      setNotifications((prev) =>
        prev.map((notification) =>
          notification.id === id
            ? { ...notification, dismissedAt: undefined, snoozedUntil }
            : notification
        )
      );
      logEvent({
        actorLabel: getUserLabel(currentUser?.id) || "Demo User",
        entityType: "SYSTEM",
        entityId: id,
        action: "NOTIFICATION_SNOOZED",
        summary: `Notification snoozed ${days} days`
      });
    },
    [currentUser?.id, getUserLabel, logEvent]
  );

  const replaceNotifications = useCallback((value: Notification[]) => {
    setNotifications(normalizeNotifications(value));
  }, []);

  const resetNotifications = useCallback(() => {
    setNotifications([]);
    setLastTickAt("");
  }, []);

  const activeNotifications = useMemo(() => {
    const today = todayISO();
    return notifications.filter((notification) => isActiveNotification(notification, today));
  }, [notifications]);

  const value = useMemo(
    () => ({
      notifications,
      activeNotifications,
      activeCount: activeNotifications.length,
      lastTickAt,
      dismissNotification,
      snoozeNotification,
      runDailyTick,
      replaceNotifications,
      resetNotifications
    }),
    [
      activeNotifications,
      dismissNotification,
      lastTickAt,
      notifications,
      replaceNotifications,
      resetNotifications,
      runDailyTick,
      snoozeNotification
    ]
  );

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotifications() {
  const context = useContext(NotificationsContext);
  if (!context) {
    throw new Error("useNotifications must be used within NotificationsProvider");
  }
  return context;
}
