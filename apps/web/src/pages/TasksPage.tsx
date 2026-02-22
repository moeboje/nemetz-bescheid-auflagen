import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Breadcrumbs,
  Button,
  Card,
  DataTable,
  Input,
  Select,
  StatusDot,
  Badge,
  IconButton
} from "@nemetz/ui";
import { t } from "../i18n";
import { EyeIcon } from "../components/Icons";
import { useTasks } from "../state/TasksStore";
import { useProjects } from "../state/ProjectsStore";
import { useLegalDocs } from "../state/LegalDocsStore";
import { useScopes } from "../state/ScopesStore";
import { useUsers } from "../state/UsersStore";

const statusVariant = {
  OPEN: "warning",
  IN_PROGRESS: "neutral",
  DONE: "success",
  OVERDUE: "danger"
} as const;

const levelVariant = {
  MANDATORY: "danger",
  RECOMMENDED: "warning"
} as const;

export default function TasksPage() {
  const navigate = useNavigate();
  const { tasks, markTaskDone, reopenTask } = useTasks();
  const { projects } = useProjects();
  const { legalDocs } = useLegalDocs();
  const { companies, sites, facilities, getScopeLabel } = useScopes();
  const { users } = useUsers();

  const [filters, setFilters] = useState({
    search: "",
    status: "",
    type: "",
    level: "",
    scopeLabel: "",
    projectId: "",
    legalDocId: "",
    assignee: ""
  });

  const projectOptions = useMemo(
    () => projects.map((project) => ({ value: project.id, label: project.title })),
    [projects]
  );

  const legalDocOptions = useMemo(
    () => legalDocs.map((doc) => ({ value: doc.id, label: doc.title })),
    [legalDocs]
  );

  const assigneeOptions = useMemo(
    () => users.map((user) => ({ value: user.displayName, label: user.displayName })),
    [users]
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

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      const matchesSearch = filters.search
        ? task.title.toLowerCase().includes(filters.search.toLowerCase())
        : true;
      const matchesStatus = filters.status ? task.status === filters.status : true;
      const matchesType = filters.type ? task.type === filters.type : true;
      const matchesLevel = filters.level ? task.obligationLevel === filters.level : true;
      const matchesScope = filters.scopeLabel ? task.scopeLabel === filters.scopeLabel : true;
      const matchesProject = filters.projectId ? task.projectId === filters.projectId : true;
      const matchesLegalDoc = filters.legalDocId ? task.legalDocId === filters.legalDocId : true;
      const matchesAssignee = filters.assignee ? task.assignedTo === filters.assignee : true;
      return (
        matchesSearch &&
        matchesStatus &&
        matchesType &&
        matchesLevel &&
        matchesScope &&
        matchesProject &&
        matchesLegalDoc &&
        matchesAssignee
      );
    });
  }, [filters, tasks]);

  const columns = [
    {
      key: "status",
      header: t("tasks.table.status"),
      render: (task: (typeof tasks)[number]) => (
        <span className="inlineMeta">
          <StatusDot variant={statusVariant[task.status]} />
          <span>
            {t(
              task.status === "OPEN"
                ? "tasks.status.open"
                : task.status === "IN_PROGRESS"
                ? "tasks.status.inProgress"
                : task.status === "DONE"
                ? "tasks.status.done"
                : "tasks.status.overdue"
            )}
          </span>
        </span>
      )
    },
    {
      key: "title",
      header: t("tasks.table.title"),
      render: (task: (typeof tasks)[number]) => task.title
    },
    {
      key: "type",
      header: t("tasks.table.type"),
      render: (task: (typeof tasks)[number]) =>
        task.type === "OBLIGATION" ? t("tasks.type.obligation") : t("tasks.type.deadline")
    },
    {
      key: "level",
      header: t("tasks.table.level"),
      render: (task: (typeof tasks)[number]) =>
        task.obligationLevel ? (
          <Badge variant={levelVariant[task.obligationLevel]}>
            {task.obligationLevel === "MANDATORY"
              ? t("tasks.level.mandatory")
              : t("tasks.level.recommended")}
          </Badge>
        ) : (
          t("common.notAvailable")
        )
    },
    {
      key: "dueDate",
      header: t("tasks.table.due"),
      render: (task: (typeof tasks)[number]) => task.dueDate
    },
    {
      key: "assignee",
      header: t("tasks.table.assignee"),
      render: (task: (typeof tasks)[number]) => task.assignedTo || t("common.notAssigned")
    },
    {
      key: "scope",
      header: t("tasks.table.scope"),
      render: (task: (typeof tasks)[number]) => task.scopeLabel || t("common.notAvailable")
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
              { key: "tasks", label: t("breadcrumb.tasks") }
            ]}
          />
          <h1 className="pageTitle">{t("tasks.title")}</h1>
        </div>
      </div>

      <Card>
        <div className="filterRowEight">
          <Input
            placeholder={t("tasks.filters.search")}
            value={filters.search}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, search: event.target.value }))
            }
          />
          <Select
            options={[
              { value: "", label: t("tasks.filters.status") },
              { value: "OPEN", label: t("tasks.status.open") },
              { value: "IN_PROGRESS", label: t("tasks.status.inProgress") },
              { value: "DONE", label: t("tasks.status.done") },
              { value: "OVERDUE", label: t("tasks.status.overdue") }
            ]}
            value={filters.status}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, status: event.target.value }))
            }
          />
          <Select
            options={[
              { value: "", label: t("tasks.filters.type") },
              { value: "OBLIGATION", label: t("tasks.type.obligation") },
              { value: "DEADLINE", label: t("tasks.type.deadline") }
            ]}
            value={filters.type}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, type: event.target.value }))
            }
          />
          <Select
            options={[
              { value: "", label: t("tasks.filters.level") },
              { value: "MANDATORY", label: t("tasks.level.mandatory") },
              { value: "RECOMMENDED", label: t("tasks.level.recommended") }
            ]}
            value={filters.level}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, level: event.target.value }))
            }
          />
          <Select
            options={[{ value: "", label: t("tasks.filters.project") }, ...projectOptions]}
            value={filters.projectId}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, projectId: event.target.value }))
            }
          />
          <Select
            options={[{ value: "", label: t("tasks.filters.legalDoc") }, ...legalDocOptions]}
            value={filters.legalDocId}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, legalDocId: event.target.value }))
            }
          />
          <Select
            options={[{ value: "", label: t("tasks.filters.scope") }, ...scopeOptions]}
            value={filters.scopeLabel}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, scopeLabel: event.target.value }))
            }
          />
          <Select
            options={[{ value: "", label: t("tasks.filters.assignee") }, ...assigneeOptions]}
            value={filters.assignee}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, assignee: event.target.value }))
            }
          />
        </div>
      </Card>

      <DataTable
        columns={columns}
        data={filteredTasks}
        getRowKey={(task) => task.id}
        rowActions={(task) => (
          <div className="tableActions">
            <IconButton
              ariaLabel={t("tasks.action.view")}
              onClick={() =>
                task.type === "OBLIGATION" && task.obligationId
                  ? navigate(`/obligations/${task.obligationId}`)
                  : task.type === "DEADLINE" && task.deadlineId
                  ? navigate(`/deadlines/${task.deadlineId}`)
                  : navigate(`/tasks/${task.id}`)
              }
            >
              <EyeIcon />
            </IconButton>
            {task.status !== "DONE" ? (
              <Button size="sm" variant="secondary" onClick={() => markTaskDone(task.id)}>
                {t("tasks.action.done")}
              </Button>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => reopenTask(task.id)}>
                {t("tasks.action.reopen")}
              </Button>
            )}
          </div>
        )}
      />
    </div>
  );
}
