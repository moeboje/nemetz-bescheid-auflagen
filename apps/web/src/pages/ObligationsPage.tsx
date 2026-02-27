import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Breadcrumbs,
  Button,
  Card,
  DataTable,
  IconButton,
  Input,
  Select,
  Badge
} from "@nemetz/ui";
import { t } from "../i18n";
import { useObligations } from "../state/ObligationsStore";
import HelpHintCard from "../components/HelpHintCard";
import { useRuntimeConfig } from "../config/runtimeConfig";
import { useLegalDocs } from "../state/LegalDocsStore";
import { useProjects } from "../state/ProjectsStore";
import { useScopes } from "../state/ScopesStore";
import { useUsers } from "../state/UsersStore";
import { generateTasksFromObligations } from "../state/TasksStore";
import { EyeIcon, EditIcon } from "../components/Icons";
import EmailReminderCompact from "../components/EmailReminderCompact";
import ObligationModal from "../components/ObligationModal";
import RequirementIcons from "../components/RequirementIcons";
import { useAuthorization } from "../state/AuthorizationStore";
import { getUserDisplayName } from "../data/users";

const levelVariant = {
  MANDATORY: "danger",
  RECOMMENDED: "warning"
} as const;

export default function ObligationsPage() {
  const navigate = useNavigate();
  const runtimeConfig = useRuntimeConfig();
  const { obligations } = useObligations();
  const { legalDocs, getEffectiveScopeLabel } = useLegalDocs();
  const { projects } = useProjects();
  const { companies, sites, facilities, getScopeLabel } = useScopes();
  const { listActiveUsers, getUserLabel } = useUsers();
  const { permissions } = useAuthorization();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingObligationId, setEditingObligationId] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    search: "",
    level: "",
    projectId: "",
    legalDocId: "",
    ownerUserId: "",
    scopeLabel: "",
    showArchived: false
  });

  const projectOptions = useMemo(
    () => projects.map((project) => ({ value: project.id, label: project.title })),
    [projects]
  );

  const legalDocOptions = useMemo(
    () => legalDocs.map((doc) => ({ value: doc.id, label: doc.title })),
    [legalDocs]
  );

  const ownerOptions = useMemo(
    () =>
      listActiveUsers({ includeExternal: true, includeInternal: true }).map((user) => ({
        value: user.id,
        label: getUserDisplayName(user)
      })),
    [listActiveUsers]
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

    return Array.from(new Set(labels)).map((label) => ({ value: label, label }));
  }, [companies, facilities, getScopeLabel, sites]);

  const getNextDue = (obligationId: string) => {
    const obligation = obligations.find((item) => item.id === obligationId);
    if (!obligation) {
      return t("common.notAvailable");
    }
    const seeds = generateTasksFromObligations([obligation], 365);
    const today = new Date().toISOString().slice(0, 10);
    const upcoming = seeds
      .map((seed) => seed.dueDate)
      .filter((date) => date >= today)
      .sort();
    return upcoming[0] ?? obligation.firstDueDate ?? t("common.notAvailable");
  };

  const filteredObligations = useMemo(() => {
    return obligations.filter((obligation) => {
      if ((obligation.isArchived || obligation.archivedAt) && !filters.showArchived) {
        return false;
      }
      const doc = legalDocs.find((item) => item.id === obligation.legalDocId);
      const projectId = doc?.projectId;
      const matchesSearch = filters.search
        ? obligation.title.toLowerCase().includes(filters.search.toLowerCase())
        : true;
      const matchesLevel = filters.level ? obligation.level === filters.level : true;
      const matchesProject = filters.projectId ? projectId === filters.projectId : true;
      const matchesDoc = filters.legalDocId ? obligation.legalDocId === filters.legalDocId : true;
      const matchesOwner = filters.ownerUserId
        ? obligation.ownerUserId === filters.ownerUserId
        : true;
      const scopeLabel = doc ? getEffectiveScopeLabel(doc) : "";
      const matchesScope = filters.scopeLabel ? scopeLabel === filters.scopeLabel : true;
      return matchesSearch && matchesLevel && matchesProject && matchesDoc && matchesOwner && matchesScope;
    });
  }, [filters, getEffectiveScopeLabel, legalDocs, obligations]);

  const columns = [
    {
      key: "title",
      header: t("obligations.table.title"),
      render: (row: (typeof obligations)[number]) => row.title
    },
    {
      key: "level",
      header: t("obligations.table.level"),
      render: (row: (typeof obligations)[number]) => (
        <Badge variant={levelVariant[row.level]}>
          {row.level === "MANDATORY" ? t("tasks.level.mandatory") : t("tasks.level.recommended")}
        </Badge>
      )
    },
    {
      key: "legalDoc",
      header: t("obligations.table.legalDoc"),
      render: (row: (typeof obligations)[number]) =>
        legalDocs.find((doc) => doc.id === row.legalDocId)?.title ?? t("common.notAvailable")
    },
    {
      key: "project",
      header: t("obligations.table.project"),
      render: (row: (typeof obligations)[number]) => {
        const doc = legalDocs.find((item) => item.id === row.legalDocId);
        const project = projects.find((projectItem) => projectItem.id === doc?.projectId);
        return project?.title ?? t("common.notAvailable");
      }
    },
    {
      key: "nextDue",
      header: t("obligations.table.nextDue"),
      render: (row: (typeof obligations)[number]) => getNextDue(row.id)
    },
    {
      key: "emailReminder",
      header: t("obligations.table.emailReminder"),
      render: (row: (typeof obligations)[number]) => (
        <EmailReminderCompact
          enabled={row.emailReminderEnabled}
          daysBefore={row.emailReminderDaysBefore ?? null}
        />
      )
    },
    {
      key: "evidence",
      header: t("obligations.table.evidence"),
      render: (row: (typeof obligations)[number]) => (
        <RequirementIcons requirements={row.evidenceRequirements} />
      )
    },
    {
      key: "owner",
      header: t("obligations.table.owner"),
      render: (row: (typeof obligations)[number]) =>
        getUserLabel(row.ownerUserId) || t("common.notAssigned")
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
              { key: "obligations", label: t("breadcrumb.obligations") }
            ]}
          />
          <h1 className="pageTitle">{t("obligations.title")}</h1>
        </div>
        <Button
          disabled={!permissions.canEditObligations}
          onClick={() => setModalOpen(true)}
        >
          {t("obligations.action.new")}
        </Button>
      </div>

      {runtimeConfig.features.enableHelpHints ? (
        <HelpHintCard
          hintId="hint.obligations"
          titleKey="helpHints.obligations.title"
          bulletsKeys={[
            "helpHints.obligations.bullets.1",
            "helpHints.obligations.bullets.2",
            "helpHints.obligations.bullets.3"
          ]}
          link={{ labelKey: "common.openHelp", to: "/help#workflows" }}
        />
      ) : null}

      <Card>
        <div className="filterRowSix">
          <Input
            placeholder={t("obligations.filters.search")}
            value={filters.search}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, search: event.target.value }))
            }
          />
          <Select
            options={[
              { value: "", label: t("obligations.filters.level") },
              { value: "MANDATORY", label: t("tasks.level.mandatory") },
              { value: "RECOMMENDED", label: t("tasks.level.recommended") }
            ]}
            value={filters.level}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, level: event.target.value }))
            }
          />
          <Select
            options={[{ value: "", label: t("obligations.filters.project") }, ...projectOptions]}
            value={filters.projectId}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, projectId: event.target.value }))
            }
          />
          <Select
            options={[{ value: "", label: t("obligations.filters.legalDoc") }, ...legalDocOptions]}
            value={filters.legalDocId}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, legalDocId: event.target.value }))
            }
          />
          <Select
            options={[{ value: "", label: t("obligations.filters.owner") }, ...ownerOptions]}
            value={filters.ownerUserId}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, ownerUserId: event.target.value }))
            }
          />
          <Select
            options={[{ value: "", label: t("obligations.filters.scope") }, ...scopeOptions]}
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
        data={filteredObligations}
        getRowKey={(row) => row.id}
        rowActions={(row) => (
          <div className="tableActions">
            <IconButton
              ariaLabel={t("obligations.action.view")}
              onClick={() => navigate(`/obligations/${row.id}`)}
            >
              <EyeIcon />
            </IconButton>
            <IconButton
              ariaLabel={t("obligations.action.edit")}
              disabled={!permissions.canEditObligations}
              onClick={() => {
                setEditingObligationId(row.id);
                setModalOpen(true);
              }}
            >
              <EditIcon />
            </IconButton>
          </div>
        )}
      />

      <ObligationModal
        open={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingObligationId(null);
        }}
        obligation={obligations.find((item) => item.id === editingObligationId)}
      />
    </div>
  );
}
