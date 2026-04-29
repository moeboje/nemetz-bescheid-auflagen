import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  DEFAULT_OBLIGATION_EVIDENCE_REQUIREMENTS,
  obligations as initialObligations,
  type Obligation,
  type ObligationEvidenceRequirements
} from "../data/obligations";
import { useAuth } from "./AuthStore";
import { useAuditLog } from "./AuditLogStore";
import { clearPersistedValue, makeStorageKey } from "./persistence";
import {
  archiveObligation as apiArchiveObligation,
  bulkDeleteObligations,
  bulkReplaceObligations,
  createObligation as apiCreateObligation,
  listObligations,
  restoreObligation as apiRestoreObligation,
  updateObligation as apiUpdateObligation
} from "../api/obligations";

type ObligationCreateInput = Omit<
  Obligation,
  "id" | "createdAt" | "updatedAt" | "isArchived" | "archivedAt"
> & {
  id?: string;
  projectId?: string;
};

export type ObligationsContextValue = {
  obligations: Obligation[];
  mutationError?: string;
  clearMutationError: () => void;
  addObligation: (
    input: ObligationCreateInput
  ) => Promise<Obligation | null>;
  updateObligation: (
    id: string,
    input: Partial<Obligation> & { projectId?: string }
  ) => Promise<Obligation | null>;
  archiveObligation: (id: string) => Promise<Obligation | null>;
  restoreObligation: (id: string) => Promise<Obligation | null>;
  getObligationsForLegalDoc: (legalDocId: string) => Obligation[];
  replaceObligations: (value: Obligation[]) => Promise<void>;
  resetObligations: () => Promise<void>;
  reloadObligations: () => Promise<Obligation[]>;
};

const ObligationsContext = createContext<ObligationsContextValue | undefined>(undefined);

export const OBLIGATIONS_STORAGE_KEY = makeStorageKey("obligations");

function nowStamp() {
  return new Date().toISOString();
}

function normalizeObligationInput<
  T extends Pick<Obligation, "emailReminderEnabled" | "emailReminderDaysBefore">
>(input: T): T {
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

function normalizeEvidenceRequirements(value: unknown): ObligationEvidenceRequirements {
  if (!value || typeof value !== "object") {
    return { ...DEFAULT_OBLIGATION_EVIDENCE_REQUIREMENTS };
  }

  const row = value as Partial<ObligationEvidenceRequirements>;
  return {
    requirePhoto: Boolean(row.requirePhoto),
    requireDocument: Boolean(row.requireDocument),
    requireReport: Boolean(row.requireReport)
  };
}

function normalizeObligation(value: Partial<Obligation>, index: number): Obligation | null {
  if (
    typeof value.id !== "string" ||
    !value.id.trim() ||
    typeof value.legalDocId !== "string" ||
    !value.legalDocId.trim() ||
    typeof value.title !== "string" ||
    !value.title.trim()
  ) {
    return null;
  }

  const createdAt =
    typeof value.createdAt === "string" && value.createdAt.trim() ? value.createdAt : nowStamp();
  const updatedAt =
    typeof value.updatedAt === "string" && value.updatedAt.trim()
      ? value.updatedAt
      : createdAt;
  const normalizedReminder = normalizeObligationInput({
    emailReminderEnabled: Boolean(value.emailReminderEnabled),
    emailReminderDaysBefore: value.emailReminderDaysBefore
  });

  return {
    id: value.id || `ob-seed-${index}`,
    legalDocId: value.legalDocId,
    title: value.title,
    infoTextLong: value.infoTextLong ?? "",
    level: value.level ?? "MANDATORY",
    scheduleType: value.scheduleType ?? "ONCE",
    firstDueDate: value.firstDueDate ?? undefined,
    intervalUnit: value.intervalUnit ?? undefined,
    intervalValue:
      typeof value.intervalValue === "number" && value.intervalValue > 0
        ? value.intervalValue
        : undefined,
    ownerUserId: value.ownerUserId ?? undefined,
    deputyUserId: value.deputyUserId ?? undefined,
    origin:
      value.origin === "AI_ACCEPTED"
        ? "AI_ACCEPTED"
        : value.origin === "MANUAL"
        ? "MANUAL"
        : undefined,
    sourceSuggestionId: value.sourceSuggestionId ?? undefined,
    sourceRunId: value.sourceRunId ?? undefined,
    criticality: value.criticality ?? undefined,
    recurrenceEndDate: value.recurrenceEndDate ?? undefined,
    externalOrgId: value.externalOrgId ?? undefined,
    externalUserId: value.externalUserId ?? undefined,
    emailReminderEnabled: normalizedReminder.emailReminderEnabled,
    emailReminderDaysBefore: normalizedReminder.emailReminderDaysBefore,
    evidenceRequirements: normalizeEvidenceRequirements(value.evidenceRequirements),
    archivedAt: value.archivedAt ?? undefined,
    isArchived: Boolean(value.isArchived || value.archivedAt),
    createdAt,
    updatedAt
  };
}

function normalizeObligations(value: unknown): Obligation[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((obligation, index) => normalizeObligation(obligation as Partial<Obligation>, index))
    .filter((obligation): obligation is Obligation => Boolean(obligation));
}

const normalizedInitialObligations = normalizeObligations(initialObligations);

function mergeObligation(existing: Obligation, incoming: Obligation) {
  return {
    ...existing,
    ...incoming,
    infoTextLong: incoming.infoTextLong ?? existing.infoTextLong ?? "",
    evidenceRequirements: incoming.evidenceRequirements ?? existing.evidenceRequirements
  };
}

function getMutationErrorMessage(error: unknown) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "request_failed";
}

export function ObligationsProvider({ children }: { children: React.ReactNode }) {
  const { user: authUser } = useAuth();
  const { logEvent } = useAuditLog();
  const [obligations, setObligations] = useState<Obligation[]>([]);
  const [mutationError, setMutationError] = useState<string | undefined>();

  const clearMutationError = useCallback(() => {
    setMutationError(undefined);
  }, []);

  const reloadObligations = useCallback(async () => {
    if (!authUser || authUser.type === "EXTERNAL") {
      setObligations([]);
      clearPersistedValue(OBLIGATIONS_STORAGE_KEY);
      return [];
    }

    const next = normalizeObligations(await listObligations());
    setObligations(next);
    clearPersistedValue(OBLIGATIONS_STORAGE_KEY);
    return next;
  }, [authUser]);

  useEffect(() => {
    if (!authUser || authUser.type === "EXTERNAL") {
      setObligations([]);
      clearPersistedValue(OBLIGATIONS_STORAGE_KEY);
      return;
    }

    void reloadObligations().catch(() => {
      setObligations([]);
      clearPersistedValue(OBLIGATIONS_STORAGE_KEY);
    });
  }, [authUser, reloadObligations]);

  const addObligation = useCallback(
    async (
      input: ObligationCreateInput
    ) => {
      setMutationError(undefined);
      try {
        const normalized = normalizeObligations([
          await apiCreateObligation({
            id: input.id,
            legalDocId: input.legalDocId,
            projectId: input.projectId,
            title: input.title,
            infoTextLong: input.infoTextLong ?? "",
            level: input.level,
            criticality: input.criticality,
            scheduleType: input.scheduleType,
            firstDueDate: input.firstDueDate,
            recurrenceEndDate: input.recurrenceEndDate,
            intervalUnit: input.intervalUnit,
            intervalValue: input.intervalValue,
            ownerUserId: input.ownerUserId,
            deputyUserId: input.deputyUserId,
            externalOrgId: input.externalOrgId,
            externalUserId: input.externalUserId,
            origin: input.origin ?? "MANUAL",
            sourceSuggestionId: input.sourceSuggestionId,
            sourceRunId: input.sourceRunId,
            emailReminderEnabled: Boolean(input.emailReminderEnabled),
            emailReminderDaysBefore: input.emailReminderDaysBefore,
            evidenceRequirements: normalizeEvidenceRequirements(input.evidenceRequirements)
          })
        ])[0];

        if (!normalized) {
          return null;
        }

        setObligations((prev) => [normalized, ...prev]);
        clearPersistedValue(OBLIGATIONS_STORAGE_KEY);
        logEvent({
          actorLabel: "Demo User",
          entityType: "OBLIGATION",
          entityId: normalized.id,
          action: "CREATED",
          summary: normalized.title
        });
        return normalized;
      } catch (error) {
        setMutationError(getMutationErrorMessage(error));
        return null;
      }
    },
    [logEvent]
  );

  const updateObligation = useCallback(
    async (id: string, input: Partial<Obligation> & { projectId?: string }) => {
      const existing = obligations.find((obligation) => obligation.id === id);
      if (!existing) {
        return null;
      }

      setMutationError(undefined);
      try {
        const updatedObligation = normalizeObligations([
          await apiUpdateObligation(id, {
            projectId: input.projectId,
            legalDocId:
              input.legalDocId !== undefined ? input.legalDocId : existing.legalDocId,
            title: input.title !== undefined ? input.title : existing.title,
            infoTextLong:
              input.infoTextLong !== undefined ? input.infoTextLong : existing.infoTextLong ?? "",
            level: input.level !== undefined ? input.level : existing.level,
            criticality:
              input.criticality !== undefined ? input.criticality : existing.criticality,
            scheduleType:
              input.scheduleType !== undefined ? input.scheduleType : existing.scheduleType,
            firstDueDate:
              input.firstDueDate !== undefined ? input.firstDueDate : existing.firstDueDate,
            recurrenceEndDate:
              input.recurrenceEndDate !== undefined
                ? input.recurrenceEndDate
                : existing.recurrenceEndDate,
            intervalUnit:
              input.intervalUnit !== undefined ? input.intervalUnit : existing.intervalUnit,
            intervalValue:
              input.intervalValue !== undefined ? input.intervalValue : existing.intervalValue,
            ownerUserId:
              input.ownerUserId !== undefined ? input.ownerUserId : existing.ownerUserId,
            deputyUserId:
              input.deputyUserId !== undefined ? input.deputyUserId : existing.deputyUserId,
            externalOrgId:
              input.externalOrgId !== undefined ? input.externalOrgId : existing.externalOrgId,
            externalUserId:
              input.externalUserId !== undefined ? input.externalUserId : existing.externalUserId,
            origin: input.origin !== undefined ? input.origin : existing.origin,
            sourceSuggestionId:
              input.sourceSuggestionId !== undefined
                ? input.sourceSuggestionId
                : existing.sourceSuggestionId,
            sourceRunId:
              input.sourceRunId !== undefined ? input.sourceRunId : existing.sourceRunId,
            emailReminderEnabled:
              input.emailReminderEnabled !== undefined
                ? input.emailReminderEnabled
                : existing.emailReminderEnabled,
            emailReminderDaysBefore:
              input.emailReminderDaysBefore !== undefined
                ? input.emailReminderDaysBefore
                : existing.emailReminderDaysBefore,
            evidenceRequirements:
              input.evidenceRequirements !== undefined
                ? normalizeEvidenceRequirements(input.evidenceRequirements)
                : existing.evidenceRequirements,
            archivedAt:
              input.archivedAt !== undefined ? input.archivedAt : existing.archivedAt,
            isArchived: input.isArchived !== undefined ? input.isArchived : existing.isArchived
          })
        ])[0];

        if (!updatedObligation) {
          return null;
        }

        setObligations((prev) =>
          prev.map((obligation) =>
            obligation.id === id ? mergeObligation(obligation, updatedObligation) : obligation
          )
        );
        clearPersistedValue(OBLIGATIONS_STORAGE_KEY);
        logEvent({
          actorLabel: "Demo User",
          entityType: "OBLIGATION",
          entityId: id,
          action: "UPDATED",
          summary: existing.title
        });
        return updatedObligation;
      } catch (error) {
        setMutationError(getMutationErrorMessage(error));
        return null;
      }
    },
    [logEvent, obligations]
  );

  const archiveObligation = useCallback(
    async (id: string) => {
      const existing = obligations.find((obligation) => obligation.id === id);
      if (!existing) {
        return null;
      }

      try {
        const updatedObligation = normalizeObligations([await apiArchiveObligation(id)])[0];
        if (!updatedObligation) {
          return null;
        }

        setObligations((prev) =>
          prev.map((obligation) =>
            obligation.id === id ? mergeObligation(obligation, updatedObligation) : obligation
          )
        );
        clearPersistedValue(OBLIGATIONS_STORAGE_KEY);
        logEvent({
          actorLabel: "Demo User",
          entityType: "OBLIGATION",
          entityId: id,
          action: "ARCHIVED",
          summary: existing.title
        });
        return updatedObligation;
      } catch (error) {
        setMutationError(getMutationErrorMessage(error));
        return null;
      }
    },
    [logEvent, obligations]
  );

  const restoreObligation = useCallback(
    async (id: string) => {
      const existing = obligations.find((obligation) => obligation.id === id);
      if (!existing) {
        return null;
      }

      try {
        const updatedObligation = normalizeObligations([await apiRestoreObligation(id)])[0];
        if (!updatedObligation) {
          return null;
        }

        setObligations((prev) =>
          prev.map((obligation) =>
            obligation.id === id ? mergeObligation(obligation, updatedObligation) : obligation
          )
        );
        clearPersistedValue(OBLIGATIONS_STORAGE_KEY);
        logEvent({
          actorLabel: "Demo User",
          entityType: "OBLIGATION",
          entityId: id,
          action: "RESTORED",
          summary: existing.title
        });
        return updatedObligation;
      } catch (error) {
        setMutationError(getMutationErrorMessage(error));
        return null;
      }
    },
    [logEvent, obligations]
  );

  const getObligationsForLegalDoc = useCallback(
    (legalDocId: string) =>
      obligations.filter((obligation) => obligation.legalDocId === legalDocId),
    [obligations]
  );

  const replaceObligations = useCallback(async (value: Obligation[]) => {
    const replaced = normalizeObligations(await bulkReplaceObligations(value));
    setObligations(replaced);
    clearPersistedValue(OBLIGATIONS_STORAGE_KEY);
  }, []);

  const resetObligations = useCallback(async () => {
    if (normalizedInitialObligations.length === 0) {
      await bulkDeleteObligations();
      setObligations([]);
      clearPersistedValue(OBLIGATIONS_STORAGE_KEY);
      return;
    }

    const replaced = normalizeObligations(await bulkReplaceObligations(normalizedInitialObligations));
    setObligations(replaced);
    clearPersistedValue(OBLIGATIONS_STORAGE_KEY);
  }, []);

  const value = useMemo(
    () => ({
      obligations,
      mutationError,
      clearMutationError,
      addObligation,
      updateObligation,
      archiveObligation,
      restoreObligation,
      getObligationsForLegalDoc,
      replaceObligations,
      resetObligations,
      reloadObligations
    }),
    [
      addObligation,
      archiveObligation,
      getObligationsForLegalDoc,
      obligations,
      mutationError,
      clearMutationError,
      reloadObligations,
      replaceObligations,
      resetObligations,
      restoreObligation,
      updateObligation
    ]
  );

  return <ObligationsContext.Provider value={value}>{children}</ObligationsContext.Provider>;
}

export function useObligations() {
  const context = useContext(ObligationsContext);
  if (!context) {
    throw new Error("useObligations must be used within ObligationsProvider");
  }
  return context;
}

export type { Obligation };
