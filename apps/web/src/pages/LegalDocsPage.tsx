import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Breadcrumbs,
  Button,
  Card,
  DataTable,
  IconButton,
  Input,
  Select
} from "@nemetz/ui";
import { t } from "../i18n";
import { EyeIcon, EditIcon } from "../components/Icons";
import { useLegalDocs } from "../state/LegalDocsStore";
import { useProjects } from "../state/ProjectsStore";
import { useScopes } from "../state/ScopesStore";
import { useObligations } from "../state/ObligationsStore";
import LegalDocModal from "../components/LegalDocModal";

export default function LegalDocsPage() {
  const navigate = useNavigate();
  const { legalDocs, getEffectiveScopeLabel } = useLegalDocs();
  const { projects } = useProjects();
  const { companies, sites, facilities, getScopeLabel } = useScopes();
  const { obligations } = useObligations();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    search: "",
    type: "",
    projectId: "",
    scopeLabel: "",
    showArchived: false
  });

  const projectOptions = useMemo(
    () => projects.map((project) => ({ value: project.id, label: project.title })),
    [projects]
  );

  const scopeOptions = useMemo(() => {
    const activeCompanies = companies.filter((company) => !company.isArchived);
    const activeSites = sites.filter(
      (site) =>
        !site.isArchived && activeCompanies.some((company) => company.id === site.companyId)
    );
    const activeFacilities = facilities.filter(
      (facility) =>
        !facility.isArchived &&
        activeCompanies.some((company) => company.id === facility.companyId) &&
        activeSites.some((site) => site.id === facility.siteId)
    );

    const labels = [
      ...activeCompanies.map((company) => getScopeLabel(company.id)),
      ...activeSites.map((site) => getScopeLabel(site.companyId, site.id)),
      ...activeFacilities.map((facility) =>
        getScopeLabel(facility.companyId, facility.siteId, facility.id)
      )
    ].filter(Boolean);

    const uniqueLabels = Array.from(new Set(labels));
    return uniqueLabels.map((label) => ({ value: label, label }));
  }, [companies, facilities, getScopeLabel, sites]);

  const filteredDocs = useMemo(() => {
    return legalDocs.filter((doc) => {
      if ((doc.isArchived || doc.archivedAt) && !filters.showArchived) {
        return false;
      }
      const project = projects.find((item) => item.id === doc.projectId);
      const matchesSearch = filters.search
        ? doc.title.toLowerCase().includes(filters.search.toLowerCase())
        : true;
      const matchesType = filters.type ? doc.type === filters.type : true;
      const matchesProject = filters.projectId ? doc.projectId === filters.projectId : true;
      const scopeLabel = getEffectiveScopeLabel(doc);
      const matchesScope = filters.scopeLabel ? scopeLabel === filters.scopeLabel : true;
      return matchesSearch && matchesType && matchesProject && matchesScope && !!project;
    });
  }, [filters, getEffectiveScopeLabel, legalDocs, projects]);

  const columns = [
    {
      key: "title",
      header: t("legalDocs.table.title"),
      render: (doc: (typeof legalDocs)[number]) => doc.title
    },
    {
      key: "type",
      header: t("legalDocs.table.type"),
      render: (doc: (typeof legalDocs)[number]) =>
        doc.type === "PERMIT"
          ? t("legalDocs.types.permit")
          : doc.type === "DIRECTIVE"
          ? t("legalDocs.types.directive")
          : doc.type === "OTHER"
          ? t("legalDocs.types.other")
          : t("legalDocs.types.decision")
    },
    {
      key: "project",
      header: t("legalDocs.table.project"),
      render: (doc: (typeof legalDocs)[number]) =>
        projects.find((project) => project.id === doc.projectId)?.title ??
        t("common.notAvailable")
    },
    {
      key: "reference",
      header: t("legalDocs.table.reference"),
      render: (doc: (typeof legalDocs)[number]) => doc.reference ?? t("common.notAvailable")
    },
    {
      key: "scope",
      header: t("legalDocs.table.scope"),
      render: (doc: (typeof legalDocs)[number]) =>
        getEffectiveScopeLabel(doc) || t("legalDocs.scope.unknown")
    },
    {
      key: "obligations",
      header: t("legalDocs.table.obligations"),
      render: (doc: (typeof legalDocs)[number]) =>
        obligations.filter((obligation) => obligation.legalDocId === doc.id).length
    },
    {
      key: "updated",
      header: t("legalDocs.table.updated"),
      render: (doc: (typeof legalDocs)[number]) => doc.updatedAt
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
              { key: "legalDocs", label: t("breadcrumb.legalDocs") }
            ]}
          />
          <h1 className="pageTitle">{t("legalDocs.title")}</h1>
        </div>
        <Button onClick={() => setModalOpen(true)}>{t("legalDocs.action.new")}</Button>
      </div>

      <Card>
        <div className="filterRowFour">
          <Input
            placeholder={t("legalDocs.filters.search")}
            value={filters.search}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, search: event.target.value }))
            }
          />
          <Select
            options={[
              { value: "", label: t("legalDocs.filters.type") },
              { value: "PERMIT", label: t("legalDocs.types.permit") },
              { value: "DIRECTIVE", label: t("legalDocs.types.directive") },
              { value: "OTHER", label: t("legalDocs.types.other") },
              { value: "DECISION", label: t("legalDocs.types.decision") }
            ]}
            value={filters.type}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, type: event.target.value }))
            }
          />
          <Select
            options={[{ value: "", label: t("legalDocs.filters.project") }, ...projectOptions]}
            value={filters.projectId}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, projectId: event.target.value }))
            }
          />
          <Select
            options={[{ value: "", label: t("legalDocs.filters.scope") }, ...scopeOptions]}
            value={filters.scopeLabel}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, scopeLabel: event.target.value }))
            }
          />
        </div>
        <div className="sectionSpacer" />
        <label className="checkboxRow">
          <input
            type="checkbox"
            checked={filters.showArchived}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, showArchived: event.target.checked }))
            }
          />
          <span>{t("common.showArchived")}</span>
        </label>
      </Card>

      <DataTable
        columns={columns}
        data={filteredDocs}
        getRowKey={(doc) => doc.id}
        className="tableSticky"
        rowActions={(doc) => (
          <div className="tableActions">
            <IconButton
              ariaLabel={t("legalDocs.action.view")}
              onClick={() => navigate(`/legal-docs/${doc.id}`)}
            >
              <EyeIcon />
            </IconButton>
            <IconButton
              ariaLabel={t("legalDocs.action.edit")}
              onClick={() => {
                setEditingDocId(doc.id);
                setModalOpen(true);
              }}
            >
              <EditIcon />
            </IconButton>
          </div>
        )}
      />

      <LegalDocModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingDocId(null);
        }}
        legalDoc={legalDocs.find((doc) => doc.id === editingDocId)}
      />
    </div>
  );
}
