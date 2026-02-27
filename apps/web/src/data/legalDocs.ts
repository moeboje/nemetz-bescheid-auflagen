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

export const legalDocs: LegalDoc[] = [
  {
    id: "ld-001",
    projectId: "p-001",
    type: "DECISION",
    title: "Bescheid Sortieranlage Leopoldsdorf",
    shortDescription: "Betriebliche Auflagen fuer Anlagenbetrieb und Nachweisfuehrung.",
    reference: "BH-2026-017",
    issuedAt: "2026-01-12",
    authorityId: "auth-001",
    authorityContactId: "contact-001",
    attachments: [
      {
        id: "lda-001",
        filename: "Bescheid_Sortieranlage_Leopoldsdorf.pdf",
        sizeKb: 1240,
        addedAt: "2026-02-19"
      }
    ],
    isArchived: false,
    createdAt: seedTimestamp,
    updatedAt: "2026-02-19T08:20:00.000Z"
  },
  {
    id: "ld-002",
    projectId: "p-004",
    type: "DIRECTIVE",
    title: "Abfallsammelgenehmigung - unternehmensweit",
    shortDescription: "Rahmenbedingungen fuer Sammlung, Dokumentation und periodische Meldungen.",
    reference: "LRU-2026-052",
    issuedAt: "2026-01-28",
    authorityId: "auth-003",
    authorityContactId: "contact-005",
    attachments: [],
    isArchived: false,
    createdAt: seedTimestamp,
    updatedAt: "2026-02-17T09:45:00.000Z"
  },
  {
    id: "ld-003",
    projectId: "p-003",
    type: "PERMIT",
    title: "Gewerbeberechtigung Tanklagerbetrieb",
    shortDescription: "Genehmigungsrahmen fuer Wartungs- und Pruefpflichten im Tanklagerbetrieb.",
    reference: "MAG-2026-041",
    issuedAt: "2026-01-30",
    authorityId: "auth-001",
    authorityContactId: "contact-002",
    attachments: [
      {
        id: "lda-002",
        filename: "Gewerbeberechtigung_Tanklager.pdf",
        sizeKb: 980,
        addedAt: "2026-02-14"
      }
    ],
    scopeOverride: {
      companyId: "c-002",
      siteId: "s-003",
      facilityId: "f-006"
    },
    isArchived: false,
    createdAt: seedTimestamp,
    updatedAt: "2026-02-14T10:10:00.000Z"
  },
  {
    id: "ld-004",
    projectId: "p-002",
    type: "OTHER",
    title: "Anzeige/Bestaetigung Zwischenlagerflaeche",
    shortDescription: "Dokumentation von Anzeigeverfahren inklusive Bestaetigungsschreiben.",
    reference: "MAG-2026-033",
    issuedAt: "2026-02-05",
    authorityId: "auth-002",
    authorityContactId: "contact-003",
    attachments: [],
    archivedAt: "2026-02-22T11:30:00.000Z",
    isArchived: true,
    createdAt: seedTimestamp,
    updatedAt: "2026-02-16T07:30:00.000Z"
  }
];
