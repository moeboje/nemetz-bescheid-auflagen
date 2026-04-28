import React, { useMemo, useState } from "react";
import { Breadcrumbs, Button, Card, DataTable, Select } from "@nemetz/ui";
import HelpHintCard from "../components/HelpHintCard";
import { useRuntimeConfig } from "../config/runtimeConfig";
import { HELP_CONTEXT_SLUGS, getHelpHref } from "../help/helpContent";
import { t } from "../i18n";
import { useNotifications } from "../state/NotificationsStore";

function getTypeLabel(type: "REMINDER" | "OVERDUE" | "SYSTEM") {
  if (type === "REMINDER") {
    return t("notifications.type.reminder");
  }
  if (type === "OVERDUE") {
    return t("notifications.type.overdue");
  }
  return t("notifications.type.system");
}

function getStatusLabel(row: {
  dismissedAt?: string;
  snoozedUntil?: string;
}) {
  if (row.dismissedAt) {
    return t("notifications.status.dismissed");
  }
  if (row.snoozedUntil && row.snoozedUntil > new Date().toISOString().slice(0, 10)) {
    return `${t("notifications.status.snoozed")} (${row.snoozedUntil})`;
  }
  return t("notifications.status.active");
}

export default function NotificationsPage() {
  const runtimeConfig = useRuntimeConfig();
  const { notifications, dismissNotification, snoozeNotification } = useNotifications();
  const [filters, setFilters] = useState({
    type: "",
    dismissed: ""
  });

  const filtered = useMemo(
    () =>
      notifications.filter((notification) => {
        const matchesType = filters.type ? notification.type === filters.type : true;
        const matchesDismissed =
          filters.dismissed === "dismissed"
            ? Boolean(notification.dismissedAt)
            : filters.dismissed === "active"
            ? !notification.dismissedAt
            : true;
        return matchesType && matchesDismissed;
      }),
    [filters.dismissed, filters.type, notifications]
  );

  const columns = [
    {
      key: "createdAt",
      header: t("notifications.table.createdAt"),
      render: (row: (typeof filtered)[number]) => row.createdAt.slice(0, 16).replace("T", " ")
    },
    {
      key: "type",
      header: t("notifications.table.type"),
      render: (row: (typeof filtered)[number]) => getTypeLabel(row.type)
    },
    {
      key: "title",
      header: t("notifications.table.title"),
      render: (row: (typeof filtered)[number]) => row.title
    },
    {
      key: "body",
      header: t("notifications.table.body"),
      render: (row: (typeof filtered)[number]) => row.body || t("common.notAvailable")
    },
    {
      key: "status",
      header: t("notifications.table.status"),
      render: (row: (typeof filtered)[number]) => getStatusLabel(row)
    }
  ];

  return (
    <div className="page">
      <div className="pageHeader">
        <div>
          <Breadcrumbs
            ariaLabel={t("breadcrumb.label")}
            items={[
              { key: "home", label: t("breadcrumb.home") },
              { key: "notifications", label: t("notifications.title") }
            ]}
          />
          <h1 className="pageTitle">{t("notifications.title")}</h1>
        </div>
      </div>

      {runtimeConfig.features.enableHelpHints ? (
        <HelpHintCard
          hintId="hint.notifications"
          title="Benachrichtigungen einordnen"
          bullets={[
            "Nicht jede Benachrichtigung ist eine neue fachliche Aufgabe.",
            "Reminder, Overdue-Hinweise und Systemmeldungen haben unterschiedliche Zwecke.",
            "Wenn Sie eine Meldung bearbeiten muessen, oeffnen Sie danach das zugrunde liegende Projekt, Dokument oder die Frist."
          ]}
          link={{
            label: "Passenden Hilfeartikel oeffnen",
            to: getHelpHref(HELP_CONTEXT_SLUGS.notifications)
          }}
        />
      ) : null}

      <Card>
        <div className="filterRowFour">
          <Select
            options={[
              { value: "", label: t("notifications.filters.type") },
              { value: "REMINDER", label: t("notifications.type.reminder") },
              { value: "OVERDUE", label: t("notifications.type.overdue") },
              { value: "SYSTEM", label: t("notifications.type.system") }
            ]}
            value={filters.type}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, type: event.target.value }))
            }
          />
          <Select
            options={[
              { value: "", label: t("notifications.filters.dismissed") },
              { value: "active", label: t("notifications.filters.activeOnly") },
              { value: "dismissed", label: t("notifications.filters.dismissedOnly") }
            ]}
            value={filters.dismissed}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, dismissed: event.target.value }))
            }
          />
        </div>
      </Card>

      <DataTable
        columns={columns}
        data={filtered}
        getRowKey={(row) => row.id}
        rowActions={(row) => (
          <div className="tableActions">
            <Button
              size="sm"
              variant="secondary"
              disabled={Boolean(row.dismissedAt)}
              onClick={() => dismissNotification(row.id)}
            >
              {t("notifications.action.dismiss")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => snoozeNotification(row.id, 7)}>
              {t("notifications.action.snooze7")}
            </Button>
          </div>
        )}
      />
    </div>
  );
}
