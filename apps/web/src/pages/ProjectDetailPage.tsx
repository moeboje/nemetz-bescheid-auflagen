import React, { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Badge,
  Breadcrumbs,
  Button,
  Card,
  DataTable,
  IconButton,
  Modal
} from "@nemetz/ui";
import { t } from "../i18n";
import AuditTimeline from "../components/AuditTimeline";
import DeadlineModal from "../components/DeadlineModal";
import HelpHintCard from "../components/HelpHintCard";
import { EyeIcon, EditIcon } from "../components/Icons";
import DocumentsPanel from "../components/DocumentsPanel";
import CommentsPanel from "../components/CommentsPanel";
import ExternalParticipantModal from "../components/ExternalParticipantModal";
import LegalDocModal from "../components/LegalDocModal";
import ObligationModal from "../components/ObligationModal";
import ProjectChecklistTab from "../components/ProjectChecklistTab";
import ProjectModal from "../components/ProjectModal";
import { useRuntimeConfig } from "../config/runtimeConfig";
import type { ExternalParticipant } from "../data/projects";
import { HELP_CONTEXT_SLUGS, getHelpHref } from "../help/helpContent";
import { ProjectPolicy } from "../policies/ProjectPolicy";
import { useAuditLog } from "../state/AuditLogStore";
import { useAuthorization } from "../state/AuthorizationStore";
import { useAuthorities } from "../state/AuthoritiesStore";
import { useDeadlines } from "../state/DeadlinesStore";
import { useExternalOrgs } from "../state/ExternalOrgsStore";
import { useLegalDocs } from "../state/LegalDocsStore";
import { useObligations } from "../state/ObligationsStore";
import { useProjects } from "../state/ProjectsStore";
import { useScopes } from "../state/ScopesStore";
import { useTasks } from "../state/TasksStore";
import { useUsers } from "../state/UsersStore";
import UserMultiSelect from "../components/UserMultiSelect";
import UserSelect from "../components/UserSelect";
import {
  getProjectStatusBadgeVariant,
  getProjectStatusLabel
} from "../projectStatus";
import {
  getProjectSubmissionTypeBadgeVariant,
  getProjectSubmissionTypeLabel
} from "../projectSubmissionType";
import { todayDateOnlyLocal } from "../utils/dateOnly";

function getExternalTypeLabel(type: ExternalParticipant["type"]) {
  if (type === "LAWYER") {
    return t("projects.external.type.lawyer");
  }
  if (type === "ENGINEERING_OFFICE") {
    return t("projects.external.type.engineeringOffice");
  }
  if (type === "CONSULTANT") {
    return t("projects.external.type.consultant");
  }
  return t("projects.external.type.other");
}

function getExternalAccessStatusLabel(status?: ExternalParticipant["accessStatus"]) {
  if (status === "INVITE_SENT") {
    return t("projects.external.accessStatus.INVITE_SENT");
  }
  if (status === "RESET_REQUIRED") {
    return t("projects.external.accessStatus.RESET_REQUIRED");
  }
  if (status === "LEGACY_ONLY") {
    return t("projects.external.accessStatus.LEGACY_ONLY");
  }
  return t("projects.external.accessStatus.LINKED");
}

function getParticipantUserIds(project?: {
  internalParticipants?: { userId: string }[];
  participantUserIds?: string[];
}) {
  if (project?.internalParticipants?.length) {
    return project.internalParticipants.map((participant) => participant.userId);
  }
  return project?.participantUserIds ?? [];
}

function getTaskStatusLabel(status: "OPEN" | "DONE" | "OVERDUE") {
  if (status === "DONE") {
    return t("tasks.status.done");
  }
  if (status === "OVERDUE") {
    return t("tasks.status.overdue");
  }
  return t("tasks.status.open");
}

function isArchivedEntity(value: { isArchived?: boolean; archivedAt?: string }) {
  return Boolean(value.isArchived || value.archivedAt);
}

function formatObligationDeleteError(error?: string) {
  if (error === "obligation_delete_blocked" || /dependent data/i.test(error ?? "")) {
    return t("obligations.delete.blocked");
  }
  return t("obligations.delete.error");
}

function getIntervalUnitLabel(unit: "DAY" | "WEEK" | "MONTH" | "QUARTER" | "YEAR") {
  switch (unit) {
    case "DAY":
      return t("obligations.interval.day");
    case "WEEK":
      return t("obligations.interval.week");
    case "QUARTER":
      return t("obligations.interval.quarter");
    case "YEAR":
      return t("obligations.interval.year");
    case "MONTH":
    default:
      return t("obligations.interval.month");
  }
}

export default function ProjectDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const runtimeConfig = useRuntimeConfig();
  const { actor, permissions } = useAuthorization();
  const { entries } = useAuditLog();
  const {
    projects,
    updateProject,
    archiveProject,
    restoreProject,
    addExternalParticipant,
    updateExternalParticipant,
    archiveExternalParticipant,
    restoreExternalParticipant
  } = useProjects();
  const {
    obligations,
    archiveObligation,
    deleteObligation: removeObligation,
    clearMutationError
  } = useObligations();
  const { getScopeLabel } = useScopes();
  const { contacts, getAuthorityName, getContactsForAuthority } = useAuthorities();
  const { getUser, getDisplayName } = useUsers();
  const { legalDocs, archiveLegalDoc } = useLegalDocs();
  const { deadlines, archiveDeadline, getDeadlineStatus } = useDeadlines();
  const { tasks } = useTasks();
  const { getExternalOrgById } = useExternalOrgs();

  const [tab, setTab] = useState("overview");
  const [archiveModalOpen, setArchiveModalOpen] = useState(false);
  const [legalDocModalOpen, setLegalDocModalOpen] = useState(false);
  const [editProjectOpen, setEditProjectOpen] = useState(false);
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [deadlineModalOpen, setDeadlineModalOpen] = useState(false);
  const [editingDeadlineId, setEditingDeadlineId] = useState<string | null>(null);
  const [obligationModalOpen, setObligationModalOpen] = useState(false);
  const [editingObligationId, setEditingObligationId] = useState<string | null>(null);
  const [deleteObligationTarget, setDeleteObligationTarget] = useState<(typeof obligations)[number] | null>(null);
  const [deleteObligationError, setDeleteObligationError] = useState("");
  const [isDeleteObligationSubmitting, setIsDeleteObligationSubmitting] = useState(false);
  const [externalModalOpen, setExternalModalOpen] = useState(false);
  const [editingExternalParticipantId, setEditingExternalParticipantId] = useState<string | null>(
    null
  );
  const [showArchivedExternal, setShowArchivedExternal] = useState(false);
  const checklistTabEnabled = runtimeConfig.features.enableProjectChecklists;

  const project = useMemo(() => projects.find((item) => item.id === id), [id, projects]);
  const scopeLabel = project
    ? getScopeLabel(project.companyId, project.siteId, project.facilityId)
    : "";
  const authorityName = getAuthorityName(project?.authorityId);
  const authorityContacts = getContactsForAuthority(project?.authorityId);
  const contactName =
    contacts.find((contact) => contact.id === project?.authorityContactId)?.name ??
    authorityContacts.find((contact) => contact.id === project?.authorityContactId)?.name;

  const projectDocs = useMemo(
    () =>
      legalDocs.filter(
        (doc) => doc.projectId === project?.id && !doc.isArchived && !doc.archivedAt
      ),
    [legalDocs, project?.id]
  );
  const projectAllDocs = useMemo(
    () => legalDocs.filter((doc) => doc.projectId === project?.id),
    [legalDocs, project?.id]
  );
  const projectDocIds = useMemo(() => new Set(projectDocs.map((doc) => doc.id)), [projectDocs]);
  const projectAllDocIds = useMemo(
    () => new Set(projectAllDocs.map((doc) => doc.id)),
    [projectAllDocs]
  );

  const projectDeadlines = useMemo(
    () =>
      deadlines.filter((deadline) => {
        if (deadline.isArchived || deadline.archivedAt) {
          return false;
        }
        if (deadline.projectId === project?.id) {
          return true;
        }
        if (deadline.legalDocId && projectDocIds.has(deadline.legalDocId)) {
          return true;
        }
        return false;
      }),
    [deadlines, project?.id, projectDocIds]
  );

  const projectObligations = useMemo(
    () =>
      obligations.filter(
        (obligation) =>
          !obligation.isArchived &&
          !obligation.archivedAt &&
          projectDocIds.has(obligation.legalDocId)
      ),
    [obligations, projectDocIds]
  );
  const projectObligationRows = useMemo(
    () => obligations.filter((obligation) => projectAllDocIds.has(obligation.legalDocId)),
    [obligations, projectAllDocIds]
  );

  const legalDocById = useMemo(
    () => new Map(projectAllDocs.map((doc) => [doc.id, doc] as const)),
    [projectAllDocs]
  );

  const predecessorProjects = useMemo(
    () =>
      (project?.dependsOnProjectIds ?? []).map((projectId) => {
        const linkedProject = projects.find((item) => item.id === projectId);
        return {
          id: projectId,
          title: linkedProject?.title ?? projectId,
          missing: !linkedProject,
          isArchived: linkedProject ? isArchivedEntity(linkedProject) : false
        };
      }),
    [project?.dependsOnProjectIds, projects]
  );

  const dependentProjects = useMemo(
    () =>
      projects.filter(
        (candidate) =>
          candidate.id !== project?.id &&
          (candidate.dependsOnProjectIds ?? []).includes(project?.id ?? "")
      ),
    [project?.id, projects]
  );

  const referenceLegalDocs = useMemo(
    () =>
      (project?.referenceLegalDocIds ?? []).map((legalDocId) => {
        const linkedDoc = legalDocs.find((item) => item.id === legalDocId);
        return {
          id: legalDocId,
          title: linkedDoc?.title ?? legalDocId,
          missing: !linkedDoc,
          isArchived: linkedDoc ? isArchivedEntity(linkedDoc) : false
        };
      }),
    [legalDocs, project?.referenceLegalDocIds]
  );

  const historyEntries = useMemo(() => {
    if (!project) {
      return [];
    }
    const legalDocIdSet = new Set(projectDocs.map((doc) => doc.id));
    const obligationIdSet = new Set(projectObligations.map((obligation) => obligation.id));
    const deadlineIdSet = new Set(projectDeadlines.map((deadline) => deadline.id));

    return entries.filter((entry) => {
      if (entry.entityType === "PROJECT" && entry.entityId === project.id) {
        return true;
      }
      if (entry.entityType === "LEGAL_DOC" && legalDocIdSet.has(entry.entityId)) {
        return true;
      }
      if (entry.entityType === "OBLIGATION" && obligationIdSet.has(entry.entityId)) {
        return true;
      }
      if (entry.entityType === "DEADLINE" && deadlineIdSet.has(entry.entityId)) {
        return true;
      }
      return false;
    });
  }, [entries, project, projectDeadlines, projectDocs, projectObligations]);
  React.useEffect(() => {
    if (!checklistTabEnabled && tab === "checklist") {
      setTab("overview");
    }
  }, [checklistTabEnabled, tab]);
  React.useEffect(() => {
    if (tab === "obligations" && !(permissions.canViewProjects && permissions.canViewObligations && !actor.isExternal)) {
      setTab("overview");
    }
  }, [actor.isExternal, permissions.canViewObligations, permissions.canViewProjects, tab]);

  if (!project) {
    return (
      <div className="page">
        <Card>
          <p className="placeholderText">{t("projects.detail.notFound")}</p>
        </Card>
      </div>
    );
  }

  const canView = ProjectPolicy.view(actor, project);
  const canUpdate = ProjectPolicy.update(actor, project);
  const canArchive = ProjectPolicy.archive(actor, project);
  const canViewObligationsTab =
    permissions.canViewProjects && permissions.canViewObligations && !actor.isExternal;
  const canCreateLegalDocFromProject = canUpdate && permissions.canCreateLegalDocs;
  const canCreateObligationFromProject =
    canViewObligationsTab && permissions.canCreateObligations && projectDocs.length > 0;

  if (!canView) {
    return (
      <div className="page">
        <Card>
          <p className="placeholderText">{t("common.unauthorized")}</p>
        </Card>
      </div>
    );
  }

  const externalParticipants = project.externalParticipants ?? [];
  const visibleExternalParticipants = showArchivedExternal
    ? externalParticipants
    : externalParticipants.filter((participant) => !participant.archivedAt && !participant.isArchived);
  const editingExternalParticipant = externalParticipants.find(
    (participant) => participant.id === editingExternalParticipantId
  );
  const editingObligation = projectObligationRows.find(
    (obligation) => obligation.id === editingObligationId
  );

  const childCountSummary = {
    legalDocs: projectDocs.length,
    obligations: projectObligations.length,
    deadlines: projectDeadlines.length
  };
  const hasChildrenForArchive =
    childCountSummary.legalDocs + childCountSummary.obligations + childCountSummary.deadlines > 0;

  const docColumns = [
    {
      key: "title",
      header: t("projects.detail.legalDocs.title"),
      render: (doc: (typeof legalDocs)[number]) => doc.title
    },
    {
      key: "type",
      header: t("projects.detail.legalDocs.type"),
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
      key: "reference",
      header: t("projects.detail.legalDocs.reference"),
      render: (doc: (typeof legalDocs)[number]) => doc.reference ?? t("common.notAvailable")
    },
    {
      key: "updated",
      header: t("projects.detail.legalDocs.updated"),
      render: (doc: (typeof legalDocs)[number]) => doc.updatedAt.slice(0, 10)
    }
  ];

  const deadlinesColumns = [
    {
      key: "title",
      header: t("deadlines.table.title"),
      render: (deadline: (typeof deadlines)[number]) => deadline.title
    },
    {
      key: "dueDate",
      header: t("deadlines.table.dueDate"),
      render: (deadline: (typeof deadlines)[number]) => deadline.dueDate
    },
    {
      key: "status",
      header: t("tasks.table.status"),
      render: (deadline: (typeof deadlines)[number]) =>
        getTaskStatusLabel(getDeadlineStatus(deadline))
    }
  ];

  const getNextObligationTask = (obligationId: string) => {
    const today = todayDateOnlyLocal();
    return tasks
      .filter((task) => task.obligationId === obligationId && task.dueDate >= today)
      .sort((left, right) => left.dueDate.localeCompare(right.dueDate))[0];
  };

  const obligationColumns = [
    {
      key: "title",
      header: t("obligations.table.title"),
      render: (obligation: (typeof obligations)[number]) => obligation.title
    },
    {
      key: "legalDoc",
      header: t("obligations.table.legalDoc"),
      render: (obligation: (typeof obligations)[number]) =>
        legalDocById.get(obligation.legalDocId)?.title ?? t("common.notAvailable")
    },
    {
      key: "status",
      header: t("projects.obligations.status"),
      render: (obligation: (typeof obligations)[number]) =>
        obligation.isArchived || obligation.archivedAt ? (
          <Badge variant="warning">{t("users.archived")}</Badge>
        ) : (
          <Badge variant="success">{t("projects.obligations.active")}</Badge>
        )
    },
    {
      key: "recurring",
      header: t("projects.obligations.recurring"),
      render: (obligation: (typeof obligations)[number]) =>
        obligation.scheduleType === "ONCE"
          ? t("common.no")
          : t("common.yes")
    },
    {
      key: "interval",
      header: t("obligations.form.interval"),
      render: (obligation: (typeof obligations)[number]) =>
        obligation.intervalValue && obligation.intervalUnit
          ? `${obligation.intervalValue} ${getIntervalUnitLabel(obligation.intervalUnit)}`
          : t("common.notAvailable")
    },
    {
      key: "recurrenceEnd",
      header: t("obligations.table.recurrenceEndDate"),
      render: (obligation: (typeof obligations)[number]) =>
        obligation.scheduleType === "ONCE"
          ? t("common.notAvailable")
          : obligation.recurrenceEndDate ?? t("obligations.recurrence.unlimited")
    },
    {
      key: "owner",
      header: t("obligations.table.owner"),
      render: (obligation: (typeof obligations)[number]) =>
        renderUserValue(obligation.ownerUserId)
    },
    {
      key: "externalOrg",
      header: t("obligations.table.externalOrg"),
      render: (obligation: (typeof obligations)[number]) => {
        if (!obligation.externalOrgId) {
          return t("common.notAssigned");
        }
        return (
          getExternalOrgById(obligation.externalOrgId)?.name ??
          t("obligations.externalOrgAssignedNameUnavailable")
        );
      }
    },
    {
      key: "externalUser",
      header: t("obligations.table.externalUser"),
      render: (obligation: (typeof obligations)[number]) =>
        renderUserValue(obligation.externalUserId)
    },
    {
      key: "nextTask",
      header: t("projects.obligations.nextTask"),
      render: (obligation: (typeof obligations)[number]) =>
        getNextObligationTask(obligation.id)?.dueDate ?? t("common.notAvailable")
    }
  ];

  const externalColumns = [
    {
      key: "type",
      header: t("projects.external.type"),
      render: (participant: ExternalParticipant) => getExternalTypeLabel(participant.type)
    },
    {
      key: "organization",
      header: t("projects.external.organization"),
      render: (participant: ExternalParticipant) =>
        participant.organization || t("common.notAvailable")
    },
    {
      key: "name",
      header: t("projects.external.name"),
      render: (participant: ExternalParticipant) => participant.name
    },
    {
      key: "email",
      header: t("projects.external.email"),
      render: (participant: ExternalParticipant) => participant.email || t("common.notAvailable")
    },
    {
      key: "phone",
      header: t("projects.external.phone"),
      render: (participant: ExternalParticipant) => participant.phone || t("common.notAvailable")
    },
    {
      key: "accessStatus",
      header: t("projects.external.accessStatus"),
      render: (participant: ExternalParticipant) =>
        participant.externalUserId
          ? getExternalAccessStatusLabel(participant.accessStatus)
          : getExternalAccessStatusLabel("LEGACY_ONLY")
    }
  ];

  const handleArchive = async (cascadeChildren: boolean) => {
    if (cascadeChildren) {
      await Promise.all(projectDocs.map((doc) => archiveLegalDoc(doc.id)));
      await Promise.all(projectObligations.map((obligation) => archiveObligation(obligation.id)));
      projectDeadlines.forEach((deadline) => archiveDeadline(deadline.id));
    }
    const archived = await archiveProject(project.id);
    if (archived) {
      navigate("..", { relative: "path" });
    }
  };

  const openDeleteObligationModal = (target: (typeof obligations)[number]) => {
    if (!permissions.canDeleteObligations) {
      return;
    }
    clearMutationError();
    setDeleteObligationError("");
    setDeleteObligationTarget(target);
  };

  const closeDeleteObligationModal = () => {
    if (isDeleteObligationSubmitting) {
      return;
    }
    setDeleteObligationTarget(null);
    setDeleteObligationError("");
  };

  const handleDeleteObligation = async () => {
    if (!deleteObligationTarget || !permissions.canDeleteObligations) {
      return;
    }

    setIsDeleteObligationSubmitting(true);
    setDeleteObligationError("");
    const result = await removeObligation(deleteObligationTarget.id);
    setIsDeleteObligationSubmitting(false);

    if (result.ok) {
      setDeleteObligationTarget(null);
      return;
    }

    setDeleteObligationError(formatObligationDeleteError(result.error));
  };

  const renderUserValue = (userId?: string) => {
    if (!userId) {
      return t("common.notAssigned");
    }
    const user = getUser(userId);
    const label = user ? getDisplayName(userId) : t("users.unknown");
    return (
      <span className="inlineMeta">
        <span>{label}</span>
        {user ? (
          <Badge variant={user.isExternal ? "warning" : "neutral"}>
            {user.isExternal ? t("users.external") : t("users.internal")}
          </Badge>
        ) : null}
        {user?.isArchived ? <Badge variant="warning">{t("users.archived")}</Badge> : null}
      </span>
    );
  };

  return (
    <div className="page">
      <div className="pageHeader">
        <div>
          <Breadcrumbs
            ariaLabel={t("breadcrumb.label")}
            items={[
              { key: "home", label: t("breadcrumb.home") },
              { key: "projects", label: t("breadcrumb.projects") },
              { key: "project", label: project.title }
            ]}
          />
          <h1 className="pageTitle">{project.title}</h1>
          <div className="inlineMeta">
            <Badge variant={getProjectStatusBadgeVariant(project.status)}>
              {getProjectStatusLabel(project.status)}
            </Badge>
            <Badge variant={getProjectSubmissionTypeBadgeVariant(project.submissionType)}>
              {getProjectSubmissionTypeLabel(project.submissionType)}
            </Badge>
            <span>{scopeLabel}</span>
            <span>{authorityName || t("common.notAvailable")}</span>
            <span>{contactName || t("common.notAvailable")}</span>
          </div>
        </div>
        <div className="inlineMeta">
          <Button variant="secondary" disabled={!canUpdate} onClick={() => setEditProjectOpen(true)}>
            {t("projects.action.edit")}
          </Button>
          {!project.isArchived ? (
            <Button variant="secondary" disabled={!canArchive} onClick={() => setArchiveModalOpen(true)}>
              {t("common.archive")}
            </Button>
          ) : (
            <Button
              variant="secondary"
              disabled={!canArchive}
              onClick={() => void restoreProject(project.id)}
            >
              {t("common.restore")}
            </Button>
          )}
        </div>
      </div>

      {runtimeConfig.features.enableHelpHints ? (
        <HelpHintCard
          hintId="hint.projectDetail"
          title="Projektkontext, Status und Checkliste"
          bullets={[
            "Pruefen Sie zuerst Status, Einreichtyp und Scope in der Uebersicht.",
            "Bearbeiten Sie Beziehungen, Dokumente und Fristen bewusst im passenden Tab statt alles gleichzeitig.",
            "Die Projektcheckliste ist eine operative Hilfe und ersetzt keine formale Freigabe oder Archivierung."
          ]}
          link={{
            label: "Passenden Hilfeartikel oeffnen",
            to: getHelpHref(HELP_CONTEXT_SLUGS.projectDetail)
          }}
        />
      ) : null}

      <div className="tabs">
        <button
          type="button"
          className={`tabButton ${tab === "overview" ? "tabButtonActive" : ""}`}
          onClick={() => setTab("overview")}
        >
          {t("projects.detail.tabs.overview")}
        </button>
        <button
          type="button"
          className={`tabButton ${tab === "legalDocs" ? "tabButtonActive" : ""}`}
          onClick={() => setTab("legalDocs")}
        >
          {t("projects.detail.tabs.legalDocs")}
        </button>
        <button
          type="button"
          className={`tabButton ${tab === "deadlines" ? "tabButtonActive" : ""}`}
          onClick={() => setTab("deadlines")}
        >
          {t("projects.detail.tabs.deadlines")}
        </button>
        <button
          type="button"
          className={`tabButton ${tab === "attachments" ? "tabButtonActive" : ""}`}
          onClick={() => setTab("attachments")}
        >
          {t("projects.detail.tabs.attachments")}
        </button>
        {canViewObligationsTab ? (
          <button
            type="button"
            className={`tabButton ${tab === "obligations" ? "tabButtonActive" : ""}`}
            onClick={() => setTab("obligations")}
          >
            {t("projects.detail.tabs.obligations")}
          </button>
        ) : null}
        <button
          type="button"
          className={`tabButton ${tab === "participants" ? "tabButtonActive" : ""}`}
          onClick={() => setTab("participants")}
        >
          {t("projects.detail.tabs.participants")}
        </button>
        {checklistTabEnabled ? (
          <button
            type="button"
            className={`tabButton ${tab === "checklist" ? "tabButtonActive" : ""}`}
            onClick={() => setTab("checklist")}
          >
            {t("projects.detail.tabs.checklist")}
          </button>
        ) : null}
        <button
          type="button"
          className={`tabButton ${tab === "notes" ? "tabButtonActive" : ""}`}
          onClick={() => setTab("notes")}
        >
          {t("projects.detail.tabs.notes")}
        </button>
        <button
          type="button"
          className={`tabButton ${tab === "history" ? "tabButtonActive" : ""}`}
          onClick={() => setTab("history")}
        >
          {t("projects.detail.tabs.history")}
        </button>
      </div>

      {tab === "overview" ? (
        <>
          <Card>
            <div className="detailGrid">
              <div>
                <div className="metaLabel">{t("projects.detail.status")}</div>
                <div className="metaValue">
                  <Badge variant={getProjectStatusBadgeVariant(project.status)}>
                    {getProjectStatusLabel(project.status)}
                  </Badge>
                </div>
              </div>
              <div>
                <div className="metaLabel">{t("projects.detail.submissionType")}</div>
                <div className="metaValue">
                  <Badge variant={getProjectSubmissionTypeBadgeVariant(project.submissionType)}>
                    {getProjectSubmissionTypeLabel(project.submissionType)}
                  </Badge>
                </div>
              </div>
              <div>
                <div className="metaLabel">{t("projects.detail.shortDescription")}</div>
                <div className="metaValue">{project.shortDescription || t("common.notAvailable")}</div>
              </div>
              <div>
                <div className="metaLabel">{t("projects.detail.authorityRef")}</div>
                <div className="metaValue">{project.authorityRef || t("common.notAvailable")}</div>
              </div>
              <div>
                <div className="metaLabel">{t("projects.detail.authority")}</div>
                <div className="metaValue">{authorityName || t("common.notAvailable")}</div>
              </div>
              <div>
                <div className="metaLabel">{t("projects.detail.authorityContact")}</div>
                <div className="metaValue">{contactName || t("common.notAvailable")}</div>
              </div>
              <div>
                <div className="metaLabel">{t("projects.detail.owner")}</div>
                <div className="metaValue">{renderUserValue(project.ownerUserId)}</div>
              </div>
              <div>
                <div className="metaLabel">{t("projects.detail.deputy")}</div>
                <div className="metaValue">{renderUserValue(project.deputyUserId)}</div>
              </div>
            </div>
          </Card>
          <Card>
            <h2 className="sectionTitle">{t("projects.relations.title")}</h2>
            <div className="detailGrid">
              <div>
                <div className="metaLabel">{t("projects.relations.dependsOn")}</div>
                {predecessorProjects.length ? (
                  <div className="relationLinkList">
                    {predecessorProjects.map((row) => (
                      <div key={row.id} className="relationLinkItem">
                        {row.missing ? (
                          <span className="relationSelectionLabel">{row.title}</span>
                        ) : (
                          <button
                            type="button"
                            className="relationLinkButton"
                            onClick={() => navigate(`/projects/${row.id}`)}
                          >
                            {row.title}
                          </button>
                        )}
                        {row.isArchived ? (
                          <Badge variant="warning">{t("users.archived")}</Badge>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="placeholderText">{t("projects.relations.empty.dependsOn")}</p>
                )}
              </div>
              <div>
                <div className="metaLabel">{t("projects.relations.dependents")}</div>
                {dependentProjects.length ? (
                  <div className="relationLinkList">
                    {dependentProjects.map((linkedProject) => (
                      <div key={linkedProject.id} className="relationLinkItem">
                        <button
                          type="button"
                          className="relationLinkButton"
                          onClick={() => navigate(`/projects/${linkedProject.id}`)}
                        >
                          {linkedProject.title}
                        </button>
                        {isArchivedEntity(linkedProject) ? (
                          <Badge variant="warning">{t("users.archived")}</Badge>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="placeholderText">{t("projects.relations.empty.dependents")}</p>
                )}
              </div>
              <div>
                <div className="metaLabel">{t("projects.relations.legalRefs")}</div>
                {referenceLegalDocs.length ? (
                  <div className="relationLinkList">
                    {referenceLegalDocs.map((row) => (
                      <div key={row.id} className="relationLinkItem">
                        {row.missing ? (
                          <span className="relationSelectionLabel">{row.title}</span>
                        ) : (
                          <button
                            type="button"
                            className="relationLinkButton"
                            onClick={() => navigate(`/legal-docs/${row.id}`)}
                          >
                            {row.title}
                          </button>
                        )}
                        {row.isArchived ? (
                          <Badge variant="warning">{t("users.archived")}</Badge>
                        ) : null}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="placeholderText">{t("projects.relations.empty.legalRefs")}</p>
                )}
              </div>
            </div>
          </Card>
        </>
      ) : null}

      {tab === "legalDocs" ? (
        <div className="tableSection">
          <div className="sectionHeader">
            <h2 className="sectionTitle">{t("projects.detail.legalDocs.title")}</h2>
            <Button disabled={!canUpdate} onClick={() => setLegalDocModalOpen(true)}>
              {t("legalDocs.action.new")}
            </Button>
          </div>
          <DataTable
            columns={docColumns}
            data={projectDocs}
            getRowKey={(doc) => doc.id}
            rowActions={(doc) => (
              <div className="tableActions">
                <IconButton ariaLabel={t("legalDocs.action.view")} onClick={() => navigate(`/legal-docs/${doc.id}`)}>
                  <EyeIcon />
                </IconButton>
                <IconButton
                  ariaLabel={t("legalDocs.action.edit")}
                  disabled={!canUpdate}
                  onClick={() => {
                    setEditingDocId(doc.id);
                    setLegalDocModalOpen(true);
                  }}
                >
                  <EditIcon />
                </IconButton>
              </div>
            )}
          />
        </div>
      ) : null}

      {tab === "deadlines" ? (
        <div className="tableSection">
          <div className="sectionHeader">
            <h2 className="sectionTitle">{t("projects.detail.tabs.deadlines")}</h2>
            <Button disabled={!canUpdate} onClick={() => setDeadlineModalOpen(true)}>
              {t("deadlines.new")}
            </Button>
          </div>
          <DataTable
            columns={deadlinesColumns}
            data={projectDeadlines}
            getRowKey={(deadline) => deadline.id}
            rowActions={(deadline) => (
              <div className="tableActions">
                <IconButton
                  ariaLabel={t("common.view")}
                  onClick={() => navigate(`/deadlines/${deadline.id}`)}
                >
                  <EyeIcon />
                </IconButton>
                <IconButton
                  ariaLabel={t("common.edit")}
                  disabled={!canUpdate}
                  onClick={() => {
                    setEditingDeadlineId(deadline.id);
                    setDeadlineModalOpen(true);
                  }}
                >
                  <EditIcon />
                </IconButton>
              </div>
            )}
          />
        </div>
      ) : null}

      {tab === "attachments" ? (
        <Card>
          <DocumentsPanel
            ownerType="PROJECT"
            ownerId={project.id}
            titleKey="projects.detail.attachments"
            allowUpload={canUpdate}
            legacyItems={project.attachments}
          />
        </Card>
      ) : null}

      {canViewObligationsTab && tab === "obligations" ? (
        <div className="tableSection">
          <div className="sectionHeader">
            <h2 className="sectionTitle">{t("projects.obligations.title")}</h2>
            <Button
              disabled={!canCreateObligationFromProject}
              onClick={() => {
                setEditingObligationId(null);
                setObligationModalOpen(true);
              }}
            >
              {t("projects.obligations.actionNew")}
            </Button>
          </div>
          {projectObligationRows.length === 0 ? (
            <Card>
              <p className="placeholderText">
                {projectAllDocs.length === 0
                  ? t("projects.obligations.emptyNoLegalDocs")
                  : projectDocs.length === 0
                  ? t("projects.obligations.emptyNoActiveLegalDocs")
                  : t("projects.obligations.emptyNoObligations")}
              </p>
              {projectDocs.length === 0 ? (
                <Button
                  variant="secondary"
                  disabled={!canCreateLegalDocFromProject}
                  onClick={() => setLegalDocModalOpen(true)}
                >
                  {t("projects.obligations.createLegalDoc")}
                </Button>
              ) : null}
            </Card>
          ) : (
            <DataTable
              columns={obligationColumns}
              data={projectObligationRows}
              getRowKey={(obligation) => obligation.id}
              rowActions={(obligation) => (
                <div className="tableActions">
                  <IconButton
                    ariaLabel={t("obligations.action.view")}
                    onClick={() => navigate(`/obligations/${obligation.id}`)}
                  >
                    <EyeIcon />
                  </IconButton>
                  <IconButton
                    ariaLabel={t("obligations.action.edit")}
                    disabled={!permissions.canEditObligations}
                    onClick={() => {
                      setEditingObligationId(obligation.id);
                      setObligationModalOpen(true);
                    }}
                  >
                    <EditIcon />
                  </IconButton>
                  {permissions.canDeleteObligations ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => openDeleteObligationModal(obligation)}
                    >
                      {t("obligations.action.delete")}
                    </Button>
                  ) : null}
                </div>
              )}
            />
          )}
        </div>
      ) : null}

      {tab === "participants" ? (
        <div className="tableSection">
          <Card>
            <h2 className="sectionTitle">{t("projects.participants.internalTitle")}</h2>
            <div className="modalForm">
              <div className="formField">
                <span className="fieldLabel">{t("projects.detail.owner")}</span>
                <UserSelect
                  value={project.ownerUserId ?? null}
                  includeExternal={false}
                  includeInternal
                  allowArchivedCurrentValue
                  placeholderKey="projects.owner"
                  disabled={!canUpdate}
                  onChange={(userId) =>
                    void updateProject(project.id, { ownerUserId: userId ?? undefined })
                  }
                />
              </div>
              <div className="formField">
                <span className="fieldLabel">{t("projects.detail.deputy")}</span>
                <UserSelect
                  value={project.deputyUserId ?? null}
                  includeExternal={false}
                  includeInternal
                  allowArchivedCurrentValue
                  placeholderKey="projects.deputy"
                  disabled={!canUpdate}
                  onChange={(userId) =>
                    void updateProject(project.id, { deputyUserId: userId ?? undefined })
                  }
                />
              </div>
              <div className="formField">
                <span className="fieldLabel">{t("projects.detail.participants")}</span>
                <UserMultiSelect
                  value={getParticipantUserIds(project)}
                  includeExternal={false}
                  includeInternal
                  allowArchivedCurrentValue
                  showSearch
                  disabled={!canUpdate}
                  onChange={(values) => {
                    const internalParticipants = values.map((userId) => ({ userId }));
                    void updateProject(project.id, {
                      internalParticipants,
                      participantUserIds: values
                    });
                  }}
                />
              </div>
            </div>
          </Card>

          <div className="tableSection">
            <div className="sectionHeader">
              <h2 className="sectionTitle">{t("projects.external.title")}</h2>
              <div className="inlineMeta">
                <label className="checkboxRow">
                  <input
                    type="checkbox"
                    checked={showArchivedExternal}
                    onChange={(event) => setShowArchivedExternal(event.target.checked)}
                  />
                  <span>{t("projects.external.showArchived")}</span>
                </label>
                <Button
                  disabled={!canUpdate}
                  onClick={() => {
                    setEditingExternalParticipantId(null);
                    setExternalModalOpen(true);
                  }}
                >
                  {t("projects.external.add")}
                </Button>
              </div>
            </div>
            <DataTable
              columns={externalColumns}
              data={visibleExternalParticipants}
              getRowKey={(participant) => participant.id}
              rowActions={(participant) => (
                <div className="tableActions">
                  <IconButton
                    ariaLabel={t("common.edit")}
                    disabled={!canUpdate}
                    onClick={() => {
                      setEditingExternalParticipantId(participant.id);
                      setExternalModalOpen(true);
                    }}
                  >
                    <EditIcon />
                  </IconButton>
                  {!participant.archivedAt && !participant.isArchived ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={!canUpdate}
                      onClick={() => void archiveExternalParticipant(project.id, participant.id)}
                    >
                      {t("common.archive")}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!canUpdate}
                      onClick={() => void restoreExternalParticipant(project.id, participant.id)}
                    >
                      {t("common.restore")}
                    </Button>
                  )}
                </div>
              )}
            />
          </div>
        </div>
      ) : null}

      {checklistTabEnabled && tab === "checklist" ? (
        <ProjectChecklistTab
          projectId={project.id}
          canEdit={canUpdate}
          projectTitle={project.title}
        />
      ) : null}

      {tab === "notes" ? (
        <Card>
          <CommentsPanel entityType="PROJECT" entityId={project.id} />
        </Card>
      ) : null}

      {tab === "history" ? (
        <Card>
          <h2 className="sectionTitle">{t("projects.detail.tabs.history")}</h2>
          <AuditTimeline entries={historyEntries} />
        </Card>
      ) : null}

      <LegalDocModal
        open={legalDocModalOpen}
        onClose={() => {
          setLegalDocModalOpen(false);
          setEditingDocId(null);
        }}
        legalDoc={legalDocs.find((doc) => doc.id === editingDocId)}
        initialProjectId={project.id}
        lockProject
      />

      <DeadlineModal
        open={deadlineModalOpen}
        onClose={() => {
          setDeadlineModalOpen(false);
          setEditingDeadlineId(null);
        }}
        deadline={projectDeadlines.find((deadline) => deadline.id === editingDeadlineId)}
        initialProjectId={project.id}
      />

      <ObligationModal
        open={obligationModalOpen}
        onClose={() => {
          setObligationModalOpen(false);
          setEditingObligationId(null);
        }}
        obligation={editingObligation}
        legalDocId={!editingObligation && projectDocs.length === 1 ? projectDocs[0]?.id : undefined}
        projectId={project.id}
        availableLegalDocs={projectDocs}
      />

      <Modal
        open={Boolean(deleteObligationTarget)}
        onClose={closeDeleteObligationModal}
        closeAriaLabel={t("modal.close")}
        header={t("obligations.delete.title")}
        footer={
          <div className="modalFooter">
            <Button
              variant="secondary"
              onClick={closeDeleteObligationModal}
              disabled={isDeleteObligationSubmitting}
            >
              {t("common.cancel")}
            </Button>
            <Button onClick={() => void handleDeleteObligation()} disabled={isDeleteObligationSubmitting}>
              {isDeleteObligationSubmitting
                ? t("obligations.delete.pending")
                : t("obligations.action.delete")}
            </Button>
          </div>
        }
      >
        <div className="modalForm">
          <p className="placeholderText">{t("obligations.delete.text")}</p>
          <p className="metaValue">{deleteObligationTarget?.title ?? ""}</p>
          {deleteObligationError ? <p className="validationText">{deleteObligationError}</p> : null}
        </div>
      </Modal>

      <ProjectModal open={editProjectOpen} onClose={() => setEditProjectOpen(false)} project={project} />

      <ExternalParticipantModal
        open={externalModalOpen}
        onClose={() => {
          setExternalModalOpen(false);
          setEditingExternalParticipantId(null);
        }}
        participant={editingExternalParticipant}
        onSave={async (input) => {
          if (!canUpdate) {
            return false;
          }
          if (editingExternalParticipant) {
            return updateExternalParticipant(project.id, editingExternalParticipant.id, input);
          }
          return addExternalParticipant(project.id, input);
        }}
      />

      <Modal
        open={archiveModalOpen}
        onClose={() => setArchiveModalOpen(false)}
        closeAriaLabel={t("modal.close")}
        header={t("projects.archive.confirmTitle")}
        footer={
          <div className="modalFooter">
            <Button variant="secondary" onClick={() => setArchiveModalOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setArchiveModalOpen(false);
                void handleArchive(false);
              }}
            >
              {t("projects.archive.parentOnly")}
            </Button>
            <Button
              onClick={() => {
                setArchiveModalOpen(false);
                void handleArchive(true);
              }}
              disabled={!hasChildrenForArchive}
            >
              {t("projects.archive.withChildren")}
            </Button>
          </div>
        }
      >
        <div className="modalForm">
          <p className="placeholderText">{t("projects.archive.warning")}</p>
          <div className="detailGrid">
            <div>
              <div className="metaLabel">{t("projects.archive.children.legalDocs")}</div>
              <div className="metaValue">{childCountSummary.legalDocs}</div>
            </div>
            <div>
              <div className="metaLabel">{t("projects.archive.children.obligations")}</div>
              <div className="metaValue">{childCountSummary.obligations}</div>
            </div>
            <div>
              <div className="metaLabel">{t("projects.archive.children.deadlines")}</div>
              <div className="metaValue">{childCountSummary.deadlines}</div>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
