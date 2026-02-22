import React, { createContext, useContext, useMemo, useState } from "react";
import { users as initialUsers, UserStub } from "../data/users";

export type UsersContextValue = {
  users: UserStub[];
  getUserLabel: (userId?: string) => string;
};

const UsersContext = createContext<UsersContextValue | undefined>(undefined);

export function UsersProvider({ children }: { children: React.ReactNode }) {
  const [users] = useState<UserStub[]>(initialUsers);

  const getUserLabel = useMemo(() => {
    return (userId?: string) => {
      if (!userId) {
        return "";
      }
      return users.find((user) => user.id === userId)?.displayName ?? "";
    };
  }, [users]);

  const value = useMemo(
    () => ({
      users,
      getUserLabel
    }),
    [getUserLabel, users]
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
