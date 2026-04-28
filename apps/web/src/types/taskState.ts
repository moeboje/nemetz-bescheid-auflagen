import type { AttachmentMeta } from "./attachments";
import type { Evidence, EvidenceOutcome } from "./evidence";

export type TaskInstanceStatus = "OPEN" | "IN_PROGRESS" | "DONE";

export type TaskStateEntry = {
  status: TaskInstanceStatus;
  completedAt?: string;
  completedByUserId?: string;
  completedByLabel?: string;
  evidence?: Evidence[];
  updatedAt: string;
};

export type TaskStateMap = Record<string, TaskStateEntry>;

export type EvidenceInput = {
  note?: string;
  outcome?: EvidenceOutcome;
  attachments: AttachmentMeta[];
};
