import React, { useMemo } from "react";
import { Breadcrumbs, Card, DataTable, StatusDot } from "@nemetz/ui";
import { t } from "../i18n";
import HelpHintCard from "../components/HelpHintCard";
import { useRuntimeConfig } from "../config/runtimeConfig";
import { useTasks } from "../state/TasksStore";
import { useDeadlines } from "../state/DeadlinesStore";
import { useNotifications } from "../state/NotificationsStore";

const statusVariant = {
  OVERDUE: "danger"
} as const;

export default function DashboardPage() {
  const runtimeConfig = useRuntimeConfig();
  const { tasks } = useTasks();
  const { deadlines, getDeadlineStatus } = useDeadlines();
  const { activeNotifications } = useNotifications();

  const overdueTasks = useMemo(
    () => tasks.filter((task) => task.status === "OVERDUE").slice(0, 5),
    [tasks]
  );

  const stats = useMemo(() => {
    const today = new Date();
    const todayStamp = today.toISOString().slice(0, 10);
    const twelveMonthsAgo = new Date(today);
    twelveMonthsAgo.setDate(twelveMonthsAgo.getDate() - 365);
    const twelveMonthsAgoStamp = twelveMonthsAgo.toISOString().slice(0, 10);
    const inThirtyDays = new Date(today);
    inThirtyDays.setDate(inThirtyDays.getDate() + 30);
    const inThirtyDaysStamp = inThirtyDays.toISOString().slice(0, 10);
    const openTasks = tasks.filter((task) => task.status === "OPEN" || task.status === "IN_PROGRESS")
      .length;
    const overdue = tasks.filter((task) => task.status === "OVERDUE").length;
    const dueSoon = tasks.filter(
      (task) =>
        task.status !== "DONE" &&
        task.dueDate >= todayStamp &&
        task.dueDate <= inThirtyDaysStamp
    ).length;
    const deadlinesOpen = deadlines.filter((deadline) => getDeadlineStatus(deadline) !== "DONE").length;
    const tasksInPastYear = tasks.filter(
      (task) => task.dueDate >= twelveMonthsAgoStamp && task.dueDate <= todayStamp
    );
    const doneInPastYear = tasksInPastYear.filter((task) => task.status === "DONE").length;
    const completionRate =
      tasksInPastYear.length > 0
        ? `${Math.round((doneInPastYear / tasksInPastYear.length) * 100)}%`
        : "0%";
    return [
      { key: "openTasks", label: t("dashboard.stats.openTasks"), value: String(openTasks) },
      { key: "overdue", label: t("dashboard.stats.overdue"), value: String(overdue) },
      { key: "dueSoon", label: t("dashboard.stats.dueSoon"), value: String(dueSoon) },
      { key: "deadlines", label: t("dashboard.stats.deadlines"), value: String(deadlinesOpen) },
      {
        key: "completionRate",
        label: t("dashboard.stats.completionRate"),
        value: completionRate
      }
    ];
  }, [deadlines, getDeadlineStatus, tasks]);

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
      render: (task: (typeof tasks)[number]) => task.title
    },
    {
      key: "dueDate",
      header: t("dashboard.overdue.table.due"),
      render: (task: (typeof tasks)[number]) => task.dueDate
    },
    {
      key: "assignee",
      header: t("dashboard.overdue.table.assignee"),
      render: (task: (typeof tasks)[number]) => task.assignedTo
    },
    {
      key: "scope",
      header: t("dashboard.overdue.table.scope"),
      render: (task: (typeof tasks)[number]) => task.scopeLabel
    }
  ];

  const notificationColumns = [
    {
      key: "createdAt",
      header: t("notifications.table.createdAt"),
      render: (row: (typeof activeNotifications)[number]) =>
        row.createdAt.slice(0, 16).replace("T", " ")
    },
    {
      key: "title",
      header: t("notifications.table.title"),
      render: (row: (typeof activeNotifications)[number]) => row.title
    },
    {
      key: "body",
      header: t("notifications.table.body"),
      render: (row: (typeof activeNotifications)[number]) =>
        row.body || t("common.notAvailable")
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
          link={{ labelKey: "common.openHelp", to: "/help" }}
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

      <div className="tableSection">
        <div className="sectionHeader">
          <h2 className="sectionTitle">{t("dashboard.overdue.title")}</h2>
        </div>
        <DataTable columns={columns} data={overdueTasks} getRowKey={(task) => task.id} />
      </div>

      <div className="tableSection">
        <div className="sectionHeader">
          <h2 className="sectionTitle">{t("dashboard.notifications.title")}</h2>
        </div>
        <DataTable
          columns={notificationColumns}
          data={activeNotifications.slice(0, 5)}
          getRowKey={(notification) => notification.id}
        />
      </div>
    </div>
  );
}
