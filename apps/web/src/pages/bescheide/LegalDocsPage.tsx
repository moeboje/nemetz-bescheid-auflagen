import React from "react";
import { Breadcrumbs, Button, Card, DataTable } from "@nemetz/ui";
import { t } from "../../i18n";

type LegalDocRow = {
  id: string;
  title: string;
  type: string;
  project: string;
  reference: string;
};

const legalDocRows: LegalDocRow[] = [
  {
    id: "legal-doc-1",
    title: t("module.fake.legalDoc.1"),
    type: t("legalDocs.types.decision"),
    project: t("module.fake.project.1"),
    reference: "B-2026-001"
  },
  {
    id: "legal-doc-2",
    title: t("module.fake.legalDoc.2"),
    type: t("legalDocs.types.directive"),
    project: t("module.fake.project.2"),
    reference: "A-2026-014"
  },
  {
    id: "legal-doc-3",
    title: t("module.fake.legalDoc.3"),
    type: t("legalDocs.types.permit"),
    project: t("module.fake.project.3"),
    reference: "G-2026-119"
  }
];

const columns = [
  {
    key: "title",
    header: t("legalDocs.table.title"),
    render: (row: LegalDocRow) => row.title
  },
  {
    key: "type",
    header: t("legalDocs.table.type"),
    render: (row: LegalDocRow) => row.type
  },
  {
    key: "project",
    header: t("legalDocs.table.project"),
    render: (row: LegalDocRow) => row.project
  },
  {
    key: "reference",
    header: t("legalDocs.table.reference"),
    render: (row: LegalDocRow) => row.reference
  }
];

export default function BescheideLegalDocsPage() {
  const handleCreateLegalDoc = () => {};

  return (
    <div className="page">
      <div className="pageHeader">
        <div>
          <Breadcrumbs
            ariaLabel={t("breadcrumb.label")}
            items={[
              { key: "home", label: t("breadcrumb.home") },
              { key: "legalDocs", label: t("breadcrumb.legalDocs") }
            ]}
          />
          <h1 className="pageTitle">{t("legalDocs.title")}</h1>
        </div>
        <Button onClick={handleCreateLegalDoc}>{t("module.common.new")}</Button>
      </div>

      <Card>
        <DataTable columns={columns} data={legalDocRows} getRowKey={(row) => row.id} />
      </Card>
    </div>
  );
}
