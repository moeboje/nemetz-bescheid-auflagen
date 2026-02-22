import React from "react";
import { Breadcrumbs, Card, DataTable } from "@nemetz/ui";
import { t } from "../../i18n";

type DashboardRow = {
  id: string;
  project: string;
  obligation: string;
  dueDate: string;
  status: string;
};

const stats = [
  { key: "projects", label: t("module.dashboard.stats.projects"), value: "3" },
  { key: "legalDocs", label: t("module.dashboard.stats.legalDocs"), value: "3" },
  { key: "obligations", label: t("module.dashboard.stats.obligations"), value: "7" },
  { key: "deadlines", label: t("module.dashboard.stats.deadlines"), value: "4" }
];

const tableRows: DashboardRow[] = [
  {
    id: "row-1",
    project: t("module.fake.project.1"),
    obligation: t("module.fake.obligation.1"),
    dueDate: "2026-03-15",
    status: t("tasks.status.open")
  },
  {
    id: "row-2",
    project: t("module.fake.project.2"),
    obligation: t("module.fake.obligation.2"),
    dueDate: "2026-03-22",
    status: t("tasks.status.inProgress")
  },
  {
    id: "row-3",
    project: t("module.fake.project.3"),
    obligation: t("module.fake.obligation.3"),
    dueDate: "2026-04-03",
    status: t("tasks.status.overdue")
  }
];

const columns = [
  {
    key: "project",
    header: t("projects.table.title"),
    render: (row: DashboardRow) => row.project
  },
  {
    key: "obligation",
    header: t("module.dashboard.table.obligation"),
    render: (row: DashboardRow) => row.obligation
  },
  {
    key: "dueDate",
    header: t("deadlines.table.dueDate"),
    render: (row: DashboardRow) => row.dueDate
  },
  {
    key: "status",
    header: t("dashboard.overdue.table.status"),
    render: (row: DashboardRow) => row.status
  }
];

export default function BescheideDashboardPage() {
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
          <h2 className="sectionTitle">{t("module.dashboard.table.title")}</h2>
        </div>
        <Card>
          <DataTable columns={columns} data={tableRows} getRowKey={(row) => row.id} />
        </Card>
      </div>
    </div>
  );
}
