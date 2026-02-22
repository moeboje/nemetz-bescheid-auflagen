import type { Attachment, ExternalParticipantType } from "../types/models";

export type ProjectAttachment = Attachment;

export type ProjectInternalParticipant = {
  userId: string;
  role?: string;
};

export type ExternalParticipant = {
  id: string;
  type: ExternalParticipantType;
  organization?: string;
  name: string;
  email?: string;
  phone?: string;
  notes?: string;
  archivedAt?: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
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
  participantUserIds: string[];
  externalParticipants: ExternalParticipant[];
  attachments: ProjectAttachment[];
  archivedAt?: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
};

const seedTimestamp = "2026-02-01T09:00:00.000Z";

export const projects: Project[] = [
  {
    id: "p-001",
    title: "Genehmigung Sortieranlage Leopoldsdorf (Betriebsanlagenverfahren)",
    shortDescription:
      "Erweiterung der Sortierkapazitaet und Abstimmung der Auflagen fuer den laufenden Betrieb.",
    authorityRef: "BH-2026-017",
    companyId: "c-001",
    siteId: "s-002",
    facilityId: "f-001",
    authorityId: "auth-001",
    authorityContactId: "contact-001",
    ownerUserId: "u-001",
    deputyUserId: "u-006",
    internalParticipants: [{ userId: "u-002" }, { userId: "u-007" }],
    participantUserIds: ["u-002", "u-007"],
    externalParticipants: [
      {
        id: "ep-001",
        type: "LAWYER",
        organization: "Externe Rechtsberatung A",
        name: "Rechtsberatung 1",
        isArchived: false,
        createdAt: seedTimestamp,
        updatedAt: seedTimestamp
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
    isArchived: false,
    createdAt: seedTimestamp,
    updatedAt: "2026-02-20T08:15:00.000Z"
  },
  {
    id: "p-002",
    title: "Erweiterung Zwischenlager - Flaechenwidmung & Auflagen",
    shortDescription:
      "Abstimmung von Zwischenlagerflaechen inklusive Nachweispflichten und wiederkehrenden Kontrollen.",
    authorityRef: "MAG-2026-033",
    companyId: "c-002",
    siteId: "s-003",
    facilityId: "f-005",
    authorityId: "auth-002",
    authorityContactId: "contact-003",
    ownerUserId: "u-003",
    deputyUserId: "u-008",
    internalParticipants: [{ userId: "u-004" }],
    participantUserIds: ["u-004"],
    externalParticipants: [
      {
        id: "ep-002",
        type: "ENGINEERING_OFFICE",
        organization: "Technisches Buero Umwelt A",
        name: "Fachplanung 1",
        isArchived: false,
        createdAt: seedTimestamp,
        updatedAt: seedTimestamp
      }
    ],
    attachments: [],
    isArchived: false,
    createdAt: seedTimestamp,
    updatedAt: "2026-02-18T11:00:00.000Z"
  },
  {
    id: "p-003",
    title: "Tanklager - Wartungs- und Pruefpflichten",
    shortDescription:
      "Betriebliche Pruef-, Wartungs- und Dokumentationspflichten fuer Tanklager und Nebenanlagen.",
    authorityRef: "LRU-2026-041",
    companyId: "c-002",
    siteId: "s-003",
    facilityId: "f-006",
    authorityId: "auth-001",
    authorityContactId: "contact-002",
    ownerUserId: "u-005",
    deputyUserId: "u-009",
    internalParticipants: [{ userId: "u-010" }, { userId: "u-011" }],
    participantUserIds: ["u-010", "u-011"],
    externalParticipants: [],
    attachments: [
      {
        id: "pa-002",
        filename: "Behordenkorrespondenz.pdf",
        sizeKb: 214,
        addedAt: "2026-02-15"
      }
    ],
    isArchived: false,
    createdAt: seedTimestamp,
    updatedAt: "2026-02-15T10:30:00.000Z"
  },
  {
    id: "p-004",
    title: "Abfallsammelgenehmigung - unternehmensweit",
    shortDescription:
      "Uebergreifende Genehmigung fuer Sammlung und organisatorische Nachweise auf Unternehmensebene.",
    authorityRef: "LRU-2026-052",
    companyId: "c-001",
    authorityId: "auth-003",
    authorityContactId: "contact-005",
    ownerUserId: "u-004",
    deputyUserId: "u-009",
    internalParticipants: [{ userId: "u-001" }, { userId: "u-003" }],
    participantUserIds: ["u-001", "u-003"],
    externalParticipants: [],
    attachments: [],
    isArchived: false,
    createdAt: seedTimestamp,
    updatedAt: "2026-02-21T16:45:00.000Z"
  }
];
