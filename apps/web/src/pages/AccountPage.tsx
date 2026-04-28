import React from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Badge, Button, Card } from "@nemetz/ui";
import { t } from "../i18n";
import { useAuth } from "../state/AuthStore";

function formatDateTime(value?: string) {
  if (!value) {
    return t("common.notAvailable");
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString("de-AT", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function getRoleLabel(role?: string) {
  switch (role) {
    case "ADMIN":
      return "Admin";
    case "COMPLIANCE_MANAGER":
      return "Compliance Manager";
    case "COMPLIANCE_EDITOR":
      return "Compliance Editor";
    case "READ_ONLY":
      return "Read Only";
    case "EXTERNAL":
      return "Extern";
    case "COMPLIANCE":
      return "Compliance (Legacy)";
    case "USER":
      return "Benutzer (Legacy)";
    default:
      return role || t("common.notAvailable");
  }
}

export default function AccountPage() {
  const navigate = useNavigate();
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="page">
      <div className="pageHeader">
        <div>
          <h1 className="pageTitle">{t("account.title")}</h1>
          <p className="placeholderText">{t("account.subtitle")}</p>
        </div>
        <Button onClick={() => navigate("/compliance/account/security")}>{t("account.action.security")}</Button>
      </div>

      {user.mustChangePassword ? (
        <Card>
          <p className="validationText">{t("account.password.mustChange")}</p>
        </Card>
      ) : null}

      <Card>
        <h2 className="sectionTitle">{t("account.section.profile")}</h2>
        <div className="detailGrid">
          <div>
            <div className="metaLabel">{t("account.field.name")}</div>
            <div className="metaValue">{`${user.firstName} ${user.lastName}`.trim()}</div>
          </div>
          <div>
            <div className="metaLabel">{t("account.field.email")}</div>
            <div className="metaValue">{user.email}</div>
          </div>
          <div>
            <div className="metaLabel">{t("account.field.role")}</div>
            <div className="metaValue">{getRoleLabel(user.role)}</div>
          </div>
          <div>
            <div className="metaLabel">{t("account.field.type")}</div>
            <div className="metaValue">{user.isExternal ? t("users.external") : t("users.internal")}</div>
          </div>
          <div>
            <div className="metaLabel">{t("account.field.position")}</div>
            <div className="metaValue">{user.titleOrPosition || t("common.notAvailable")}</div>
          </div>
          <div>
            <div className="metaLabel">{t("account.field.phone")}</div>
            <div className="metaValue">{user.phone || t("common.notAvailable")}</div>
          </div>
          <div>
            <div className="metaLabel">{t("account.field.externalOrg")}</div>
            <div className="metaValue">{user.externalOrgName || user.externalCompany || t("common.notAvailable")}</div>
          </div>
          <div>
            <div className="metaLabel">{t("account.field.lastLogin")}</div>
            <div className="metaValue">{formatDateTime(user.lastLoginAt)}</div>
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="sectionTitle">{t("account.section.security")}</h2>
        <div className="detailGrid">
          <div>
            <div className="metaLabel">{t("account.security.passwordChangedAt")}</div>
            <div className="metaValue">{formatDateTime(user.passwordUpdatedAt)}</div>
          </div>
          <div>
            <div className="metaLabel">{t("account.security.mfaStatus")}</div>
            <div className="metaValue">
              {user.mfaEnforced ? (
                <Badge variant="warning">{t("account.security.mfa.enforced")}</Badge>
              ) : user.mfaEnabled ? (
                <Badge variant="success">{t("account.security.mfa.enabled")}</Badge>
              ) : (
                <Badge variant="neutral">{t("account.security.mfa.disabled")}</Badge>
              )}
            </div>
          </div>
          <div>
            <div className="metaLabel">{t("account.security.mfaVerifiedAt")}</div>
            <div className="metaValue">{formatDateTime(user.mfaVerifiedAt)}</div>
          </div>
          <div>
            <div className="metaLabel">{t("account.security.passwordResetAt")}</div>
            <div className="metaValue">{formatDateTime(user.lastPasswordResetAt)}</div>
          </div>
        </div>

        <div className="sectionActions">
          <Button variant="secondary" onClick={() => navigate("/compliance/account/security")}>
            {t("account.action.manageSecurity")}
          </Button>
        </div>
      </Card>
    </div>
  );
}
