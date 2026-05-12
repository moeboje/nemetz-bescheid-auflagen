import React, { useEffect, useState } from "react";
import { Button, Input, Modal, Select } from "@nemetz/ui";
import { t } from "../i18n";
import type { AttachmentMeta, EvidenceOutcome } from "../types/evidence";
import type { AttachmentKind, AttachmentRequirements } from "../types/attachments";
import PendingDocumentsPicker from "./PendingDocumentsPicker";

export type EvidenceCompletionInput = {
  outcome?: EvidenceOutcome;
  note?: string;
  attachments: AttachmentMeta[];
  completedAt?: string;
  files: File[];
};

type EvidenceCompletionModalProps = {
  open: boolean;
  onClose: () => void;
  onSave: (input: EvidenceCompletionInput) => void | Promise<void>;
  header: string;
  allowKinds?: AttachmentKind[];
  required?: AttachmentRequirements;
};

function todayDate() {
  return new Date().toISOString().slice(0, 10);
}

export default function EvidenceCompletionModal({
  open,
  onClose,
  onSave,
  header
}: EvidenceCompletionModalProps) {
  const [outcome, setOutcome] = useState<string>("OK");
  const [note, setNote] = useState("");
  const [completedAt, setCompletedAt] = useState(todayDate());
  const [files, setFiles] = useState<File[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [completionSavedWithUploadError, setCompletionSavedWithUploadError] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    setOutcome("OK");
    setNote("");
    setCompletedAt(todayDate());
    setFiles([]);
    setIsSaving(false);
    setSaveError("");
    setCompletionSavedWithUploadError(false);
  }, [open]);

  const handleSave = async () => {
    if (!completedAt || completionSavedWithUploadError) {
      return;
    }
    setIsSaving(true);
    setSaveError("");
    try {
      await onSave({
        outcome:
          outcome === "OK" || outcome === "NOK" || outcome === "FOLLOW_UP"
            ? outcome
            : undefined,
        note: note.trim() || undefined,
        attachments: [],
        completedAt,
        files
      });
      onClose();
    } catch (error) {
      if (error instanceof Error && error.name === "EvidenceUploadError") {
        setFiles([]);
        setCompletionSavedWithUploadError(true);
      }
      setSaveError(error instanceof Error && error.message ? error.message : t("evidence.documents.completeSaveError"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeAriaLabel={t("modal.close")}
      mobileFullscreen
      header={header}
      footer={
        <div className="modalFooter">
          <Button variant="secondary" onClick={onClose}>
            {completionSavedWithUploadError ? t("common.close") : t("common.cancel")}
          </Button>
          {completionSavedWithUploadError ? null : (
            <Button onClick={handleSave} disabled={isSaving || !completedAt}>
              {isSaving ? t("documents.loading") : t("evidence.modal.save")}
            </Button>
          )}
        </div>
      }
    >
      <div className="modalForm">
        <div className="formField">
          <span className="fieldLabel">{t("evidence.modal.completedAt")}</span>
          <Input
            type="date"
            value={completedAt}
            disabled={isSaving || completionSavedWithUploadError}
            onChange={(event) => setCompletedAt(event.target.value)}
          />
        </div>
        <div className="formField">
          <span className="fieldLabel">{t("evidence.modal.outcome")}</span>
          <Select
            options={[
              { value: "OK", label: t("evidence.outcome.ok") },
              { value: "NOK", label: t("evidence.outcome.nok") },
              { value: "FOLLOW_UP", label: t("evidence.outcome.followUp") }
            ]}
            value={outcome}
            disabled={isSaving || completionSavedWithUploadError}
            onChange={(event) => setOutcome(event.target.value)}
          />
        </div>
        <div className="formField">
          <span className="fieldLabel">{t("evidence.modal.comment")}</span>
          <textarea
            className="textarea"
            rows={3}
            value={note}
            disabled={isSaving || completionSavedWithUploadError}
            onChange={(event) => setNote(event.target.value)}
            placeholder={t("evidence.modal.commentPlaceholder")}
          />
        </div>
        <PendingDocumentsPicker files={files} onChange={setFiles} disabled={isSaving || completionSavedWithUploadError} />
        {saveError ? <p className="validationText">{saveError}</p> : null}
      </div>
    </Modal>
  );
}
