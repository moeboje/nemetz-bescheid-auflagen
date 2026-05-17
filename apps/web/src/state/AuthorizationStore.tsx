import React, { createContext, useContext, useMemo } from "react";
import type { ProjectActor } from "../policies/ProjectPolicy";
import { useUsers } from "./UsersStore";

export type AuthorizationPermissions = {
  canViewAdmin: boolean;
  canViewUsersAdmin: boolean;
  canManageUsersAdmin: boolean;
  canViewRolesAdmin: boolean;
  canManageRolesAdmin: boolean;
  canViewSecurityAdmin: boolean;
  canManageSecurityAdmin: boolean;
  canViewNotificationsAdmin: boolean;
  canRetryNotificationsAdmin: boolean;
  canManageNotificationSettingsAdmin: boolean;
  canViewDesignAdmin: boolean;
  canManageDesignAdmin: boolean;
  canViewProcedureMasterDataAdmin: boolean;
  canManageProcedureMasterDataAdmin: boolean;
  canViewAuthoritiesAdmin: boolean;
  canManageAuthoritiesAdmin: boolean;
  canViewExternalOrgsAdmin: boolean;
  canManageExternalOrgsAdmin: boolean;
  canEditMasterData: boolean;
  canCreateProject: boolean;
  canEditProject: boolean;
  canCreateLegalDocs: boolean;
  canEditLegalDocs: boolean;
  canArchiveLegalDocs: boolean;
  canCreateObligations: boolean;
  canEditObligations: boolean;
  canDeleteObligations: boolean;
  canCreateDeadlines: boolean;
  canEditDeadlines: boolean;
  canCompleteTasks: boolean;
  canEditTasks: boolean;
  canViewProjects: boolean;
  canViewLegalDocs: boolean;
  canViewObligations: boolean;
  canViewDeadlines: boolean;
  canViewTasks: boolean;
  canViewScopes: boolean;
  canViewReports: boolean;
};

export type AuthorizationContextValue = {
  actor: ProjectActor;
  permissions: AuthorizationPermissions;
  permissionKeys: string[];
  hasPermission: (key: string) => boolean;
};

const AuthorizationContext = createContext<AuthorizationContextValue | undefined>(undefined);

export function AuthorizationProvider({ children }: { children: React.ReactNode }) {
  const { currentUser } = useUsers();

  const value = useMemo<AuthorizationContextValue>(() => {
    const hasUser = Boolean(currentUser);
    const isExternal = currentUser?.type === "EXTERNAL";
    const permissionKeys = Array.isArray(currentUser?.effectivePermissions) ? currentUser.effectivePermissions : [];
    const permissionSet = new Set(permissionKeys);
    const hasPermission = (key: string) => permissionSet.has(key);
    const hasAdminAccess = hasPermission("admin.access");
    const canViewUsersAdmin =
      hasAdminAccess && (hasPermission("users.view") || hasPermission("users.manage"));
    const canManageUsersAdmin = hasAdminAccess && hasPermission("users.manage");
    const canViewRolesAdmin =
      hasAdminAccess && (hasPermission("roles.view") || hasPermission("roles.manage"));
    const canManageRolesAdmin = hasAdminAccess && hasPermission("roles.manage");
    const canViewSecurityAdmin =
      hasAdminAccess && (hasPermission("security.view") || hasPermission("security.manage"));
    const canManageSecurityAdmin = hasAdminAccess && hasPermission("security.manage");
    const canViewNotificationsAdmin =
      hasAdminAccess &&
      (hasPermission("notifications.view") ||
        hasPermission("notifications.retry") ||
        hasPermission("notifications.settings.manage"));
    const canRetryNotificationsAdmin = hasAdminAccess && hasPermission("notifications.retry");
    const canManageNotificationSettingsAdmin =
      hasAdminAccess && hasPermission("notifications.settings.manage");
    const canViewDesignAdmin = hasAdminAccess && hasPermission("masterData.manage");
    const canManageDesignAdmin = canViewDesignAdmin;
    const canViewProcedureMasterDataAdmin = hasAdminAccess && hasPermission("masterData.manage");
    const canManageProcedureMasterDataAdmin = canViewProcedureMasterDataAdmin;
    const canViewAuthoritiesAdmin =
      hasAdminAccess && (hasPermission("authorities.view") || hasPermission("authorities.manage"));
    const canManageAuthoritiesAdmin = hasAdminAccess && hasPermission("authorities.manage");
    const canViewExternalOrgsAdmin =
      hasAdminAccess && (hasPermission("externalOrgs.view") || hasPermission("externalOrgs.manage"));
    const canManageExternalOrgsAdmin = hasAdminAccess && hasPermission("externalOrgs.manage");
    const canViewTasks = !isExternal && hasPermission("tasks.view");
    const canCompleteTasks = !isExternal && hasPermission("tasks.complete");
    const canEditTasks = !isExternal && hasPermission("tasks.edit");

    return {
      actor: {
        userId: currentUser?.id,
        isAdmin: hasAdminAccess,
        isExternal,
        canCreateProject: !isExternal && hasPermission("projects.create"),
        canEditProject: !isExternal && hasPermission("projects.edit"),
        canArchiveProject: !isExternal && hasPermission("projects.archive")
      },
      permissions: {
        canViewAdmin:
          canViewUsersAdmin ||
          canViewRolesAdmin ||
          canViewSecurityAdmin ||
          canViewNotificationsAdmin ||
          canViewDesignAdmin ||
          canViewProcedureMasterDataAdmin ||
          canViewAuthoritiesAdmin ||
          canViewExternalOrgsAdmin,
        canViewUsersAdmin,
        canManageUsersAdmin,
        canViewRolesAdmin,
        canManageRolesAdmin,
        canViewSecurityAdmin,
        canManageSecurityAdmin,
        canViewNotificationsAdmin,
        canRetryNotificationsAdmin,
        canManageNotificationSettingsAdmin,
        canViewDesignAdmin,
        canManageDesignAdmin,
        canViewProcedureMasterDataAdmin,
        canManageProcedureMasterDataAdmin,
        canViewAuthoritiesAdmin,
        canManageAuthoritiesAdmin,
        canViewExternalOrgsAdmin,
        canManageExternalOrgsAdmin,
        canEditMasterData: hasPermission("masterData.manage"),
        canCreateProject: hasPermission("projects.create"),
        canEditProject: hasPermission("projects.edit"),
        canCreateLegalDocs: hasPermission("legalDocs.create"),
        canEditLegalDocs: hasPermission("legalDocs.edit"),
        canArchiveLegalDocs: !isExternal && hasPermission("legalDocs.archive"),
        canCreateObligations: hasPermission("obligations.create"),
        canEditObligations: hasPermission("obligations.edit"),
        canDeleteObligations: !isExternal && hasPermission("obligations.archive"),
        canCreateDeadlines: hasPermission("deadlines.create"),
        canEditDeadlines: hasPermission("deadlines.edit"),
        canCompleteTasks,
        canEditTasks,
        canViewProjects: hasPermission("projects.view") || isExternal,
        canViewLegalDocs: hasPermission("legalDocs.view"),
        canViewObligations: hasPermission("obligations.view"),
        canViewDeadlines: hasPermission("deadlines.view"),
        canViewTasks,
        canViewScopes: hasPermission("masterData.view") || hasPermission("masterData.manage"),
        canViewReports: hasPermission("reports.view")
      },
      permissionKeys,
      hasPermission
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
