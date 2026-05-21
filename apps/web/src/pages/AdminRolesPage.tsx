import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { Badge, Button, Card, DataTable, IconButton, Input, Modal, Select } from "@nemetz/ui";
import { getAdminRoleCatalog, type PermissionCatalogEntry } from "../api/roles";
import { ApiError } from "../api/client";
import { t } from "../i18n";
import { useAuthorization } from "../state/AuthorizationStore";
import { useRoles, type AdminRole } from "../state/RolesStore";
import { ArchiveIcon, EditIcon } from "../components/Icons";
import AdminSubnav from "../components/AdminSubnav";

type ArchivedFilter = "false" | "true" | "all";

type RoleFormState = {
  key: string;
  labelDe: string;
  descriptionDe: string;
  permissionKeys: string[];
};

type ConfirmationState = {
  roleId: string;
  roleLabel: string;
  mode: "archive" | "restore";
};

const emptyForm: RoleFormState = {
  key: "",
  labelDe: "",
  descriptionDe: "",
  permissionKeys: []
};
const POST_MUTATION_REFRESH = { force: true, reason: "postMutation" } as const;

function normalizeRoleKey(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, "_");
}

function isValidRoleKey(value: string) {
  return /^[A-Z][A-Z0-9_]*$/.test(value);
}

function extractApiErrorMessage(error: unknown, fallbackKey: string) {
  if (error instanceof ApiError) {
    const message = typeof error.message === "string" ? error.message.trim() : "";

    if (/admin\.access is required for admin sub-section permissions/i.test(message)) {
      return t("admin.roles.validation.adminAccessRequired");
    }

    if (error.status === 409) {
      return t("admin.roles.validation.uniqueKey");
    }

    if (message) {
      return message;
    }
  }

  return t(fallbackKey);
}

export default function AdminRolesPage() {
  const { permissions } = useAuthorization();
  const { loadRoles, createRole, updateRole, archiveRole, restoreRole } = useRoles();

  const [search, setSearch] = useState("");
  const [archivedFilter, setArchivedFilter] = useState<ArchivedFilter>("false");
  const [rows, setRows] = useState<AdminRole[]>([]);
  const [permissionCatalog, setPermissionCatalog] = useState<PermissionCatalogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isCatalogLoading, setIsCatalogLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const fetchRolesSeqRef = useRef(0);
  const fetchCatalogSeqRef = useRef(0);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<RoleFormState>(emptyForm);
  const [formError, setFormError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [confirmation, setConfirmation] = useState<ConfirmationState | null>(null);
  const [isConfirmSubmitting, setIsConfirmSubmitting] = useState(false);

  const editingRole = useMemo(() => rows.find((row) => row.id === editingId), [editingId, rows]);
  const canManageRoles = permissions.canManageRolesAdmin;
  const groupedPermissionCatalog = useMemo(() => {
    const groups = new Map<string, PermissionCatalogEntry[]>();

    permissionCatalog.forEach((entry) => {
      const bucket = groups.get(entry.group) ?? [];
      bucket.push(entry);
      groups.set(entry.group, bucket);
    });

    return Array.from(groups.entries());
  }, [permissionCatalog]);
  const adminSubsectionPermissionKeys = useMemo(
    () =>
      new Set(
        permissionCatalog.filter((entry) => entry.requiresAdminAccess).map((entry) => entry.key)
      ),
    [permissionCatalog]
  );

  const query = useMemo(
    () => ({
      q: search.trim() || undefined,
      archived: archivedFilter
    }),
    [archivedFilter, search]
  );

  const fetchRoles = useCallback(async (options: { force?: boolean; reason?: string } = {}) => {
    const requestSeq = fetchRolesSeqRef.current + 1;
    fetchRolesSeqRef.current = requestSeq;
    setIsLoading(true);
    setLoadError("");

    try {
      const payload = await loadRoles(query, options);
      if (fetchRolesSeqRef.current !== requestSeq) {
        return;
      }
      setRows(payload.items);
    } catch {
      if (fetchRolesSeqRef.current === requestSeq) {
        setLoadError(t("admin.roles.error.load"));
      }
    } finally {
      if (fetchRolesSeqRef.current === requestSeq) {
        setIsLoading(false);
      }
    }
  }, [loadRoles, query]);

  useEffect(() => {
    void fetchRoles();
  }, [fetchRoles]);

  useEffect(() => {
    if (!permissions.canViewRolesAdmin) {
      return;
    }

    const requestSeq = fetchCatalogSeqRef.current + 1;
    fetchCatalogSeqRef.current = requestSeq;
    setIsCatalogLoading(true);
    void getAdminRoleCatalog()
      .then((payload) => {
        if (fetchCatalogSeqRef.current !== requestSeq) {
          return;
        }
        setPermissionCatalog(payload.permissions);
      })
      .catch(() => {
        if (fetchCatalogSeqRef.current === requestSeq) {
          setLoadError(t("admin.roles.error.catalog"));
        }
      })
      .finally(() => {
        if (fetchCatalogSeqRef.current === requestSeq) {
          setIsCatalogLoading(false);
        }
      });
  }, [permissions.canViewRolesAdmin]);

  if (!permissions.canViewRolesAdmin) {
    return <Navigate to="/compliance/dashboard" replace />;
  }

  const openCreateModal = () => {
    if (!canManageRoles) {
      return;
    }
    setEditingId(null);
    setForm(emptyForm);
    setFormError("");
    setSuccessMessage("");
    setModalOpen(true);
  };

  const openEditModal = (roleId: string) => {
    if (!canManageRoles) {
      return;
    }
    const role = rows.find((row) => row.id === roleId);
    if (!role) {
      return;
    }

    setEditingId(role.id);
    setForm({
      key: role.key,
      labelDe: role.labelDe,
      descriptionDe: role.descriptionDe ?? "",
      permissionKeys: role.permissionKeys ?? []
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
    const normalizedKey = normalizeRoleKey(form.key);
    if (!normalizedKey || !form.labelDe.trim()) {
      return t("admin.roles.validation.required");
    }
    if (!isValidRoleKey(normalizedKey)) {
      return t("admin.roles.validation.keyFormat");
    }
    if (!(editingRole?.isSystem) && form.permissionKeys.length === 0) {
      return t("admin.roles.validation.permissionsRequired");
    }
    if (
      form.permissionKeys.some((permissionKey) => adminSubsectionPermissionKeys.has(permissionKey)) &&
      !form.permissionKeys.includes("admin.access")
    ) {
      return t("admin.roles.validation.adminAccessRequired");
    }
    return "";
  };

  const togglePermissionKey = (permissionKey: string) => {
    setForm((prev) => ({
      ...prev,
      permissionKeys: prev.permissionKeys.includes(permissionKey)
        ? prev.permissionKeys.filter((entry) => entry !== permissionKey)
        : [...prev.permissionKeys, permissionKey]
    }));
  };

  const handleSave = async () => {
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
        await updateRole(editingId, {
          key: normalizeRoleKey(form.key),
          labelDe: form.labelDe.trim(),
          descriptionDe: form.descriptionDe.trim() || undefined,
          permissionKeys: editingRole?.isSystem ? undefined : form.permissionKeys
        });
        setSuccessMessage(t("admin.roles.success.updated"));
      } else {
        await createRole({
          key: normalizeRoleKey(form.key),
          labelDe: form.labelDe.trim(),
          descriptionDe: form.descriptionDe.trim() || undefined,
          permissionKeys: form.permissionKeys
        });
        setSuccessMessage(t("admin.roles.success.created"));
      }

      await fetchRoles(POST_MUTATION_REFRESH);
      closeModal();
    } catch (error) {
      setFormError(extractApiErrorMessage(error, "admin.roles.error.save"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmArchiveRestore = async () => {
    if (!confirmation) {
      return;
    }

    setIsConfirmSubmitting(true);
    setLoadError("");
    setSuccessMessage("");

    try {
      if (confirmation.mode === "archive") {
        await archiveRole(confirmation.roleId);
        setSuccessMessage(t("admin.roles.success.archived"));
      } else {
        await restoreRole(confirmation.roleId);
        setSuccessMessage(t("admin.roles.success.restored"));
      }

      await fetchRoles(POST_MUTATION_REFRESH);
      setConfirmation(null);
    } catch (error) {
      setLoadError(extractApiErrorMessage(error, "admin.roles.error.action"));
    } finally {
      setIsConfirmSubmitting(false);
    }
  };

  return (
    <div className="page">
      <div className="pageHeader">
        <h1 className="pageTitle">{t("admin.roles.title")}</h1>
        {canManageRoles ? <Button onClick={openCreateModal}>{t("admin.roles.action.new")}</Button> : null}
      </div>

      <AdminSubnav />

      <Card>
        <div className="filterRowFour">
          <Input
            placeholder={t("admin.roles.filters.searchPlaceholder")}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />

          <Select
            options={[
              { value: "false", label: t("admin.roles.filters.archived.active") },
              { value: "true", label: t("admin.roles.filters.archived.archived") },
              { value: "all", label: t("admin.roles.filters.archived.all") }
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

      {isLoading || isCatalogLoading ? (
        <Card>
          <p className="placeholderText">{t("admin.roles.loading")}</p>
        </Card>
      ) : null}

      <DataTable
        columns={[
          {
            key: "key",
            header: t("admin.roles.table.key"),
            render: (row: AdminRole) => row.key
          },
          {
            key: "labelDe",
            header: t("admin.roles.table.labelDe"),
            render: (row: AdminRole) => row.labelDe
          },
          {
            key: "descriptionDe",
            header: t("admin.roles.table.descriptionDe"),
            render: (row: AdminRole) => row.descriptionDe || t("common.notAvailable")
          },
          {
            key: "permissions",
            header: t("admin.roles.table.permissions"),
            render: (row: AdminRole) =>
              row.permissionLabels && row.permissionLabels.length > 0
                ? row.permissionLabels.join(", ")
                : t("admin.roles.permissions.none")
          },
          {
            key: "flags",
            header: t("admin.roles.table.flags"),
            render: (row: AdminRole) => (
              <div className="tableBadges">
                {row.isSystem ? <Badge variant="neutral">{t("admin.roles.systemRole")}</Badge> : null}
                {row.isAssignable === false ? (
                  <Badge variant="warning">{t("admin.roles.nonAssignable")}</Badge>
                ) : null}
                {row.isDeprecated ? (
                  <Badge variant="warning">{t("admin.roles.deprecated")}</Badge>
                ) : null}
              </div>
            )
          },
          {
            key: "status",
            header: t("admin.roles.table.status"),
            render: (row: AdminRole) =>
              row.isArchived ? (
                <Badge variant="warning">{t("users.status.archived")}</Badge>
              ) : (
                <Badge variant="success">{t("users.status.active")}</Badge>
              )
          }
        ]}
        data={rows}
        getRowKey={(row) => row.id}
        rowActions={(row) =>
          canManageRoles ? (
            <div className="tableActions">
              <IconButton ariaLabel={t("admin.roles.action.edit")} onClick={() => openEditModal(row.id)}>
                <EditIcon />
              </IconButton>

              {row.isArchived ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setConfirmation({
                      roleId: row.id,
                      roleLabel: row.labelDe,
                      mode: "restore"
                    })
                  }
                >
                  {t("admin.roles.action.restore")}
                </Button>
              ) : (
                <IconButton
                  ariaLabel={t("admin.roles.action.archive")}
                  onClick={() =>
                    setConfirmation({
                      roleId: row.id,
                      roleLabel: row.labelDe,
                      mode: "archive"
                    })
                  }
                  disabled={row.isSystem}
                >
                  <ArchiveIcon />
                </IconButton>
              )}
            </div>
          ) : null
        }
      />

      <Modal
        open={modalOpen}
        onClose={closeModal}
        closeAriaLabel={t("modal.close")}
        header={editingId ? t("admin.roles.modal.edit") : t("admin.roles.modal.new")}
        footer={
          <div className="modalFooter">
            <Button variant="secondary" onClick={closeModal}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleSave} disabled={Boolean(validateForm()) || isSubmitting || !canManageRoles}>
              {isSubmitting ? t("admin.roles.saving") : t("common.save")}
            </Button>
          </div>
        }
      >
        <div className="modalForm">
          <div className="formField">
            <span className="fieldLabel">{t("admin.roles.form.key")}</span>
            <Input
              value={form.key}
              onChange={(event) => setForm((prev) => ({ ...prev, key: event.target.value }))}
              disabled={isSubmitting || Boolean(editingRole?.isSystem)}
              placeholder={t("admin.roles.form.key")}
            />
          </div>

          <div className="formField">
            <span className="fieldLabel">{t("admin.roles.form.labelDe")}</span>
            <Input
              value={form.labelDe}
              onChange={(event) => setForm((prev) => ({ ...prev, labelDe: event.target.value }))}
              disabled={isSubmitting}
              placeholder={t("admin.roles.form.labelDe")}
            />
          </div>

          <div className="formField">
            <span className="fieldLabel">{t("admin.roles.form.descriptionDe")}</span>
            <textarea
              className="textarea"
              rows={3}
              value={form.descriptionDe}
              onChange={(event) => setForm((prev) => ({ ...prev, descriptionDe: event.target.value }))}
              disabled={isSubmitting}
              placeholder={t("admin.roles.form.descriptionDe")}
            />
          </div>

          <div className="formField">
            <span className="fieldLabel">{t("admin.roles.form.permissions")}</span>
            {editingRole?.isSystem ? <p className="placeholderText">{t("admin.roles.permissions.readonly")}</p> : null}
            <div className="permissionGrid">
              {groupedPermissionCatalog.map(([groupLabel, entries]) => (
                <div key={groupLabel} className="permissionGroup">
                  <h3 className="sectionTitle">{groupLabel}</h3>
                  <div className="permissionList">
                    {entries.map((entry) => (
                      <label key={entry.key} className="permissionCheckbox">
                        <input
                          type="checkbox"
                          checked={form.permissionKeys.includes(entry.key)}
                          onChange={() => togglePermissionKey(entry.key)}
                          disabled={isSubmitting || Boolean(editingRole?.isSystem)}
                        />
                        <span>{entry.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
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
            ? t("admin.roles.confirm.archive.title")
            : t("admin.roles.confirm.restore.title")
        }
        footer={
          <div className="modalFooter">
            <Button variant="secondary" onClick={() => setConfirmation(null)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleConfirmArchiveRestore} disabled={isConfirmSubmitting}>
              {isConfirmSubmitting ? t("admin.roles.confirm.pending") : t("common.confirm")}
            </Button>
          </div>
        }
      >
        <p className="placeholderText">
          {confirmation?.mode === "archive"
            ? t("admin.roles.confirm.archive.text").replace("{name}", confirmation?.roleLabel ?? "")
            : t("admin.roles.confirm.restore.text").replace("{name}", confirmation?.roleLabel ?? "")}
        </p>
      </Modal>
    </div>
  );
}
