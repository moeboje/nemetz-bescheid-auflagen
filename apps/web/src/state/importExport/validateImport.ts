import { getRuntimeConfigSnapshot } from "../../config/runtimeConfig";
import { CHECKLIST_ITEM_STATUS_VALUES } from "../../data/projectChecklists";
import { PROJECT_STATUS_VALUES, PROJECT_SUBMISSION_TYPE_VALUES } from "../../data/projects";
import { STORAGE_VERSION } from "../persistence";
import type { ExportDataBundle, ExportPayload } from "./types";

export type ImportValidationMessage = {
  key: string;
  path?: string;
};

export type ImportValidationResult = {
  ok: boolean;
  errors: ImportValidationMessage[];
  warnings: ImportValidationMessage[];
  payload?: ExportPayload;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function hasValue(value: unknown) {
  return value !== undefined && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function pushMessage(
  list: ImportValidationMessage[],
  key: string,
  path?: string
) {
  list.push({ key, path });
}

function ensureRecord(
  value: unknown,
  path: string,
  errors: ImportValidationMessage[]
): Record<string, unknown> | null {
  if (!isRecord(value)) {
    pushMessage(errors, "import.validation.invalidObject", path);
    return null;
  }
  return value;
}

function ensureArray(
  value: unknown,
  path: string,
  errors: ImportValidationMessage[]
): unknown[] {
  if (!Array.isArray(value)) {
    pushMessage(errors, "import.validation.invalidArray", path);
    return [];
  }
  return value;
}

function validateEntityId(
  row: unknown,
  path: string,
  errors: ImportValidationMessage[]
) {
  const object = ensureRecord(row, path, errors);
  if (!object) {
    return;
  }
  if (!isNonEmptyString(object.id)) {
    pushMessage(errors, "import.validation.invalidId", `${path}.id`);
  }
}

function validateArrayIds(
  list: unknown[],
  path: string,
  errors: ImportValidationMessage[]
) {
  list.forEach((row, index) => validateEntityId(row, `${path}[${index}]`, errors));
}

function normalizePayloadShape(value: unknown): ExportPayload | null {
  if (!isRecord(value)) {
    return null;
  }

  const runtime = getRuntimeConfigSnapshot();
  let source: Record<string, unknown> = value;
  let version = typeof value.version === "number" ? value.version : 0;
  let exportedAt =
    typeof value.exportedAt === "string" ? value.exportedAt : new Date().toISOString();
  let appName = runtime.appName;
  let buildLabel = runtime.buildLabel;

  if (
    hasValue(value.data) &&
    typeof value.timestamp === "string" &&
    !hasValue(value.app) &&
    !hasValue(value.scopes)
  ) {
    const dataRecord = ensureRecord(value.data, "data", []);
    if (dataRecord) {
      source = dataRecord;
      exportedAt = value.timestamp;
    }
  }

  if (isRecord(value.app)) {
    if (isNonEmptyString(value.app.name)) {
      appName = value.app.name;
    }
    if (isNonEmptyString(value.app.buildLabel)) {
      buildLabel = value.app.buildLabel;
    }
  } else if (isNonEmptyString(value.appName)) {
    appName = value.appName;
  }

  if (isRecord(source.data)) {
    const data = source.data as ExportDataBundle;
    return {
      version,
      exportedAt,
      app: {
        name: appName,
        buildLabel
      },
      data
    };
  }

  if (hasValue(source.scopes) || hasValue(source.authorities)) {
    return {
      version,
      exportedAt,
      app: {
        name: appName,
        buildLabel
      },
      data: {
        scopes: source.scopes as ExportDataBundle["scopes"],
        authorities: source.authorities as ExportDataBundle["authorities"],
        users: source.users as ExportDataBundle["users"],
        projects: source.projects as ExportDataBundle["projects"],
        projectChecklists: source.projectChecklists as ExportDataBundle["projectChecklists"],
        legalDocs: source.legalDocs as ExportDataBundle["legalDocs"],
        obligations: source.obligations as ExportDataBundle["obligations"],
        deadlines: source.deadlines as ExportDataBundle["deadlines"],
        taskState: source.taskState as ExportDataBundle["taskState"],
        auditLog: source.auditLog as ExportDataBundle["auditLog"],
        notifications: source.notifications as ExportDataBundle["notifications"],
        featureFlagsSnapshot: source.featureFlagsSnapshot as ExportDataBundle["featureFlagsSnapshot"]
      }
    };
  }

  return null;
}

function validateScopeSnapshot(
  value: unknown,
  errors: ImportValidationMessage[]
) {
  const scopes = ensureRecord(value, "data.scopes", errors);
  if (!scopes) {
    return;
  }

  const companies = ensureArray(scopes.companies, "data.scopes.companies", errors);
  const sites = ensureArray(scopes.sites, "data.scopes.sites", errors);
  const facilities = ensureArray(scopes.facilities, "data.scopes.facilities", errors);
  validateArrayIds(companies, "data.scopes.companies", errors);
  validateArrayIds(sites, "data.scopes.sites", errors);
  validateArrayIds(facilities, "data.scopes.facilities", errors);
}

function validateAuthoritiesSnapshot(
  value: unknown,
  errors: ImportValidationMessage[]
) {
  const authorities = ensureRecord(value, "data.authorities", errors);
  if (!authorities) {
    return;
  }
  const authorityRows = ensureArray(
    authorities.authorities,
    "data.authorities.authorities",
    errors
  );
  const contactRows = ensureArray(authorities.contacts, "data.authorities.contacts", errors);
  validateArrayIds(authorityRows, "data.authorities.authorities", errors);
  validateArrayIds(contactRows, "data.authorities.contacts", errors);
}

function validateOptionalArray(
  value: unknown,
  path: string,
  errors: ImportValidationMessage[]
) {
  if (!hasValue(value)) {
    return;
  }
  const rows = ensureArray(value, path, errors);
  validateArrayIds(rows, path, errors);
}

function isValidEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validateUsers(
  value: unknown,
  errors: ImportValidationMessage[]
) {
  if (!hasValue(value)) {
    return;
  }

  const rows = ensureArray(value, "data.users", errors);
  rows.forEach((row, index) => {
    const path = `data.users[${index}]`;
    const object = ensureRecord(row, path, errors);
    if (!object) {
      return;
    }

    if (!isNonEmptyString(object.id)) {
      pushMessage(errors, "import.validation.invalidId", `${path}.id`);
    }

    if (isNonEmptyString(object.email) && !isValidEmail(object.email)) {
      pushMessage(errors, "import.validation.invalidObject", `${path}.email`);
    }

    if (hasValue(object.phone) && typeof object.phone !== "string") {
      pushMessage(errors, "import.validation.invalidObject", `${path}.phone`);
    }
  });
}

function validateProjects(
  value: unknown,
  errors: ImportValidationMessage[]
) {
  if (!hasValue(value)) {
    return;
  }

  const rows = ensureArray(value, "data.projects", errors);
  validateArrayIds(rows, "data.projects", errors);

  rows.forEach((row, index) => {
    const path = `data.projects[${index}]`;
    const object = ensureRecord(row, path, errors);
    if (!object) {
      return;
    }

    if (
      hasValue(object.status) &&
      (!isNonEmptyString(object.status) ||
        !PROJECT_STATUS_VALUES.includes(object.status as (typeof PROJECT_STATUS_VALUES)[number]))
    ) {
      pushMessage(errors, "import.validation.invalidObject", `${path}.status`);
    }

    if (
      hasValue(object.submissionType) &&
      (!isNonEmptyString(object.submissionType) ||
        !PROJECT_SUBMISSION_TYPE_VALUES.includes(
          object.submissionType as (typeof PROJECT_SUBMISSION_TYPE_VALUES)[number]
        ))
    ) {
      pushMessage(errors, "import.validation.invalidObject", `${path}.submissionType`);
    }
  });
}

function validateProjectChecklists(
  value: unknown,
  errors: ImportValidationMessage[]
) {
  if (!hasValue(value)) {
    return;
  }

  const rows = ensureArray(value, "data.projectChecklists", errors);
  validateArrayIds(rows, "data.projectChecklists", errors);

  rows.forEach((row, index) => {
    const path = `data.projectChecklists[${index}]`;
    const checklist = ensureRecord(row, path, errors);
    if (!checklist) {
      return;
    }

    if (!isNonEmptyString(checklist.projectId)) {
      pushMessage(errors, "import.validation.invalidId", `${path}.projectId`);
    }

    const sections = ensureArray(checklist.sections, `${path}.sections`, errors);
    sections.forEach((sectionRow, sectionIndex) => {
      const sectionPath = `${path}.sections[${sectionIndex}]`;
      const section = ensureRecord(sectionRow, sectionPath, errors);
      if (!section) {
        return;
      }

      if (!isNonEmptyString(section.id)) {
        pushMessage(errors, "import.validation.invalidId", `${sectionPath}.id`);
      }
      if (!isNonEmptyString(section.title)) {
        pushMessage(errors, "import.validation.invalidObject", `${sectionPath}.title`);
      }

      const items = ensureArray(section.items, `${sectionPath}.items`, errors);
      items.forEach((itemRow, itemIndex) => {
        const itemPath = `${sectionPath}.items[${itemIndex}]`;
        const item = ensureRecord(itemRow, itemPath, errors);
        if (!item) {
          return;
        }

        if (!isNonEmptyString(item.id)) {
          pushMessage(errors, "import.validation.invalidId", `${itemPath}.id`);
        }
        if (!isNonEmptyString(item.title)) {
          pushMessage(errors, "import.validation.invalidObject", `${itemPath}.title`);
        }
        if (
          hasValue(item.status) &&
          (!isNonEmptyString(item.status) ||
            !CHECKLIST_ITEM_STATUS_VALUES.includes(
              item.status as (typeof CHECKLIST_ITEM_STATUS_VALUES)[number]
            ))
        ) {
          pushMessage(errors, "import.validation.invalidObject", `${itemPath}.status`);
        }
      });
    });
  });
}

function validateTaskState(
  value: unknown,
  errors: ImportValidationMessage[],
  warnings: ImportValidationMessage[]
) {
  if (!hasValue(value)) {
    pushMessage(warnings, "import.validation.missingOptionalKey", "data.taskState");
    return;
  }
  const map = ensureRecord(value, "data.taskState", errors);
  if (!map) {
    return;
  }

  Object.entries(map).forEach(([instanceId, entry]) => {
    if (!isNonEmptyString(instanceId)) {
      pushMessage(errors, "import.validation.invalidId", "data.taskState");
      return;
    }
    const row = ensureRecord(entry, `data.taskState.${instanceId}`, errors);
    if (!row) {
      return;
    }
    if (!isNonEmptyString(row.status)) {
      pushMessage(errors, "import.validation.invalidTaskStateStatus", `data.taskState.${instanceId}.status`);
    }
  });
}

function countEvidenceAttachmentsInEvidenceRows(value: unknown) {
  if (!Array.isArray(value)) {
    return 0;
  }
  return value.reduce((acc, evidenceRow) => {
    const evidence = ensureRecord(evidenceRow, "data.evidence", []);
    if (!evidence || !Array.isArray(evidence.attachments)) {
      return acc;
    }
    return acc + evidence.attachments.length;
  }, 0);
}

function countEvidenceAttachmentsInEntityArray(value: unknown) {
  if (!Array.isArray(value)) {
    return 0;
  }
  return value.reduce((acc, row) => {
    const object = ensureRecord(row, "data.entity", []);
    if (!object) {
      return acc;
    }
    return acc + countEvidenceAttachmentsInEvidenceRows(object.evidence);
  }, 0);
}

function countEvidenceAttachmentsInTaskState(value: unknown) {
  if (!isRecord(value)) {
    return 0;
  }
  return Object.values(value).reduce((acc, row) => {
    if (!isRecord(row)) {
      return acc;
    }
    return acc + countEvidenceAttachmentsInEvidenceRows(row.evidence);
  }, 0);
}

function validateProjectReplaceDependencies(
  data: ExportDataBundle,
  errors: ImportValidationMessage[]
) {
  if (!hasValue(data.projects)) {
    return;
  }

  const missingDependencies = [
    !hasValue(data.legalDocs),
    !hasValue(data.obligations),
    !hasValue(data.deadlines),
    !hasValue(data.taskState)
  ].some(Boolean);

  if (missingDependencies) {
    pushMessage(errors, "import.validation.projectReplaceRequiresDependents", "data.projects");
  }
}

export function validateImport(value: unknown): ImportValidationResult {
  const errors: ImportValidationMessage[] = [];
  const warnings: ImportValidationMessage[] = [];
  const payload = normalizePayloadShape(value);

  if (!payload) {
    pushMessage(errors, "import.validation.invalidRoot");
    return { ok: false, errors, warnings };
  }

  if (!Number.isFinite(payload.version)) {
    pushMessage(errors, "import.validation.versionMissing", "version");
  } else if (payload.version > STORAGE_VERSION) {
    pushMessage(warnings, "import.validation.versionNewer", "version");
  } else if (payload.version < STORAGE_VERSION) {
    pushMessage(warnings, "import.validation.versionOlder", "version");
  }

  if (!isNonEmptyString(payload.exportedAt)) {
    pushMessage(warnings, "import.validation.exportedAtMissing", "exportedAt");
  }

  if (!isNonEmptyString(payload.app.name)) {
    pushMessage(warnings, "import.validation.appNameMissing", "app.name");
  }

  const data = payload.data;
  if (!isRecord(data)) {
    pushMessage(errors, "import.validation.invalidObject", "data");
    return { ok: false, errors, warnings };
  }

  validateScopeSnapshot(data.scopes, errors);
  validateAuthoritiesSnapshot(data.authorities, errors);

  validateUsers(data.users, errors);
  validateProjects(data.projects, errors);
  validateProjectChecklists(data.projectChecklists, errors);
  validateOptionalArray(data.legalDocs, "data.legalDocs", errors);
  validateOptionalArray(data.obligations, "data.obligations", errors);
  validateOptionalArray(data.deadlines, "data.deadlines", errors);
  validateOptionalArray(data.auditLog, "data.auditLog", errors);
  validateOptionalArray(data.notifications, "data.notifications", errors);
  validateTaskState(data.taskState, errors, warnings);
  validateProjectReplaceDependencies(data, errors);

  const importedAttachmentCount =
    countEvidenceAttachmentsInEntityArray(data.deadlines) +
    countEvidenceAttachmentsInTaskState(data.taskState);
  if (importedAttachmentCount > 0) {
    pushMessage(warnings, "import.validation.attachmentsMissingContent");
  }

  if (hasValue(data.users)) {
    pushMessage(warnings, "import.validation.usersIgnoredOnImport", "data.users");
  }
  if (!hasValue(data.projects)) {
    pushMessage(warnings, "import.validation.missingOptionalKey", "data.projects");
  }
  if (!hasValue(data.projectChecklists)) {
    pushMessage(warnings, "import.validation.missingOptionalKey", "data.projectChecklists");
  }
  if (!hasValue(data.legalDocs)) {
    pushMessage(warnings, "import.validation.missingOptionalKey", "data.legalDocs");
  }
  if (!hasValue(data.obligations)) {
    pushMessage(warnings, "import.validation.missingOptionalKey", "data.obligations");
  }
  if (!hasValue(data.deadlines)) {
    pushMessage(warnings, "import.validation.missingOptionalKey", "data.deadlines");
  }
  if (!hasValue(data.auditLog)) {
    pushMessage(warnings, "import.validation.missingOptionalKey", "data.auditLog");
  }
  if (!hasValue(data.notifications)) {
    pushMessage(warnings, "import.validation.missingOptionalKey", "data.notifications");
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
    payload
  };
}
