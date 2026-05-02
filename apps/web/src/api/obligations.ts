import { apiRequest } from "./client";
import type { Obligation } from "../data/obligations";

type ObligationInput = {
  id?: string;
  legalDocId: string;
  projectId?: string;
  title: string;
  infoTextLong?: string;
  level?: Obligation["level"];
  criticality?: Obligation["criticality"];
  scheduleType?: Obligation["scheduleType"];
  firstDueDate?: string;
  recurrenceEndDate?: string;
  intervalUnit?: Obligation["intervalUnit"];
  intervalValue?: number;
  ownerUserId?: string;
  deputyUserId?: string;
  externalOrgId?: string;
  externalUserId?: string;
  origin?: Obligation["origin"];
  sourceSuggestionId?: string;
  sourceRunId?: string;
  emailReminderEnabled: boolean;
  emailReminderDaysBefore?: number;
  evidenceRequirements?: Obligation["evidenceRequirements"];
  archivedAt?: string;
  isArchived?: boolean;
};

function obligationPath(id: string) {
  return `/obligations/${encodeURIComponent(id)}`;
}

export async function listObligations() {
  return apiRequest<Obligation[]>("/obligations");
}

export async function getObligation(id: string) {
  const payload = await apiRequest<{ ok: boolean; obligation: Obligation }>(obligationPath(id));
  return payload.obligation;
}

export async function createObligation(input: ObligationInput) {
  const payload = await apiRequest<{ ok: boolean; obligation: Obligation }>("/obligations", {
    method: "POST",
    body: input
  });
  return payload.obligation;
}

export async function updateObligation(id: string, input: Partial<ObligationInput>) {
  const payload = await apiRequest<{ ok: boolean; obligation: Obligation }>(obligationPath(id), {
    method: "PATCH",
    body: input
  });
  return payload.obligation;
}

export async function archiveObligation(id: string) {
  const payload = await apiRequest<{ ok: boolean; obligation: Obligation }>(`${obligationPath(id)}/archive`, {
    method: "POST"
  });
  return payload.obligation;
}

export async function restoreObligation(id: string) {
  const payload = await apiRequest<{ ok: boolean; obligation: Obligation }>(`${obligationPath(id)}/restore`, {
    method: "POST"
  });
  return payload.obligation;
}

export async function deleteObligation(id: string) {
  return apiRequest<{ ok: boolean }>(obligationPath(id), {
    method: "DELETE"
  });
}

export async function bulkReplaceObligations(obligations: Obligation[]) {
  const payload = await apiRequest<{ ok: boolean; obligations: Obligation[] }>(
    "/admin/internal/obligations/bulk-replace",
    {
      method: "PUT",
      body: obligations
    }
  );
  return payload.obligations;
}

export async function bulkDeleteObligations() {
  return apiRequest<{ ok: boolean }>("/admin/internal/obligations/bulk-delete", {
    method: "DELETE"
  });
}
