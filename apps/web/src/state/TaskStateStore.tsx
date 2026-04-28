import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "./AuthStore";
import { useAuditLog } from "./AuditLogStore";
import { useUsers } from "./UsersStore";
import { clearPersistedValue, loadJSON, STORAGE_KEYS } from "./persistence";
import {
  addTaskStateEvidence as apiAddTaskStateEvidence,
  bulkDeleteTaskState,
  bulkReplaceTaskState,
  cleanupOldTaskState,
  completeTaskState,
  listTaskState,
  markTaskStateAttachmentUnavailable,
  reconcileLegacyTaskState,
  reopenTaskState as apiReopenTaskState,
  setTaskStateStatus as apiSetTaskStateStatus
} from "../api/taskState";
import {
  countAttachmentsByKind,
  createStableId,
  inferAttachmentKind,
  type AttachmentMeta
} from "../types/attachments";
import type { Evidence } from "../types/evidence";
import type {
  EvidenceInput,
  TaskInstanceStatus,
  TaskStateEntry,
  TaskStateMap
} from "../types/taskState";

export type { EvidenceInput, TaskInstanceStatus, TaskStateEntry, TaskStateMap } from "../types/taskState";

type TaskStateContextValue = {
  taskState: TaskStateMap;
  setTaskStatus: (instanceId: string, status: TaskInstanceStatus) => Promise<void>;
  markDone: (instanceId: string) => Promise<void>;
  markDoneWithEvidence: (instanceId: string, input: EvidenceInput) => Promise<void>;
  addEvidence: (instanceId: string, input: EvidenceInput) => Promise<void>;
  markAttachmentUnavailable: (instanceId: string, attachmentId: string) => Promise<boolean>;
  reopen: (instanceId: string) => Promise<void>;
  cleanupOld: (horizonDays?: number) => Promise<number>;
  replaceTaskState: (value: TaskStateMap) => Promise<void>;
  resetTaskState: () => Promise<void>;
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

function hasTaskStateEntries(value: TaskStateMap) {
  return Object.keys(value).length > 0;
}

function readLegacyTaskState() {
  return normalizeTaskStateMap(loadJSON<TaskStateMap>(STORAGE_KEYS.taskState, { fallback: {} }) ?? {});
}

function buildTaskCompletedAuditSummary(input: EvidenceInput) {
  const counts = countAttachmentsByKind(input.attachments ?? []);
  return `Counts PHOTO:${counts.PHOTO}, DOCUMENT:${counts.DOCUMENT}, REPORT:${counts.REPORT}${
    input.outcome ? ` · OUTCOME:${input.outcome}` : ""
  }`;
}

function clearLegacyTaskState() {
  clearPersistedValue(STORAGE_KEYS.taskState);
}

function canAccessTaskState(authUser: ReturnType<typeof useAuth>["user"]) {
  return (
    Boolean(authUser) &&
    authUser?.type !== "EXTERNAL" &&
    Array.isArray(authUser?.effectivePermissions) &&
    authUser.effectivePermissions.includes("tasks.view")
  );
}

export function TaskStateProvider({ children }: { children: React.ReactNode }) {
  const { user: authUser } = useAuth();
  const { logEvent } = useAuditLog();
  const { currentUser, getUserLabel } = useUsers();
  const [taskState, setTaskState] = useState<TaskStateMap>({});
  const legacyCleanupReadyRef = useRef(false);

  const clearLegacyTaskStateIfReady = useCallback(() => {
    if (legacyCleanupReadyRef.current) {
      clearLegacyTaskState();
    }
  }, []);

  const reloadTaskState = useCallback(async () => {
    const legacyTaskState = readLegacyTaskState();

    if (!canAccessTaskState(authUser)) {
      setTaskState({});
      legacyCleanupReadyRef.current = false;
      return {};
    }

    let serverTaskState: TaskStateMap;

    try {
      serverTaskState = normalizeTaskStateMap(await listTaskState());
    } catch {
      setTaskState({});
      legacyCleanupReadyRef.current = false;
      return {};
    }

    if (!hasTaskStateEntries(legacyTaskState)) {
      setTaskState(serverTaskState);
      legacyCleanupReadyRef.current = true;
      clearLegacyTaskState();
      return serverTaskState;
    }

    try {
      const mergedTaskState = normalizeTaskStateMap(
        await reconcileLegacyTaskState(legacyTaskState)
      );
      setTaskState(mergedTaskState);
      legacyCleanupReadyRef.current = true;
      clearLegacyTaskState();
      return mergedTaskState;
    } catch {
      setTaskState(serverTaskState);
      legacyCleanupReadyRef.current = false;
      return serverTaskState;
    }
  }, [authUser]);

  useEffect(() => {
    if (!canAccessTaskState(authUser)) {
      setTaskState({});
      legacyCleanupReadyRef.current = false;
      return;
    }

    void reloadTaskState();
  }, [authUser, reloadTaskState]);

  const setTaskStatus = useCallback(
    async (instanceId: string, status: TaskInstanceStatus) => {
      const normalizedId = parseInstanceId(instanceId);
      if (!normalizedId) {
        return;
      }
      if (taskState[normalizedId]?.status === status) {
        return;
      }

      const nextEntry = normalizeTaskStateMap({
        [normalizedId]: await apiSetTaskStateStatus(normalizedId, status)
      })[normalizedId];
      if (!nextEntry) {
        return;
      }

      setTaskState((prev) => ({
        ...prev,
        [normalizedId]: nextEntry
      }));
      clearLegacyTaskStateIfReady();

      logEvent({
        actorLabel: getUserLabel(currentUser?.id) || "Demo User",
        entityType: "TASK",
        entityId: normalizedId,
        action: "STATUS_CHANGED",
        summary: `Task status set to ${status}`
      });
    },
    [clearLegacyTaskStateIfReady, currentUser?.id, getUserLabel, logEvent, taskState]
  );

  const markDone = useCallback(
    async (instanceId: string) => {
      await setTaskStatus(instanceId, "DONE");
    },
    [setTaskStatus]
  );

  const addEvidence = useCallback(
    async (instanceId: string, input: EvidenceInput) => {
      const normalizedId = parseInstanceId(instanceId);
      if (!normalizedId) {
        return;
      }

      const nextEntry = normalizeTaskStateMap({
        [normalizedId]: await apiAddTaskStateEvidence(normalizedId, input)
      })[normalizedId];
      if (!nextEntry) {
        return;
      }

      setTaskState((prev) => ({
        ...prev,
        [normalizedId]: nextEntry
      }));
      clearLegacyTaskStateIfReady();

      logEvent({
        actorLabel: getUserLabel(currentUser?.id) || "Demo User",
        entityType: "TASK",
        entityId: normalizedId,
        action: "TASK_COMPLETED",
        summary: buildTaskCompletedAuditSummary(input)
      });
    },
    [clearLegacyTaskStateIfReady, currentUser?.id, getUserLabel, logEvent]
  );

  const markDoneWithEvidence = useCallback(
    async (instanceId: string, input: EvidenceInput) => {
      const normalizedId = parseInstanceId(instanceId);
      if (!normalizedId) {
        return;
      }

      const nextEntry = normalizeTaskStateMap({
        [normalizedId]: await completeTaskState(normalizedId, input)
      })[normalizedId];
      if (!nextEntry) {
        return;
      }

      setTaskState((prev) => ({
        ...prev,
        [normalizedId]: nextEntry
      }));
      clearLegacyTaskStateIfReady();

      logEvent({
        actorLabel: getUserLabel(currentUser?.id) || "Demo User",
        entityType: "TASK",
        entityId: normalizedId,
        action: "TASK_COMPLETED",
        summary: buildTaskCompletedAuditSummary(input)
      });
    },
    [clearLegacyTaskStateIfReady, currentUser?.id, getUserLabel, logEvent]
  );

  const markAttachmentUnavailable = useCallback(
    async (instanceId: string, attachmentId: string) => {
      const normalizedId = parseInstanceId(instanceId);
      if (!normalizedId || !attachmentId) {
        return false;
      }

      const result = await markTaskStateAttachmentUnavailable(normalizedId, attachmentId);
      if (!result.changed || !result.taskStateEntry) {
        return Boolean(result.changed);
      }

      const nextEntry = normalizeTaskStateMap({
        [normalizedId]: result.taskStateEntry
      })[normalizedId];
      if (!nextEntry) {
        return false;
      }

      setTaskState((prev) => ({
        ...prev,
        [normalizedId]: nextEntry
      }));
      clearLegacyTaskStateIfReady();

      logEvent({
        actorLabel: getUserLabel(currentUser?.id) || "Demo User",
        entityType: "TASK",
        entityId: normalizedId,
        action: "CLEANUP",
        summary: `Attachment marked unavailable (${attachmentId})`
      });

      return true;
    },
    [clearLegacyTaskStateIfReady, currentUser?.id, getUserLabel, logEvent]
  );

  const reopen = useCallback(
    async (instanceId: string) => {
      const normalizedId = parseInstanceId(instanceId);
      if (!normalizedId) {
        return;
      }

      const nextEntry = normalizeTaskStateMap({
        [normalizedId]: await apiReopenTaskState(normalizedId)
      })[normalizedId];
      if (!nextEntry) {
        return;
      }

      setTaskState((prev) => ({
        ...prev,
        [normalizedId]: nextEntry
      }));
      clearLegacyTaskStateIfReady();
    },
    [clearLegacyTaskStateIfReady]
  );

  const cleanupOld = useCallback(
    async (horizonDays = 365) => {
      const result = await cleanupOldTaskState(horizonDays);
      const next = normalizeTaskStateMap(result.taskState);
      setTaskState(next);
      clearLegacyTaskStateIfReady();

      if (result.removedCount > 0) {
        logEvent({
          actorLabel: getUserLabel(currentUser?.id) || "Demo User",
          entityType: "TASK",
          entityId: "task-state",
          action: "CLEANUP",
          summary: `TaskState cleanup removed ${result.removedCount} entries`
        });
      }

      return result.removedCount;
    },
    [clearLegacyTaskStateIfReady, currentUser?.id, getUserLabel, logEvent]
  );

  const replaceTaskState = useCallback(async (value: TaskStateMap) => {
    const next = normalizeTaskStateMap(await bulkReplaceTaskState(value));
    setTaskState(next);
    legacyCleanupReadyRef.current = true;
    clearLegacyTaskState();
  }, []);

  const resetTaskState = useCallback(async () => {
    await bulkDeleteTaskState();
    setTaskState({});
    legacyCleanupReadyRef.current = true;
    clearLegacyTaskState();
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
