import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createDocumentUploadFileKey,
  getPendingDocumentUploads,
  uploadDocumentsSequentially,
  type DocumentUploadFile
} from "./documentUploadBatch";

function file(name: string, index: number): DocumentUploadFile {
  return {
    name,
    type: "application/pdf",
    size: 1024 + index,
    lastModified: new Date(`2026-05-${String(index + 10).padStart(2, "0")}T08:00:00.000Z`).getTime()
  };
}

describe("document upload batch helpers", () => {
  it("returns successful uploads when a later upload fails", async () => {
    const attempted: string[] = [];
    const result = await uploadDocumentsSequentially(["a.pdf", "b.pdf", "c.pdf"], async (file) => {
      attempted.push(file);
      if (file === "b.pdf") {
        throw new Error("upload failed");
      }
      return `doc-${file}`;
    });

    assert.equal(result.completed, false);
    assert.deepEqual(result.uploaded, ["doc-a.pdf"]);
    assert.ok(result.error instanceof Error);
    assert.deepEqual(attempted, ["a.pdf", "b.pdf"]);
  });

  it("returns all uploaded documents when the batch completes", async () => {
    const result = await uploadDocumentsSequentially(["a.pdf", "b.pdf"], async (file, index) => ({
      id: `doc-${index}`,
      filename: file
    }));

    assert.deepEqual(result, {
      completed: true,
      uploaded: [
        { id: "doc-0", filename: "a.pdf" },
        { id: "doc-1", filename: "b.pdf" }
      ]
    });
  });

  it("skips files already uploaded after a partial failure", () => {
    const first = file("a.pdf", 0);
    const second = file("b.pdf", 1);
    const uploadedKeys = new Set([createDocumentUploadFileKey(first)]);

    const pendingUploads = getPendingDocumentUploads([first, second], uploadedKeys);

    assert.deepEqual(
      pendingUploads.map((entry) => entry.file.name),
      ["b.pdf"]
    );
  });
});
