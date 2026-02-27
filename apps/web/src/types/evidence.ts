import type { AttachmentMeta } from "./attachments";

export type EvidenceOutcome = "OK" | "NOK" | "FOLLOW_UP";
export type { AttachmentMeta };

export type Evidence = {
  id: string;
  note?: string;
  outcome?: EvidenceOutcome;
  attachments: AttachmentMeta[];
  createdAt: string;
  createdByUserId?: string;
  createdByLabel?: string;
};
