import React, { useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
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
import { useRuntimeConfig } from "../config/runtimeConfig";
import { EyeIcon } from "../components/Icons";
import HelpHintCard from "../components/HelpHintCard";
import { HELP_CONTEXT_SLUGS, getHelpHref } from "../help/helpContent";
import { exportTasksToIcs } from "../services/icsExport";
import { useTasks } from "../state/TasksStore";
import { useProjects } from "../state/ProjectsStore";
import { useLegalDocs } from "../state/LegalDocsStore";
import { useScopes } from "../state/ScopesStore";
import { useAuthorization } from "../state/AuthorizationStore";
import EvidenceListModal from "../components/EvidenceListModal";
import TaskCompleteModal from "../components/TaskCompleteModal";
import UserSelect from "../components/UserSelect";
import type { DocumentOwnerType } from "../api/documents";
import { createEvidenceUploadError, uploadEvidenceDocument, uploadEvidenceDocuments } from "../services/evidenceDocuments";
import { canUploadTaskEvidence } from "../services/taskEvidencePermissions";
import {
  getPendingEvidenceFilesToUpload,
  mergeEvidenceDocumentIds,
  mergeUploadedEvidenceFiles,
  type UploadedEvidenceFile
} from "../services/evidenceUploadRetry";

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

type CompletionUploadCache = {
  taskId: string | null;
  uploadedFiles: UploadedEvidenceFile[];
};

function getPeriodLimit(period: string) {
  if (period !== "30" && period !== "90" && period !== "365") {
    return "";
  }
  const date = new Date();
  date.setDate(date.getDate() + Number(period));
  return date.toISOString().slice(0, 10);
}

function getTaskEvidenceOwner(task?: { type: string; id: string; deadlineId?: string }) {
  if (!task) {
    return null;
  }
  if (task.type === "DEADLINE") {
    return task.deadlineId ? { ownerType: "DEADLINE" as DocumentOwnerType, ownerId: task.deadlineId } : null;
  }
  return { ownerType: "TASK_EVIDENCE" as DocumentOwnerType, ownerId: task.id };
}

export default function TasksPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const runtimeConfig = useRuntimeConfig();
  const { tasks, markTaskDoneWithEvidence, reopenTask } = useTasks();
  const { projects } = useProjects();
  const { legalDocs } = useLegalDocs();
  const { companies, sites, facilities, getScopeLabel } = useScopes();
  const { actor, permissions } = useAuthorization();
  const [completionTaskId, setCompletionTaskId] = useState<string | null>(null);
  const [evidenceTaskId, setEvidenceTaskId] = useState<string | null>(null);
  const [completionUploadCache, setCompletionUploadCache] = useState<CompletionUploadCache>({
    taskId: null,
    uploadedFiles: []
  });

  const [filters, setFilters] = useState({
    search: "",
    status: "",
    type: "",
    level: "",
    period: "365",
    scopeLabel: "",
    projectId: "",
    legalDocId: "",
    assigneeUserId: ""
  });

  const projectOptions = useMemo(
    () => projects.map((project) => ({ value: project.id, label: project.title })),
    [projects]
  );

  const legalDocOptions = useMemo(
    () => legalDocs.map((doc) => ({ value: doc.id, label: doc.title })),
    [legalDocs]
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
    const obligationQuery = new URLSearchParams(location.search).get("obligationId");
    const periodLimit = getPeriodLimit(filters.period);
    const today = new Date().toISOString().slice(0, 10);
    return tasks.filter((task) => {
      if (actor.isExternal && task.assignedToUserId !== actor.userId) {
        return false;
      }
      const matchesSearch = filters.search
        ? task.title.toLowerCase().includes(filters.search.toLowerCase())
        : true;
      const matchesStatus = filters.status ? task.status === filters.status : true;
      const matchesType = filters.type ? task.type === filters.type : true;
      const matchesLevel = filters.level ? task.obligationLevel === filters.level : true;
      const matchesScope = filters.scopeLabel ? task.scopeLabel === filters.scopeLabel : true;
      const matchesProject = filters.projectId ? task.projectId === filters.projectId : true;
      const matchesLegalDoc = filters.legalDocId ? task.legalDocId === filters.legalDocId : true;
      const matchesAssignee = filters.assigneeUserId
        ? task.assignedToUserId === filters.assigneeUserId
        : true;
      const matchesPeriod = periodLimit ? task.dueDate >= today && task.dueDate <= periodLimit : true;
      const matchesObligationQuery = obligationQuery
        ? task.obligationId === obligationQuery
        : true;
      return (
        matchesSearch &&
        matchesStatus &&
        matchesType &&
        matchesLevel &&
        matchesScope &&
        matchesProject &&
        matchesLegalDoc &&
        matchesAssignee &&
        matchesPeriod &&
        matchesObligationQuery
      );
    });
  }, [actor.isExternal, actor.userId, filters, location.search, tasks]);

  const projectTitleById = useMemo(
    () => new Map(projects.map((project) => [project.id, project.title] as const)),
    [projects]
  );
  const canWriteTaskProject = (task: (typeof tasks)[number]) => Boolean(task.projectCanWrite);

  const completionTask = useMemo(
    () => tasks.find((task) => task.id === completionTaskId),
    [completionTaskId, tasks]
  );
  const evidenceTask = useMemo(
    () => tasks.find((task) => task.id === evidenceTaskId),
    [evidenceTaskId, tasks]
  );
  const evidenceOwner = getTaskEvidenceOwner(evidenceTask);

  const handleCalendarExport = () => {
    exportTasksToIcs(
      filteredTasks.map((task) => ({
        ...task,
        projectTitle: task.projectId ? projectTitleById.get(task.projectId) : ""
      })),
      {
        calendarName: t("tasks.action.calendarExport"),
        baseUrl: typeof window !== "undefined" ? window.location.origin : ""
      }
    );
  };

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
      render: (task: (typeof tasks)[number]) =>
        task.assignedToLabel || task.assignedTo || t("tasks.unassigned")
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
        {runtimeConfig.features.enableCalendarExport ? (
          <Button variant="secondary" onClick={handleCalendarExport}>
            {t("tasks.action.calendarExport")}
          </Button>
        ) : null}
      </div>

      {runtimeConfig.features.enableHelpHints ? (
        <HelpHintCard
          hintId="hint.tasks"
          titleKey="helpHints.tasks.title"
          bulletsKeys={[
            "helpHints.tasks.bullets.1",
            "helpHints.tasks.bullets.2",
            "helpHints.tasks.bullets.3"
          ]}
          link={{ labelKey: "common.openHelp", to: getHelpHref(HELP_CONTEXT_SLUGS.tasks) }}
        />
      ) : null}

      <Card>
        <div className="filterRowNine">
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
            options={[
              { value: "", label: t("tasks.filters.period") },
              { value: "30", label: t("tasks.filters.period.30") },
              { value: "90", label: t("tasks.filters.period.90") },
              { value: "365", label: t("reports.filters.period.365") }
            ]}
            value={filters.period}
            onChange={(event) =>
              setFilters((prev) => ({ ...prev, period: event.target.value }))
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
          <UserSelect
            value={filters.assigneeUserId || null}
            includeExternal
            allowArchivedCurrentValue
            placeholderKey="tasks.filters.assignee"
            onChange={(userId) =>
              setFilters((prev) => ({ ...prev, assigneeUserId: userId ?? "" }))
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
              <>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!permissions.canCompleteTasks || !canWriteTaskProject(task)}
                  onClick={() => setCompletionTaskId(task.id)}
                >
                  {t("tasks.actions.complete")}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setEvidenceTaskId(task.id)}>
                  {t("tasks.actions.viewEvidence")}
                </Button>
              </>
            ) : (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!permissions.canEditTasks || !canWriteTaskProject(task)}
                  onClick={() => reopenTask(task.id)}
                >
                  {t("tasks.action.reopen")}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setEvidenceTaskId(task.id)}>
                  {t("tasks.actions.viewEvidence")}
                </Button>
              </>
            )}
          </div>
        )}
      />

      <TaskCompleteModal
        open={Boolean(completionTaskId)}
        task={completionTask}
        onClose={() => {
          setCompletionUploadCache({ taskId: null, uploadedFiles: [] });
          setCompletionTaskId(null);
        }}
        onSaved={async (input) => {
          if (!completionTaskId) {
            return;
          }
          const owner = getTaskEvidenceOwner(completionTask);
          const uploadBeforeComplete = Boolean(owner && input.files.length && completionTask?.type === "OBLIGATION");
          const cachedUploadedFiles =
            completionUploadCache.taskId === completionTaskId ? completionUploadCache.uploadedFiles : [];
          let uploadedFiles = cachedUploadedFiles;
          let evidenceDocumentIds = mergeEvidenceDocumentIds(
            input.evidenceDocumentIds,
            uploadedFiles.map((entry) => entry.documentId)
          );

          if (owner && uploadBeforeComplete) {
            const pendingUploads = getPendingEvidenceFilesToUpload(input.files, uploadedFiles);
            for (const pendingUpload of pendingUploads) {
              try {
                const uploadedDocument = await uploadEvidenceDocument(owner.ownerType, owner.ownerId, pendingUpload.file);
                const uploadedFile = {
                  fileKey: pendingUpload.fileKey,
                  documentId: uploadedDocument.id
                };
                uploadedFiles = mergeUploadedEvidenceFiles(uploadedFiles, uploadedFile);
                evidenceDocumentIds = mergeEvidenceDocumentIds(evidenceDocumentIds, [uploadedDocument.id]);
                setCompletionUploadCache((previous) => ({
                  taskId: completionTaskId,
                  uploadedFiles:
                    previous.taskId === completionTaskId
                      ? mergeUploadedEvidenceFiles(previous.uploadedFiles, uploadedFile)
                      : [uploadedFile]
                }));
              } catch {
                throw createEvidenceUploadError(t("documents.uploadError"), { completionSaved: false });
              }
            }
          }

          const completed = await markTaskDoneWithEvidence(completionTaskId, {
            note: input.note,
            outcome: input.outcome,
            attachments: input.attachments,
            evidenceDocumentIds
          });
          if (!completed) {
            throw new Error(t("tasks.complete.saveError"));
          }
          setCompletionUploadCache({ taskId: null, uploadedFiles: [] });
          if (owner && input.files.length && !uploadBeforeComplete) {
            try {
              await uploadEvidenceDocuments(owner.ownerType, owner.ownerId, input.files);
            } catch {
              throw createEvidenceUploadError(t("evidence.documents.partialTaskUploadError"));
            }
          }
        }}
      />

      <EvidenceListModal
        open={Boolean(evidenceTaskId)}
        onClose={() => setEvidenceTaskId(null)}
        title={t("tasks.actions.viewEvidence")}
        evidence={evidenceTask?.evidence ?? []}
        ownerType={evidenceOwner?.ownerType}
        ownerId={evidenceOwner?.ownerId}
        allowUpload={canUploadTaskEvidence({
          ownerType: evidenceOwner?.ownerType,
          projectCanWrite: evidenceTask?.projectCanWrite,
          canCompleteTasks: permissions.canCompleteTasks,
          canEditDeadlines: permissions.canEditDeadlines,
          isExternal: actor.isExternal
        })}
        allowManage={Boolean(
          !actor.isExternal &&
            evidenceOwner?.ownerType === "DEADLINE" &&
            evidenceTask?.projectCanWrite &&
            permissions.canEditDeadlines
        )}
      />
    </div>
  );
}
