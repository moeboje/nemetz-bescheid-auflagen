import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { obligations as initialObligations, Obligation } from "../data/obligations";

export type ObligationsContextValue = {
  obligations: Obligation[];
  addObligation: (input: Omit<Obligation, "id">) => void;
  updateObligation: (id: string, input: Partial<Obligation>) => void;
  getObligationsForLegalDoc: (legalDocId: string) => Obligation[];
};

const ObligationsContext = createContext<ObligationsContextValue | undefined>(undefined);

function createId() {
  return `ob-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function normalizeObligation(input: Omit<Obligation, "id">): Omit<Obligation, "id"> {
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

export function ObligationsProvider({ children }: { children: React.ReactNode }) {
  const [obligations, setObligations] = useState<Obligation[]>(initialObligations);

  const addObligation = useCallback((input: Omit<Obligation, "id">) => {
    const newObligation: Obligation = {
      ...normalizeObligation(input),
      id: createId()
    };
    setObligations((prev) => [newObligation, ...prev]);
  }, []);

  const updateObligation = useCallback((id: string, input: Partial<Obligation>) => {
    setObligations((prev) =>
      prev.map((obligation) => {
        if (obligation.id !== id) {
          return obligation;
        }
        const merged = { ...obligation, ...input };
        if (!merged.emailReminderEnabled) {
          return { ...merged, emailReminderDaysBefore: undefined };
        }
        return { ...merged, emailReminderDaysBefore: merged.emailReminderDaysBefore ?? 7 };
      })
    );
  }, []);

  const getObligationsForLegalDoc = useCallback(
    (legalDocId: string) => obligations.filter((obligation) => obligation.legalDocId === legalDocId),
    [obligations]
  );

  const value = useMemo(
    () => ({
      obligations,
      addObligation,
      updateObligation,
      getObligationsForLegalDoc
    }),
    [addObligation, getObligationsForLegalDoc, obligations, updateObligation]
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
