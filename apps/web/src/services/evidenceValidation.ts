import {
  countAttachmentsForRequirements,
  inferAttachmentKind,
  type AttachmentMeta,
  type AttachmentRequirements
} from "../types/attachments";
import type { DocumentDto } from "../api/documents";

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

export type PendingEvidenceFile = Pick<File, "name" | "type" | "size" | "lastModified">;
export type PersistedEvidenceDocument = Pick<
  DocumentDto,
  "id" | "ownerType" | "ownerId" | "filename" | "originalFilename" | "mimeType" | "sizeBytes" | "createdAt"
>;

export function createPendingEvidenceAttachment(file: PendingEvidenceFile, index: number): AttachmentMeta {
  return {
    id: `pending-${file.name}-${file.lastModified}-${index}`,
    kind: inferAttachmentKind({ mime: file.type, filename: file.name }),
    filename: file.name,
    sizeKb: Math.max(1, Math.ceil(file.size / 1024)),
    mime: file.type || undefined,
    addedAt: new Date(Math.max(0, file.lastModified || Date.now())).toISOString().slice(0, 10),
    storage: "none"
  };
}

export function evidenceAttachmentsWithPendingFiles(
  attachments: AttachmentMeta[],
  files: PendingEvidenceFile[]
): AttachmentMeta[] {
  if (!files.length) {
    return attachments;
  }
  return [
    ...attachments,
    ...files.map((file, index) => createPendingEvidenceAttachment(file, index))
  ];
}

export function createPersistedEvidenceAttachment(document: PersistedEvidenceDocument): AttachmentMeta {
  const filename = document.originalFilename || document.filename;
  return {
    id: `doc-${document.id}`,
    kind: inferAttachmentKind({ mime: document.mimeType, filename }),
    filename,
    sizeKb: Math.max(1, Math.ceil(document.sizeBytes / 1024)),
    mime: document.mimeType || undefined,
    addedAt: document.createdAt.slice(0, 10),
    storage: "none"
  };
}

export function evidenceAttachmentsFromPersistedDocuments(
  documents: PersistedEvidenceDocument[]
): AttachmentMeta[] {
  return documents.map((document) => createPersistedEvidenceAttachment(document));
}

export function taskEvidenceDocumentsForOwner(
  documents: PersistedEvidenceDocument[],
  ownerId: string | undefined
): PersistedEvidenceDocument[] {
  if (!ownerId) {
    return [];
  }
  return documents.filter((document) => document.ownerType === "TASK_EVIDENCE" && document.ownerId === ownerId);
}

export function persistedEvidenceDocumentIdsForCompletionSubmit(
  _documents: PersistedEvidenceDocument[]
): string[] {
  return [];
}

export function evidenceAttachmentsForValidation(input: {
  persistedDocuments: PersistedEvidenceDocument[];
  pendingFiles: PendingEvidenceFile[];
}): AttachmentMeta[] {
  return evidenceAttachmentsWithPendingFiles(
    evidenceAttachmentsFromPersistedDocuments(input.persistedDocuments),
    input.pendingFiles
  );
}

export function validateEvidenceRequirements(
  requirements: AttachmentRequirements | undefined,
  attachments: AttachmentMeta[]
): EvidenceValidationResult {
  const counts = countAttachmentsForRequirements(requirements, attachments ?? []);
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
