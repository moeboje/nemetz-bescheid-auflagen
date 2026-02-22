export type ProjectAttachment = {
  id: string;
  filename: string;
  sizeKb: number;
  addedAt: string;
};

export type ProjectInternalParticipant = {
  userId: string;
  role?: string;
};

export type ExternalParticipantType =
  | "LAWYER"
  | "ENGINEERING_OFFICE"
  | "CONSULTANT"
  | "OTHER";

export type ExternalParticipant = {
  id: string;
  type: ExternalParticipantType;
  organization?: string;
  name: string;
  email?: string;
  phone?: string;
  notes?: string;
  archivedAt?: string;
  isArchived?: boolean;
};

export type Project = {
  id: string;
  title: string;
  shortDescription?: string;
  authorityRef?: string;
  companyId: string;
  siteId?: string;
  facilityId?: string;
  authorityId?: string;
  authorityContactId?: string;
  ownerUserId?: string;
  deputyUserId?: string;
  internalParticipants: ProjectInternalParticipant[];
  participantUserIds?: string[];
  externalParticipants: ExternalParticipant[];
  attachments: ProjectAttachment[];
  updatedAt: string;
  archivedAt?: string;
  isArchived?: boolean;
};

export const projects: Project[] = [
  {
    id: "p-001",
    title: "Luftemissionen Optimierung",
    shortDescription: "Modernisierung der Filteranlage Linie 3",
    authorityRef: "BHZ-2026-041",
    companyId: "c-001",
    siteId: "s-001",
    facilityId: "f-001",
    authorityId: "auth-001",
    authorityContactId: "contact-001",
    ownerUserId: "u-001",
    deputyUserId: "u-006",
    internalParticipants: [{ userId: "u-002" }, { userId: "u-007" }],
    externalParticipants: [
      {
        id: "ep-001",
        type: "LAWYER",
        organization: "Kanzlei Leitner",
        name: "Dr. Eva Leitner",
        email: "eva.leitner@kanzlei-leitner.at",
        phone: "+43 1 555 00 11"
      }
    ],
    attachments: [
      {
        id: "pa-001",
        filename: "Projektsteckbrief.pdf",
        sizeKb: 482,
        addedAt: "2026-02-18"
      }
    ],
    updatedAt: "2026-02-20"
  },
  {
    id: "p-002",
    title: "Abfallbilanz Q1",
    shortDescription: "Abfallmengen und Entsorgungsnachweise",
    authorityRef: "BHZ-2026-033",
    companyId: "c-001",
    siteId: "s-002",
    facilityId: "f-003",
    authorityId: "auth-002",
    authorityContactId: "contact-004",
    ownerUserId: "u-003",
    deputyUserId: "u-008",
    internalParticipants: [{ userId: "u-004" }],
    externalParticipants: [
      {
        id: "ep-002",
        type: "ENGINEERING_OFFICE",
        organization: "TB Nord GmbH",
        name: "Ing. Robert Gruber",
        email: "r.gruber@tbnord.at",
        phone: "+43 662 123 456"
      }
    ],
    attachments: [],
    updatedAt: "2026-02-18"
  },
  {
    id: "p-003",
    title: "Gewaesserschutz",
    shortDescription: "Nachruestung der Abscheider",
    authorityRef: "BHZ-2026-017",
    companyId: "c-002",
    siteId: "s-003",
    facilityId: "f-005",
    authorityId: "auth-001",
    authorityContactId: "contact-002",
    ownerUserId: "u-005",
    deputyUserId: "u-009",
    internalParticipants: [{ userId: "u-010" }, { userId: "u-011" }],
    externalParticipants: [],
    attachments: [
      {
        id: "pa-002",
        filename: "Behordenkorrespondenz.pdf",
        sizeKb: 214,
        addedAt: "2026-02-15"
      }
    ],
    updatedAt: "2026-02-15"
  }
];
