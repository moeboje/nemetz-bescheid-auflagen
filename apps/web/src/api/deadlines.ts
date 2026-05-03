import { apiRequest } from "./client";
import type { Deadline } from "../data/deadlines";
import type { DomainProjectOption } from "../data/projects";
import type { AttachmentMeta } from "../types/attachments";
import type { EvidenceOutcome } from "../types/evidence";

type DeadlineInput = {
  id?: string;
  title: string;
  description?: string;
  dueDate: string;
  status?: Deadline["status"];
  projectId?: string;
  legalDocId?: string;
  authorityId?: string;
  ownerUserId?: string;
  deputyUserId?: string;
  emailReminderEnabled: boolean;
  emailReminderDaysBefore?: number;
  completedAt?: string;
  completedByUserId?: string;
  evidence?: Deadline["evidence"];
  archivedAt?: string;
  isArchived?: boolean;
};

export async function listDeadlines() {
  return apiRequest<Deadline[]>("/deadlines");
}

export async function listDeadlineProjectOptions() {
  return apiRequest<DomainProjectOption[]>("/deadlines/project-options");
}

export async function getDeadline(id: string) {
  const payload = await apiRequest<{ ok: boolean; deadline: Deadline }>(`/deadlines/${id}`);
  return payload.deadline;
}

export async function createDeadline(input: DeadlineInput) {
  const payload = await apiRequest<{ ok: boolean; deadline: Deadline }>("/deadlines", {
    method: "POST",
    body: input
  });
  return payload.deadline;
}

export async function updateDeadline(id: string, input: Partial<DeadlineInput>) {
  const payload = await apiRequest<{ ok: boolean; deadline: Deadline }>(`/deadlines/${id}`, {
    method: "PATCH",
    body: input
  });
  return payload.deadline;
}

export async function setDeadlineStatus(id: string, status: Deadline["status"]) {
  const payload = await apiRequest<{ ok: boolean; deadline: Deadline }>(`/deadlines/${id}/status`, {
    method: "POST",
    body: {
      status
    }
  });
  return payload.deadline;
}

export async function completeDeadline(
  id: string,
  input: { note?: string; outcome?: EvidenceOutcome; attachments: AttachmentMeta[] }
) {
  const payload = await apiRequest<{ ok: boolean; deadline: Deadline }>(`/deadlines/${id}/complete`, {
    method: "POST",
    body: input
  });
  return payload.deadline;
}

export async function reopenDeadline(id: string) {
  const payload = await apiRequest<{ ok: boolean; deadline: Deadline }>(`/deadlines/${id}/reopen`, {
    method: "POST"
  });
  return payload.deadline;
}

export async function markDeadlineAttachmentUnavailable(id: string, attachmentId: string) {
  const payload = await apiRequest<{ ok: boolean; deadline: Deadline }>(
    `/deadlines/${id}/attachments/${encodeURIComponent(attachmentId)}/mark-unavailable`,
    {
      method: "POST"
    }
  );
  return payload.deadline;
}

export async function archiveDeadline(id: string) {
  const payload = await apiRequest<{ ok: boolean; deadline: Deadline }>(`/deadlines/${id}/archive`, {
    method: "POST"
  });
  return payload.deadline;
}

export async function restoreDeadline(id: string) {
  const payload = await apiRequest<{ ok: boolean; deadline: Deadline }>(`/deadlines/${id}/restore`, {
    method: "POST"
  });
  return payload.deadline;
}

export async function bulkReplaceDeadlines(deadlines: Deadline[]) {
  const payload = await apiRequest<{ ok: boolean; deadlines: Deadline[] }>(
    "/admin/internal/deadlines/bulk-replace",
    {
      method: "PUT",
      body: deadlines
    }
  );
  return payload.deadlines;
}

export async function bulkDeleteDeadlines() {
  return apiRequest<{ ok: boolean }>("/admin/internal/deadlines/bulk-delete", {
    method: "DELETE"
  });
}
