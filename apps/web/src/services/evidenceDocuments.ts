import { listDocuments, uploadDocument, type DocumentDto, type DocumentOwnerType } from "../api/documents";

export async function listEvidenceDocuments(ownerType: DocumentOwnerType, ownerId: string) {
  return listDocuments(ownerType, ownerId);
}

export async function uploadEvidenceDocument(ownerType: DocumentOwnerType, ownerId: string, file: File) {
  return uploadDocument(ownerType, ownerId, file);
}

export async function uploadEvidenceDocuments(ownerType: DocumentOwnerType, ownerId: string, files: File[]) {
  const documents: DocumentDto[] = [];
  for (const file of files) {
    documents.push(await uploadEvidenceDocument(ownerType, ownerId, file));
  }
  return documents;
}

export function createEvidenceUploadError(message: string, options?: { completionSaved?: boolean }) {
  const error = new Error(message);
  error.name = "EvidenceUploadError";
  (error as Error & { completionSaved?: boolean }).completionSaved = options?.completionSaved ?? true;
  return error;
}
