import { apiRequest } from "./client";
import type { Authority, AuthorityContact } from "../data/authorities";
import type { AuthoritiesSnapshot } from "../state/AuthoritiesStore";

type AuthorityInput = {
  id?: string;
  name: string;
  shortName?: string;
};

type AuthorityContactInput = {
  id?: string;
  authorityId: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  roleTitle?: string;
  notes?: string;
  department?: string;
  isPrimary?: boolean;
};

export async function listAuthorities() {
  return apiRequest<AuthoritiesSnapshot>("/authorities");
}

export async function createAuthority(input: AuthorityInput) {
  const payload = await apiRequest<{ ok: boolean; authority: Authority }>("/authorities", {
    method: "POST",
    body: input
  });
  return payload.authority;
}

export async function updateAuthority(id: string, input: Partial<AuthorityInput>) {
  const payload = await apiRequest<{ ok: boolean; authority: Authority }>(`/authorities/${id}`, {
    method: "PATCH",
    body: input
  });
  return payload.authority;
}

export async function archiveAuthority(id: string) {
  const payload = await apiRequest<{ ok: boolean; authority: Authority }>(`/authorities/${id}/archive`, {
    method: "POST"
  });
  return payload.authority;
}

export async function restoreAuthority(id: string) {
  const payload = await apiRequest<{ ok: boolean; authority: Authority }>(`/authorities/${id}/restore`, {
    method: "POST"
  });
  return payload.authority;
}

export async function createAuthorityContact(input: AuthorityContactInput) {
  const payload = await apiRequest<{ ok: boolean; contact: AuthorityContact }>("/authorities/contacts", {
    method: "POST",
    body: input
  });
  return payload.contact;
}

export async function updateAuthorityContact(id: string, input: Partial<AuthorityContactInput>) {
  const payload = await apiRequest<{ ok: boolean; contact: AuthorityContact }>(
    `/authorities/contacts/${id}`,
    {
      method: "PATCH",
      body: input
    }
  );
  return payload.contact;
}

export async function archiveAuthorityContact(id: string) {
  const payload = await apiRequest<{ ok: boolean; contact: AuthorityContact }>(
    `/authorities/contacts/${id}/archive`,
    {
      method: "POST"
    }
  );
  return payload.contact;
}

export async function restoreAuthorityContact(id: string) {
  const payload = await apiRequest<{ ok: boolean; contact: AuthorityContact }>(
    `/authorities/contacts/${id}/restore`,
    {
      method: "POST"
    }
  );
  return payload.contact;
}

export async function bulkReplaceAuthorities(snapshot: AuthoritiesSnapshot) {
  const payload = await apiRequest<{ ok: boolean; authorities: AuthoritiesSnapshot }>(
    "/admin/internal/authorities/bulk-replace",
    {
      method: "PUT",
      body: snapshot
    }
  );
  return payload.authorities;
}

export async function bulkDeleteAuthorities() {
  return apiRequest<{ ok: boolean }>("/admin/internal/authorities/bulk-delete", {
    method: "DELETE"
  });
}
