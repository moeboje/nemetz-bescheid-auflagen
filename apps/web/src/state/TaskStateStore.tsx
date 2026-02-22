import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useAuditLog } from "./AuditLogStore";
import { loadJSON, saveJSON, STORAGE_KEYS } from "./persistence";

export type TaskInstanceStatus = "OPEN" | "IN_PROGRESS" | "DONE";

export type TaskStateEntry = {
  status: TaskInstanceStatus;
  completedAt?: string;
  updatedAt: string;
};

export type TaskStateMap = Record<string, TaskStateEntry>;

type TaskStateContextValue = {
  taskState: TaskStateMap;
  setTaskStatus: (instanceId: string, status: TaskInstanceStatus) => void;
  markDone: (instanceId: string) => void;
  reopen: (instanceId: string) => void;
  cleanupOld: (horizonDays?: number) => number;
  replaceTaskState: (value: TaskStateMap) => void;
  resetTaskState: () => void;
};

const TaskStateContext = createContext<TaskStateContextValue | undefined>(undefined);

export function buildObligationTaskInstanceId(obligationId: string, dueDateISO: string) {
  return `obligation:${obligationId}:${dueDateISO}`;
}

function nowStamp() {
  return new Date().toISOString();
}

function todayISO() {
  return nowStamp().slice(0, 10);
}

function normalizeStatus(value: unknown): TaskInstanceStatus {
  if (value === "DONE") {
    return "DONE";
  }
  if (value === "IN_PROGRESS") {
    return "IN_PROGRESS";
  }
  return "OPEN";
}

function parseISODate(value: string) {
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseInstanceId(rawKey: string): string | null {
  if (!rawKey || typeof rawKey !== "string") {
    return null;
  }

  if (rawKey.startsWith("obligation:")) {
    const parts = rawKey.split(":");
    if (parts.length !== 3 || !parts[1] || !parts[2]) {
      return null;
    }
    return rawKey;
  }

  // Legacy format from L2/L3 drafts: ob-{obligationId}-{dueDate}
  if (rawKey.startsWith("ob-") && rawKey.length > 14) {
    const dueDateISO = rawKey.slice(-10);
    const between = rawKey.slice(3, -11);
    if (parseISODate(dueDateISO) && between) {
      return buildObligationTaskInstanceId(between, dueDateISO);
    }
  }

  return null;
}

function normalizeTaskStateMap(value: unknown): TaskStateMap {
  if (!value || typeof value !== "object") {
    return {};
  }

  const rows = Object.entries(value as Record<string, unknown>)
    .map(([rawKey, rawEntry]) => {
      const instanceId = parseInstanceId(rawKey);
      if (!instanceId || !rawEntry || typeof rawEntry !== "object") {
        return null;
      }

      const row = rawEntry as Partial<TaskStateEntry> & { status?: unknown };
      const status = normalizeStatus(row.status);
      const updatedAt =
        typeof row.updatedAt === "string" && row.updatedAt.trim()
          ? row.updatedAt
          : nowStamp();
      const completedAt =
        status === "DONE" && typeof row.completedAt === "string" && row.completedAt.trim()
          ? row.completedAt
          : status === "DONE"
          ? updatedAt
          : undefined;

      return [instanceId, { status, completedAt, updatedAt } satisfies TaskStateEntry] as const;
    })
    .filter((item): item is readonly [string, TaskStateEntry] => Boolean(item));

  return Object.fromEntries(rows);
}

export function TaskStateProvider({ children }: { children: React.ReactNode }) {
  const { logEvent } = useAuditLog();
  const [taskState, setTaskState] = useState<TaskStateMap>(() =>
    loadJSON<TaskStateMap>(STORAGE_KEYS.taskState, {
      fallback: {},
      migrate: (value) => normalizeTaskStateMap(value)
    }) ?? {}
  );

  React.useEffect(() => {
    saveJSON(STORAGE_KEYS.taskState, taskState);
  }, [taskState]);

  const setTaskStatus = useCallback(
    (instanceId: string, status: TaskInstanceStatus) => {
      const normalizedId = parseInstanceId(instanceId);
      if (!normalizedId) {
        return;
      }
      let changed = false;
      setTaskState((prev) => {
        const previous = prev[normalizedId];
        if (previous?.status === status) {
          return prev;
        }
        changed = true;
        const updatedAt = nowStamp();
        const next: TaskStateEntry = {
          status,
          updatedAt,
          completedAt: status === "DONE" ? updatedAt : undefined
        };
        return {
          ...prev,
          [normalizedId]: next
        };
      });
      if (changed) {
        logEvent({
          actorLabel: "Demo User",
          entityType: "TASK",
          entityId: normalizedId,
          action: "STATUS_CHANGED",
          summary: `Task status set to ${status}`
        });
      }
    },
    [logEvent]
  );

  const markDone = useCallback(
    (instanceId: string) => {
      setTaskStatus(instanceId, "DONE");
    },
    [setTaskStatus]
  );

  const reopen = useCallback(
    (instanceId: string) => {
      setTaskStatus(instanceId, "OPEN");
    },
    [setTaskStatus]
  );

  const cleanupOld = useCallback(
    (horizonDays = 365) => {
      const now = new Date(`${todayISO()}T00:00:00`);
      const maxPast = new Date(now);
      maxPast.setDate(maxPast.getDate() - 730);
      const maxFuture = new Date(now);
      maxFuture.setDate(maxFuture.getDate() + horizonDays);

      let removedCount = 0;
      setTaskState((prev) => {
        const nextEntries = Object.entries(prev).filter(([instanceId, entry]) => {
          const dueDateISO = instanceId.split(":")[2] ?? "";
          const dueDate = parseISODate(dueDateISO);
          const updatedAt = new Date(entry.updatedAt);
          const isTooOld = !Number.isNaN(updatedAt.getTime()) && updatedAt < maxPast;
          const isOutsideHorizon =
            !dueDate || dueDate < maxPast || dueDate > maxFuture;
          if (isTooOld || isOutsideHorizon) {
            removedCount += 1;
            return false;
          }
          return true;
        });
        return Object.fromEntries(nextEntries);
      });

      if (removedCount > 0) {
        logEvent({
          actorLabel: "Demo User",
          entityType: "TASK",
          entityId: "task-state",
          action: "CLEANUP",
          summary: `TaskState cleanup removed ${removedCount} entries`
        });
      }

      return removedCount;
    },
    [logEvent]
  );

  const replaceTaskState = useCallback((value: TaskStateMap) => {
    setTaskState(normalizeTaskStateMap(value));
  }, []);

  const resetTaskState = useCallback(() => {
    setTaskState({});
  }, []);

  const value = useMemo(
    () => ({
      taskState,
      setTaskStatus,
      markDone,
      reopen,
      cleanupOld,
      replaceTaskState,
      resetTaskState
    }),
    [cleanupOld, markDone, reopen, replaceTaskState, resetTaskState, setTaskStatus, taskState]
  );

  return <TaskStateContext.Provider value={value}>{children}</TaskStateContext.Provider>;
}

export function useTaskState() {
  const context = useContext(TaskStateContext);
  if (!context) {
    throw new Error("useTaskState must be used within TaskStateProvider");
  }
  return context;
}
