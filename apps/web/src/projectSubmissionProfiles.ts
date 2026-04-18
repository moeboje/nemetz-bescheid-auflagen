import {
  SUBMISSION_PROFILE_KEYS,
  type ProjectSubmissionProfile,
  type SubmissionProfileKey
} from "./data/projects";
import type { I18nKey } from "./i18n";
import { t } from "./i18n";

const labelKeyByProfile: Record<SubmissionProfileKey, I18nKey> = {
  GEWERBE: "projects.submissionProfiles.gewerbe",
  AWG: "projects.submissionProfiles.awg",
  UVP_UVE: "projects.submissionProfiles.uvpUve"
};

const profileTypeByKey: Record<SubmissionProfileKey, ProjectSubmissionProfile["profileType"]> = {
  GEWERBE: "BASE",
  AWG: "ADDON",
  UVP_UVE: "ADDON"
};

const sortOrderByKey: Record<SubmissionProfileKey, number> = {
  GEWERBE: 10,
  AWG: 20,
  UVP_UVE: 30
};

export const DEFAULT_PROJECT_SUBMISSION_PROFILE_KEY: SubmissionProfileKey = "GEWERBE";

export function isSubmissionProfileKey(value: unknown): value is SubmissionProfileKey {
  return typeof value === "string" && SUBMISSION_PROFILE_KEYS.includes(value as SubmissionProfileKey);
}

export function sortSubmissionProfileKeys(keys: SubmissionProfileKey[]) {
  return [...keys].sort((left, right) => {
    if (sortOrderByKey[left] !== sortOrderByKey[right]) {
      return sortOrderByKey[left] - sortOrderByKey[right];
    }
    return left.localeCompare(right);
  });
}

export function normalizeSubmissionProfileKeys(value: unknown) {
  if (!Array.isArray(value)) {
    return [] as SubmissionProfileKey[];
  }

  const seen = new Set<SubmissionProfileKey>();
  const normalized: SubmissionProfileKey[] = [];

  value.forEach((entry) => {
    if (!isSubmissionProfileKey(entry) || seen.has(entry)) {
      return;
    }
    seen.add(entry);
    normalized.push(entry);
  });

  return sortSubmissionProfileKeys(normalized);
}

export function resolveSubmissionProfileKeysFromUnknown(input: {
  submissionProfileKeys?: unknown;
  submissionProfiles?: unknown;
}) {
  if (input.submissionProfileKeys !== undefined) {
    return normalizeSubmissionProfileKeys(input.submissionProfileKeys);
  }

  if (!Array.isArray(input.submissionProfiles)) {
    return [] as SubmissionProfileKey[];
  }

  return normalizeSubmissionProfileKeys(
    input.submissionProfiles.map((row) =>
      row && typeof row === "object" && "key" in row ? (row as { key?: unknown }).key : undefined
    )
  );
}

export function buildProjectSubmissionProfiles(
  keys: SubmissionProfileKey[],
  existingProfiles?: ProjectSubmissionProfile[]
) {
  const existingByKey = new Map(
    (existingProfiles ?? []).map((profile) => [profile.key, profile] as const)
  );

  return sortSubmissionProfileKeys(keys).map((key) => {
    const existing = existingByKey.get(key);
    return {
      key,
      label: existing?.label ?? t(labelKeyByProfile[key]),
      profileType: existing?.profileType ?? profileTypeByKey[key],
      isActive: existing?.isActive ?? true
    } satisfies ProjectSubmissionProfile;
  });
}

export function getSubmissionProfileLabel(key: SubmissionProfileKey) {
  return t(labelKeyByProfile[key]);
}

export function getProjectSubmissionBaseOptions(input?: { includeUnset?: boolean }) {
  const options = [
    {
      value: DEFAULT_PROJECT_SUBMISSION_PROFILE_KEY,
      label: getSubmissionProfileLabel(DEFAULT_PROJECT_SUBMISSION_PROFILE_KEY)
    }
  ];

  if (input?.includeUnset) {
    return [{ value: "", label: t("projects.submissionProfiles.unset") }, ...options];
  }

  return options;
}

export function getProjectSubmissionAddonOptions() {
  return sortSubmissionProfileKeys(["AWG", "UVP_UVE"]).map((key) => ({
    value: key,
    label: getSubmissionProfileLabel(key)
  }));
}

export function splitSubmissionProfileKeys(keys: SubmissionProfileKey[]) {
  const normalized = sortSubmissionProfileKeys(keys);
  const baseSubmissionProfileKey = normalized.find((key) => profileTypeByKey[key] === "BASE") ?? "";
  const addonProfileKeys = normalized.filter((key) => profileTypeByKey[key] === "ADDON");

  return {
    baseSubmissionProfileKey,
    addonProfileKeys
  };
}
