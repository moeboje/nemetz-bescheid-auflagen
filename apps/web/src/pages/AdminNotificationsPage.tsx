import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Badge, Button, Card, DataTable, Input, Select } from "@nemetz/ui";
import {
  cancelAdminNotification,
  getAdminNotificationDetail,
  getAdminNotificationOverview,
  listAdminNotifications,
  retryAdminNotification,
  updateAdminNotificationSettings,
  type AdminNotificationDetail,
  type AdminNotificationListItem,
  type AdminNotificationOverview,
  type NotificationSettings
} from "../api/adminNotifications";
import { ApiError } from "../api/client";
import AdminSubnav from "../components/AdminSubnav";
import { useAuthorization } from "../state/AuthorizationStore";

type TabKey = "overview" | "history" | "failed" | "settings" | "system";

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: "overview", label: "Uebersicht" },
  { key: "history", label: "Versandhistorie" },
  { key: "failed", label: "Fehlgeschlagen" },
  { key: "settings", label: "Einstellungen" },
  { key: "system", label: "Systemstatus" }
];

const emptySettings: NotificationSettings = {
  defaultDueSoonDays: 7,
  deadlineDueSoonEnabled: true,
  assignmentAssignedEnabled: true,
  dailyDigestEnabled: false,
  weeklyDigestEnabled: false,
  dailyDigestHourLocal: 7,
  weeklyDigestWeekday: 1
};

function formatDateTime(value: string | undefined) {
  if (!value) {
    return "Nicht verfuegbar";
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

function extractErrorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError && error.message) {
    return error.message;
  }
  return fallback;
}

function getStatusBadgeVariant(status: string) {
  switch (status) {
    case "SENT":
      return "success" as const;
    case "FAILED":
      return "danger" as const;
    case "RETRY":
      return "warning" as const;
    case "CANCELLED":
      return "neutral" as const;
    case "CLAIMED":
      return "warning" as const;
    default:
      return "neutral" as const;
  }
}

function getSeverityBadgeVariant(severity: string) {
  switch (severity) {
    case "CRITICAL":
      return "danger" as const;
    case "WARNING":
      return "warning" as const;
    default:
      return "neutral" as const;
  }
}

function isStaleClaimedNotification(
  row: AdminNotificationListItem,
  claimLeaseSeconds: number | undefined
) {
  if (row.status !== "CLAIMED" || typeof claimLeaseSeconds !== "number" || claimLeaseSeconds <= 0 || !row.claimedAt) {
    return false;
  }

  const claimedAt = Date.parse(row.claimedAt);
  if (Number.isNaN(claimedAt)) {
    return false;
  }

  return claimedAt < Date.now() - claimLeaseSeconds * 1_000;
}

export default function AdminNotificationsPage() {
  const { permissions } = useAuthorization();
  const canView = permissions.canViewNotificationsAdmin;
  const canRetry = permissions.canRetryNotificationsAdmin;
  const canManageSettings = permissions.canManageNotificationSettingsAdmin;
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [overview, setOverview] = useState<AdminNotificationOverview | null>(null);
  const [settingsForm, setSettingsForm] = useState<NotificationSettings>(emptySettings);
  const [rows, setRows] = useState<AdminNotificationListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [isOverviewLoading, setIsOverviewLoading] = useState(true);
  const [isListLoading, setIsListLoading] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [pageError, setPageError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [filters, setFilters] = useState({
    q: "",
    recipient: "",
    status: "",
    eventType: "",
    entityType: "",
    dateFrom: "",
    dateTo: "",
    page: 1,
    pageSize: 20
  });
  const [selectedId, setSelectedId] = useState("");
  const [selectedDetail, setSelectedDetail] = useState<AdminNotificationDetail | null>(null);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const effectiveStatus = activeTab === "failed" ? "ATTENTION" : filters.status;
  const claimLeaseSeconds = overview?.dispatchConfig.claimLeaseSeconds;

  const refreshOverview = async () => {
    setIsOverviewLoading(true);
    try {
      const payload = await getAdminNotificationOverview();
      setOverview(payload);
      setSettingsForm(payload.settings);
      setPageError("");
    } catch (error) {
      setPageError(extractErrorMessage(error, "Benachrichtigungsstatus konnte nicht geladen werden."));
    } finally {
      setIsOverviewLoading(false);
    }
  };

  const refreshList = async () => {
    if (activeTab !== "history" && activeTab !== "failed") {
      return;
    }

    setIsListLoading(true);
    try {
      const payload = await listAdminNotifications({
        ...filters,
        status: effectiveStatus || undefined
      });
      setRows(payload.items);
      setTotal(payload.total);
      setPageError("");
    } catch (error) {
      setPageError(extractErrorMessage(error, "Benachrichtigungshistorie konnte nicht geladen werden."));
    } finally {
      setIsListLoading(false);
    }
  };

  const loadDetail = async (notificationId: string) => {
    setSelectedId(notificationId);
    setIsDetailLoading(true);
    try {
      const payload = await getAdminNotificationDetail(notificationId);
      setSelectedDetail(payload);
      setPageError("");
    } catch (error) {
      setPageError(extractErrorMessage(error, "Benachrichtigungsdetails konnten nicht geladen werden."));
    } finally {
      setIsDetailLoading(false);
    }
  };

  useEffect(() => {
    if (!canView) {
      return;
    }

    void refreshOverview();
  }, [canView]);

  useEffect(() => {
    if (!canView) {
      return;
    }

    void refreshList();
  }, [canView, activeTab, filters, effectiveStatus]);

  const handleRetry = async (notificationId: string) => {
    if (!canRetry) {
      return;
    }

    try {
      await retryAdminNotification(notificationId);
      setSuccessMessage("Benachrichtigung wurde erneut eingeplant.");
      await refreshOverview();
      await refreshList();
      if (selectedId === notificationId) {
        await loadDetail(notificationId);
      }
    } catch (error) {
      setPageError(extractErrorMessage(error, "Benachrichtigung konnte nicht erneut eingeplant werden."));
    }
  };

  const handleCancel = async (notificationId: string) => {
    if (!canRetry) {
      return;
    }

    try {
      await cancelAdminNotification(notificationId);
      setSuccessMessage("Benachrichtigung wurde abgebrochen.");
      await refreshOverview();
      await refreshList();
      if (selectedId === notificationId) {
        await loadDetail(notificationId);
      }
    } catch (error) {
      setPageError(extractErrorMessage(error, "Benachrichtigung konnte nicht abgebrochen werden."));
    }
  };

  const handleSaveSettings = async () => {
    if (!canManageSettings) {
      return;
    }

    setIsSavingSettings(true);
    try {
      const saved = await updateAdminNotificationSettings({
        defaultDueSoonDays: Number.parseInt(String(settingsForm.defaultDueSoonDays), 10),
        deadlineDueSoonEnabled: settingsForm.deadlineDueSoonEnabled,
        assignmentAssignedEnabled: settingsForm.assignmentAssignedEnabled,
        dailyDigestEnabled: settingsForm.dailyDigestEnabled,
        weeklyDigestEnabled: settingsForm.weeklyDigestEnabled,
        dailyDigestHourLocal: Number.parseInt(String(settingsForm.dailyDigestHourLocal), 10),
        weeklyDigestWeekday: Number.parseInt(String(settingsForm.weeklyDigestWeekday), 10)
      });
      setSettingsForm(saved);
      setSuccessMessage("Benachrichtigungseinstellungen wurden gespeichert.");
      await refreshOverview();
    } catch (error) {
      setPageError(extractErrorMessage(error, "Benachrichtigungseinstellungen konnten nicht gespeichert werden."));
    } finally {
      setIsSavingSettings(false);
    }
  };

  const historyColumns = [
    {
      key: "createdAt",
      header: "Erstellt",
      render: (row: AdminNotificationListItem) => formatDateTime(row.createdAt)
    },
    {
      key: "eventType",
      header: "Event",
      render: (row: AdminNotificationListItem) => (
        <div className="inlineMeta">
          <span>{row.eventType}</span>
          <Badge variant={getSeverityBadgeVariant(row.severity)}>{row.severity}</Badge>
        </div>
      )
    },
    {
      key: "recipient",
      header: "Empfaenger",
      render: (row: AdminNotificationListItem) => (
        <div className="inlineMeta">
          <span>{row.recipientName || row.recipientEmail}</span>
          <span>{row.recipientEmail}</span>
        </div>
      )
    },
    {
      key: "subject",
      header: "Betreff",
      render: (row: AdminNotificationListItem) => (
        <div className="inlineMeta">
          <span>{row.subject}</span>
          <span>{row.title}</span>
        </div>
      )
    },
    {
      key: "status",
      header: "Status",
      render: (row: AdminNotificationListItem) => (
        <div className="inlineMeta">
          <Badge variant={getStatusBadgeVariant(row.status)}>{row.status}</Badge>
          <span>{row.attemptCount} Versuche</span>
        </div>
      )
    },
    {
      key: "actions",
      header: "Aktionen",
      render: (row: AdminNotificationListItem) => {
        const isStaleClaimed = isStaleClaimedNotification(row, claimLeaseSeconds);
        const isActiveClaimed = row.status === "CLAIMED" && !isStaleClaimed;
        const retryDisabled =
          row.eventType === "PASSWORD_RESET_LINK" ||
          !(row.status === "FAILED" || row.status === "RETRY" || isStaleClaimed);
        const cancelDisabled = !(row.status === "PENDING" || row.status === "RETRY" || row.status === "FAILED" || isStaleClaimed);
        const claimHint = isActiveClaimed ? "Wird gerade verarbeitet." : undefined;

        return (
          <div className="tableActions">
            <Button size="sm" variant="ghost" onClick={() => void loadDetail(row.id)}>
              Details
            </Button>
            {canRetry ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void handleRetry(row.id)}
                disabled={retryDisabled}
                title={claimHint}
              >
                Retry
              </Button>
            ) : null}
            {canRetry ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void handleCancel(row.id)}
                disabled={cancelDisabled}
                title={claimHint}
              >
                Cancel
              </Button>
            ) : null}
          </div>
        );
      }
    }
  ];

  if (!canView) {
    return <Navigate to="/compliance/dashboard" replace />;
  }

  return (
    <div className="page">
      <div className="pageHeader">
        <h1 className="pageTitle">Admin Benachrichtigungen</h1>
        <Button onClick={() => void refreshOverview()} disabled={isOverviewLoading}>
          {isOverviewLoading ? "Aktualisieren..." : "Aktualisieren"}
        </Button>
      </div>

      <AdminSubnav />

      <div className="tabs" role="tablist" aria-label="Benachrichtigungsbereiche">
        {tabs.map((tab) => (
          <button
            type="button"
            key={tab.key}
            role="tab"
            aria-selected={activeTab === tab.key}
            className={`tabButton ${activeTab === tab.key ? "tabButtonActive" : ""}`}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {pageError ? (
        <Card>
          <p className="validationText">{pageError}</p>
        </Card>
      ) : null}

      {successMessage ? (
        <Card>
          <p className="placeholderText">{successMessage}</p>
        </Card>
      ) : null}

      {activeTab === "overview" && overview ? (
        <>
          <div className="summaryGrid">
            <Card>
              <h2 className="sectionTitle">Queue</h2>
              <p>PENDING: {overview.summary.pendingCount}</p>
              <p>RETRY: {overview.summary.retryCount}</p>
              <p>FAILED: {overview.summary.failedCount}</p>
              <p>CLAIMED: {overview.summary.claimedCount}</p>
            </Card>
            <Card>
              <h2 className="sectionTitle">Versand</h2>
              <p>SENT gesamt: {overview.summary.sentCount}</p>
              <p>Heute gesendet: {overview.summary.sentToday}</p>
              <p>CANCELLED: {overview.summary.cancelledCount}</p>
              <p>Stale CLAIMED: {overview.summary.staleClaimedCount}</p>
            </Card>
            <Card>
              <h2 className="sectionTitle">Dispatcher</h2>
              <p>Letzter Start: {formatDateTime(overview.workerStatus?.lastStartedAt)}</p>
              <p>Letzter Erfolg: {formatDateTime(overview.workerStatus?.lastSuccessfulAt)}</p>
              <p>Letztes Outcome: {overview.workerStatus?.lastOutcome || "Nicht verfuegbar"}</p>
              <p>Offen seit: {formatDateTime(overview.summary.oldestPendingAt)}</p>
            </Card>
          </div>

          {overview.warnings.length > 0 ? (
            <Card>
              <h2 className="sectionTitle">Warnungen</h2>
              {overview.warnings.map((warning) => (
                <p key={warning} className="validationText">
                  {warning}
                </p>
              ))}
            </Card>
          ) : null}
        </>
      ) : null}

      {(activeTab === "history" || activeTab === "failed") && (
        <>
          <Card>
            <h2 className="sectionTitle">
              {activeTab === "failed" ? "Fehlgeschlagene / auffaellige Benachrichtigungen" : "Versandhistorie"}
            </h2>
            <div className="filterRowThree">
              <div className="formField">
                <span className="fieldLabel">Suche</span>
                <Input
                  value={filters.q}
                  onChange={(event) => setFilters((prev) => ({ ...prev, q: event.target.value, page: 1 }))}
                  placeholder="Betreff, Empfaenger, Entity"
                />
              </div>
              <div className="formField">
                <span className="fieldLabel">Empfaenger</span>
                <Input
                  value={filters.recipient}
                  onChange={(event) => setFilters((prev) => ({ ...prev, recipient: event.target.value, page: 1 }))}
                  placeholder="name@example.at"
                />
              </div>
              <div className="formField">
                <span className="fieldLabel">Status</span>
                <Select
                  value={effectiveStatus}
                  disabled={activeTab === "failed"}
                  onChange={(event) => setFilters((prev) => ({ ...prev, status: event.target.value, page: 1 }))}
                  options={[
                    { value: "", label: "Alle" },
                    { value: "PENDING", label: "PENDING" },
                    { value: "CLAIMED", label: "CLAIMED" },
                    { value: "SENT", label: "SENT" },
                    { value: "RETRY", label: "RETRY" },
                    { value: "FAILED", label: "FAILED" },
                    { value: "CANCELLED", label: "CANCELLED" }
                  ]}
                />
              </div>
              <div className="formField">
                <span className="fieldLabel">EventType</span>
                <Input
                  value={filters.eventType}
                  onChange={(event) => setFilters((prev) => ({ ...prev, eventType: event.target.value, page: 1 }))}
                  placeholder="DEADLINE_OVERDUE"
                />
              </div>
              <div className="formField">
                <span className="fieldLabel">EntityType</span>
                <Input
                  value={filters.entityType}
                  onChange={(event) => setFilters((prev) => ({ ...prev, entityType: event.target.value, page: 1 }))}
                  placeholder="DEADLINE"
                />
              </div>
              <div className="formField">
                <span className="fieldLabel">Von</span>
                <Input
                  type="date"
                  value={filters.dateFrom}
                  onChange={(event) => setFilters((prev) => ({ ...prev, dateFrom: event.target.value, page: 1 }))}
                />
              </div>
              <div className="formField">
                <span className="fieldLabel">Bis</span>
                <Input
                  type="date"
                  value={filters.dateTo}
                  onChange={(event) => setFilters((prev) => ({ ...prev, dateTo: event.target.value, page: 1 }))}
                />
              </div>
            </div>
          </Card>

          <div className="tableSection">
            {isListLoading ? (
              <Card>
                <p className="placeholderText">Benachrichtigungen werden geladen...</p>
              </Card>
            ) : (
              <DataTable columns={historyColumns} data={rows} getRowKey={(row) => row.id} />
            )}
            <Card>
              <div className="inlineMeta">
                <span>Total: {total}</span>
                <span>Seite: {filters.page}</span>
              </div>
              <div className="tableActions">
                <Button
                  variant="ghost"
                  disabled={filters.page <= 1}
                  onClick={() => setFilters((prev) => ({ ...prev, page: Math.max(1, prev.page - 1) }))}
                >
                  Zurueck
                </Button>
                <Button
                  variant="ghost"
                  disabled={rows.length < filters.pageSize}
                  onClick={() => setFilters((prev) => ({ ...prev, page: prev.page + 1 }))}
                >
                  Weiter
                </Button>
              </div>
            </Card>
          </div>

          {selectedId ? (
            <Card>
              <h2 className="sectionTitle">Benachrichtigungsdetails</h2>
              {isDetailLoading || !selectedDetail ? (
                <p className="placeholderText">Details werden geladen...</p>
              ) : (
                <>
                  <p>EventType: {selectedDetail.eventType}</p>
                  <p>Status: {selectedDetail.status}</p>
                  <p>Betreff: {selectedDetail.subject}</p>
                  <p>Empfaenger: {selectedDetail.recipientName || selectedDetail.recipientEmail}</p>
                  <p>E-Mail: {selectedDetail.recipientEmail}</p>
                  <p>Geplant fuer: {formatDateTime(selectedDetail.scheduledFor)}</p>
                  <p>Gesendet am: {formatDateTime(selectedDetail.sentAt)}</p>
                  <p>Letzter Fehler: {selectedDetail.lastError || "Kein Fehler"}</p>
                  <p>Provider-Referenz: {selectedDetail.providerReference || "Nicht verfuegbar"}</p>
                  <p>Portal-Link: {selectedDetail.payload.link || "Nicht verfuegbar"}</p>
                  {selectedDetail.passwordReset ? (
                    <>
                      <p>Reset-Token-Status: {selectedDetail.passwordReset.state}</p>
                      <p>Reset-Token gueltig bis: {formatDateTime(selectedDetail.passwordReset.expiresAt)}</p>
                      <p>Reset-Token verbraucht am: {formatDateTime(selectedDetail.passwordReset.usedAt)}</p>
                    </>
                  ) : null}
                  <h3 className="sectionTitle">Payload</h3>
                  <p>Titel: {selectedDetail.payload.title}</p>
                  <p>Nachricht: {selectedDetail.payload.message}</p>
                  <p>Severity: {selectedDetail.payload.severity}</p>
                  <h3 className="sectionTitle">Versandversuche</h3>
                  {selectedDetail.attempts.length === 0 ? (
                    <p className="placeholderText">Noch keine Versandversuche vorhanden.</p>
                  ) : (
                    selectedDetail.attempts.map((attempt) => (
                      <div key={attempt.id} className="inlineMeta">
                        <span>
                          Versuch #{attempt.attemptNumber}: {attempt.outcome}
                        </span>
                        <span>{formatDateTime(attempt.startedAt)}</span>
                        <span>{attempt.httpStatus ? `HTTP ${attempt.httpStatus}` : "Keine HTTP-Antwort"}</span>
                        <span>{attempt.errorSummary || attempt.providerReference || "Keine Zusatzinfo"}</span>
                      </div>
                    ))
                  )}
                </>
              )}
            </Card>
          ) : null}
        </>
      )}

      {activeTab === "settings" && (
        <Card>
          <div className="pageHeader">
            <h2 className="sectionTitle">Globale Benachrichtigungseinstellungen</h2>
            <Button onClick={() => void handleSaveSettings()} disabled={isSavingSettings || !canManageSettings}>
              {isSavingSettings ? "Speichern..." : "Speichern"}
            </Button>
          </div>
          <div className="filterRowThree">
            <div className="formField">
              <span className="fieldLabel">Default Due-soon Tage</span>
              <Input
                type="number"
                value={String(settingsForm.defaultDueSoonDays)}
                onChange={(event) =>
                  setSettingsForm((prev) => ({
                    ...prev,
                    defaultDueSoonDays: Number.parseInt(event.target.value || "0", 10)
                  }))
                }
                disabled={!canManageSettings}
              />
            </div>
            <div className="formField">
              <span className="fieldLabel">Deadline due soon aktiv</span>
              <Select
                value={String(settingsForm.deadlineDueSoonEnabled)}
                onChange={(event) =>
                  setSettingsForm((prev) => ({
                    ...prev,
                    deadlineDueSoonEnabled: event.target.value === "true"
                  }))
                }
                disabled={!canManageSettings}
                options={[
                  { value: "true", label: "Ja" },
                  { value: "false", label: "Nein" }
                ]}
              />
            </div>
            <div className="formField">
              <span className="fieldLabel">Assignment-Mails aktiv</span>
              <Select
                value={String(settingsForm.assignmentAssignedEnabled)}
                onChange={(event) =>
                  setSettingsForm((prev) => ({
                    ...prev,
                    assignmentAssignedEnabled: event.target.value === "true"
                  }))
                }
                disabled={!canManageSettings}
                options={[
                  { value: "true", label: "Ja" },
                  { value: "false", label: "Nein" }
                ]}
              />
            </div>
            <div className="formField">
              <span className="fieldLabel">Daily Digest aktiv</span>
              <Select
                value={String(settingsForm.dailyDigestEnabled)}
                onChange={(event) =>
                  setSettingsForm((prev) => ({
                    ...prev,
                    dailyDigestEnabled: event.target.value === "true"
                  }))
                }
                disabled={!canManageSettings}
                options={[
                  { value: "true", label: "Ja" },
                  { value: "false", label: "Nein" }
                ]}
              />
            </div>
            <div className="formField">
              <span className="fieldLabel">Weekly Digest aktiv</span>
              <Select
                value={String(settingsForm.weeklyDigestEnabled)}
                onChange={(event) =>
                  setSettingsForm((prev) => ({
                    ...prev,
                    weeklyDigestEnabled: event.target.value === "true"
                  }))
                }
                disabled={!canManageSettings}
                options={[
                  { value: "true", label: "Ja" },
                  { value: "false", label: "Nein" }
                ]}
              />
            </div>
            <div className="formField">
              <span className="fieldLabel">Daily Digest Stunde</span>
              <Input
                type="number"
                value={String(settingsForm.dailyDigestHourLocal)}
                onChange={(event) =>
                  setSettingsForm((prev) => ({
                    ...prev,
                    dailyDigestHourLocal: Number.parseInt(event.target.value || "0", 10)
                  }))
                }
                disabled={!canManageSettings}
              />
            </div>
            <div className="formField">
              <span className="fieldLabel">Weekly Digest Wochentag (1-7)</span>
              <Input
                type="number"
                value={String(settingsForm.weeklyDigestWeekday)}
                onChange={(event) =>
                  setSettingsForm((prev) => ({
                    ...prev,
                    weeklyDigestWeekday: Number.parseInt(event.target.value || "1", 10)
                  }))
                }
                disabled={!canManageSettings}
              />
            </div>
          </div>
        </Card>
      )}

      {activeTab === "system" && overview ? (
        <>
          <Card>
            <h2 className="sectionTitle">Dispatcher-Konfiguration</h2>
            <p>Dispatch aktiv: {overview.dispatchConfig.dispatchEnabled ? "Ja" : "Nein"}</p>
            <p>Dry-Run: {overview.dispatchConfig.dryRun ? "Ja" : "Nein"}</p>
            <p>Max Attempts: {overview.dispatchConfig.maxAttempts}</p>
            <p>Batch Size: {overview.dispatchConfig.batchSize}</p>
            <p>Timeout: {overview.dispatchConfig.timeoutMs} ms</p>
            <p>Claim Lease: {overview.dispatchConfig.claimLeaseSeconds} s</p>
            <p>Zeitzone: {overview.dispatchConfig.timeZone}</p>
            <p>Base URL: {overview.dispatchConfig.notificationBaseUrl}</p>
            <p>Webhook konfiguriert: {overview.dispatchConfig.webhookConfigured ? "Ja" : "Nein"}</p>
            <p>Secret konfiguriert: {overview.dispatchConfig.secretConfigured ? "Ja" : "Nein"}</p>
          </Card>
          <Card>
            <h2 className="sectionTitle">Worker-Status</h2>
            <p>Worker: {overview.workerStatus?.workerKey || "Nicht verfuegbar"}</p>
            <p>Letzter Start: {formatDateTime(overview.workerStatus?.lastStartedAt)}</p>
            <p>Letztes Ende: {formatDateTime(overview.workerStatus?.lastFinishedAt)}</p>
            <p>Letzter Erfolg: {formatDateTime(overview.workerStatus?.lastSuccessfulAt)}</p>
            <p>Letztes Outcome: {overview.workerStatus?.lastOutcome || "Nicht verfuegbar"}</p>
            <p>Letzter Fehler: {overview.workerStatus?.lastError || "Kein Fehler"}</p>
            <p>Zuletzt geclaimt: {overview.workerStatus?.lastClaimedCount ?? 0}</p>
            <p>Zuletzt verarbeitet: {overview.workerStatus?.lastProcessedCount ?? 0}</p>
          </Card>
        </>
      ) : null}
    </div>
  );
}
