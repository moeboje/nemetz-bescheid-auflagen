import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useAuditLog } from "./AuditLogStore";
import { useUsers } from "./UsersStore";
import { loadJSON, saveJSON, STORAGE_KEYS } from "./persistence";
import {
  countAttachmentsByKind,
  createStableId,
  inferAttachmentKind,
  type AttachmentMeta
} from "../types/attachments";
import type { Evidence, EvidenceOutcome } from "../types/evidence";

export type TaskInstanceStatus = "OPEN" | "IN_PROGRESS" | "DONE";

export type TaskStateEntry = {
  status: TaskInstanceStatus;
  completedAt?: string;
  completedByUserId?: string;
  completedByLabel?: string;
  evidence?: Evidence[];
  updatedAt: string;
};

export type TaskStateMap = Record<string, TaskStateEntry>;

export type EvidenceInput = {
  note?: string;
  outcome?: EvidenceOutcome;
  attachments: AttachmentMeta[];
};

type TaskStateContextValue = {
  taskState: TaskStateMap;
  setTaskStatus: (instanceId: string, status: TaskInstanceStatus) => void;
  markDone: (instanceId: string) => void;
  markDoneWithEvidence: (instanceId: string, input: EvidenceInput) => void;
  addEvidence: (instanceId: string, input: EvidenceInput) => void;
  markAttachmentUnavailable: (instanceId: string, attachmentId: string) => void;
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

function createAttachmentMeta(input: Partial<AttachmentMeta>): AttachmentMeta | null {
  if (!input || typeof input.filename !== "string" || !input.filename.trim()) {
    return null;
  }
  return {
    id:
      typeof input.id === "string" && input.id.trim()
        ? input.id
        : createStableId("att"),
    kind:
      input.kind === "PHOTO" || input.kind === "DOCUMENT" || input.kind === "REPORT"
        ? input.kind
        : inferAttachmentKind({ mime: input.mime, filename: input.filename }),
    filename: input.filename,
    sizeKb:
      typeof input.sizeKb === "number" && Number.isFinite(input.sizeKb)
        ? Number(input.sizeKb)
        : undefined,
    mime: typeof input.mime === "string" ? input.mime : undefined,
    addedAt:
      typeof input.addedAt === "string" && input.addedAt.trim()
        ? input.addedAt
        : nowStamp().slice(0, 10),
    storage: input.storage === "indexeddb" ? "indexeddb" : "none"
  };
}

function createEvidence(input: Partial<Evidence>): Evidence | null {
  if (!input || typeof input !== "object") {
    return null;
  }
  const attachments = Array.isArray(input.attachments)
    ? input.attachments
        .map((attachment) => createAttachmentMeta(attachment))
        .filter((attachment): attachment is AttachmentMeta => Boolean(attachment))
    : [];

  return {
    id:
      typeof input.id === "string" && input.id.trim()
        ? input.id
        : createStableId("ev"),
    note: typeof input.note === "string" ? input.note : undefined,
    outcome:
      input.outcome === "OK" || input.outcome === "NOK" || input.outcome === "FOLLOW_UP"
        ? input.outcome
        : undefined,
    attachments,
    createdAt:
      typeof input.createdAt === "string" && input.createdAt.trim()
        ? input.createdAt
        : nowStamp(),
    createdByUserId:
      typeof input.createdByUserId === "string" ? input.createdByUserId : undefined,
    createdByLabel:
      typeof input.createdByLabel === "string" ? input.createdByLabel : undefined
  };
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
      const evidence = Array.isArray(row.evidence)
        ? row.evidence
            .map((item) => createEvidence(item as Partial<Evidence>))
            .filter((item): item is Evidence => Boolean(item))
        : undefined;

      return [
        instanceId,
        {
          status,
          completedAt,
          completedByUserId:
            typeof row.completedByUserId === "string" ? row.completedByUserId : undefined,
          completedByLabel:
            typeof row.completedByLabel === "string" ? row.completedByLabel : undefined,
          evidence,
          updatedAt
        } satisfies TaskStateEntry
      ] as const;
    })
    .filter((item): item is readonly [string, TaskStateEntry] => Boolean(item));

  return Object.fromEntries(rows);
}

function buildTaskCompletedAuditSummary(input: EvidenceInput) {
  const counts = countAttachmentsByKind(input.attachments ?? []);
  return `Counts PHOTO:${counts.PHOTO}, DOCUMENT:${counts.DOCUMENT}, REPORT:${counts.REPORT}${
    input.outcome ? ` · OUTCOME:${input.outcome}` : ""
  }`;
}

export function TaskStateProvider({ children }: { children: React.ReactNode }) {
  const { logEvent } = useAuditLog();
  const { currentUser, getUserLabel } = useUsers();
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
        const isDone = status === "DONE";
        const next: TaskStateEntry = {
          status,
          updatedAt,
          completedAt: isDone ? updatedAt : undefined,
          completedByUserId: isDone ? currentUser?.id : undefined,
          completedByLabel: isDone ? getUserLabel(currentUser?.id) : undefined,
          evidence: previous?.evidence
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
    [currentUser?.id, getUserLabel, logEvent]
  );

  const markDone = useCallback(
    (instanceId: string) => {
      setTaskStatus(instanceId, "DONE");
    },
    [setTaskStatus]
  );

  const addEvidence = useCallback(
    (instanceId: string, input: EvidenceInput) => {
      const normalizedId = parseInstanceId(instanceId);
      if (!normalizedId) {
        return;
      }
      const now = nowStamp();
      const entry = createEvidence({
        note: input.note,
        outcome: input.outcome,
        attachments: input.attachments,
        createdAt: now,
        createdByUserId: currentUser?.id,
        createdByLabel: getUserLabel(currentUser?.id)
      });
      if (!entry) {
        return;
      }

      setTaskState((prev) => {
        const previous = prev[normalizedId];
        const existingEvidence = previous?.evidence ?? [];
        return {
          ...prev,
          [normalizedId]: {
            status: "DONE",
            completedAt: previous?.completedAt ?? now,
            completedByUserId: previous?.completedByUserId ?? currentUser?.id,
            completedByLabel:
              previous?.completedByLabel ?? getUserLabel(previous?.completedByUserId ?? currentUser?.id),
            evidence: [entry, ...existingEvidence],
            updatedAt: now
          }
        };
      });

      logEvent({
        actorLabel: getUserLabel(currentUser?.id) || "Demo User",
        entityType: "TASK",
        entityId: normalizedId,
        action: "TASK_COMPLETED",
        summary: buildTaskCompletedAuditSummary(input)
      });
    },
    [currentUser?.id, getUserLabel, logEvent]
  );

  const markDoneWithEvidence = useCallback(
    (instanceId: string, input: EvidenceInput) => {
      addEvidence(instanceId, input);
    },
    [addEvidence]
  );

  const markAttachmentUnavailable = useCallback(
    (instanceId: string, attachmentId: string) => {
      const normalizedId = parseInstanceId(instanceId);
      if (!normalizedId || !attachmentId) {
        return;
      }

      let changed = false;
      const now = nowStamp();
      setTaskState((prev) => {
        const current = prev[normalizedId];
        if (!current?.evidence?.length) {
          return prev;
        }

        const nextEvidence = current.evidence.map((entry) => ({
          ...entry,
          attachments: entry.attachments.map((attachment) => {
            if (attachment.id !== attachmentId || attachment.storage === "none") {
              return attachment;
            }
            changed = true;
            return {
              ...attachment,
              storage: "none"
            };
          })
        }));

        if (!changed) {
          return prev;
        }

        return {
          ...prev,
          [normalizedId]: {
            ...current,
            evidence: nextEvidence,
            updatedAt: now
          }
        };
      });

      if (changed) {
        logEvent({
          actorLabel: "Demo User",
          entityType: "TASK",
          entityId: normalizedId,
          action: "CLEANUP",
          summary: `Attachment marked unavailable (${attachmentId})`
        });
      }
    },
    [logEvent]
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
      markDoneWithEvidence,
      addEvidence,
      markAttachmentUnavailable,
      reopen,
      cleanupOld,
      replaceTaskState,
      resetTaskState
    }),
    [
      addEvidence,
      cleanupOld,
      markDone,
      markDoneWithEvidence,
      markAttachmentUnavailable,
      reopen,
      replaceTaskState,
      resetTaskState,
      setTaskStatus,
      taskState
    ]
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
