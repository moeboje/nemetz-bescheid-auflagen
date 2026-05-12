import React, { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Badge, Breadcrumbs, Button, Card, Modal, StatusDot } from "@nemetz/ui";
import { t } from "../i18n";
import { useTasks } from "../state/TasksStore";
import EvidenceListModal from "../components/EvidenceListModal";
import { useAuthorization } from "../state/AuthorizationStore";
import TaskCompleteModal from "../components/TaskCompleteModal";
import DocumentsPanel from "../components/DocumentsPanel";
import type { DocumentOwnerType } from "../api/documents";
import { createEvidenceUploadError, uploadEvidenceDocument, uploadEvidenceDocuments } from "../services/evidenceDocuments";
import {
  getPendingEvidenceFilesToUpload,
  mergeEvidenceDocumentIds,
  mergeUploadedEvidenceFiles,
  type UploadedEvidenceFile
} from "../services/evidenceUploadRetry";

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

type CompletionUploadCache = {
  taskId: string | null;
  uploadedFiles: UploadedEvidenceFile[];
};

function getTaskEvidenceOwner(task?: { type: string; id: string; deadlineId?: string }) {
  if (!task) {
    return null;
  }
  if (task.type === "DEADLINE") {
    return task.deadlineId ? { ownerType: "DEADLINE" as DocumentOwnerType, ownerId: task.deadlineId } : null;
  }
  return { ownerType: "TASK_EVIDENCE" as DocumentOwnerType, ownerId: task.id };
}

export default function TaskDetailPage() {
  const { id } = useParams();
  const { tasks, setTaskStatus, markTaskDoneWithEvidence } = useTasks();
  const { permissions } = useAuthorization();
  const [modalOpen, setModalOpen] = useState(false);
  const [completionModalOpen, setCompletionModalOpen] = useState(false);
  const [evidenceModalOpen, setEvidenceModalOpen] = useState(false);
  const [evidenceRefreshKey, setEvidenceRefreshKey] = useState(0);
  const [completionUploadCache, setCompletionUploadCache] = useState<CompletionUploadCache>({
    taskId: null,
    uploadedFiles: []
  });

  const task = useMemo(() => tasks.find((t) => t.id === id), [id, tasks]);
  const canWriteTaskProject = Boolean(task?.projectCanWrite);
  const canEditTaskStatus = permissions.canEditTasks && canWriteTaskProject;
  const canCompleteTask = permissions.canCompleteTasks && canWriteTaskProject;
  const evidenceOwner = getTaskEvidenceOwner(task);
  const canUploadEvidence = Boolean(
    evidenceOwner &&
      canWriteTaskProject &&
      (permissions.canCompleteTasks || (evidenceOwner.ownerType === "DEADLINE" && permissions.canEditDeadlines))
  );
  const canManageEvidence = Boolean(
    evidenceOwner?.ownerType === "DEADLINE" && canWriteTaskProject && permissions.canEditDeadlines
  );

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
          <Button disabled={!canEditTaskStatus && !canCompleteTask} onClick={() => setModalOpen(true)}>
            {t("tasks.detail.changeStatus")}
          </Button>
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

      {evidenceOwner ? (
        <Card>
          <h2 className="sectionTitle">{t("tasks.evidence.modal.title")}</h2>
          <DocumentsPanel
            ownerType={evidenceOwner.ownerType}
            ownerId={evidenceOwner.ownerId}
            titleKey="documents.title"
            allowUpload={canUploadEvidence}
            allowManage={canManageEvidence}
            showManageActions={canManageEvidence}
            refreshKey={evidenceRefreshKey}
          />
        </Card>
      ) : null}

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
          <Button
            variant="secondary"
            disabled={!canEditTaskStatus}
            onClick={() => setTaskStatus(task.id, "OPEN")}
          >
            {t("tasks.status.open")}
          </Button>
          {task.type === "OBLIGATION" ? (
            <Button
              variant="secondary"
              disabled={!canEditTaskStatus}
              onClick={() => setTaskStatus(task.id, "IN_PROGRESS")}
            >
              {t("tasks.status.inProgress")}
            </Button>
          ) : null}
          <Button
            variant="secondary"
            disabled={!canCompleteTask}
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
        onClose={() => {
          setCompletionUploadCache({ taskId: null, uploadedFiles: [] });
          setCompletionModalOpen(false);
        }}
        onSaved={async (input) => {
          if (!canCompleteTask) {
            return;
          }
          const uploadBeforeComplete = Boolean(evidenceOwner && input.files.length && task.type === "OBLIGATION");
          const cachedUploadedFiles =
            completionUploadCache.taskId === task.id ? completionUploadCache.uploadedFiles : [];
          let uploadedFiles = cachedUploadedFiles;
          let evidenceDocumentIds = mergeEvidenceDocumentIds(
            input.evidenceDocumentIds,
            uploadedFiles.map((entry) => entry.documentId)
          );

          if (evidenceOwner && uploadBeforeComplete) {
            const pendingUploads = getPendingEvidenceFilesToUpload(input.files, uploadedFiles);
            for (const pendingUpload of pendingUploads) {
              try {
                const uploadedDocument = await uploadEvidenceDocument(evidenceOwner.ownerType, evidenceOwner.ownerId, pendingUpload.file);
                const uploadedFile = {
                  fileKey: pendingUpload.fileKey,
                  documentId: uploadedDocument.id
                };
                uploadedFiles = mergeUploadedEvidenceFiles(uploadedFiles, uploadedFile);
                evidenceDocumentIds = mergeEvidenceDocumentIds(evidenceDocumentIds, [uploadedDocument.id]);
                setCompletionUploadCache((previous) => ({
                  taskId: task.id,
                  uploadedFiles:
                    previous.taskId === task.id
                      ? mergeUploadedEvidenceFiles(previous.uploadedFiles, uploadedFile)
                      : [uploadedFile]
                }));
                setEvidenceRefreshKey((value) => value + 1);
              } catch {
                throw createEvidenceUploadError(t("documents.uploadError"), { completionSaved: false });
              }
            }
          }

          const completed = await markTaskDoneWithEvidence(task.id, {
            note: input.note,
            outcome: input.outcome,
            attachments: input.attachments,
            evidenceDocumentIds
          });
          if (!completed) {
            throw new Error(t("tasks.complete.saveError"));
          }
          setCompletionUploadCache({ taskId: null, uploadedFiles: [] });
          if (evidenceOwner && input.files.length && !uploadBeforeComplete) {
            try {
              await uploadEvidenceDocuments(evidenceOwner.ownerType, evidenceOwner.ownerId, input.files);
              setEvidenceRefreshKey((value) => value + 1);
            } catch {
              throw createEvidenceUploadError(t("evidence.documents.partialTaskUploadError"));
            }
          }
        }}
      />

      <EvidenceListModal
        open={evidenceModalOpen}
        onClose={() => setEvidenceModalOpen(false)}
        title={t("tasks.actions.viewEvidence")}
        evidence={task.evidence ?? []}
        ownerType={evidenceOwner?.ownerType}
        ownerId={evidenceOwner?.ownerId}
        allowUpload={canUploadEvidence}
        allowManage={canManageEvidence}
        onDocumentsChanged={() => setEvidenceRefreshKey((value) => value + 1)}
      />
    </div>
  );
}
