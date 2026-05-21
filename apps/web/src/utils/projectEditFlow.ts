import type { Project } from "../data/projects";

type EnsureProjectForEdit = (
  projectId: string,
  options: { force: true; requireDetail: true }
) => Promise<Project | null>;

export async function loadFreshProjectForEdit(input: {
  projectId: string;
  reloadProjects: () => Promise<Project[]>;
  ensureProject: EnsureProjectForEdit;
}) {
  await input.reloadProjects();
  return input.ensureProject(input.projectId, { force: true, requireDetail: true });
}
