import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { Badge, Button, Card, DataTable, IconButton, Input, Modal, Select } from "@nemetz/ui";
import { ApiError } from "../api/client";
import { t } from "../i18n";
import { useAuthorization } from "../state/AuthorizationStore";
import { useExternalOrgs, type ExternalOrganization } from "../state/ExternalOrgsStore";
import { ArchiveIcon, EditIcon } from "../components/Icons";
import AdminSubnav from "../components/AdminSubnav";

type ArchivedFilter = "false" | "true" | "all";

type FormState = {
  name: string;
  type: string;
  phone: string;
  email: string;
  address: string;
};

type ConfirmationState = {
  orgId: string;
  orgLabel: string;
  mode: "archive" | "restore";
};

const DEFAULT_EXTERNAL_ORG_TYPE = "Firma";
const POST_MUTATION_REFRESH = { force: true, reason: "postMutation" } as const;

const emptyForm: FormState = {
  name: "",
  type: DEFAULT_EXTERNAL_ORG_TYPE,
  phone: "",
  email: "",
  address: ""
};

function isValidEmail(value: string) {
  if (!value.trim()) {
    return true;
  }
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function extractApiErrorMessage(error: unknown, fallbackKey: string) {
  if (error instanceof ApiError) {
    if (error.status === 409) {
      return t("admin.externalOrgs.validation.uniqueName");
    }

    if (typeof error.message === "string" && error.message.trim()) {
      return error.message;
    }
  }

  return t(fallbackKey);
}

export default function AdminExternalOrgsPage() {
  const { permissions } = useAuthorization();
  const { loadExternalOrgs, createExternalOrg, updateExternalOrg, archiveExternalOrg, restoreExternalOrg } = useExternalOrgs();
  const canManageExternalOrgs = permissions.canManageExternalOrgsAdmin;

  const [search, setSearch] = useState("");
  const [archivedFilter, setArchivedFilter] = useState<ArchivedFilter>("false");
  const [rows, setRows] = useState<ExternalOrganization[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const fetchExternalOrgsSeqRef = useRef(0);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [confirmation, setConfirmation] = useState<ConfirmationState | null>(null);
  const [isConfirmSubmitting, setIsConfirmSubmitting] = useState(false);

  const query = useMemo(
    () => ({
      q: search.trim() || undefined,
      archived: archivedFilter
    }),
    [archivedFilter, search]
  );

  const fetchExternalOrgs = useCallback(async (options: { force?: boolean; reason?: string } = {}) => {
    const requestSeq = fetchExternalOrgsSeqRef.current + 1;
    fetchExternalOrgsSeqRef.current = requestSeq;
    setIsLoading(true);
    setLoadError("");

    try {
      const payload = await loadExternalOrgs(query, options);
      if (fetchExternalOrgsSeqRef.current !== requestSeq) {
        return;
      }
      setRows(payload.items);
    } catch {
      if (fetchExternalOrgsSeqRef.current === requestSeq) {
        setLoadError(t("admin.externalOrgs.error.load"));
      }
    } finally {
      if (fetchExternalOrgsSeqRef.current === requestSeq) {
        setIsLoading(false);
      }
    }
  }, [loadExternalOrgs, query]);

  useEffect(() => {
    void fetchExternalOrgs();
  }, [fetchExternalOrgs]);

  if (!permissions.canViewExternalOrgsAdmin) {
    return <Navigate to="/compliance/dashboard" replace />;
  }

  const openCreateModal = () => {
    if (!canManageExternalOrgs) {
      return;
    }
    setEditingId(null);
    setForm(emptyForm);
    setFormError("");
    setSuccessMessage("");
    setModalOpen(true);
  };

  const openEditModal = (orgId: string) => {
    if (!canManageExternalOrgs) {
      return;
    }
    const row = rows.find((entry) => entry.id === orgId);
    if (!row) {
      return;
    }

    setEditingId(row.id);
    setForm({
      name: row.name,
      type: row.type,
      phone: row.phone ?? "",
      email: row.email ?? "",
      address: row.address ?? ""
    });
    setFormError("");
    setSuccessMessage("");
    setModalOpen(true);
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
    setForm(emptyForm);
    setFormError("");
  };

  const validateForm = () => {
    if (!form.name.trim()) {
      return t("admin.externalOrgs.validation.required");
    }
    if (!isValidEmail(form.email)) {
      return t("admin.externalOrgs.validation.email");
    }
    return "";
  };

  const handleSave = async () => {
    if (!canManageExternalOrgs) {
      return;
    }
    const validationError = validateForm();
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setIsSubmitting(true);
    setFormError("");
    setSuccessMessage("");

    try {
      if (editingId) {
        await updateExternalOrg(editingId, {
          name: form.name.trim(),
          type: form.type.trim() || DEFAULT_EXTERNAL_ORG_TYPE,
          phone: form.phone.trim() || undefined,
          email: form.email.trim() || undefined,
          address: form.address.trim() || undefined
        });
        setSuccessMessage(t("admin.externalOrgs.success.updated"));
      } else {
        await createExternalOrg({
          name: form.name.trim(),
          type: form.type.trim() || DEFAULT_EXTERNAL_ORG_TYPE,
          phone: form.phone.trim() || undefined,
          email: form.email.trim() || undefined,
          address: form.address.trim() || undefined
        });
        setSuccessMessage(t("admin.externalOrgs.success.created"));
      }

      await fetchExternalOrgs(POST_MUTATION_REFRESH);
      closeModal();
    } catch (error) {
      setFormError(
        extractApiErrorMessage(
          error,
          editingId ? "admin.externalOrgs.error.update" : "admin.externalOrgs.error.create"
        )
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmArchiveRestore = async () => {
    if (!canManageExternalOrgs) {
      return;
    }
    if (!confirmation) {
      return;
    }

    setIsConfirmSubmitting(true);
    setLoadError("");
    setSuccessMessage("");

    try {
      if (confirmation.mode === "archive") {
        await archiveExternalOrg(confirmation.orgId);
        setSuccessMessage(t("admin.externalOrgs.success.archived"));
      } else {
        await restoreExternalOrg(confirmation.orgId);
        setSuccessMessage(t("admin.externalOrgs.success.restored"));
      }

      await fetchExternalOrgs(POST_MUTATION_REFRESH);
      setConfirmation(null);
    } catch (error) {
      setLoadError(extractApiErrorMessage(error, "admin.externalOrgs.error.action"));
    } finally {
      setIsConfirmSubmitting(false);
    }
  };

  return (
    <div className="page">
      <div className="pageHeader">
        <h1 className="pageTitle">{t("admin.externalOrgs.title")}</h1>
        {canManageExternalOrgs ? <Button onClick={openCreateModal}>{t("admin.externalOrgs.action.new")}</Button> : null}
      </div>

      <AdminSubnav />

      <Card>
        <div className="filterRowFour">
          <Input
            placeholder={t("admin.externalOrgs.filters.searchPlaceholder")}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <Select
            options={[
              { value: "false", label: t("admin.externalOrgs.filters.archived.active") },
              { value: "true", label: t("admin.externalOrgs.filters.archived.archived") },
              { value: "all", label: t("admin.externalOrgs.filters.archived.all") }
            ]}
            value={archivedFilter}
            onChange={(event) => setArchivedFilter(event.target.value as ArchivedFilter)}
          />
        </div>
      </Card>

      {loadError ? (
        <Card>
          <p className="validationText">{loadError}</p>
        </Card>
      ) : null}

      {successMessage ? (
        <Card>
          <p className="placeholderText">{successMessage}</p>
        </Card>
      ) : null}

      {isLoading ? (
        <Card>
          <p className="placeholderText">{t("admin.externalOrgs.loading")}</p>
        </Card>
      ) : null}

      <DataTable
        columns={[
          {
            key: "name",
            header: t("admin.externalOrgs.table.name"),
            render: (row: ExternalOrganization) => row.name
          },
          {
            key: "type",
            header: t("admin.externalOrgs.table.type"),
            render: (row: ExternalOrganization) => row.type
          },
          {
            key: "email",
            header: t("admin.externalOrgs.table.email"),
            render: (row: ExternalOrganization) => row.email || t("common.notAvailable")
          },
          {
            key: "phone",
            header: t("admin.externalOrgs.table.phone"),
            render: (row: ExternalOrganization) => row.phone || t("common.notAvailable")
          },
          {
            key: "status",
            header: t("admin.externalOrgs.table.status"),
            render: (row: ExternalOrganization) =>
              row.isArchived ? (
                <Badge variant="warning">{t("users.status.archived")}</Badge>
              ) : (
                <Badge variant="success">{t("users.status.active")}</Badge>
              )
          }
        ]}
        data={rows}
        getRowKey={(row) => row.id}
        rowActions={
          canManageExternalOrgs
            ? (row) => (
                <div className="tableActions">
                  <IconButton ariaLabel={t("admin.externalOrgs.action.edit")} onClick={() => openEditModal(row.id)}>
                    <EditIcon />
                  </IconButton>

                  {row.isArchived ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setConfirmation({
                          orgId: row.id,
                          orgLabel: row.name,
                          mode: "restore"
                        })
                      }
                    >
                      {t("admin.externalOrgs.action.restore")}
                    </Button>
                  ) : (
                    <IconButton
                      ariaLabel={t("admin.externalOrgs.action.archive")}
                      onClick={() =>
                        setConfirmation({
                          orgId: row.id,
                          orgLabel: row.name,
                          mode: "archive"
                        })
                      }
                    >
                      <ArchiveIcon />
                    </IconButton>
                  )}
                </div>
              )
            : undefined
        }
      />

      <Modal
        open={modalOpen}
        onClose={closeModal}
        closeAriaLabel={t("modal.close")}
        header={editingId ? t("admin.externalOrgs.modal.edit") : t("admin.externalOrgs.modal.new")}
        footer={
          <div className="modalFooter">
            <Button variant="secondary" onClick={closeModal}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleSave} disabled={Boolean(validateForm()) || isSubmitting}>
              {isSubmitting ? t("admin.externalOrgs.saving") : t("common.save")}
            </Button>
          </div>
        }
      >
        <div className="modalForm">
          <div className="formField">
            <span className="fieldLabel">{t("admin.externalOrgs.form.name")}</span>
            <Input
              value={form.name}
              onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
              disabled={isSubmitting}
              placeholder={t("admin.externalOrgs.form.name")}
            />
          </div>

          <div className="formField">
            <span className="fieldLabel">{t("admin.externalOrgs.form.type")}</span>
            <Input
              value={form.type}
              onChange={(event) => setForm((prev) => ({ ...prev, type: event.target.value }))}
              disabled={isSubmitting}
              placeholder={t("admin.externalOrgs.form.type")}
            />
          </div>

          <div className="formField">
            <span className="fieldLabel">{t("admin.externalOrgs.form.phone")}</span>
            <Input
              value={form.phone}
              onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
              disabled={isSubmitting}
              placeholder={t("admin.externalOrgs.form.phone")}
            />
          </div>

          <div className="formField">
            <span className="fieldLabel">{t("admin.externalOrgs.form.email")}</span>
            <Input
              value={form.email}
              onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
              disabled={isSubmitting}
              placeholder={t("admin.externalOrgs.form.email")}
            />
          </div>

          <div className="formField">
            <span className="fieldLabel">{t("admin.externalOrgs.form.address")}</span>
            <textarea
              className="textarea"
              rows={3}
              value={form.address}
              onChange={(event) => setForm((prev) => ({ ...prev, address: event.target.value }))}
              disabled={isSubmitting}
              placeholder={t("admin.externalOrgs.form.address")}
            />
          </div>

          {formError ? <p className="validationText">{formError}</p> : null}
        </div>
      </Modal>

      <Modal
        open={Boolean(confirmation)}
        onClose={() => setConfirmation(null)}
        closeAriaLabel={t("modal.close")}
        header={
          confirmation?.mode === "archive"
            ? t("admin.externalOrgs.confirm.archive.title")
            : t("admin.externalOrgs.confirm.restore.title")
        }
        footer={
          <div className="modalFooter">
            <Button variant="secondary" onClick={() => setConfirmation(null)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleConfirmArchiveRestore} disabled={isConfirmSubmitting}>
              {isConfirmSubmitting ? t("admin.externalOrgs.confirm.pending") : t("common.confirm")}
            </Button>
          </div>
        }
      >
        <p className="placeholderText">
          {confirmation?.mode === "archive"
            ? t("admin.externalOrgs.confirm.archive.text").replace("{name}", confirmation?.orgLabel ?? "")
            : t("admin.externalOrgs.confirm.restore.text").replace("{name}", confirmation?.orgLabel ?? "")}
        </p>
      </Modal>
    </div>
  );
}
