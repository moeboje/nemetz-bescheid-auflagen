import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import {
  archiveAdminRole,
  createAdminRole,
  listAdminRoles,
  listAdminRolesLookup,
  restoreAdminRole,
  updateAdminRole,
  type AdminRole,
  type AdminRolesQuery
} from "../api/roles";
import { useAuth } from "./AuthStore";
import {
  canApplyListRequest,
  createListRequestState,
  getOrStartListRequest,
  invalidateListRequests,
  resetListRequestState,
  type ListRequestOptions
} from "./listRequestGuard";
import { shouldAutoLoadLookupStore } from "./routeLoading";

type RolesContextValue = {
  roles: AdminRole[];
  loadRoles: (query?: AdminRolesQuery, options?: ListRequestOptions) => Promise<{ items: AdminRole[]; total: number }>;
  reloadRoles: (options?: ListRequestOptions) => Promise<AdminRole[]>;
  createRole: (input: { key: string; labelDe: string; descriptionDe?: string; permissionKeys?: string[] }) => Promise<AdminRole>;
  updateRole: (
    id: string,
    input: Partial<{
      key: string;
      labelDe: string;
      descriptionDe?: string;
      permissionKeys?: string[];
    }>
  ) => Promise<AdminRole>;
  archiveRole: (id: string) => Promise<AdminRole>;
  restoreRole: (id: string) => Promise<AdminRole>;
  getRoleByKey: (key?: string | null) => AdminRole | undefined;
  getRoleLabel: (key?: string | null) => string;
};

const RolesContext = createContext<RolesContextValue | undefined>(undefined);
const rolesLookupRequests = createListRequestState<AdminRole[]>();
const adminRolesListRequests = createListRequestState<{ items: AdminRole[]; total: number }>();

function sortRoles(rows: AdminRole[]) {
  return [...rows].sort((left, right) => left.labelDe.localeCompare(right.labelDe));
}

function getPermissionSignature(user: { effectivePermissions?: string[] } | null | undefined) {
  return Array.isArray(user?.effectivePermissions)
    ? [...user.effectivePermissions].sort().join(",")
    : "";
}

function getRolesAuthContextKey(user: { id?: string; type?: string; role?: string; effectivePermissions?: string[] } | null | undefined) {
  if (!user) {
    return "anonymous";
  }
  return [user.id ?? "", user.type ?? "", user.role ?? "", getPermissionSignature(user)].join("|");
}

function getQueryKey(query: AdminRolesQuery = {}) {
  return JSON.stringify({
    archived: query.archived ?? "",
    q: query.q?.trim() ?? ""
  });
}

export function RolesProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const shouldAutoLoadLookup = shouldAutoLoadLookupStore(location.pathname);
  const permissionKeys = Array.isArray(user?.effectivePermissions) ? user.effectivePermissions : [];
  const hasAdminAccess = permissionKeys.includes("admin.access");
  const canLookupRoles =
    hasAdminAccess &&
    (permissionKeys.includes("roles.view") ||
      permissionKeys.includes("roles.manage") ||
      permissionKeys.includes("users.view") ||
      permissionKeys.includes("users.manage"));
  const authContextKey = getRolesAuthContextKey(user);
  const latestAuthContextRef = useRef(authContextKey);
  latestAuthContextRef.current = authContextKey;

  useEffect(() => {
    resetListRequestState(rolesLookupRequests);
    resetListRequestState(adminRolesListRequests);
    setRoles([]);
  }, [authContextKey]);

  const invalidateRoleListRequests = useCallback(() => {
    invalidateListRequests(rolesLookupRequests);
    invalidateListRequests(adminRolesListRequests);
  }, []);

  const loadRoles = useCallback(async (query: AdminRolesQuery = {}, options: ListRequestOptions = {}) => {
    const requestAuthContextKey = authContextKey;
    const inFlightKey = `${requestAuthContextKey}|${getQueryKey(query)}`;
    const request = getOrStartListRequest(
      adminRolesListRequests,
      inFlightKey,
      () => listAdminRoles(query),
      options
    );

    const result = await request.promise;
    if (
      latestAuthContextRef.current !== requestAuthContextKey ||
      !canApplyListRequest(adminRolesListRequests, request)
    ) {
      return { items: [], total: 0 };
    }

    return result;
  }, [authContextKey]);

  const reloadRoles = useCallback(async (options: ListRequestOptions = {}) => {
    const requestAuthContextKey = authContextKey;

    if (!user || !canLookupRoles) {
      setRoles([]);
      return [];
    }

    if (!options.force && !shouldAutoLoadLookup) {
      return [];
    }

    const request = getOrStartListRequest(
      rolesLookupRequests,
      requestAuthContextKey,
      () => listAdminRolesLookup().then((payload) => sortRoles(payload.items)),
      options
    );

    const next = await request.promise;
    if (latestAuthContextRef.current !== requestAuthContextKey || !canApplyListRequest(rolesLookupRequests, request)) {
      return [];
    }

    setRoles(next);
    return next;
  }, [authContextKey, canLookupRoles, shouldAutoLoadLookup, user]);

  useEffect(() => {
    if (!user || !canLookupRoles || !shouldAutoLoadLookup) {
      setRoles([]);
      return;
    }

    void reloadRoles().catch(() => {
      setRoles([]);
    });
  }, [canLookupRoles, reloadRoles, shouldAutoLoadLookup, user]);

  const createRoleEntry = useCallback(
    async (input: { key: string; labelDe: string; descriptionDe?: string; permissionKeys?: string[] }) => {
      const created = await createAdminRole(input);
      invalidateRoleListRequests();
      setRoles((prev) => sortRoles([created, ...prev.filter((row) => row.id !== created.id)]));
      return created;
    },
    [invalidateRoleListRequests]
  );

  const updateRoleEntry = useCallback(
    async (
      id: string,
      input: Partial<{
        key: string;
        labelDe: string;
        descriptionDe?: string;
        permissionKeys?: string[];
      }>
    ) => {
      const updated = await updateAdminRole(id, input);
      invalidateRoleListRequests();
      setRoles((prev) => sortRoles([updated, ...prev.filter((row) => row.id !== updated.id)]));
      return updated;
    },
    [invalidateRoleListRequests]
  );

  const archiveRoleEntry = useCallback(
    async (id: string) => {
      const updated = await archiveAdminRole(id);
      invalidateRoleListRequests();
      setRoles((prev) => sortRoles([updated, ...prev.filter((row) => row.id !== updated.id)]));
      return updated;
    },
    [invalidateRoleListRequests]
  );

  const restoreRoleEntry = useCallback(
    async (id: string) => {
      const updated = await restoreAdminRole(id);
      invalidateRoleListRequests();
      setRoles((prev) => sortRoles([updated, ...prev.filter((row) => row.id !== updated.id)]));
      return updated;
    },
    [invalidateRoleListRequests]
  );

  const getRoleByKey = useCallback(
    (key?: string | null) => {
      if (!key) {
        return undefined;
      }
      return roles.find((row) => row.key === key);
    },
    [roles]
  );

  const getRoleLabel = useCallback(
    (key?: string | null) => {
      const role = getRoleByKey(key);
      if (!role) {
        return key ?? "";
      }
      return role.labelDe;
    },
    [getRoleByKey]
  );

  const value = useMemo<RolesContextValue>(
    () => ({
      roles,
      loadRoles,
      reloadRoles,
      createRole: createRoleEntry,
      updateRole: updateRoleEntry,
      archiveRole: archiveRoleEntry,
      restoreRole: restoreRoleEntry,
      getRoleByKey,
      getRoleLabel
    }),
    [archiveRoleEntry, createRoleEntry, getRoleByKey, getRoleLabel, loadRoles, reloadRoles, restoreRoleEntry, roles, updateRoleEntry]
  );

  return <RolesContext.Provider value={value}>{children}</RolesContext.Provider>;
}

export function useRoles() {
  const context = useContext(RolesContext);
  if (!context) {
    throw new Error("useRoles must be used within RolesProvider");
  }
  return context;
}

export type { AdminRole, AdminRolesQuery };
