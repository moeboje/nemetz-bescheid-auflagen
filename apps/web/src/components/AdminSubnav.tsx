import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { t } from "../i18n";
import { type AuthorizationPermissions, useAuthorization } from "../state/AuthorizationStore";

type AdminSubnavItem = {
  key: "users" | "roles" | "externalOrgs" | "authorities" | "security" | "notifications";
  path: string;
  labelKey:
    | "admin.nav.users"
    | "admin.nav.roles"
    | "admin.nav.externalOrgs"
    | "admin.nav.authorities"
    | "admin.nav.security"
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
    key: "security",
    path: "/admin/security",
    labelKey: "admin.nav.security",
    isVisible: (permissions) => permissions.canViewSecurityAdmin
  },
  {
    key: "notifications",
    path: "/admin/notifications",
    labelKey: "admin.nav.notifications",
    isVisible: (permissions) => permissions.canViewNotificationsAdmin
  }
];

function withCompliancePrefix(pathname: string) {
  return pathname.startsWith("/compliance/") || pathname === "/compliance";
}

function getActiveKey(pathname: string): AdminSubnavItem["key"] {
  if (pathname.includes("/admin/roles")) {
    return "roles";
  }
  if (pathname.includes("/admin/external-orgs")) {
    return "externalOrgs";
  }
  if (pathname.includes("/admin/authorities")) {
    return "authorities";
  }
  if (pathname.includes("/admin/security")) {
    return "security";
  }
  if (pathname.includes("/admin/notifications")) {
    return "notifications";
  }
  return "users";
}

export default function AdminSubnav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { permissions } = useAuthorization();
  const activeKey = getActiveKey(location.pathname);
  const prefix = withCompliancePrefix(location.pathname) ? "/compliance" : "";
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
          onClick={() => navigate(`${prefix}${item.path}`)}
        >
          {t(item.labelKey)}
        </button>
      ))}
    </div>
  );
}
