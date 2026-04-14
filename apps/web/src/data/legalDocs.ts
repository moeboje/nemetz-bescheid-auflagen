import type { Attachment } from "../types/models";
import type { AiAnalysisResult } from "../types/aiAnalysis";

export type LegalDocType = "PERMIT" | "DIRECTIVE" | "DECISION" | "OTHER";

export type LegalDocAttachment = Attachment;

export type LegalDocAiExtraction = AiAnalysisResult;

export type LegalDoc = {
  id: string;
  projectId: string;
  type: LegalDocType;
  title: string;
  shortDescription?: string;
  reference?: string;
  issuedAt?: string;
  authorityId?: string;
  authorityContactId?: string;
  attachments: LegalDocAttachment[];
  aiExtraction?: LegalDocAiExtraction;
  scopeOverride?: {
    companyId: string;
    siteId?: string;
    facilityId?: string;
  };
  archivedAt?: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
};

const seedTimestamp = "2026-02-01T09:00:00.000Z";

export const legalDocs: LegalDoc[] = [];
