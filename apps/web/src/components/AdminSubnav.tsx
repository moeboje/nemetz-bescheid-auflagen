import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { t } from "../i18n";
import { type AuthorizationPermissions, useAuthorization } from "../state/AuthorizationStore";

type AdminSubnavItem = {
  key:
    | "users"
    | "roles"
    | "externalOrgs"
    | "authorities"
    | "procedureMasterData"
    | "security"
    | "design"
    | "notifications";
  path: string;
  labelKey:
    | "admin.nav.users"
    | "admin.nav.roles"
    | "admin.nav.externalOrgs"
    | "admin.nav.authorities"
    | "admin.nav.procedureMasterData"
    | "admin.nav.security"
    | "admin.nav.design"
    | "admin.nav.notifications";
  isVisible: (permissions: AuthorizationPermissions) => boolean;
};

const ITEMS: AdminSubnavItem[] = [
  {
    key: "users",
    path: "/admin/users",
    labelKey: "admin.nav.users",
    isVisible: (permissions) => permissions.canViewUsersAdmin
  },
  {
    key: "roles",
    path: "/admin/roles",
    labelKey: "admin.nav.roles",
    isVisible: (permissions) => permissions.canViewRolesAdmin
  },
  {
    key: "externalOrgs",
    path: "/admin/external-orgs",
    labelKey: "admin.nav.externalOrgs",
    isVisible: (permissions) => permissions.canViewExternalOrgsAdmin
  },
  {
    key: "authorities",
    path: "/admin/authorities",
    labelKey: "admin.nav.authorities",
    isVisible: (permissions) => permissions.canViewAuthoritiesAdmin
  },
  {
    key: "procedureMasterData",
    path: "/admin/procedure-master-data",
    labelKey: "admin.nav.procedureMasterData",
    isVisible: (permissions) => permissions.canViewProcedureMasterDataAdmin
  },
  {
    key: "security",
    path: "/admin/security",
    labelKey: "admin.nav.security",
    isVisible: (permissions) => permissions.canViewSecurityAdmin
  },
  {
    key: "design",
    path: "/admin/design",
    labelKey: "admin.nav.design",
    isVisible: (permissions) => permissions.canViewDesignAdmin
  },
  {
    key: "notifications",
    path: "/admin/notifications",
    labelKey: "admin.nav.notifications",
    isVisible: (permissions) => permissions.canViewNotificationsAdmin
  }
];

function normalizePath(pathname: string) {
  const trimmed = pathname.trim() || "/";
  return trimmed.length > 1 ? trimmed.replace(/\/+$/, "") : trimmed;
}

function matchesAdminSection(pathname: string, section: string) {
  const normalized = normalizePath(pathname);
  const adminPath = `/admin/${section}`;
  const moduleAdminPath = `/compliance${adminPath}`;
  return (
    normalized === adminPath ||
    normalized.startsWith(`${adminPath}/`) ||
    normalized === moduleAdminPath ||
    normalized.startsWith(`${moduleAdminPath}/`)
  );
}

function getActiveKey(pathname: string): AdminSubnavItem["key"] {
  if (matchesAdminSection(pathname, "roles")) {
    return "roles";
  }
  if (matchesAdminSection(pathname, "external-orgs")) {
    return "externalOrgs";
  }
  if (matchesAdminSection(pathname, "authorities")) {
    return "authorities";
  }
  if (matchesAdminSection(pathname, "procedure-master-data")) {
    return "procedureMasterData";
  }
  if (matchesAdminSection(pathname, "security")) {
    return "security";
  }
  if (matchesAdminSection(pathname, "design")) {
    return "design";
  }
  if (matchesAdminSection(pathname, "notifications")) {
    return "notifications";
  }
  return "users";
}

export default function AdminSubnav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { permissions } = useAuthorization();
  const activeKey = getActiveKey(location.pathname);
  const visibleItems = ITEMS.filter((item) => item.isVisible(permissions));

  return (
    <div className="tabs" role="tablist" aria-label={t("admin.nav.ariaLabel")}>
      {visibleItems.map((item) => (
        <button
          type="button"
          key={item.key}
          role="tab"
          aria-selected={item.key === activeKey}
          className={`tabButton ${item.key === activeKey ? "tabButtonActive" : ""}`}
          onClick={() => navigate(item.path)}
        >
          {t(item.labelKey)}
        </button>
      ))}
    </div>
  );
}
