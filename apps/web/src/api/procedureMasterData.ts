import { apiRequest } from "./client";
import type {
  LegalMatter,
  ProcedureMasterDataSnapshot,
  ProcedureType,
  SubmissionType
} from "../data/procedureMasterData";

type LegalMatterInput = {
  id?: string;
  code?: string;
  name: string;
  shortName?: string;
  description?: string;
  isActive?: boolean;
  sortOrder?: number;
  badgeVariant?: string;
};

type ProcedureTypeInput = {
  id?: string;
  code?: string;
  name: string;
  shortName?: string;
  description?: string;
  isActive?: boolean;
  sortOrder?: number;
};

type SubmissionTypeInput = {
  id?: string;
  code?: string;
  name: string;
  shortName?: string;
  description?: string;
  legalMatterId: string;
  procedureTypeId: string;
  isActive?: boolean;
  isLegacy?: boolean;
  sortOrder?: number;
  badgeVariant?: string;
  legacyAliases?: string[];
};

export type ProcedureMasterDataImportMapping = {
  legalMatterIds: Record<string, string>;
  procedureTypeIds: Record<string, string>;
  submissionTypeIds: Record<string, string>;
  submissionTypeCodes: Record<string, string>;
};

export type ProcedureMasterDataImportResult = ProcedureMasterDataSnapshot & {
  idMapping: ProcedureMasterDataImportMapping;
};

export async function listProcedureMasterData() {
  const payload = await apiRequest<ProcedureMasterDataSnapshot & { ok: boolean }>("/procedure-master-data");
  return {
    legalMatters: payload.legalMatters,
    procedureTypes: payload.procedureTypes,
    submissionTypes: payload.submissionTypes
  };
}

export async function listAdminProcedureMasterData() {
  const payload = await apiRequest<ProcedureMasterDataSnapshot & { ok: boolean }>("/admin/procedure-master-data");
  return {
    legalMatters: payload.legalMatters,
    procedureTypes: payload.procedureTypes,
    submissionTypes: payload.submissionTypes
  };
}

export async function bulkReplaceProcedureMasterData(input: ProcedureMasterDataSnapshot) {
  const payload = await apiRequest<ProcedureMasterDataImportResult & { ok: boolean }>(
    "/admin/internal/procedure-master-data/bulk-replace",
    {
      method: "PUT",
      body: input
    }
  );
  return {
    legalMatters: payload.legalMatters,
    procedureTypes: payload.procedureTypes,
    submissionTypes: payload.submissionTypes,
    idMapping: payload.idMapping
  };
}

export async function createLegalMatter(input: LegalMatterInput) {
  const payload = await apiRequest<{ ok: boolean; legalMatter: LegalMatter }>(
    "/admin/procedure-master-data/legal-matters",
    {
      method: "POST",
      body: input
    }
  );
  return payload.legalMatter;
}

export async function updateLegalMatter(id: string, input: Partial<LegalMatterInput>) {
  const payload = await apiRequest<{ ok: boolean; legalMatter: LegalMatter }>(
    `/admin/procedure-master-data/legal-matters/${id}`,
    {
      method: "PATCH",
      body: input
    }
  );
  return payload.legalMatter;
}

export async function deactivateLegalMatter(id: string) {
  const payload = await apiRequest<{ ok: boolean; legalMatter: LegalMatter }>(
    `/admin/procedure-master-data/legal-matters/${id}/deactivate`,
    { method: "POST" }
  );
  return payload.legalMatter;
}

export async function reactivateLegalMatter(id: string) {
  const payload = await apiRequest<{ ok: boolean; legalMatter: LegalMatter }>(
    `/admin/procedure-master-data/legal-matters/${id}/reactivate`,
    { method: "POST" }
  );
  return payload.legalMatter;
}

export async function createProcedureType(input: ProcedureTypeInput) {
  const payload = await apiRequest<{ ok: boolean; procedureType: ProcedureType }>(
    "/admin/procedure-master-data/procedure-types",
    {
      method: "POST",
      body: input
    }
  );
  return payload.procedureType;
}

export async function updateProcedureType(id: string, input: Partial<ProcedureTypeInput>) {
  const payload = await apiRequest<{ ok: boolean; procedureType: ProcedureType }>(
    `/admin/procedure-master-data/procedure-types/${id}`,
    {
      method: "PATCH",
      body: input
    }
  );
  return payload.procedureType;
}

export async function deactivateProcedureType(id: string) {
  const payload = await apiRequest<{ ok: boolean; procedureType: ProcedureType }>(
    `/admin/procedure-master-data/procedure-types/${id}/deactivate`,
    { method: "POST" }
  );
  return payload.procedureType;
}

export async function reactivateProcedureType(id: string) {
  const payload = await apiRequest<{ ok: boolean; procedureType: ProcedureType }>(
    `/admin/procedure-master-data/procedure-types/${id}/reactivate`,
    { method: "POST" }
  );
  return payload.procedureType;
}

export async function createSubmissionType(input: SubmissionTypeInput) {
  const payload = await apiRequest<{ ok: boolean; submissionType: SubmissionType }>(
    "/admin/procedure-master-data/submission-types",
    {
      method: "POST",
      body: input
    }
  );
  return payload.submissionType;
}

export async function updateSubmissionType(id: string, input: Partial<SubmissionTypeInput>) {
  const payload = await apiRequest<{ ok: boolean; submissionType: SubmissionType }>(
    `/admin/procedure-master-data/submission-types/${id}`,
    {
      method: "PATCH",
      body: input
    }
  );
  return payload.submissionType;
}

export async function deactivateSubmissionType(id: string) {
  const payload = await apiRequest<{ ok: boolean; submissionType: SubmissionType }>(
    `/admin/procedure-master-data/submission-types/${id}/deactivate`,
    { method: "POST" }
  );
  return payload.submissionType;
}

export async function reactivateSubmissionType(id: string) {
  const payload = await apiRequest<{ ok: boolean; submissionType: SubmissionType }>(
    `/admin/procedure-master-data/submission-types/${id}/reactivate`,
    { method: "POST" }
  );
  return payload.submissionType;
}
