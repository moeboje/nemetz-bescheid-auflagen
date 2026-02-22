import React, { useMemo } from "react";
import { Breadcrumbs, Card, DataTable, StatusDot } from "@nemetz/ui";
import { t } from "../i18n";
import { useTasks } from "../state/TasksStore";
import { useDeadlines } from "../state/DeadlinesStore";

const statusVariant = {
  OVERDUE: "danger"
} as const;

export default function DashboardPage() {
  const { tasks } = useTasks();
  const { deadlines, getDeadlineStatus } = useDeadlines();

  const overdueTasks = useMemo(
    () => tasks.filter((task) => task.status === "OVERDUE").slice(0, 5),
    [tasks]
  );

  const stats = useMemo(() => {
    const openTasks = tasks.filter((task) => task.status === "OPEN" || task.status === "IN_PROGRESS")
      .length;
    const overdue = tasks.filter((task) => task.status === "OVERDUE").length;
    const dueSoon = tasks.filter((task) => task.status !== "DONE").slice(0, 30).length;
    const deadlinesOpen = deadlines.filter((deadline) => getDeadlineStatus(deadline) !== "DONE").length;
    return [
      { key: "openTasks", label: t("dashboard.stats.openTasks"), value: String(openTasks) },
      { key: "overdue", label: t("dashboard.stats.overdue"), value: String(overdue) },
      { key: "dueSoon", label: t("dashboard.stats.dueSoon"), value: String(dueSoon) },
      { key: "deadlines", label: t("dashboard.stats.deadlines"), value: String(deadlinesOpen) }
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
    </div>
  );
}
