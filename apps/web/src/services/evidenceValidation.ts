import {
  countAttachmentsByKind,
  type AttachmentMeta,
  type AttachmentRequirements
} from "../types/attachments";

export type EvidenceValidationErrorKey =
  | "evidence.validation.missingPhoto"
  | "evidence.validation.missingDocument"
  | "evidence.validation.missingReport";

export type EvidenceValidationResult = {
  ok: boolean;
  errors: EvidenceValidationErrorKey[];
  counts: {
    photos: number;
    docs: number;
    reports: number;
  };
};

export function validateEvidenceRequirements(
  requirements: AttachmentRequirements | undefined,
  attachments: AttachmentMeta[]
): EvidenceValidationResult {
  const counts = countAttachmentsByKind(attachments ?? []);
  const errors: EvidenceValidationErrorKey[] = [];

  if (requirements?.requirePhoto && counts.PHOTO === 0) {
    errors.push("evidence.validation.missingPhoto");
  }
  if (requirements?.requireDocument && counts.DOCUMENT === 0) {
    errors.push("evidence.validation.missingDocument");
  }
  if (requirements?.requireReport && counts.REPORT === 0) {
    errors.push("evidence.validation.missingReport");
  }

  return {
    ok: errors.length === 0,
    errors,
    counts: {
      photos: counts.PHOTO,
      docs: counts.DOCUMENT,
      reports: counts.REPORT
    }
  };
}
