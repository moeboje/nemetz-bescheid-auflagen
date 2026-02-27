import React, { useEffect, useMemo, useState } from "react";
import { Button, Modal, Select } from "@nemetz/ui";
import { t } from "../i18n";
import { validateEvidenceRequirements } from "../services/evidenceValidation";
import { useObligations } from "../state/ObligationsStore";
import type { Task } from "../state/TasksStore";
import type { AttachmentMeta } from "../types/attachments";
import type { EvidenceOutcome } from "../types/evidence";
import DocumentsPanel from "./DocumentsPanel";
import EvidenceUploader from "./EvidenceUploader";

export type TaskCompleteInput = {
  outcome?: EvidenceOutcome;
  note?: string;
  attachments: AttachmentMeta[];
};

type TaskCompleteModalProps = {
  open: boolean;
  task?: Task;
  onClose: () => void;
  onSaved: (input: TaskCompleteInput) => void;
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
  const [attachments, setAttachments] = useState<AttachmentMeta[]>([]);

  useEffect(() => {
    if (!open) {
      return;
    }
    setOutcome("OK");
    setNote("");
    setAttachments([]);
  }, [open, task?.id]);

  const obligationRequirements = useMemo(() => {
    if (!task || task.type !== "OBLIGATION") {
      return undefined;
    }
    const obligation = obligations.find((entry) => entry.id === task.obligationId);
    return obligation?.evidenceRequirements ?? task.requiredEvidence;
  }, [obligations, task]);

  const validation = useMemo(
    () => validateEvidenceRequirements(obligationRequirements, attachments),
    [attachments, obligationRequirements]
  );

  const errors = useMemo(
    () => validation.errors.map((errorKey) => t(errorKey)),
    [validation.errors]
  );

  const saveDisabled = !task || (task.type === "OBLIGATION" && !validation.ok);

  const handleSave = () => {
    if (!task || (task.type === "OBLIGATION" && !validation.ok)) {
      return;
    }
    onSaved({
      outcome: normalizeOutcome(outcome),
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
      className="taskCompleteModal"
      header={t("tasks.complete.title")}
      footer={
        <div className="modalFooter taskCompleteModalFooter">
          <Button variant="secondary" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={handleSave} disabled={saveDisabled}>
            {t("common.save")}
          </Button>
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

        <div className="formField">
          <EvidenceUploader
            value={attachments}
            onChange={setAttachments}
            required={task?.type === "OBLIGATION" ? obligationRequirements : undefined}
            errors={task?.type === "OBLIGATION" ? errors : undefined}
            mode="edit"
          />
        </div>
        {task ? (
          <DocumentsPanel ownerType="TASK_EVIDENCE" ownerId={task.id} titleKey="documents.title" />
        ) : null}
      </div>
    </Modal>
  );
}
