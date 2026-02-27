import type {
  AiAnalysisResult,
  AiConfidence,
  AiConfidenceLevel,
  AiDeadlineSuggestion,
  AiDocMetaSuggestion,
  AiDocType,
  AiLanguage,
  AiObligationSuggestion
} from "../types/aiAnalysis";

export const MAX_AI_OBLIGATIONS = 50;
export const MAX_AI_DEADLINES = 20;
const MAX_EVIDENCE_SNIPPETS = 3;
const MAX_EXCERPT_LENGTH = 3000;
const MAX_STRING_LENGTH = 500;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function nowStamp() {
  return new Date().toISOString();
}

function createFallbackId(prefix: "analysis" | "ob" | "dl", index?: number) {
  const suffix = typeof index === "number" ? `-${index + 1}` : "";
  return `ai-${prefix}-${Date.now()}${suffix}`;
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function toTrimmedString(value: unknown, maxLength = MAX_STRING_LENGTH): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.slice(0, maxLength);
}

function normalizeLanguage(value: unknown): AiLanguage | undefined {
  return value === "de" || value === "en" ? value : undefined;
}

function normalizeDocType(value: unknown): AiDocType | undefined {
  if (
    value === "BESCHEID" ||
    value === "GEWERBE" ||
    value === "SAMMELGENEHMIGUNG" ||
    value === "SONSTIGES"
  ) {
    return value;
  }
  return undefined;
}

function normalizeIsoDate(value: string): string | undefined {
  if (!ISO_DATE_PATTERN.test(value)) {
    return undefined;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }
  if (parsed.toISOString().slice(0, 10) !== value) {
    return undefined;
  }
  return value;
}

export function toIsoDateBestEffort(value: unknown): string | undefined {
  const trimmed = toTrimmedString(value, 64);
  if (!trimmed) {
    return undefined;
  }

  const directIso = normalizeIsoDate(trimmed);
  if (directIso) {
    return directIso;
  }

  const ddmmyyyy = trimmed.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/);
  if (ddmmyyyy) {
    const day = ddmmyyyy[1].padStart(2, "0");
    const month = ddmmyyyy[2].padStart(2, "0");
    const year = ddmmyyyy[3];
    return normalizeIsoDate(`${year}-${month}-${day}`);
  }

  const yyyymmdd = trimmed.match(/^(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})$/);
  if (yyyymmdd) {
    const year = yyyymmdd[1];
    const month = yyyymmdd[2].padStart(2, "0");
    const day = yyyymmdd[3].padStart(2, "0");
    return normalizeIsoDate(`${year}-${month}-${day}`);
  }

  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return undefined;
}

export function deriveConfidenceLevel(
  score?: number,
  level?: AiConfidenceLevel
): AiConfidenceLevel {
  if (level === "HIGH" || level === "MEDIUM" || level === "LOW" || level === "UNKNOWN") {
    return level;
  }

  if (typeof score !== "number" || !Number.isFinite(score)) {
    return "UNKNOWN";
  }

  if (score >= 0.8) {
    return "HIGH";
  }
  if (score >= 0.5) {
    return "MEDIUM";
  }
  return "LOW";
}

function normalizeEvidence(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const snippets = value
    .map((entry) => toTrimmedString(entry, 220))
    .filter((entry): entry is string => Boolean(entry))
    .slice(0, MAX_EVIDENCE_SNIPPETS);

  return snippets.length ? snippets : undefined;
}

function normalizeConfidence(value: unknown): AiConfidence | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const row = value as Partial<AiConfidence>;
  const score =
    typeof row.score === "number" && Number.isFinite(row.score)
      ? clampNumber(row.score, 0, 1)
      : undefined;
  const note = toTrimmedString(row.note, 240);
  const evidence = normalizeEvidence(row.evidence);
  const normalizedLevel = deriveConfidenceLevel(score, row.level);

  if (score === undefined && !note && !evidence && normalizedLevel === "UNKNOWN") {
    return undefined;
  }

  return {
    score,
    level: normalizedLevel,
    note,
    evidence
  };
}

function normalizeMeta(value: unknown): AiDocMetaSuggestion {
  if (!value || typeof value !== "object") {
    return {};
  }

  const row = value as Partial<AiDocMetaSuggestion>;
  const confidence = row.confidence && typeof row.confidence === "object"
    ? {
        title: normalizeConfidence(row.confidence.title),
        shortDescription: normalizeConfidence(row.confidence.shortDescription),
        referenceNumber: normalizeConfidence(row.confidence.referenceNumber),
        issueDate: normalizeConfidence(row.confidence.issueDate),
        docType: normalizeConfidence(row.confidence.docType),
        authorityName: normalizeConfidence(row.confidence.authorityName),
        authorityContact: normalizeConfidence(row.confidence.authorityContact),
        scope: normalizeConfidence(row.confidence.scope),
        projectTitleSuggestion: normalizeConfidence(row.confidence.projectTitleSuggestion)
      }
    : undefined;

  const normalized: AiDocMetaSuggestion = {
    title: toTrimmedString(row.title),
    shortDescription: toTrimmedString(row.shortDescription, 800),
    referenceNumber: toTrimmedString(row.referenceNumber, 120),
    issueDate: toIsoDateBestEffort(row.issueDate),
    docType: normalizeDocType(row.docType),
    authorityName: toTrimmedString(row.authorityName, 200),
    authorityContactName: toTrimmedString(row.authorityContactName, 200),
    authorityContactEmail: toTrimmedString(row.authorityContactEmail, 200),
    scopeCompany: toTrimmedString(row.scopeCompany, 200),
    scopeSite: toTrimmedString(row.scopeSite, 200),
    scopeFacility: toTrimmedString(row.scopeFacility, 200),
    projectTitleSuggestion: toTrimmedString(row.projectTitleSuggestion, 240)
  };

  if (confidence) {
    normalized.confidence = confidence;
  }

  return normalized;
}

function normalizeObligation(value: unknown, index: number): AiObligationSuggestion {
  const row = value && typeof value === "object" ? (value as Partial<AiObligationSuggestion>) : {};

  const evidence = row.evidenceRequirements && typeof row.evidenceRequirements === "object"
    ? {
        requirePhoto: Boolean(row.evidenceRequirements.requirePhoto),
        requireDocument: Boolean(row.evidenceRequirements.requireDocument),
        requireReport: Boolean(row.evidenceRequirements.requireReport)
      }
    : {
        requirePhoto: false,
        requireDocument: false,
        requireReport: false
      };

  const reminder = row.reminder && typeof row.reminder === "object"
    ? {
        emailEnabled: Boolean(row.reminder.emailEnabled),
        daysBefore:
          typeof row.reminder.daysBefore === "number" && Number.isFinite(row.reminder.daysBefore)
            ? clampNumber(Math.round(row.reminder.daysBefore), 0, 365)
            : undefined
      }
    : {
        emailEnabled: false,
        daysBefore: undefined
      };

  if (!reminder.emailEnabled) {
    reminder.daysBefore = undefined;
  }

  return {
    id: toTrimmedString(row.id, 100) ?? createFallbackId("ob", index),
    title: toTrimmedString(row.title, 240) ?? `AI Obligation ${index + 1}`,
    longDescription: toTrimmedString(row.longDescription, 2000),
    dutyLevel: row.dutyLevel === "RECOMMENDED" ? "RECOMMENDED" : row.dutyLevel === "MANDATORY" ? "MANDATORY" : undefined,
    scheduling: row.scheduling === "RECURRING" ? "RECURRING" : row.scheduling === "ONE_TIME" ? "ONE_TIME" : undefined,
    interval:
      row.interval === "MONTHLY" ||
      row.interval === "QUARTERLY" ||
      row.interval === "SEMIANNUAL" ||
      row.interval === "ANNUAL" ||
      row.interval === "CUSTOM"
        ? row.interval
        : undefined,
    firstDueDate: toIsoDateBestEffort(row.firstDueDate),
    evidenceRequirements: evidence,
    reminder,
    responsibleRoleHint: toTrimmedString(row.responsibleRoleHint, 120),
    confidence: normalizeConfidence(row.confidence)
  };
}

function normalizeDeadline(value: unknown, index: number): AiDeadlineSuggestion {
  const row = value && typeof value === "object" ? (value as Partial<AiDeadlineSuggestion>) : {};

  return {
    id: toTrimmedString(row.id, 100) ?? createFallbackId("dl", index),
    title: toTrimmedString(row.title, 240) ?? `AI Deadline ${index + 1}`,
    dueDate: toIsoDateBestEffort(row.dueDate) ?? "",
    context: toTrimmedString(row.context, 500),
    relatedTo: row.relatedTo === "PROJECT" ? "PROJECT" : row.relatedTo === "LEGAL_DOC" ? "LEGAL_DOC" : undefined,
    confidence: normalizeConfidence(row.confidence)
  };
}

function normalizeWarnings(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const warnings = value
    .map((entry) => toTrimmedString(entry, 240))
    .filter((entry): entry is string => Boolean(entry));
  return warnings.length ? warnings : undefined;
}

export function validateAiAnalysisResultShape(value: unknown): string[] {
  const errors: string[] = [];

  if (!value || typeof value !== "object") {
    return ["result_not_object"];
  }

  const row = value as Record<string, unknown>;

  if (!Array.isArray(row.obligations)) {
    errors.push("obligations_not_array");
  }
  if (!Array.isArray(row.deadlines)) {
    errors.push("deadlines_not_array");
  }

  return errors;
}

export function normalizeAiAnalysisResult(value: unknown): AiAnalysisResult {
  const row = value && typeof value === "object" ? (value as Partial<AiAnalysisResult>) : {};

  const obligations = Array.isArray(row.obligations)
    ? row.obligations.slice(0, MAX_AI_OBLIGATIONS).map((item, index) => normalizeObligation(item, index))
    : [];

  const deadlines = Array.isArray(row.deadlines)
    ? row.deadlines.slice(0, MAX_AI_DEADLINES).map((item, index) => normalizeDeadline(item, index))
    : [];

  const createdAtRaw = toTrimmedString(row.createdAt, 40);
  const createdAtParsed = createdAtRaw ? new Date(createdAtRaw) : null;

  return {
    id: toTrimmedString(row.id, 120) ?? createFallbackId("analysis"),
    createdAt:
      createdAtParsed && !Number.isNaN(createdAtParsed.getTime())
        ? createdAtParsed.toISOString()
        : nowStamp(),
    language: normalizeLanguage(row.language),
    meta: normalizeMeta(row.meta),
    obligations,
    deadlines,
    warnings: normalizeWarnings(row.warnings),
    rawTextExcerpt: toTrimmedString(row.rawTextExcerpt, MAX_EXCERPT_LENGTH)
  };
}
