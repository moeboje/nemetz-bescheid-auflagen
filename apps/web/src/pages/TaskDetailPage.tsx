import React, { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Badge, Breadcrumbs, Button, Card, Modal, StatusDot } from "@nemetz/ui";
import { t } from "../i18n";
import { useTasks } from "../state/TasksStore";
import EvidenceListModal from "../components/EvidenceListModal";
import { useAuthorization } from "../state/AuthorizationStore";
import TaskCompleteModal from "../components/TaskCompleteModal";

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

export default function TaskDetailPage() {
  const { id } = useParams();
  const { tasks, setTaskStatus, markTaskDoneWithEvidence } = useTasks();
  const { permissions } = useAuthorization();
  const [modalOpen, setModalOpen] = useState(false);
  const [completionModalOpen, setCompletionModalOpen] = useState(false);
  const [evidenceModalOpen, setEvidenceModalOpen] = useState(false);

  const task = useMemo(() => tasks.find((t) => t.id === id), [id, tasks]);

  if (!task) {
    return (
      <div className="page">
        <Card>
          <p className="placeholderText">{t("tasks.detail.notFound")}</p>
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
              { key: "tasks", label: t("breadcrumb.tasks") },
              { key: "detail", label: t("breadcrumb.taskDetail") }
            ]}
          />
          <h1 className="pageTitle">{task.title}</h1>
        </div>
        <div className="inlineMeta">
          <StatusDot variant={statusVariant[task.status]} />
          <Badge variant={statusVariant[task.status]}>
            {t(
              task.status === "OPEN"
                ? "tasks.status.open"
                : task.status === "IN_PROGRESS"
                ? "tasks.status.inProgress"
                : task.status === "DONE"
                ? "tasks.status.done"
                : "tasks.status.overdue"
            )}
          </Badge>
          <Button onClick={() => setModalOpen(true)}>{t("tasks.detail.changeStatus")}</Button>
          {task.status === "DONE" ? (
            <Button variant="secondary" onClick={() => setEvidenceModalOpen(true)}>
              {t("tasks.actions.viewEvidence")}
            </Button>
          ) : null}
        </div>
      </div>

      <Card>
        <h2 className="sectionTitle">{t("tasks.detail.details")}</h2>
        <div className="detailGrid">
          <div>
            <div className="metaLabel">{t("tasks.detail.dueDate")}</div>
            <div className="metaValue">{task.dueDate}</div>
          </div>
          <div>
            <div className="metaLabel">{t("tasks.detail.type")}</div>
            <div className="metaValue">
              {task.type === "OBLIGATION" ? t("tasks.type.obligation") : t("tasks.type.deadline")}
            </div>
          </div>
          {task.obligationLevel ? (
            <div>
              <div className="metaLabel">{t("tasks.detail.level")}</div>
              <div className="metaValue">
                <Badge variant={levelVariant[task.obligationLevel]}>
                  {task.obligationLevel === "MANDATORY"
                    ? t("tasks.level.mandatory")
                    : t("tasks.level.recommended")}
                </Badge>
              </div>
            </div>
          ) : null}
          <div>
            <div className="metaLabel">{t("tasks.detail.assignee")}</div>
            <div className="metaValue">{task.assignedTo || t("tasks.unassigned")}</div>
          </div>
          <div>
            <div className="metaLabel">{t("tasks.detail.deputy")}</div>
            <div className="metaValue">{task.deputyId || t("tasks.unassigned")}</div>
          </div>
        </div>
      </Card>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        closeAriaLabel={t("tasks.detail.statusModalClose")}
        header={t("tasks.detail.statusModalTitle")}
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              {t("tasks.detail.statusModalCancel")}
            </Button>
            <Button onClick={() => setModalOpen(false)}>{t("tasks.detail.statusModalSave")}</Button>
          </>
        }
      >
        <div className="detailGrid">
          <Button variant="secondary" onClick={() => setTaskStatus(task.id, "OPEN")}>
            {t("tasks.status.open")}
          </Button>
          {task.type === "OBLIGATION" ? (
            <Button variant="secondary" onClick={() => setTaskStatus(task.id, "IN_PROGRESS")}>
              {t("tasks.status.inProgress")}
            </Button>
          ) : null}
          <Button
            variant="secondary"
            disabled={!permissions.canCompleteTasks}
            onClick={() => {
              setModalOpen(false);
              setCompletionModalOpen(true);
            }}
          >
            {t("tasks.status.done")}
          </Button>
        </div>
      </Modal>

      <TaskCompleteModal
        open={completionModalOpen}
        task={task}
        onClose={() => setCompletionModalOpen(false)}
        onSaved={(input) => {
          return markTaskDoneWithEvidence(task.id, input);
        }}
      />

      <EvidenceListModal
        open={evidenceModalOpen}
        onClose={() => setEvidenceModalOpen(false)}
        title={t("tasks.actions.viewEvidence")}
        evidence={task.evidence ?? []}
        ownerType="TASK_EVIDENCE"
        ownerId={task.id}
      />
    </div>
  );
}
