import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate } from "react-router-dom";
import { Badge, Button, Card, DataTable, IconButton, Input, Modal, Select } from "@nemetz/ui";
import { ApiError } from "../api/client";
import { getPasswordPolicy, type PasswordPolicy } from "../api/auth";
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
type CreatePasswordMode = "link" | "manual" | "auto";
type ResetPasswordMode = CreatePasswordMode | "direct";

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
  passwordMode: CreatePasswordMode;
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
  email: string;
  isArchived: boolean;
  isSelf: boolean;
  passwordMode: ResetPasswordMode;
  temporaryPassword: string;
  newPassword: string;
  confirmPassword: string;
  mustChangePassword: boolean;
};

type ExternalOrgQuickForm = {
  name: string;
  type: string;
  phone: string;
  email: string;
  address: string;
};

const DEFAULT_EXTERNAL_ORG_TYPE = "Firma";
const POST_MUTATION_REFRESH = { force: true, reason: "postMutation" } as const;

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
  type: DEFAULT_EXTERNAL_ORG_TYPE,
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

const NUMBER_OR_SPECIAL_PATTERN = /[0-9]|[^A-Za-z0-9]/;

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

function formatPasswordPolicyHint(policy: PasswordPolicy | null) {
  if (!policy) {
    return "";
  }

  const numberOrSpecialHint = policy.passwordRequireNumberOrSpecial
    ? t("admin.users.password.policyHint.requireNumberOrSpecial")
    : "";

  return t("admin.users.password.policyHint")
    .replace("{minLength}", String(policy.passwordMinLength))
    .replace("{numberOrSpecialHint}", numberOrSpecialHint);
}

function getManagedPasswordValidationError(password: string, policy: PasswordPolicy | null) {
  const normalized = password.trim();
  if (!normalized || !policy) {
    return "";
  }

  if (normalized.length < policy.passwordMinLength) {
    return t("admin.users.validation.passwordPolicy");
  }

  if (policy.passwordRequireNumberOrSpecial && !NUMBER_OR_SPECIAL_PATTERN.test(normalized)) {
    return t("admin.users.validation.passwordPolicy");
  }

  return "";
}

function getApiErrorDetails(error: unknown) {
  if (!(error instanceof ApiError)) {
    return null;
  }

  const payload =
    error.payload && typeof error.payload === "object" && !Array.isArray(error.payload)
      ? (error.payload as Record<string, unknown>)
      : null;
  const errorCode = typeof payload?.errorCode === "string" ? payload.errorCode.trim() : "";
  const message =
    typeof payload?.message === "string"
      ? payload.message.trim()
      : typeof error.message === "string"
        ? error.message.trim()
        : "";

  return {
    status: error.status,
    errorCode,
    message
  };
}

function extractUserAdminErrorMessage(
  error: unknown,
  fallbackKey: string,
  options: {
    emailConflictKey?: string;
    externalOrgConflictKey?: string;
  } = {}
) {
  const details = getApiErrorDetails(error);
  if (!details) {
    return t(fallbackKey);
  }

  if (
    options.emailConflictKey &&
    (details.errorCode === "USER_EMAIL_CONFLICT" || /email already exists/i.test(details.message))
  ) {
    return t(options.emailConflictKey);
  }

  if (
    options.externalOrgConflictKey &&
    (details.errorCode === "EXTERNAL_ORG_CONFLICT" || /external organization already exists/i.test(details.message))
  ) {
    return t(options.externalOrgConflictKey);
  }

  if (/known placeholder passwords are not allowed/i.test(details.message)) {
    return t("admin.users.validation.passwordPlaceholder");
  }

  if (
    /password must be at least/i.test(details.message) ||
    /password must include at least one number or special character/i.test(details.message)
  ) {
    return t("admin.users.validation.passwordPolicy");
  }

  if (/admins must use personal security settings/i.test(details.message)) {
    return t("admin.users.reset.error.self");
  }

  if (details.message) {
    return details.message;
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
    unlockUser
  } = useUsers();
  const { roles, reloadRoles } = useRoles();
  const { externalOrgs, createExternalOrg, reloadExternalOrgs } = useExternalOrgs();

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
  const [passwordPolicy, setPasswordPolicy] = useState<PasswordPolicy | null>(null);
  const fetchUsersSeqRef = useRef(0);

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
  const [isExternalOrgsLoading, setIsExternalOrgsLoading] = useState(false);

  const totalPages = Math.max(1, Math.ceil(total / Math.max(pageSize, 1)));
  const passwordPolicyHint = useMemo(() => formatPasswordPolicyHint(passwordPolicy), [passwordPolicy]);
  const canManageUsers = permissions.canManageUsersAdmin;
  const canManageExternalOrgs = permissions.canManageExternalOrgsAdmin;

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

  const ensureExternalOrgs = useCallback(async () => {
    if (!permissions.canViewUsersAdmin || !canManageUsers) {
      return [];
    }

    setIsExternalOrgsLoading(true);
    try {
      return await reloadExternalOrgs();
    } finally {
      setIsExternalOrgsLoading(false);
    }
  }, [canManageUsers, permissions.canViewUsersAdmin, reloadExternalOrgs]);

  const fetchUsers = useCallback(async (options: { force?: boolean; reason?: string } = {}) => {
    const requestSeq = fetchUsersSeqRef.current + 1;
    fetchUsersSeqRef.current = requestSeq;
    setIsLoading(true);
    setLoadError("");

    try {
      const response = await loadAdminUsers(query, options);
      if (fetchUsersSeqRef.current !== requestSeq) {
        return;
      }
      setRows(response.items);
      setTotal(response.total);

      const maxPages = Math.max(1, Math.ceil(response.total / Math.max(response.pageSize, 1)));
      if (response.page > maxPages) {
        setPage(maxPages);
      }
    } catch {
      if (fetchUsersSeqRef.current === requestSeq) {
        setLoadError(t("admin.users.error.load"));
      }
    } finally {
      if (fetchUsersSeqRef.current === requestSeq) {
        setIsLoading(false);
      }
    }
  }, [loadAdminUsers, query]);

  useEffect(() => {
    void fetchUsers();
  }, [fetchUsers]);

  useEffect(() => {
    if (!permissions.canViewUsersAdmin) {
      return;
    }

    void reloadRoles({ force: true }).catch(() => {
      // The page keeps fallback role labels if the lookup is unavailable.
    });
  }, [permissions.canViewUsersAdmin, reloadRoles]);

  useEffect(() => {
    if (!canManageUsers) {
      setPasswordPolicy(null);
      return;
    }

    let active = true;
    void getPasswordPolicy()
      .then((policy) => {
        if (active) {
          setPasswordPolicy(policy);
        }
      })
      .catch(() => {
        if (active) {
          setPasswordPolicy(null);
        }
      });

    return () => {
      active = false;
    };
  }, [canManageUsers]);

  useEffect(() => {
    if (!modalOpen || form.type !== "EXTERNAL") {
      return;
    }

    void ensureExternalOrgs();
  }, [ensureExternalOrgs, form.type, modalOpen]);

  if (!permissions.canViewUsersAdmin) {
    return <Navigate to="/compliance/dashboard" replace />;
  }

  const clearTransientMessages = () => {
    setSuccessMessage("");
    setLoadError("");
    setInviteDevValue("");
  };

  const openCreateModal = () => {
    if (!canManageUsers) {
      return;
    }
    setForm(emptyForm);
    setEditingId(null);
    setFormError("");
    setModalOpen(true);
    clearTransientMessages();
    setResetError("");
  };

  const openEditModal = (userId: string) => {
    if (!canManageUsers) {
      return;
    }
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
    if (user.type === "EXTERNAL") {
      void ensureExternalOrgs();
    }
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
      return t("admin.users.validation.initialPasswordRequired");
    }

    if (!editingId && form.passwordMode === "manual") {
      const passwordValidationError = getManagedPasswordValidationError(form.initialPassword, passwordPolicy);
      if (passwordValidationError) {
        return passwordValidationError;
      }
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

        const devValue = created.temporaryPassword || created.resetLink || "";
        setInviteDevValue(devValue);

        setSuccessMessage(
          created.notificationStatus === "FAILED"
            ? t("admin.users.success.createdInviteDispatchFailed")
            : created.temporaryPassword
            ? t("admin.users.success.createdTemporaryPassword")
            : created.user.invitedAt
              ? t("admin.users.success.createdInvite")
              : t("admin.users.success.created")
        );
      }

      await fetchUsers(POST_MUTATION_REFRESH);
      closeModal();
    } catch (error) {
      setFormError(
        extractUserAdminErrorMessage(error, "admin.users.error.save", {
          emailConflictKey: "users.validation.uniqueEmail"
        })
      );
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

      await fetchUsers(POST_MUTATION_REFRESH);
      setConfirmation(null);
    } catch (error) {
      setLoadError(extractUserAdminErrorMessage(error, "admin.users.error.action"));
    } finally {
      setIsConfirmSubmitting(false);
    }
  };

  const openResetModal = (input: { userId: string; displayName: string; email: string; isArchived: boolean; isSelf: boolean }) => {
    setResetState({
      ...input,
      passwordMode: "direct",
      temporaryPassword: "",
      newPassword: "",
      confirmPassword: "",
      mustChangePassword: true
    });
    setResetError("");
    setResetDevValue("");
    setSuccessMessage("");
  };

  const closeResetModal = () => {
    setResetState(null);
    setResetError("");
    setResetDevValue("");
  };

  const getResetValidationError = useCallback(
    (state: ResetState | null) => {
      if (!state) {
        return "";
      }

      if (state.isArchived) {
        return t("admin.users.reset.error.archived");
      }

      if (state.isSelf) {
        return t("admin.users.reset.error.self");
      }

      if (!state.email.trim() || !isValidEmail(state.email.trim())) {
        return t("admin.users.reset.error.emailMissing");
      }

      if (state.passwordMode === "manual") {
        if (!state.temporaryPassword.trim()) {
          return t("admin.users.reset.error.temporaryPasswordRequired");
        }

        const passwordValidationError = getManagedPasswordValidationError(state.temporaryPassword, passwordPolicy);
        if (passwordValidationError) {
          return passwordValidationError;
        }

        return "";
      }

      if (state.passwordMode === "auto" || state.passwordMode === "link") {
        return "";
      }

      if (!state.newPassword || !state.confirmPassword) {
        return t("admin.users.reset.error.required");
      }

      if (state.newPassword !== state.confirmPassword) {
        return t("admin.users.reset.error.mismatch");
      }

      const passwordValidationError = getManagedPasswordValidationError(state.newPassword, passwordPolicy);
      if (passwordValidationError) {
        return passwordValidationError;
      }

      return "";
    },
    [passwordPolicy]
  );

  const handleResetPassword = async () => {
    if (!resetState) {
      return;
    }

    const validationError = getResetValidationError(resetState);
    if (validationError) {
      setResetError(validationError);
      return;
    }

    setIsResetSubmitting(true);
    setResetError("");
    setSuccessMessage("");
    setResetDevValue("");

    try {
      const result = await requestReset(resetState.userId, {
        passwordMode: resetState.passwordMode,
        temporaryPassword:
          resetState.passwordMode === "manual" ? resetState.temporaryPassword.trim() || undefined : undefined,
        newPassword: resetState.passwordMode === "direct" ? resetState.newPassword : undefined,
        mustChangePassword: resetState.passwordMode === "direct" ? resetState.mustChangePassword : undefined
      });

      if (resetState.passwordMode === "direct") {
        setSuccessMessage(t("admin.users.reset.success"));
        await fetchUsers(POST_MUTATION_REFRESH);
        closeResetModal();
        return;
      }

      const devValue = result.temporaryPassword || result.resetLink || "";
      setResetDevValue(devValue);
      setSuccessMessage(
        result.temporaryPassword
          ? t("admin.users.reset.successWithTemporaryPassword")
          : result.resetLink
            ? t("admin.users.reset.successWithLink").replace("{link}", result.resetLink)
            : t("admin.users.reset.success")
      );

      await fetchUsers(POST_MUTATION_REFRESH);
    } catch (error) {
      setResetError(extractUserAdminErrorMessage(error, "admin.users.reset.error"));
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
      await fetchUsers(POST_MUTATION_REFRESH);
    } catch (error) {
      setLoadError(extractUserAdminErrorMessage(error, "admin.users.error.action"));
    }
  };

  const handleToggleMfaEnforced = async (userId: string, enforced: boolean) => {
    setLoadError("");
    setSuccessMessage("");

    try {
      await setMfaEnforced(userId, enforced);
      setSuccessMessage(enforced ? t("admin.users.mfa.enforcedOn") : t("admin.users.mfa.enforcedOff"));
      await fetchUsers(POST_MUTATION_REFRESH);
    } catch (error) {
      setLoadError(extractUserAdminErrorMessage(error, "admin.users.error.action"));
    }
  };

  const handleResetMfa = async (userId: string) => {
    setLoadError("");
    setSuccessMessage("");

    try {
      await resetMfa(userId);
      setSuccessMessage(t("admin.users.mfa.resetSuccess"));
      await fetchUsers(POST_MUTATION_REFRESH);
    } catch (error) {
      setLoadError(extractUserAdminErrorMessage(error, "admin.users.error.action"));
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
    if (!canManageExternalOrgs) {
      return;
    }
    void ensureExternalOrgs();
    setExternalOrgQuickError("");
    setExternalOrgQuickForm(emptyExternalOrgQuickForm);
    setExternalOrgQuickModalOpen(true);
  };

  const validateQuickExternalOrg = () => {
    if (!externalOrgQuickForm.name.trim()) {
      return t("admin.externalOrgs.validation.required");
    }
    if (externalOrgQuickForm.email.trim() && !isValidEmail(externalOrgQuickForm.email.trim())) {
      return t("admin.externalOrgs.validation.email");
    }
    return "";
  };

  const handleCreateQuickExternalOrg = async () => {
    if (!canManageExternalOrgs) {
      return;
    }

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
        type: externalOrgQuickForm.type.trim() || DEFAULT_EXTERNAL_ORG_TYPE,
        phone: externalOrgQuickForm.phone.trim() || undefined,
        email: externalOrgQuickForm.email.trim() || undefined,
        address: externalOrgQuickForm.address.trim() || undefined
      });

      setForm((prev) => ({ ...prev, externalOrgId: created.id }));
      setExternalOrgQuickModalOpen(false);
      setSuccessMessage(t("admin.users.externalOrg.quickAddSuccess"));
    } catch (error) {
      setExternalOrgQuickError(
        extractUserAdminErrorMessage(error, "admin.externalOrgs.error.create", {
          externalOrgConflictKey: "admin.externalOrgs.validation.uniqueName"
        })
      );
    } finally {
      setIsExternalOrgQuickSubmitting(false);
    }
  };

  return (
    <div className="page">
      <div className="pageHeader">
        <h1 className="pageTitle">{t("admin.users.title")}</h1>
        {canManageUsers ? <Button onClick={openCreateModal}>{t("admin.users.action.new")}</Button> : null}
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
            key: "failedLogins",
            header: t("admin.users.table.failedLogins"),
            render: (row: (typeof rows)[number]) => String(row.failedLoginCount ?? 0)
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
                return <Badge variant="warning">{t("admin.users.status.passwordChangeRequired")}</Badge>;
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
          if (!canManageUsers) {
            return null;
          }

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
                    email: row.email,
                    isArchived: row.isArchived,
                    isSelf
                  })
                }
                disabled={row.isArchived || isSelf}
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
              onChange={(event) => {
                const nextType = event.target.value as UserType;
                setForm((prev) => ({
                  ...prev,
                  type: nextType,
                  externalOrgId: nextType === "EXTERNAL" ? prev.externalOrgId : ""
                }));
                if (nextType === "EXTERNAL") {
                  void ensureExternalOrgs();
                }
              }}
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
                {canManageExternalOrgs ? (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="fieldActionButton"
                    onClick={openQuickAddExternalOrg}
                    disabled={isSubmitting}
                  >
                    {t("admin.users.externalOrg.quickAdd")}
                  </Button>
                ) : null}
              </div>
              <Select
                options={externalOrgOptions}
                value={form.externalOrgId}
                onChange={(event) => setForm((prev) => ({ ...prev, externalOrgId: event.target.value }))}
                disabled={isSubmitting || isExternalOrgsLoading}
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
              <span className="fieldLabel">{t("admin.users.form.initialAccess")}</span>
              <Select
                options={[
                  { value: "link", label: t("admin.users.form.passwordMode.link") },
                  { value: "manual", label: t("admin.users.form.passwordMode.manual") },
                  { value: "auto", label: t("admin.users.form.passwordMode.auto") }
                ]}
                value={form.passwordMode}
                onChange={(event) =>
                  setForm((prev) => ({
                    ...prev,
                    passwordMode: event.target.value as CreatePasswordMode,
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
                  <p className="placeholderText">{t("admin.users.form.manualPasswordHint")}</p>
                  {passwordPolicyHint ? <p className="placeholderText">{passwordPolicyHint}</p> : null}
                </>
              ) : form.passwordMode === "auto" ? (
                <p className="placeholderText">{t("admin.users.form.autoPasswordHint")}</p>
              ) : (
                <p className="placeholderText">{t("admin.users.form.initialPasswordHint")}</p>
              )}
            </div>
          ) : (
            <div className="formField">
              <span className="fieldLabel">{t("admin.users.form.mustChangePasswordOnNextLogin")}</span>
              <Select
                options={[
                  { value: "false", label: t("common.no") },
                  { value: "true", label: t("common.yes") }
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
        onClose={closeResetModal}
        closeAriaLabel={t("modal.close")}
        header={t("admin.users.reset.modal.title")}
        footer={
          <div className="modalFooter">
            <Button variant="secondary" onClick={closeResetModal}>
              {t("common.cancel")}
            </Button>
            <Button
              onClick={handleResetPassword}
              disabled={isResetSubmitting || Boolean(getResetValidationError(resetState))}
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

          <div className="formField">
            <span className="fieldLabel">{t("admin.users.reset.modal.email")}</span>
            <Input value={resetState?.email ?? ""} disabled />
          </div>

          {resetState?.isSelf ? <p className="validationText">{t("admin.users.reset.error.self")}</p> : null}
          {resetState?.isArchived ? <p className="validationText">{t("admin.users.reset.error.archived")}</p> : null}

          {resetState ? (
            <div className="formField">
              <span className="fieldLabel">{t("admin.users.reset.mode")}</span>
              <Select
                options={[
                  { value: "direct", label: t("admin.users.reset.mode.direct") },
                  { value: "link", label: t("admin.users.form.passwordMode.link") },
                  { value: "manual", label: t("admin.users.form.passwordMode.manual") },
                  { value: "auto", label: t("admin.users.form.passwordMode.auto") }
                ]}
                value={resetState.passwordMode}
                onChange={(event) => {
                  setResetError("");
                  setResetDevValue("");
                  setResetState((prev) =>
                    prev
                      ? {
                          ...prev,
                          passwordMode: event.target.value as ResetPasswordMode,
                          temporaryPassword: event.target.value === "manual" ? prev.temporaryPassword : "",
                          newPassword: event.target.value === "direct" ? prev.newPassword : "",
                          confirmPassword: event.target.value === "direct" ? prev.confirmPassword : "",
                          mustChangePassword: event.target.value === "direct" ? prev.mustChangePassword : true
                        }
                      : prev
                  );
                }}
                disabled={isResetSubmitting || Boolean(resetState.isArchived)}
              />
            </div>
          ) : null}

          {resetState?.passwordMode === "manual" ? (
            <div className="formField">
              <span className="fieldLabel">{t("admin.users.reset.temporaryPassword")}</span>
              <Input
                type="password"
                autoComplete="new-password"
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

          {resetState?.passwordMode === "direct" ? (
            <>
              {passwordPolicyHint ? <p className="placeholderText">{passwordPolicyHint}</p> : null}
              <div className="formField">
                <span className="fieldLabel">{t("auth.reset.newPassword")}</span>
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={resetState.newPassword}
                  onChange={(event) =>
                    setResetState((prev) =>
                      prev
                        ? {
                            ...prev,
                            newPassword: event.target.value
                          }
                        : prev
                    )
                  }
                  disabled={isResetSubmitting || Boolean(resetState.isArchived)}
                />
              </div>

              <div className="formField">
                <span className="fieldLabel">{t("auth.reset.confirmPassword")}</span>
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={resetState.confirmPassword}
                  onChange={(event) =>
                    setResetState((prev) =>
                      prev
                        ? {
                            ...prev,
                            confirmPassword: event.target.value
                          }
                        : prev
                    )
                  }
                  disabled={isResetSubmitting || Boolean(resetState.isArchived)}
                />
              </div>

              <label className="checkboxRow">
                <input
                  type="checkbox"
                  checked={resetState.mustChangePassword}
                  onChange={(event) =>
                    setResetState((prev) =>
                      prev
                        ? {
                            ...prev,
                            mustChangePassword: event.target.checked
                          }
                        : prev
                    )
                  }
                  disabled={isResetSubmitting || Boolean(resetState.isArchived)}
                />
                <span>{t("admin.users.reset.mustChangePassword")}</span>
              </label>
            </>
          ) : null}

          {resetState?.passwordMode === "manual" && passwordPolicyHint ? (
            <p className="placeholderText">{passwordPolicyHint}</p>
          ) : null}

          {resetState?.passwordMode === "auto" ? (
            <p className="placeholderText">{t("admin.users.form.autoPasswordHint")}</p>
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
        open={canManageExternalOrgs && externalOrgQuickModalOpen}
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
