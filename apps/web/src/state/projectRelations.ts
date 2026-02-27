import type { Project } from "../data/projects";

export type ProjectDependencyValidationReason =
  | "missing"
  | "self"
  | "duplicate"
  | "cycle";

export type ProjectDependencyValidationResult =
  | { ok: true }
  | { ok: false; reason: ProjectDependencyValidationReason };

type ProjectDependencyShape = Pick<Project, "id" | "dependsOnProjectIds">;

export type SanitizeProjectRelationsResult = {
  projects: Project[];
  removedDependencyLinks: number;
  removedDependencyMissing: number;
  removedDependencySelf: number;
  removedDependencyCycles: number;
  removedLegalDocRefs: number;
};

export function normalizeRelationIds(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const seen = new Set<string>();
  const normalized: string[] = [];

  value.forEach((entry) => {
    if (typeof entry !== "string") {
      return;
    }
    const trimmed = entry.trim();
    if (!trimmed || seen.has(trimmed)) {
      return;
    }
    seen.add(trimmed);
    normalized.push(trimmed);
  });

  return normalized;
}

function buildDependencyAdjacency(
  projects: ProjectDependencyShape[],
  overrideByProjectId?: Map<string, string[]>
) {
  const adjacency = new Map<string, string[]>();
  projects.forEach((project) => {
    const override = overrideByProjectId?.get(project.id);
    const dependencyIds = normalizeRelationIds(override ?? project.dependsOnProjectIds).filter(
      (dependencyId) => dependencyId !== project.id
    );
    adjacency.set(project.id, dependencyIds);
  });
  return adjacency;
}

export function isDependencyReachable(
  adjacency: Map<string, string[]>,
  fromProjectId: string,
  targetProjectId: string
) {
  if (fromProjectId === targetProjectId) {
    return true;
  }

  const visited = new Set<string>();
  const queue = [fromProjectId];

  while (queue.length) {
    const current = queue.shift();
    if (!current || visited.has(current)) {
      continue;
    }
    visited.add(current);
    const neighbors = adjacency.get(current) ?? [];
    for (const neighbor of neighbors) {
      if (neighbor === targetProjectId) {
        return true;
      }
      if (!visited.has(neighbor)) {
        queue.push(neighbor);
      }
    }
  }

  return false;
}

export function validateProjectDependencyCandidate(input: {
  projects: ProjectDependencyShape[];
  projectId: string;
  candidateProjectId: string;
  selectedDependencyIds?: string[];
}): ProjectDependencyValidationResult {
  const projectIds = new Set(input.projects.map((project) => project.id));
  if (!projectIds.has(input.candidateProjectId)) {
    return { ok: false, reason: "missing" };
  }

  if (input.candidateProjectId === input.projectId) {
    return { ok: false, reason: "self" };
  }

  const selectedDependencyIds = normalizeRelationIds(input.selectedDependencyIds);
  if (selectedDependencyIds.includes(input.candidateProjectId)) {
    return { ok: false, reason: "duplicate" };
  }

  const overrideByProjectId = new Map<string, string[]>();
  overrideByProjectId.set(input.projectId, [
    ...selectedDependencyIds,
    input.candidateProjectId
  ]);

  const adjacency = buildDependencyAdjacency(input.projects, overrideByProjectId);
  if (isDependencyReachable(adjacency, input.candidateProjectId, input.projectId)) {
    return { ok: false, reason: "cycle" };
  }

  return { ok: true };
}

export function sanitizeProjectDependencyIds(input: {
  projects: ProjectDependencyShape[];
  projectId: string;
  dependencyIds: string[];
}) {
  const removed: Record<ProjectDependencyValidationReason, number> = {
    missing: 0,
    self: 0,
    duplicate: 0,
    cycle: 0
  };
  const sanitizedDependencyIds: string[] = [];

  normalizeRelationIds(input.dependencyIds).forEach((candidateProjectId) => {
    const validation = validateProjectDependencyCandidate({
      projects: input.projects,
      projectId: input.projectId,
      candidateProjectId,
      selectedDependencyIds: sanitizedDependencyIds
    });

    if (!validation.ok) {
      removed[validation.reason] += 1;
      return;
    }

    sanitizedDependencyIds.push(candidateProjectId);
  });

  return {
    dependencyIds: sanitizedDependencyIds,
    removed
  };
}

export function sanitizeProjectRelations(
  projects: Project[],
  legalDocIds?: Set<string>
): SanitizeProjectRelationsResult {
  const projectIds = new Set(projects.map((project) => project.id));
  const adjacency = new Map(projects.map((project) => [project.id, [] as string[]]));

  let removedDependencyMissing = 0;
  let removedDependencySelf = 0;
  let removedDependencyCycles = 0;
  let removedLegalDocRefs = 0;

  const sanitizedProjects = projects.map((project) => {
    const sanitizedDependencyIds: string[] = [];
    const dependencyCandidates = normalizeRelationIds(project.dependsOnProjectIds);

    dependencyCandidates.forEach((candidateProjectId) => {
      if (candidateProjectId === project.id) {
        removedDependencySelf += 1;
        return;
      }
      if (!projectIds.has(candidateProjectId)) {
        removedDependencyMissing += 1;
        return;
      }
      if (isDependencyReachable(adjacency, candidateProjectId, project.id)) {
        removedDependencyCycles += 1;
        return;
      }
      sanitizedDependencyIds.push(candidateProjectId);
    });

    adjacency.set(project.id, sanitizedDependencyIds);

    const legalRefCandidates = normalizeRelationIds(project.referenceLegalDocIds);
    const sanitizedLegalRefs = legalDocIds
      ? legalRefCandidates.filter((legalDocId) => legalDocIds.has(legalDocId))
      : legalRefCandidates;

    removedLegalDocRefs += legalRefCandidates.length - sanitizedLegalRefs.length;

    return {
      ...project,
      dependsOnProjectIds: sanitizedDependencyIds,
      referenceLegalDocIds: sanitizedLegalRefs
    };
  });

  return {
    projects: sanitizedProjects,
    removedDependencyLinks:
      removedDependencyMissing + removedDependencySelf + removedDependencyCycles,
    removedDependencyMissing,
    removedDependencySelf,
    removedDependencyCycles,
    removedLegalDocRefs
  };
}
