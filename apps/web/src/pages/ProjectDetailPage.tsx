import React, { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Breadcrumbs,
  Button,
  Card,
  DataTable,
  IconButton,
  Modal,
  Select
} from "@nemetz/ui";
import { t } from "../i18n";
import AuditTimeline from "../components/AuditTimeline";
import DeadlineModal from "../components/DeadlineModal";
import { EyeIcon, EditIcon } from "../components/Icons";
import FileUploadStub, { UploadItem } from "../components/FileUploadStub";
import ExternalParticipantModal from "../components/ExternalParticipantModal";
import LegalDocModal from "../components/LegalDocModal";
import ProjectModal from "../components/ProjectModal";
import type { ExternalParticipant } from "../data/projects";
import { ProjectPolicy } from "../policies/ProjectPolicy";
import { useAuditLog } from "../state/AuditLogStore";
import { useAuthorization } from "../state/AuthorizationStore";
import { useAuthorities } from "../state/AuthoritiesStore";
import { useDeadlines } from "../state/DeadlinesStore";
import { useLegalDocs } from "../state/LegalDocsStore";
import { useObligations } from "../state/ObligationsStore";
import { useProjects } from "../state/ProjectsStore";
import { useScopes } from "../state/ScopesStore";
import { useUsers } from "../state/UsersStore";

function createAttachment(file: File): UploadItem {
  return {
    id: `pa-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    filename: file.name,
    sizeKb: Math.max(1, Math.ceil(file.size / 1024)),
    addedAt: new Date().toISOString().slice(0, 10)
  };
}

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

export default function ProjectDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { actor } = useAuthorization();
  const { entries } = useAuditLog();
  const {
    projects,
    updateProject,
    archiveProject,
    restoreProject,
    addProjectAttachment,
    removeProjectAttachment,
    addExternalParticipant,
    updateExternalParticipant,
    archiveExternalParticipant,
    restoreExternalParticipant
  } = useProjects();
  const { obligations, archiveObligation } = useObligations();
  const { getScopeLabel } = useScopes();
  const { contacts, getAuthorityName, getContactsForAuthority } = useAuthorities();
  const { users, getUserLabel } = useUsers();
  const { legalDocs, archiveLegalDoc } = useLegalDocs();
  const { deadlines, archiveDeadline, getDeadlineStatus } = useDeadlines();

  const [tab, setTab] = useState("overview");
  const [archiveModalOpen, setArchiveModalOpen] = useState(false);
  const [legalDocModalOpen, setLegalDocModalOpen] = useState(false);
  const [editProjectOpen, setEditProjectOpen] = useState(false);
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [deadlineModalOpen, setDeadlineModalOpen] = useState(false);
  const [editingDeadlineId, setEditingDeadlineId] = useState<string | null>(null);
  const [externalModalOpen, setExternalModalOpen] = useState(false);
  const [editingExternalParticipantId, setEditingExternalParticipantId] = useState<string | null>(
    null
  );
  const [showArchivedExternal, setShowArchivedExternal] = useState(false);

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
  const projectDocIds = useMemo(() => new Set(projectDocs.map((doc) => doc.id)), [projectDocs]);

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

  const userOptions = useMemo(
    () => users.map((user) => ({ value: user.id, label: user.displayName })),
    [users]
  );

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
  const canRemoveAttachment = ProjectPolicy.removeAttachment(actor, project);

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
    }
  ];

  const handleArchive = (cascadeChildren: boolean) => {
    if (cascadeChildren) {
      projectDocs.forEach((doc) => archiveLegalDoc(doc.id));
      projectObligations.forEach((obligation) => archiveObligation(obligation.id));
      projectDeadlines.forEach((deadline) => archiveDeadline(deadline.id));
    }
    const archived = archiveProject(project.id);
    if (archived) {
      navigate("..", { relative: "path" });
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
            <Button variant="secondary" disabled={!canArchive} onClick={() => restoreProject(project.id)}>
              {t("common.restore")}
            </Button>
          )}
        </div>
      </div>

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
        <button
          type="button"
          className={`tabButton ${tab === "participants" ? "tabButtonActive" : ""}`}
          onClick={() => setTab("participants")}
        >
          {t("projects.detail.tabs.participants")}
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
        <Card>
          <div className="detailGrid">
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
              <div className="metaValue">{getUserLabel(project.ownerUserId) || t("common.notAssigned")}</div>
            </div>
            <div>
              <div className="metaLabel">{t("projects.detail.deputy")}</div>
              <div className="metaValue">{getUserLabel(project.deputyUserId) || t("common.notAssigned")}</div>
            </div>
          </div>
        </Card>
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
          <FileUploadStub
            label={t("projects.detail.attachments")}
            selectLabel={t("common.selectFile")}
            removeLabel={t("common.remove")}
            disabled={!canUpdate}
            items={project.attachments}
            onAddFiles={(files) =>
              files.forEach((file) => {
                addProjectAttachment(project.id, createAttachment(file));
              })
            }
            onRemove={(attachmentId) => {
              if (!canRemoveAttachment) {
                return;
              }
              removeProjectAttachment(project.id, attachmentId);
            }}
          />
        </Card>
      ) : null}

      {tab === "participants" ? (
        <div className="tableSection">
          <Card>
            <h2 className="sectionTitle">{t("projects.participants.internalTitle")}</h2>
            <div className="modalForm">
              <div className="formField">
                <span className="fieldLabel">{t("projects.detail.owner")}</span>
                <Select
                  options={[{ value: "", label: t("projects.detail.owner") }, ...userOptions]}
                  value={project.ownerUserId ?? ""}
                  disabled={!canUpdate}
                  onChange={(event) =>
                    updateProject(project.id, { ownerUserId: event.target.value || undefined })
                  }
                />
              </div>
              <div className="formField">
                <span className="fieldLabel">{t("projects.detail.deputy")}</span>
                <Select
                  options={[{ value: "", label: t("projects.detail.deputy") }, ...userOptions]}
                  value={project.deputyUserId ?? ""}
                  disabled={!canUpdate}
                  onChange={(event) =>
                    updateProject(project.id, { deputyUserId: event.target.value || undefined })
                  }
                />
              </div>
              <div className="formField">
                <span className="fieldLabel">{t("projects.detail.participants")}</span>
                <Select
                  multiple
                  options={userOptions}
                  value={getParticipantUserIds(project)}
                  disabled={!canUpdate}
                  onChange={(event) => {
                    const values = Array.from(event.currentTarget.selectedOptions).map(
                      (option) => option.value
                    );
                    const internalParticipants = values.map((userId) => ({ userId }));
                    updateProject(project.id, {
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
                      onClick={() => archiveExternalParticipant(project.id, participant.id)}
                    >
                      {t("common.archive")}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={!canUpdate}
                      onClick={() => restoreExternalParticipant(project.id, participant.id)}
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

      <ProjectModal open={editProjectOpen} onClose={() => setEditProjectOpen(false)} project={project} />

      <ExternalParticipantModal
        open={externalModalOpen}
        onClose={() => {
          setExternalModalOpen(false);
          setEditingExternalParticipantId(null);
        }}
        participant={editingExternalParticipant}
        onSave={(input) => {
          if (!canUpdate) {
            return;
          }
          if (editingExternalParticipant) {
            updateExternalParticipant(project.id, editingExternalParticipant.id, input);
            return;
          }
          addExternalParticipant(project.id, input);
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
                handleArchive(false);
              }}
            >
              {t("projects.archive.parentOnly")}
            </Button>
            <Button
              onClick={() => {
                setArchiveModalOpen(false);
                handleArchive(true);
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
