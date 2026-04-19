import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { Badge, Button, Card, DataTable, IconButton, Input, Modal, Select } from "@nemetz/ui";
import { ApiError } from "../api/client";
import { t } from "../i18n";
import { useUsers, type UserType, type AdminUsersQuery } from "../state/UsersStore";
import { useAuthorization } from "../state/AuthorizationStore";
import { useAuth } from "../state/AuthStore";
import { useRoles } from "../state/RolesStore";
import { useExternalOrgs } from "../state/ExternalOrgsStore";
import { ArchiveIcon, EditIcon } from "../components/Icons";
import AdminSubnav from "../components/AdminSubnav";

type ArchivedFilter = "false" | "true" | "all";
type SortField = "name" | "email" | "createdAt" | "lastLoginAt";
type SortDirection = "asc" | "desc";
type PasswordMode = "link" | "manual" | "auto";

type UserFormState = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: string;
  type: UserType;
  titleOrPosition: string;
  externalOrgId: string;
  notes: string;
  initialPassword: string;
  passwordMode: PasswordMode;
  mustChangePassword: boolean;
};

type ConfirmationState = {
  userId: string;
  displayName: string;
  mode: "archive" | "restore";
};

type ResetState = {
  userId: string;
  displayName: string;
  isArchived: boolean;
  isSelf: boolean;
  passwordMode: PasswordMode;
  temporaryPassword: string;
};

type ExternalOrgQuickForm = {
  name: string;
  type: string;
  phone: string;
  email: string;
  address: string;
};

const emptyForm: UserFormState = {
  firstName: "",
  lastName: "",
  email: "",
  phone: "",
  role: "COMPLIANCE_EDITOR",
  type: "INTERNAL",
  titleOrPosition: "",
  externalOrgId: "",
  notes: "",
  initialPassword: "",
  passwordMode: "link",
  mustChangePassword: false
};

const emptyExternalOrgQuickForm: ExternalOrgQuickForm = {
  name: "",
  type: "",
  phone: "",
  email: "",
  address: ""
};

const fallbackRoleOptions = [
  { key: "ADMIN", label: t("users.role.admin") },
  { key: "COMPLIANCE_MANAGER", label: "Compliance Manager" },
  { key: "COMPLIANCE_EDITOR", label: "Compliance Editor" },
  { key: "READ_ONLY", label: "Read Only" },
  { key: "EXTERNAL", label: t("users.role.external") }
];

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function formatDateTime(value?: string) {
  if (!value) {
    return t("common.notAvailable");
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return t("common.notAvailable");
  }

  return parsed.toLocaleString("de-AT", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function isLocked(lockedUntil?: string) {
  if (!lockedUntil) {
    return false;
  }
  const timestamp = new Date(lockedUntil).getTime();
  return Number.isFinite(timestamp) && timestamp > Date.now();
}

function extractApiErrorMessage(error: unknown, fallbackKey: string) {
  if (error instanceof ApiError) {
    if (error.status === 409) {
      return t("users.validation.uniqueEmail");
    }

    if (typeof error.message === "string" && error.message.trim()) {
      return error.message;
    }
  }

  return t(fallbackKey);
}

export default function AdminUsersPage() {
  const { user: authUser } = useAuth();
  const { permissions } = useAuthorization();
  const {
    loadAdminUsers,
    addUser,
    updateUser,
    archiveUser,
    restoreUser,
    setMfaEnforced,
    resetMfa,
    requestReset,
    unlockUser,
    reloadUsers
  } = useUsers();
  const { roles, reloadRoles } = useRoles();
  const { externalOrgs, reloadExternalOrgs, createExternalOrg } = useExternalOrgs();

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<string | "ALL">("ALL");
  const [typeFilter, setTypeFilter] = useState<UserType | "ALL">("ALL");
  const [archivedFilter, setArchivedFilter] = useState<ArchivedFilter>("false");
  const [sort, setSort] = useState<SortField>("name");
  const [dir, setDir] = useState<SortDirection>("asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  const [rows, setRows] = useState<Awaited<ReturnType<typeof loadAdminUsers>>["items"]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<UserFormState>(emptyForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  const [confirmation, setConfirmation] = useState<ConfirmationState | null>(null);
  const [isConfirmSubmitting, setIsConfirmSubmitting] = useState(false);

  const [resetState, setResetState] = useState<ResetState | null>(null);
  const [isResetSubmitting, setIsResetSubmitting] = useState(false);
  const [resetError, setResetError] = useState("");
  const [resetDevValue, setResetDevValue] = useState("");

  const [inviteDevValue, setInviteDevValue] = useState("");

  const [externalOrgQuickModalOpen, setExternalOrgQuickModalOpen] = useState(false);
  const [externalOrgQuickForm, setExternalOrgQuickForm] = useState<ExternalOrgQuickForm>(emptyExternalOrgQuickForm);
  const [externalOrgQuickError, setExternalOrgQuickError] = useState("");
  const [isExternalOrgQuickSubmitting, setIsExternalOrgQuickSubmitting] = useState(false);

  const totalPages = Math.max(1, Math.ceil(total / Math.max(pageSize, 1)));

  const roleLabelMap = useMemo(
    () =>
      new Map(
        roles.map((role) => [role.key, role.labelDe] as const)
      ),
    [roles]
  );

  const getRoleLabel = useCallback(
    (roleKey: string) => roleLabelMap.get(roleKey) ?? t("admin.users.role.unknown").replace("{key}", roleKey),
    [roleLabelMap]
  );

  const roleFilterOptions = useMemo(() => {
    const options = [{ value: "ALL", label: t("users.filter.all") }];

    if (roles.length === 0) {
      return [
        ...options,
        ...fallbackRoleOptions.map((entry) => ({ value: entry.key, label: entry.label }))
      ];
    }

    const activeRoles = roles.filter((role) => !role.isArchived && (role.isAssignable ?? true));
    const seen = new Set<string>(["ALL"]);

    activeRoles.forEach((role) => {
      if (seen.has(role.key)) {
        return;
      }
      seen.add(role.key);
      options.push({ value: role.key, label: role.labelDe });
    });

    if (roleFilter !== "ALL" && !seen.has(roleFilter)) {
      options.push({
        value: roleFilter,
        label: t("admin.users.role.unknown").replace("{key}", roleFilter)
      });
    }

    return options;
  }, [roleFilter, roles]);

  const formRoleOptions = useMemo(() => {
    const activeRoles = roles.filter((role) => !role.isArchived && (role.isAssignable ?? true));
    const fromStore = activeRoles.map((role) => ({ value: role.key, label: role.labelDe }));
    const fallback = fallbackRoleOptions.map((entry) => ({ value: entry.key, label: entry.label }));

    const options = (fromStore.length > 0 ? fromStore : fallback).slice();
    if (form.role && !options.some((entry) => entry.value === form.role)) {
      options.push({
        value: form.role,
        label: t("admin.users.role.unknown").replace("{key}", form.role),
        disabled: true
      });
    }

    return options;
  }, [form.role, roles]);

  const externalOrgOptions = useMemo(() => {
    const options = [
      {
        value: "",
        label: t("admin.users.form.externalOrg.placeholder")
      },
      ...externalOrgs
        .filter((org) => !org.isArchived)
        .map((org) => ({
          value: org.id,
          label: `${org.name} (${org.type})`
        }))
    ];

    if (form.externalOrgId && !options.some((entry) => entry.value === form.externalOrgId)) {
      options.push({
        value: form.externalOrgId,
        label: t("admin.users.externalOrg.unknown").replace("{id}", form.externalOrgId),
        disabled: true
      });
    }

    return options;
  }, [externalOrgs, form.externalOrgId]);

  const query = useMemo<AdminUsersQuery>(
    () => ({
      q: search.trim() || undefined,
      role: roleFilter,
      type: typeFilter,
      archived: archivedFilter,
      page,
      pageSize,
      sort,
      dir
    }),
    [archivedFilter, dir, page, pageSize, roleFilter, search, sort, typeFilter]
  );

  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    setLoadError("");

    try {
      const response = await loadAdminUsers(query);
      setRows(response.items);
      setTotal(response.total);

      const maxPages = Math.max(1, Math.ceil(response.total / Math.max(response.pageSize, 1)));
      if (response.page > maxPages) {
        setPage(maxPages);
      }
    } catch {
      setLoadError(t("admin.users.error.load"));
    } finally {
      setIsLoading(false);
    }
  }, [loadAdminUsers, query]);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    void reloadRoles().catch(() => {
      // no-op; page renders fallback options
    });
    void reloadExternalOrgs().catch(() => {
      // no-op; select remains empty
    });
  }, [reloadExternalOrgs, reloadRoles]);

  if (!permissions.canViewAdmin) {
    return <Navigate to="/compliance/dashboard" replace />;
  }

  const clearTransientMessages = () => {
    setSuccessMessage("");
    setLoadError("");
    setInviteDevValue("");
  };

  const openCreateModal = () => {
    setForm(emptyForm);
    setEditingId(null);
    setFormError("");
    setModalOpen(true);
    clearTransientMessages();
    setResetError("");
    setResetDevValue("");
  };

  const openEditModal = (userId: string) => {
    const user = rows.find((row) => row.id === userId);
    if (!user) {
      return;
    }

    setForm({
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone ?? "",
      role: user.role,
      type: user.type,
      titleOrPosition: user.titleOrPosition ?? "",
      externalOrgId: user.externalOrgId ?? "",
      notes: user.notes ?? "",
      initialPassword: "",
      passwordMode: "link",
      mustChangePassword: Boolean(user.mustChangePassword)
    });
    setEditingId(user.id);
    setFormError("");
    setModalOpen(true);
    clearTransientMessages();
    setResetError("");
    setResetDevValue("");
  };

  const closeModal = () => {
    setModalOpen(false);
    setEditingId(null);
    setForm(emptyForm);
    setFormError("");
  };

  const validateForm = () => {
    if (!form.firstName.trim() || !form.lastName.trim() || !form.email.trim()) {
      return t("users.validation.required");
    }

    if (!isValidEmail(form.email.trim())) {
      return t("users.validation.email");
    }

    if (!form.role.trim()) {
      return t("admin.users.validation.roleRequired");
    }

    if (form.type === "EXTERNAL" && !form.externalOrgId.trim()) {
      return t("admin.users.validation.externalOrgRequired");
    }

    if (!editingId && form.passwordMode === "manual" && !form.initialPassword.trim()) {
      return "Bitte ein temporaeres Passwort eingeben.";
    }

    return "";
  };

  const isSaveDisabled = Boolean(validateForm()) || isSubmitting;

  const handleSave = async () => {
    const validationError = validateForm();
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setIsSubmitting(true);
    setFormError("");
    setSuccessMessage("");
    setInviteDevValue("");

    try {
      if (editingId) {
        await updateUser(editingId, {
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          phone: form.phone,
          role: form.role,
          type: form.type,
          titleOrPosition: form.titleOrPosition,
          externalOrgId: form.type === "EXTERNAL" ? form.externalOrgId : undefined,
          notes: form.notes,
          mustChangePassword: form.mustChangePassword
        });
        setSuccessMessage(t("admin.users.success.updated"));
      } else {
        const created = await addUser({
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          phone: form.phone,
          role: form.role,
          type: form.type,
          titleOrPosition: form.titleOrPosition,
          externalOrgId: form.type === "EXTERNAL" ? form.externalOrgId : undefined,
          notes: form.notes,
          initialPassword: form.passwordMode === "manual" ? form.initialPassword.trim() || undefined : undefined,
          passwordMode: form.passwordMode
        });

        const devValue = created.temporaryPassword || created.resetLink || created.outboxFile || "";
        setInviteDevValue(devValue);

        setSuccessMessage(
          created.temporaryPassword
            ? "Benutzer wurde angelegt. Das temporaere Passwort wird einmalig angezeigt."
            : created.user.invitedAt
              ? t("admin.users.success.createdInvite")
              : t("admin.users.success.created")
        );
      }

      await Promise.all([fetchUsers(), reloadUsers()]);
      closeModal();
    } catch (error) {
      setFormError(extractApiErrorMessage(error, "admin.users.error.save"));
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
        await archiveUser(confirmation.userId);
        setSuccessMessage(t("admin.users.success.archived"));
      } else {
        await restoreUser(confirmation.userId);
        setSuccessMessage(t("admin.users.success.restored"));
      }

      await Promise.all([fetchUsers(), reloadUsers()]);
      setConfirmation(null);
    } catch (error) {
      setLoadError(extractApiErrorMessage(error, "admin.users.error.action"));
    } finally {
      setIsConfirmSubmitting(false);
    }
  };

  const openResetModal = (input: { userId: string; displayName: string; isArchived: boolean; isSelf: boolean }) => {
    setResetState({
      ...input,
      passwordMode: "link",
      temporaryPassword: ""
    });
    setResetError("");
    setResetDevValue("");
    setSuccessMessage("");
  };

  const handleResetPassword = async () => {
    if (!resetState) {
      return;
    }

    if (resetState.isArchived) {
      setResetError(t("admin.users.reset.error.archived"));
      return;
    }

    if (resetState.passwordMode === "manual" && !resetState.temporaryPassword.trim()) {
      setResetError("Bitte ein temporaeres Passwort eingeben.");
      return;
    }

    setIsResetSubmitting(true);
    setResetError("");
    setSuccessMessage("");

    try {
      const result = await requestReset(resetState.userId, {
        passwordMode: resetState.passwordMode,
        temporaryPassword:
          resetState.passwordMode === "manual" ? resetState.temporaryPassword.trim() || undefined : undefined
      });
      const devValue = result.temporaryPassword || result.resetLink || result.outboxFile || "";
      setResetDevValue(devValue);
      setSuccessMessage(
        result.temporaryPassword
          ? "Temporaeres Passwort wurde gesetzt und wird einmalig angezeigt."
          : result.resetLink
          ? t("admin.users.reset.successWithLink").replace("{link}", result.resetLink)
          : result.outboxFile
            ? t("admin.users.reset.successWithOutbox").replace("{path}", result.outboxFile)
            : t("admin.users.reset.success")
      );

      await fetchUsers();
    } catch (error) {
      setResetError(extractApiErrorMessage(error, "admin.users.reset.error"));
    } finally {
      setIsResetSubmitting(false);
    }
  };

  const handleUnlock = async (userId: string) => {
    setLoadError("");
    setSuccessMessage("");

    try {
      await unlockUser(userId);
      setSuccessMessage(t("admin.users.success.unlocked"));
      await Promise.all([fetchUsers(), reloadUsers()]);
    } catch (error) {
      setLoadError(extractApiErrorMessage(error, "admin.users.error.action"));
    }
  };

  const handleToggleMfaEnforced = async (userId: string, enforced: boolean) => {
    setLoadError("");
    setSuccessMessage("");

    try {
      await setMfaEnforced(userId, enforced);
      setSuccessMessage(enforced ? t("admin.users.mfa.enforcedOn") : t("admin.users.mfa.enforcedOff"));
      await Promise.all([fetchUsers(), reloadUsers()]);
    } catch (error) {
      setLoadError(extractApiErrorMessage(error, "admin.users.error.action"));
    }
  };

  const handleResetMfa = async (userId: string) => {
    setLoadError("");
    setSuccessMessage("");

    try {
      await resetMfa(userId);
      setSuccessMessage(t("admin.users.mfa.resetSuccess"));
      await Promise.all([fetchUsers(), reloadUsers()]);
    } catch (error) {
      setLoadError(extractApiErrorMessage(error, "admin.users.error.action"));
    }
  };

  const copyValue = async (value: string) => {
    if (!value || !navigator.clipboard) {
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      setSuccessMessage(t("admin.users.reset.copied"));
    } catch {
      setResetError(t("admin.users.reset.copyError"));
    }
  };

  const openQuickAddExternalOrg = () => {
    setExternalOrgQuickError("");
    setExternalOrgQuickForm(emptyExternalOrgQuickForm);
    setExternalOrgQuickModalOpen(true);
  };

  const validateQuickExternalOrg = () => {
    if (!externalOrgQuickForm.name.trim() || !externalOrgQuickForm.type.trim()) {
      return t("admin.externalOrgs.validation.required");
    }
    if (externalOrgQuickForm.email.trim() && !isValidEmail(externalOrgQuickForm.email.trim())) {
      return t("admin.externalOrgs.validation.email");
    }
    return "";
  };

  const handleCreateQuickExternalOrg = async () => {
    const validationError = validateQuickExternalOrg();
    if (validationError) {
      setExternalOrgQuickError(validationError);
      return;
    }

    setIsExternalOrgQuickSubmitting(true);
    setExternalOrgQuickError("");

    try {
      const created = await createExternalOrg({
        name: externalOrgQuickForm.name.trim(),
        type: externalOrgQuickForm.type.trim(),
        phone: externalOrgQuickForm.phone.trim() || undefined,
        email: externalOrgQuickForm.email.trim() || undefined,
        address: externalOrgQuickForm.address.trim() || undefined
      });

      await reloadExternalOrgs();
      setForm((prev) => ({ ...prev, externalOrgId: created.id }));
      setExternalOrgQuickModalOpen(false);
      setSuccessMessage(t("admin.users.externalOrg.quickAddSuccess"));
    } catch (error) {
      setExternalOrgQuickError(extractApiErrorMessage(error, "admin.externalOrgs.error.save"));
    } finally {
      setIsExternalOrgQuickSubmitting(false);
    }
  };

  return (
    <div className="page">
      <div className="pageHeader">
        <h1 className="pageTitle">{t("admin.users.title")}</h1>
        <Button onClick={openCreateModal}>{t("admin.users.action.new")}</Button>
      </div>

      <AdminSubnav />

      <Card>
        <div className="filterRowSix">
          <Input
            placeholder={t("admin.users.filters.searchPlaceholder")}
            value={search}
            onChange={(event) => {
              setPage(1);
              setSearch(event.target.value);
            }}
          />

          <Select
            options={roleFilterOptions}
            value={roleFilter}
            onChange={(event) => {
              setPage(1);
              setRoleFilter(event.target.value as string | "ALL");
            }}
          />

          <Select
            options={[
              { value: "ALL", label: t("users.filter.all") },
              { value: "INTERNAL", label: t("users.type.internal") },
              { value: "EXTERNAL", label: t("users.type.external") }
            ]}
            value={typeFilter}
            onChange={(event) => {
              setPage(1);
              setTypeFilter(event.target.value as UserType | "ALL");
            }}
          />

          <Select
            options={[
              { value: "false", label: t("admin.users.filters.archived.active") },
              { value: "true", label: t("admin.users.filters.archived.archived") },
              { value: "all", label: t("admin.users.filters.archived.all") }
            ]}
            value={archivedFilter}
            onChange={(event) => {
              setPage(1);
              setArchivedFilter(event.target.value as ArchivedFilter);
            }}
          />

          <Select
            options={[
              { value: "name", label: t("admin.users.sort.name") },
              { value: "email", label: t("admin.users.sort.email") },
              { value: "createdAt", label: t("admin.users.sort.createdAt") },
              { value: "lastLoginAt", label: t("admin.users.sort.lastLoginAt") }
            ]}
            value={sort}
            onChange={(event) => {
              setPage(1);
              setSort(event.target.value as SortField);
            }}
          />

          <Select
            options={[
              { value: "asc", label: t("admin.users.sort.asc") },
              { value: "desc", label: t("admin.users.sort.desc") }
            ]}
            value={dir}
            onChange={(event) => {
              setPage(1);
              setDir(event.target.value as SortDirection);
            }}
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

      {inviteDevValue ? (
        <Card>
          <div className="formField">
            <span className="fieldLabel">{t("admin.users.reset.devValue")}</span>
            <Input value={inviteDevValue} disabled />
            <Button size="sm" variant="ghost" onClick={() => void copyValue(inviteDevValue)}>
              {t("admin.users.reset.copy")}
            </Button>
          </div>
        </Card>
      ) : null}

      {isLoading ? (
        <Card>
          <p className="placeholderText">{t("admin.users.loading")}</p>
        </Card>
      ) : null}

      <DataTable
        columns={[
          {
            key: "name",
            header: t("admin.users.table.name"),
            render: (row: (typeof rows)[number]) => `${row.firstName} ${row.lastName}`.trim()
          },
          {
            key: "email",
            header: t("admin.users.table.email"),
            render: (row: (typeof rows)[number]) => row.email || t("common.notAvailable")
          },
          {
            key: "type",
            header: t("admin.users.table.type"),
            render: (row: (typeof rows)[number]) => (
              <Badge variant={row.type === "EXTERNAL" ? "warning" : "neutral"}>
                {row.type === "EXTERNAL" ? t("users.type.external") : t("users.type.internal")}
              </Badge>
            )
          },
          {
            key: "role",
            header: t("admin.users.table.role"),
            render: (row: (typeof rows)[number]) => getRoleLabel(row.role)
          },
          {
            key: "externalOrg",
            header: t("admin.users.table.externalOrg"),
            render: (row: (typeof rows)[number]) =>
              row.type === "EXTERNAL"
                ? row.externalOrgName || row.externalCompany || t("common.notAvailable")
                : t("common.notAvailable")
          },
          {
            key: "phone",
            header: t("users.phone"),
            render: (row: (typeof rows)[number]) => row.phone || t("common.notAvailable")
          },
          {
            key: "lastLoginAt",
            header: t("admin.users.table.lastLogin"),
            render: (row: (typeof rows)[number]) => formatDateTime(row.lastLoginAt)
          },
          {
            key: "status",
            header: t("admin.users.table.status"),
            render: (row: (typeof rows)[number]) => {
              if (row.isArchived) {
                return <Badge variant="warning">{t("users.status.archived")}</Badge>;
              }

              if (isLocked(row.lockedUntil)) {
                return <Badge variant="danger">{t("users.status.locked")}</Badge>;
              }

              if (row.mustChangePassword) {
                return <Badge variant="warning">Passwortwechsel offen</Badge>;
              }

              return <Badge variant="success">{t("users.status.active")}</Badge>;
            }
          },
          {
            key: "mfa",
            header: t("admin.users.table.mfa"),
            render: (row: (typeof rows)[number]) => {
              if (row.mfaEnforced) {
                return <Badge variant="danger">{t("admin.users.mfa.enforced")}</Badge>;
              }
              if (row.mfaEnabled) {
                return <Badge variant="success">{t("admin.users.mfa.enabled")}</Badge>;
              }
              return <Badge variant="neutral">{t("admin.users.mfa.disabled")}</Badge>;
            }
          }
        ]}
        data={rows}
        getRowKey={(row) => row.id}
        rowActions={(row) => {
          const displayName = `${row.firstName} ${row.lastName}`.trim();
          const rowLocked = isLocked(row.lockedUntil);
          const isSelf = authUser?.id === row.id;

          return (
            <div className="tableActions">
              <IconButton ariaLabel={t("admin.users.action.edit")} onClick={() => openEditModal(row.id)}>
                <EditIcon />
              </IconButton>

              {row.isArchived ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    setConfirmation({
                      userId: row.id,
                      displayName,
                      mode: "restore"
                    })
                  }
                >
                  {t("admin.users.action.restore")}
                </Button>
              ) : (
                <IconButton
                  ariaLabel={t("admin.users.action.archive")}
                  onClick={() =>
                    setConfirmation({
                      userId: row.id,
                      displayName,
                      mode: "archive"
                    })
                  }
                >
                  <ArchiveIcon />
                </IconButton>
              )}

              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  openResetModal({
                    userId: row.id,
                    displayName,
                    isArchived: row.isArchived,
                    isSelf
                  })
                }
                disabled={row.isArchived}
              >
                {t("admin.users.action.resetPassword")}
              </Button>

              <Button
                size="sm"
                variant="secondary"
                onClick={() => void handleToggleMfaEnforced(row.id, !row.mfaEnforced)}
                disabled={row.isArchived}
              >
                {row.mfaEnforced ? t("admin.users.action.mfaEnforceOff") : t("admin.users.action.mfaEnforceOn")}
              </Button>

              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  if (window.confirm(t("admin.users.action.resetMfaConfirm").replace("{name}", displayName))) {
                    void handleResetMfa(row.id);
                  }
                }}
                disabled={row.isArchived}
              >
                {t("admin.users.action.resetMfa")}
              </Button>

              {rowLocked && !row.isArchived ? (
                <Button size="sm" variant="ghost" onClick={() => void handleUnlock(row.id)}>
                  {t("admin.users.action.unlock")}
                </Button>
              ) : null}
            </div>
          );
        }}
      />

      <Card>
        <div className="tableActions">
          <span className="placeholderText">
            {t("admin.users.pagination.summary")
              .replace("{page}", String(page))
              .replace("{pages}", String(totalPages))
              .replace("{total}", String(total))}
          </span>

          <Select
            options={[
              { value: "10", label: t("admin.users.pagination.pageSize.10") },
              { value: "20", label: t("admin.users.pagination.pageSize.20") },
              { value: "50", label: t("admin.users.pagination.pageSize.50") }
            ]}
            value={String(pageSize)}
            onChange={(event) => {
              const next = Number.parseInt(event.target.value, 10);
              setPage(1);
              setPageSize(Number.isFinite(next) ? next : 20);
            }}
          />

          <Button
            size="sm"
            variant="secondary"
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            disabled={page <= 1 || isLoading}
          >
            {t("pagination.prev")}
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setPage((prev) => Math.min(totalPages, prev + 1))}
            disabled={page >= totalPages || isLoading}
          >
            {t("pagination.next")}
          </Button>
        </div>
      </Card>

      <Modal
        open={modalOpen}
        onClose={closeModal}
        closeAriaLabel={t("modal.close")}
        header={editingId ? t("admin.users.modal.edit") : t("admin.users.modal.new")}
        footer={
          <div className="modalFooter">
            <Button variant="secondary" onClick={closeModal}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleSave} disabled={isSaveDisabled}>
              {isSubmitting ? t("admin.users.saving") : t("common.save")}
            </Button>
          </div>
        }
      >
        <div className="modalForm">
          <div className="formField">
            <span className="fieldLabel">{t("users.firstName")}</span>
            <Input
              placeholder={t("users.firstName")}
              value={form.firstName}
              onChange={(event) => setForm((prev) => ({ ...prev, firstName: event.target.value }))}
              disabled={isSubmitting}
            />
          </div>

          <div className="formField">
            <span className="fieldLabel">{t("users.lastName")}</span>
            <Input
              placeholder={t("users.lastName")}
              value={form.lastName}
              onChange={(event) => setForm((prev) => ({ ...prev, lastName: event.target.value }))}
              disabled={isSubmitting}
            />
          </div>

          <div className="formField">
            <span className="fieldLabel">{t("users.email")}</span>
            <Input
              placeholder={t("users.email")}
              value={form.email}
              onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
              disabled={isSubmitting}
            />
          </div>

          <div className="formField">
            <span className="fieldLabel">{t("users.phone")}</span>
            <Input
              placeholder={t("users.phone")}
              value={form.phone}
              onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
              disabled={isSubmitting}
            />
          </div>

          <div className="formField">
            <span className="fieldLabel">{t("admin.users.form.role")}</span>
            <Select
              options={formRoleOptions}
              value={form.role}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  role: event.target.value
                }))
              }
              disabled={isSubmitting}
            />
          </div>

          <div className="formField">
            <span className="fieldLabel">{t("admin.users.form.type")}</span>
            <Select
              options={[
                { value: "INTERNAL", label: t("users.type.internal") },
                { value: "EXTERNAL", label: t("users.type.external") }
              ]}
              value={form.type}
              onChange={(event) =>
                setForm((prev) => ({
                  ...prev,
                  type: event.target.value as UserType,
                  externalOrgId: event.target.value === "EXTERNAL" ? prev.externalOrgId : ""
                }))
              }
              disabled={isSubmitting}
            />
          </div>

          <div className="formField">
            <span className="fieldLabel">{t("admin.users.form.titleOrPosition")}</span>
            <Input
              placeholder={t("admin.users.form.titleOrPosition")}
              value={form.titleOrPosition}
              onChange={(event) => setForm((prev) => ({ ...prev, titleOrPosition: event.target.value }))}
              disabled={isSubmitting}
            />
          </div>

          {form.type === "EXTERNAL" ? (
            <div className="formField">
              <div className="formFieldHeader">
                <span className="fieldLabel">{t("admin.users.form.externalOrg")}</span>
                <Button
                  size="sm"
                  variant="ghost"
                  className="fieldActionButton"
                  onClick={openQuickAddExternalOrg}
                  disabled={isSubmitting}
                >
                  {t("admin.users.externalOrg.quickAdd")}
                </Button>
              </div>
              <Select
                options={externalOrgOptions}
                value={form.externalOrgId}
                onChange={(event) => setForm((prev) => ({ ...prev, externalOrgId: event.target.value }))}
                disabled={isSubmitting}
              />
            </div>
          ) : null}

          <div className="formField">
            <span className="fieldLabel">{t("admin.users.form.notes")}</span>
            <textarea
              className="textarea"
              rows={3}
              placeholder={t("admin.users.form.notes")}
              value={form.notes}
              onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
              disabled={isSubmitting}
            />
          </div>

          {!editingId ? (
            <div className="formField">
              <span className="fieldLabel">Initialzugang</span>
              <Select
                options={[
                  { value: "link", label: "Reset-Link erzeugen" },
                  { value: "manual", label: "Temporaeres Passwort setzen" },
                  { value: "auto", label: "Temporaeres Passwort generieren" }
                ]}
                value={form.passwordMode}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    passwordMode: event.target.value as PasswordMode,
                    initialPassword: event.target.value === "manual" ? prev.initialPassword : ""
                  }))
                }
                disabled={isSubmitting}
              />
              {form.passwordMode === "manual" ? (
                <>
                  <Input
                    type="password"
                    placeholder={t("admin.users.form.initialPassword")}
                    value={form.initialPassword}
                    onChange={(event) =>
                      setForm((prev) => ({ ...prev, initialPassword: event.target.value }))
                    }
                    disabled={isSubmitting}
                  />
                  <p className="placeholderText">Das Passwort wird nur beim Anlegen verwendet und der Benutzer muss es beim naechsten Login aendern.</p>
                </>
              ) : form.passwordMode === "auto" ? (
                <p className="placeholderText">Es wird ein sicheres temporaeres Passwort generiert und einmalig angezeigt.</p>
              ) : (
                <p className="placeholderText">{t("admin.users.form.initialPasswordHint")}</p>
              )}
            </div>
          ) : (
            <div className="formField">
              <span className="fieldLabel">Passwortwechsel beim naechsten Login</span>
              <Select
                options={[
                  { value: "false", label: "Nein" },
                  { value: "true", label: "Ja" }
                ]}
                value={String(form.mustChangePassword)}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    mustChangePassword: event.target.value === "true"
                  }))
                }
                disabled={isSubmitting}
              />
            </div>
          )}

          {formError ? <p className="validationText">{formError}</p> : null}
        </div>
      </Modal>

      <Modal
        open={Boolean(confirmation)}
        onClose={() => setConfirmation(null)}
        closeAriaLabel={t("modal.close")}
        header={
          confirmation?.mode === "archive"
            ? t("admin.users.confirm.archive.title")
            : t("admin.users.confirm.restore.title")
        }
        footer={
          <div className="modalFooter">
            <Button variant="secondary" onClick={() => setConfirmation(null)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleConfirmArchiveRestore} disabled={isConfirmSubmitting}>
              {isConfirmSubmitting ? t("admin.users.confirm.pending") : t("common.confirm")}
            </Button>
          </div>
        }
      >
        <p className="placeholderText">
          {confirmation?.mode === "archive"
            ? t("admin.users.confirm.archive.text").replace("{name}", confirmation?.displayName ?? "")
            : t("admin.users.confirm.restore.text").replace("{name}", confirmation?.displayName ?? "")}
        </p>
      </Modal>

      <Modal
        open={Boolean(resetState)}
        onClose={() => setResetState(null)}
        closeAriaLabel={t("modal.close")}
        header={t("admin.users.reset.modal.title")}
        footer={
          <div className="modalFooter">
            <Button variant="secondary" onClick={() => setResetState(null)}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleResetPassword}
              disabled={isResetSubmitting || Boolean(resetState?.isArchived)}
            >
              {isResetSubmitting ? t("admin.users.reset.pending") : t("admin.users.action.resetPassword")}
            </Button>
          </div>
        }
      >
        <div className="modalForm">
          <p className="placeholderText">
            {t("admin.users.reset.modal.description").replace("{name}", resetState?.displayName ?? "")}
          </p>

          {resetState?.isSelf ? <p className="placeholderText">{t("admin.users.reset.modal.selfWarning")}</p> : null}
          {resetState?.isArchived ? <p className="validationText">{t("admin.users.reset.error.archived")}</p> : null}

          {resetState ? (
            <div className="formField">
              <span className="fieldLabel">Reset-Modus</span>
              <Select
                options={[
                  { value: "link", label: "Reset-Link erzeugen" },
                  { value: "manual", label: "Temporaeres Passwort setzen" },
                  { value: "auto", label: "Temporaeres Passwort generieren" }
                ]}
                value={resetState.passwordMode}
                onChange={(event) =>
                  setResetState((prev) =>
                    prev
                      ? {
                          ...prev,
                          passwordMode: event.target.value as PasswordMode,
                          temporaryPassword: event.target.value === "manual" ? prev.temporaryPassword : ""
                        }
                      : prev
                  )
                }
                disabled={isResetSubmitting || Boolean(resetState.isArchived)}
              />
            </div>
          ) : null}

          {resetState?.passwordMode === "manual" ? (
            <div className="formField">
              <span className="fieldLabel">Temporaeres Passwort</span>
              <Input
                type="password"
                value={resetState.temporaryPassword}
                onChange={(event) =>
                  setResetState((prev) =>
                    prev
                      ? {
                          ...prev,
                          temporaryPassword: event.target.value
                        }
                      : prev
                  )
                }
                disabled={isResetSubmitting || Boolean(resetState.isArchived)}
              />
            </div>
          ) : null}

          {resetDevValue ? (
            <div className="formField">
              <span className="fieldLabel">{t("admin.users.reset.devValue")}</span>
              <Input value={resetDevValue} disabled />
              <Button size="sm" variant="ghost" onClick={() => void copyValue(resetDevValue)}>
                {t("admin.users.reset.copy")}
              </Button>
            </div>
          ) : null}

          {resetError ? <p className="validationText">{resetError}</p> : null}
        </div>
      </Modal>

      <Modal
        open={externalOrgQuickModalOpen}
        onClose={() => setExternalOrgQuickModalOpen(false)}
        closeAriaLabel={t("modal.close")}
        header={t("admin.users.externalOrg.quickAddTitle")}
        footer={
          <div className="modalFooter">
            <Button variant="secondary" onClick={() => setExternalOrgQuickModalOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button onClick={handleCreateQuickExternalOrg} disabled={isExternalOrgQuickSubmitting}>
              {isExternalOrgQuickSubmitting ? t("admin.users.externalOrg.quickAddPending") : t("common.save")}
            </Button>
          </div>
        }
      >
        <div className="modalForm">
          <div className="formField">
            <span className="fieldLabel">{t("admin.externalOrgs.form.name")}</span>
            <Input
              value={externalOrgQuickForm.name}
              onChange={(event) =>
                setExternalOrgQuickForm((prev) => ({ ...prev, name: event.target.value }))
              }
              disabled={isExternalOrgQuickSubmitting}
            />
          </div>

          <div className="formField">
            <span className="fieldLabel">{t("admin.externalOrgs.form.type")}</span>
            <Input
              value={externalOrgQuickForm.type}
              onChange={(event) =>
                setExternalOrgQuickForm((prev) => ({ ...prev, type: event.target.value }))
              }
              disabled={isExternalOrgQuickSubmitting}
            />
          </div>

          <div className="formField">
            <span className="fieldLabel">{t("admin.externalOrgs.form.phone")}</span>
            <Input
              value={externalOrgQuickForm.phone}
              onChange={(event) =>
                setExternalOrgQuickForm((prev) => ({ ...prev, phone: event.target.value }))
              }
              disabled={isExternalOrgQuickSubmitting}
            />
          </div>

          <div className="formField">
            <span className="fieldLabel">{t("admin.externalOrgs.form.email")}</span>
            <Input
              value={externalOrgQuickForm.email}
              onChange={(event) =>
                setExternalOrgQuickForm((prev) => ({ ...prev, email: event.target.value }))
              }
              disabled={isExternalOrgQuickSubmitting}
            />
          </div>

          <div className="formField">
            <span className="fieldLabel">{t("admin.externalOrgs.form.address")}</span>
            <textarea
              className="textarea"
              rows={3}
              value={externalOrgQuickForm.address}
              onChange={(event) =>
                setExternalOrgQuickForm((prev) => ({ ...prev, address: event.target.value }))
              }
              disabled={isExternalOrgQuickSubmitting}
            />
          </div>

          {externalOrgQuickError ? <p className="validationText">{externalOrgQuickError}</p> : null}
        </div>
      </Modal>
    </div>
  );
}
