import React, { useEffect, useMemo, useState } from "react";
import { Button, Modal, Select } from "@nemetz/ui";
import type { DocumentOwnerType } from "../api/documents";
import { t } from "../i18n";
import type { AttachmentMeta, EvidenceOutcome } from "../types/evidence";
import {
  getMissingRequiredAttachmentKinds,
  type AttachmentKind,
  type AttachmentRequirements
} from "../types/attachments";
import DocumentsPanel from "./DocumentsPanel";
import EvidenceUploader from "./EvidenceUploader";

export type EvidenceCompletionInput = {
  outcome?: EvidenceOutcome;
  note?: string;
  attachments: AttachmentMeta[];
};

type EvidenceCompletionModalProps = {
  open: boolean;
  onClose: () => void;
  onSave: (input: EvidenceCompletionInput) => void;
  header: string;
  allowKinds?: AttachmentKind[];
  required?: AttachmentRequirements;
  ownerType?: DocumentOwnerType;
  ownerId?: string;
};

export default function EvidenceCompletionModal({
  open,
  onClose,
  onSave,
  header,
  allowKinds,
  required,
  ownerType,
  ownerId
}: EvidenceCompletionModalProps) {
  const [outcome, setOutcome] = useState<string>("OK");
  const [note, setNote] = useState("");
  const [attachments, setAttachments] = useState<AttachmentMeta[]>([]);

  useEffect(() => {
    if (!open) {
      return;
    }
    setOutcome("OK");
    setNote("");
    setAttachments([]);
  }, [open]);

  const missingKinds = useMemo(
    () => getMissingRequiredAttachmentKinds(required, attachments),
    [attachments, required]
  );

  const validationMessage = useMemo(() => {
    if (!missingKinds.length) {
      return "";
    }
    const labels = missingKinds.map((kind) =>
      kind === "PHOTO"
        ? t("validation.evidenceRequired.photo")
        : kind === "DOCUMENT"
        ? t("validation.evidenceRequired.document")
        : t("validation.evidenceRequired.report")
    );
    return t("validation.evidenceRequired.message").replace("{items}", labels.join(", "));
  }, [missingKinds]);

  const handleSave = () => {
    if (missingKinds.length) {
      return;
    }
    onSave({
      outcome:
        outcome === "OK" || outcome === "NOK" || outcome === "FOLLOW_UP"
          ? outcome
          : undefined,
      note: note.trim() || undefined,
      attachments
    });
    onClose();
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
            {t("common.cancel")}
          </Button>
          <Button onClick={handleSave} disabled={missingKinds.length > 0}>
            {t("evidence.modal.save")}
          </Button>
        </div>
      }
    >
      <div className="modalForm">
        <div className="formField">
          <span className="fieldLabel">{t("evidence.modal.outcome")}</span>
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
          <span className="fieldLabel">{t("evidence.modal.comment")}</span>
          <textarea
            className="textarea"
            rows={3}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={t("evidence.modal.commentPlaceholder")}
          />
        </div>
        <div className="formField">
          <span className="fieldLabel">{t("evidence.modal.attachments")}</span>
          <EvidenceUploader
            value={attachments}
            onChange={setAttachments}
            allowKinds={allowKinds}
            required={required}
            errors={validationMessage ? [validationMessage] : undefined}
          />
        </div>
        {ownerType && ownerId ? (
          <DocumentsPanel ownerType={ownerType} ownerId={ownerId} titleKey="documents.title" />
        ) : null}
      </div>
    </Modal>
  );
}
