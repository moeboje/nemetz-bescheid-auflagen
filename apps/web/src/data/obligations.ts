export type ObligationEvidenceRequirements = {
  requirePhoto: boolean;
  requireDocument: boolean;
  requireReport: boolean;
};

export const DEFAULT_OBLIGATION_EVIDENCE_REQUIREMENTS: ObligationEvidenceRequirements = {
  requirePhoto: false,
  requireDocument: false,
  requireReport: false
};

export function cloneDefaultObligationEvidenceRequirements(): ObligationEvidenceRequirements {
  return { ...DEFAULT_OBLIGATION_EVIDENCE_REQUIREMENTS };
}

export type Obligation = {
  id: string;
  legalDocId: string;
  projectId?: string;
  projectTitle?: string;
  currentUserCanWriteProject?: boolean;
  title: string;
  infoTextLong?: string;
  level: "MANDATORY" | "RECOMMENDED";
  scheduleType: "ONCE" | "RECURRING" | "ONCE_THEN_RECURRING";
  firstDueDate?: string;
  recurrenceEndDate?: string;
  intervalUnit?: "DAY" | "WEEK" | "MONTH" | "QUARTER" | "YEAR";
  intervalValue?: number;
  ownerUserId?: string;
  deputyUserId?: string;
  externalOrgId?: string;
  externalUserId?: string;
  origin?: "MANUAL" | "AI_ACCEPTED";
  sourceSuggestionId?: string;
  sourceRunId?: string;
  criticality?: "LOW" | "MEDIUM" | "HIGH";
  emailReminderEnabled: boolean;
  emailReminderDaysBefore?: number;
  evidenceRequirements: ObligationEvidenceRequirements;
  archivedAt?: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
};

const seedTimestamp = "2026-02-01T09:00:00.000Z";

export const obligations: Obligation[] = [];
