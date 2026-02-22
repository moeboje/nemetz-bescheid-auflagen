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
import { EyeIcon } from "../components/Icons";
import { useProjects } from "../state/ProjectsStore";
import { useScopes } from "../state/ScopesStore";
import { useAuthorities } from "../state/AuthoritiesStore";
import { useUsers } from "../state/UsersStore";
import { useLegalDocs } from "../state/LegalDocsStore";
import { useTasks } from "../state/TasksStore";
import { useAuthorization } from "../state/AuthorizationStore";
import { ProjectPolicy } from "../policies/ProjectPolicy";
import ProjectModal from "../components/ProjectModal";

export default function ProjectsPage() {
  const navigate = useNavigate();
  const { actor } = useAuthorization();
  const { projects } = useProjects();
  const { companies, sites, facilities, getScopeLabel } = useScopes();
  const { getAuthorityName, authorities } = useAuthorities();
  const { getUserLabel } = useUsers();
  const { legalDocs } = useLegalDocs();
  const { tasks } = useTasks();
  const [modalOpen, setModalOpen] = useState(false);
  const [filters, setFilters] = useState({
    search: "",
    companyId: "",
    siteId: "",
    facilityId: "",
    authorityId: ""
  });

  const activeCompanies = useMemo(
    () => companies.filter((company) => !company.isArchived),
    [companies]
  );

  const activeSites = useMemo(
    () =>
      sites.filter((site) => {
        const company = activeCompanies.find((item) => item.id === site.companyId);
        return !site.isArchived && !!company;
      }),
    [activeCompanies, sites]
  );

  const activeFacilities = useMemo(
    () =>
      facilities.filter((facility) => {
        const company = activeCompanies.find((item) => item.id === facility.companyId);
        const site = activeSites.find((item) => item.id === facility.siteId);
        return !facility.isArchived && !!company && !!site;
      }),
    [activeCompanies, activeSites, facilities]
  );

  const companyOptions = useMemo(
    () => activeCompanies.map((company) => ({ value: company.id, label: company.name })),
    [activeCompanies]
  );

  const siteOptions = useMemo(
    () =>
      activeSites
        .filter((site) => !filters.companyId || site.companyId === filters.companyId)
        .map((site) => ({ value: site.id, label: site.name })),
    [activeSites, filters.companyId]
  );

  const facilityOptions = useMemo(
    () =>
      activeFacilities
        .filter((facility) =>
          filters.companyId ? facility.companyId === filters.companyId : true
        )
        .filter((facility) => (filters.siteId ? facility.siteId === filters.siteId : true))
        .map((facility) => ({ value: facility.id, label: facility.name })),
    [activeFacilities, filters.companyId, filters.siteId]
  );

  const authorityOptions = useMemo(
    () =>
      authorities
        .filter((authority) => !authority.isArchived)
        .map((authority) => ({ value: authority.id, label: authority.name })),
    [authorities]
  );

  const filteredProjects = useMemo(() => {
    return projects.filter((project) => {
      if (project.archivedAt || project.isArchived) {
        return false;
      }
      if (!ProjectPolicy.view(actor, project)) {
        return false;
      }
      const matchesSearch = filters.search
        ? project.title.toLowerCase().includes(filters.search.toLowerCase())
        : true;
      const matchesCompany = filters.companyId ? project.companyId === filters.companyId : true;
      const matchesSite = filters.siteId ? project.siteId === filters.siteId : true;
      const matchesFacility = filters.facilityId
        ? project.facilityId === filters.facilityId
        : true;
      const matchesAuthority = filters.authorityId
        ? project.authorityId === filters.authorityId
        : true;
      return matchesSearch && matchesCompany && matchesSite && matchesFacility && matchesAuthority;
    });
  }, [actor, filters, projects]);

  const columns = [
    {
      key: "title",
      header: t("projects.table.title"),
      render: (project: (typeof projects)[number]) => project.title
    },
    {
      key: "scope",
      header: t("projects.table.scope"),
      render: (project: (typeof projects)[number]) =>
        getScopeLabel(project.companyId, project.siteId, project.facilityId)
    },
    {
      key: "authority",
      header: t("projects.table.authority"),
      render: (project: (typeof projects)[number]) =>
        getAuthorityName(project.authorityId) || project.authorityRef || t("common.notAvailable")
    },
    {
      key: "owner",
      header: t("projects.table.owner"),
      render: (project: (typeof projects)[number]) =>
        getUserLabel(project.ownerUserId) || t("common.notAssigned")
    },
    {
      key: "documentsCount",
      header: t("projects.table.documents"),
      render: (project: (typeof projects)[number]) =>
        legalDocs.filter((doc) => doc.projectId === project.id).length
    },
    {
      key: "openTasksCount",
      header: t("projects.table.openTasks"),
      render: (project: (typeof projects)[number]) =>
        tasks.filter((task) => task.projectId === project.id && task.status !== "DONE")
          .length
    },
    {
      key: "overdueCount",
      header: t("projects.table.overdue"),
      render: (project: (typeof projects)[number]) =>
        tasks.filter((task) => task.projectId === project.id && task.status === "OVERDUE")
          .length
    },
    {
      key: "updated",
      header: t("projects.table.updated"),
      render: (project: (typeof projects)[number]) => project.updatedAt
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
              { key: "projects", label: t("breadcrumb.projects") }
            ]}
          />
          <h1 className="pageTitle">{t("projects.title")}</h1>
        </div>
        <Button disabled={!ProjectPolicy.create(actor)} onClick={() => setModalOpen(true)}>
          {t("projects.action.new")}
        </Button>
      </div>

      <Card>
        <div className="filterRowFive">
          <Input
            placeholder={t("projects.filters.search")}
            value={filters.search}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, search: event.target.value }))
            }
          />
          <Select
            options={[{ value: "", label: t("projects.filters.company") }, ...companyOptions]}
            value={filters.companyId}
            onChange={(event) =>
              setFilters((prev) => ({
                ...prev,
                companyId: event.target.value,
                siteId: "",
                facilityId: ""
              }))
            }
          />
          <Select
            options={[{ value: "", label: t("projects.filters.site") }, ...siteOptions]}
            value={filters.siteId}
            onChange={(event) =>
              setFilters((prev) => ({
                ...prev,
                siteId: event.target.value,
                facilityId: ""
              }))
            }
          />
          <Select
            options={[{ value: "", label: t("projects.filters.facility") }, ...facilityOptions]}
            value={filters.facilityId}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, facilityId: event.target.value }))
            }
          />
          <Select
            options={[
              { value: "", label: t("projects.filters.authority") },
              ...authorityOptions
            ]}
            value={filters.authorityId}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, authorityId: event.target.value }))
            }
          />
        </div>
      </Card>

      <DataTable
        columns={columns}
        data={filteredProjects}
        getRowKey={(project) => project.id}
        className="tableSticky"
        rowActions={(project) => (
          <div className="tableActions">
            <IconButton
              ariaLabel={t("projects.action.view")}
              onClick={() => navigate(project.id)}
            >
              <EyeIcon />
            </IconButton>
          </div>
        )}
      />

      <ProjectModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
