import { ApiError, apiRequest, resolveApiUrl } from "./client";

export type DocumentOwnerType =
  | "PROJECT"
  | "LEGAL_DOC"
  | "OBLIGATION"
  | "DEADLINE"
  | "TASK_EVIDENCE"
  | "LEGACY_DECISION";

export type DocumentCategory =
  | "SUBMISSION"
  | "AUTHORITY_CORRESPONDENCE"
  | "LAWYER_EXTERNAL_CORRESPONDENCE"
  | "LEGAL_DECISIONS"
  | "OBLIGATION_EVIDENCE"
  | "REPORTS_INSPECTIONS"
  | "PLANS_DRAWINGS"
  | "INTERNAL_WORKING_DOCS"
  | "CONTRACTS"
  | "OTHER";

export type DocumentApprovalStatus =
  | "NOT_REQUIRED"
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "CHANGES_REQUESTED"
  | "CANCELLED";

export type DocumentDto = {
  id: string;
  ownerType: DocumentOwnerType;
  ownerId: string;
  category: DocumentCategory;
  fileVersion: number;
  filename: string;
  originalFilename?: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
  createdByUserId?: string;
  createdByLabel?: string;
  approvalRequired: boolean;
  approvalStatus: DocumentApprovalStatus;
  approvalRequestId?: string;
  approvalRequestedByUserId?: string;
  approvalRequestedByLabel?: string;
  approvalRequestedAt?: string;
  approvalRequestedComment?: string;
  approverUserId?: string;
  approverLabel?: string;
  approvalDecidedByUserId?: string;
  approvalDecidedByLabel?: string;
  approvalDecidedAt?: string;
  approvalDecisionComment?: string;
};

export type DocumentUploadOptions = {
  category?: DocumentCategory;
  approvalRequired?: boolean;
  approvalRequestedComment?: string;
  approverUserId?: string | null;
};

export type DocumentMetadataUpdate = {
  category?: DocumentCategory;
  approvalRequired?: boolean;
  approvalRequestedComment?: string;
  approverUserId?: string | null;
};

export type DocumentApprovalAction = "request" | "approve" | "reject" | "changesRequested" | "cancel";

export type DocumentApprovalInput = {
  action: DocumentApprovalAction;
  comment?: string;
  approverUserId?: string | null;
};

export type DocumentApiErrorCode =
  | "DOCUMENT_NOT_FOUND"
  | "FILE_MISSING"
  | "INVALID_STORAGE_PATH"
  | "TASK_EVIDENCE_DELETE_BLOCKED"
  | "DOCUMENT_FILE_TYPE_NOT_ALLOWED";

function parseErrorMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object" && "message" in payload && typeof payload.message === "string") {
    return payload.message;
  }
  return fallback;
}

function parseErrorCode(payload: unknown): DocumentApiErrorCode | undefined {
  if (!payload || typeof payload !== "object" || !("errorCode" in payload)) {
    return undefined;
  }
  const errorCode = payload.errorCode;
  if (
    errorCode === "DOCUMENT_NOT_FOUND" ||
    errorCode === "FILE_MISSING" ||
    errorCode === "INVALID_STORAGE_PATH" ||
    errorCode === "TASK_EVIDENCE_DELETE_BLOCKED" ||
    errorCode === "DOCUMENT_FILE_TYPE_NOT_ALLOWED"
  ) {
    return errorCode;
  }
  return undefined;
}

export function getDocumentApiErrorCode(error: unknown): DocumentApiErrorCode | undefined {
  if (error instanceof ApiError) {
    return parseErrorCode(error.payload);
  }
  return undefined;
}

async function parseJsonResponse(response: Response) {
  const raw = await response.text();
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

export async function listDocuments(ownerType: DocumentOwnerType, ownerId: string) {
  const query = new URLSearchParams({
    ownerType,
    ownerId
  });
  const payload = await apiRequest<{ items: DocumentDto[] }>(`/documents?${query.toString()}`);
  return payload.items ?? [];
}

export async function getDocument(documentId: string) {
  const payload = await apiRequest<{ document: DocumentDto }>(`/documents/${encodeURIComponent(documentId)}`);
  return payload.document;
}

export async function uploadDocument(ownerType: DocumentOwnerType, ownerId: string, file: File, options: DocumentUploadOptions = {}) {
  const form = new FormData();
  form.set("ownerType", ownerType);
  form.set("ownerId", ownerId);
  form.set("file", file);
  if (options.category) {
    form.set("category", options.category);
  }
  if (options.approvalRequired) {
    form.set("approvalRequired", "true");
  }
  if (options.approvalRequestedComment) {
    form.set("approvalRequestedComment", options.approvalRequestedComment);
  }
  if (options.approverUserId) {
    form.set("approverUserId", options.approverUserId);
  }

  const response = await fetch(resolveApiUrl("/documents"), {
    method: "POST",
    credentials: "include",
    body: form
  });
  const payload = await parseJsonResponse(response);

  if (!response.ok) {
    throw new ApiError(response.status, parseErrorMessage(payload, response.statusText || "request_failed"), payload);
  }

  if (!payload || typeof payload !== "object" || !("document" in payload)) {
    throw new ApiError(500, "Invalid upload response.", payload);
  }

  return (payload as { document: DocumentDto }).document;
}

export async function updateDocumentMetadata(documentId: string, input: DocumentMetadataUpdate) {
  const payload = await apiRequest<{ document: DocumentDto }>(`/documents/${encodeURIComponent(documentId)}`, {
    method: "PATCH",
    body: input
  });
  return payload.document;
}

export async function updateDocumentApproval(documentId: string, input: DocumentApprovalInput) {
  const payload = await apiRequest<{ document: DocumentDto }>(`/documents/${encodeURIComponent(documentId)}/approval`, {
    method: "PATCH",
    body: input
  });
  return payload.document;
}

export async function replaceDocumentFile(documentId: string, file: File) {
  const form = new FormData();
  form.set("file", file);

  const response = await fetch(resolveApiUrl(`/documents/${encodeURIComponent(documentId)}/file`), {
    method: "PUT",
    credentials: "include",
    body: form
  });
  const payload = await parseJsonResponse(response);

  if (!response.ok) {
    throw new ApiError(response.status, parseErrorMessage(payload, response.statusText || "request_failed"), payload);
  }

  if (!payload || typeof payload !== "object" || !("document" in payload)) {
    throw new ApiError(500, "Invalid replace response.", payload);
  }

  return (payload as { document: DocumentDto }).document;
}

export async function deleteDocument(documentId: string) {
  await apiRequest<{ ok: boolean }>(`/documents/${encodeURIComponent(documentId)}`, {
    method: "DELETE"
  });
}

export function downloadUrl(documentId: string, forceDownload = false) {
  const encodedId = encodeURIComponent(documentId);
  const base = resolveApiUrl(`/documents/${encodedId}/file`);
  return forceDownload ? `${base}?download=1` : base;
}

export async function fetchDocumentBlob(documentId: string) {
  const response = await fetch(downloadUrl(documentId), {
    credentials: "include"
  });
  if (!response.ok) {
    const payload = await parseJsonResponse(response);
    throw new ApiError(response.status, parseErrorMessage(payload, response.statusText || "request_failed"), payload);
  }
  return response.blob();
}
