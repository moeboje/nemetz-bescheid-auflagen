import React, { useEffect, useMemo, useState } from "react";
import { Button, Input, Modal, Select } from "@nemetz/ui";
import { t } from "../i18n";
import { useLegalDocs } from "../state/LegalDocsStore";
import { useObligations } from "../state/ObligationsStore";
import { useUsers } from "../state/UsersStore";
import type { Obligation } from "../state/ObligationsStore";

const emptyForm = {
  legalDocId: "",
  title: "",
  level: "MANDATORY" as Obligation["level"],
  criticality: "" as "" | Obligation["criticality"],
  scheduleType: "ONCE" as Obligation["scheduleType"],
  firstDueDate: "",
  intervalUnit: "" as "" | Obligation["intervalUnit"],
  intervalValue: "",
  ownerUserId: "",
  deputyUserId: "",
  infoTextLong: "",
  emailReminderEnabled: false,
  emailReminderDaysBefore: "7"
};

type ObligationModalProps = {
  open: boolean;
  onClose: () => void;
  obligation?: Obligation;
  legalDocId?: string;
  lockLegalDoc?: boolean;
};

export default function ObligationModal({
  open,
  onClose,
  obligation,
  legalDocId,
  lockLegalDoc
}: ObligationModalProps) {
  const { legalDocs } = useLegalDocs();
  const { addObligation, updateObligation } = useObligations();
  const { users } = useUsers();
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (obligation) {
      setForm({
        legalDocId: obligation.legalDocId,
        title: obligation.title,
        level: obligation.level,
        criticality: obligation.criticality ?? "",
        scheduleType: obligation.scheduleType,
        firstDueDate: obligation.firstDueDate ?? "",
        intervalUnit: obligation.intervalUnit ?? "",
        intervalValue: obligation.intervalValue ? String(obligation.intervalValue) : "",
        ownerUserId: obligation.ownerUserId ?? "",
        deputyUserId: obligation.deputyUserId ?? "",
        infoTextLong: obligation.infoTextLong ?? "",
        emailReminderEnabled: obligation.emailReminderEnabled,
        emailReminderDaysBefore: String(obligation.emailReminderDaysBefore ?? 7)
      });
      return;
    }
    setForm({
      ...emptyForm,
      legalDocId: legalDocId ?? ""
    });
  }, [legalDocId, obligation, open]);

  const legalDocOptions = useMemo(
    () => legalDocs.map((doc) => ({ value: doc.id, label: doc.title })),
    [legalDocs]
  );

  const userOptions = useMemo(
    () => users.map((user) => ({ value: user.id, label: user.displayName })),
    [users]
  );

  const requiresFirstDue = form.scheduleType === "ONCE" || form.scheduleType === "ONCE_THEN_RECURRING";
  const requiresInterval = form.scheduleType === "RECURRING" || form.scheduleType === "ONCE_THEN_RECURRING";

  const isSaveDisabled =
    !form.legalDocId ||
    !form.title ||
    !form.level ||
    !form.scheduleType ||
    (requiresFirstDue && !form.firstDueDate) ||
    (requiresInterval && (!form.intervalUnit || !form.intervalValue));

  const handleSave = () => {
    const intervalValue = form.intervalValue ? Number(form.intervalValue) : undefined;
    const reminderDays = form.emailReminderEnabled
      ? Number(form.emailReminderDaysBefore || "7")
      : undefined;
    const payload = {
      legalDocId: form.legalDocId,
      title: form.title,
      level: form.level,
      criticality: form.criticality || undefined,
      scheduleType: form.scheduleType,
      firstDueDate: form.firstDueDate || undefined,
      intervalUnit: form.intervalUnit || undefined,
      intervalValue: intervalValue && intervalValue > 0 ? intervalValue : undefined,
      ownerUserId: form.ownerUserId || undefined,
      deputyUserId: form.deputyUserId || undefined,
      infoTextLong: form.infoTextLong,
      emailReminderEnabled: form.emailReminderEnabled,
      emailReminderDaysBefore:
        form.emailReminderEnabled && Number.isFinite(reminderDays) ? reminderDays : undefined
    } as Omit<Obligation, "id">;

    if (obligation) {
      updateObligation(obligation.id, payload);
    } else {
      addObligation(payload);
    }
    onClose();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeAriaLabel={t("modal.close")}
      header={obligation ? t("obligations.modal.editTitle") : t("obligations.modal.title")}
      footer={
        <div className="modalFooter">
          <Button variant="secondary" onClick={onClose}>
            {t("modal.cancel")}
          </Button>
          <Button onClick={handleSave} disabled={isSaveDisabled}>
            {t("modal.save")}
          </Button>
        </div>
      }
    >
      <div className="modalForm">
        <div className="formField">
          <span className="fieldLabel">{t("obligations.form.legalDoc")}</span>
          <Select
            options={[{ value: "", label: t("obligations.form.legalDoc") }, ...legalDocOptions]}
            value={form.legalDocId}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, legalDocId: event.target.value }))
            }
            disabled={lockLegalDoc}
          />
        </div>
        <div className="formField">
          <span className="fieldLabel">{t("obligations.form.title")}</span>
          <Input
            placeholder={t("obligations.form.title")}
            value={form.title}
            onChange={(event) => setForm((prev) => ({ ...prev, title: event.target.value }))}
          />
        </div>
        <div className="formField">
          <span className="fieldLabel">{t("obligations.form.level")}</span>
          <Select
            options={[
              { value: "MANDATORY", label: t("tasks.level.mandatory") },
              { value: "RECOMMENDED", label: t("tasks.level.recommended") }
            ]}
            value={form.level}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                level: event.target.value as Obligation["level"]
              }))
            }
          />
        </div>
        <div className="formField">
          <span className="fieldLabel">{t("obligations.form.criticality")}</span>
          <Select
            options={[
              { value: "", label: t("obligations.form.criticality") },
              { value: "LOW", label: t("obligations.criticality.low") },
              { value: "MEDIUM", label: t("obligations.criticality.medium") },
              { value: "HIGH", label: t("obligations.criticality.high") }
            ]}
            value={form.criticality}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                criticality: event.target.value as "" | Obligation["criticality"]
              }))
            }
          />
        </div>
        <div className="formField">
          <span className="fieldLabel">{t("obligations.form.scheduleType")}</span>
          <Select
            options={[
              { value: "ONCE", label: t("obligations.schedule.once") },
              { value: "RECURRING", label: t("obligations.schedule.recurring") },
              { value: "ONCE_THEN_RECURRING", label: t("obligations.schedule.onceThenRecurring") }
            ]}
            value={form.scheduleType}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                scheduleType: event.target.value as Obligation["scheduleType"]
              }))
            }
          />
        </div>
        <div className="formField">
          <span className="fieldLabel">{t("obligations.form.firstDueDate")}</span>
          <Input
            type="date"
            value={form.firstDueDate}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, firstDueDate: event.target.value }))
            }
          />
        </div>
        <div className="formField">
          <span className="fieldLabel">{t("obligations.form.interval")}</span>
          <div className="inlineFieldRow">
            <Input
              type="number"
              min="1"
              placeholder={t("obligations.form.intervalValue")}
              value={form.intervalValue}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, intervalValue: event.target.value }))
              }
            />
            <Select
              options={[
                { value: "", label: t("obligations.form.intervalUnit") },
                { value: "MONTH", label: t("obligations.interval.month") },
                { value: "YEAR", label: t("obligations.interval.year") }
              ]}
              value={form.intervalUnit}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  intervalUnit: event.target.value as "" | Obligation["intervalUnit"]
                }))
              }
            />
          </div>
        </div>
        <div className="formField">
          <span className="fieldLabel">{t("obligations.form.owner")}</span>
          <Select
            options={[{ value: "", label: t("obligations.form.owner") }, ...userOptions]}
            value={form.ownerUserId}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, ownerUserId: event.target.value }))
            }
          />
        </div>
        <div className="formField">
          <span className="fieldLabel">{t("obligations.form.deputy")}</span>
          <Select
            options={[{ value: "", label: t("obligations.form.deputy") }, ...userOptions]}
            value={form.deputyUserId}
            onChange={(event) =>
              setForm((prev) => ({ ...prev, deputyUserId: event.target.value }))
            }
          />
        </div>
        <div className="formField">
          <span className="fieldLabel">{t("obligations.form.infoTextLong")}</span>
          <textarea
            className="textarea"
            rows={4}
            value={form.infoTextLong}
            onChange={(event) => setForm((prev) => ({ ...prev, infoTextLong: event.target.value }))}
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
            <span>{t("obligations.form.emailReminderEnable")}</span>
          </label>
        </div>
        {form.emailReminderEnabled ? (
          <div className="formField">
            <span className="fieldLabel">{t("obligations.form.emailReminderDaysBefore")}</span>
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
