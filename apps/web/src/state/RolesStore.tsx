import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
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

type RolesContextValue = {
  roles: AdminRole[];
  loadRoles: (query?: AdminRolesQuery) => Promise<{ items: AdminRole[]; total: number }>;
  reloadRoles: () => Promise<AdminRole[]>;
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

function sortRoles(rows: AdminRole[]) {
  return [...rows].sort((left, right) => left.labelDe.localeCompare(right.labelDe));
}

export function RolesProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [roles, setRoles] = useState<AdminRole[]>([]);
  const permissionKeys = Array.isArray(user?.effectivePermissions) ? user.effectivePermissions : [];
  const hasAdminAccess = permissionKeys.includes("admin.access");
  const canLookupRoles =
    hasAdminAccess &&
    (permissionKeys.includes("roles.view") ||
      permissionKeys.includes("roles.manage") ||
      permissionKeys.includes("users.view") ||
      permissionKeys.includes("users.manage"));

  const loadRoles = useCallback(async (query: AdminRolesQuery = {}) => {
    return listAdminRoles(query);
  }, []);

  const reloadRoles = useCallback(async () => {
    if (!user || !canLookupRoles) {
      setRoles([]);
      return [];
    }

    const payload = await listAdminRolesLookup();
    const next = sortRoles(payload.items);
    setRoles(next);
    return next;
  }, [canLookupRoles, user]);

  useEffect(() => {
    if (!user || !canLookupRoles) {
      setRoles([]);
      return;
    }

    void reloadRoles().catch(() => {
      setRoles([]);
    });
  }, [canLookupRoles, reloadRoles, user]);

  const createRoleEntry = useCallback(
    async (input: { key: string; labelDe: string; descriptionDe?: string; permissionKeys?: string[] }) => {
      const created = await createAdminRole(input);
      await reloadRoles();
      return created;
    },
    [reloadRoles]
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
      await reloadRoles();
      return updated;
    },
    [reloadRoles]
  );

  const archiveRoleEntry = useCallback(
    async (id: string) => {
      const updated = await archiveAdminRole(id);
      await reloadRoles();
      return updated;
    },
    [reloadRoles]
  );

  const restoreRoleEntry = useCallback(
    async (id: string) => {
      const updated = await restoreAdminRole(id);
      await reloadRoles();
      return updated;
    },
    [reloadRoles]
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
