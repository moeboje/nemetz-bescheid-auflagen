import React, { useEffect, useMemo, useState } from "react";
import { Button, Modal, Select } from "@nemetz/ui";
import { t } from "../i18n";
import {
  evidenceAttachmentsForValidation,
  persistedEvidenceDocumentIdsForCompletionSubmit,
  taskEvidenceDocumentsForOwner,
  validateEvidenceRequirements
} from "../services/evidenceValidation";
import { listEvidenceDocuments } from "../services/evidenceDocuments";
import { useObligations } from "../state/ObligationsStore";
import type { Task } from "../state/TasksStore";
import type { AttachmentMeta } from "../types/attachments";
import type { EvidenceOutcome } from "../types/evidence";
import type { DocumentDto } from "../api/documents";
import PendingDocumentsPicker from "./PendingDocumentsPicker";

export type TaskCompleteInput = {
  outcome?: EvidenceOutcome;
  note?: string;
  attachments: AttachmentMeta[];
  files: File[];
  evidenceDocumentIds: string[];
};

type TaskCompleteModalProps = {
  open: boolean;
  task?: Task;
  onClose: () => void;
  onSaved: (input: TaskCompleteInput) => void | Promise<void>;
};

function normalizeOutcome(value: string): EvidenceOutcome | undefined {
  if (value === "OK" || value === "NOK" || value === "FOLLOW_UP") {
    return value;
  }
  return undefined;
}

export default function TaskCompleteModal({
  open,
  task,
  onClose,
  onSaved
}: TaskCompleteModalProps) {
  const { obligations } = useObligations();
  const [outcome, setOutcome] = useState<string>("OK");
  const [note, setNote] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [completionSavedWithUploadError, setCompletionSavedWithUploadError] = useState(false);
  const [persistedEvidenceDocuments, setPersistedEvidenceDocuments] = useState<DocumentDto[]>([]);
  const [persistedEvidenceLoading, setPersistedEvidenceLoading] = useState(false);
  const [persistedEvidenceLoadError, setPersistedEvidenceLoadError] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    setOutcome("OK");
    setNote("");
    setFiles([]);
    setIsSaving(false);
    setSaveError("");
    setCompletionSavedWithUploadError(false);
    setPersistedEvidenceDocuments([]);
    setPersistedEvidenceLoading(false);
    setPersistedEvidenceLoadError(false);
  }, [open, task?.id]);

  useEffect(() => {
    if (!open || !task || task.type !== "OBLIGATION") {
      return;
    }

    let cancelled = false;
    setPersistedEvidenceLoading(true);
    setPersistedEvidenceLoadError(false);
    setPersistedEvidenceDocuments([]);

    listEvidenceDocuments("TASK_EVIDENCE", task.id)
      .then((documents) => {
        if (!cancelled) {
          setPersistedEvidenceDocuments(documents);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPersistedEvidenceLoadError(true);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setPersistedEvidenceLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, task?.id, task?.type]);

  const obligationRequirements = useMemo(() => {
    if (!task || task.type !== "OBLIGATION") {
      return undefined;
    }
    const obligation = obligations.find((entry) => entry.id === task.obligationId);
    return obligation?.evidenceRequirements ?? task.requiredEvidence;
  }, [obligations, task]);

  const hasRequiredEvidence = Boolean(
    obligationRequirements?.requirePhoto ||
      obligationRequirements?.requireDocument ||
      obligationRequirements?.requireReport
  );

  const validPersistedEvidenceDocuments = useMemo(
    () => taskEvidenceDocumentsForOwner(persistedEvidenceDocuments, task?.type === "OBLIGATION" ? task.id : undefined),
    [persistedEvidenceDocuments, task?.id, task?.type]
  );

  const validationAttachments = useMemo(
    () =>
      evidenceAttachmentsForValidation({
        persistedDocuments: validPersistedEvidenceDocuments,
        pendingFiles: files
      }),
    [files, validPersistedEvidenceDocuments]
  );

  const evidenceDocumentIds = useMemo(
    () => persistedEvidenceDocumentIdsForCompletionSubmit(validPersistedEvidenceDocuments),
    [validPersistedEvidenceDocuments]
  );

  const validation = useMemo(
    () => validateEvidenceRequirements(obligationRequirements, validationAttachments),
    [obligationRequirements, validationAttachments]
  );

  const requiredRows = useMemo(
    () =>
      [
        {
          key: "PHOTO",
          enabled: Boolean(obligationRequirements?.requirePhoto),
          current: validation.counts.photos,
          label: t("evidence.required.photo")
        },
        {
          key: "DOCUMENT",
          enabled: Boolean(obligationRequirements?.requireDocument),
          current: validation.counts.docs,
          label: t("evidence.required.document")
        },
        {
          key: "REPORT",
          enabled: Boolean(obligationRequirements?.requireReport),
          current: validation.counts.reports,
          label: t("evidence.required.report")
        }
      ].filter((row) => row.enabled),
    [
      obligationRequirements?.requireDocument,
      obligationRequirements?.requirePhoto,
      obligationRequirements?.requireReport,
      validation.counts.docs,
      validation.counts.photos,
      validation.counts.reports
    ]
  );

  const errors = useMemo(
    () => validation.errors.map((errorKey) => t(errorKey)),
    [validation.errors]
  );

  const evidenceLoadBlocksSave = Boolean(
    task?.type === "OBLIGATION" &&
      hasRequiredEvidence &&
      (persistedEvidenceLoading || persistedEvidenceLoadError)
  );
  const saveDisabled =
    isSaving ||
    completionSavedWithUploadError ||
    !task ||
    evidenceLoadBlocksSave ||
    (task.type === "OBLIGATION" && !validation.ok);

  const handleSave = async () => {
    if (!task || evidenceLoadBlocksSave || (task.type === "OBLIGATION" && !validation.ok)) {
      return;
    }
    setIsSaving(true);
    setSaveError("");
    try {
      await onSaved({
        outcome: normalizeOutcome(outcome),
        note: note.trim() || undefined,
        attachments: [],
        files,
        evidenceDocumentIds
      });
      onClose();
    } catch (error) {
      const completionWasSaved =
        error instanceof Error &&
        error.name === "EvidenceUploadError" &&
        (error as Error & { completionSaved?: boolean }).completionSaved !== false;
      if (completionWasSaved) {
        setFiles([]);
        setCompletionSavedWithUploadError(true);
      }
      setSaveError(error instanceof Error && error.message ? error.message : t("tasks.complete.saveError"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeAriaLabel={t("modal.close")}
      className="taskCompleteModal"
      mobileFullscreen
      header={t("tasks.complete.title")}
      footer={
        <div className="modalFooter taskCompleteModalFooter">
          <Button variant="secondary" onClick={onClose}>
            {completionSavedWithUploadError ? t("common.close") : t("common.cancel")}
          </Button>
          {completionSavedWithUploadError ? null : (
            <Button onClick={handleSave} disabled={saveDisabled}>
              {isSaving ? t("documents.loading") : t("common.save")}
            </Button>
          )}
        </div>
      }
    >
      <div className="modalForm">
        <div className="formField">
          <span className="fieldLabel">{t("tasks.complete.outcome")}</span>
          <Select
            options={[
              { value: "OK", label: t("evidence.outcome.ok") },
              { value: "NOK", label: t("evidence.outcome.nok") },
              { value: "FOLLOW_UP", label: t("evidence.outcome.followUp") }
            ]}
            value={outcome}
            onChange={(event) => setOutcome(event.target.value)}
          />
        </div>

        <div className="formField">
          <span className="fieldLabel">{t("tasks.complete.note")}</span>
          <textarea
            className="textarea"
            rows={3}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={t("tasks.complete.note")}
          />
        </div>

        {task?.type === "OBLIGATION" && requiredRows.length ? (
          <div className="evidenceRequirementBox">
            <div className="fieldLabel">{t("evidence.requirements.title")}</div>
            <div className="evidenceRequirementList">
              {requiredRows.map((row) => (
                <div key={row.key} className={row.current < 1 ? "validationText" : "placeholderText"}>
                  {row.label}: {row.current}/1
                </div>
              ))}
            </div>
          </div>
        ) : null}
        <PendingDocumentsPicker files={files} onChange={setFiles} disabled={isSaving || completionSavedWithUploadError} />
        {task?.type === "OBLIGATION" && hasRequiredEvidence && persistedEvidenceLoading ? (
          <p className="placeholderText">{t("documents.loading")}</p>
        ) : null}
        {task?.type === "OBLIGATION" && hasRequiredEvidence && persistedEvidenceLoadError ? (
          <p className="validationText">{t("documents.error")}</p>
        ) : null}
        {task?.type === "OBLIGATION" && errors.length ? (
          <ul className="validationList">
            {errors.map((error) => (
              <li key={error} className="validationText">
                {error}
              </li>
            ))}
          </ul>
        ) : null}
        {saveError ? <p className="validationText">{saveError}</p> : null}
      </div>
    </Modal>
  );
}
