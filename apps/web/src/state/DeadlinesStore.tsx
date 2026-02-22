import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { deadlines as initialDeadlines, Deadline, DeadlineStatus } from "../data/deadlines";
import { loadFromStorage, saveToStorage } from "./storage";

const STORAGE_KEY = "nemetz.deadlines";

type DeadlineStatusInput = Exclude<DeadlineStatus, "OVERDUE">;

export type DeadlinesContextValue = {
  deadlines: Deadline[];
  addDeadline: (input: Omit<Deadline, "id" | "status"> & { status?: DeadlineStatusInput }) => void;
  updateDeadline: (id: string, input: Partial<Deadline>) => void;
  setDeadlineStatus: (id: string, status: DeadlineStatusInput) => void;
  getDeadlinesForLegalDoc: (legalDocId: string) => Deadline[];
  getDeadlinesForProject: (projectId: string) => Deadline[];
  getDeadlineStatus: (deadline: Deadline) => DeadlineStatus;
};

const DeadlinesContext = createContext<DeadlinesContextValue | undefined>(undefined);

function createId() {
  return `dl-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}

function normalizeStatus(status?: DeadlineStatus): DeadlineStatusInput {
  return status === "DONE" ? "DONE" : "OPEN";
}

function normalizeReminder(input: Deadline): Deadline {
  if (!input.emailReminderEnabled) {
    return {
      ...input,
      emailReminderDaysBefore: undefined
    };
  }
  return {
    ...input,
    emailReminderDaysBefore: input.emailReminderDaysBefore ?? 7
  };
}

function normalizeDeadline(input: Deadline): Deadline {
  return normalizeReminder({
    ...input,
    status: normalizeStatus(input.status)
  });
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
  const [deadlines, setDeadlines] = useState<Deadline[]>(() => {
    const stored = loadFromStorage<Deadline[] | null>(STORAGE_KEY, null);
    if (stored?.length) {
      return stored.map(normalizeDeadline);
    }
    return initialDeadlines.map(normalizeDeadline);
  });

  React.useEffect(() => {
    saveToStorage(STORAGE_KEY, deadlines);
  }, [deadlines]);

  const addDeadline = useCallback(
    (input: Omit<Deadline, "id" | "status"> & { status?: DeadlineStatusInput }) => {
      const newDeadline = normalizeDeadline({
        ...input,
        id: createId(),
        status: input.status ?? "OPEN"
      });
      setDeadlines((prev) => [newDeadline, ...prev]);
    },
    []
  );

  const updateDeadline = useCallback((id: string, input: Partial<Deadline>) => {
    setDeadlines((prev) =>
      prev.map((deadline) => {
        if (deadline.id !== id) {
          return deadline;
        }
        return normalizeDeadline({
          ...deadline,
          ...input
        });
      })
    );
  }, []);

  const setDeadlineStatus = useCallback((id: string, status: DeadlineStatusInput) => {
    setDeadlines((prev) =>
      prev.map((deadline) => (deadline.id === id ? { ...deadline, status } : deadline))
    );
  }, []);

  const getDeadlinesForLegalDoc = useCallback(
    (legalDocId: string) => deadlines.filter((deadline) => deadline.legalDocId === legalDocId),
    [deadlines]
  );

  const getDeadlinesForProject = useCallback(
    (projectId: string) => deadlines.filter((deadline) => deadline.projectId === projectId),
    [deadlines]
  );

  const getDeadlineStatus = useCallback((deadline: Deadline) => resolveDeadlineStatus(deadline), []);

  const value = useMemo(
    () => ({
      deadlines,
      addDeadline,
      updateDeadline,
      setDeadlineStatus,
      getDeadlinesForLegalDoc,
      getDeadlinesForProject,
      getDeadlineStatus
    }),
    [
      addDeadline,
      deadlines,
      getDeadlineStatus,
      getDeadlinesForLegalDoc,
      getDeadlinesForProject,
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
