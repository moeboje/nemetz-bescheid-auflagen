import type { Attachment, ExternalParticipantType } from "../types/models";

export const PROJECT_STATUS_VALUES = [
  "DRAFT",
  "INTERNAL_REVIEW",
  "SUBMISSION_PREPARATION",
  "UVP_PREPARATION",
  "SUBMITTED",
  "ADDITIONAL_INFORMATION_REQUEST",
  "APPROVED",
  "IN_IMPLEMENTATION"
] as const;

export type ProjectStatus = (typeof PROJECT_STATUS_VALUES)[number];

export const PROJECT_SUBMISSION_TYPE_VALUES = ["GEWERBE", "AWG", "UVP_UVE"] as const;
export type ProjectSubmissionType = (typeof PROJECT_SUBMISSION_TYPE_VALUES)[number];

export type ProjectAttachment = Attachment;

export type ProjectInternalParticipant = {
  userId: string;
  role?: string;
};

export type ExternalParticipant = {
  id: string;
  type: ExternalParticipantType;
  externalOrgId?: string;
  externalUserId?: string;
  accessStatus?: "LINKED" | "INVITE_SENT" | "RESET_REQUIRED" | "LEGACY_ONLY";
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
  status?: ProjectStatus;
  submissionType?: ProjectSubmissionType;
  shortDescription?: string;
  detailedDescription?: string;
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
  dependsOnProjectIds: string[];
  referenceLegalDocIds: string[];
  externalParticipants: ExternalParticipant[];
  attachments: ProjectAttachment[];
  archivedAt?: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  currentUserAccessRole?: ProjectAccessRole;
  currentUserAccessSource?: ProjectAccessSource;
  currentUserCanWrite?: boolean;
  canUpdate?: boolean;
  canArchive?: boolean;
};

export type ProjectAccessRole =
  | "PROJECT_VIEWER"
  | "PROJECT_EDITOR"
  | "EXTERNAL_PROJECT_VIEWER"
  | "EXTERNAL_EXECUTOR";

export type ProjectAccessSource =
  | "GLOBAL"
  | "IMPLICIT_OWNER"
  | "IMPLICIT_DEPUTY"
  | "IMPLICIT_PARTICIPANT"
  | "EXPLICIT";

export type DomainProjectOption = {
  id: string;
  title: string;
};

export type ProjectAccessEntry = {
  id?: string;
  projectId: string;
  userId: string;
  accessRole: ProjectAccessRole;
  note?: string;
  source: ProjectAccessSource;
  grantedByUserId?: string;
  createdAt?: string;
  updatedAt?: string;
  user?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: string;
    type: "INTERNAL" | "EXTERNAL";
    externalOrgId?: string;
    externalOrgName?: string;
    isArchived: boolean;
  };
};

const seedTimestamp = "2026-02-01T09:00:00.000Z";

export const projects: Project[] = [];
