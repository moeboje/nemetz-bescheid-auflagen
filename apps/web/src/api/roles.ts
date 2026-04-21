import { apiRequest } from "./client";

export type AdminArchivedFilter = "true" | "false" | "all";

export type AdminRole = {
  id: string;
  key: string;
  labelDe: string;
  descriptionDe?: string;
  isSystem: boolean;
  isAssignable?: boolean;
  isDeprecated?: boolean;
  permissionKeys?: string[];
  permissionLabels?: string[];
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
};

export type AdminRolesQuery = {
  q?: string;
  archived?: AdminArchivedFilter;
};

export type PermissionCatalogEntry = {
  key: string;
  label: string;
  group: string;
  requiresAdminAccess: boolean;
};

function toQueryString(query: AdminRolesQuery = {}) {
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

export async function listAdminRoles(query: AdminRolesQuery = {}) {
  return apiRequest<{ items: AdminRole[]; total: number }>(`/admin/roles${toQueryString(query)}`, {
    method: "GET"
  });
}

export async function listAdminRolesLookup() {
  return apiRequest<{ items: AdminRole[]; total: number }>("/admin/roles/lookup", {
    method: "GET"
  });
}

export async function getAdminRoleCatalog() {
  return apiRequest<{ permissions: PermissionCatalogEntry[] }>("/admin/roles/catalog", {
    method: "GET"
  });
}

export async function createAdminRole(input: {
  key: string;
  labelDe: string;
  descriptionDe?: string;
  permissionKeys?: string[];
}) {
  const payload = await apiRequest<{ ok: boolean; role: AdminRole }>("/admin/roles", {
    method: "POST",
    body: input
  });
  return payload.role;
}

export async function updateAdminRole(
  id: string,
  input: Partial<{
    key: string;
    labelDe: string;
    descriptionDe?: string;
    permissionKeys?: string[];
  }>
) {
  const payload = await apiRequest<{ ok: boolean; role: AdminRole }>(`/admin/roles/${id}`, {
    method: "PATCH",
    body: input
  });
  return payload.role;
}

export async function archiveAdminRole(id: string) {
  const payload = await apiRequest<{ ok: boolean; role: AdminRole }>(`/admin/roles/${id}/archive`, {
    method: "POST"
  });
  return payload.role;
}

export async function restoreAdminRole(id: string) {
  const payload = await apiRequest<{ ok: boolean; role: AdminRole }>(`/admin/roles/${id}/restore`, {
    method: "POST"
  });
  return payload.role;
}
