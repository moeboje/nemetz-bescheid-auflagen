import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Badge,
  Breadcrumbs,
  Button,
  Card,
  DataTable,
  IconButton,
  Input,
  Select,
  StatusDot
} from "@nemetz/ui";
import DeadlineModal from "../components/DeadlineModal";
import { EditIcon, EyeIcon } from "../components/Icons";
import { t } from "../i18n";
import { useDeadlines } from "../state/DeadlinesStore";
import { useLegalDocs } from "../state/LegalDocsStore";
import { useProjects } from "../state/ProjectsStore";
import { useScopes } from "../state/ScopesStore";
import { useUsers } from "../state/UsersStore";

const statusVariant = {
  OPEN: "warning",
  DONE: "success",
  OVERDUE: "danger"
} as const;

function getReminderText(daysBefore?: number) {
  if (daysBefore === 0) {
    return t("common.onDueDate");
  }
  if (daysBefore === 1) {
    return t("common.daysBefore.1");
  }
  if (daysBefore === 14) {
    return t("common.daysBefore.14");
  }
  if (daysBefore === 30) {
    return t("common.daysBefore.30");
  }
  return t("common.daysBefore.7");
}

function getPeriodDate(period: string) {
  if (period !== "30" && period !== "90") {
    return "";
  }
  const value = Number(period);
  const target = new Date();
  target.setDate(target.getDate() + value);
  return target.toISOString().slice(0, 10);
}

export default function DeadlinesPage() {
  const navigate = useNavigate();
  const { deadlines, getDeadlineStatus, markDeadlineDone, reopenDeadline } = useDeadlines();
  const { projects } = useProjects();
  const { legalDocs, getEffectiveScopeForLegalDoc } = useLegalDocs();
  const { companies, sites, facilities, getScopeLabel } = useScopes();
  const { getUserLabel } = useUsers();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingDeadlineId, setEditingDeadlineId] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    search: "",
    status: "",
    projectId: "",
    legalDocId: "",
    scopeLabel: "",
    period: "",
    showArchived: false
  });

  const projectOptions = useMemo(
    () =>
      projects
        .filter((project) => !project.archivedAt && !project.isArchived)
        .map((project) => ({ value: project.id, label: project.title })),
    [projects]
  );

  const legalDocOptions = useMemo(() => {
    const scoped = filters.projectId
      ? legalDocs.filter((doc) => doc.projectId === filters.projectId)
      : legalDocs;
    return scoped.map((doc) => ({ value: doc.id, label: doc.title }));
  }, [filters.projectId, legalDocs]);

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

    return Array.from(new Set(labels)).map((label) => ({ value: label, label }));
  }, [companies, facilities, getScopeLabel, sites]);

  const rows = useMemo(() => {
    return deadlines
      .map((deadline) => {
        const legalDoc = legalDocs.find((doc) => doc.id === deadline.legalDocId);
        const project = projects.find(
          (item) => item.id === (deadline.projectId ?? legalDoc?.projectId)
        );
        let scopeLabel = "";
        if (legalDoc) {
          const scope = getEffectiveScopeForLegalDoc(legalDoc);
          if (scope) {
            scopeLabel = getScopeLabel(scope.companyId, scope.siteId, scope.facilityId);
          }
        }
        if (!scopeLabel && project) {
          scopeLabel = getScopeLabel(project.companyId, project.siteId, project.facilityId);
        }

        return {
          ...deadline,
          status: getDeadlineStatus(deadline),
          resolvedProjectId: project?.id ?? deadline.projectId ?? legalDoc?.projectId ?? "",
          projectTitle: project?.title ?? "",
          legalDocTitle: legalDoc?.title ?? "",
          ownerLabel: getUserLabel(deadline.ownerUserId),
          scopeLabel
        };
      })
      .filter((row) => {
        if ((row.isArchived || row.archivedAt) && !filters.showArchived) {
          return false;
        }
        const periodLimit = getPeriodDate(filters.period);
        const matchesSearch = filters.search
          ? row.title.toLowerCase().includes(filters.search.toLowerCase())
          : true;
        const matchesStatus = filters.status ? row.status === filters.status : true;
        const matchesProject = filters.projectId
          ? row.resolvedProjectId === filters.projectId
          : true;
        const matchesLegalDoc = filters.legalDocId ? row.legalDocId === filters.legalDocId : true;
        const matchesScope = filters.scopeLabel ? row.scopeLabel === filters.scopeLabel : true;
        const matchesPeriod = periodLimit ? row.dueDate <= periodLimit : true;
        return (
          matchesSearch &&
          matchesStatus &&
          matchesProject &&
          matchesLegalDoc &&
          matchesScope &&
          matchesPeriod
        );
      })
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [
    deadlines,
    filters.legalDocId,
    filters.period,
    filters.projectId,
    filters.showArchived,
    filters.scopeLabel,
    filters.search,
    filters.status,
    getDeadlineStatus,
    getEffectiveScopeForLegalDoc,
    getScopeLabel,
    getUserLabel,
    legalDocs,
    projects
  ]);

  const columns = [
    {
      key: "status",
      header: t("tasks.table.status"),
      render: (row: (typeof rows)[number]) => (
        <span className="inlineMeta">
          <StatusDot variant={statusVariant[row.status]} />
          <span>
            {row.status === "OPEN"
              ? t("tasks.status.open")
              : row.status === "DONE"
              ? t("tasks.status.done")
              : t("tasks.status.overdue")}
          </span>
        </span>
      )
    },
    {
      key: "title",
      header: t("deadlines.table.title"),
      render: (row: (typeof rows)[number]) => row.title
    },
    {
      key: "dueDate",
      header: t("deadlines.table.dueDate"),
      render: (row: (typeof rows)[number]) => row.dueDate
    },
    {
      key: "project",
      header: t("deadlines.table.project"),
      render: (row: (typeof rows)[number]) => row.projectTitle || t("common.notAvailable")
    },
    {
      key: "legalDoc",
      header: t("deadlines.table.legalDoc"),
      render: (row: (typeof rows)[number]) => row.legalDocTitle || t("common.notAvailable")
    },
    {
      key: "owner",
      header: t("deadlines.table.owner"),
      render: (row: (typeof rows)[number]) => row.ownerLabel || t("common.notAssigned")
    },
    {
      key: "scope",
      header: t("deadlines.table.scope"),
      render: (row: (typeof rows)[number]) => row.scopeLabel || t("common.notAvailable")
    },
    {
      key: "emailReminder",
      header: t("deadlines.table.emailReminder"),
      render: (row: (typeof rows)[number]) =>
        row.emailReminderEnabled ? (
          <span className="inlineMeta">
            <Badge variant="neutral">{t("common.email")}</Badge>
            <span>{getReminderText(row.emailReminderDaysBefore)}</span>
          </span>
        ) : (
          t("common.notAvailable")
        )
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
              { key: "deadlines", label: t("breadcrumb.deadlines") }
            ]}
          />
          <h1 className="pageTitle">{t("deadlines.title")}</h1>
        </div>
        <Button onClick={() => setModalOpen(true)}>{t("deadlines.new")}</Button>
      </div>

      <Card>
        <div className="filterRowSix">
          <Input
            placeholder={t("deadlines.filters.search")}
            value={filters.search}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, search: event.target.value }))
            }
          />
          <Select
            options={[
              { value: "", label: t("deadlines.filters.status") },
              { value: "OPEN", label: t("tasks.status.open") },
              { value: "DONE", label: t("tasks.status.done") },
              { value: "OVERDUE", label: t("tasks.status.overdue") }
            ]}
            value={filters.status}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, status: event.target.value }))
            }
          />
          <Select
            options={[{ value: "", label: t("deadlines.filters.project") }, ...projectOptions]}
            value={filters.projectId}
            onChange={(event) =>
              setFilters((prev) => ({
                ...prev,
                projectId: event.target.value,
                legalDocId: ""
              }))
            }
          />
          <Select
            options={[{ value: "", label: t("deadlines.filters.legalDoc") }, ...legalDocOptions]}
            value={filters.legalDocId}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, legalDocId: event.target.value }))
            }
          />
          <Select
            options={[{ value: "", label: t("deadlines.filters.scope") }, ...scopeOptions]}
            value={filters.scopeLabel}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, scopeLabel: event.target.value }))
            }
          />
          <Select
            options={[
              { value: "", label: t("deadlines.filters.period") },
              { value: "30", label: t("tasks.filters.period.30") },
              { value: "90", label: t("tasks.filters.period.90") },
              { value: "CUSTOM", label: t("tasks.filters.period.custom") }
            ]}
            value={filters.period}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, period: event.target.value }))
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
        data={rows}
        getRowKey={(row) => row.id}
        rowActions={(row) => (
          <div className="tableActions">
            {row.status === "DONE" ? (
              <Button size="sm" variant="ghost" onClick={() => reopenDeadline(row.id)}>
                {t("deadlines.action.reopen")}
              </Button>
            ) : (
              <Button size="sm" variant="secondary" onClick={() => markDeadlineDone(row.id)}>
                {t("deadlines.action.markDone")}
              </Button>
            )}
            <IconButton
              ariaLabel={t("common.view")}
              onClick={() => navigate(`/deadlines/${row.id}`)}
            >
              <EyeIcon />
            </IconButton>
            <IconButton
              ariaLabel={t("common.edit")}
              onClick={() => {
                setEditingDeadlineId(row.id);
                setModalOpen(true);
              }}
            >
              <EditIcon />
            </IconButton>
          </div>
        )}
      />

      <DeadlineModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingDeadlineId(null);
        }}
        deadline={deadlines.find((item) => item.id === editingDeadlineId)}
      />
    </div>
  );
}
