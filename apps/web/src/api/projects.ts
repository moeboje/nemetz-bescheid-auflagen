import { apiRequest } from "./client";
import type { Project, ProjectAccessEntry, ProjectAccessRole } from "../data/projects";

type ProjectInput = {
  id?: string;
  title: string;
  status?: Project["status"];
  submissionType?: Project["submissionType"];
  shortDescription?: string;
  authorityRef?: string;
  companyId: string;
  siteId?: string;
  facilityId?: string;
  authorityId?: string;
  authorityContactId?: string;
  ownerUserId?: string;
  deputyUserId?: string;
  internalParticipants?: Project["internalParticipants"];
  participantUserIds?: string[];
  dependsOnProjectIds?: string[];
  referenceLegalDocIds?: string[];
  externalParticipants?: Project["externalParticipants"];
  attachments?: Project["attachments"];
  archivedAt?: string;
  isArchived?: boolean;
};

export type ProjectExternalParticipantInput = Project["externalParticipants"][number];

export async function listProjects() {
  return apiRequest<Project[]>("/projects");
}

export async function getProject(id: string) {
  const payload = await apiRequest<{ ok: boolean; project: Project }>(`/projects/${id}`);
  return payload.project;
}

export async function createProject(input: ProjectInput) {
  const payload = await apiRequest<{ ok: boolean; project: Project }>("/projects", {
    method: "POST",
    body: input
  });
  return payload.project;
}

export async function updateProject(id: string, input: Partial<ProjectInput>) {
  const payload = await apiRequest<{ ok: boolean; project: Project }>(`/projects/${id}`, {
    method: "PATCH",
    body: input
  });
  return payload.project;
}

export async function archiveProject(id: string) {
  const payload = await apiRequest<{ ok: boolean; project: Project }>(`/projects/${id}/archive`, {
    method: "POST"
  });
  return payload.project;
}

export async function restoreProject(id: string) {
  const payload = await apiRequest<{ ok: boolean; project: Project }>(`/projects/${id}/restore`, {
    method: "POST"
  });
  return payload.project;
}

export async function listProjectAccess(projectId: string) {
  const payload = await apiRequest<{ ok: boolean; items: ProjectAccessEntry[] }>(
    `/projects/${projectId}/access`
  );
  return payload.items;
}

export async function upsertProjectAccess(
  projectId: string,
  userId: string,
  input: { accessRole: ProjectAccessRole; note?: string }
) {
  const payload = await apiRequest<{ ok: boolean; access: ProjectAccessEntry }>(
    `/projects/${projectId}/access/${userId}`,
    {
      method: "PUT",
      body: input
    }
  );
  return payload.access;
}

export async function removeProjectAccess(projectId: string, userId: string) {
  return apiRequest<{ ok: boolean }>(`/projects/${projectId}/access/${userId}`, {
    method: "DELETE"
  });
}

export async function bulkReplaceProjects(projects: Project[]) {
  const payload = await apiRequest<{ ok: boolean; projects: Project[] }>(
    "/admin/internal/projects/bulk-replace",
    {
      method: "PUT",
      body: projects
    }
  );
  return payload.projects;
}

export async function bulkDeleteProjects() {
  return apiRequest<{ ok: boolean }>("/admin/internal/projects/bulk-delete", {
    method: "DELETE"
  });
}
