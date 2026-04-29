import React, { useEffect, useMemo, useState } from "react";
import { Button, Input, Modal, Select } from "@nemetz/ui";
import { t } from "../i18n";
import { useLegalDocs } from "../state/LegalDocsStore";
import { useObligations } from "../state/ObligationsStore";
import type { Obligation } from "../state/ObligationsStore";
import { useExternalOrgs } from "../state/ExternalOrgsStore";
import { useUsers } from "../state/UsersStore";
import UserSelect from "./UserSelect";

const emptyForm = {
  legalDocId: "",
  title: "",
  level: "MANDATORY" as Obligation["level"],
  criticality: "" as "" | Obligation["criticality"],
  scheduleType: "ONCE" as Obligation["scheduleType"],
  firstDueDate: "",
  recurrenceEndMode: "NONE" as "NONE" | "DATE",
  recurrenceEndDate: "",
  intervalUnit: "" as "" | Obligation["intervalUnit"],
  intervalValue: "",
  ownerUserId: "",
  deputyUserId: "",
  externalOrgId: "",
  externalUserId: "",
  infoTextLong: "",
  emailReminderEnabled: false,
  emailReminderDaysBefore: "7",
  requirePhoto: false,
  requireDocument: false,
  requireReport: false
};

type ObligationModalProps = {
  open: boolean;
  onClose: () => void;
  obligation?: Obligation;
  legalDocId?: string;
  lockLegalDoc?: boolean;
  projectId?: string;
  availableLegalDocs?: Array<{ id: string; title: string }>;
};

export default function ObligationModal({
  open,
  onClose,
  obligation,
  legalDocId,
  lockLegalDoc,
  projectId,
  availableLegalDocs
}: ObligationModalProps) {
  const { legalDocs } = useLegalDocs();
  const { externalOrgs } = useExternalOrgs();
  const { listActiveUsers, getUserLabel } = useUsers();
  const { addObligation, updateObligation, mutationError, clearMutationError } = useObligations();
  const [form, setForm] = useState(emptyForm);
  const [saveError, setSaveError] = useState("");

  useEffect(() => {
    if (!open) {
      return;
    }
    setSaveError("");
    clearMutationError();
    if (obligation) {
      setForm({
        legalDocId: obligation.legalDocId,
        title: obligation.title,
        level: obligation.level,
        criticality: obligation.criticality ?? "",
        scheduleType: obligation.scheduleType,
        firstDueDate: obligation.firstDueDate ?? "",
        recurrenceEndMode: obligation.recurrenceEndDate ? "DATE" : "NONE",
        recurrenceEndDate: obligation.recurrenceEndDate ?? "",
        intervalUnit: obligation.intervalUnit ?? "",
        intervalValue: obligation.intervalValue ? String(obligation.intervalValue) : "",
        ownerUserId: obligation.ownerUserId ?? "",
        deputyUserId: obligation.deputyUserId ?? "",
        externalOrgId: obligation.externalOrgId ?? "",
        externalUserId: obligation.externalUserId ?? "",
        infoTextLong: obligation.infoTextLong ?? "",
        emailReminderEnabled: obligation.emailReminderEnabled,
        emailReminderDaysBefore: String(obligation.emailReminderDaysBefore ?? 7),
        requirePhoto: Boolean(obligation.evidenceRequirements.requirePhoto),
        requireDocument: Boolean(obligation.evidenceRequirements.requireDocument),
        requireReport: Boolean(obligation.evidenceRequirements.requireReport)
      });
      return;
    }
    const initialLegalDocId =
      legalDocId ?? (availableLegalDocs?.length === 1 ? availableLegalDocs[0]?.id ?? "" : "");
    setForm({
      ...emptyForm,
      legalDocId: initialLegalDocId
    });
  }, [availableLegalDocs, clearMutationError, legalDocId, obligation, open]);

  const legalDocOptions = useMemo(
    () =>
      (availableLegalDocs ?? legalDocs).map((doc) => ({
        value: doc.id,
        label: doc.title
      })),
    [availableLegalDocs, legalDocs]
  );

  const externalOrgOptions = useMemo(
    () =>
      externalOrgs
        .filter((org) => !org.isArchived || org.id === form.externalOrgId)
        .map((org) => ({ value: org.id, label: org.name })),
    [externalOrgs, form.externalOrgId]
  );

  const externalUserOptions = useMemo(
    () =>
      listActiveUsers({ includeExternal: true, includeInternal: false })
        .filter(
          (user) =>
            !form.externalOrgId ||
            user.externalOrgId === form.externalOrgId ||
            user.id === form.externalUserId
        )
        .map((user) => ({ value: user.id, label: getUserLabel(user.id) })),
    [form.externalOrgId, form.externalUserId, getUserLabel, listActiveUsers]
  );

  const requiresFirstDue = form.scheduleType === "ONCE" || form.scheduleType === "ONCE_THEN_RECURRING";
  const requiresInterval = form.scheduleType === "RECURRING" || form.scheduleType === "ONCE_THEN_RECURRING";
  const hasRecurrenceEndDateError =
    requiresInterval &&
    form.recurrenceEndMode === "DATE" &&
    form.firstDueDate &&
    form.recurrenceEndDate &&
    form.recurrenceEndDate < form.firstDueDate;

  const isSaveDisabled =
    !form.legalDocId ||
    !form.title ||
    !form.level ||
    !form.scheduleType ||
    (requiresFirstDue && !form.firstDueDate) ||
    (requiresInterval && (!form.intervalUnit || !form.intervalValue)) ||
    (requiresInterval && form.recurrenceEndMode === "DATE" && !form.recurrenceEndDate) ||
    hasRecurrenceEndDateError;

  const handleSave = async () => {
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
      recurrenceEndDate:
        requiresInterval && form.recurrenceEndMode === "DATE" ? form.recurrenceEndDate : "",
      intervalUnit: form.intervalUnit || undefined,
      intervalValue: intervalValue && intervalValue > 0 ? intervalValue : undefined,
      ownerUserId: form.ownerUserId,
      deputyUserId: form.deputyUserId,
      externalOrgId: form.externalOrgId,
      externalUserId: form.externalUserId,
      infoTextLong: form.infoTextLong,
      emailReminderEnabled: form.emailReminderEnabled,
      emailReminderDaysBefore:
        form.emailReminderEnabled && Number.isFinite(reminderDays) ? reminderDays : undefined,
      evidenceRequirements: {
        requirePhoto: form.requirePhoto,
        requireDocument: form.requireDocument,
        requireReport: form.requireReport
      }
    };

    const saved = obligation
      ? await updateObligation(obligation.id, { ...payload, projectId })
      : await addObligation({ ...payload, projectId });

    if (saved) {
      onClose();
      return;
    }

    setSaveError(t("obligations.error.save"));
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      closeAriaLabel={t("modal.close")}
      mobileFullscreen
      header={obligation ? t("obligations.modal.editTitle") : t("obligations.modal.title")}
      footer={
        <div className="modalFooter">
          <Button variant="secondary" onClick={onClose}>
            {t("modal.cancel")}
          </Button>
          <Button onClick={() => void handleSave()} disabled={isSaveDisabled}>
            {t("modal.save")}
          </Button>
        </div>
      }
    >
      <div className="modalForm">
        {mutationError || saveError ? (
          <p className="validationText">{mutationError || saveError}</p>
        ) : null}
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
                scheduleType: event.target.value as Obligation["scheduleType"],
                recurrenceEndMode:
                  event.target.value === "ONCE" ? "NONE" : prev.recurrenceEndMode
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
                { value: "DAY", label: t("obligations.interval.day") },
                { value: "WEEK", label: t("obligations.interval.week") },
                { value: "MONTH", label: t("obligations.interval.month") },
                { value: "QUARTER", label: t("obligations.interval.quarter") },
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
        {requiresInterval ? (
          <div className="formField">
            <span className="fieldLabel">{t("obligations.form.recurrenceEnd")}</span>
            <Select
              options={[
                { value: "NONE", label: t("obligations.recurrence.noEndDate") },
                { value: "DATE", label: t("obligations.recurrence.untilDate") }
              ]}
              value={form.recurrenceEndMode}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  recurrenceEndMode: event.target.value as "NONE" | "DATE",
                  recurrenceEndDate: event.target.value === "NONE" ? "" : prev.recurrenceEndDate
                }))
              }
            />
            {form.recurrenceEndMode === "DATE" ? (
              <>
                <Input
                  type="date"
                  value={form.recurrenceEndDate}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, recurrenceEndDate: event.target.value }))
                  }
                />
                {hasRecurrenceEndDateError ? (
                  <span className="validationText">{t("obligations.validation.recurrenceEndDate")}</span>
                ) : null}
              </>
            ) : null}
          </div>
        ) : null}
        <div className="formField">
          <span className="fieldLabel">{t("obligations.form.owner")}</span>
          <UserSelect
            value={form.ownerUserId || null}
            includeExternal={false}
            allowArchivedCurrentValue
            placeholderKey="obligations.owner"
            onChange={(userId) =>
              setForm((prev) => ({ ...prev, ownerUserId: userId ?? "" }))
            }
          />
        </div>
        <div className="formField">
          <span className="fieldLabel">{t("obligations.form.deputy")}</span>
          <UserSelect
            value={form.deputyUserId || null}
            includeExternal={false}
            allowArchivedCurrentValue
            placeholderKey="obligations.deputy"
            onChange={(userId) =>
              setForm((prev) => ({ ...prev, deputyUserId: userId ?? "" }))
            }
          />
        </div>
        <div className="formField">
          <span className="fieldLabel">{t("obligations.form.externalOrg")}</span>
          <Select
            options={[{ value: "", label: t("obligations.form.externalOrg") }, ...externalOrgOptions]}
            value={form.externalOrgId}
            onChange={(event) =>
              setForm((prev) => ({
                ...prev,
                externalOrgId: event.target.value,
                externalUserId: ""
              }))
            }
          />
        </div>
        <div className="formField">
          <span className="fieldLabel">{t("obligations.form.externalUser")}</span>
          <Select
            options={[{ value: "", label: t("obligations.form.externalUser") }, ...externalUserOptions]}
            value={form.externalUserId}
            onChange={(event) => {
              const externalUserId = event.target.value;
              const selectedUser = listActiveUsers({
                includeExternal: true,
                includeInternal: false
              }).find((user) => user.id === externalUserId);
              setForm((prev) => ({
                ...prev,
                externalUserId,
                externalOrgId: selectedUser?.externalOrgId ?? prev.externalOrgId
              }));
            }}
          />
          <span className="helperText">{t("obligations.form.externalUserHint")}</span>
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
        <div className="formSection">
          <div className="fieldLabel">{t("obligations.evidenceRequirements.info")}</div>
          <label className="checkboxRow">
            <input
              type="checkbox"
              checked={form.requirePhoto}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, requirePhoto: event.target.checked }))
              }
            />
            <span>{t("obligations.evidenceRequirements.requirePhoto")}</span>
          </label>
          <label className="checkboxRow">
            <input
              type="checkbox"
              checked={form.requireDocument}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, requireDocument: event.target.checked }))
              }
            />
            <span>{t("obligations.evidenceRequirements.requireDocument")}</span>
          </label>
          <label className="checkboxRow">
            <input
              type="checkbox"
              checked={form.requireReport}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, requireReport: event.target.checked }))
              }
            />
            <span>{t("obligations.evidenceRequirements.requireReport")}</span>
          </label>
        </div>
      </div>
    </Modal>
  );
}
