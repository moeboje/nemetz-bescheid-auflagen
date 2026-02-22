import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { AuditAction, AuditEntityType } from "../types/models";
import { loadJSON, saveJSON, STORAGE_KEYS } from "./persistence";

export type AuditLogEntry = {
  id: string;
  at: string;
  actorLabel: string;
  entityType: AuditEntityType;
  entityId: string;
  action: AuditAction;
  summary: string;
};

type LogEventInput = Omit<AuditLogEntry, "id" | "at"> & {
  at?: string;
};

type AuditLogContextValue = {
  entries: AuditLogEntry[];
  logEvent: (input: LogEventInput) => void;
  replaceAuditLog: (entries: AuditLogEntry[]) => void;
  resetAuditLog: () => void;
  getEntriesForEntity: (entityType: AuditEntityType, entityId: string) => AuditLogEntry[];
};

const AuditLogContext = createContext<AuditLogContextValue | undefined>(undefined);

function createId() {
  return `audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function nowStamp() {
  return new Date().toISOString();
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeAuditEntries(value: unknown): AuditLogEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item, index) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const row = item as Partial<AuditLogEntry>;
      if (
        !isNonEmptyString(row.entityType) ||
        !isNonEmptyString(row.entityId) ||
        !isNonEmptyString(row.action) ||
        !isNonEmptyString(row.summary)
      ) {
        return null;
      }

      const at = isNonEmptyString(row.at) ? row.at : nowStamp();
      const id =
        isNonEmptyString(row.id)
          ? row.id
          : `audit-${row.entityType}-${row.entityId}-${at}-${index}`;

      return {
        id,
        at,
        actorLabel: isNonEmptyString(row.actorLabel) ? row.actorLabel : "Demo User",
        entityType: row.entityType as AuditEntityType,
        entityId: row.entityId,
        action: row.action as AuditAction,
        summary: row.summary
      } satisfies AuditLogEntry;
    })
    .filter((entry): entry is AuditLogEntry => Boolean(entry))
    .sort((a, b) => b.at.localeCompare(a.at));
}

export function AuditLogProvider({ children }: { children: React.ReactNode }) {
  const [entries, setEntries] = useState<AuditLogEntry[]>(() =>
    loadJSON<AuditLogEntry[]>(STORAGE_KEYS.auditLog, {
      fallback: [],
      migrate: (value) => normalizeAuditEntries(value)
    }) ?? []
  );

  React.useEffect(() => {
    saveJSON(STORAGE_KEYS.auditLog, entries);
  }, [entries]);

  const logEvent = useCallback((input: LogEventInput) => {
    const entry: AuditLogEntry = {
      id: createId(),
      at: input.at ?? nowStamp(),
      actorLabel: input.actorLabel || "Demo User",
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      summary: input.summary
    };
    setEntries((prev) => [entry, ...prev]);
  }, []);

  const replaceAuditLog = useCallback((value: AuditLogEntry[]) => {
    setEntries(normalizeAuditEntries(value));
  }, []);

  const resetAuditLog = useCallback(() => {
    setEntries([]);
  }, []);

  const getEntriesForEntity = useCallback(
    (entityType: AuditEntityType, entityId: string) =>
      entries.filter(
        (entry) => entry.entityType === entityType && entry.entityId === entityId
      ),
    [entries]
  );

  const value = useMemo(
    () => ({
      entries,
      logEvent,
      replaceAuditLog,
      resetAuditLog,
      getEntriesForEntity
    }),
    [entries, getEntriesForEntity, logEvent, replaceAuditLog, resetAuditLog]
  );

  return <AuditLogContext.Provider value={value}>{children}</AuditLogContext.Provider>;
}

export function useAuditLog() {
  const context = useContext(AuditLogContext);
  if (!context) {
    throw new Error("useAuditLog must be used within AuditLogProvider");
  }
  return context;
}
