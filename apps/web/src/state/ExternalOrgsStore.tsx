import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  archiveExternalOrganization,
  createExternalOrganization,
  listExternalOrganizations,
  listExternalOrganizationsLookup,
  restoreExternalOrganization,
  updateExternalOrganization,
  type ExternalOrganization,
  type ExternalOrganizationsQuery
} from "../api/externalOrgs";
import { useAuth } from "./AuthStore";
import {
  canUserLookupExternalOrgs,
  shouldAutoLoadExternalOrgsLookup
} from "./externalOrgsLookupGuards";

type ExternalOrgsContextValue = {
  externalOrgs: ExternalOrganization[];
  loadExternalOrgs: (query?: ExternalOrganizationsQuery) => Promise<{ items: ExternalOrganization[]; total: number }>;
  reloadExternalOrgs: () => Promise<ExternalOrganization[]>;
  createExternalOrg: (
    input: {
      name: string;
      type?: string;
      phone?: string;
      email?: string;
      address?: string;
    }
  ) => Promise<ExternalOrganization>;
  updateExternalOrg: (
    id: string,
    input: Partial<{
      name: string;
      type?: string;
      phone?: string;
      email?: string;
      address?: string;
    }>
  ) => Promise<ExternalOrganization>;
  archiveExternalOrg: (id: string) => Promise<ExternalOrganization>;
  restoreExternalOrg: (id: string) => Promise<ExternalOrganization>;
  getExternalOrgById: (id?: string | null) => ExternalOrganization | undefined;
};

const ExternalOrgsContext = createContext<ExternalOrgsContextValue | undefined>(undefined);
let externalOrgsLookupInFlight: Promise<ExternalOrganization[]> | null = null;

export {
  canUserLookupExternalOrgs,
  shouldAutoLoadExternalOrgsLookup,
  type ExternalOrgsLookupUser
} from "./externalOrgsLookupGuards";

function sortExternalOrgs(rows: ExternalOrganization[]) {
  return [...rows].sort((left, right) => left.name.localeCompare(right.name));
}

export function ExternalOrgsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  const [externalOrgs, setExternalOrgs] = useState<ExternalOrganization[]>([]);
  const shouldAutoLoadLookup = shouldAutoLoadExternalOrgsLookup(location.pathname);
  const canLookupExternalOrgs = canUserLookupExternalOrgs(user);

  const loadExternalOrgs = useCallback(async (query: ExternalOrganizationsQuery = {}) => {
    return listExternalOrganizations(query);
  }, []);

  const reloadExternalOrgs = useCallback(async () => {
    if (!user || !canLookupExternalOrgs) {
      setExternalOrgs([]);
      return [];
    }

    if (!externalOrgsLookupInFlight) {
      externalOrgsLookupInFlight = listExternalOrganizationsLookup()
        .then((payload) => sortExternalOrgs(payload.items))
        .finally(() => {
          externalOrgsLookupInFlight = null;
        });
    }

    const next = await externalOrgsLookupInFlight;
    setExternalOrgs(next);
    return next;
  }, [canLookupExternalOrgs, user]);

  useEffect(() => {
    if (!user || !canLookupExternalOrgs) {
      setExternalOrgs([]);
      return;
    }

    if (!shouldAutoLoadLookup) {
      return;
    }

    void reloadExternalOrgs().catch(() => {
      setExternalOrgs([]);
    });
  }, [canLookupExternalOrgs, reloadExternalOrgs, shouldAutoLoadLookup, user]);

  const createExternalOrgEntry = useCallback(
    async (input: {
      name: string;
      type?: string;
      phone?: string;
      email?: string;
      address?: string;
    }) => {
      const created = await createExternalOrganization(input);
      if (!created.isArchived) {
        setExternalOrgs((prev) => sortExternalOrgs([created, ...prev.filter((row) => row.id !== created.id)]));
      }
      return created;
    },
    []
  );

  const updateExternalOrgEntry = useCallback(
    async (
      id: string,
      input: Partial<{
        name: string;
        type?: string;
        phone?: string;
        email?: string;
        address?: string;
      }>
    ) => {
      const updated = await updateExternalOrganization(id, input);
      setExternalOrgs((prev) =>
        updated.isArchived
          ? prev.filter((row) => row.id !== updated.id)
          : sortExternalOrgs([updated, ...prev.filter((row) => row.id !== updated.id)])
      );
      return updated;
    },
    []
  );

  const archiveExternalOrgEntry = useCallback(
    async (id: string) => {
      const updated = await archiveExternalOrganization(id);
      setExternalOrgs((prev) => prev.filter((row) => row.id !== updated.id));
      return updated;
    },
    []
  );

  const restoreExternalOrgEntry = useCallback(
    async (id: string) => {
      const updated = await restoreExternalOrganization(id);
      setExternalOrgs((prev) => sortExternalOrgs([updated, ...prev.filter((row) => row.id !== updated.id)]));
      return updated;
    },
    []
  );

  const getExternalOrgById = useCallback(
    (id?: string | null) => {
      if (!id) {
        return undefined;
      }
      return externalOrgs.find((row) => row.id === id);
    },
    [externalOrgs]
  );

  const value = useMemo<ExternalOrgsContextValue>(
    () => ({
      externalOrgs,
      loadExternalOrgs,
      reloadExternalOrgs,
      createExternalOrg: createExternalOrgEntry,
      updateExternalOrg: updateExternalOrgEntry,
      archiveExternalOrg: archiveExternalOrgEntry,
      restoreExternalOrg: restoreExternalOrgEntry,
      getExternalOrgById
    }),
    [
      archiveExternalOrgEntry,
      createExternalOrgEntry,
      externalOrgs,
      getExternalOrgById,
      loadExternalOrgs,
      reloadExternalOrgs,
      restoreExternalOrgEntry,
      updateExternalOrgEntry
    ]
  );

  return <ExternalOrgsContext.Provider value={value}>{children}</ExternalOrgsContext.Provider>;
}

export function useExternalOrgs() {
  const context = useContext(ExternalOrgsContext);
  if (!context) {
    throw new Error("useExternalOrgs must be used within ExternalOrgsProvider");
  }
  return context;
}

export type { ExternalOrganization, ExternalOrganizationsQuery };
