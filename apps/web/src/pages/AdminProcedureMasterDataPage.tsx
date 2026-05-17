import React, { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { Badge, Button, Card, DataTable, IconButton, Input, Modal, Select } from "@nemetz/ui";
import { ApiError } from "../api/client";
import { ArchiveIcon, EditIcon } from "../components/Icons";
import AdminSubnav from "../components/AdminSubnav";
import { t } from "../i18n";
import type { LegalMatter, ProcedureType, SubmissionType } from "../data/procedureMasterData";
import { useAuthorization } from "../state/AuthorizationStore";
import { useProcedureMasterData } from "../state/ProcedureMasterDataStore";

type TabKey = "legalMatters" | "procedureTypes" | "submissionTypes";

type ConfirmationState =
  | { entity: "legalMatter"; id: string; label: string; mode: "deactivate" | "reactivate" }
  | { entity: "procedureType"; id: string; label: string; mode: "deactivate" | "reactivate" }
  | { entity: "submissionType"; id: string; label: string; mode: "deactivate" | "reactivate" };

const badgeOptions = [
  { value: "", label: t("admin.procedureMasterData.form.badgeVariant.none") },
  { value: "neutral", label: "Neutral" },
  { value: "success", label: "Success" },
  { value: "warning", label: "Warning" },
  { value: "danger", label: "Danger" }
];

const emptyLegalMatterForm = {
  code: "",
  name: "",
  shortName: "",
  description: "",
  sortOrder: "0",
  badgeVariant: ""
};

const emptyProcedureTypeForm = {
  code: "",
  name: "",
  shortName: "",
  description: "",
  sortOrder: "0"
};

const emptySubmissionTypeForm = {
  code: "",
  name: "",
  shortName: "",
  description: "",
  legalMatterId: "",
  procedureTypeId: "",
  sortOrder: "0",
  badgeVariant: "",
  legacyAliases: ""
};

function extractApiErrorMessage(error: unknown, fallbackKey: Parameters<typeof t>[0]) {
  if (error instanceof ApiError && typeof error.message === "string" && error.message.trim()) {
    return error.message;
  }
  return t(fallbackKey);
}

function toSortOrder(value: string) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : 0;
}

function splitAliases(value: string) {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export default function AdminProcedureMasterDataPage() {
  const { permissions } = useAuthorization();
  const canManage = permissions.canManageProcedureMasterDataAdmin;
  const {
    legalMatters,
    procedureTypes,
    submissionTypes,
    reloadAdminProcedureMasterData,
    createLegalMatter,
    updateLegalMatter,
    deactivateLegalMatter,
    reactivateLegalMatter,
    createProcedureType,
    updateProcedureType,
    deactivateProcedureType,
    reactivateProcedureType,
    createSubmissionType,
    updateSubmissionType,
    deactivateSubmissionType,
    reactivateSubmissionType
  } = useProcedureMasterData();

  const [tab, setTab] = useState<TabKey>("submissionTypes");
  const [showInactive, setShowInactive] = useState(false);
  const [pageError, setPageError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmation, setConfirmation] = useState<ConfirmationState | null>(null);
  const [legalMatterModalOpen, setLegalMatterModalOpen] = useState(false);
  const [procedureTypeModalOpen, setProcedureTypeModalOpen] = useState(false);
  const [submissionTypeModalOpen, setSubmissionTypeModalOpen] = useState(false);
  const [editingLegalMatterId, setEditingLegalMatterId] = useState<string | null>(null);
  const [editingProcedureTypeId, setEditingProcedureTypeId] = useState<string | null>(null);
  const [editingSubmissionTypeId, setEditingSubmissionTypeId] = useState<string | null>(null);
  const [legalMatterForm, setLegalMatterForm] = useState(emptyLegalMatterForm);
  const [procedureTypeForm, setProcedureTypeForm] = useState(emptyProcedureTypeForm);
  const [submissionTypeForm, setSubmissionTypeForm] = useState(emptySubmissionTypeForm);

  useEffect(() => {
    let cancelled = false;
    void reloadAdminProcedureMasterData().catch((error) => {
      if (!cancelled) {
        setPageError(extractApiErrorMessage(error, "admin.procedureMasterData.error.load"));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [reloadAdminProcedureMasterData]);

  const visibleLegalMatters = useMemo(
    () => legalMatters.filter((item) => showInactive || item.isActive),
    [legalMatters, showInactive]
  );
  const visibleProcedureTypes = useMemo(
    () => procedureTypes.filter((item) => showInactive || item.isActive),
    [procedureTypes, showInactive]
  );
  const visibleSubmissionTypes = useMemo(
    () => submissionTypes.filter((item) => showInactive || item.isActive),
    [submissionTypes, showInactive]
  );

  const activeLegalMatterOptions = useMemo(
    () =>
      legalMatters
        .filter((item) => item.isActive || item.id === submissionTypeForm.legalMatterId)
        .map((item) => ({
          value: item.id,
          label: `${item.shortName ? `${item.name} (${item.shortName})` : item.name}${
            item.isActive ? "" : ` (${t("admin.procedureMasterData.status.inactive")})`
          }`,
          disabled: !item.isActive
        })),
    [legalMatters, submissionTypeForm.legalMatterId]
  );
  const activeProcedureTypeOptions = useMemo(
    () =>
      procedureTypes
        .filter((item) => item.isActive || item.id === submissionTypeForm.procedureTypeId)
        .map((item) => ({
          value: item.id,
          label: `${item.shortName ? `${item.name} (${item.shortName})` : item.name}${
            item.isActive ? "" : ` (${t("admin.procedureMasterData.status.inactive")})`
          }`,
          disabled: !item.isActive
        })),
    [procedureTypes, submissionTypeForm.procedureTypeId]
  );

  if (!permissions.canViewProcedureMasterDataAdmin) {
    return <Navigate to="/compliance/dashboard" replace />;
  }

  const closeModals = () => {
    setLegalMatterModalOpen(false);
    setProcedureTypeModalOpen(false);
    setSubmissionTypeModalOpen(false);
    setEditingLegalMatterId(null);
    setEditingProcedureTypeId(null);
    setEditingSubmissionTypeId(null);
    setLegalMatterForm(emptyLegalMatterForm);
    setProcedureTypeForm(emptyProcedureTypeForm);
    setSubmissionTypeForm(emptySubmissionTypeForm);
    setFormError("");
  };

  const openLegalMatterModal = (id?: string) => {
    const row = id ? legalMatters.find((item) => item.id === id) : undefined;
    setPageError("");
    setSuccessMessage("");
    setEditingLegalMatterId(row?.id ?? null);
    setLegalMatterForm(
      row
        ? {
            code: row.code,
            name: row.name,
            shortName: row.shortName ?? "",
            description: row.description ?? "",
            sortOrder: String(row.sortOrder),
            badgeVariant: row.badgeVariant ?? ""
          }
        : emptyLegalMatterForm
    );
    setLegalMatterModalOpen(true);
  };

  const openProcedureTypeModal = (id?: string) => {
    const row = id ? procedureTypes.find((item) => item.id === id) : undefined;
    setPageError("");
    setSuccessMessage("");
    setEditingProcedureTypeId(row?.id ?? null);
    setProcedureTypeForm(
      row
        ? {
            code: row.code,
            name: row.name,
            shortName: row.shortName ?? "",
            description: row.description ?? "",
            sortOrder: String(row.sortOrder)
          }
        : emptyProcedureTypeForm
    );
    setProcedureTypeModalOpen(true);
  };

  const openSubmissionTypeModal = (id?: string) => {
    const row = id ? submissionTypes.find((item) => item.id === id) : undefined;
    setPageError("");
    setSuccessMessage("");
    setEditingSubmissionTypeId(row?.id ?? null);
    setSubmissionTypeForm(
      row
        ? {
            code: row.code,
            name: row.name,
            shortName: row.shortName ?? "",
            description: row.description ?? "",
            legalMatterId: row.legalMatterId,
            procedureTypeId: row.procedureTypeId,
            sortOrder: String(row.sortOrder),
            badgeVariant: row.badgeVariant ?? "",
            legacyAliases: (row.legacyAliases ?? []).join(", ")
          }
        : {
            ...emptySubmissionTypeForm,
            legalMatterId: legalMatters.find((item) => item.isActive)?.id ?? "",
            procedureTypeId: procedureTypes.find((item) => item.isActive)?.id ?? ""
          }
    );
    setSubmissionTypeModalOpen(true);
  };

  const saveLegalMatter = async () => {
    if (!legalMatterForm.name.trim()) {
      setFormError(t("admin.procedureMasterData.validation.name"));
      return;
    }
    setIsSubmitting(true);
    setFormError("");
    try {
      if (editingLegalMatterId) {
        await updateLegalMatter(editingLegalMatterId, {
          code: legalMatterForm.code,
          name: legalMatterForm.name,
          shortName: legalMatterForm.shortName,
          description: legalMatterForm.description,
          sortOrder: toSortOrder(legalMatterForm.sortOrder),
          badgeVariant: legalMatterForm.badgeVariant
        });
        setSuccessMessage(t("admin.procedureMasterData.success.updated"));
      } else {
        await createLegalMatter({
          code: legalMatterForm.code,
          name: legalMatterForm.name,
          shortName: legalMatterForm.shortName,
          description: legalMatterForm.description,
          sortOrder: toSortOrder(legalMatterForm.sortOrder),
          badgeVariant: legalMatterForm.badgeVariant
        });
        setSuccessMessage(t("admin.procedureMasterData.success.created"));
      }
      closeModals();
    } catch (error) {
      setFormError(extractApiErrorMessage(error, "admin.procedureMasterData.error.save"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const saveProcedureType = async () => {
    if (!procedureTypeForm.name.trim()) {
      setFormError(t("admin.procedureMasterData.validation.name"));
      return;
    }
    setIsSubmitting(true);
    setFormError("");
    try {
      if (editingProcedureTypeId) {
        await updateProcedureType(editingProcedureTypeId, {
          code: procedureTypeForm.code,
          name: procedureTypeForm.name,
          shortName: procedureTypeForm.shortName,
          description: procedureTypeForm.description,
          sortOrder: toSortOrder(procedureTypeForm.sortOrder)
        });
        setSuccessMessage(t("admin.procedureMasterData.success.updated"));
      } else {
        await createProcedureType({
          code: procedureTypeForm.code,
          name: procedureTypeForm.name,
          shortName: procedureTypeForm.shortName,
          description: procedureTypeForm.description,
          sortOrder: toSortOrder(procedureTypeForm.sortOrder)
        });
        setSuccessMessage(t("admin.procedureMasterData.success.created"));
      }
      closeModals();
    } catch (error) {
      setFormError(extractApiErrorMessage(error, "admin.procedureMasterData.error.save"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const saveSubmissionType = async () => {
    if (!submissionTypeForm.name.trim()) {
      setFormError(t("admin.procedureMasterData.validation.name"));
      return;
    }
    if (!submissionTypeForm.legalMatterId || !submissionTypeForm.procedureTypeId) {
      setFormError(t("admin.procedureMasterData.validation.references"));
      return;
    }
    setIsSubmitting(true);
    setFormError("");
    try {
      const baseInput = {
        code: submissionTypeForm.code,
        name: submissionTypeForm.name,
        shortName: submissionTypeForm.shortName,
        description: submissionTypeForm.description,
        sortOrder: toSortOrder(submissionTypeForm.sortOrder),
        badgeVariant: submissionTypeForm.badgeVariant,
        legacyAliases: splitAliases(submissionTypeForm.legacyAliases)
      };
      if (editingSubmissionTypeId) {
        const currentSubmissionType = submissionTypes.find(
          (item) => item.id === editingSubmissionTypeId
        );
        const input = {
          ...baseInput,
          ...(currentSubmissionType?.legalMatterId !== submissionTypeForm.legalMatterId
            ? { legalMatterId: submissionTypeForm.legalMatterId }
            : {}),
          ...(currentSubmissionType?.procedureTypeId !== submissionTypeForm.procedureTypeId
            ? { procedureTypeId: submissionTypeForm.procedureTypeId }
            : {})
        };
        await updateSubmissionType(editingSubmissionTypeId, input);
        setSuccessMessage(t("admin.procedureMasterData.success.updated"));
      } else {
        const input = {
          ...baseInput,
          legalMatterId: submissionTypeForm.legalMatterId,
          procedureTypeId: submissionTypeForm.procedureTypeId
        };
        await createSubmissionType(input);
        setSuccessMessage(t("admin.procedureMasterData.success.created"));
      }
      closeModals();
    } catch (error) {
      setFormError(extractApiErrorMessage(error, "admin.procedureMasterData.error.save"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmAction = async () => {
    if (!confirmation) {
      return;
    }
    setIsSubmitting(true);
    setPageError("");
    setSuccessMessage("");
    try {
      if (confirmation.entity === "legalMatter") {
        if (confirmation.mode === "deactivate") {
          await deactivateLegalMatter(confirmation.id);
        } else {
          await reactivateLegalMatter(confirmation.id);
        }
      } else if (confirmation.entity === "procedureType") {
        if (confirmation.mode === "deactivate") {
          await deactivateProcedureType(confirmation.id);
        } else {
          await reactivateProcedureType(confirmation.id);
        }
      } else if (confirmation.mode === "deactivate") {
        await deactivateSubmissionType(confirmation.id);
      } else {
        await reactivateSubmissionType(confirmation.id);
      }
      setSuccessMessage(
        confirmation.mode === "deactivate"
          ? t("admin.procedureMasterData.success.deactivated")
          : t("admin.procedureMasterData.success.reactivated")
      );
      setConfirmation(null);
    } catch (error) {
      setPageError(extractApiErrorMessage(error, "admin.procedureMasterData.error.action"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const statusBadge = (isActive: boolean) =>
    isActive ? (
      <Badge variant="success">{t("admin.procedureMasterData.status.active")}</Badge>
    ) : (
      <Badge variant="warning">{t("admin.procedureMasterData.status.inactive")}</Badge>
    );

  const legalMatterColumns = [
    { key: "name", header: t("admin.procedureMasterData.table.name"), render: (row: LegalMatter) => row.name },
    { key: "code", header: t("admin.procedureMasterData.table.code"), render: (row: LegalMatter) => row.code },
    { key: "shortName", header: t("admin.procedureMasterData.table.shortName"), render: (row: LegalMatter) => row.shortName || t("common.notAvailable") },
    { key: "usageCount", header: t("admin.procedureMasterData.table.usageCount"), align: "right" as const, render: (row: LegalMatter) => row.usageCount ?? 0 },
    { key: "status", header: t("admin.procedureMasterData.table.status"), render: (row: LegalMatter) => statusBadge(row.isActive) }
  ];

  const procedureTypeColumns = [
    { key: "name", header: t("admin.procedureMasterData.table.name"), render: (row: ProcedureType) => row.name },
    { key: "code", header: t("admin.procedureMasterData.table.code"), render: (row: ProcedureType) => row.code },
    { key: "shortName", header: t("admin.procedureMasterData.table.shortName"), render: (row: ProcedureType) => row.shortName || t("common.notAvailable") },
    { key: "usageCount", header: t("admin.procedureMasterData.table.usageCount"), align: "right" as const, render: (row: ProcedureType) => row.usageCount ?? 0 },
    { key: "status", header: t("admin.procedureMasterData.table.status"), render: (row: ProcedureType) => statusBadge(row.isActive) }
  ];

  const submissionTypeColumns = [
    { key: "name", header: t("admin.procedureMasterData.table.name"), render: (row: SubmissionType) => row.name },
    { key: "code", header: t("admin.procedureMasterData.table.code"), render: (row: SubmissionType) => row.code },
    { key: "legalMatter", header: t("admin.procedureMasterData.table.legalMatter"), render: (row: SubmissionType) => row.legalMatterLabel || row.legalMatterId },
    { key: "procedureType", header: t("admin.procedureMasterData.table.procedureType"), render: (row: SubmissionType) => row.procedureTypeLabel || row.procedureTypeId },
    { key: "usageCount", header: t("admin.procedureMasterData.table.usageCount"), align: "right" as const, render: (row: SubmissionType) => row.usageCount ?? 0 },
    { key: "status", header: t("admin.procedureMasterData.table.status"), render: (row: SubmissionType) => statusBadge(row.isActive) }
  ];

  const renderActions = (row: { id: string; name: string; isActive: boolean }, entity: ConfirmationState["entity"]) =>
    canManage ? (
      <div className="tableActions">
        <IconButton
          ariaLabel={t("common.edit")}
          onClick={() => {
            if (entity === "legalMatter") {
              openLegalMatterModal(row.id);
            } else if (entity === "procedureType") {
              openProcedureTypeModal(row.id);
            } else {
              openSubmissionTypeModal(row.id);
            }
          }}
        >
          <EditIcon />
        </IconButton>
        {row.isActive ? (
          <IconButton
            ariaLabel={t("admin.procedureMasterData.action.deactivate")}
            onClick={() => setConfirmation({ entity, id: row.id, label: row.name, mode: "deactivate" } as ConfirmationState)}
          >
            <ArchiveIcon />
          </IconButton>
        ) : (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setConfirmation({ entity, id: row.id, label: row.name, mode: "reactivate" } as ConfirmationState)}
          >
            {t("admin.procedureMasterData.action.reactivate")}
          </Button>
        )}
      </div>
    ) : null;

  return (
    <div className="page">
      <AdminSubnav />

      <div className="pageHeader">
        <div>
          <h1 className="pageTitle">{t("admin.procedureMasterData.title")}</h1>
        </div>
        <div className="inlineMeta">
          <label className="checkboxRow">
            <input
              type="checkbox"
              checked={showInactive}
              onChange={(event) => setShowInactive(event.target.checked)}
            />
            <span>{t("admin.procedureMasterData.showInactive")}</span>
          </label>
          {canManage && tab === "legalMatters" ? (
            <Button onClick={() => openLegalMatterModal()}>{t("admin.procedureMasterData.action.newLegalMatter")}</Button>
          ) : null}
          {canManage && tab === "procedureTypes" ? (
            <Button onClick={() => openProcedureTypeModal()}>{t("admin.procedureMasterData.action.newProcedureType")}</Button>
          ) : null}
          {canManage && tab === "submissionTypes" ? (
            <Button onClick={() => openSubmissionTypeModal()}>{t("admin.procedureMasterData.action.newSubmissionType")}</Button>
          ) : null}
        </div>
      </div>

      <div className="tabs" role="tablist" aria-label={t("admin.procedureMasterData.tabs.ariaLabel")}>
        {(["submissionTypes", "legalMatters", "procedureTypes"] as TabKey[]).map((item) => (
          <button
            type="button"
            key={item}
            role="tab"
            aria-selected={tab === item}
            className={`tabButton ${tab === item ? "tabButtonActive" : ""}`}
            onClick={() => setTab(item)}
          >
            {t(`admin.procedureMasterData.tabs.${item}`)}
          </button>
        ))}
      </div>

      {pageError ? <p className="validationText">{pageError}</p> : null}
      {successMessage ? <p className="placeholderText">{successMessage}</p> : null}

      {tab === "legalMatters" ? (
        <Card>
          <DataTable
            columns={legalMatterColumns}
            data={visibleLegalMatters}
            getRowKey={(row) => row.id}
            rowActions={(row) => renderActions(row, "legalMatter")}
          />
        </Card>
      ) : null}

      {tab === "procedureTypes" ? (
        <Card>
          <DataTable
            columns={procedureTypeColumns}
            data={visibleProcedureTypes}
            getRowKey={(row) => row.id}
            rowActions={(row) => renderActions(row, "procedureType")}
          />
        </Card>
      ) : null}

      {tab === "submissionTypes" ? (
        <Card>
          <DataTable
            columns={submissionTypeColumns}
            data={visibleSubmissionTypes}
            getRowKey={(row) => row.id}
            rowActions={(row) => renderActions(row, "submissionType")}
          />
        </Card>
      ) : null}

      <Modal
        open={canManage && legalMatterModalOpen}
        onClose={closeModals}
        closeAriaLabel={t("modal.close")}
        header={editingLegalMatterId ? t("admin.procedureMasterData.modal.editLegalMatter") : t("admin.procedureMasterData.modal.newLegalMatter")}
        footer={
          <div className="modalFooter">
            <Button variant="secondary" onClick={closeModals} disabled={isSubmitting}>{t("common.cancel")}</Button>
            <Button onClick={() => void saveLegalMatter()} disabled={isSubmitting}>{t("common.save")}</Button>
          </div>
        }
      >
        <div className="modalForm">
          <div className="formField">
            <span className="fieldLabel">{t("admin.procedureMasterData.form.code")}</span>
            <Input value={legalMatterForm.code} onChange={(event) => setLegalMatterForm((prev) => ({ ...prev, code: event.target.value }))} />
          </div>
          <div className="formField">
            <span className="fieldLabel">{t("admin.procedureMasterData.form.name")}</span>
            <Input value={legalMatterForm.name} onChange={(event) => setLegalMatterForm((prev) => ({ ...prev, name: event.target.value }))} />
          </div>
          <div className="formField">
            <span className="fieldLabel">{t("admin.procedureMasterData.form.shortName")}</span>
            <Input value={legalMatterForm.shortName} onChange={(event) => setLegalMatterForm((prev) => ({ ...prev, shortName: event.target.value }))} />
          </div>
          <div className="formField">
            <span className="fieldLabel">{t("admin.procedureMasterData.form.description")}</span>
            <textarea className="textarea" rows={3} value={legalMatterForm.description} onChange={(event) => setLegalMatterForm((prev) => ({ ...prev, description: event.target.value }))} />
          </div>
          <div className="inlineFieldRow">
            <div className="formField">
              <span className="fieldLabel">{t("admin.procedureMasterData.form.sortOrder")}</span>
              <Input type="number" value={legalMatterForm.sortOrder} onChange={(event) => setLegalMatterForm((prev) => ({ ...prev, sortOrder: event.target.value }))} />
            </div>
            <div className="formField">
              <span className="fieldLabel">{t("admin.procedureMasterData.form.badgeVariant")}</span>
              <Select options={badgeOptions} value={legalMatterForm.badgeVariant} onChange={(event) => setLegalMatterForm((prev) => ({ ...prev, badgeVariant: event.target.value }))} />
            </div>
          </div>
          {formError ? <p className="validationText">{formError}</p> : null}
        </div>
      </Modal>

      <Modal
        open={canManage && procedureTypeModalOpen}
        onClose={closeModals}
        closeAriaLabel={t("modal.close")}
        header={editingProcedureTypeId ? t("admin.procedureMasterData.modal.editProcedureType") : t("admin.procedureMasterData.modal.newProcedureType")}
        footer={
          <div className="modalFooter">
            <Button variant="secondary" onClick={closeModals} disabled={isSubmitting}>{t("common.cancel")}</Button>
            <Button onClick={() => void saveProcedureType()} disabled={isSubmitting}>{t("common.save")}</Button>
          </div>
        }
      >
        <div className="modalForm">
          <div className="formField">
            <span className="fieldLabel">{t("admin.procedureMasterData.form.code")}</span>
            <Input value={procedureTypeForm.code} onChange={(event) => setProcedureTypeForm((prev) => ({ ...prev, code: event.target.value }))} />
          </div>
          <div className="formField">
            <span className="fieldLabel">{t("admin.procedureMasterData.form.name")}</span>
            <Input value={procedureTypeForm.name} onChange={(event) => setProcedureTypeForm((prev) => ({ ...prev, name: event.target.value }))} />
          </div>
          <div className="formField">
            <span className="fieldLabel">{t("admin.procedureMasterData.form.shortName")}</span>
            <Input value={procedureTypeForm.shortName} onChange={(event) => setProcedureTypeForm((prev) => ({ ...prev, shortName: event.target.value }))} />
          </div>
          <div className="formField">
            <span className="fieldLabel">{t("admin.procedureMasterData.form.description")}</span>
            <textarea className="textarea" rows={3} value={procedureTypeForm.description} onChange={(event) => setProcedureTypeForm((prev) => ({ ...prev, description: event.target.value }))} />
          </div>
          <div className="formField">
            <span className="fieldLabel">{t("admin.procedureMasterData.form.sortOrder")}</span>
            <Input type="number" value={procedureTypeForm.sortOrder} onChange={(event) => setProcedureTypeForm((prev) => ({ ...prev, sortOrder: event.target.value }))} />
          </div>
          {formError ? <p className="validationText">{formError}</p> : null}
        </div>
      </Modal>

      <Modal
        open={canManage && submissionTypeModalOpen}
        onClose={closeModals}
        closeAriaLabel={t("modal.close")}
        header={editingSubmissionTypeId ? t("admin.procedureMasterData.modal.editSubmissionType") : t("admin.procedureMasterData.modal.newSubmissionType")}
        footer={
          <div className="modalFooter">
            <Button variant="secondary" onClick={closeModals} disabled={isSubmitting}>{t("common.cancel")}</Button>
            <Button onClick={() => void saveSubmissionType()} disabled={isSubmitting}>{t("common.save")}</Button>
          </div>
        }
      >
        <div className="modalForm">
          <div className="inlineFieldRow">
            <div className="formField">
              <span className="fieldLabel">{t("admin.procedureMasterData.form.legalMatter")}</span>
              <Select
                options={[{ value: "", label: t("admin.procedureMasterData.form.legalMatter") }, ...activeLegalMatterOptions]}
                value={submissionTypeForm.legalMatterId}
                onChange={(event) => setSubmissionTypeForm((prev) => ({ ...prev, legalMatterId: event.target.value }))}
              />
            </div>
            <div className="formField">
              <span className="fieldLabel">{t("admin.procedureMasterData.form.procedureType")}</span>
              <Select
                options={[{ value: "", label: t("admin.procedureMasterData.form.procedureType") }, ...activeProcedureTypeOptions]}
                value={submissionTypeForm.procedureTypeId}
                onChange={(event) => setSubmissionTypeForm((prev) => ({ ...prev, procedureTypeId: event.target.value }))}
              />
            </div>
          </div>
          <div className="formField">
            <span className="fieldLabel">{t("admin.procedureMasterData.form.code")}</span>
            <Input value={submissionTypeForm.code} onChange={(event) => setSubmissionTypeForm((prev) => ({ ...prev, code: event.target.value }))} />
          </div>
          <div className="formField">
            <span className="fieldLabel">{t("admin.procedureMasterData.form.name")}</span>
            <Input value={submissionTypeForm.name} onChange={(event) => setSubmissionTypeForm((prev) => ({ ...prev, name: event.target.value }))} />
          </div>
          <div className="formField">
            <span className="fieldLabel">{t("admin.procedureMasterData.form.shortName")}</span>
            <Input value={submissionTypeForm.shortName} onChange={(event) => setSubmissionTypeForm((prev) => ({ ...prev, shortName: event.target.value }))} />
          </div>
          <div className="formField">
            <span className="fieldLabel">{t("admin.procedureMasterData.form.description")}</span>
            <textarea className="textarea" rows={3} value={submissionTypeForm.description} onChange={(event) => setSubmissionTypeForm((prev) => ({ ...prev, description: event.target.value }))} />
          </div>
          <div className="inlineFieldRow">
            <div className="formField">
              <span className="fieldLabel">{t("admin.procedureMasterData.form.sortOrder")}</span>
              <Input type="number" value={submissionTypeForm.sortOrder} onChange={(event) => setSubmissionTypeForm((prev) => ({ ...prev, sortOrder: event.target.value }))} />
            </div>
            <div className="formField">
              <span className="fieldLabel">{t("admin.procedureMasterData.form.badgeVariant")}</span>
              <Select options={badgeOptions} value={submissionTypeForm.badgeVariant} onChange={(event) => setSubmissionTypeForm((prev) => ({ ...prev, badgeVariant: event.target.value }))} />
            </div>
          </div>
          <div className="formField">
            <span className="fieldLabel">{t("admin.procedureMasterData.form.legacyAliases")}</span>
            <Input value={submissionTypeForm.legacyAliases} onChange={(event) => setSubmissionTypeForm((prev) => ({ ...prev, legacyAliases: event.target.value }))} />
          </div>
          {formError ? <p className="validationText">{formError}</p> : null}
        </div>
      </Modal>

      <Modal
        open={canManage && Boolean(confirmation)}
        onClose={() => setConfirmation(null)}
        closeAriaLabel={t("modal.close")}
        header={
          confirmation?.mode === "deactivate"
            ? t("admin.procedureMasterData.confirm.deactivate.title")
            : t("admin.procedureMasterData.confirm.reactivate.title")
        }
        footer={
          <div className="modalFooter">
            <Button variant="secondary" onClick={() => setConfirmation(null)} disabled={isSubmitting}>
              {t("common.cancel")}
            </Button>
            <Button onClick={() => void confirmAction()} disabled={isSubmitting}>
              {t("common.confirm")}
            </Button>
          </div>
        }
      >
        <p className="placeholderText">
          {(confirmation?.mode === "deactivate"
            ? t("admin.procedureMasterData.confirm.deactivate.text")
            : t("admin.procedureMasterData.confirm.reactivate.text")
          ).replace("{name}", confirmation?.label ?? "")}
        </p>
      </Modal>
    </div>
  );
}
