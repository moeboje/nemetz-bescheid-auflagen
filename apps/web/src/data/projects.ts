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

export const SUBMISSION_PROFILE_KEYS = ["GEWERBE", "AWG", "UVP_UVE"] as const;
export type SubmissionProfileKey = (typeof SUBMISSION_PROFILE_KEYS)[number];

export const SUBMISSION_PROFILE_TYPE_VALUES = ["BASE", "ADDON"] as const;
export type SubmissionProfileType = (typeof SUBMISSION_PROFILE_TYPE_VALUES)[number];

export type ProjectSubmissionProfile = {
  key: SubmissionProfileKey;
  label: string;
  profileType: SubmissionProfileType;
  isActive: boolean;
};

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
  status?: ProjectStatus;
  submissionProfileKeys: SubmissionProfileKey[];
  submissionProfiles: ProjectSubmissionProfile[];
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
  dependsOnProjectIds: string[];
  referenceLegalDocIds: string[];
  externalParticipants: ExternalParticipant[];
  attachments: ProjectAttachment[];
  archivedAt?: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
};

const seedTimestamp = "2026-02-01T09:00:00.000Z";

export const projects: Project[] = [];
