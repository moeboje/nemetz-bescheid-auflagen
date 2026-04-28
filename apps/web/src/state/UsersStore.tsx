import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { t } from "../i18n";
import { getUserDisplayName, type User, type UserRole, type UserType } from "../data/users";
import {
  archiveUser as apiArchiveUser,
  createUser as apiCreateUser,
  listAdminUsers as apiListAdminUsers,
  listUserLookup,
  listUsers,
  requestUserPasswordReset,
  resetUserMfa as apiResetUserMfa,
  setUserMfaEnforced as apiSetUserMfaEnforced,
  restoreUser as apiRestoreUser,
  unlockUser as apiUnlockUser,
  updateUser as apiUpdateUser,
  type AdminUsersListResult,
  type AdminUsersQuery,
  type UserPasswordResetInput,
  type UserPasswordResetResult
} from "../api/users";
import { useAuth } from "./AuthStore";

type UserSelectionFilter = {
  includeExternal?: boolean;
  includeInternal?: boolean;
};

type UserSearchFilter = UserSelectionFilter & {
  includeArchived?: boolean;
  role?: UserRole | "ALL";
  type?: UserType | "ALL";
};

type UserCreateInput = {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  role?: UserRole;
  type?: UserType;
  titleOrPosition?: string;
  department?: string;
  externalCompany?: string;
  externalOrgId?: string;
  notes?: string;
  companyRole?: string;
  isExternal?: boolean;
  initialPassword?: string;
  mustChangePassword?: boolean;
  passwordMode?: "link" | "manual" | "auto";
};

type UserUpdatePatch = Partial<UserCreateInput>;

export type UsersContextValue = {
  users: User[];
  currentUserId: string;
  currentUser: User | undefined;
  setCurrentUserId: (userId: string) => void;
  addUser: (input: UserCreateInput) => Promise<{
    user: User;
    resetLink?: string;
    temporaryPassword?: string;
    notificationStatus?: "SENT" | "FAILED";
    notificationError?: string;
  }>;
  updateUser: (id: string, patch: UserUpdatePatch) => Promise<User | null>;
  archiveUser: (id: string) => Promise<User | null>;
  restoreUser: (id: string) => Promise<User | null>;
  unlockUser: (id: string) => Promise<User | null>;
  setMfaEnforced: (id: string, enforced: boolean) => Promise<User | null>;
  resetMfa: (id: string) => Promise<User | null>;
  requestReset: (id: string, input?: UserPasswordResetInput) => Promise<UserPasswordResetResult>;
  loadAdminUsers: (query?: AdminUsersQuery) => Promise<AdminUsersListResult>;
  getUser: (userId?: string | null) => User | undefined;
  getDisplayName: (userId?: string | null) => string;
  listActiveUsers: (filters?: UserSelectionFilter) => User[];
  searchUsers: (query: string, filters?: UserSearchFilter) => User[];
  replaceUsers: (value: User[]) => void;
  resetUsers: () => void;
  reloadUsers: () => Promise<User[]>;
  getUserById: (userId?: string) => User | undefined;
  getUserLabel: (userId?: string) => string;
};

const UsersContext = createContext<UsersContextValue | undefined>(undefined);

function sortUsers(rows: User[]) {
  return [...rows].sort((a, b) => getUserDisplayName(a).localeCompare(getUserDisplayName(b)));
}

function normalizeType(input: UserCreateInput | UserUpdatePatch, role: UserRole): UserType {
  if (input.type === "INTERNAL" || input.type === "EXTERNAL") {
    return input.type;
  }
  if (typeof input.isExternal === "boolean") {
    return input.isExternal ? "EXTERNAL" : "INTERNAL";
  }
  if (role === "EXTERNAL") {
    return "EXTERNAL";
  }
  return "INTERNAL";
}

function normalizeRole(input: UserCreateInput | UserUpdatePatch): UserRole {
  if (typeof input.role === "string" && input.role.trim()) {
    return input.role
      .trim()
      .toUpperCase()
      .replace(/[\s-]+/g, "_");
  }
  if (input.type === "EXTERNAL" || input.isExternal) {
    return "EXTERNAL";
  }
  return "COMPLIANCE_EDITOR";
}

function matchesType(user: User, filters?: UserSelectionFilter) {
  const includeExternal = filters?.includeExternal ?? true;
  const includeInternal = filters?.includeInternal ?? true;

  if (user.type === "EXTERNAL" && !includeExternal) {
    return false;
  }
  if (user.type === "INTERNAL" && !includeInternal) {
    return false;
  }

  return true;
}

function mergeUser(existing: User, incoming: User) {
  return {
    ...existing,
    ...incoming,
    companyRole: incoming.companyRole || existing.companyRole
  };
}

function hasAnyPermission(permissionKeys: string[], keys: string[]) {
  return keys.some((key) => permissionKeys.includes(key));
}

function canUseUserLookup(authUser: User) {
  if (authUser.type === "EXTERNAL") {
    return false;
  }

  const permissionKeys = Array.isArray(authUser.effectivePermissions) ? authUser.effectivePermissions : [];
  return hasAnyPermission(permissionKeys, [
    "users.view",
    "users.manage",
    "projects.create",
    "projects.edit",
    "obligations.create",
    "obligations.edit",
    "deadlines.create",
    "deadlines.edit",
    "tasks.edit",
    "tasks.complete"
  ]);
}

export function UsersProvider({ children }: { children: React.ReactNode }) {
  const { user: authUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);

  const reloadUsers = useCallback(async () => {
    if (!authUser) {
      setUsers([]);
      return [];
    }

    if (!canUseUserLookup(authUser)) {
      const fallbackUsers = sortUsers([authUser]);
      setUsers(fallbackUsers);
      return fallbackUsers;
    }

    const permissionKeys = Array.isArray(authUser.effectivePermissions) ? authUser.effectivePermissions : [];
    const canManageUsers = permissionKeys.includes("admin.access") && permissionKeys.includes("users.manage");

    const nextUsers = canManageUsers
      ? await listUsers({ includeArchived: true })
      : await listUserLookup({ includeArchived: true });

    const sorted = sortUsers(nextUsers);
    setUsers(sorted);
    return sorted;
  }, [authUser]);

  useEffect(() => {
    if (!authUser) {
      setUsers([]);
      return;
    }

    void reloadUsers().catch(() => {
      setUsers(sortUsers([authUser]));
    });
  }, [authUser, reloadUsers]);

  const getUser = useCallback(
    (userId?: string | null) => {
      if (!userId) {
        return undefined;
      }

      return users.find((user) => user.id === userId);
    },
    [users]
  );

  const getDisplayName = useCallback(
    (userId?: string | null) => {
      const user = getUser(userId);
      if (!user) {
        return t("users.unknown");
      }
      return getUserDisplayName(user);
    },
    [getUser]
  );

  const getUserLabel = useCallback(
    (userId?: string) => {
      if (!userId) {
        return "";
      }
      const user = getUser(userId);
      if (!user) {
        return t("users.unknown");
      }
      if (user.isArchived) {
        return `${getUserDisplayName(user)} (${t("users.archived")})`;
      }
      return getUserDisplayName(user);
    },
    [getUser]
  );

  const setCurrentUserId = useCallback((_userId: string) => {
    // Legacy compatibility: explicit user switching is disabled with real auth sessions.
  }, []);

  const currentUserId = authUser?.id ?? "";

  const currentUser = useMemo(() => {
    if (!authUser) {
      return undefined;
    }

    const matchingUser = users.find((user) => user.id === authUser.id);
    if (!matchingUser) {
      return authUser;
    }

    return {
      ...matchingUser,
      effectivePermissions: authUser.effectivePermissions ?? matchingUser.effectivePermissions
    };
  }, [authUser, users]);

  const addUser = useCallback(async (input: UserCreateInput) => {
    const role = normalizeRole(input);
    const type = normalizeType(input, role);
    const created = await apiCreateUser({
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      email: input.email.trim(),
      phone: input.phone?.trim() || undefined,
      role,
      type,
      titleOrPosition: input.titleOrPosition?.trim() || undefined,
      department: input.department?.trim() || undefined,
      externalCompany: input.externalCompany?.trim() || undefined,
          externalOrgId: input.externalOrgId?.trim() || undefined,
          notes: input.notes?.trim() || undefined,
          initialPassword: input.initialPassword?.trim() || undefined,
          mustChangePassword: input.mustChangePassword,
          passwordMode: input.passwordMode
        });

    setUsers((prev) => {
      const withoutCurrent = prev.filter((user) => user.id !== created.user.id);
      return sortUsers([created.user, ...withoutCurrent]);
    });

    return created;
  }, []);

  const updateUser = useCallback(
    async (id: string, patch: UserUpdatePatch) => {
      const existing = users.find((user) => user.id === id);
      if (!existing) {
        return null;
      }

      const role = patch.role ?? normalizeRole({
        role: existing.role,
        type: existing.type,
        isExternal: existing.isExternal
      });
      const type = patch.type ?? normalizeType(
        {
          type: existing.type,
          isExternal: existing.isExternal,
          role: existing.role
        },
        role
      );

      const updated = await apiUpdateUser(id, {
        firstName: patch.firstName?.trim(),
        lastName: patch.lastName?.trim(),
        email: patch.email?.trim(),
        phone: typeof patch.phone === "string" ? patch.phone.trim() || undefined : undefined,
        role,
        type,
        titleOrPosition:
          typeof patch.titleOrPosition === "string" ? patch.titleOrPosition.trim() || undefined : undefined,
        department: typeof patch.department === "string" ? patch.department.trim() || undefined : undefined,
        externalCompany:
          typeof patch.externalCompany === "string" ? patch.externalCompany.trim() || undefined : undefined,
        externalOrgId:
          typeof patch.externalOrgId === "string" ? patch.externalOrgId.trim() || undefined : undefined,
        notes: typeof patch.notes === "string" ? patch.notes.trim() || undefined : undefined,
        mustChangePassword: patch.mustChangePassword
      });

      setUsers((prev) => sortUsers(prev.map((user) => (user.id === id ? mergeUser(user, updated) : user))));
      return updated;
    },
    [users]
  );

  const archiveUser = useCallback(async (id: string) => {
    const updated = await apiArchiveUser(id);
    setUsers((prev) => sortUsers(prev.map((user) => (user.id === id ? mergeUser(user, updated) : user))));
    return updated;
  }, []);

  const restoreUser = useCallback(async (id: string) => {
    const updated = await apiRestoreUser(id);
    setUsers((prev) => sortUsers(prev.map((user) => (user.id === id ? mergeUser(user, updated) : user))));
    return updated;
  }, []);

  const unlockUser = useCallback(async (id: string) => {
    const updated = await apiUnlockUser(id);
    setUsers((prev) => sortUsers(prev.map((user) => (user.id === id ? mergeUser(user, updated) : user))));
    return updated;
  }, []);

  const setMfaEnforced = useCallback(async (id: string, enforced: boolean) => {
    const updated = await apiSetUserMfaEnforced(id, enforced);
    setUsers((prev) => sortUsers(prev.map((user) => (user.id === id ? mergeUser(user, updated) : user))));
    return updated;
  }, []);

  const resetMfa = useCallback(async (id: string) => {
    const updated = await apiResetUserMfa(id);
    setUsers((prev) => sortUsers(prev.map((user) => (user.id === id ? mergeUser(user, updated) : user))));
    return updated;
  }, []);

  const requestReset = useCallback(async (id: string, input?: UserPasswordResetInput) => {
    const result = await requestUserPasswordReset(id, input);
    const updatedUser = result.user;
    if (updatedUser) {
      setUsers((prev) => sortUsers(prev.map((user) => (user.id === id ? mergeUser(user, updatedUser) : user))));
    }
    return result;
  }, []);

  const loadAdminUsers = useCallback(async (query: AdminUsersQuery = {}) => {
    return apiListAdminUsers(query);
  }, []);

  const listActiveUsers = useCallback(
    (filters?: UserSelectionFilter) =>
      users
        .filter((user) => !user.isArchived)
        .filter((user) => matchesType(user, filters)),
    [users]
  );

  const searchUsers = useCallback(
    (query: string, filters?: UserSearchFilter) => {
      const normalizedQuery = query.trim().toLowerCase();
      return users
        .filter((user) => (filters?.includeArchived ? true : !user.isArchived))
        .filter((user) => matchesType(user, filters))
        .filter((user) => {
          if (filters?.role && filters.role !== "ALL" && user.role !== filters.role) {
            return false;
          }
          if (filters?.type && filters.type !== "ALL" && user.type !== filters.type) {
            return false;
          }
          if (!normalizedQuery) {
            return true;
          }

          const displayName = getUserDisplayName(user).toLowerCase();
          const email = (user.email || "").toLowerCase();
          const roleLabel = (user.companyRole || "").toLowerCase();

          return (
            displayName.includes(normalizedQuery) ||
            email.includes(normalizedQuery) ||
            roleLabel.includes(normalizedQuery) ||
            user.role.toLowerCase().includes(normalizedQuery)
          );
        })
        .sort((a, b) => getUserDisplayName(a).localeCompare(getUserDisplayName(b)));
    },
    [users]
  );

  const replaceUsers = useCallback((value: User[]) => {
    setUsers(sortUsers(value));
  }, []);

  const resetUsers = useCallback(() => {
    void reloadUsers().catch(() => {
      if (authUser) {
        setUsers(sortUsers([authUser]));
      }
    });
  }, [authUser, reloadUsers]);

  const value = useMemo(
    () => ({
      users,
      currentUserId,
      currentUser,
      setCurrentUserId,
      addUser,
      updateUser,
      archiveUser,
      restoreUser,
      unlockUser,
      setMfaEnforced,
      resetMfa,
      requestReset,
      loadAdminUsers,
      getUser,
      getDisplayName,
      listActiveUsers,
      searchUsers,
      replaceUsers,
      resetUsers,
      reloadUsers,
      getUserById: (userId?: string) => getUser(userId),
      getUserLabel
    }),
    [
      users,
      currentUserId,
      currentUser,
      setCurrentUserId,
      addUser,
      updateUser,
      archiveUser,
      restoreUser,
      unlockUser,
      setMfaEnforced,
      resetMfa,
      requestReset,
      loadAdminUsers,
      getUser,
      getDisplayName,
      listActiveUsers,
      searchUsers,
      replaceUsers,
      resetUsers,
      reloadUsers,
      getUserLabel
    ]
  );

  return <UsersContext.Provider value={value}>{children}</UsersContext.Provider>;
}

export function useUsers() {
  const context = useContext(UsersContext);
  if (!context) {
    throw new Error("useUsers must be used within UsersProvider");
  }
  return context;
}

export type { User, UserRole, UserType, AdminUsersQuery, AdminUsersListResult };
