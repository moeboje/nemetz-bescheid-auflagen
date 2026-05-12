import type { DocumentOwnerType } from "../api/documents";

export function canUploadTaskEvidence(input: {
  ownerType: DocumentOwnerType | undefined;
  projectCanWrite: boolean | undefined;
  canCompleteTasks: boolean;
  canEditDeadlines: boolean;
  isExternal: boolean;
}) {
  if (input.isExternal || !input.projectCanWrite) {
    return false;
  }
  if (input.ownerType === "DEADLINE") {
    return input.canCompleteTasks || input.canEditDeadlines;
  }
  if (input.ownerType === "TASK_EVIDENCE") {
    return input.canCompleteTasks;
  }
  return false;
}
