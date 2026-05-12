import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { PendingEvidenceFile } from "./evidenceValidation";
import {
  createPendingEvidenceFileKey,
  getPendingEvidenceFilesToUpload,
  mergeEvidenceDocumentIds,
  mergeUploadedEvidenceFiles,
  type UploadedEvidenceFile
} from "./evidenceUploadRetry";

function file(name: string, index: number): PendingEvidenceFile {
  return {
    name,
    type: "application/pdf",
    size: 1024 + index,
    lastModified: new Date(`2026-05-${String(index + 10).padStart(2, "0")}T08:00:00.000Z`).getTime()
  };
}

describe("evidence upload retry helpers", () => {
  it("skips files that already have uploaded evidence document ids", () => {
    const first = file("a.pdf", 0);
    const second = file("b.pdf", 1);
    const uploadedFiles: UploadedEvidenceFile[] = [
      {
        fileKey: createPendingEvidenceFileKey(first, 0),
        documentId: "doc-a"
      }
    ];

    const pending = getPendingEvidenceFilesToUpload([first, second], uploadedFiles);

    assert.deepEqual(
      pending.map((entry) => entry.file.name),
      ["b.pdf"]
    );
  });

  it("deduplicates existing, uploaded and newly uploaded evidence document ids", () => {
    assert.deepEqual(
      mergeEvidenceDocumentIds(["persisted-a", "uploaded-a"], ["uploaded-a", "uploaded-b"], ["uploaded-b"]),
      ["persisted-a", "uploaded-a", "uploaded-b"]
    );
  });

  it("keeps the latest document id for an uploaded file key", () => {
    const fileKey = createPendingEvidenceFileKey(file("a.pdf", 0), 0);

    const uploadedFiles = mergeUploadedEvidenceFiles(
      [{ fileKey, documentId: "old-doc" }],
      { fileKey, documentId: "new-doc" }
    );

    assert.deepEqual(uploadedFiles, [{ fileKey, documentId: "new-doc" }]);
  });
});
