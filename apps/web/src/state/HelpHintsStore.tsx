import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { loadJSON, makeStorageKey, saveJSON } from "./persistence";
import { useUsers } from "./UsersStore";

type HelpHintsDismissedMap = Record<string, boolean>;

type HelpHintsState = {
  storageKey: string;
  dismissed: HelpHintsDismissedMap;
};

export type HelpHintsContextValue = {
  dismissed: HelpHintsDismissedMap;
  isDismissed: (hintId: string) => boolean;
  dismiss: (hintId: string) => void;
  resetAll: () => void;
  reset: (hintId: string) => void;
  exportDismissed: () => HelpHintsDismissedMap;
};

const HelpHintsContext = createContext<HelpHintsContextValue | undefined>(undefined);

function normalizeDismissed(value: unknown): HelpHintsDismissedMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return Object.entries(value).reduce<HelpHintsDismissedMap>((acc, [hintId, raw]) => {
    if (hintId.trim() && raw === true) {
      acc[hintId] = true;
    }
    return acc;
  }, {});
}

function buildStorageKey(currentUserId?: string) {
  const suffix = currentUserId?.trim() ? currentUserId.trim() : "global";
  return makeStorageKey(`helpHintsDismissed.${suffix}`);
}

function loadDismissedByKey(storageKey: string) {
  return (
    loadJSON<HelpHintsDismissedMap>(storageKey, {
      fallback: {},
      migrate: (value) => normalizeDismissed(value)
    }) ?? {}
  );
}

export function HelpHintsProvider({ children }: { children: React.ReactNode }) {
  const { currentUserId } = useUsers();
  const activeStorageKey = useMemo(() => buildStorageKey(currentUserId), [currentUserId]);
  const [state, setState] = useState<HelpHintsState>(() => ({
    storageKey: activeStorageKey,
    dismissed: loadDismissedByKey(activeStorageKey)
  }));

  React.useEffect(() => {
    if (state.storageKey === activeStorageKey) {
      return;
    }
    setState({
      storageKey: activeStorageKey,
      dismissed: loadDismissedByKey(activeStorageKey)
    });
  }, [activeStorageKey, state.storageKey]);

  React.useEffect(() => {
    if (state.storageKey !== activeStorageKey) {
      return;
    }
    saveJSON(activeStorageKey, state.dismissed);
  }, [activeStorageKey, state.dismissed, state.storageKey]);

  const dismiss = useCallback((hintId: string) => {
    if (!hintId.trim()) {
      return;
    }
    setState((prev) => {
      if (prev.dismissed[hintId]) {
        return prev;
      }
      return {
        ...prev,
        dismissed: {
          ...prev.dismissed,
          [hintId]: true
        }
      };
    });
  }, []);

  const reset = useCallback((hintId: string) => {
    if (!hintId.trim()) {
      return;
    }
    setState((prev) => {
      if (!prev.dismissed[hintId]) {
        return prev;
      }
      const next = { ...prev.dismissed };
      delete next[hintId];
      return {
        ...prev,
        dismissed: next
      };
    });
  }, []);

  const resetAll = useCallback(() => {
    setState((prev) => {
      if (!Object.keys(prev.dismissed).length) {
        return prev;
      }
      return {
        ...prev,
        dismissed: {}
      };
    });
  }, []);

  const isDismissed = useCallback(
    (hintId: string) => Boolean(state.dismissed[hintId]),
    [state.dismissed]
  );

  const exportDismissed = useCallback(() => ({ ...state.dismissed }), [state.dismissed]);

  const value = useMemo(
    () => ({
      dismissed: state.dismissed,
      isDismissed,
      dismiss,
      resetAll,
      reset,
      exportDismissed
    }),
    [dismiss, exportDismissed, isDismissed, reset, resetAll, state.dismissed]
  );

  return <HelpHintsContext.Provider value={value}>{children}</HelpHintsContext.Provider>;
}

export function useHelpHints() {
  const context = useContext(HelpHintsContext);
  if (!context) {
    throw new Error("useHelpHints must be used within HelpHintsProvider");
  }
  return context;
}
