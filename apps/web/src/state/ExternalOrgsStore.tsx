import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
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
import {
  canApplyListRequest,
  createListRequestState,
  getOrStartListRequest,
  invalidateListRequests,
  resetListRequestState,
  type ListRequestOptions
} from "./listRequestGuard";

type ExternalOrgsContextValue = {
  externalOrgs: ExternalOrganization[];
  loadExternalOrgs: (
    query?: ExternalOrganizationsQuery,
    options?: ListRequestOptions
  ) => Promise<{ items: ExternalOrganization[]; total: number }>;
  reloadExternalOrgs: (options?: ListRequestOptions) => Promise<ExternalOrganization[]>;
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
const externalOrgsLookupRequests = createListRequestState<ExternalOrganization[]>();
const externalOrgsListRequests = createListRequestState<{ items: ExternalOrganization[]; total: number }>();

export {
  canUserLookupExternalOrgs,
  shouldAutoLoadExternalOrgsLookup,
  type ExternalOrgsLookupUser
} from "./externalOrgsLookupGuards";

function sortExternalOrgs(rows: ExternalOrganization[]) {
  return [...rows].sort((left, right) => left.name.localeCompare(right.name));
}

function getPermissionSignature(user: { effectivePermissions?: string[] } | null | undefined) {
  return Array.isArray(user?.effectivePermissions)
    ? [...user.effectivePermissions].sort().join(",")
    : "";
}

function getExternalOrgsAuthContextKey(user: { id?: string; type?: string; role?: string; effectivePermissions?: string[] } | null | undefined) {
  if (!user) {
    return "anonymous";
  }
  return [user.id ?? "", user.type ?? "", user.role ?? "", getPermissionSignature(user)].join("|");
}

function getQueryKey(query: ExternalOrganizationsQuery = {}) {
  return JSON.stringify({
    archived: query.archived ?? "",
    q: query.q?.trim() ?? ""
  });
}

export function ExternalOrgsProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  const [externalOrgs, setExternalOrgs] = useState<ExternalOrganization[]>([]);
  const shouldAutoLoadLookup = shouldAutoLoadExternalOrgsLookup(location.pathname);
  const canLookupExternalOrgs = canUserLookupExternalOrgs(user);
  const authContextKey = getExternalOrgsAuthContextKey(user);
  const latestAuthContextRef = useRef(authContextKey);
  latestAuthContextRef.current = authContextKey;

  const loadExternalOrgs = useCallback(async (
    query: ExternalOrganizationsQuery = {},
    options: ListRequestOptions = {}
  ) => {
    const requestAuthContextKey = authContextKey;
    const inFlightKey = `${requestAuthContextKey}|${getQueryKey(query)}`;
    const request = getOrStartListRequest(
      externalOrgsListRequests,
      inFlightKey,
      () => listExternalOrganizations(query),
      options
    );

    const result = await request.promise;
    if (
      latestAuthContextRef.current !== requestAuthContextKey ||
      !canApplyListRequest(externalOrgsListRequests, request)
    ) {
      return { items: [], total: 0 };
    }

    return result;
  }, [authContextKey]);

  useEffect(() => {
    resetListRequestState(externalOrgsLookupRequests);
    resetListRequestState(externalOrgsListRequests);
    setExternalOrgs([]);
  }, [authContextKey]);

  const invalidateExternalOrgListRequests = useCallback(() => {
    invalidateListRequests(externalOrgsLookupRequests);
    invalidateListRequests(externalOrgsListRequests);
  }, []);

  const reloadExternalOrgs = useCallback(async (options: ListRequestOptions = {}) => {
    const requestAuthContextKey = authContextKey;

    if (!user || !canLookupExternalOrgs) {
      setExternalOrgs([]);
      return [];
    }

    const request = getOrStartListRequest(
      externalOrgsLookupRequests,
      requestAuthContextKey,
      () => listExternalOrganizationsLookup().then((payload) => sortExternalOrgs(payload.items)),
      options
    );

    const next = await request.promise;
    if (
      latestAuthContextRef.current !== requestAuthContextKey ||
      !canApplyListRequest(externalOrgsLookupRequests, request)
    ) {
      return [];
    }

    setExternalOrgs(next);
    return next;
  }, [authContextKey, canLookupExternalOrgs, user]);

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
      invalidateExternalOrgListRequests();
      if (!created.isArchived) {
        setExternalOrgs((prev) => sortExternalOrgs([created, ...prev.filter((row) => row.id !== created.id)]));
      }
      return created;
    },
    [invalidateExternalOrgListRequests]
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
      invalidateExternalOrgListRequests();
      setExternalOrgs((prev) =>
        updated.isArchived
          ? prev.filter((row) => row.id !== updated.id)
          : sortExternalOrgs([updated, ...prev.filter((row) => row.id !== updated.id)])
      );
      return updated;
    },
    [invalidateExternalOrgListRequests]
  );

  const archiveExternalOrgEntry = useCallback(
    async (id: string) => {
      const updated = await archiveExternalOrganization(id);
      invalidateExternalOrgListRequests();
      setExternalOrgs((prev) => prev.filter((row) => row.id !== updated.id));
      return updated;
    },
    [invalidateExternalOrgListRequests]
  );

  const restoreExternalOrgEntry = useCallback(
    async (id: string) => {
      const updated = await restoreExternalOrganization(id);
      invalidateExternalOrgListRequests();
      setExternalOrgs((prev) => sortExternalOrgs([updated, ...prev.filter((row) => row.id !== updated.id)]));
      return updated;
    },
    [invalidateExternalOrgListRequests]
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
