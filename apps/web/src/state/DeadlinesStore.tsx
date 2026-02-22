import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import {
  deadlines as initialDeadlines,
  Deadline,
  DeadlineStatus,
  DeadlineStoredStatus
} from "../data/deadlines";
import { useAuditLog } from "./AuditLogStore";
import { loadJSON, saveJSON, STORAGE_KEYS } from "./persistence";

type DeadlineStatusInput = DeadlineStoredStatus;

export type DeadlinesContextValue = {
  deadlines: Deadline[];
  addDeadline: (
    input: Omit<
      Deadline,
      "id" | "status" | "createdAt" | "updatedAt" | "isArchived" | "archivedAt"
    > & { status?: DeadlineStatusInput }
  ) => void;
  updateDeadline: (id: string, input: Partial<Deadline>) => void;
  setDeadlineStatus: (id: string, status: DeadlineStatusInput) => void;
  markDeadlineDone: (id: string) => void;
  reopenDeadline: (id: string) => void;
  archiveDeadline: (id: string) => void;
  restoreDeadline: (id: string) => void;
  getDeadlinesForLegalDoc: (legalDocId: string) => Deadline[];
  getDeadlinesForProject: (projectId: string) => Deadline[];
  getDeadlineStatus: (deadline: Deadline) => DeadlineStatus;
  replaceDeadlines: (value: Deadline[]) => void;
  resetDeadlines: () => void;
};

const DeadlinesContext = createContext<DeadlinesContextValue | undefined>(undefined);

function createId() {
  return `dl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function nowStamp() {
  return new Date().toISOString();
}

function todayStamp() {
  return nowStamp().slice(0, 10);
}

function normalizeStatus(status?: DeadlineStatus): DeadlineStatusInput {
  return status === "DONE" ? "DONE" : "OPEN";
}

function normalizeReminder<T extends Pick<Deadline, "emailReminderEnabled" | "emailReminderDaysBefore">>(
  input: T
): T {
  if (!input.emailReminderEnabled) {
    return {
      ...input,
      emailReminderDaysBefore: undefined
    };
  }
  return {
    ...input,
    emailReminderDaysBefore:
      typeof input.emailReminderDaysBefore === "number"
        ? input.emailReminderDaysBefore
        : 7
  };
}

function normalizeDeadline(value: Partial<Deadline>, index: number): Deadline | null {
  if (
    typeof value.id !== "string" ||
    !value.id.trim() ||
    typeof value.title !== "string" ||
    !value.title.trim() ||
    typeof value.dueDate !== "string" ||
    !value.dueDate.trim()
  ) {
    return null;
  }

  const createdAt =
    typeof value.createdAt === "string" && value.createdAt.trim() ? value.createdAt : nowStamp();
  const updatedAt =
    typeof value.updatedAt === "string" && value.updatedAt.trim()
      ? value.updatedAt
      : createdAt;
  const normalizedReminder = normalizeReminder({
    emailReminderEnabled: Boolean(value.emailReminderEnabled),
    emailReminderDaysBefore: value.emailReminderDaysBefore
  });

  return {
    id: value.id || `dl-seed-${index}`,
    title: value.title,
    description: value.description ?? "",
    dueDate: value.dueDate,
    status: normalizeStatus(value.status),
    projectId: value.projectId ?? undefined,
    legalDocId: value.legalDocId ?? undefined,
    authorityId: value.authorityId ?? undefined,
    ownerUserId: value.ownerUserId ?? undefined,
    deputyUserId: value.deputyUserId ?? undefined,
    emailReminderEnabled: normalizedReminder.emailReminderEnabled,
    emailReminderDaysBefore: normalizedReminder.emailReminderDaysBefore,
    archivedAt: value.archivedAt ?? undefined,
    isArchived: Boolean(value.isArchived || value.archivedAt),
    createdAt,
    updatedAt
  };
}

function normalizeDeadlines(value: unknown): Deadline[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((deadline, index) => normalizeDeadline(deadline as Partial<Deadline>, index))
    .filter((deadline): deadline is Deadline => Boolean(deadline));
}

function resolveDeadlineStatus(deadline: Deadline): DeadlineStatus {
  if (deadline.status === "DONE") {
    return "DONE";
  }
  if (deadline.dueDate < todayStamp()) {
    return "OVERDUE";
  }
  return "OPEN";
}

export function DeadlinesProvider({ children }: { children: React.ReactNode }) {
  const { logEvent } = useAuditLog();
  const [deadlines, setDeadlines] = useState<Deadline[]>(() =>
    loadJSON<Deadline[]>(STORAGE_KEYS.deadlines, {
      fallback: initialDeadlines,
      migrate: (value) => {
        const normalized = normalizeDeadlines(value);
        return normalized.length ? normalized : initialDeadlines;
      }
    }) ?? initialDeadlines
  );

  React.useEffect(() => {
    saveJSON(STORAGE_KEYS.deadlines, deadlines);
  }, [deadlines]);

  const addDeadline = useCallback(
    (
      input: Omit<
        Deadline,
        "id" | "status" | "createdAt" | "updatedAt" | "isArchived" | "archivedAt"
      > & { status?: DeadlineStatusInput }
    ) => {
      const timestamp = nowStamp();
      const normalizedReminder = normalizeReminder(input);
      const newDeadline: Deadline = {
        ...normalizedReminder,
        id: createId(),
        status: input.status ?? "OPEN",
        archivedAt: undefined,
        isArchived: false,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      setDeadlines((prev) => [newDeadline, ...prev]);
      logEvent({
        actorLabel: "Demo User",
        entityType: "DEADLINE",
        entityId: newDeadline.id,
        action: "CREATED",
        summary: newDeadline.title
      });
    },
    [logEvent]
  );

  const updateDeadline = useCallback(
    (id: string, input: Partial<Deadline>) => {
      const current = deadlines.find((deadline) => deadline.id === id);
      if (!current) {
        return;
      }
      const timestamp = nowStamp();
      setDeadlines((prev) =>
        prev.map((deadline) => {
          if (deadline.id !== id) {
            return deadline;
          }
          const merged = normalizeReminder({
            ...deadline,
            ...input
          });

          return {
            ...merged,
            status: normalizeStatus(merged.status),
            id: deadline.id,
            createdAt: deadline.createdAt,
            updatedAt: timestamp
          };
        })
      );
      logEvent({
        actorLabel: "Demo User",
        entityType: "DEADLINE",
        entityId: id,
        action: "UPDATED",
        summary: current.title
      });
    },
    [deadlines, logEvent]
  );

  const setDeadlineStatus = useCallback(
    (id: string, status: DeadlineStatusInput) => {
      const current = deadlines.find((deadline) => deadline.id === id);
      if (!current) {
        return;
      }
      const timestamp = nowStamp();
      setDeadlines((prev) =>
        prev.map((deadline) =>
          deadline.id === id ? { ...deadline, status, updatedAt: timestamp } : deadline
        )
      );
      logEvent({
        actorLabel: "Demo User",
        entityType: "DEADLINE",
        entityId: id,
        action: "STATUS_CHANGED",
        summary: `Deadline status set to ${status}`
      });
    },
    [deadlines, logEvent]
  );

  const markDeadlineDone = useCallback(
    (id: string) => {
      setDeadlineStatus(id, "DONE");
    },
    [setDeadlineStatus]
  );

  const reopenDeadline = useCallback(
    (id: string) => {
      setDeadlineStatus(id, "OPEN");
    },
    [setDeadlineStatus]
  );

  const archiveDeadline = useCallback(
    (id: string) => {
      const current = deadlines.find((deadline) => deadline.id === id);
      if (!current) {
        return;
      }
      const timestamp = nowStamp();
      setDeadlines((prev) =>
        prev.map((deadline) =>
          deadline.id === id
            ? {
                ...deadline,
                archivedAt: timestamp,
                isArchived: true,
                updatedAt: timestamp
              }
            : deadline
        )
      );
      logEvent({
        actorLabel: "Demo User",
        entityType: "DEADLINE",
        entityId: id,
        action: "ARCHIVED",
        summary: current.title
      });
    },
    [deadlines, logEvent]
  );

  const restoreDeadline = useCallback(
    (id: string) => {
      const current = deadlines.find((deadline) => deadline.id === id);
      if (!current) {
        return;
      }
      const timestamp = nowStamp();
      setDeadlines((prev) =>
        prev.map((deadline) =>
          deadline.id === id
            ? {
                ...deadline,
                archivedAt: undefined,
                isArchived: false,
                updatedAt: timestamp
              }
            : deadline
        )
      );
      logEvent({
        actorLabel: "Demo User",
        entityType: "DEADLINE",
        entityId: id,
        action: "RESTORED",
        summary: current.title
      });
    },
    [deadlines, logEvent]
  );

  const getDeadlinesForLegalDoc = useCallback(
    (legalDocId: string) =>
      deadlines.filter((deadline) => deadline.legalDocId === legalDocId),
    [deadlines]
  );

  const getDeadlinesForProject = useCallback(
    (projectId: string) =>
      deadlines.filter((deadline) => deadline.projectId === projectId),
    [deadlines]
  );

  const getDeadlineStatus = useCallback((deadline: Deadline) => resolveDeadlineStatus(deadline), []);

  const replaceDeadlines = useCallback((value: Deadline[]) => {
    const normalized = normalizeDeadlines(value);
    setDeadlines(normalized.length ? normalized : initialDeadlines);
  }, []);

  const resetDeadlines = useCallback(() => {
    setDeadlines(initialDeadlines);
  }, []);

  const value = useMemo(
    () => ({
      deadlines,
      addDeadline,
      updateDeadline,
      setDeadlineStatus,
      markDeadlineDone,
      reopenDeadline,
      archiveDeadline,
      restoreDeadline,
      getDeadlinesForLegalDoc,
      getDeadlinesForProject,
      getDeadlineStatus,
      replaceDeadlines,
      resetDeadlines
    }),
    [
      addDeadline,
      archiveDeadline,
      deadlines,
      getDeadlineStatus,
      getDeadlinesForLegalDoc,
      getDeadlinesForProject,
      markDeadlineDone,
      reopenDeadline,
      replaceDeadlines,
      resetDeadlines,
      restoreDeadline,
      setDeadlineStatus,
      updateDeadline
    ]
  );

  return <DeadlinesContext.Provider value={value}>{children}</DeadlinesContext.Provider>;
}

export function useDeadlines() {
  const context = useContext(DeadlinesContext);
  if (!context) {
    throw new Error("useDeadlines must be used within DeadlinesProvider");
  }
  return context;
}

export type { Deadline, DeadlineStatus };
