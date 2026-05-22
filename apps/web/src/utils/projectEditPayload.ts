import type { Project } from "../data/projects";

export function hasProjectDetailedDescription(project: Project | undefined) {
  return project?.detailedDescription !== undefined;
}

export function shouldSendProjectDetailedDescription(input: {
  mode: "create" | "edit";
  project?: Project;
  initialDetailedDescription?: string;
  currentDetailedDescription?: string;
}) {
  if (input.mode === "create") {
    return true;
  }

  if (!hasProjectDetailedDescription(input.project)) {
    return false;
  }

  return input.currentDetailedDescription !== input.initialDetailedDescription;
}
