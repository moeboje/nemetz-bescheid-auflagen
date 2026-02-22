import React from "react";
import { Breadcrumbs, Button, Card, DataTable } from "@nemetz/ui";
import { t } from "../../i18n";

type ProjectRow = {
  id: string;
  title: string;
  scope: string;
  owner: string;
  status: string;
};

const projectRows: ProjectRow[] = [
  {
    id: "project-1",
    title: t("module.fake.project.1"),
    scope: t("module.fake.scope.1"),
    owner: t("module.fake.owner.1"),
    status: t("module.status.active")
  },
  {
    id: "project-2",
    title: t("module.fake.project.2"),
    scope: t("module.fake.scope.2"),
    owner: t("module.fake.owner.2"),
    status: t("module.status.active")
  },
  {
    id: "project-3",
    title: t("module.fake.project.3"),
    scope: t("module.fake.scope.3"),
    owner: t("module.fake.owner.3"),
    status: t("module.status.planned")
  }
];

const columns = [
  {
    key: "title",
    header: t("projects.table.title"),
    render: (row: ProjectRow) => row.title
  },
  {
    key: "scope",
    header: t("projects.table.scope"),
    render: (row: ProjectRow) => row.scope
  },
  {
    key: "owner",
    header: t("projects.table.owner"),
    render: (row: ProjectRow) => row.owner
  },
  {
    key: "status",
    header: t("module.projects.table.status"),
    render: (row: ProjectRow) => row.status
  }
];

export default function BescheideProjectsPage() {
  const handleCreateProject = () => {};

  return (
    <div className="page">
      <div className="pageHeader">
        <div>
          <Breadcrumbs
            ariaLabel={t("breadcrumb.label")}
            items={[
              { key: "home", label: t("breadcrumb.home") },
              { key: "projects", label: t("breadcrumb.projects") }
            ]}
          />
          <h1 className="pageTitle">{t("projects.title")}</h1>
        </div>
        <Button onClick={handleCreateProject}>{t("module.common.new")}</Button>
      </div>

      <Card>
        <DataTable columns={columns} data={projectRows} getRowKey={(row) => row.id} />
      </Card>
    </div>
  );
}
