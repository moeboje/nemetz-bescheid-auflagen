import React, { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Badge, Breadcrumbs, Button, Card } from "@nemetz/ui";
import DeadlineModal from "../components/DeadlineModal";
import AuditTimeline from "../components/AuditTimeline";
import EvidenceCompletionModal from "../components/EvidenceCompletionModal";
import EvidenceListModal from "../components/EvidenceListModal";
import { t } from "../i18n";
import { useAuditLog } from "../state/AuditLogStore";
import { useDeadlines } from "../state/DeadlinesStore";
import { useLegalDocs } from "../state/LegalDocsStore";
import { useProjects } from "../state/ProjectsStore";
import { useScopes } from "../state/ScopesStore";
import { useUsers } from "../state/UsersStore";
import { useAuthorization } from "../state/AuthorizationStore";

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

export default function DeadlineDetailPage() {
  const { id } = useParams();
  const {
    deadlines,
    markDeadlineDoneWithEvidence,
    reopenDeadline,
    getDeadlineStatus
  } = useDeadlines();
  const { projects } = useProjects();
  const { legalDocs, getEffectiveScopeForLegalDoc } = useLegalDocs();
  const { getScopeLabel } = useScopes();
  const { getUser, getDisplayName } = useUsers();
  const { permissions } = useAuthorization();
  const { getEntriesForEntity } = useAuditLog();
  const [modalOpen, setModalOpen] = useState(false);
  const [completionModalOpen, setCompletionModalOpen] = useState(false);
  const [evidenceModalOpen, setEvidenceModalOpen] = useState(false);

  const deadline = useMemo(() => deadlines.find((item) => item.id === id), [deadlines, id]);
  const status = deadline ? getDeadlineStatus(deadline) : "OPEN";
  const legalDoc = legalDocs.find((doc) => doc.id === deadline?.legalDocId);
  const project = projects.find(
    (item) => item.id === (deadline?.projectId ?? legalDoc?.projectId)
  );
  const scopeLabel = useMemo(() => {
    if (!deadline) {
      return "";
    }
    if (legalDoc) {
      const scope = getEffectiveScopeForLegalDoc(legalDoc);
      if (scope) {
        return getScopeLabel(scope.companyId, scope.siteId, scope.facilityId);
      }
    }
    if (project) {
      return getScopeLabel(project.companyId, project.siteId, project.facilityId);
    }
    return "";
  }, [deadline, getEffectiveScopeForLegalDoc, getScopeLabel, legalDoc, project]);

  const historyEntries = useMemo(() => {
    if (!deadline) {
      return [];
    }
    return getEntriesForEntity("DEADLINE", deadline.id);
  }, [deadline, getEntriesForEntity]);

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

  if (!deadline) {
    return (
      <div className="page">
        <Card>
          <p className="placeholderText">{t("deadlines.notFound")}</p>
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
              { key: "deadlines", label: t("breadcrumb.deadlines") },
              { key: "deadline", label: deadline.title }
            ]}
          />
          <h1 className="pageTitle">{deadline.title}</h1>
          <div className="inlineMeta">
            <Badge variant={statusVariant[status]}>
              {status === "OPEN"
                ? t("tasks.status.open")
                : status === "DONE"
                ? t("tasks.status.done")
                : t("tasks.status.overdue")}
            </Badge>
            <span>{t("deadlines.detail.dueDateLabel")}</span>
            <span>{deadline.dueDate}</span>
          </div>
        </div>
        <div className="inlineMeta">
          {status !== "DONE" ? (
            <Button
              variant="secondary"
              disabled={!permissions.canCompleteTasks}
              onClick={() => setCompletionModalOpen(true)}
            >
              {t("deadlines.action.markDone")}
            </Button>
          ) : (
            <>
              <Button
                variant="secondary"
                disabled={!permissions.canEditTasks}
                onClick={() => reopenDeadline(deadline.id)}
              >
                {t("deadlines.action.reopen")}
              </Button>
              <Button variant="secondary" onClick={() => setEvidenceModalOpen(true)}>
                {t("tasks.action.viewEvidence")}
              </Button>
            </>
          )}
          <Button
            disabled={!permissions.canEditDeadlines}
            onClick={() => setModalOpen(true)}
          >
            {t("common.edit")}
          </Button>
        </div>
      </div>

      <Card>
        <h2 className="sectionTitle">{t("deadlines.detail.description")}</h2>
        <div className="metaValue">{deadline.description || t("common.notAvailable")}</div>
      </Card>

      <Card>
        <h2 className="sectionTitle">{t("deadlines.detail.links")}</h2>
        <div className="detailGrid">
          <div>
            <div className="metaLabel">{t("deadlines.form.project")}</div>
            <div className="metaValue">{project?.title || t("common.notAvailable")}</div>
          </div>
          <div>
            <div className="metaLabel">{t("deadlines.form.legalDoc")}</div>
            <div className="metaValue">{legalDoc?.title || t("common.notAvailable")}</div>
          </div>
          <div>
            <div className="metaLabel">{t("deadlines.detail.scope")}</div>
            <div className="metaValue">{scopeLabel || t("common.notAvailable")}</div>
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="sectionTitle">{t("deadlines.detail.responsibility")}</h2>
        <div className="detailGrid">
          <div>
            <div className="metaLabel">{t("deadlines.form.owner")}</div>
            <div className="metaValue">{renderUserValue(deadline.ownerUserId)}</div>
          </div>
          <div>
            <div className="metaLabel">{t("deadlines.form.deputy")}</div>
            <div className="metaValue">{renderUserValue(deadline.deputyUserId)}</div>
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="sectionTitle">{t("deadlines.detail.reminder")}</h2>
        <div className="metaValue">
          {deadline.emailReminderEnabled
            ? `${t("common.email")} · ${getReminderText(deadline.emailReminderDaysBefore)}`
            : t("common.notAvailable")}
        </div>
      </Card>

      <Card>
        <h2 className="sectionTitle">{t("deadlines.detail.activity")}</h2>
        <AuditTimeline entries={historyEntries} />
      </Card>

      <DeadlineModal open={modalOpen} onClose={() => setModalOpen(false)} deadline={deadline} />

      <EvidenceCompletionModal
        open={completionModalOpen}
        onClose={() => setCompletionModalOpen(false)}
        header={t("tasks.complete.modal.title")}
        ownerType="DEADLINE"
        ownerId={deadline.id}
        onSave={(input) => {
          markDeadlineDoneWithEvidence(deadline.id, input);
        }}
      />

      <EvidenceListModal
        open={evidenceModalOpen}
        onClose={() => setEvidenceModalOpen(false)}
        title={t("tasks.evidence.modal.title")}
        evidence={deadline.evidence ?? []}
        ownerType="DEADLINE"
        ownerId={deadline.id}
      />
    </div>
  );
}
