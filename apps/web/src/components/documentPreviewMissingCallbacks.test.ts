import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { DocumentDto } from "../api/documents";
import type { DocumentsMutationScope } from "../state/DocumentsStore";
import { notifyDocumentPreviewMissingCallback } from "./documentPreviewMissingCallbacks";

function document(overrides: Partial<DocumentDto> = {}): DocumentDto {
  return {
    id: "document-1",
    ownerType: "PROJECT",
    ownerId: "project-1",
    category: "OTHER",
    fileVersion: 1,
    filename: "document-1.pdf",
    originalFilename: "document-1.pdf",
    mimeType: "application/pdf",
    sizeBytes: 1024,
    createdAt: "2026-05-18T08:00:00.000Z",
    createdByLabel: "Admin",
    approvalRequired: false,
    approvalStatus: "NOT_REQUIRED",
    ...overrides
  };
}

function mutationScope(): DocumentsMutationScope {
  return {
    ownerKey: "PROJECT:project-1",
    authScope: { generation: 0, userId: "user-a" }
  };
}

describe("document preview missing callbacks", () => {
  it("passes the captured preview request scope to FILE_MISSING callbacks", () => {
    const previewDocument = document();
    const capturedScope = mutationScope();
    let receivedDocument: DocumentDto | undefined;
    let receivedScope: DocumentsMutationScope | undefined;

    const result = notifyDocumentPreviewMissingCallback("FILE_MISSING", previewDocument, capturedScope, {
      onFileMissing: (nextDocument, nextScope) => {
        receivedDocument = nextDocument;
        receivedScope = nextScope;
      }
    });

    assert.equal(result, "file-missing");
    assert.equal(receivedDocument, previewDocument);
    assert.equal(receivedScope, capturedScope);
  });

  it("passes the captured preview request scope to DOCUMENT_NOT_FOUND callbacks", () => {
    const previewDocument = document();
    const capturedScope = mutationScope();
    let receivedDocument: DocumentDto | undefined;
    let receivedScope: DocumentsMutationScope | undefined;

    const result = notifyDocumentPreviewMissingCallback("DOCUMENT_NOT_FOUND", previewDocument, capturedScope, {
      onDocumentNotFound: (nextDocument, nextScope) => {
        receivedDocument = nextDocument;
        receivedScope = nextScope;
      }
    });

    assert.equal(result, "document-not-found");
    assert.equal(receivedDocument, previewDocument);
    assert.equal(receivedScope, capturedScope);
  });

  it("does not call mutating preview callbacks when no request scope was captured", () => {
    const previewDocument = document();
    let calls = 0;

    const fileMissingResult = notifyDocumentPreviewMissingCallback("FILE_MISSING", previewDocument, null, {
      onFileMissing: () => {
        calls += 1;
      }
    });
    const notFoundResult = notifyDocumentPreviewMissingCallback("DOCUMENT_NOT_FOUND", previewDocument, null, {
      onDocumentNotFound: () => {
        calls += 1;
      }
    });

    assert.equal(fileMissingResult, "file-missing");
    assert.equal(notFoundResult, "document-not-found");
    assert.equal(calls, 0);
  });

  it("allows non-mutating preview notices without a mutation scope", () => {
    const previewDocument = document();
    const notices: string[] = [];

    notifyDocumentPreviewMissingCallback("FILE_MISSING", previewDocument, null, {
      onPreviewFileMissing: (nextDocument) => {
        notices.push(nextDocument.id);
      }
    });
    notifyDocumentPreviewMissingCallback("DOCUMENT_NOT_FOUND", previewDocument, null, {
      onPreviewDocumentNotFound: (nextDocument) => {
        notices.push(nextDocument.id);
      }
    });

    assert.deepEqual(notices, ["document-1", "document-1"]);
  });
});
