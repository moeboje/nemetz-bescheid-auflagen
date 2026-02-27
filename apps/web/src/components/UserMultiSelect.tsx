import React, { useMemo, useState } from "react";
import { Input, Select } from "@nemetz/ui";
import { t, type I18nKey } from "../i18n";
import { getUserDisplayName } from "../data/users";
import { useUsers } from "../state/UsersStore";

type UserMultiSelectProps = {
  value: string[];
  onChange: (next: string[]) => void;
  includeExternal?: boolean;
  includeInternal?: boolean;
  allowArchivedCurrentValue?: boolean;
  showSearch?: boolean;
  searchPlaceholderKey?: I18nKey;
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

export default function UserMultiSelect({
  value,
  onChange,
  includeExternal = true,
  includeInternal = true,
  allowArchivedCurrentValue = true,
  showSearch = false,
  searchPlaceholderKey = "common.search",
  disabled
}: UserMultiSelectProps) {
  const { getUser, listActiveUsers } = useUsers();
  const [search, setSearch] = useState("");

  const options = useMemo(() => {
    const activeUsers = listActiveUsers({ includeExternal, includeInternal });
    const byId = new Map(activeUsers.map((user) => [user.id, user] as const));

    if (allowArchivedCurrentValue) {
      value.forEach((userId) => {
        if (byId.has(userId)) {
          return;
        }
        const selected = getUser(userId);
        if (selected) {
          byId.set(selected.id, selected);
        }
      });
    }

    const query = search.trim().toLowerCase();
    const mapped = Array.from(byId.values())
      .map((user) => ({
        value: user.id,
        label: buildUserOptionLabel({
          name: getUserDisplayName(user),
          roleLabel: user.companyRole || user.role,
          isExternal: user.isExternal,
          isArchived: user.isArchived,
          externalOrgName: user.externalOrgName || user.externalCompany
        })
      }))
      .filter((option) =>
        query ? option.label.toLowerCase().includes(query) : true
      );

    if (allowArchivedCurrentValue) {
      value.forEach((userId) => {
        if (getUser(userId)) {
          return;
        }
        if (!mapped.some((option) => option.value === userId)) {
          mapped.push({
            value: userId,
            label: t("users.unknown")
          });
        }
      });
    }

    return mapped;
  }, [
    allowArchivedCurrentValue,
    getUser,
    includeExternal,
    includeInternal,
    listActiveUsers,
    search,
    value
  ]);

  return (
    <div className="modalForm">
      {showSearch ? (
        <Input
          placeholder={t(searchPlaceholderKey)}
          value={search}
          disabled={disabled}
          onChange={(event) => setSearch(event.target.value)}
        />
      ) : null}
      <Select
        multiple
        options={options}
        value={value}
        disabled={disabled}
        onChange={(event) => {
          const nextValues = Array.from(event.currentTarget.selectedOptions).map(
            (option) => option.value
          );
          onChange(nextValues);
        }}
      />
    </div>
  );
}
