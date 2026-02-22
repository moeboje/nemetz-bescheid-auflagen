export type LegalDocType = "PERMIT" | "DIRECTIVE" | "DECISION";

export type LegalDocAttachment = {
  id: string;
  filename: string;
  sizeKb: number;
  addedAt: string;
};

export type LegalDoc = {
  id: string;
  projectId: string;
  type: LegalDocType;
  title: string;
  shortDescription?: string;
  reference?: string;
  issuedAt?: string;
  attachments: LegalDocAttachment[];
  scopeOverride?: {
    companyId: string;
    siteId?: string;
    facilityId?: string;
  };
  updatedAt: string;
};

export const legalDocs: LegalDoc[] = [
  {
    id: "ld-001",
    projectId: "p-001",
    type: "PERMIT",
    title: "Bescheid Abgasreduktion",
    shortDescription: "Vorgaben fuer die Abluftreinigung",
    reference: "BHZ-2026-041",
    issuedAt: "2026-01-12",
    attachments: [
      {
        id: "lda-001",
        filename: "Bescheid_Abgasreduktion.pdf",
        sizeKb: 1240,
        addedAt: "2026-02-19"
      }
    ],
    updatedAt: "2026-02-19"
  },
  {
    id: "ld-002",
    projectId: "p-002",
    type: "DIRECTIVE",
    title: "Auflage Abfallbilanz",
    shortDescription: "Quartalsweise Meldung der Abfallmengen",
    reference: "BHZ-2026-033",
    issuedAt: "2026-01-28",
    attachments: [],
    updatedAt: "2026-02-17"
  },
  {
    id: "ld-003",
    projectId: "p-003",
    type: "DECISION",
    title: "Bescheid Gewaesserschutz",
    shortDescription: "Anforderungen an Abscheider und Wartung",
    reference: "BHZ-2026-017",
    issuedAt: "2026-01-30",
    attachments: [
      {
        id: "lda-002",
        filename: "Bescheid_Gewaesserschutz.pdf",
        sizeKb: 980,
        addedAt: "2026-02-14"
      }
    ],
    scopeOverride: {
      companyId: "c-002",
      siteId: "s-003",
      facilityId: "f-006"
    },
    updatedAt: "2026-02-14"
  }
];
