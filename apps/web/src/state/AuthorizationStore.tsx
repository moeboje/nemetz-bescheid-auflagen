import React, { createContext, useContext, useMemo } from "react";
import type { ProjectActor } from "../policies/ProjectPolicy";
import { useUsers } from "./UsersStore";

export type AuthorizationPermissions = {
  canViewAdmin: boolean;
  canEditMasterData: boolean;
  canCreateProject: boolean;
  canEditProject: boolean;
  canEditLegalDocs: boolean;
  canEditObligations: boolean;
  canEditDeadlines: boolean;
  canCompleteTasks: boolean;
  canViewProjects: boolean;
  canViewLegalDocs: boolean;
  canViewObligations: boolean;
  canViewDeadlines: boolean;
  canViewScopes: boolean;
};

export type AuthorizationContextValue = {
  actor: ProjectActor;
  permissions: AuthorizationPermissions;
};

const AuthorizationContext = createContext<AuthorizationContextValue | undefined>(undefined);

export function AuthorizationProvider({ children }: { children: React.ReactNode }) {
  const { currentUser } = useUsers();

  const value = useMemo<AuthorizationContextValue>(() => {
    const hasUser = Boolean(currentUser);
    const isExternal = currentUser?.type === "EXTERNAL";
    const isInternalUser = hasUser && !isExternal;
    const isAdmin = currentUser?.role === "ADMIN";
    const canEditCoreData = isInternalUser;

    return {
      actor: {
        userId: currentUser?.id,
        isAdmin,
        isExternal
      },
      permissions: {
        canViewAdmin: isAdmin,
        canEditMasterData: isAdmin,
        canCreateProject: canEditCoreData,
        canEditProject: canEditCoreData,
        canEditLegalDocs: canEditCoreData,
        canEditObligations: canEditCoreData,
        canEditDeadlines: canEditCoreData,
        canCompleteTasks: hasUser,
        canViewProjects: isInternalUser,
        canViewLegalDocs: isInternalUser,
        canViewObligations: isInternalUser,
        canViewDeadlines: isInternalUser,
        canViewScopes: isInternalUser
      }
    };
  }, [currentUser]);

  return <AuthorizationContext.Provider value={value}>{children}</AuthorizationContext.Provider>;
}

export function useAuthorization() {
  const context = useContext(AuthorizationContext);
  if (!context) {
    throw new Error("useAuthorization must be used within AuthorizationProvider");
  }
  return context;
}
