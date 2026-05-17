import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  bulkReplaceProcedureMasterData as apiBulkReplaceProcedureMasterData,
  createLegalMatter as apiCreateLegalMatter,
  createProcedureType as apiCreateProcedureType,
  createSubmissionType as apiCreateSubmissionType,
  deactivateLegalMatter as apiDeactivateLegalMatter,
  deactivateProcedureType as apiDeactivateProcedureType,
  deactivateSubmissionType as apiDeactivateSubmissionType,
  listAdminProcedureMasterData,
  listProcedureMasterData,
  reactivateLegalMatter as apiReactivateLegalMatter,
  reactivateProcedureType as apiReactivateProcedureType,
  reactivateSubmissionType as apiReactivateSubmissionType,
  updateLegalMatter as apiUpdateLegalMatter,
  updateProcedureType as apiUpdateProcedureType,
  updateSubmissionType as apiUpdateSubmissionType,
  type ProcedureMasterDataImportResult
} from "../api/procedureMasterData";
import type {
  LegalMatter,
  ProcedureMasterDataSnapshot,
  ProcedureType,
  SubmissionType
} from "../data/procedureMasterData";
import { useAuth } from "./AuthStore";
import { shouldAutoLoadDomainStore } from "./routeLoading";

type LegalMatterInput = {
  id?: string;
  code?: string;
  name: string;
  shortName?: string;
  description?: string;
  isActive?: boolean;
  sortOrder?: number;
  badgeVariant?: string;
};

type ProcedureTypeInput = {
  id?: string;
  code?: string;
  name: string;
  shortName?: string;
  description?: string;
  isActive?: boolean;
  sortOrder?: number;
};

type SubmissionTypeInput = {
  id?: string;
  code?: string;
  name: string;
  shortName?: string;
  description?: string;
  legalMatterId: string;
  procedureTypeId: string;
  isActive?: boolean;
  isLegacy?: boolean;
  sortOrder?: number;
  badgeVariant?: string;
  legacyAliases?: string[];
};

type ProcedureMasterDataContextValue = ProcedureMasterDataSnapshot & {
  hasLoadedProcedureMasterData: boolean;
  isProcedureMasterDataLoading: boolean;
  reloadProcedureMasterData: () => Promise<ProcedureMasterDataSnapshot>;
  reloadAdminProcedureMasterData: () => Promise<ProcedureMasterDataSnapshot>;
  replaceProcedureMasterData: (input: ProcedureMasterDataSnapshot) => Promise<ProcedureMasterDataImportResult>;
  createLegalMatter: (input: LegalMatterInput) => Promise<LegalMatter>;
  updateLegalMatter: (id: string, input: Partial<LegalMatterInput>) => Promise<LegalMatter | null>;
  deactivateLegalMatter: (id: string) => Promise<LegalMatter | null>;
  reactivateLegalMatter: (id: string) => Promise<LegalMatter | null>;
  createProcedureType: (input: ProcedureTypeInput) => Promise<ProcedureType>;
  updateProcedureType: (id: string, input: Partial<ProcedureTypeInput>) => Promise<ProcedureType | null>;
  deactivateProcedureType: (id: string) => Promise<ProcedureType | null>;
  reactivateProcedureType: (id: string) => Promise<ProcedureType | null>;
  createSubmissionType: (input: SubmissionTypeInput) => Promise<SubmissionType>;
  updateSubmissionType: (id: string, input: Partial<SubmissionTypeInput>) => Promise<SubmissionType | null>;
  deactivateSubmissionType: (id: string) => Promise<SubmissionType | null>;
  reactivateSubmissionType: (id: string) => Promise<SubmissionType | null>;
  getSubmissionType: (id?: string) => SubmissionType | undefined;
};

const emptySnapshot: ProcedureMasterDataSnapshot = {
  legalMatters: [],
  procedureTypes: [],
  submissionTypes: []
};

const ProcedureMasterDataContext = createContext<ProcedureMasterDataContextValue | undefined>(undefined);

function normalizeText(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function sortByOrderAndName<T extends { sortOrder: number; name: string; id: string }>(items: T[]) {
  return [...items].sort(
    (left, right) =>
      left.sortOrder - right.sortOrder ||
      left.name.localeCompare(right.name, "de-AT") ||
      left.id.localeCompare(right.id)
  );
}

function normalizeSnapshot(snapshot: ProcedureMasterDataSnapshot): ProcedureMasterDataSnapshot {
  return {
    legalMatters: sortByOrderAndName(snapshot.legalMatters ?? []),
    procedureTypes: sortByOrderAndName(snapshot.procedureTypes ?? []),
    submissionTypes: sortByOrderAndName(snapshot.submissionTypes ?? [])
  };
}

function mergeById<T extends { id: string }>(items: T[], incoming: T) {
  return items.some((item) => item.id === incoming.id)
    ? items.map((item) => (item.id === incoming.id ? { ...item, ...incoming } : item))
    : [...items, incoming];
}

export function ProcedureMasterDataProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  const shouldAutoLoad = shouldAutoLoadDomainStore(location.pathname);
  const [snapshot, setSnapshot] = useState<ProcedureMasterDataSnapshot>(emptySnapshot);
  const [hasLoadedProcedureMasterData, setHasLoadedProcedureMasterData] = useState(false);
  const [isProcedureMasterDataLoading, setIsProcedureMasterDataLoading] = useState(false);

  const reloadProcedureMasterData = useCallback(async () => {
    if (!user || user.type === "EXTERNAL") {
      setSnapshot(emptySnapshot);
      setHasLoadedProcedureMasterData(false);
      return emptySnapshot;
    }
    setIsProcedureMasterDataLoading(true);
    try {
      const next = normalizeSnapshot(await listProcedureMasterData());
      setSnapshot(next);
      setHasLoadedProcedureMasterData(true);
      return next;
    } finally {
      setIsProcedureMasterDataLoading(false);
    }
  }, [user]);

  const reloadAdminProcedureMasterData = useCallback(async () => {
    if (!user || user.type === "EXTERNAL") {
      setSnapshot(emptySnapshot);
      setHasLoadedProcedureMasterData(false);
      return emptySnapshot;
    }
    setIsProcedureMasterDataLoading(true);
    try {
      const next = normalizeSnapshot(await listAdminProcedureMasterData());
      setSnapshot(next);
      setHasLoadedProcedureMasterData(true);
      return next;
    } finally {
      setIsProcedureMasterDataLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user || user.type === "EXTERNAL") {
      setSnapshot(emptySnapshot);
      setHasLoadedProcedureMasterData(false);
      return;
    }
    if (!shouldAutoLoad) {
      return;
    }
    void reloadProcedureMasterData().catch(() => setSnapshot(emptySnapshot));
  }, [reloadProcedureMasterData, shouldAutoLoad, user]);

  const value = useMemo<ProcedureMasterDataContextValue>(() => {
    const setLegalMatter = (legalMatter: LegalMatter) => {
      setSnapshot((prev) =>
        normalizeSnapshot({
          ...prev,
          legalMatters: mergeById(prev.legalMatters, legalMatter)
        })
      );
      return legalMatter;
    };
    const setProcedureType = (procedureType: ProcedureType) => {
      setSnapshot((prev) =>
        normalizeSnapshot({
          ...prev,
          procedureTypes: mergeById(prev.procedureTypes, procedureType)
        })
      );
      return procedureType;
    };
    const setSubmissionType = (submissionType: SubmissionType) => {
      setSnapshot((prev) =>
        normalizeSnapshot({
          ...prev,
          submissionTypes: mergeById(prev.submissionTypes, submissionType)
        })
      );
      return submissionType;
    };

    return {
      ...snapshot,
      hasLoadedProcedureMasterData,
      isProcedureMasterDataLoading,
      reloadProcedureMasterData,
      reloadAdminProcedureMasterData,
      replaceProcedureMasterData: async (input) => {
        const result = await apiBulkReplaceProcedureMasterData(input);
        const next = normalizeSnapshot(result);
        setSnapshot(next);
        return {
          ...next,
          idMapping: result.idMapping
        };
      },
      createLegalMatter: async (input) =>
        setLegalMatter(
          await apiCreateLegalMatter({
            ...input,
            name: input.name.trim(),
            code: normalizeText(input.code),
            shortName: normalizeText(input.shortName),
            description: normalizeText(input.description)
          })
        ),
      updateLegalMatter: async (id, input) => {
        if (!snapshot.legalMatters.some((item) => item.id === id)) {
          return null;
        }
        return setLegalMatter(
          await apiUpdateLegalMatter(id, {
            ...input,
            code: normalizeText(input.code),
            name: input.name?.trim(),
            shortName: normalizeText(input.shortName),
            description: normalizeText(input.description)
          })
        );
      },
      deactivateLegalMatter: async (id) => {
        if (!snapshot.legalMatters.some((item) => item.id === id)) {
          return null;
        }
        return setLegalMatter(await apiDeactivateLegalMatter(id));
      },
      reactivateLegalMatter: async (id) => {
        if (!snapshot.legalMatters.some((item) => item.id === id)) {
          return null;
        }
        return setLegalMatter(await apiReactivateLegalMatter(id));
      },
      createProcedureType: async (input) =>
        setProcedureType(
          await apiCreateProcedureType({
            ...input,
            name: input.name.trim(),
            code: normalizeText(input.code),
            shortName: normalizeText(input.shortName),
            description: normalizeText(input.description)
          })
        ),
      updateProcedureType: async (id, input) => {
        if (!snapshot.procedureTypes.some((item) => item.id === id)) {
          return null;
        }
        return setProcedureType(
          await apiUpdateProcedureType(id, {
            ...input,
            code: normalizeText(input.code),
            name: input.name?.trim(),
            shortName: normalizeText(input.shortName),
            description: normalizeText(input.description)
          })
        );
      },
      deactivateProcedureType: async (id) => {
        if (!snapshot.procedureTypes.some((item) => item.id === id)) {
          return null;
        }
        return setProcedureType(await apiDeactivateProcedureType(id));
      },
      reactivateProcedureType: async (id) => {
        if (!snapshot.procedureTypes.some((item) => item.id === id)) {
          return null;
        }
        return setProcedureType(await apiReactivateProcedureType(id));
      },
      createSubmissionType: async (input) =>
        setSubmissionType(
          await apiCreateSubmissionType({
            ...input,
            name: input.name.trim(),
            code: normalizeText(input.code),
            shortName: normalizeText(input.shortName),
            description: normalizeText(input.description)
          })
        ),
      updateSubmissionType: async (id, input) => {
        if (!snapshot.submissionTypes.some((item) => item.id === id)) {
          return null;
        }
        return setSubmissionType(
          await apiUpdateSubmissionType(id, {
            ...input,
            code: normalizeText(input.code),
            name: input.name?.trim(),
            shortName: normalizeText(input.shortName),
            description: normalizeText(input.description)
          })
        );
      },
      deactivateSubmissionType: async (id) => {
        if (!snapshot.submissionTypes.some((item) => item.id === id)) {
          return null;
        }
        return setSubmissionType(await apiDeactivateSubmissionType(id));
      },
      reactivateSubmissionType: async (id) => {
        if (!snapshot.submissionTypes.some((item) => item.id === id)) {
          return null;
        }
        return setSubmissionType(await apiReactivateSubmissionType(id));
      },
      getSubmissionType: (id?: string) =>
        id ? snapshot.submissionTypes.find((submissionType) => submissionType.id === id) : undefined
    };
  }, [
    hasLoadedProcedureMasterData,
    isProcedureMasterDataLoading,
    reloadAdminProcedureMasterData,
    reloadProcedureMasterData,
    snapshot
  ]);

  return (
    <ProcedureMasterDataContext.Provider value={value}>
      {children}
    </ProcedureMasterDataContext.Provider>
  );
}

export function useProcedureMasterData() {
  const context = useContext(ProcedureMasterDataContext);
  if (!context) {
    throw new Error("useProcedureMasterData must be used within ProcedureMasterDataProvider");
  }
  return context;
}
