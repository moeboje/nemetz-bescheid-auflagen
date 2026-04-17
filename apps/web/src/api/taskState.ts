import { apiRequest } from "./client";
import type { EvidenceInput, TaskInstanceStatus, TaskStateEntry, TaskStateMap } from "../types/taskState";

export async function listTaskState() {
  return apiRequest<TaskStateMap>("/task-state");
}

export async function reconcileLegacyTaskState(taskState: TaskStateMap) {
  const payload = await apiRequest<{ ok: boolean; taskState: TaskStateMap }>(
    "/task-state/reconcile-legacy",
    {
      method: "POST",
      body: { taskState }
    }
  );
  return payload.taskState;
}

export async function setTaskStateStatus(taskInstanceId: string, status: TaskInstanceStatus) {
  const payload = await apiRequest<{ ok: boolean; taskStateEntry: TaskStateEntry }>(
    `/task-state/${encodeURIComponent(taskInstanceId)}/status`,
    {
      method: "POST",
      body: { status }
    }
  );
  return payload.taskStateEntry;
}

export async function completeTaskState(taskInstanceId: string, input: EvidenceInput) {
  const payload = await apiRequest<{ ok: boolean; taskStateEntry: TaskStateEntry }>(
    `/task-state/${encodeURIComponent(taskInstanceId)}/complete`,
    {
      method: "POST",
      body: input
    }
  );
  return payload.taskStateEntry;
}

export async function addTaskStateEvidence(taskInstanceId: string, input: EvidenceInput) {
  const payload = await apiRequest<{ ok: boolean; taskStateEntry: TaskStateEntry }>(
    `/task-state/${encodeURIComponent(taskInstanceId)}/evidence`,
    {
      method: "POST",
      body: input
    }
  );
  return payload.taskStateEntry;
}

export async function reopenTaskState(taskInstanceId: string) {
  const payload = await apiRequest<{ ok: boolean; taskStateEntry: TaskStateEntry }>(
    `/task-state/${encodeURIComponent(taskInstanceId)}/reopen`,
    {
      method: "POST"
    }
  );
  return payload.taskStateEntry;
}

export async function markTaskStateAttachmentUnavailable(taskInstanceId: string, attachmentId: string) {
  return apiRequest<{ ok: boolean; changed: boolean; taskStateEntry: TaskStateEntry | null }>(
    `/task-state/${encodeURIComponent(taskInstanceId)}/attachments/${encodeURIComponent(attachmentId)}/mark-unavailable`,
    {
      method: "POST"
    }
  );
}

export async function cleanupOldTaskState(horizonDays?: number) {
  return apiRequest<{ ok: boolean; removedCount: number; taskState: TaskStateMap }>(
    "/admin/internal/task-state/cleanup-old",
    {
      method: "POST",
      body: { horizonDays }
    }
  );
}

export async function bulkReplaceTaskState(taskState: TaskStateMap) {
  const payload = await apiRequest<{ ok: boolean; taskState: TaskStateMap }>(
    "/admin/internal/task-state/bulk-replace",
    {
      method: "PUT",
      body: taskState
    }
  );
  return payload.taskState;
}

export async function bulkDeleteTaskState() {
  await apiRequest<{ ok: boolean }>("/admin/internal/task-state/bulk-delete", {
    method: "DELETE"
  });
}
