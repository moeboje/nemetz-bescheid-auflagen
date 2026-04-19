import React, { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { Button, Card, Input, Select } from "@nemetz/ui";
import { ApiError } from "../api/client";
import {
  getAdminSecurityOverview,
  updateAdminSecuritySettings,
  type SecurityAuditEvent,
  type SecurityOverview,
  type SecuritySettings
} from "../api/security";
import AdminSubnav from "../components/AdminSubnav";
import { useAuthorization } from "../state/AuthorizationStore";

const emptyOverview: SecurityOverview = {
  settings: {
    passwordMinLength: 12,
    passwordRequireNumberOrSpecial: true,
    maxFailedLoginAttempts: 5,
    lockoutMinutes: 15,
    sessionTtlDays: 7,
    allowExternalUsers: true
  },
  summary: {
    totalUsers: 0,
    activeUsers: 0,
    archivedUsers: 0,
    adminUsers: 0,
    externalUsers: 0,
    lockedUsers: 0,
    usersMustChangePassword: 0,
    mfaEnabledUsers: 0,
    adminsWithoutMfa: 0,
    entraEnabled: false
  },
  warnings: [],
  auditEvents: []
};

function formatDateTime(value: string) {
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

function extractErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError && error.message) {
    return error.message;
  }
  return fallback;
}

export default function AdminSecurityPage() {
  const { permissions } = useAuthorization();
  const [overview, setOverview] = useState<SecurityOverview>(emptyOverview);
  const [form, setForm] = useState<SecuritySettings>(emptyOverview.settings);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const warningItems = useMemo(() => overview.warnings, [overview.warnings]);

  useEffect(() => {
    if (!permissions.canViewAdmin) {
      return;
    }

    setIsLoading(true);
    setError("");

    void getAdminSecurityOverview()
      .then((payload) => {
        setOverview(payload);
        setForm(payload.settings);
      })
      .catch((loadError) => {
        setError(extractErrorMessage(loadError, "Sicherheitsdaten konnten nicht geladen werden."));
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [permissions.canViewAdmin]);

  if (!permissions.canViewAdmin) {
    return <Navigate to="/compliance/dashboard" replace />;
  }

  const handleSave = async () => {
    setIsSaving(true);
    setError("");
    setSuccess("");

    try {
      const nextSettings = await updateAdminSecuritySettings({
        passwordMinLength: Number.parseInt(String(form.passwordMinLength), 10),
        passwordRequireNumberOrSpecial: form.passwordRequireNumberOrSpecial,
        maxFailedLoginAttempts: Number.parseInt(String(form.maxFailedLoginAttempts), 10),
        lockoutMinutes: Number.parseInt(String(form.lockoutMinutes), 10),
        sessionTtlDays: Number.parseInt(String(form.sessionTtlDays), 10),
        allowExternalUsers: form.allowExternalUsers
      });
      const nextOverview = await getAdminSecurityOverview();
      setForm(nextSettings);
      setOverview(nextOverview);
      setSuccess("Globale Sicherheitseinstellungen wurden gespeichert.");
    } catch (saveError) {
      setError(extractErrorMessage(saveError, "Sicherheitseinstellungen konnten nicht gespeichert werden."));
    } finally {
      setIsSaving(false);
    }
  };

  const renderAuditEvent = (event: SecurityAuditEvent) => {
    const actor = event.actorLabel ?? event.actorUserId ?? "System";
    const target = event.targetLabel ?? event.targetUserId ?? "";
    const targetSuffix = target ? ` -> ${target}` : "";
    return `${formatDateTime(event.createdAt)} | ${event.action} | ${actor}${targetSuffix}`;
  };

  return (
    <div className="page">
      <div className="pageHeader">
        <h1 className="pageTitle">Admin Sicherheit</h1>
        <Button onClick={() => void handleSave()} disabled={isSaving || isLoading}>
          {isSaving ? "Speichern..." : "Speichern"}
        </Button>
      </div>

      <AdminSubnav />

      {error ? (
        <Card>
          <p className="validationText">{error}</p>
        </Card>
      ) : null}

      {success ? (
        <Card>
          <p className="placeholderText">{success}</p>
        </Card>
      ) : null}

      {isLoading ? (
        <Card>
          <p className="placeholderText">Sicherheitsdaten werden geladen...</p>
        </Card>
      ) : null}

      {!isLoading ? (
        <>
          <Card>
            <h2 className="sectionTitle">Globale Sicherheitseinstellungen</h2>
            <div className="filterRowThree">
              <div className="formField">
                <span className="fieldLabel">Minimale Passwortlaenge</span>
                <Input
                  type="number"
                  value={String(form.passwordMinLength)}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      passwordMinLength: Number.parseInt(event.target.value || "0", 10)
                    }))
                  }
                  disabled={isSaving}
                />
              </div>

              <div className="formField">
                <span className="fieldLabel">Sperre nach Fehlversuchen</span>
                <Input
                  type="number"
                  value={String(form.maxFailedLoginAttempts)}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      maxFailedLoginAttempts: Number.parseInt(event.target.value || "0", 10)
                    }))
                  }
                  disabled={isSaving}
                />
              </div>

              <div className="formField">
                <span className="fieldLabel">Sperrdauer in Minuten</span>
                <Input
                  type="number"
                  value={String(form.lockoutMinutes)}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      lockoutMinutes: Number.parseInt(event.target.value || "0", 10)
                    }))
                  }
                  disabled={isSaving}
                />
              </div>

              <div className="formField">
                <span className="fieldLabel">Session-Laufzeit in Tagen</span>
                <Input
                  type="number"
                  value={String(form.sessionTtlDays)}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      sessionTtlDays: Number.parseInt(event.target.value || "0", 10)
                    }))
                  }
                  disabled={isSaving}
                />
              </div>

              <div className="formField">
                <span className="fieldLabel">Passwort braucht Zahl oder Sonderzeichen</span>
                <Select
                  options={[
                    { value: "true", label: "Ja" },
                    { value: "false", label: "Nein" }
                  ]}
                  value={String(form.passwordRequireNumberOrSpecial)}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      passwordRequireNumberOrSpecial: event.target.value === "true"
                    }))
                  }
                  disabled={isSaving}
                />
              </div>

              <div className="formField">
                <span className="fieldLabel">Externe Benutzer erlaubt</span>
                <Select
                  options={[
                    { value: "true", label: "Ja" },
                    { value: "false", label: "Nein" }
                  ]}
                  value={String(form.allowExternalUsers)}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      allowExternalUsers: event.target.value === "true"
                    }))
                  }
                  disabled={isSaving}
                />
              </div>
            </div>
          </Card>

          <Card>
            <h2 className="sectionTitle">Sicherheitsstatus</h2>
            <div className="detailGrid">
              <div>
                <div className="metaLabel">Aktive Benutzer</div>
                <div className="metaValue">{overview.summary.activeUsers}</div>
              </div>
              <div>
                <div className="metaLabel">Aktive Admins</div>
                <div className="metaValue">{overview.summary.adminUsers}</div>
              </div>
              <div>
                <div className="metaLabel">Externe Benutzer</div>
                <div className="metaValue">{overview.summary.externalUsers}</div>
              </div>
              <div>
                <div className="metaLabel">Gesperrte Konten</div>
                <div className="metaValue">{overview.summary.lockedUsers}</div>
              </div>
              <div>
                <div className="metaLabel">Passwortwechsel offen</div>
                <div className="metaValue">{overview.summary.usersMustChangePassword}</div>
              </div>
              <div>
                <div className="metaLabel">MFA aktiviert</div>
                <div className="metaValue">{overview.summary.mfaEnabledUsers}</div>
              </div>
              <div>
                <div className="metaLabel">Admins ohne MFA</div>
                <div className="metaValue">{overview.summary.adminsWithoutMfa}</div>
              </div>
              <div>
                <div className="metaLabel">Microsoft Entra</div>
                <div className="metaValue">{overview.summary.entraEnabled ? "Aktiv" : "Nicht aktiv"}</div>
              </div>
            </div>
          </Card>

          <Card>
            <h2 className="sectionTitle">Warnungen</h2>
            {warningItems.length === 0 ? (
              <p className="placeholderText">Keine offenen Sicherheitswarnungen.</p>
            ) : (
              warningItems.map((warning) => (
                <p key={warning} className="validationText">
                  {warning}
                </p>
              ))
            )}
          </Card>

          <Card>
            <h2 className="sectionTitle">Letzte sicherheitsrelevante Aktionen</h2>
            {overview.auditEvents.length === 0 ? (
              <p className="placeholderText">Keine Audit-Eintraege vorhanden.</p>
            ) : (
              overview.auditEvents.map((event) => (
                <p key={event.id} className="placeholderText">
                  {renderAuditEvent(event)}
                </p>
              ))
            )}
          </Card>
        </>
      ) : null}
    </div>
  );
}
