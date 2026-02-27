import { apiRequest } from "./client";

export type AdminArchivedFilter = "true" | "false" | "all";

export type ExternalOrganization = {
  id: string;
  name: string;
  type: string;
  phone?: string;
  email?: string;
  address?: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ExternalOrganizationsQuery = {
  q?: string;
  archived?: AdminArchivedFilter;
};

function toQueryString(query: ExternalOrganizationsQuery = {}) {
  const params = new URLSearchParams();

  if (query.q?.trim()) {
    params.set("q", query.q.trim());
  }

  if (query.archived) {
    params.set("archived", query.archived);
  }

  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

export async function listExternalOrganizations(query: ExternalOrganizationsQuery = {}) {
  return apiRequest<{ items: ExternalOrganization[]; total: number }>(
    `/admin/external-orgs${toQueryString(query)}`,
    {
      method: "GET"
    }
  );
}

export async function createExternalOrganization(input: {
  name: string;
  type: string;
  phone?: string;
  email?: string;
  address?: string;
}) {
  const payload = await apiRequest<{ ok: boolean; externalOrg: ExternalOrganization }>("/admin/external-orgs", {
    method: "POST",
    body: input
  });
  return payload.externalOrg;
}

export async function updateExternalOrganization(
  id: string,
  input: Partial<{
    name: string;
    type: string;
    phone?: string;
    email?: string;
    address?: string;
  }>
) {
  const payload = await apiRequest<{ ok: boolean; externalOrg: ExternalOrganization }>(`/admin/external-orgs/${id}`, {
    method: "PATCH",
    body: input
  });
  return payload.externalOrg;
}

export async function archiveExternalOrganization(id: string) {
  const payload = await apiRequest<{ ok: boolean; externalOrg: ExternalOrganization }>(
    `/admin/external-orgs/${id}/archive`,
    {
      method: "POST"
    }
  );
  return payload.externalOrg;
}

export async function restoreExternalOrganization(id: string) {
  const payload = await apiRequest<{ ok: boolean; externalOrg: ExternalOrganization }>(
    `/admin/external-orgs/${id}/restore`,
    {
      method: "POST"
    }
  );
  return payload.externalOrg;
}
