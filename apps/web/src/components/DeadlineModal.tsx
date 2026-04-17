import React, { useEffect, useMemo, useState } from "react";
import { Button, Input, Modal, Select } from "@nemetz/ui";
import { t } from "../i18n";
import { useAuthorities } from "../state/AuthoritiesStore";
import { useDeadlines } from "../state/DeadlinesStore";
import { useLegalDocs } from "../state/LegalDocsStore";
import { useProjects } from "../state/ProjectsStore";
import type { Deadline } from "../state/DeadlinesStore";
import UserSelect from "./UserSelect";

const emptyForm = {
  title: "",
  description: "",
  dueDate: "",
  projectId: "",
  legalDocId: "",
  authorityId: "",
  ownerUserId: "",
  deputyUserId: "",
  emailReminderEnabled: false,
  emailReminderDaysBefore: "7"
};

type DeadlineModalProps = {
  open: boolean;
  onClose: () => void;
  deadline?: Deadline;
  initialProjectId?: string;
  initialLegalDocId?: string;
  lockProject?: boolean;
  lockLegalDoc?: boolean;
};

export default function DeadlineModal({
  open,
  onClose,
  deadline,
  initialProjectId,
  initialLegalDocId,
  lockProject,
  lockLegalDoc
}: DeadlineModalProps) {
  const { addDeadline, updateDeadline } = useDeadlines();
  const { projects } = useProjects();
  const { legalDocs } = useLegalDocs();
  const { authorities } = useAuthorities();
  const [form, setForm] = useState(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    if (!open) {
      return;
    }

    setSaveError("");
    setIsSaving(false);

    if (deadline) {
      setForm({
        title: deadline.title,
        description: deadline.description ?? "",
        dueDate: deadline.dueDate,
        projectId: deadline.projectId ?? "",
        legalDocId: deadline.legalDocId ?? "",
        authorityId: deadline.authorityId ?? "",
        ownerUserId: deadline.ownerUserId ?? "",
        deputyUserId: deadline.deputyUserId ?? "",
        emailReminderEnabled: deadline.emailReminderEnabled,
        emailReminderDaysBefore: String(deadline.emailReminderDaysBefore ?? 7)
      });
      return;
    }

    const initialLegalDoc = initialLegalDocId
      ? legalDocs.find((doc) => doc.id === initialLegalDocId)
      : undefined;

    setForm({
      ...emptyForm,
      projectId: initialProjectId ?? initialLegalDoc?.projectId ?? "",
      legalDocId: initialLegalDocId ?? "",
      authorityId: ""
    });
  }, [deadline, initialLegalDocId, initialProjectId, legalDocs, open]);

  const projectOptions = useMemo(
    () =>
      projects
        .filter((project) => !project.archivedAt && !project.isArchived)
        .map((project) => ({ value: project.id, label: project.title })),
    [projects]
  );

  const legalDocOptions = useMemo(() => {
    const scoped = form.projectId
      ? legalDocs.filter((doc) => doc.projectId === form.projectId)
      : legalDocs;
    return scoped.map((doc) => ({ value: doc.id, label: doc.title }));
  }, [form.projectId, legalDocs]);

  const authorityOptions = useMemo(
    () =>
      authorities
        .filter((authority) => !authority.isArchived)
        .map((authority) => ({ value: authority.id, label: authority.name })),
    [authorities]
  );

  const isSaveDisabled = !form.title || !form.dueDate;

  const handleSave = async () => {
    const reminderDays = form.emailReminderEnabled
      ? Number(form.emailReminderDaysBefore || "7")
      : undefined;

    const payload = {
      title: form.title,
      description: form.description || undefined,
      dueDate: form.dueDate,
      projectId: form.projectId || undefined,
      legalDocId: form.legalDocId || undefined,
      authorityId: form.authorityId || undefined,
      ownerUserId: form.ownerUserId || undefined,
      deputyUserId: form.deputyUserId || undefined,
      emailReminderEnabled: form.emailReminderEnabled,
      emailReminderDaysBefore:
        form.emailReminderEnabled && Number.isFinite(reminderDays) ? reminderDays : undefined
    };

    setSaveError("");
    setIsSaving(true);

    try {
      const savedDeadline = deadline
        ? await updateDeadline(deadline.id, payload)
        : await addDeadline(payload);
      if (!savedDeadline) {
        setSaveError(t("deadlines.saveError"));
        return;
      }

      onClose();
    } catch {
      setSaveError(t("deadlines.saveError"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeAriaLabel={t("modal.close")}
      header={deadline ? t("deadlines.edit") : t("deadlines.new")}
      footer={
        <div className="modalFooter">
          <Button variant="secondary" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={() => void handleSave()} disabled={isSaveDisabled || isSaving}>
            {t("common.save")}
          </Button>
        </div>
      }
    >
      <div className="modalForm">
        {saveError ? <p className="validationText">{saveError}</p> : null}
        <div className="formField">
          <span className="fieldLabel">{t("deadlines.form.title")}</span>
          <Input
            placeholder={t("deadlines.form.title")}
            value={form.title}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, title: event.target.value }))
            }
          />
        </div>
        <div className="formField">
          <span className="fieldLabel">{t("deadlines.form.dueDate")}</span>
          <Input
            type="date"
            value={form.dueDate}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, dueDate: event.target.value }))
            }
          />
        </div>
        <div className="formField">
          <span className="fieldLabel">{t("deadlines.form.description")}</span>
          <textarea
            className="textarea"
            rows={3}
            value={form.description}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, description: event.target.value }))
            }
          />
        </div>
        <div className="formField">
          <span className="fieldLabel">{t("deadlines.form.project")}</span>
          <Select
            options={[{ value: "", label: t("deadlines.form.project") }, ...projectOptions]}
            value={form.projectId}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                projectId: event.target.value,
                legalDocId:
                  prev.legalDocId &&
                  legalDocs.some(
                    (doc) =>
                      doc.id === prev.legalDocId && doc.projectId === event.target.value
                  )
                    ? prev.legalDocId
                    : ""
              }))
            }
            disabled={lockProject}
          />
        </div>
        <div className="formField">
          <span className="fieldLabel">{t("deadlines.form.legalDoc")}</span>
          <Select
            options={[{ value: "", label: t("deadlines.form.legalDoc") }, ...legalDocOptions]}
            value={form.legalDocId}
            onChange={(event) => {
              const selectedDoc = legalDocs.find((doc) => doc.id === event.target.value);
              setForm((prev) => ({
                ...prev,
                legalDocId: event.target.value,
                projectId: prev.projectId || selectedDoc?.projectId || ""
              }));
            }}
            disabled={lockLegalDoc}
          />
        </div>
        <div className="formField">
          <span className="fieldLabel">{t("deadlines.form.authority")}</span>
          <Select
            options={[{ value: "", label: t("deadlines.form.authority") }, ...authorityOptions]}
            value={form.authorityId}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, authorityId: event.target.value }))
            }
          />
        </div>
        <div className="formField">
          <span className="fieldLabel">{t("deadlines.form.owner")}</span>
          <UserSelect
            value={form.ownerUserId || null}
            includeExternal
            allowArchivedCurrentValue
            placeholderKey="deadlines.owner"
            onChange={(userId) =>
              setForm((prev) => ({ ...prev, ownerUserId: userId ?? "" }))
            }
          />
        </div>
        <div className="formField">
          <span className="fieldLabel">{t("deadlines.form.deputy")}</span>
          <UserSelect
            value={form.deputyUserId || null}
            includeExternal
            allowArchivedCurrentValue
            placeholderKey="deadlines.deputy"
            onChange={(userId) =>
              setForm((prev) => ({ ...prev, deputyUserId: userId ?? "" }))
            }
          />
        </div>
        <div className="formField">
          <label className="checkboxRow">
            <input
              type="checkbox"
              checked={form.emailReminderEnabled}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  emailReminderEnabled: event.target.checked,
                  emailReminderDaysBefore: event.target.checked
                    ? prev.emailReminderDaysBefore || "7"
                    : "7"
                }))
              }
            />
            <span>{t("deadlines.form.emailReminderEnable")}</span>
          </label>
        </div>
        {form.emailReminderEnabled ? (
          <div className="formField">
            <span className="fieldLabel">{t("deadlines.form.emailReminderDaysBefore")}</span>
            <Select
              options={[
                { value: "0", label: t("common.onDueDate") },
                { value: "1", label: t("common.daysBefore.1") },
                { value: "7", label: t("common.daysBefore.7") },
                { value: "14", label: t("common.daysBefore.14") },
                { value: "30", label: t("common.daysBefore.30") }
              ]}
              value={form.emailReminderDaysBefore || "7"}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, emailReminderDaysBefore: event.target.value }))
              }
            />
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
