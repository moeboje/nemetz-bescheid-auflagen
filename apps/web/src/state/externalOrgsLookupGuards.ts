import { isDashboardRoutePath, isProjectDetailRoutePath } from "./routeLoading";

export type ExternalOrgsLookupUser = {
  effectivePermissions?: string[];
} | null | undefined;

export function shouldAutoLoadExternalOrgsLookup(pathname: string) {
  return !isDashboardRoutePath(pathname) && !isProjectDetailRoutePath(pathname);
}

export function canUserLookupExternalOrgs(user: ExternalOrgsLookupUser) {
  const permissionKeys = Array.isArray(user?.effectivePermissions) ? user.effectivePermissions : [];
  const hasAdminAccess = permissionKeys.includes("admin.access");
  return (
    hasAdminAccess &&
    (permissionKeys.includes("externalOrgs.view") ||
      permissionKeys.includes("externalOrgs.manage") ||
      permissionKeys.includes("users.manage"))
  );
}
