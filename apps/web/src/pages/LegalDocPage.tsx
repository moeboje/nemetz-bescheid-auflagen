import React, { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Badge, Breadcrumbs, Card, DataTable, Button, IconButton, Modal } from "@nemetz/ui";
import { t } from "../i18n";
import { useRuntimeConfig } from "../config/runtimeConfig";
import AuditTimeline from "../components/AuditTimeline";
import DeadlineModal from "../components/DeadlineModal";
import { EyeIcon, EditIcon } from "../components/Icons";
import DocumentsPanel from "../components/DocumentsPanel";
import CommentsPanel from "../components/CommentsPanel";
import ObligationModal from "../components/ObligationModal";
import { useAuditLog } from "../state/AuditLogStore";
import { useDeadlines } from "../state/DeadlinesStore";
import { useLegalDocs } from "../state/LegalDocsStore";
import { useObligations } from "../state/ObligationsStore";
import { useProjects } from "../state/ProjectsStore";
import { useUsers } from "../state/UsersStore";
import { generateTasksFromObligations } from "../state/TasksStore";
import { useAuthorization } from "../state/AuthorizationStore";

const levelVariant = {
  MANDATORY: "danger",
  RECOMMENDED: "warning"
} as const;

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

function isArchivedEntity(value: { isArchived?: boolean; archivedAt?: string }) {
  return Boolean(value.isArchived || value.archivedAt);
}

export default function LegalDocPage() {
  const runtimeConfig = useRuntimeConfig();
  const { id } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState("overview");
  const [archiveModalOpen, setArchiveModalOpen] = useState(false);
  const [obligationModalOpen, setObligationModalOpen] = useState(false);
  const [editingObligationId, setEditingObligationId] = useState<string | null>(null);
  const [deadlineModalOpen, setDeadlineModalOpen] = useState(false);
  const [editingDeadlineId, setEditingDeadlineId] = useState<string | null>(null);
  const {
    legalDocs,
    getEffectiveScopeLabel,
    archiveLegalDoc,
    restoreLegalDoc
  } = useLegalDocs();
  const { entries } = useAuditLog();
  const { projects } = useProjects();
  const { obligations, archiveObligation } = useObligations();
  const { deadlines, getDeadlineStatus, archiveDeadline } = useDeadlines();
  const { getUserLabel } = useUsers();
  const { permissions } = useAuthorization();

  const legalDoc = useMemo(() => legalDocs.find((doc) => doc.id === id), [id, legalDocs]);
  const docProject = projects.find((project) => project.id === legalDoc?.projectId);
  const referencingProjects = useMemo(
    () =>
      projects.filter((project) =>
        (project.referenceLegalDocIds ?? []).includes(legalDoc?.id ?? "")
      ),
    [legalDoc?.id, projects]
  );
  const docObligations = obligations.filter(
    (obligation) =>
      obligation.legalDocId === legalDoc?.id && !obligation.isArchived && !obligation.archivedAt
  );
  const docDeadlines = deadlines.filter(
    (deadline) =>
      deadline.legalDocId === legalDoc?.id && !deadline.isArchived && !deadline.archivedAt
  );

  const historyEntries = useMemo(() => {
    if (!legalDoc) {
      return [];
    }
    const obligationIds = new Set(docObligations.map((obligation) => obligation.id));
    const deadlineIds = new Set(docDeadlines.map((deadline) => deadline.id));

    return entries.filter((entry) => {
      if (entry.entityType === "LEGAL_DOC" && entry.entityId === legalDoc.id) {
        return true;
      }
      if (entry.entityType === "OBLIGATION" && obligationIds.has(entry.entityId)) {
        return true;
      }
      if (entry.entityType === "DEADLINE" && deadlineIds.has(entry.entityId)) {
        return true;
      }
      return false;
    });
  }, [docDeadlines, docObligations, entries, legalDoc]);


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

  const obligationColumns = [
    {
      key: "title",
      header: t("legalDoc.obligations.title"),
      render: (row: (typeof obligations)[number]) => row.title
    },
    {
      key: "level",
      header: t("legalDoc.obligations.level"),
      render: (row: (typeof obligations)[number]) => (
        <Badge variant={levelVariant[row.level]}>
          {row.level === "MANDATORY" ? t("tasks.level.mandatory") : t("tasks.level.recommended")}
        </Badge>
      )
    },
    {
      key: "nextDue",
      header: t("legalDoc.obligations.nextDue"),
      render: (row: (typeof obligations)[number]) => getNextDue(row.id)
    },
    {
      key: "owner",
      header: t("legalDoc.obligations.owner"),
      render: (row: (typeof obligations)[number]) =>
        getUserLabel(row.ownerUserId) || t("common.notAssigned")
    },
    {
      key: "deputy",
      header: t("legalDoc.obligations.deputy"),
      render: (row: (typeof obligations)[number]) =>
        getUserLabel(row.deputyUserId) || t("common.notAssigned")
    },
    {
      key: "emailReminder",
      header: t("obligations.table.emailReminder"),
      render: (row: (typeof obligations)[number]) =>
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

  const deadlineColumns = [
    {
      key: "title",
      header: t("deadlines.table.title"),
      render: (row: (typeof deadlines)[number]) => row.title
    },
    { key: "dueDate", header: t("legalDoc.deadlines.due") },
    {
      key: "owner",
      header: t("legalDoc.deadlines.owner"),
      render: (row: (typeof deadlines)[number]) =>
        getUserLabel(row.ownerUserId) || t("common.notAssigned")
    },
    {
      key: "status",
      header: t("legalDoc.deadlines.status"),
      render: (row: (typeof deadlines)[number]) => {
        const status = getDeadlineStatus(row);
        return (
          <Badge variant={statusVariant[status]}>
            {status === "OPEN"
              ? t("tasks.status.open")
              : status === "DONE"
              ? t("tasks.status.done")
              : t("tasks.status.overdue")}
          </Badge>
        );
      }
    },
    {
      key: "emailReminder",
      header: t("deadlines.table.emailReminder"),
      render: (row: (typeof deadlines)[number]) =>
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

  if (!legalDoc) {
    return (
      <div className="page">
        <Card>
          <p className="placeholderText">{t("legalDoc.notFound")}</p>
        </Card>
      </div>
    );
  }

  const handleArchive = (cascadeChildren: boolean) => {
    if (cascadeChildren) {
      docObligations.forEach((obligation) => archiveObligation(obligation.id));
      docDeadlines.forEach((deadline) => archiveDeadline(deadline.id));
    }
    archiveLegalDoc(legalDoc.id);
    navigate("..", { relative: "path" });
  };

  return (
    <div className="page">
      <div className="pageHeader">
        <div>
          <Breadcrumbs
            ariaLabel={t("breadcrumb.label")}
            items={[
              { key: "home", label: t("breadcrumb.home") },
              { key: "legalDocs", label: t("breadcrumb.legalDocs") },
              { key: "legalDoc", label: legalDoc.title }
            ]}
          />
          <h1 className="pageTitle">{legalDoc.title}</h1>
          <div className="inlineMeta">{legalDoc.shortDescription}</div>
        </div>
        <div className="inlineMeta">
          {!legalDoc.isArchived ? (
            <Button
              variant="secondary"
              disabled={!permissions.canEditLegalDocs}
              onClick={() => setArchiveModalOpen(true)}
            >
              {t("common.archive")}
            </Button>
          ) : (
            <Button
              variant="secondary"
              disabled={!permissions.canEditLegalDocs}
              onClick={() => restoreLegalDoc(legalDoc.id)}
            >
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
          {t("legalDocs.detail.tabs.overview")}
        </button>
        <button
          type="button"
          className={`tabButton ${tab === "obligations" ? "tabButtonActive" : ""}`}
          onClick={() => setTab("obligations")}
        >
          {t("legalDocs.detail.tabs.obligations")}
        </button>
        <button
          type="button"
          className={`tabButton ${tab === "deadlines" ? "tabButtonActive" : ""}`}
          onClick={() => setTab("deadlines")}
        >
          {t("legalDocs.detail.tabs.deadlines")}
        </button>
        <button
          type="button"
          className={`tabButton ${tab === "attachments" ? "tabButtonActive" : ""}`}
          onClick={() => setTab("attachments")}
        >
          {t("legalDocs.detail.tabs.attachments")}
        </button>
        <button
          type="button"
          className={`tabButton ${tab === "notes" ? "tabButtonActive" : ""}`}
          onClick={() => setTab("notes")}
        >
          {t("legalDocs.detail.tabs.notes")}
        </button>
        <button
          type="button"
          className={`tabButton ${tab === "history" ? "tabButtonActive" : ""}`}
          onClick={() => setTab("history")}
        >
          {t("legalDocs.detail.tabs.history")}
        </button>
      </div>

      {tab === "overview" ? (
        <>
          <Card>
            <div className="detailGrid">
              <div>
                <div className="metaLabel">{t("legalDoc.section.project")}</div>
                <div className="metaValue">{docProject?.title ?? t("common.notAvailable")}</div>
              </div>
              <div>
                <div className="metaLabel">{t("legalDoc.section.ref")}</div>
                <div className="metaValue">{legalDoc.reference ?? t("common.notAvailable")}</div>
              </div>
              <div>
                <div className="metaLabel">{t("legalDoc.section.scope")}</div>
                <div className="metaValue">{getEffectiveScopeLabel(legalDoc) || t("legalDocs.scope.unknown")}</div>
              </div>
              <div>
                <div className="metaLabel">{t("legalDoc.section.issuedAt")}</div>
                <div className="metaValue">{legalDoc.issuedAt ?? t("common.notAvailable")}</div>
              </div>
            </div>
          </Card>
          <Card>
            <h2 className="sectionTitle">{t("legalDoc.references.title")}</h2>
            {referencingProjects.length ? (
              <div className="relationLinkList">
                {referencingProjects.map((projectRow) => (
                  <div key={projectRow.id} className="relationLinkItem">
                    <button
                      type="button"
                      className="relationLinkButton"
                      onClick={() => navigate(`/projects/${projectRow.id}`)}
                    >
                      {projectRow.title}
                    </button>
                    {isArchivedEntity(projectRow) ? (
                      <Badge variant="warning">{t("users.archived")}</Badge>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <p className="placeholderText">{t("legalDoc.references.empty")}</p>
            )}
          </Card>
          {runtimeConfig.features.enableAiAnalysis ? (
            <Card>
              <h2 className="sectionTitle">{t("ai.analysis.title")}</h2>
              {legalDoc.aiExtraction ? (
                <div className="modalForm">
                  <div className="inlineMeta">
                    <span>{t("ai.review.language")}: {legalDoc.aiExtraction.language ?? t("common.notAvailable")}</span>
                    <span>{t("ai.review.createdAt")}: {legalDoc.aiExtraction.createdAt}</span>
                  </div>
                  <div className="inlineMeta">
                    <span>{t("ai.obligations.title")}: {legalDoc.aiExtraction.obligations.length}</span>
                    <span>{t("ai.deadlines.title")}: {legalDoc.aiExtraction.deadlines.length}</span>
                  </div>
                  <p className="placeholderText">{t("ai.review.reopenHint")}</p>
                  {legalDoc.aiExtraction.warnings?.length ? (
                    <div className="timeline">
                      {legalDoc.aiExtraction.warnings.map((warning) => (
                        <div key={warning} className="placeholderText">
                          {warning}
                        </div>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="placeholderText">{t("ai.analysis.empty")}</p>
              )}
            </Card>
          ) : (
            <Card>
              <p className="placeholderText">{t("ai.analysis.disabled")}</p>
            </Card>
          )}
        </>
      ) : null}

      {tab === "obligations" ? (
        <div className="tableSection">
          <div className="sectionHeader">
            <h2 className="sectionTitle">{t("legalDoc.obligations.titleSection")}</h2>
            <Button
              disabled={!permissions.canEditObligations}
              onClick={() => setObligationModalOpen(true)}
            >
              {t("legalDoc.obligations.actionNew")}
            </Button>
          </div>
          <DataTable
            columns={obligationColumns}
            data={docObligations}
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
                    setObligationModalOpen(true);
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
            <h2 className="sectionTitle">{t("legalDocs.detail.tabs.deadlines")}</h2>
            <Button
              disabled={!permissions.canEditDeadlines}
              onClick={() => setDeadlineModalOpen(true)}
            >
              {t("deadlines.new")}
            </Button>
          </div>
          <DataTable
            columns={deadlineColumns}
            data={docDeadlines}
            getRowKey={(row) => row.id}
            rowActions={(row) => (
              <div className="tableActions">
                <IconButton
                  ariaLabel={t("common.view")}
                  onClick={() => navigate(`/deadlines/${row.id}`)}
                >
                  <EyeIcon />
                </IconButton>
                <IconButton
                  ariaLabel={t("common.edit")}
                  disabled={!permissions.canEditDeadlines}
                  onClick={() => {
                    setEditingDeadlineId(row.id);
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
            ownerType="LEGAL_DOC"
            ownerId={legalDoc.id}
            titleKey="legalDoc.section.attachments"
            allowUpload={permissions.canEditLegalDocs}
            legacyItems={legalDoc.attachments}
          />
        </Card>
      ) : null}

      {tab === "notes" ? (
        <Card>
          <CommentsPanel entityType="LEGAL_DOC" entityId={legalDoc.id} />
        </Card>
      ) : null}

      {tab === "history" ? (
        <Card>
          <h2 className="sectionTitle">{t("legalDocs.detail.tabs.history")}</h2>
          <AuditTimeline entries={historyEntries} />
        </Card>
      ) : null}

      <ObligationModal
        open={obligationModalOpen}
        onClose={() => {
          setObligationModalOpen(false);
          setEditingObligationId(null);
        }}
        obligation={docObligations.find((item) => item.id === editingObligationId)}
        legalDocId={legalDoc.id}
        lockLegalDoc
      />
      <DeadlineModal
        open={deadlineModalOpen}
        onClose={() => {
          setDeadlineModalOpen(false);
          setEditingDeadlineId(null);
        }}
        deadline={docDeadlines.find((item) => item.id === editingDeadlineId)}
        initialProjectId={legalDoc.projectId}
        initialLegalDocId={legalDoc.id}
        lockProject
        lockLegalDoc
      />

      <Modal
        open={archiveModalOpen}
        onClose={() => setArchiveModalOpen(false)}
        closeAriaLabel={t("modal.close")}
        header={t("legalDocs.archive.confirmTitle")}
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
              {t("legalDocs.archive.parentOnly")}
            </Button>
            <Button
              onClick={() => {
                setArchiveModalOpen(false);
                handleArchive(true);
              }}
              disabled={docObligations.length + docDeadlines.length === 0}
            >
              {t("legalDocs.archive.withChildren")}
            </Button>
          </div>
        }
      >
        <div className="modalForm">
          <p className="placeholderText">{t("legalDocs.archive.warning")}</p>
          <div className="detailGrid">
            <div>
              <div className="metaLabel">{t("legalDocs.archive.children.obligations")}</div>
              <div className="metaValue">{docObligations.length}</div>
            </div>
            <div>
              <div className="metaLabel">{t("legalDocs.archive.children.deadlines")}</div>
              <div className="metaValue">{docDeadlines.length}</div>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
