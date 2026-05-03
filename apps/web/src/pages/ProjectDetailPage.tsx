import React, { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Badge,
  Breadcrumbs,
  Button,
  Card,
  DataTable,
  IconButton,
  Input,
  Modal,
  Select
} from "@nemetz/ui";
import { t } from "../i18n";
import {
  archiveLegacyDecision,
  createLegacyDecision,
  listProjectLegacyDecisions,
  restoreLegacyDecision,
  updateLegacyDecision,
  type LegacyDecisionInput
} from "../api/legacyDecisions";
import {
  listProjectAccess,
  removeProjectAccess,
  upsertProjectAccess
} from "../api/projects";
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
import {
  LEGACY_DECISION_REVIEW_STATUS_VALUES,
  LEGACY_DECISION_STATUS_VALUES,
  type LegacyDecision
} from "../data/legacyDecisions";
import type { ExternalParticipant, ProjectAccessEntry, ProjectAccessRole } from "../data/projects";
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

function getProjectAccessRoleLabel(role: ProjectAccessRole) {
  return t(`projects.access.roles.${role}`);
}

function getProjectAccessSourceLabel(source: ProjectAccessEntry["source"]) {
  return t(`projects.access.sources.${source}`);
}

function getLegacyDecisionStatusLabel(status: LegacyDecision["legacyStatus"]) {
  return t(`legacyDecisions.status.${status}`);
}

function getLegacyDecisionReviewStatusLabel(status: LegacyDecision["reviewStatus"]) {
  return t(`legacyDecisions.reviewStatus.${status}`);
}

type LegacyDecisionModalProps = {
  open: boolean;
  legacyDecision?: LegacyDecision;
  projectId: string;
  authorities: { id: string; name: string; isArchived?: boolean }[];
  legalDocs: { id: string; title: string; isArchived?: boolean; archivedAt?: string }[];
  onClose: () => void;
  onSave: (input: LegacyDecisionInput) => Promise<boolean>;
};

function LegacyDecisionModal({
  open,
  legacyDecision,
  projectId,
  authorities,
  legalDocs,
  onClose,
  onSave
}: LegacyDecisionModalProps) {
  const [form, setForm] = React.useState<LegacyDecisionInput>({
    title: "",
    legacyStatus: "ARCHIVE_ONLY",
    reviewStatus: "NOT_REVIEWED"
  });
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [error, setError] = React.useState("");

  React.useEffect(() => {
    if (!open) {
      return;
    }
    setForm({
      projectId,
      title: legacyDecision?.title ?? "",
      fileNumber: legacyDecision?.fileNumber ?? "",
      authorityId: legacyDecision?.authorityId ?? "",
      authorityName: legacyDecision?.authorityName ?? "",
      issuedAt: legacyDecision?.issuedAt ?? "",
      validFrom: legacyDecision?.validFrom ?? "",
      validUntil: legacyDecision?.validUntil ?? "",
      legacyStatus: legacyDecision?.legacyStatus ?? "ARCHIVE_ONLY",
      reviewStatus: legacyDecision?.reviewStatus ?? "NOT_REVIEWED",
      relevanceNote: legacyDecision?.relevanceNote ?? "",
      linkedLegalDocId: legacyDecision?.linkedLegalDocId ?? "",
      supersededByLegalDocId: legacyDecision?.supersededByLegalDocId ?? ""
    });
    setError("");
  }, [legacyDecision, open, projectId]);

  const update = (key: keyof LegacyDecisionInput, value: string) => {
    setForm((prev) => ({
      ...prev,
      [key]: value || undefined
    }));
  };

  const submit = async () => {
    if (!form.title?.trim()) {
      setError(t("legacyDecisions.validation.titleRequired"));
      return;
    }

    setIsSubmitting(true);
    setError("");
    const ok = await onSave({
      ...form,
      projectId,
      title: form.title.trim()
    });
    setIsSubmitting(false);
    if (ok) {
      onClose();
      return;
    }
    setError(t("legacyDecisions.validation.saveFailed"));
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeAriaLabel={t("modal.close")}
      header={legacyDecision ? t("legacyDecisions.edit") : t("legacyDecisions.create")}
      footer={
        <div className="modalFooter">
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => void submit()} disabled={isSubmitting}>
            {t("common.save")}
          </Button>
        </div>
      }
    >
      <div className="modalForm">
        <label className="formField">
          <span className="fieldLabel">{t("legacyDecisions.fields.title")}</span>
          <Input value={form.title ?? ""} onChange={(event) => update("title", event.target.value)} />
        </label>
        <label className="formField">
          <span className="fieldLabel">{t("legacyDecisions.fields.fileNumber")}</span>
          <Input value={form.fileNumber ?? ""} onChange={(event) => update("fileNumber", event.target.value)} />
        </label>
        <label className="formField">
          <span className="fieldLabel">{t("legacyDecisions.fields.authority")}</span>
          <Select
            value={form.authorityId ?? ""}
            options={[
              { value: "", label: t("common.notAssigned") },
              ...authorities
                .filter((authority) => !authority.isArchived || authority.id === form.authorityId)
                .map((authority) => ({ value: authority.id, label: authority.name }))
            ]}
            onChange={(event) => update("authorityId", event.target.value)}
          />
        </label>
        <label className="formField">
          <span className="fieldLabel">{t("legacyDecisions.fields.authorityName")}</span>
          <Input value={form.authorityName ?? ""} onChange={(event) => update("authorityName", event.target.value)} />
        </label>
        <label className="formField">
          <span className="fieldLabel">{t("legacyDecisions.fields.issuedAt")}</span>
          <Input type="date" value={form.issuedAt ?? ""} onChange={(event) => update("issuedAt", event.target.value)} />
        </label>
        <label className="formField">
          <span className="fieldLabel">{t("legacyDecisions.fields.legacyStatus")}</span>
          <Select
            value={form.legacyStatus ?? "ARCHIVE_ONLY"}
            options={LEGACY_DECISION_STATUS_VALUES.map((status) => ({
              value: status,
              label: getLegacyDecisionStatusLabel(status)
            }))}
            onChange={(event) => update("legacyStatus", event.target.value)}
          />
        </label>
        <label className="formField">
          <span className="fieldLabel">{t("legacyDecisions.fields.reviewStatus")}</span>
          <Select
            value={form.reviewStatus ?? "NOT_REVIEWED"}
            options={LEGACY_DECISION_REVIEW_STATUS_VALUES.map((status) => ({
              value: status,
              label: getLegacyDecisionReviewStatusLabel(status)
            }))}
            onChange={(event) => update("reviewStatus", event.target.value)}
          />
        </label>
        <label className="formField">
          <span className="fieldLabel">{t("legacyDecisions.fields.linkedLegalDoc")}</span>
          <Select
            value={form.linkedLegalDocId ?? ""}
            options={[
              { value: "", label: t("common.notAssigned") },
              ...legalDocs.map((doc) => ({ value: doc.id, label: doc.title }))
            ]}
            onChange={(event) => update("linkedLegalDocId", event.target.value)}
          />
        </label>
        <label className="formField">
          <span className="fieldLabel">{t("legacyDecisions.fields.relevanceNote")}</span>
          <textarea
            className="textArea"
            value={form.relevanceNote ?? ""}
            onChange={(event) => update("relevanceNote", event.target.value)}
          />
        </label>
        <p className="placeholderText">{t("legacyDecisions.noAutomaticObligations")}</p>
        {error ? <p className="validationText">{error}</p> : null}
      </div>
    </Modal>
  );
}

export default function ProjectDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const runtimeConfig = useRuntimeConfig();
  const { actor, permissions, hasPermission } = useAuthorization();
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
  const { authorities, contacts, getAuthorityName, getContactsForAuthority } = useAuthorities();
  const { users, getUser, getDisplayName } = useUsers();
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
  const [accessEntries, setAccessEntries] = useState<ProjectAccessEntry[]>([]);
  const [accessUserId, setAccessUserId] = useState<string | null>(null);
  const [accessRole, setAccessRole] = useState<ProjectAccessRole>("PROJECT_VIEWER");
  const [accessNote, setAccessNote] = useState("");
  const [accessError, setAccessError] = useState("");
  const [legacyDecisions, setLegacyDecisions] = useState<LegacyDecision[]>([]);
  const [legacyModalOpen, setLegacyModalOpen] = useState(false);
  const [editingLegacyDecisionId, setEditingLegacyDecisionId] = useState<string | null>(null);
  const [selectedLegacyDecisionId, setSelectedLegacyDecisionId] = useState<string | null>(null);
  const [showArchivedLegacyDecisions, setShowArchivedLegacyDecisions] = useState(false);
  const [legacyError, setLegacyError] = useState("");
  const checklistTabEnabled = runtimeConfig.features.enableProjectChecklists;

  const project = useMemo(() => projects.find((item) => item.id === id), [id, projects]);
  const canView = project ? ProjectPolicy.view(actor, project) : false;
  const canWriteProject = project ? ProjectPolicy.write(actor, project) : false;
  const canUpdate = project ? ProjectPolicy.update(actor, project) : false;
  const canArchive = project ? ProjectPolicy.archive(actor, project) : false;
  const canViewObligationsTab =
    permissions.canViewProjects && permissions.canViewObligations && !actor.isExternal;
  const canReadLegacyDecisions =
    !actor.isExternal &&
    (permissions.canViewLegalDocs ||
      permissions.canEditLegalDocs ||
      permissions.canArchiveLegalDocs ||
      hasPermission("legalDocs.export"));
  const canViewLegacyDecisionsTab = Boolean(project && canView && canReadLegacyDecisions);
  const canArchiveLegacyDecisions = canWriteProject && permissions.canArchiveLegalDocs;
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
        if ((deadline.resolvedProjectId ?? deadline.projectId) === project?.id) {
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
    if (tab === "obligations" && !canViewObligationsTab) {
      setTab("overview");
    }
  }, [canViewObligationsTab, tab]);
  React.useEffect(() => {
    if (tab === "legacyDecisions" && !canViewLegacyDecisionsTab) {
      setTab("overview");
    }
  }, [canViewLegacyDecisionsTab, tab]);
  const canManageProjectAccessUi =
    !actor.isExternal &&
    actor.isAdmin &&
    permissions.canManageUsersAdmin;

  React.useEffect(() => {
    if (!canManageProjectAccessUi && tab === "access") {
      setTab("overview");
    }
  }, [canManageProjectAccessUi, tab]);

  React.useEffect(() => {
    if (!project || !canManageProjectAccessUi || tab !== "access") {
      return;
    }
    void listProjectAccess(project.id)
      .then((items) => {
        setAccessEntries(items);
        setAccessError("");
      })
      .catch(() => {
        setAccessError(t("projects.access.loadError"));
      });
  }, [canManageProjectAccessUi, project, tab]);

  React.useEffect(() => {
    if (!project || tab !== "legacyDecisions" || !canViewLegacyDecisionsTab) {
      return;
    }
    void listProjectLegacyDecisions(project.id)
      .then((items) => {
        setLegacyDecisions(items);
        setLegacyError("");
      })
      .catch(() => {
        setLegacyError(t("legacyDecisions.loadError"));
      });
  }, [canViewLegacyDecisionsTab, project, tab]);

  if (!project) {
    return (
      <div className="page">
        <Card>
          <p className="placeholderText">{t("projects.detail.notFound")}</p>
        </Card>
      </div>
    );
  }

  const canCreateLegalDocFromProject = canWriteProject && permissions.canCreateLegalDocs;
  const canCreateObligationFromProject =
    canViewObligationsTab && canWriteProject && permissions.canCreateObligations && projectDocs.length > 0;

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
    if (!canWriteProject || !permissions.canDeleteObligations) {
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
    if (!deleteObligationTarget || !canWriteProject || !permissions.canDeleteObligations) {
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

  const selectedAccessUser = users.find((user) => user.id === accessUserId);
  const accessRoleOptions =
    selectedAccessUser?.type === "EXTERNAL"
      ? (["EXTERNAL_PROJECT_VIEWER", "EXTERNAL_EXECUTOR"] as ProjectAccessRole[])
      : (["PROJECT_VIEWER", "PROJECT_EDITOR"] as ProjectAccessRole[]);

  const handleGrantAccess = async () => {
    if (!accessUserId || !canManageProjectAccessUi) {
      return;
    }
    try {
      await upsertProjectAccess(project.id, accessUserId, {
        accessRole,
        note: accessNote
      });
      setAccessEntries(await listProjectAccess(project.id));
      setAccessUserId(null);
      setAccessRole("PROJECT_VIEWER");
      setAccessNote("");
      setAccessError("");
    } catch {
      setAccessError(t("projects.access.saveError"));
    }
  };

  const handleRemoveAccess = async (entry: ProjectAccessEntry) => {
    if (!canManageProjectAccessUi || entry.source !== "EXPLICIT") {
      return;
    }
    try {
      await removeProjectAccess(project.id, entry.userId);
      setAccessEntries(await listProjectAccess(project.id));
      setAccessError("");
    } catch {
      setAccessError(t("projects.access.removeError"));
    }
  };

  const legacyDecisionColumns = [
    {
      key: "title",
      header: t("legacyDecisions.fields.title"),
      render: (legacyDecision: LegacyDecision) => legacyDecision.title
    },
    {
      key: "fileNumber",
      header: t("legacyDecisions.fields.fileNumber"),
      render: (legacyDecision: LegacyDecision) => legacyDecision.fileNumber ?? t("common.notAvailable")
    },
    {
      key: "authority",
      header: t("legacyDecisions.fields.authority"),
      render: (legacyDecision: LegacyDecision) =>
        getAuthorityName(legacyDecision.authorityId) ||
        legacyDecision.authorityName ||
        t("common.notAvailable")
    },
    {
      key: "issuedAt",
      header: t("legacyDecisions.fields.issuedAt"),
      render: (legacyDecision: LegacyDecision) => legacyDecision.issuedAt ?? t("common.notAvailable")
    },
    {
      key: "legacyStatus",
      header: t("legacyDecisions.fields.legacyStatus"),
      render: (legacyDecision: LegacyDecision) => (
        <Badge variant={legacyDecision.legacyStatus === "ARCHIVE_ONLY" ? "neutral" : "warning"}>
          {getLegacyDecisionStatusLabel(legacyDecision.legacyStatus)}
        </Badge>
      )
    },
    {
      key: "reviewStatus",
      header: t("legacyDecisions.fields.reviewStatus"),
      render: (legacyDecision: LegacyDecision) =>
        getLegacyDecisionReviewStatusLabel(legacyDecision.reviewStatus)
    }
  ];

  const visibleLegacyDecisions = showArchivedLegacyDecisions
    ? legacyDecisions
    : legacyDecisions.filter((legacyDecision) => !legacyDecision.isArchived && !legacyDecision.archivedAt);
  const editingLegacyDecision = legacyDecisions.find((legacyDecision) => legacyDecision.id === editingLegacyDecisionId);
  const selectedLegacyDecision = legacyDecisions.find((legacyDecision) => legacyDecision.id === selectedLegacyDecisionId);

  const accessColumns = [
    {
      key: "user",
      header: t("projects.access.user"),
      render: (entry: ProjectAccessEntry) => {
        const user = entry.user ?? getUser(entry.userId);
        const label = user
          ? `${user.firstName} ${user.lastName}`.trim()
          : entry.userId;
        return (
          <span className="inlineMeta">
            <span>{label}</span>
            {user ? (
              <Badge variant={user.type === "EXTERNAL" ? "warning" : "neutral"}>
                {user.type === "EXTERNAL" ? t("users.external") : t("users.internal")}
              </Badge>
            ) : null}
          </span>
        );
      }
    },
    {
      key: "role",
      header: t("projects.access.role"),
      render: (entry: ProjectAccessEntry) => getProjectAccessRoleLabel(entry.accessRole)
    },
    {
      key: "source",
      header: t("projects.access.source"),
      render: (entry: ProjectAccessEntry) => getProjectAccessSourceLabel(entry.source)
    },
    {
      key: "note",
      header: t("projects.access.note"),
      render: (entry: ProjectAccessEntry) => entry.note ?? t("common.notAvailable")
    }
  ];

  const saveLegacyDecision = async (input: LegacyDecisionInput) => {
    try {
      if (editingLegacyDecision) {
        await updateLegacyDecision(editingLegacyDecision.id, input);
      } else {
        await createLegacyDecision(project.id, input);
      }
      setLegacyDecisions(await listProjectLegacyDecisions(project.id));
      setEditingLegacyDecisionId(null);
      setLegacyError("");
      return true;
    } catch {
      setLegacyError(t("legacyDecisions.saveError"));
      return false;
    }
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
        {canViewLegacyDecisionsTab ? (
          <button
            type="button"
            className={`tabButton ${tab === "legacyDecisions" ? "tabButtonActive" : ""}`}
            onClick={() => setTab("legacyDecisions")}
          >
            {t("projects.detail.tabs.legacyDecisions")}
          </button>
        ) : null}
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
        {canManageProjectAccessUi ? (
          <button
            type="button"
            className={`tabButton ${tab === "access" ? "tabButtonActive" : ""}`}
            onClick={() => setTab("access")}
          >
            {t("projects.detail.tabs.access")}
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
            <Button disabled={!canCreateLegalDocFromProject} onClick={() => setLegalDocModalOpen(true)}>
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
                  disabled={!canWriteProject || !permissions.canEditLegalDocs}
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
            <Button disabled={!canWriteProject || !permissions.canCreateDeadlines} onClick={() => setDeadlineModalOpen(true)}>
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
                  disabled={!canWriteProject || !permissions.canEditDeadlines}
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

      {canViewLegacyDecisionsTab && tab === "legacyDecisions" ? (
        <div className="tableSection">
          <div className="sectionHeader">
            <h2 className="sectionTitle">{t("legacyDecisions.title")}</h2>
            <div className="inlineMeta">
              <label className="checkboxRow">
                <input
                  type="checkbox"
                  checked={showArchivedLegacyDecisions}
                  onChange={(event) => setShowArchivedLegacyDecisions(event.target.checked)}
                />
                <span>{t("common.showArchived")}</span>
              </label>
              <Button disabled={!permissions.canCreateLegalDocs || !canWriteProject} onClick={() => setLegacyModalOpen(true)}>
                {t("legacyDecisions.upload")}
              </Button>
            </div>
          </div>
          {legacyError ? <p className="validationText">{legacyError}</p> : null}
          <p className="placeholderText">{t("legacyDecisions.noAutomaticObligations")}</p>
          {visibleLegacyDecisions.length === 0 ? (
            <Card>
              <p className="placeholderText">{t("legacyDecisions.empty")}</p>
            </Card>
          ) : (
            <DataTable
              columns={legacyDecisionColumns}
              data={visibleLegacyDecisions}
              getRowKey={(legacyDecision) => legacyDecision.id}
              rowActions={(legacyDecision) => (
                <div className="tableActions">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setSelectedLegacyDecisionId(legacyDecision.id)}
                  >
                    {t("common.view")}
                  </Button>
                  <IconButton
                    ariaLabel={t("common.edit")}
                    disabled={!permissions.canEditLegalDocs || !canWriteProject}
                    onClick={() => {
                      setEditingLegacyDecisionId(legacyDecision.id);
                      setLegacyModalOpen(true);
                    }}
                  >
                    <EditIcon />
                  </IconButton>
                  {canArchiveLegacyDecisions && !legacyDecision.isArchived && !legacyDecision.archivedAt ? (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={async () => {
                        await archiveLegacyDecision(legacyDecision.id);
                        setLegacyDecisions(await listProjectLegacyDecisions(project.id));
                      }}
                    >
                      {t("common.archive")}
                    </Button>
                  ) : canArchiveLegacyDecisions ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        await restoreLegacyDecision(legacyDecision.id);
                        setLegacyDecisions(await listProjectLegacyDecisions(project.id));
                      }}
                    >
                      {t("common.restore")}
                    </Button>
                  ) : null}
                </div>
              )}
            />
          )}
          {selectedLegacyDecision ? (
            <Card>
              <h3 className="sectionTitle">{selectedLegacyDecision.title}</h3>
              <div className="detailGrid">
                <div>
                  <div className="metaLabel">{t("legacyDecisions.fields.fileNumber")}</div>
                  <div className="metaValue">{selectedLegacyDecision.fileNumber || t("common.notAvailable")}</div>
                </div>
                <div>
                  <div className="metaLabel">{t("legacyDecisions.fields.legacyStatus")}</div>
                  <div className="metaValue">
                    {getLegacyDecisionStatusLabel(selectedLegacyDecision.legacyStatus)}
                  </div>
                </div>
                <div>
                  <div className="metaLabel">{t("legacyDecisions.fields.relevanceNote")}</div>
                  <div className="metaValue">{selectedLegacyDecision.relevanceNote || t("common.notAvailable")}</div>
                </div>
              </div>
              <DocumentsPanel
                ownerType="LEGACY_DECISION"
                ownerId={selectedLegacyDecision.id}
                titleKey="legacyDecisions.documents"
                allowUpload={permissions.canEditLegalDocs && canWriteProject}
              />
            </Card>
          ) : null}
        </div>
      ) : null}

      {canManageProjectAccessUi && tab === "access" ? (
        <div className="tableSection">
          <Card>
            <h2 className="sectionTitle">{t("projects.access.title")}</h2>
            <div className="modalForm">
              <div className="formField">
                <span className="fieldLabel">{t("projects.access.addUser")}</span>
                <UserSelect
                  value={accessUserId}
                  includeExternal
                  includeInternal
                  allowArchivedCurrentValue={false}
                  showSearch
                  placeholderKey="projects.access.addUser"
                  onChange={(userId) => {
                    setAccessUserId(userId);
                    const selectedUser = users.find((user) => user.id === userId);
                    setAccessRole(selectedUser?.type === "EXTERNAL" ? "EXTERNAL_PROJECT_VIEWER" : "PROJECT_VIEWER");
                  }}
                />
              </div>
              <label className="formField">
                <span className="fieldLabel">{t("projects.access.role")}</span>
                <Select
                  value={accessRole}
                  options={accessRoleOptions.map((role) => ({
                    value: role,
                    label: getProjectAccessRoleLabel(role)
                  }))}
                  onChange={(event) => setAccessRole(event.target.value as ProjectAccessRole)}
                />
              </label>
              <label className="formField">
                <span className="fieldLabel">{t("projects.access.note")}</span>
                <Input value={accessNote} onChange={(event) => setAccessNote(event.target.value)} />
              </label>
              <Button disabled={!accessUserId} onClick={() => void handleGrantAccess()}>
                {t("projects.access.grant")}
              </Button>
              {accessError ? <p className="validationText">{accessError}</p> : null}
            </div>
          </Card>
          <DataTable
            columns={accessColumns}
            data={accessEntries}
            getRowKey={(entry) => `${entry.source}:${entry.userId}`}
            rowActions={(entry) =>
              entry.source === "EXPLICIT" ? (
                <Button size="sm" variant="ghost" onClick={() => void handleRemoveAccess(entry)}>
                  {t("projects.access.remove")}
                </Button>
              ) : (
                <Badge variant="neutral">{t("projects.access.implicit")}</Badge>
              )
            }
          />
        </div>
      ) : null}

      {canViewObligationsTab && tab === "obligations" ? (
        <div className="tableSection">
          <div className="sectionHeader">
            <h2 className="sectionTitle">{t("projects.obligations.title")}</h2>
            {canWriteProject && permissions.canCreateObligations ? (
              <Button
                disabled={!canCreateObligationFromProject}
                onClick={() => {
                  setEditingObligationId(null);
                  setObligationModalOpen(true);
                }}
              >
                {t("projects.obligations.actionNew")}
              </Button>
            ) : null}
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
                  {canWriteProject && permissions.canEditObligations ? (
                    <IconButton
                      ariaLabel={t("obligations.action.edit")}
                      onClick={() => {
                        setEditingObligationId(obligation.id);
                        setObligationModalOpen(true);
                      }}
                    >
                      <EditIcon />
                    </IconButton>
                  ) : null}
                  {canWriteProject && permissions.canDeleteObligations ? (
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
          <CommentsPanel entityType="PROJECT" entityId={project.id} canWrite={canUpdate} />
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
            <Button
              onClick={() => void handleDeleteObligation()}
              disabled={isDeleteObligationSubmitting || !canWriteProject || !permissions.canDeleteObligations}
            >
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

      <LegacyDecisionModal
        open={legacyModalOpen}
        onClose={() => {
          setLegacyModalOpen(false);
          setEditingLegacyDecisionId(null);
        }}
        legacyDecision={editingLegacyDecision}
        projectId={project.id}
        authorities={authorities}
        legalDocs={projectAllDocs}
        onSave={saveLegacyDecision}
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
