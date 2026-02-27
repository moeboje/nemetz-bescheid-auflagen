export type AiDocType = "BESCHEID" | "GEWERBE" | "SAMMELGENEHMIGUNG" | "SONSTIGES";

export type AiLanguage = "de" | "en";

export type AiConfidenceLevel = "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";

export type AiConfidence = {
  score?: number;
  level?: AiConfidenceLevel;
  note?: string;
  evidence?: string[];
};

export type AiDocMetaSuggestion = {
  title?: string;
  shortDescription?: string;
  referenceNumber?: string;
  issueDate?: string;
  docType?: AiDocType;
  authorityName?: string;
  authorityContactName?: string;
  authorityContactEmail?: string;
  scopeCompany?: string;
  scopeSite?: string;
  scopeFacility?: string;
  projectTitleSuggestion?: string;
  confidence?: {
    title?: AiConfidence;
    shortDescription?: AiConfidence;
    referenceNumber?: AiConfidence;
    issueDate?: AiConfidence;
    docType?: AiConfidence;
    authorityName?: AiConfidence;
    authorityContact?: AiConfidence;
    scope?: AiConfidence;
    projectTitleSuggestion?: AiConfidence;
  };
};

export type AiObligationSuggestion = {
  id: string;
  title: string;
  longDescription?: string;
  dutyLevel?: "MANDATORY" | "RECOMMENDED";
  scheduling?: "ONE_TIME" | "RECURRING";
  interval?: "MONTHLY" | "QUARTERLY" | "SEMIANNUAL" | "ANNUAL" | "CUSTOM";
  firstDueDate?: string;
  evidenceRequirements?: {
    requirePhoto?: boolean;
    requireDocument?: boolean;
    requireReport?: boolean;
  };
  reminder?: {
    emailEnabled?: boolean;
    daysBefore?: number;
  };
  responsibleRoleHint?: string;
  confidence?: AiConfidence;
};

export type AiDeadlineSuggestion = {
  id: string;
  title: string;
  dueDate: string;
  context?: string;
  relatedTo?: "LEGAL_DOC" | "PROJECT";
  confidence?: AiConfidence;
};

export type AiAnalysisResult = {
  id: string;
  createdAt: string;
  language?: AiLanguage;
  meta: AiDocMetaSuggestion;
  obligations: AiObligationSuggestion[];
  deadlines: AiDeadlineSuggestion[];
  warnings?: string[];
  rawTextExcerpt?: string;
};
