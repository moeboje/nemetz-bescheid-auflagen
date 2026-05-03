export type LegacyDecisionStatus =
  | "ARCHIVE_ONLY"
  | "HISTORICALLY_RELEVANT"
  | "PARTIALLY_RELEVANT"
  | "NEEDS_REVIEW"
  | "SUPERSEDED"
  | "CONVERTED";

export type LegacyDecisionReviewStatus = "NOT_REVIEWED" | "IN_REVIEW" | "REVIEWED";

export type LegacyDecision = {
  id: string;
  projectId: string;
  title: string;
  fileNumber?: string;
  authorityId?: string;
  authorityName?: string;
  issuedAt?: string;
  validFrom?: string;
  validUntil?: string;
  legacyStatus: LegacyDecisionStatus;
  reviewStatus: LegacyDecisionReviewStatus;
  relevanceNote?: string;
  reviewedAt?: string;
  reviewedByUserId?: string;
  linkedLegalDocId?: string;
  supersededByLegalDocId?: string;
  archivedAt?: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
};

export const LEGACY_DECISION_STATUS_VALUES: LegacyDecisionStatus[] = [
  "ARCHIVE_ONLY",
  "NEEDS_REVIEW",
  "HISTORICALLY_RELEVANT",
  "PARTIALLY_RELEVANT",
  "SUPERSEDED",
  "CONVERTED"
];

export const LEGACY_DECISION_REVIEW_STATUS_VALUES: LegacyDecisionReviewStatus[] = [
  "NOT_REVIEWED",
  "IN_REVIEW",
  "REVIEWED"
];
