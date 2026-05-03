import { apiRequest } from "./client";
import type { LegacyDecision } from "../data/legacyDecisions";

export type LegacyDecisionInput = {
  id?: string;
  projectId?: string;
  title: string;
  fileNumber?: string;
  authorityId?: string;
  authorityName?: string;
  issuedAt?: string;
  validFrom?: string;
  validUntil?: string;
  legacyStatus?: LegacyDecision["legacyStatus"];
  reviewStatus?: LegacyDecision["reviewStatus"];
  relevanceNote?: string;
  linkedLegalDocId?: string;
  supersededByLegalDocId?: string;
};

export async function listLegacyDecisions(projectId?: string) {
  const query = projectId ? `?projectId=${encodeURIComponent(projectId)}` : "";
  return apiRequest<LegacyDecision[]>(`/legacy-decisions${query}`);
}

export async function listProjectLegacyDecisions(projectId: string) {
  return apiRequest<LegacyDecision[]>(`/projects/${projectId}/legacy-decisions`);
}

export async function createLegacyDecision(projectId: string, input: LegacyDecisionInput) {
  const payload = await apiRequest<{ ok: boolean; legacyDecision: LegacyDecision }>(
    `/projects/${projectId}/legacy-decisions`,
    {
      method: "POST",
      body: input
    }
  );
  return payload.legacyDecision;
}

export async function updateLegacyDecision(id: string, input: Partial<LegacyDecisionInput>) {
  const payload = await apiRequest<{ ok: boolean; legacyDecision: LegacyDecision }>(
    `/legacy-decisions/${id}`,
    {
      method: "PATCH",
      body: input
    }
  );
  return payload.legacyDecision;
}

export async function archiveLegacyDecision(id: string) {
  const payload = await apiRequest<{ ok: boolean; legacyDecision: LegacyDecision }>(
    `/legacy-decisions/${id}/archive`,
    {
      method: "POST"
    }
  );
  return payload.legacyDecision;
}

export async function restoreLegacyDecision(id: string) {
  const payload = await apiRequest<{ ok: boolean; legacyDecision: LegacyDecision }>(
    `/legacy-decisions/${id}/restore`,
    {
      method: "POST"
    }
  );
  return payload.legacyDecision;
}
