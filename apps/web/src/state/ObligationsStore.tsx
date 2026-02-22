import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { obligations as initialObligations, Obligation } from "../data/obligations";
import { useAuditLog } from "./AuditLogStore";
import { loadJSON, saveJSON, STORAGE_KEYS } from "./persistence";

export type ObligationsContextValue = {
  obligations: Obligation[];
  addObligation: (
    input: Omit<Obligation, "id" | "createdAt" | "updatedAt" | "isArchived" | "archivedAt">
  ) => void;
  updateObligation: (id: string, input: Partial<Obligation>) => void;
  archiveObligation: (id: string) => void;
  restoreObligation: (id: string) => void;
  getObligationsForLegalDoc: (legalDocId: string) => Obligation[];
  replaceObligations: (value: Obligation[]) => void;
  resetObligations: () => void;
};

const ObligationsContext = createContext<ObligationsContextValue | undefined>(undefined);

function createId() {
  return `ob-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

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
    criticality: value.criticality ?? undefined,
    emailReminderEnabled: normalizedReminder.emailReminderEnabled,
    emailReminderDaysBefore: normalizedReminder.emailReminderDaysBefore,
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

export function ObligationsProvider({ children }: { children: React.ReactNode }) {
  const { logEvent } = useAuditLog();
  const [obligations, setObligations] = useState<Obligation[]>(() =>
    loadJSON<Obligation[]>(STORAGE_KEYS.obligations, {
      fallback: initialObligations,
      migrate: (value) => {
        const normalized = normalizeObligations(value);
        return normalized.length ? normalized : initialObligations;
      }
    }) ?? initialObligations
  );

  React.useEffect(() => {
    saveJSON(STORAGE_KEYS.obligations, obligations);
  }, [obligations]);

  const addObligation = useCallback(
    (
      input: Omit<Obligation, "id" | "createdAt" | "updatedAt" | "isArchived" | "archivedAt">
    ) => {
      const timestamp = nowStamp();
      const normalized = normalizeObligationInput(input);
      const newObligation: Obligation = {
        ...normalized,
        id: createId(),
        archivedAt: undefined,
        isArchived: false,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      setObligations((prev) => [newObligation, ...prev]);
      logEvent({
        actorLabel: "Demo User",
        entityType: "OBLIGATION",
        entityId: newObligation.id,
        action: "CREATED",
        summary: newObligation.title
      });
    },
    [logEvent]
  );

  const updateObligation = useCallback(
    (id: string, input: Partial<Obligation>) => {
      const current = obligations.find((obligation) => obligation.id === id);
      if (!current) {
        return;
      }

      const timestamp = nowStamp();
      setObligations((prev) =>
        prev.map((obligation) => {
          if (obligation.id !== id) {
            return obligation;
          }
          const merged = normalizeObligationInput({
            ...obligation,
            ...input
          });

          return {
            ...merged,
            id: obligation.id,
            archivedAt: merged.archivedAt,
            isArchived: merged.isArchived,
            createdAt: obligation.createdAt,
            updatedAt: timestamp
          };
        })
      );
      logEvent({
        actorLabel: "Demo User",
        entityType: "OBLIGATION",
        entityId: id,
        action: "UPDATED",
        summary: current.title
      });
    },
    [logEvent, obligations]
  );

  const archiveObligation = useCallback(
    (id: string) => {
      const current = obligations.find((obligation) => obligation.id === id);
      if (!current) {
        return;
      }
      const timestamp = nowStamp();
      setObligations((prev) =>
        prev.map((obligation) =>
          obligation.id === id
            ? {
                ...obligation,
                archivedAt: timestamp,
                isArchived: true,
                updatedAt: timestamp
              }
            : obligation
        )
      );
      logEvent({
        actorLabel: "Demo User",
        entityType: "OBLIGATION",
        entityId: id,
        action: "ARCHIVED",
        summary: current.title
      });
    },
    [logEvent, obligations]
  );

  const restoreObligation = useCallback(
    (id: string) => {
      const current = obligations.find((obligation) => obligation.id === id);
      if (!current) {
        return;
      }
      const timestamp = nowStamp();
      setObligations((prev) =>
        prev.map((obligation) =>
          obligation.id === id
            ? {
                ...obligation,
                archivedAt: undefined,
                isArchived: false,
                updatedAt: timestamp
              }
            : obligation
        )
      );
      logEvent({
        actorLabel: "Demo User",
        entityType: "OBLIGATION",
        entityId: id,
        action: "RESTORED",
        summary: current.title
      });
    },
    [logEvent, obligations]
  );

  const getObligationsForLegalDoc = useCallback(
    (legalDocId: string) =>
      obligations.filter((obligation) => obligation.legalDocId === legalDocId),
    [obligations]
  );

  const replaceObligations = useCallback((value: Obligation[]) => {
    const normalized = normalizeObligations(value);
    setObligations(normalized.length ? normalized : initialObligations);
  }, []);

  const resetObligations = useCallback(() => {
    setObligations(initialObligations);
  }, []);

  const value = useMemo(
    () => ({
      obligations,
      addObligation,
      updateObligation,
      archiveObligation,
      restoreObligation,
      getObligationsForLegalDoc,
      replaceObligations,
      resetObligations
    }),
    [
      addObligation,
      archiveObligation,
      getObligationsForLegalDoc,
      obligations,
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
