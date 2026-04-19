import { apiRequest } from "./client";
import type { ProjectChecklist } from "../data/projectChecklists";

export async function listProjectChecklists() {
  return apiRequest<ProjectChecklist[]>("/project-checklists");
}

export async function getProjectChecklist(projectId: string) {
  const payload = await apiRequest<{ ok: boolean; checklist: ProjectChecklist | null }>(
    `/projects/${projectId}/checklist`
  );
  return payload.checklist;
}

export async function saveProjectChecklist(projectId: string, checklist: ProjectChecklist) {
  const payload = await apiRequest<{ ok: boolean; checklist: ProjectChecklist | null }>(
    `/projects/${projectId}/checklist`,
    {
      method: "PUT",
      body: checklist
    }
  );
  return payload.checklist;
}

export async function deleteProjectChecklist(projectId: string) {
  const payload = await apiRequest<{ ok: boolean; checklist: ProjectChecklist | null }>(
    `/projects/${projectId}/checklist`,
    {
      method: "DELETE"
    }
  );
  return payload.checklist;
}

export async function bulkReplaceProjectChecklists(projectChecklists: ProjectChecklist[]) {
  const payload = await apiRequest<{ ok: boolean; projectChecklists: ProjectChecklist[] }>(
    "/admin/internal/project-checklists/bulk-replace",
    {
      method: "PUT",
      body: projectChecklists
    }
  );
  return payload.projectChecklists;
}

export async function bulkDeleteProjectChecklists() {
  await apiRequest<{ ok: boolean }>("/admin/internal/project-checklists/bulk-delete", {
    method: "DELETE"
  });
}
