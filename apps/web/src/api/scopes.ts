import { apiRequest } from "./client";
import type {
  ScopeCompany,
  ScopeFacility,
  ScopesSnapshot,
  ScopeSite
} from "../state/ScopesStore";

type ScopeCompanyInput = {
  id?: string;
  name: string;
  shortName?: string;
};

type ScopeSiteInput = {
  id?: string;
  companyId: string;
  name: string;
};

type ScopeFacilityInput = {
  id?: string;
  companyId: string;
  siteId: string;
  name: string;
  type?: string;
};

export async function listScopes() {
  return apiRequest<ScopesSnapshot>("/scopes");
}

export async function createCompany(input: ScopeCompanyInput) {
  const payload = await apiRequest<{ ok: boolean; company: ScopeCompany }>("/scopes/companies", {
    method: "POST",
    body: input
  });
  return payload.company;
}

export async function updateCompany(id: string, input: ScopeCompanyInput) {
  const payload = await apiRequest<{ ok: boolean; company: ScopeCompany }>(`/scopes/companies/${id}`, {
    method: "PATCH",
    body: input
  });
  return payload.company;
}

export async function archiveCompany(id: string) {
  const payload = await apiRequest<{ ok: boolean; company: ScopeCompany }>(`/scopes/companies/${id}/archive`, {
    method: "POST"
  });
  return payload.company;
}

export async function restoreCompany(id: string) {
  const payload = await apiRequest<{ ok: boolean; company: ScopeCompany }>(`/scopes/companies/${id}/restore`, {
    method: "POST"
  });
  return payload.company;
}

export async function createSite(input: ScopeSiteInput) {
  const payload = await apiRequest<{ ok: boolean; site: ScopeSite }>("/scopes/sites", {
    method: "POST",
    body: input
  });
  return payload.site;
}

export async function updateSite(id: string, input: ScopeSiteInput) {
  const payload = await apiRequest<{ ok: boolean; site: ScopeSite }>(`/scopes/sites/${id}`, {
    method: "PATCH",
    body: input
  });
  return payload.site;
}

export async function archiveSite(id: string) {
  const payload = await apiRequest<{ ok: boolean; site: ScopeSite }>(`/scopes/sites/${id}/archive`, {
    method: "POST"
  });
  return payload.site;
}

export async function restoreSite(id: string) {
  const payload = await apiRequest<{ ok: boolean; site: ScopeSite }>(`/scopes/sites/${id}/restore`, {
    method: "POST"
  });
  return payload.site;
}

export async function createFacility(input: ScopeFacilityInput) {
  const payload = await apiRequest<{ ok: boolean; facility: ScopeFacility }>("/scopes/facilities", {
    method: "POST",
    body: input
  });
  return payload.facility;
}

export async function updateFacility(id: string, input: ScopeFacilityInput) {
  const payload = await apiRequest<{ ok: boolean; facility: ScopeFacility }>(`/scopes/facilities/${id}`, {
    method: "PATCH",
    body: input
  });
  return payload.facility;
}

export async function archiveFacility(id: string) {
  const payload = await apiRequest<{ ok: boolean; facility: ScopeFacility }>(
    `/scopes/facilities/${id}/archive`,
    {
      method: "POST"
    }
  );
  return payload.facility;
}

export async function restoreFacility(id: string) {
  const payload = await apiRequest<{ ok: boolean; facility: ScopeFacility }>(
    `/scopes/facilities/${id}/restore`,
    {
      method: "POST"
    }
  );
  return payload.facility;
}

export async function bulkReplaceScopes(snapshot: ScopesSnapshot) {
  const payload = await apiRequest<{ ok: boolean; scopes: ScopesSnapshot }>(
    "/admin/internal/scopes/bulk-replace",
    {
      method: "PUT",
      body: snapshot
    }
  );
  return payload.scopes;
}

export async function bulkDeleteScopes() {
  return apiRequest<{ ok: boolean }>("/admin/internal/scopes/bulk-delete", {
    method: "DELETE"
  });
}
