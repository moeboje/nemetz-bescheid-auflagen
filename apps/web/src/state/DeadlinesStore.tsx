import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  deadlines as initialDeadlines,
  type Deadline,
  type DeadlineStatus,
  type DeadlineStoredStatus
} from "../data/deadlines";
import { useAuth } from "./AuthStore";
import { useAuditLog } from "./AuditLogStore";
import { useUsers } from "./UsersStore";
import { clearPersistedValue, makeStorageKey } from "./persistence";
import {
  archiveDeadline as apiArchiveDeadline,
  bulkDeleteDeadlines,
  bulkReplaceDeadlines,
  completeDeadline as apiCompleteDeadline,
  createDeadline as apiCreateDeadline,
  listDeadlineProjectOptions,
  listDeadlines,
  markDeadlineAttachmentUnavailable as apiMarkDeadlineAttachmentUnavailable,
  reopenDeadline as apiReopenDeadline,
  restoreDeadline as apiRestoreDeadline,
  setDeadlineStatus as apiSetDeadlineStatus,
  updateDeadline as apiUpdateDeadline
} from "../api/deadlines";
import {
  countAttachmentsByKind,
  createStableId,
  inferAttachmentKind,
  type AttachmentMeta
} from "../types/attachments";
import type { Evidence, EvidenceOutcome } from "../types/evidence";
import type { DomainProjectOption } from "../data/projects";
import { shouldAutoLoadDomainStore } from "./routeLoading";

type DeadlineStatusInput = DeadlineStoredStatus;

type DeadlineEvidenceInput = {
  note?: string;
  outcome?: EvidenceOutcome;
  attachments: AttachmentMeta[];
  completedAt?: string;
};

type DeadlineCreateInput = Omit<
  Deadline,
  | "id"
  | "status"
  | "createdAt"
  | "updatedAt"
  | "isArchived"
  | "archivedAt"
  | "completedAt"
  | "completedByUserId"
  | "evidence"
  | "resolvedProjectId"
  | "projectTitle"
  | "currentUserCanWriteProject"
> & {
  id?: string;
  status?: DeadlineStatusInput;
};

export type DeadlinesContextValue = {
  deadlines: Deadline[];
  writableProjectOptions: DomainProjectOption[];
  addDeadline: (
    input: DeadlineCreateInput
  ) => Promise<Deadline | null>;
  updateDeadline: (id: string, input: Partial<Deadline>) => Promise<Deadline | null>;
  setDeadlineStatus: (id: string, status: DeadlineStatusInput) => Promise<Deadline | null>;
  markDeadlineDone: (id: string) => Promise<Deadline | null>;
  markDeadlineDoneWithEvidence: (id: string, input: DeadlineEvidenceInput) => Promise<Deadline | null>;
  markDeadlineAttachmentUnavailable: (id: string, attachmentId: string) => Promise<boolean>;
  reopenDeadline: (id: string) => Promise<Deadline | null>;
  archiveDeadline: (id: string) => Promise<Deadline | null>;
  restoreDeadline: (id: string) => Promise<Deadline | null>;
  getDeadlinesForLegalDoc: (legalDocId: string) => Deadline[];
  getDeadlinesForProject: (projectId: string) => Deadline[];
  getDeadlineStatus: (deadline: Deadline) => DeadlineStatus;
  replaceDeadlines: (value: Deadline[]) => Promise<void>;
  resetDeadlines: () => Promise<void>;
  reloadDeadlines: () => Promise<Deadline[]>;
};

const DeadlinesContext = createContext<DeadlinesContextValue | undefined>(undefined);

export const DEADLINES_STORAGE_KEY = makeStorageKey("deadlines");

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

function normalizeAttachmentMeta(value: unknown): AttachmentMeta | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const row = value as Partial<AttachmentMeta>;
  if (typeof row.filename !== "string" || !row.filename.trim()) {
    return null;
  }
  return {
    id:
      typeof row.id === "string" && row.id.trim()
        ? row.id
        : createStableId("att"),
    kind:
      row.kind === "PHOTO" || row.kind === "DOCUMENT" || row.kind === "REPORT"
        ? row.kind
        : inferAttachmentKind({ mime: row.mime, filename: row.filename }),
    filename: row.filename,
    sizeKb:
      typeof row.sizeKb === "number" && Number.isFinite(row.sizeKb)
        ? Number(row.sizeKb)
        : undefined,
    mime: typeof row.mime === "string" ? row.mime : undefined,
    addedAt:
      typeof row.addedAt === "string" && row.addedAt.trim()
        ? row.addedAt
        : nowStamp().slice(0, 10),
    storage: row.storage === "indexeddb" ? "indexeddb" : "none"
  };
}

function normalizeEvidence(value: unknown): Evidence | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const row = value as Partial<Evidence>;
  return {
    id:
      typeof row.id === "string" && row.id.trim()
        ? row.id
        : createStableId("ev"),
    note: typeof row.note === "string" ? row.note : undefined,
    outcome:
      row.outcome === "OK" || row.outcome === "NOK" || row.outcome === "FOLLOW_UP"
        ? row.outcome
        : undefined,
    attachments: Array.isArray(row.attachments)
      ? row.attachments
          .map((attachment) => normalizeAttachmentMeta(attachment))
          .filter((attachment): attachment is AttachmentMeta => Boolean(attachment))
      : [],
    createdAt:
      typeof row.createdAt === "string" && row.createdAt.trim() ? row.createdAt : nowStamp(),
    createdByUserId:
      typeof row.createdByUserId === "string" ? row.createdByUserId : undefined,
    createdByLabel: typeof row.createdByLabel === "string" ? row.createdByLabel : undefined
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
    resolvedProjectId: value.resolvedProjectId ?? value.projectId ?? undefined,
    projectTitle: value.projectTitle ?? undefined,
    currentUserCanWriteProject: Boolean(value.currentUserCanWriteProject),
    legalDocId: value.legalDocId ?? undefined,
    authorityId: value.authorityId ?? undefined,
    ownerUserId: value.ownerUserId ?? undefined,
    deputyUserId: value.deputyUserId ?? undefined,
    emailReminderEnabled: normalizedReminder.emailReminderEnabled,
    emailReminderDaysBefore: normalizedReminder.emailReminderDaysBefore,
    completedAt: typeof value.completedAt === "string" ? value.completedAt : undefined,
    completedByUserId:
      typeof value.completedByUserId === "string" ? value.completedByUserId : undefined,
    evidence: Array.isArray(value.evidence)
      ? value.evidence
          .map((item) => normalizeEvidence(item))
          .filter((item): item is Evidence => Boolean(item))
      : [],
    archivedAt: value.archivedAt ?? undefined,
    isArchived: Boolean(value.isArchived || value.archivedAt),
    createdAt,
    updatedAt
  };
}

function buildTaskCompletedAuditSummary(input: DeadlineEvidenceInput) {
  const counts = countAttachmentsByKind(input.attachments ?? []);
  return `Counts PHOTO:${counts.PHOTO}, DOCUMENT:${counts.DOCUMENT}, REPORT:${counts.REPORT}${
    input.outcome ? ` · OUTCOME:${input.outcome}` : ""
  }`;
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

const normalizedInitialDeadlines = normalizeDeadlines(initialDeadlines);

function mergeDeadline(existing: Deadline, incoming: Deadline) {
  return {
    ...existing,
    ...incoming,
    description: incoming.description ?? existing.description ?? "",
    evidence: incoming.evidence ?? existing.evidence ?? [],
    resolvedProjectId: incoming.resolvedProjectId ?? existing.resolvedProjectId,
    projectTitle: incoming.projectTitle ?? existing.projectTitle,
    currentUserCanWriteProject:
      incoming.currentUserCanWriteProject ?? existing.currentUserCanWriteProject
  };
}

export function DeadlinesProvider({ children }: { children: React.ReactNode }) {
  const { user: authUser } = useAuth();
  const location = useLocation();
  const { logEvent } = useAuditLog();
  const { currentUser, getUserLabel } = useUsers();
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [writableProjectOptions, setWritableProjectOptions] = useState<DomainProjectOption[]>([]);
  const shouldAutoLoad = shouldAutoLoadDomainStore(location.pathname, "deadlines");

  const reloadDeadlines = useCallback(async () => {
    if (!authUser || authUser.type === "EXTERNAL") {
      setDeadlines([]);
      setWritableProjectOptions([]);
      clearPersistedValue(DEADLINES_STORAGE_KEY);
      return [];
    }

    const [nextDeadlines, nextProjectOptions] = await Promise.all([
      listDeadlines(),
      listDeadlineProjectOptions()
    ]);
    const next = normalizeDeadlines(nextDeadlines);
    setDeadlines(next);
    setWritableProjectOptions(nextProjectOptions);
    clearPersistedValue(DEADLINES_STORAGE_KEY);
    return next;
  }, [authUser]);

  useEffect(() => {
    if (!authUser || authUser.type === "EXTERNAL") {
      setDeadlines([]);
      setWritableProjectOptions([]);
      clearPersistedValue(DEADLINES_STORAGE_KEY);
      return;
    }
    if (!shouldAutoLoad) {
      return;
    }

    void reloadDeadlines().catch(() => {
      setDeadlines([]);
      setWritableProjectOptions([]);
      clearPersistedValue(DEADLINES_STORAGE_KEY);
    });
  }, [authUser, reloadDeadlines, shouldAutoLoad]);

  const addDeadline = useCallback(
    async (input: DeadlineCreateInput) => {
      try {
        const createdDeadline = normalizeDeadlines([
          await apiCreateDeadline({
            id: input.id,
            title: input.title,
            description: input.description ?? "",
            dueDate: input.dueDate,
            status: input.status ?? "OPEN",
            projectId: input.projectId,
            legalDocId: input.legalDocId,
            authorityId: input.authorityId,
            ownerUserId: input.ownerUserId,
            deputyUserId: input.deputyUserId,
            emailReminderEnabled: Boolean(input.emailReminderEnabled),
            emailReminderDaysBefore: input.emailReminderDaysBefore
          })
        ])[0];

        if (!createdDeadline) {
          return null;
        }

        setDeadlines((prev) => [createdDeadline, ...prev]);
        clearPersistedValue(DEADLINES_STORAGE_KEY);
        logEvent({
          actorLabel: "Demo User",
          entityType: "DEADLINE",
          entityId: createdDeadline.id,
          action: "CREATED",
          summary: createdDeadline.title
        });
        return createdDeadline;
      } catch {
        return null;
      }
    },
    [logEvent]
  );

  const updateDeadline = useCallback(
    async (id: string, input: Partial<Deadline>) => {
      const existing = deadlines.find((deadline) => deadline.id === id);
      if (!existing) {
        return null;
      }

      try {
        const updatedDeadline = normalizeDeadlines([
          await apiUpdateDeadline(id, {
            title: input.title !== undefined ? input.title : existing.title,
            description:
              input.description !== undefined ? input.description : existing.description ?? "",
            dueDate: input.dueDate !== undefined ? input.dueDate : existing.dueDate,
            status: input.status !== undefined ? normalizeStatus(input.status) : existing.status,
            projectId:
              input.projectId !== undefined ? input.projectId : existing.projectId,
            legalDocId:
              input.legalDocId !== undefined ? input.legalDocId : existing.legalDocId,
            authorityId:
              input.authorityId !== undefined ? input.authorityId : existing.authorityId,
            ownerUserId:
              input.ownerUserId !== undefined ? input.ownerUserId : existing.ownerUserId,
            deputyUserId:
              input.deputyUserId !== undefined ? input.deputyUserId : existing.deputyUserId,
            emailReminderEnabled:
              input.emailReminderEnabled !== undefined
                ? input.emailReminderEnabled
                : existing.emailReminderEnabled,
            emailReminderDaysBefore:
              input.emailReminderDaysBefore !== undefined
                ? input.emailReminderDaysBefore
                : existing.emailReminderDaysBefore,
            completedAt:
              input.completedAt !== undefined ? input.completedAt : existing.completedAt,
            completedByUserId:
              input.completedByUserId !== undefined
                ? input.completedByUserId
                : existing.completedByUserId,
            evidence:
              input.evidence !== undefined ? input.evidence : existing.evidence,
            archivedAt:
              input.archivedAt !== undefined ? input.archivedAt : existing.archivedAt,
            isArchived: input.isArchived !== undefined ? input.isArchived : existing.isArchived
          })
        ])[0];

        if (!updatedDeadline) {
          return null;
        }

        setDeadlines((prev) =>
          prev.map((deadline) =>
            deadline.id === id ? mergeDeadline(deadline, updatedDeadline) : deadline
          )
        );
        clearPersistedValue(DEADLINES_STORAGE_KEY);
        logEvent({
          actorLabel: "Demo User",
          entityType: "DEADLINE",
          entityId: id,
          action: "UPDATED",
          summary: existing.title
        });
        return updatedDeadline;
      } catch {
        return null;
      }
    },
    [deadlines, logEvent]
  );

  const setDeadlineStatus = useCallback(
    async (id: string, status: DeadlineStatusInput) => {
      const existing = deadlines.find((deadline) => deadline.id === id);
      if (!existing) {
        return null;
      }

      try {
        const updatedDeadline = normalizeDeadlines([await apiSetDeadlineStatus(id, status)])[0];
        if (!updatedDeadline) {
          return null;
        }

        setDeadlines((prev) =>
          prev.map((deadline) =>
            deadline.id === id ? mergeDeadline(deadline, updatedDeadline) : deadline
          )
        );
        clearPersistedValue(DEADLINES_STORAGE_KEY);
        logEvent({
          actorLabel: getUserLabel(currentUser?.id) || "Demo User",
          entityType: "DEADLINE",
          entityId: id,
          action: "STATUS_CHANGED",
          summary: `Deadline status set to ${status}`
        });
        return updatedDeadline;
      } catch {
        return null;
      }
    },
    [currentUser?.id, deadlines, getUserLabel, logEvent]
  );

  const markDeadlineDone = useCallback(
    async (id: string) => setDeadlineStatus(id, "DONE"),
    [setDeadlineStatus]
  );

  const markDeadlineDoneWithEvidence = useCallback(
    async (id: string, input: DeadlineEvidenceInput) => {
      try {
        const updatedDeadline = normalizeDeadlines([await apiCompleteDeadline(id, input)])[0];
        if (!updatedDeadline) {
          return null;
        }

        setDeadlines((prev) =>
          prev.map((deadline) =>
            deadline.id === id ? mergeDeadline(deadline, updatedDeadline) : deadline
          )
        );
        clearPersistedValue(DEADLINES_STORAGE_KEY);
        logEvent({
          actorLabel: getUserLabel(currentUser?.id) || "Demo User",
          entityType: "DEADLINE",
          entityId: id,
          action: "TASK_COMPLETED",
          summary: buildTaskCompletedAuditSummary(input)
        });
        return updatedDeadline;
      } catch {
        return null;
      }
    },
    [currentUser?.id, getUserLabel, logEvent]
  );

  const markDeadlineAttachmentUnavailable = useCallback(
    async (id: string, attachmentId: string) => {
      if (!attachmentId) {
        return false;
      }

      try {
        const updatedDeadline = normalizeDeadlines([
          await apiMarkDeadlineAttachmentUnavailable(id, attachmentId)
        ])[0];

        if (!updatedDeadline) {
          return false;
        }

        setDeadlines((prev) =>
          prev.map((deadline) =>
            deadline.id === id ? mergeDeadline(deadline, updatedDeadline) : deadline
          )
        );
        clearPersistedValue(DEADLINES_STORAGE_KEY);
        logEvent({
          actorLabel: "Demo User",
          entityType: "DEADLINE",
          entityId: id,
          action: "CLEANUP",
          summary: `Attachment marked unavailable (${attachmentId})`
        });
        return true;
      } catch {
        return false;
      }
    },
    [logEvent]
  );

  const reopenDeadline = useCallback(
    async (id: string) => {
      const existing = deadlines.find((deadline) => deadline.id === id);
      if (!existing) {
        return null;
      }

      try {
        const updatedDeadline = normalizeDeadlines([await apiReopenDeadline(id)])[0];
        if (!updatedDeadline) {
          return null;
        }

        setDeadlines((prev) =>
          prev.map((deadline) =>
            deadline.id === id ? mergeDeadline(deadline, updatedDeadline) : deadline
          )
        );
        clearPersistedValue(DEADLINES_STORAGE_KEY);
        logEvent({
          actorLabel: getUserLabel(currentUser?.id) || "Demo User",
          entityType: "DEADLINE",
          entityId: id,
          action: "STATUS_CHANGED",
          summary: "Deadline status set to OPEN"
        });
        return updatedDeadline;
      } catch {
        return null;
      }
    },
    [currentUser?.id, deadlines, getUserLabel, logEvent]
  );

  const archiveDeadline = useCallback(
    async (id: string) => {
      const existing = deadlines.find((deadline) => deadline.id === id);
      if (!existing) {
        return null;
      }

      try {
        const updatedDeadline = normalizeDeadlines([await apiArchiveDeadline(id)])[0];
        if (!updatedDeadline) {
          return null;
        }

        setDeadlines((prev) =>
          prev.map((deadline) =>
            deadline.id === id ? mergeDeadline(deadline, updatedDeadline) : deadline
          )
        );
        clearPersistedValue(DEADLINES_STORAGE_KEY);
        logEvent({
          actorLabel: "Demo User",
          entityType: "DEADLINE",
          entityId: id,
          action: "ARCHIVED",
          summary: existing.title
        });
        return updatedDeadline;
      } catch {
        return null;
      }
    },
    [deadlines, logEvent]
  );

  const restoreDeadline = useCallback(
    async (id: string) => {
      const existing = deadlines.find((deadline) => deadline.id === id);
      if (!existing) {
        return null;
      }

      try {
        const updatedDeadline = normalizeDeadlines([await apiRestoreDeadline(id)])[0];
        if (!updatedDeadline) {
          return null;
        }

        setDeadlines((prev) =>
          prev.map((deadline) =>
            deadline.id === id ? mergeDeadline(deadline, updatedDeadline) : deadline
          )
        );
        clearPersistedValue(DEADLINES_STORAGE_KEY);
        logEvent({
          actorLabel: "Demo User",
          entityType: "DEADLINE",
          entityId: id,
          action: "RESTORED",
          summary: existing.title
        });
        return updatedDeadline;
      } catch {
        return null;
      }
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
      deadlines.filter((deadline) => (deadline.resolvedProjectId ?? deadline.projectId) === projectId),
    [deadlines]
  );

  const getDeadlineStatus = useCallback((deadline: Deadline) => resolveDeadlineStatus(deadline), []);

  const replaceDeadlines = useCallback(async (value: Deadline[]) => {
    const replaced = normalizeDeadlines(await bulkReplaceDeadlines(value));
    setDeadlines(replaced);
    clearPersistedValue(DEADLINES_STORAGE_KEY);
  }, []);

  const resetDeadlines = useCallback(async () => {
    if (normalizedInitialDeadlines.length === 0) {
      await bulkDeleteDeadlines();
      setDeadlines([]);
      clearPersistedValue(DEADLINES_STORAGE_KEY);
      return;
    }

    const replaced = normalizeDeadlines(await bulkReplaceDeadlines(normalizedInitialDeadlines));
    setDeadlines(replaced);
    clearPersistedValue(DEADLINES_STORAGE_KEY);
  }, []);

  const value = useMemo(
    () => ({
      deadlines,
      writableProjectOptions,
      addDeadline,
      updateDeadline,
      setDeadlineStatus,
      markDeadlineDone,
      markDeadlineDoneWithEvidence,
      markDeadlineAttachmentUnavailable,
      reopenDeadline,
      archiveDeadline,
      restoreDeadline,
      getDeadlinesForLegalDoc,
      getDeadlinesForProject,
      getDeadlineStatus,
      replaceDeadlines,
      resetDeadlines,
      reloadDeadlines
    }),
    [
      addDeadline,
      archiveDeadline,
      deadlines,
      writableProjectOptions,
      getDeadlineStatus,
      getDeadlinesForLegalDoc,
      getDeadlinesForProject,
      markDeadlineDone,
      markDeadlineDoneWithEvidence,
      markDeadlineAttachmentUnavailable,
      reopenDeadline,
      reloadDeadlines,
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
