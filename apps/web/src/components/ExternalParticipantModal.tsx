import React, { useEffect, useState } from "react";
import { Button, Input, Modal, Select } from "@nemetz/ui";
import { t } from "../i18n";
import type { ExternalParticipant } from "../data/projects";

const emptyForm = {
  type: "LAWYER" as ExternalParticipant["type"],
  organization: "",
  name: "",
  email: "",
  phone: "",
  notes: ""
};

type ExternalParticipantModalProps = {
  open: boolean;
  onClose: () => void;
  participant?: ExternalParticipant;
  onSave: (
    input: Omit<ExternalParticipant, "id" | "createdAt" | "updatedAt">
  ) => boolean | Promise<boolean>;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ExternalParticipantModal({
  open,
  onClose,
  participant,
  onSave
}: ExternalParticipantModalProps) {
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (participant) {
      setForm({
        type: participant.type,
        organization: participant.organization ?? "",
        name: participant.name,
        email: participant.email ?? "",
        phone: participant.phone ?? "",
        notes: participant.notes ?? ""
      });
      return;
    }
    setForm(emptyForm);
  }, [open, participant]);

  const hasEmailError = form.email ? !emailPattern.test(form.email) : false;
  const isSaveDisabled = !form.type || !form.name || hasEmailError;

  const handleSave = async () => {
    if (isSaveDisabled) {
      return;
    }
    const saved = await onSave({
      type: form.type,
      organization: form.organization || undefined,
      name: form.name,
      email: form.email || undefined,
      phone: form.phone || undefined,
      notes: form.notes || undefined,
      archivedAt: participant?.archivedAt,
      isArchived: participant?.isArchived ?? false
    });
    if (saved) {
      onClose();
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeAriaLabel={t("modal.close")}
      mobileFullscreen
      header={participant ? t("projects.external.edit") : t("projects.external.add")}
      footer={
        <div className="modalFooter">
          <Button variant="secondary" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => void handleSave()} disabled={isSaveDisabled}>
            {t("common.save")}
          </Button>
        </div>
      }
    >
      <div className="modalForm">
        <div className="formField">
          <span className="fieldLabel">{t("projects.external.type")}</span>
          <Select
            options={[
              { value: "LAWYER", label: t("projects.external.type.lawyer") },
              {
                value: "ENGINEERING_OFFICE",
                label: t("projects.external.type.engineeringOffice")
              },
              { value: "CONSULTANT", label: t("projects.external.type.consultant") },
              { value: "OTHER", label: t("projects.external.type.other") }
            ]}
            value={form.type}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                type: event.target.value as ExternalParticipant["type"]
              }))
            }
          />
        </div>
        <div className="formField">
          <span className="fieldLabel">{t("projects.external.name")}</span>
          <Input
            placeholder={t("projects.external.name")}
            value={form.name}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, name: event.target.value }))
            }
          />
        </div>
        <div className="formField">
          <span className="fieldLabel">{t("projects.external.organization")}</span>
          <Input
            placeholder={t("projects.external.organization")}
            value={form.organization}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, organization: event.target.value }))
            }
          />
        </div>
        <div className="formField">
          <span className="fieldLabel">{t("projects.external.email")}</span>
          <Input
            placeholder={t("projects.external.email")}
            value={form.email}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, email: event.target.value }))
            }
          />
          {hasEmailError ? (
            <span className="validationText">{t("projects.external.validation.email")}</span>
          ) : null}
        </div>
        <div className="formField">
          <span className="fieldLabel">{t("projects.external.phone")}</span>
          <Input
            placeholder={t("projects.external.phone")}
            value={form.phone}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, phone: event.target.value }))
            }
          />
        </div>
        <div className="formField">
          <span className="fieldLabel">{t("projects.external.notes")}</span>
          <textarea
            className="textarea"
            rows={3}
            value={form.notes}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, notes: event.target.value }))
            }
          />
        </div>
      </div>
    </Modal>
  );
}
