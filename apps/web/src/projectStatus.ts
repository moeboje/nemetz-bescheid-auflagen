import { PROJECT_STATUS_VALUES, type ProjectStatus } from "./data/projects";
import type { I18nKey } from "./i18n";
import { t } from "./i18n";

type BadgeVariant = "neutral" | "warning" | "danger" | "success";

const labelKeyByStatus: Record<ProjectStatus, I18nKey> = {
  DRAFT: "projects.status.draft",
  INTERNAL_REVIEW: "projects.status.internalReview",
  SUBMISSION_PREPARATION: "projects.status.submissionPreparation",
  UVP_PREPARATION: "projects.status.uvpPreparation",
  SUBMITTED: "projects.status.submitted",
  ADDITIONAL_INFORMATION_REQUEST: "projects.status.additionalInformationRequest",
  APPROVED: "projects.status.approved",
  IN_IMPLEMENTATION: "projects.status.inImplementation"
};

const badgeVariantByStatus: Record<ProjectStatus, BadgeVariant> = {
  DRAFT: "neutral",
  INTERNAL_REVIEW: "warning",
  SUBMISSION_PREPARATION: "warning",
  UVP_PREPARATION: "warning",
  SUBMITTED: "neutral",
  ADDITIONAL_INFORMATION_REQUEST: "danger",
  APPROVED: "success",
  IN_IMPLEMENTATION: "neutral"
};

export const PROJECT_STATUS_FILTER_UNSET = "__UNSET__";

export function isProjectStatus(value: unknown): value is ProjectStatus {
  return typeof value === "string" && PROJECT_STATUS_VALUES.includes(value as ProjectStatus);
}

export function normalizeProjectStatus(value: unknown): ProjectStatus | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return isProjectStatus(trimmed) ? trimmed : undefined;
}

export function getProjectStatusLabel(status?: ProjectStatus) {
  if (!status) {
    return t("projects.status.unset");
  }
  return t(labelKeyByStatus[status]);
}

export function getProjectStatusBadgeVariant(status?: ProjectStatus): BadgeVariant {
  if (!status) {
    return "neutral";
  }
  return badgeVariantByStatus[status];
}

export function getProjectStatusOptions(input?: { includeUnset?: boolean }) {
  const options = PROJECT_STATUS_VALUES.map((status) => ({
    value: status,
    label: getProjectStatusLabel(status)
  }));

  if (input?.includeUnset) {
    return [{ value: "", label: t("projects.status.unset") }, ...options];
  }

  return options;
}

