import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Breadcrumbs, Button, Card, DataTable, StatusDot } from "@nemetz/ui";
import {
  getDashboardSummary,
  type DashboardNotificationSummaryItem,
  type DashboardSummary,
  type DashboardTaskSummaryItem
} from "../api/dashboard";
import { ApiError } from "../api/client";
import { t } from "../i18n";
import HelpHintCard from "../components/HelpHintCard";
import { useRuntimeConfig } from "../config/runtimeConfig";
import { HELP_CONTEXT_SLUGS, getHelpHref } from "../help/helpContent";

const statusVariant = {
  OVERDUE: "danger"
} as const;

export default function DashboardPage() {
  const runtimeConfig = useRuntimeConfig();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const loadSummary = useCallback(async () => {
    setIsLoading(true);
    setError("");
    try {
      setSummary(await getDashboardSummary(5));
    } catch (loadError) {
      const timeoutSuffix =
        loadError instanceof ApiError && loadError.status === 504 ? " (504 Gateway Timeout)" : "";
      setError(`${t("dashboard.error.load")}${timeoutSuffix}`);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const stats = useMemo(() => {
    const values = summary?.stats;
    const pendingValue = isLoading ? "..." : "0";
    return [
      {
        key: "openTasks",
        label: t("dashboard.stats.openTasks"),
        value: values ? String(values.openTasks) : pendingValue
      },
      {
        key: "overdue",
        label: t("dashboard.stats.overdue"),
        value: values ? String(values.overdueTasks) : pendingValue
      },
      {
        key: "dueSoon",
        label: t("dashboard.stats.dueSoon"),
        value: values ? String(values.tasksDueSoon) : pendingValue
      },
      {
        key: "deadlines",
        label: t("dashboard.stats.deadlines"),
        value: values ? String(values.openDeadlines) : pendingValue
      },
      {
        key: "completionRate",
        label: t("dashboard.stats.completionRate"),
        value: values ? `${values.completionRatePercent}%` : isLoading ? "..." : "0%"
      }
    ];
  }, [isLoading, summary?.stats]);

  const columns = [
    {
      key: "status",
      header: t("dashboard.overdue.table.status"),
      render: () => (
        <span className="inlineMeta">
          <StatusDot variant={statusVariant.OVERDUE} />
          <span>{t("tasks.status.overdue")}</span>
        </span>
      )
    },
    {
      key: "title",
      header: t("dashboard.overdue.table.title"),
      render: (task: DashboardTaskSummaryItem) => task.title
    },
    {
      key: "dueDate",
      header: t("dashboard.overdue.table.due"),
      render: (task: DashboardTaskSummaryItem) => task.dueDate
    },
    {
      key: "assignee",
      header: t("dashboard.overdue.table.assignee"),
      render: (task: DashboardTaskSummaryItem) => task.assignedTo || t("tasks.unassigned")
    },
    {
      key: "scope",
      header: t("dashboard.overdue.table.scope"),
      render: (task: DashboardTaskSummaryItem) => task.scopeLabel || t("common.notAvailable")
    }
  ];

  const notificationColumns = [
    {
      key: "createdAt",
      header: t("notifications.table.createdAt"),
      render: (row: DashboardNotificationSummaryItem) =>
        row.createdAt.slice(0, 16).replace("T", " ")
    },
    {
      key: "title",
      header: t("notifications.table.title"),
      render: (row: DashboardNotificationSummaryItem) =>
        row.type === "REMINDER"
          ? t("notifications.generated.reminderTitle")
          : t("notifications.generated.overdueTitle")
    },
    {
      key: "body",
      header: t("notifications.table.body"),
      render: (row: DashboardNotificationSummaryItem) =>
        row.title ? `${row.title} - ${row.dueDate}` : t("common.notAvailable")
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
              { key: "dashboard", label: t("breadcrumb.dashboard") }
            ]}
          />
          <h1 className="pageTitle">{t("dashboard.title")}</h1>
        </div>
      </div>

      {runtimeConfig.features.enableHelpHints ? (
        <HelpHintCard
          hintId="hint.dashboard"
          titleKey="helpHints.dashboard.title"
          bulletsKeys={[
            "helpHints.dashboard.bullets.1",
            "helpHints.dashboard.bullets.2",
            "helpHints.dashboard.bullets.3"
          ]}
          link={{ labelKey: "common.openHelp", to: getHelpHref(HELP_CONTEXT_SLUGS.dashboard) }}
        />
      ) : null}

      <div className="cardGrid">
        {stats.map((stat) => (
          <Card key={stat.key}>
            <div className="statCard">
              <div className="statLabel">{stat.label}</div>
              <div className="statValue">{stat.value}</div>
            </div>
          </Card>
        ))}
      </div>

      {error ? (
        <Card>
          <div className="tableActions">
            <p className="validationText">{error}</p>
            <Button variant="secondary" onClick={() => void loadSummary()} disabled={isLoading}>
              {t("dashboard.action.retry")}
            </Button>
          </div>
        </Card>
      ) : null}

      <div className="tableSection">
        <div className="sectionHeader">
          <h2 className="sectionTitle">{t("dashboard.overdue.title")}</h2>
        </div>
        {isLoading && !summary ? (
          <p className="placeholderText">{t("dashboard.loading")}</p>
        ) : null}
        <DataTable
          columns={columns}
          data={summary?.overdueTasks ?? []}
          getRowKey={(task) => task.id}
        />
      </div>

      <div className="tableSection">
        <div className="sectionHeader">
          <h2 className="sectionTitle">{t("dashboard.notifications.title")}</h2>
        </div>
        {isLoading && !summary ? (
          <p className="placeholderText">{t("dashboard.loading")}</p>
        ) : null}
        <DataTable
          columns={notificationColumns}
          data={summary?.notifications ?? []}
          getRowKey={(notification) => notification.id}
        />
      </div>
    </div>
  );
}
