import React, { useMemo } from "react";
import { Select } from "@nemetz/ui";
import { t, type I18nKey } from "../i18n";
import { getUserDisplayName } from "../data/users";
import { useUsers } from "../state/UsersStore";

type UserSelectProps = {
  value?: string | null;
  onChange: (userId: string | null) => void;
  includeExternal?: boolean;
  includeInternal?: boolean;
  allowArchivedCurrentValue?: boolean;
  placeholderKey?: I18nKey;
  disabled?: boolean;
};

function buildUserOptionLabel(input: {
  name: string;
  roleLabel: string;
  isExternal: boolean;
  isArchived: boolean;
  externalOrgName?: string;
}) {
  const typeLabel = input.isExternal ? t("users.type.external") : t("users.type.internal");
  const base = input.isExternal && input.externalOrgName
    ? `${input.name} (${typeLabel} • ${input.externalOrgName})`
    : `${input.name} (${input.roleLabel || typeLabel} • ${typeLabel})`;
  if (input.isArchived) {
    return `${base} (${t("users.archived")})`;
  }
  return base;
}

function matchesTypeFilter(input: {
  isExternal: boolean;
  includeExternal: boolean;
  includeInternal: boolean;
}) {
  if (input.isExternal && !input.includeExternal) {
    return false;
  }
  if (!input.isExternal && !input.includeInternal) {
    return false;
  }
  return true;
}

export default function UserSelect({
  value,
  onChange,
  includeExternal = true,
  includeInternal = true,
  allowArchivedCurrentValue = true,
  placeholderKey = "common.notAssigned",
  disabled
}: UserSelectProps) {
  const { getUser, listActiveUsers } = useUsers();

  const options = useMemo(() => {
    const activeUsers = listActiveUsers({ includeExternal, includeInternal });
    const selectedUser = value ? getUser(value) : undefined;
    const rows = [...activeUsers];

    if (
      allowArchivedCurrentValue &&
      selectedUser &&
      matchesTypeFilter({
        isExternal: selectedUser.isExternal || selectedUser.type === "EXTERNAL",
        includeExternal,
        includeInternal
      }) &&
      !rows.some((user) => user.id === selectedUser.id)
    ) {
      rows.push(selectedUser);
    }

    const mapped = rows.map((user) => ({
      value: user.id,
      label: buildUserOptionLabel({
        name: getUserDisplayName(user),
        roleLabel: user.companyRole || user.role,
        isExternal: user.isExternal,
        isArchived: user.isArchived,
        externalOrgName: user.externalOrgName || user.externalCompany
      })
    }));

    if (allowArchivedCurrentValue && value && !selectedUser) {
      mapped.push({
        value,
        label: t("users.unknown")
      });
    }

    return [{ value: "", label: t(placeholderKey) }, ...mapped];
  }, [
    allowArchivedCurrentValue,
    getUser,
    includeExternal,
    includeInternal,
    listActiveUsers,
    placeholderKey,
    value
  ]);

  return (
    <Select
      options={options}
      value={value ?? ""}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value || null)}
    />
  );
}
