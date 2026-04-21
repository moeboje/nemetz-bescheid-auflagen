import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
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

type ExternalOrgsContextValue = {
  externalOrgs: ExternalOrganization[];
  loadExternalOrgs: (query?: ExternalOrganizationsQuery) => Promise<{ items: ExternalOrganization[]; total: number }>;
  reloadExternalOrgs: () => Promise<ExternalOrganization[]>;
  createExternalOrg: (
    input: {
      name: string;
      type: string;
      phone?: string;
      email?: string;
      address?: string;
    }
  ) => Promise<ExternalOrganization>;
  updateExternalOrg: (
    id: string,
    input: Partial<{
      name: string;
      type: string;
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

function sortExternalOrgs(rows: ExternalOrganization[]) {
  return [...rows].sort((left, right) => left.name.localeCompare(right.name));
}

export function ExternalOrgsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [externalOrgs, setExternalOrgs] = useState<ExternalOrganization[]>([]);
  const permissionKeys = Array.isArray(user?.effectivePermissions) ? user.effectivePermissions : [];
  const hasAdminAccess = permissionKeys.includes("admin.access");
  const canLookupExternalOrgs =
    hasAdminAccess &&
    (permissionKeys.includes("externalOrgs.view") ||
      permissionKeys.includes("externalOrgs.manage") ||
      permissionKeys.includes("users.manage"));

  const loadExternalOrgs = useCallback(async (query: ExternalOrganizationsQuery = {}) => {
    return listExternalOrganizations(query);
  }, []);

  const reloadExternalOrgs = useCallback(async () => {
    if (!user || !canLookupExternalOrgs) {
      setExternalOrgs([]);
      return [];
    }

    const payload = await listExternalOrganizationsLookup();
    const next = sortExternalOrgs(payload.items);
    setExternalOrgs(next);
    return next;
  }, [canLookupExternalOrgs, user]);

  useEffect(() => {
    if (!user || !canLookupExternalOrgs) {
      setExternalOrgs([]);
      return;
    }

    void reloadExternalOrgs().catch(() => {
      setExternalOrgs([]);
    });
  }, [canLookupExternalOrgs, reloadExternalOrgs, user]);

  const createExternalOrgEntry = useCallback(
    async (input: {
      name: string;
      type: string;
      phone?: string;
      email?: string;
      address?: string;
    }) => {
      const created = await createExternalOrganization(input);
      await reloadExternalOrgs();
      return created;
    },
    [reloadExternalOrgs]
  );

  const updateExternalOrgEntry = useCallback(
    async (
      id: string,
      input: Partial<{
        name: string;
        type: string;
        phone?: string;
        email?: string;
        address?: string;
      }>
    ) => {
      const updated = await updateExternalOrganization(id, input);
      await reloadExternalOrgs();
      return updated;
    },
    [reloadExternalOrgs]
  );

  const archiveExternalOrgEntry = useCallback(
    async (id: string) => {
      const updated = await archiveExternalOrganization(id);
      await reloadExternalOrgs();
      return updated;
    },
    [reloadExternalOrgs]
  );

  const restoreExternalOrgEntry = useCallback(
    async (id: string) => {
      const updated = await restoreExternalOrganization(id);
      await reloadExternalOrgs();
      return updated;
    },
    [reloadExternalOrgs]
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
