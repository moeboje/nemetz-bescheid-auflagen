import { apiRequest } from "./client";
import type { LegalDoc } from "../data/legalDocs";
import type { DomainProjectOption } from "../data/projects";

type LegalDocInput = {
  id?: string;
  projectId: string;
  type: LegalDoc["type"];
  title: string;
  shortDescription?: string;
  detailedDescription?: string;
  contentSummary?: string;
  reference?: string;
  issuedAt?: string;
  authorityId?: string;
  authorityContactId?: string;
  attachments?: LegalDoc["attachments"];
  aiExtraction?: LegalDoc["aiExtraction"];
  scopeOverride?: LegalDoc["scopeOverride"];
  archivedAt?: string;
  isArchived?: boolean;
};

export type LegalDocLookup = Omit<
  LegalDoc,
  "attachments" | "aiExtraction" | "detailedDescription" | "contentSummary"
> & {
  attachments?: LegalDoc["attachments"];
  aiExtraction?: LegalDoc["aiExtraction"];
  detailedDescription?: string;
  contentSummary?: string;
};

export async function listLegalDocs() {
  return apiRequest<LegalDoc[]>("/legal-docs");
}

export async function listLegalDocProjectOptions() {
  return apiRequest<DomainProjectOption[]>("/legal-docs/project-options");
}

export async function getLegalDoc(id: string) {
  const payload = await apiRequest<{ ok: boolean; legalDoc: LegalDoc }>(`/legal-docs/${id}`);
  return payload.legalDoc;
}

export async function lookupLegalDocs(input: { ids?: string[]; projectId?: string }) {
  const params = new URLSearchParams();
  const ids = Array.from(new Set((input.ids ?? []).map((id) => id.trim()).filter(Boolean)));
  if (ids.length > 0) {
    params.set("ids", ids.join(","));
  }
  if (input.projectId?.trim()) {
    params.set("projectId", input.projectId.trim());
  }
  const query = params.toString();
  const payload = await apiRequest<{ ok: boolean; legalDocs: LegalDocLookup[] }>(
    `/legal-docs/lookup${query ? `?${query}` : ""}`
  );
  return payload.legalDocs;
}

export async function createLegalDoc(input: LegalDocInput) {
  const payload = await apiRequest<{ ok: boolean; legalDoc: LegalDoc }>("/legal-docs", {
    method: "POST",
    body: input
  });
  return payload.legalDoc;
}

export async function updateLegalDoc(id: string, input: Partial<LegalDocInput>) {
  const payload = await apiRequest<{ ok: boolean; legalDoc: LegalDoc }>(`/legal-docs/${id}`, {
    method: "PATCH",
    body: input
  });
  return payload.legalDoc;
}

export async function archiveLegalDoc(id: string) {
  const payload = await apiRequest<{ ok: boolean; legalDoc: LegalDoc }>(`/legal-docs/${id}/archive`, {
    method: "POST"
  });
  return payload.legalDoc;
}

export async function restoreLegalDoc(id: string) {
  const payload = await apiRequest<{ ok: boolean; legalDoc: LegalDoc }>(`/legal-docs/${id}/restore`, {
    method: "POST"
  });
  return payload.legalDoc;
}

export async function bulkReplaceLegalDocs(legalDocs: LegalDoc[]) {
  const payload = await apiRequest<{ ok: boolean; legalDocs: LegalDoc[] }>(
    "/admin/internal/legal-docs/bulk-replace",
    {
      method: "PUT",
      body: legalDocs
    }
  );
  return payload.legalDocs;
}

export async function bulkDeleteLegalDocs() {
  return apiRequest<{ ok: boolean }>("/admin/internal/legal-docs/bulk-delete", {
    method: "DELETE"
  });
}
