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
  | "CLEANUP"
  | "EVIDENCE_ADDED"
  | "TASK_COMPLETED"
  | "NOTIFICATION_DISMISSED"
  | "NOTIFICATION_SNOOZED"
  | "AI_RUN_STARTED"
  | "AI_RUN_COMPLETED"
  | "AI_FIELDS_APPLIED"
  | "AI_SUGGESTION_ACCEPTED"
  | "AI_SUGGESTION_REJECTED";
