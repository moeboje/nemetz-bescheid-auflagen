export type Attachment = {
  id: string;
  filename: string;
  sizeKb: number;
  mime?: string;
  addedAt: string;
  addedByLabel?: string;
};

export type ExternalParticipantType =
  | "LAWYER"
  | "ENGINEERING_OFFICE"
  | "CONSULTANT"
  | "OTHER";

export type AuditEntityType =
  | "PROJECT"
  | "LEGAL_DOC"
  | "OBLIGATION"
  | "DEADLINE"
  | "TASK"
  | "SYSTEM";

export type AuditAction =
  | "CREATED"
  | "UPDATED"
  | "ARCHIVED"
  | "RESTORED"
  | "STATUS_CHANGED"
  | "CLEANUP";
