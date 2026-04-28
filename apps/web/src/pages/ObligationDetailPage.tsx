import React, { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Badge, Breadcrumbs, Button, Card } from "@nemetz/ui";
import { t } from "../i18n";
import AuditTimeline from "../components/AuditTimeline";
import RequirementChips from "../components/RequirementChips";
import { useAuditLog } from "../state/AuditLogStore";
import { useObligations } from "../state/ObligationsStore";
import { useLegalDocs } from "../state/LegalDocsStore";
import { useProjects } from "../state/ProjectsStore";
import { useUsers } from "../state/UsersStore";
import { generateTasksFromObligations } from "../state/TasksStore";
import { useTaskState } from "../state/TaskStateStore";
import ObligationModal from "../components/ObligationModal";
import { useAuthorization } from "../state/AuthorizationStore";

const levelVariant = {
  MANDATORY: "danger",
  RECOMMENDED: "warning"
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

export default function ObligationDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { obligations } = useObligations();
  const { legalDocs, getEffectiveScopeLabel } = useLegalDocs();
  const { projects } = useProjects();
  const { getUser, getDisplayName } = useUsers();
  const { getEntriesForEntity } = useAuditLog();
  const { taskState } = useTaskState();
  const { permissions } = useAuthorization();
  const [modalOpen, setModalOpen] = useState(false);

  const obligation = useMemo(
    () => obligations.find((item) => item.id === id),
    [id, obligations]
  );
  const legalDoc = legalDocs.find((doc) => doc.id === obligation?.legalDocId);
  const project = projects.find((item) => item.id === legalDoc?.projectId);

  const taskPreview = useMemo(() => {
    if (!obligation) {
      return [] as { id: string; dueDate: string }[];
    }
    const today = new Date().toISOString().slice(0, 10);
    return generateTasksFromObligations([obligation], 365)
      .filter((task) => task.dueDate >= today)
      .slice(0, 5)
      .map((task) => ({ id: task.id, dueDate: task.dueDate }));
  }, [obligation]);

  const historyEntries = useMemo(() => {
    if (!obligation) {
      return [];
    }
    return getEntriesForEntity("OBLIGATION", obligation.id);
  }, [getEntriesForEntity, obligation]);

  const latestEvidence = useMemo(() => {
    if (!obligation) {
      return [] as Array<{ instanceId: string; dueDate: string; createdAt: string; summary: string }>;
    }
    const seeds = generateTasksFromObligations([obligation], 365);
    return seeds
      .flatMap((seed) => {
        const entry = taskState[seed.id];
        const evidenceRows = entry?.evidence ?? [];
        return evidenceRows.map((evidence) => ({
          instanceId: seed.id,
          dueDate: seed.dueDate,
          createdAt: evidence.createdAt,
          summary:
            evidence.note ||
            (evidence.outcome
              ? evidence.outcome === "OK"
                ? t("evidence.outcome.ok")
                : evidence.outcome === "NOK"
                ? t("evidence.outcome.nok")
                : t("evidence.outcome.followUp")
              : t("evidence.summary.default"))
        }));
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 3);
  }, [obligation, taskState]);

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

  if (!obligation) {
    return (
      <div className="page">
        <Card>
          <p className="placeholderText">{t("obligations.detail.notFound")}</p>
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
              { key: "obligations", label: t("breadcrumb.obligations") },
              { key: "obligation", label: obligation.title }
            ]}
          />
          <h1 className="pageTitle">{obligation.title}</h1>
        </div>
        <Button
          disabled={!permissions.canEditObligations}
          onClick={() => setModalOpen(true)}
        >
          {t("obligations.action.edit")}
        </Button>
      </div>

      <Card>
        <div className="detailGrid">
          <div>
            <div className="metaLabel">{t("obligations.detail.level")}</div>
            <div className="metaValue">
              <Badge variant={levelVariant[obligation.level]}>
                {obligation.level === "MANDATORY" ? t("tasks.level.mandatory") : t("tasks.level.recommended")}
              </Badge>
            </div>
          </div>
          <div>
            <div className="metaLabel">{t("obligations.detail.legalDoc")}</div>
            <div className="metaValue">{legalDoc?.title ?? t("common.notAvailable")}</div>
          </div>
          <div>
            <div className="metaLabel">{t("obligations.detail.project")}</div>
            <div className="metaValue">{project?.title ?? t("common.notAvailable")}</div>
          </div>
          <div>
            <div className="metaLabel">{t("obligations.detail.scope")}</div>
            <div className="metaValue">
              {legalDoc ? getEffectiveScopeLabel(legalDoc) : t("common.notAvailable")}
            </div>
          </div>
          <div>
            <div className="metaLabel">{t("obligations.detail.owner")}</div>
            <div className="metaValue">{renderUserValue(obligation.ownerUserId)}</div>
          </div>
          <div>
            <div className="metaLabel">{t("obligations.detail.deputy")}</div>
            <div className="metaValue">{renderUserValue(obligation.deputyUserId)}</div>
          </div>
          <div>
            <div className="metaLabel">{t("obligations.detail.scheduleType")}</div>
            <div className="metaValue">
              {obligation.scheduleType === "ONCE"
                ? t("obligations.schedule.once")
                : obligation.scheduleType === "RECURRING"
                ? t("obligations.schedule.recurring")
                : t("obligations.schedule.onceThenRecurring")}
            </div>
          </div>
          <div>
            <div className="metaLabel">{t("obligations.detail.firstDueDate")}</div>
            <div className="metaValue">{obligation.firstDueDate ?? t("common.notAvailable")}</div>
          </div>
          <div>
            <div className="metaLabel">{t("obligations.detail.interval")}</div>
            <div className="metaValue">
              {obligation.intervalValue && obligation.intervalUnit
                ? `${obligation.intervalValue} ${getIntervalUnitLabel(obligation.intervalUnit)}`
                : t("common.notAvailable")}
            </div>
          </div>
          <div>
            <div className="metaLabel">{t("obligations.detail.emailReminder")}</div>
            <div className="metaValue">
              {obligation.emailReminderEnabled
                ? `${t("common.email")} · ${getReminderText(obligation.emailReminderDaysBefore)}`
                : t("common.notAvailable")}
            </div>
          </div>
          <div>
            <div className="metaLabel">{t("obligations.evidence.title")}</div>
            <div className="metaValue obligationEvidenceMeta">
              <RequirementChips requirements={obligation.evidenceRequirements} />
            </div>
          </div>
        </div>
      </Card>

      <Card>
        <h2 className="sectionTitle">{t("obligations.detail.infoTextLong")}</h2>
        <div className="metaValue">{obligation.infoTextLong || t("common.notAvailable")}</div>
      </Card>

      {permissions.canViewTasks ? (
        <Card>
          <h2 className="sectionTitle">{t("obligations.detail.taskPreview")}</h2>
          {taskPreview.length ? (
            <div className="timeline">
              {taskPreview.map((task) => (
                <div key={task.id} className="timelineItem">
                  <div className="metaLabel">{task.dueDate}</div>
                  <div className="metaValue">{t("obligations.detail.generatedTask")}</div>
                </div>
              ))}
            </div>
          ) : (
            <p className="placeholderText">{t("obligations.detail.noTasks")}</p>
          )}
        </Card>
      ) : null}

      <Card>
        <h2 className="sectionTitle">{t("obligations.detail.history")}</h2>
        <AuditTimeline entries={historyEntries} />
      </Card>

      {permissions.canViewTasks ? (
        <Card>
          <div className="sectionHeader">
            <h2 className="sectionTitle">{t("obligations.detail.latestEvidence")}</h2>
            <Button
              variant="secondary"
              onClick={() => navigate(`/tasks?obligationId=${obligation.id}`)}
            >
              {t("obligations.detail.openTasksFiltered")}
            </Button>
          </div>
          {latestEvidence.length ? (
            <div className="timeline">
              {latestEvidence.map((item) => (
                <div key={`${item.instanceId}-${item.createdAt}`} className="timelineItem">
                  <div className="metaLabel">{item.createdAt.slice(0, 16).replace("T", " ")}</div>
                  <div className="metaValue">
                    {item.dueDate} · {item.summary}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="placeholderText">{t("obligations.detail.noEvidence")}</p>
          )}
        </Card>
      ) : null}

      <ObligationModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        obligation={obligation}
        legalDocId={obligation.legalDocId}
        lockLegalDoc
      />
    </div>
  );
}
