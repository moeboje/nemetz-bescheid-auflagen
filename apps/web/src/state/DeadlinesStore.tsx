import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import {
  deadlines as initialDeadlines,
  Deadline,
  DeadlineStatus,
  DeadlineStoredStatus
} from "../data/deadlines";
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

type DeadlineStatusInput = DeadlineStoredStatus;

type DeadlineEvidenceInput = {
  note?: string;
  outcome?: EvidenceOutcome;
  attachments: AttachmentMeta[];
};

export type DeadlinesContextValue = {
  deadlines: Deadline[];
  addDeadline: (
    input: Omit<
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
    > & { status?: DeadlineStatusInput }
  ) => void;
  updateDeadline: (id: string, input: Partial<Deadline>) => void;
  setDeadlineStatus: (id: string, status: DeadlineStatusInput) => void;
  markDeadlineDone: (id: string) => void;
  markDeadlineDoneWithEvidence: (id: string, input: DeadlineEvidenceInput) => void;
  markDeadlineAttachmentUnavailable: (id: string, attachmentId: string) => void;
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

export function DeadlinesProvider({ children }: { children: React.ReactNode }) {
  const { logEvent } = useAuditLog();
  const { currentUser, getUserLabel } = useUsers();
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
        | "id"
        | "status"
        | "createdAt"
        | "updatedAt"
        | "isArchived"
        | "archivedAt"
        | "completedAt"
        | "completedByUserId"
        | "evidence"
      > & { status?: DeadlineStatusInput }
    ) => {
      const timestamp = nowStamp();
      const normalizedReminder = normalizeReminder(input);
      const newDeadline: Deadline = {
        ...normalizedReminder,
        id: createId(),
        status: input.status ?? "OPEN",
        completedAt: undefined,
        completedByUserId: undefined,
        evidence: [],
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
            evidence: Array.isArray(merged.evidence) ? merged.evidence : deadline.evidence ?? [],
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
          deadline.id === id
            ? {
                ...deadline,
                status,
                completedAt: status === "DONE" ? timestamp : undefined,
                completedByUserId: status === "DONE" ? currentUser?.id : undefined,
                updatedAt: timestamp
              }
            : deadline
        )
      );
      logEvent({
        actorLabel: getUserLabel(currentUser?.id) || "Demo User",
        entityType: "DEADLINE",
        entityId: id,
        action: "STATUS_CHANGED",
        summary: `Deadline status set to ${status}`
      });
    },
    [currentUser?.id, deadlines, getUserLabel, logEvent]
  );

  const markDeadlineDone = useCallback(
    (id: string) => {
      setDeadlineStatus(id, "DONE");
    },
    [setDeadlineStatus]
  );

  const markDeadlineDoneWithEvidence = useCallback(
    (id: string, input: DeadlineEvidenceInput) => {
      const timestamp = nowStamp();
      const evidenceEntry: Evidence = {
        id: createStableId("ev"),
        note: input.note,
        outcome: input.outcome,
        attachments: input.attachments ?? [],
        createdAt: timestamp,
        createdByUserId: currentUser?.id,
        createdByLabel: getUserLabel(currentUser?.id)
      };

      setDeadlines((prev) =>
        prev.map((deadline) =>
          deadline.id === id
            ? {
                ...deadline,
                status: "DONE",
                completedAt: timestamp,
                completedByUserId: currentUser?.id,
                evidence: [evidenceEntry, ...(deadline.evidence ?? [])],
                updatedAt: timestamp
              }
            : deadline
        )
      );

      logEvent({
        actorLabel: getUserLabel(currentUser?.id) || "Demo User",
        entityType: "DEADLINE",
        entityId: id,
        action: "TASK_COMPLETED",
        summary: buildTaskCompletedAuditSummary(input)
      });
    },
    [currentUser?.id, getUserLabel, logEvent]
  );

  const markDeadlineAttachmentUnavailable = useCallback(
    (id: string, attachmentId: string) => {
      if (!attachmentId) {
        return;
      }

      let changed = false;
      const timestamp = nowStamp();
      setDeadlines((prev) =>
        prev.map((deadline) => {
          if (deadline.id !== id || !deadline.evidence?.length) {
            return deadline;
          }

          const nextEvidence = deadline.evidence.map((entry) => ({
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
            return deadline;
          }

          return {
            ...deadline,
            evidence: nextEvidence,
            updatedAt: timestamp
          };
        })
      );

      if (changed) {
        logEvent({
          actorLabel: "Demo User",
          entityType: "DEADLINE",
          entityId: id,
          action: "CLEANUP",
          summary: `Attachment marked unavailable (${attachmentId})`
        });
      }
    },
    [logEvent]
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
    (projectId: string) => deadlines.filter((deadline) => deadline.projectId === projectId),
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
      markDeadlineDoneWithEvidence,
      markDeadlineAttachmentUnavailable,
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
      markDeadlineDoneWithEvidence,
      markDeadlineAttachmentUnavailable,
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
