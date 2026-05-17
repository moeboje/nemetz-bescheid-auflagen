import {
  PROJECT_SUBMISSION_TYPE_VALUES,
  type LegacyProjectSubmissionType,
  type Project
} from "./data/projects";
import type { SubmissionType } from "./data/procedureMasterData";
import type { I18nKey } from "./i18n";
import { t } from "./i18n";

type BadgeVariant = "neutral" | "success" | "warning" | "danger";

const labelKeyByLegacySubmissionType: Record<LegacyProjectSubmissionType, I18nKey> = {
  GEWERBE: "projects.submissionType.gewerbe",
  AWG: "projects.submissionType.awg",
  UVP_UVE: "projects.submissionType.uvpUve"
};

const badgeVariantByLegacySubmissionType: Record<LegacyProjectSubmissionType, BadgeVariant> = {
  GEWERBE: "neutral",
  AWG: "warning",
  UVP_UVE: "danger"
};

export const PROJECT_SUBMISSION_TYPE_FILTER_UNSET = "__UNSET__";

type ProjectSubmissionTypeOptionsMode = "create" | "edit" | "filter" | "form";

type ProjectSubmissionTypeDisplayInput =
  | Pick<
      Project,
      | "submissionType"
      | "submissionTypeCode"
      | "submissionTypeLabel"
      | "submissionTypeShortName"
      | "submissionTypeIsActive"
      | "submissionTypeBadgeVariant"
    >
  | string
  | undefined;

export function isProjectSubmissionType(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export function normalizeProjectSubmissionType(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed || undefined;
}

function isLegacySubmissionType(value: unknown): value is LegacyProjectSubmissionType {
  return (
    typeof value === "string" &&
    PROJECT_SUBMISSION_TYPE_VALUES.includes(value as LegacyProjectSubmissionType)
  );
}

function isProjectDisplayObject(
  value: ProjectSubmissionTypeDisplayInput
): value is Exclude<ProjectSubmissionTypeDisplayInput, string | undefined> {
  return typeof value === "object" && value !== null;
}

export function getProjectSubmissionTypeLabel(input?: ProjectSubmissionTypeDisplayInput) {
  if (!input) {
    return t("projects.submissionType.unset");
  }

  if (isProjectDisplayObject(input)) {
    if (input.submissionTypeLabel) {
      return input.submissionTypeIsActive === false
        ? `${input.submissionTypeLabel} (${t("projects.submissionType.inactive")})`
        : input.submissionTypeLabel;
    }
    if (input.submissionTypeCode) {
      return input.submissionTypeCode;
    }
    if (input.submissionType) {
      return getProjectSubmissionTypeLabel(input.submissionType);
    }
    return t("projects.submissionType.unset");
  }

  if (isLegacySubmissionType(input)) {
    return t(labelKeyByLegacySubmissionType[input]);
  }

  return input;
}

export function getProjectSubmissionTypeBadgeVariant(
  input?: ProjectSubmissionTypeDisplayInput
): BadgeVariant {
  if (!input) {
    return "neutral";
  }

  if (isProjectDisplayObject(input)) {
    if (input.submissionTypeBadgeVariant) {
      return input.submissionTypeBadgeVariant;
    }
    if (input.submissionType) {
      return getProjectSubmissionTypeBadgeVariant(input.submissionType);
    }
    return "neutral";
  }

  if (isLegacySubmissionType(input)) {
    return badgeVariantByLegacySubmissionType[input];
  }

  return "neutral";
}

export function getProjectSubmissionTypeFilterValue(project: Pick<Project, "submissionType" | "submissionTypeId" | "submissionTypeCode">) {
  return project.submissionTypeId ?? project.submissionTypeCode ?? project.submissionType ?? "";
}

function submissionTypeIsUsable(submissionType: SubmissionType) {
  return (
    submissionType.isActive &&
    submissionType.legalMatterIsActive !== false &&
    submissionType.procedureTypeIsActive !== false
  );
}

export function getProjectSubmissionTypeOptions(input?: {
  submissionTypes?: SubmissionType[];
  projects?: Project[];
  includeUnset?: boolean;
  currentProject?: Project;
  mode?: ProjectSubmissionTypeOptionsMode;
}) {
  const options = new Map<string, { value: string; label: string; disabled?: boolean }>();
  const mode = input?.mode ?? "form";

  (input?.submissionTypes ?? [])
    .filter(submissionTypeIsUsable)
    .forEach((submissionType) => {
      options.set(submissionType.id, {
        value: submissionType.id,
        label: submissionType.shortName
          ? `${submissionType.name} (${submissionType.shortName})`
          : submissionType.name
      });
    });

  const projectRows = [
    ...(input?.projects ?? []),
    ...(input?.currentProject ? [input.currentProject] : [])
  ];
  projectRows.forEach((project) => {
    const value = getProjectSubmissionTypeFilterValue(project);
    if (!value || options.has(value)) {
      return;
    }
    options.set(value, {
      value,
      label: getProjectSubmissionTypeLabel(project),
      disabled: mode !== "filter" && project.submissionTypeIsActive === false
    });
  });

  const list = [...options.values()];

  if (input?.includeUnset) {
    return [{ value: "", label: getProjectSubmissionTypeLabel() }, ...list];
  }

  return list;
}
