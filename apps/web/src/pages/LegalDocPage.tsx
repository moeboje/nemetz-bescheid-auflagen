import React, { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Badge, Breadcrumbs, Card, DataTable, Button, IconButton } from "@nemetz/ui";
import { t } from "../i18n";
import { useLegalDocs } from "../state/LegalDocsStore";
import { useProjects } from "../state/ProjectsStore";
import { useObligations } from "../state/ObligationsStore";
import { useDeadlines } from "../state/DeadlinesStore";
import { useUsers } from "../state/UsersStore";
import { generateTasksFromObligations } from "../state/TasksStore";
import FileUploadStub, { UploadItem } from "../components/FileUploadStub";
import ObligationModal from "../components/ObligationModal";
import DeadlineModal from "../components/DeadlineModal";
import { EyeIcon, EditIcon } from "../components/Icons";

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

function createAttachment(file: File): UploadItem {
  return {
    id: `lda-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    filename: file.name,
    sizeKb: Math.max(1, Math.ceil(file.size / 1024)),
    addedAt: new Date().toISOString().slice(0, 10)
  };
}

export default function LegalDocPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState("overview");
  const [obligationModalOpen, setObligationModalOpen] = useState(false);
  const [editingObligationId, setEditingObligationId] = useState<string | null>(null);
  const [deadlineModalOpen, setDeadlineModalOpen] = useState(false);
  const [editingDeadlineId, setEditingDeadlineId] = useState<string | null>(null);
  const { legalDocs, addLegalDocAttachment, removeLegalDocAttachment, getEffectiveScopeLabel } =
    useLegalDocs();
  const { projects } = useProjects();
  const { obligations } = useObligations();
  const { deadlines, getDeadlineStatus } = useDeadlines();
  const { getUserLabel } = useUsers();

  const legalDoc = useMemo(() => legalDocs.find((doc) => doc.id === id), [id, legalDocs]);
  const docProject = projects.find((project) => project.id === legalDoc?.projectId);
  const docObligations = obligations.filter((obligation) => obligation.legalDocId === legalDoc?.id);
  const docDeadlines = deadlines.filter((deadline) => deadline.legalDocId === legalDoc?.id);

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
    { key: "title", header: t("legalDoc.obligations.title"), render: (row: (typeof obligations)[number]) => row.title },
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
      </div>

      <div className="tabs">
        <button
          type="button"
          className={`tabButton ${tab === "overview" ? "tabButtonActive" : ""}`}
          onClick={() => setTab("overview")}
        >
          {t("legalDoc.tabs.overview")}
        </button>
        <button
          type="button"
          className={`tabButton ${tab === "obligations" ? "tabButtonActive" : ""}`}
          onClick={() => setTab("obligations")}
        >
          {t("legalDoc.tabs.obligations")}
        </button>
        <button
          type="button"
          className={`tabButton ${tab === "deadlines" ? "tabButtonActive" : ""}`}
          onClick={() => setTab("deadlines")}
        >
          {t("legalDoc.tabs.deadlines")}
        </button>
        <button
          type="button"
          className={`tabButton ${tab === "history" ? "tabButtonActive" : ""}`}
          onClick={() => setTab("history")}
        >
          {t("legalDoc.tabs.history")}
        </button>
      </div>

      {tab === "overview" ? (
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
          <div className="sectionSpacer" />
          <FileUploadStub
            label={t("legalDoc.section.attachments")}
            selectLabel={t("common.selectFile")}
            removeLabel={t("common.remove")}
            items={legalDoc.attachments}
            onAddFiles={(files) =>
              files.forEach((file) => addLegalDocAttachment(legalDoc.id, createAttachment(file)))
            }
            onRemove={(attachmentId) => removeLegalDocAttachment(legalDoc.id, attachmentId)}
          />
        </Card>
      ) : null}

      {tab === "obligations" ? (
        <div className="tableSection">
          <div className="sectionHeader">
            <h2 className="sectionTitle">{t("legalDoc.obligations.titleSection")}</h2>
            <Button onClick={() => setObligationModalOpen(true)}>
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
            <h2 className="sectionTitle">{t("legalDoc.tabs.deadlines")}</h2>
            <Button onClick={() => setDeadlineModalOpen(true)}>{t("deadlines.new")}</Button>
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

      {tab === "history" ? (
        <Card>
          <h2 className="sectionTitle">{t("legalDoc.history.title")}</h2>
          <div className="timeline">
            {[
              { id: "h-01", date: "2026-02-20", text: t("legalDoc.history.imported") },
              { id: "h-02", date: "2026-02-22", text: t("legalDoc.history.obligationAdded") },
              { id: "h-03", date: "2026-02-23", text: t("legalDoc.history.deadlineUpdated") }
            ].map((entry) => (
              <div key={entry.id} className="timelineItem">
                <div className="metaLabel">{entry.date}</div>
                <div className="metaValue">{entry.text}</div>
              </div>
            ))}
          </div>
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
    </div>
  );
}
