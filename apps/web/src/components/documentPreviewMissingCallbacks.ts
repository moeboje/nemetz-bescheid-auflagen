import type { DocumentApiErrorCode, DocumentDto } from "../api/documents";
import type { DocumentsMutationScope } from "../state/DocumentsStore";

export type DocumentPreviewMissingCallbacks = {
  onFileMissing?: (document: DocumentDto, mutationScope: DocumentsMutationScope) => void;
  onDocumentNotFound?: (document: DocumentDto, mutationScope: DocumentsMutationScope) => void;
  onPreviewFileMissing?: (document: DocumentDto) => void;
  onPreviewDocumentNotFound?: (document: DocumentDto) => void;
};

export type DocumentPreviewMissingResult = "file-missing" | "document-not-found" | "other";

export function notifyDocumentPreviewMissingCallback(
  errorCode: DocumentApiErrorCode | undefined,
  document: DocumentDto,
  mutationScope: DocumentsMutationScope | null,
  callbacks: DocumentPreviewMissingCallbacks
): DocumentPreviewMissingResult {
  if (errorCode === "FILE_MISSING") {
    if (mutationScope) {
      callbacks.onFileMissing?.(document, mutationScope);
    }
    callbacks.onPreviewFileMissing?.(document);
    return "file-missing";
  }

  if (errorCode === "DOCUMENT_NOT_FOUND") {
    if (mutationScope) {
      callbacks.onDocumentNotFound?.(document, mutationScope);
    }
    callbacks.onPreviewDocumentNotFound?.(document);
    return "document-not-found";
  }

  return "other";
}
