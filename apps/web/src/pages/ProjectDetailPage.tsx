import React, { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  Breadcrumbs,
  Button,
  Card,
  DataTable,
  IconButton,
  Select
} from "@nemetz/ui";
import { t } from "../i18n";
import { EyeIcon, EditIcon } from "../components/Icons";
import { useProjects } from "../state/ProjectsStore";
import { useScopes } from "../state/ScopesStore";
import { useAuthorities } from "../state/AuthoritiesStore";
import { useUsers } from "../state/UsersStore";
import { useLegalDocs } from "../state/LegalDocsStore";
import { useAuthorization } from "../state/AuthorizationStore";
import FileUploadStub, { UploadItem } from "../components/FileUploadStub";
import LegalDocModal from "../components/LegalDocModal";
import ProjectModal from "../components/ProjectModal";
import ExternalParticipantModal from "../components/ExternalParticipantModal";
import type { ExternalParticipant } from "../data/projects";
import { ProjectPolicy } from "../policies/ProjectPolicy";

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

export default function ProjectDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { actor } = useAuthorization();
  const {
    projects,
    updateProject,
    archiveProject,
    addProjectAttachment,
    removeProjectAttachment,
    addExternalParticipant,
    updateExternalParticipant,
    archiveExternalParticipant
  } = useProjects();
  const { getScopeLabel } = useScopes();
  const { getAuthorityName, getContactsForAuthority } = useAuthorities();
  const { users, getUserLabel } = useUsers();
  const { legalDocs } = useLegalDocs();
  const [tab, setTab] = useState("overview");
  const [legalDocModalOpen, setLegalDocModalOpen] = useState(false);
  const [editProjectOpen, setEditProjectOpen] = useState(false);
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
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
  const contacts = getContactsForAuthority(project?.authorityId);
  const contactName = contacts.find((contact) => contact.id === project?.authorityContactId)?.name;
  const projectDocs = legalDocs.filter((doc) => doc.projectId === project?.id);

  const userOptions = useMemo(
    () => users.map((user) => ({ value: user.id, label: user.displayName })),
    [users]
  );

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
      render: (doc: (typeof legalDocs)[number]) => doc.updatedAt
    }
  ];

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
          {canArchive ? (
            <Button
              variant="secondary"
              onClick={() => {
                const archived = archiveProject(project.id);
                if (archived) {
                  navigate("..", { relative: "path" });
                }
              }}
            >
              {t("common.archive")}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="tabs">
        <button
          type="button"
          className={`tabButton ${tab === "overview" ? "tabButtonActive" : ""}`}
          onClick={() => setTab("overview")}
        >
          {t("projects.tabs.overview")}
        </button>
        <button
          type="button"
          className={`tabButton ${tab === "legalDocs" ? "tabButtonActive" : ""}`}
          onClick={() => setTab("legalDocs")}
        >
          {t("projects.tabs.legalDocs")}
        </button>
        <button
          type="button"
          className={`tabButton ${tab === "attachments" ? "tabButtonActive" : ""}`}
          onClick={() => setTab("attachments")}
        >
          {t("projects.tabs.attachments")}
        </button>
        <button
          type="button"
          className={`tabButton ${tab === "participants" ? "tabButtonActive" : ""}`}
          onClick={() => setTab("participants")}
        >
          {t("projects.tabs.participants")}
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
                  ) : null}
                </div>
              )}
            />
          </div>
        </div>
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
    </div>
  );
}
