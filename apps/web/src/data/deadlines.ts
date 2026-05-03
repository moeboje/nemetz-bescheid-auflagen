import type { Evidence } from "../types/evidence";

export type DeadlineStatus = "OPEN" | "DONE" | "OVERDUE";
export type DeadlineStoredStatus = Exclude<DeadlineStatus, "OVERDUE">;

export type Deadline = {
  id: string;
  title: string;
  description?: string;
  dueDate: string;
  status: DeadlineStoredStatus;
  projectId?: string;
  resolvedProjectId?: string;
  projectTitle?: string;
  currentUserCanWriteProject?: boolean;
  legalDocId?: string;
  authorityId?: string;
  ownerUserId?: string;
  deputyUserId?: string;
  emailReminderEnabled: boolean;
  emailReminderDaysBefore?: number;
  completedAt?: string;
  completedByUserId?: string;
  evidence?: Evidence[];
  archivedAt?: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
};

const seedTimestamp = "2026-02-01T09:00:00.000Z";

export const deadlines: Deadline[] = [];
