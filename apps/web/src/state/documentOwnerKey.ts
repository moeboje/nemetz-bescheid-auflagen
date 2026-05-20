import type { DocumentOwnerType } from "../api/documents";

export function getDocumentOwnerKey(ownerType: DocumentOwnerType, ownerId: string) {
  return `${ownerType}:${ownerId}`;
}
