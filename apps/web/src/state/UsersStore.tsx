import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import { users as initialUsers, UserStub } from "../data/users";
import { loadJSON, saveJSON, STORAGE_KEYS } from "./persistence";

export type UsersContextValue = {
  users: UserStub[];
  getUserLabel: (userId?: string) => string;
  replaceUsers: (value: UserStub[]) => void;
  resetUsers: () => void;
};

const UsersContext = createContext<UsersContextValue | undefined>(undefined);

function normalizeUsers(value: unknown): UserStub[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }
      const row = item as Partial<UserStub>;
      if (typeof row.id !== "string" || !row.id.trim() || typeof row.displayName !== "string") {
        return null;
      }
      return {
        id: row.id,
        displayName: row.displayName,
        email: row.email ?? "",
        isExternal: Boolean(row.isExternal),
        roleLabel: row.roleLabel ?? ""
      } satisfies UserStub;
    })
    .filter((row): row is UserStub => Boolean(row));
}

export function UsersProvider({ children }: { children: React.ReactNode }) {
  const [users, setUsers] = useState<UserStub[]>(() =>
    loadJSON<UserStub[]>(STORAGE_KEYS.users, {
      fallback: initialUsers,
      migrate: (value) => {
        const normalized = normalizeUsers(value);
        return normalized.length ? normalized : initialUsers;
      }
    }) ?? initialUsers
  );

  React.useEffect(() => {
    saveJSON(STORAGE_KEYS.users, users);
  }, [users]);

  const getUserLabel = useMemo(() => {
    return (userId?: string) => {
      if (!userId) {
        return "";
      }
      return users.find((user) => user.id === userId)?.displayName ?? "";
    };
  }, [users]);

  const replaceUsers = useCallback((value: UserStub[]) => {
    const normalized = normalizeUsers(value);
    setUsers(normalized.length ? normalized : initialUsers);
  }, []);

  const resetUsers = useCallback(() => {
    setUsers(initialUsers);
  }, []);

  const value = useMemo(
    () => ({
      users,
      getUserLabel,
      replaceUsers,
      resetUsers
    }),
    [getUserLabel, replaceUsers, resetUsers, users]
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
