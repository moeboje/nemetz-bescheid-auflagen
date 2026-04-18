import React from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { t } from "../i18n";

type AdminSubnavItem = {
  key: "users" | "roles" | "externalOrgs" | "authorities";
  path: string;
  labelKey: "admin.nav.users" | "admin.nav.roles" | "admin.nav.externalOrgs" | "admin.nav.authorities";
};

const ITEMS: AdminSubnavItem[] = [
  {
    key: "users",
    path: "/admin/users",
    labelKey: "admin.nav.users"
  },
  {
    key: "roles",
    path: "/admin/roles",
    labelKey: "admin.nav.roles"
  },
  {
    key: "externalOrgs",
    path: "/admin/external-orgs",
    labelKey: "admin.nav.externalOrgs"
  },
  {
    key: "authorities",
    path: "/admin/authorities",
    labelKey: "admin.nav.authorities"
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
  return "users";
}

export default function AdminSubnav() {
  const location = useLocation();
  const navigate = useNavigate();
  const activeKey = getActiveKey(location.pathname);
  const prefix = withCompliancePrefix(location.pathname) ? "/compliance" : "";

  return (
    <div className="tabs" role="tablist" aria-label={t("admin.nav.ariaLabel")}>
      {ITEMS.map((item) => (
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
