import React, { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Badge, Breadcrumbs, Button, Card, Modal, StatusDot } from "@nemetz/ui";
import { t } from "../i18n";
import { useTasks } from "../state/TasksStore";

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
  const { tasks, setTaskStatus } = useTasks();
  const [modalOpen, setModalOpen] = useState(false);

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
            <div className="metaValue">{task.assignedTo || t("common.notAssigned")}</div>
          </div>
          <div>
            <div className="metaLabel">{t("tasks.detail.deputy")}</div>
            <div className="metaValue">{task.deputyId || t("common.notAssigned")}</div>
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
          <Button variant="secondary" onClick={() => setTaskStatus(task.id, "DONE")}>
            {t("tasks.status.done")}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
