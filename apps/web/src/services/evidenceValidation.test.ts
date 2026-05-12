import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DocumentOwnerType } from "../api/documents";
import type { AttachmentMeta } from "../types/attachments";
import {
  evidenceAttachmentsForValidation,
  persistedEvidenceDocumentIdsForCompletionSubmit,
  taskEvidenceDocumentsForOwner,
  validateEvidenceRequirements,
  type PendingEvidenceFile,
  type PersistedEvidenceDocument
} from "./evidenceValidation";

const taskOwnerId = "obligation:ob-1:2026-05-12";

function document(
  overrides: Partial<PersistedEvidenceDocument> & {
    ownerType?: DocumentOwnerType;
    ownerId?: string;
  } = {}
): PersistedEvidenceDocument {
  return {
    id: overrides.id ?? "doc-1",
    ownerType: overrides.ownerType ?? "TASK_EVIDENCE",
    ownerId: overrides.ownerId ?? taskOwnerId,
    filename: overrides.filename ?? "nachweis.pdf",
    originalFilename: overrides.originalFilename,
    mimeType: overrides.mimeType ?? "application/pdf",
    sizeBytes: overrides.sizeBytes ?? 1024,
    createdAt: overrides.createdAt ?? "2026-05-12T08:00:00.000Z"
  };
}

function pendingFile(overrides: Partial<PendingEvidenceFile> = {}): PendingEvidenceFile {
  return {
    name: overrides.name ?? "protokoll.docx",
    type: overrides.type ?? "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    size: overrides.size ?? 2048,
    lastModified: overrides.lastModified ?? new Date("2026-05-12T08:00:00.000Z").getTime()
  };
}

describe("evidence validation documents", () => {
  it("counts persisted TASK_EVIDENCE image documents for photo requirements", () => {
    const persistedDocuments = taskEvidenceDocumentsForOwner(
      [document({ filename: "foto.jpg", mimeType: "image/jpeg" })],
      taskOwnerId
    );

    const validation = validateEvidenceRequirements(
      { requirePhoto: true },
      evidenceAttachmentsForValidation({ persistedDocuments, pendingFiles: [] })
    );

    assert.equal(validation.ok, true);
    assert.equal(validation.counts.photos, 1);
  });

  it("counts persisted TASK_EVIDENCE PDF documents for document requirements", () => {
    const persistedDocuments = taskEvidenceDocumentsForOwner(
      [document({ filename: "bericht.pdf", mimeType: "application/pdf" })],
      taskOwnerId
    );

    const validation = validateEvidenceRequirements(
      { requireDocument: true },
      evidenceAttachmentsForValidation({ persistedDocuments, pendingFiles: [] })
    );

    assert.equal(validation.ok, true);
    assert.equal(validation.counts.docs, 1);
  });

  it("counts persisted TASK_EVIDENCE PDF documents for report requirements", () => {
    const persistedDocuments = taskEvidenceDocumentsForOwner(
      [document({ filename: "bericht.pdf", mimeType: "application/pdf" })],
      taskOwnerId
    );

    const validation = validateEvidenceRequirements(
      { requireReport: true },
      evidenceAttachmentsForValidation({ persistedDocuments, pendingFiles: [] })
    );

    assert.equal(validation.ok, true);
    assert.equal(validation.counts.reports, 1);
  });

  it("combines persisted evidence and pending files without using client-only attachments", () => {
    const browserOnlyAttachment: AttachmentMeta = {
      id: "browser-only",
      kind: "PHOTO",
      filename: "browser-only.jpg",
      storage: "indexeddb",
      addedAt: "2026-05-12"
    };
    const persistedDocuments = taskEvidenceDocumentsForOwner(
      [document({ filename: "bericht.pdf", mimeType: "application/pdf" })],
      taskOwnerId
    );

    const validation = validateEvidenceRequirements(
      { requireDocument: true, requirePhoto: true },
      evidenceAttachmentsForValidation({
        persistedDocuments,
        pendingFiles: [pendingFile({ name: "foto.jpg", type: "image/jpeg" })]
      })
    );

    assert.equal(browserOnlyAttachment.storage, "indexeddb");
    assert.equal(validation.ok, true);
    assert.equal(validation.counts.docs, 1);
    assert.equal(validation.counts.photos, 1);
  });

  it("does not count wrong ownerType or ownerId documents", () => {
    const persistedDocuments = taskEvidenceDocumentsForOwner(
      [
        document({ id: "wrong-type", ownerType: "DEADLINE" }),
        document({ id: "wrong-owner", ownerId: "obligation:other:2026-05-12" })
      ],
      taskOwnerId
    );

    const validation = validateEvidenceRequirements(
      { requireDocument: true },
      evidenceAttachmentsForValidation({ persistedDocuments, pendingFiles: [] })
    );

    assert.equal(validation.ok, false);
    assert.deepEqual(validation.errors, ["evidence.validation.missingDocument"]);
  });

  it("does not submit unchecked persisted evidence document ids", () => {
    const persistedDocuments = taskEvidenceDocumentsForOwner(
      [document({ id: "existing-doc" })],
      taskOwnerId
    );

    assert.deepEqual(persistedEvidenceDocumentIdsForCompletionSubmit(persistedDocuments), []);
  });
});
