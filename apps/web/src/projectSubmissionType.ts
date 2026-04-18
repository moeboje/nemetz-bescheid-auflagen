import {
  PROJECT_SUBMISSION_TYPE_VALUES,
  type ProjectSubmissionType
} from "./data/projects";
import type { I18nKey } from "./i18n";
import { t } from "./i18n";

type BadgeVariant = "neutral" | "warning" | "danger";

const labelKeyBySubmissionType: Record<ProjectSubmissionType, I18nKey> = {
  GEWERBE: "projects.submissionType.gewerbe",
  AWG: "projects.submissionType.awg",
  UVP_UVE: "projects.submissionType.uvpUve"
};

const badgeVariantBySubmissionType: Record<ProjectSubmissionType, BadgeVariant> = {
  GEWERBE: "neutral",
  AWG: "warning",
  UVP_UVE: "danger"
};

export const PROJECT_SUBMISSION_TYPE_FILTER_UNSET = "__UNSET__";

export function isProjectSubmissionType(value: unknown): value is ProjectSubmissionType {
  return (
    typeof value === "string" &&
    PROJECT_SUBMISSION_TYPE_VALUES.includes(value as ProjectSubmissionType)
  );
}

export function normalizeProjectSubmissionType(
  value: unknown
): ProjectSubmissionType | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return isProjectSubmissionType(trimmed) ? trimmed : undefined;
}

export function getProjectSubmissionTypeLabel(submissionType?: ProjectSubmissionType) {
  if (!submissionType) {
    return t("projects.submissionType.unset");
  }

  return t(labelKeyBySubmissionType[submissionType]);
}

export function getProjectSubmissionTypeBadgeVariant(
  submissionType?: ProjectSubmissionType
): BadgeVariant {
  if (!submissionType) {
    return "neutral";
  }

  return badgeVariantBySubmissionType[submissionType];
}

export function getProjectSubmissionTypeOptions(input?: { includeUnset?: boolean }) {
  const options = PROJECT_SUBMISSION_TYPE_VALUES.map((submissionType) => ({
    value: submissionType,
    label: getProjectSubmissionTypeLabel(submissionType)
  }));

  if (input?.includeUnset) {
    return [{ value: "", label: getProjectSubmissionTypeLabel() }, ...options];
  }

  return options;
}
