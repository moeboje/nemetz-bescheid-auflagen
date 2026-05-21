import type { Project } from "../data/projects";
import { hasProjectDetailedDescription } from "../utils/projectEditPayload";
import { getAuthScopedRequestKey, type AuthRequestScope } from "./authScopedRequest";

export type ProjectDetailLoadOptions = {
  force?: boolean;
  requireDetail?: boolean;
};

export function isIncomingProjectOlder(existing: Project | undefined, incoming: Project) {
  if (!existing?.updatedAt || !incoming.updatedAt) {
    return false;
  }
  return incoming.updatedAt < existing.updatedAt;
}

export const hasProjectDetailFields = hasProjectDetailedDescription;

export function mergeProject(existing: Project | undefined, incoming: Project) {
  if (!existing) {
    return incoming;
  }
  if (isIncomingProjectOlder(existing, incoming)) {
    return existing;
  }
  return {
    ...existing,
    ...incoming,
    detailedDescription:
      incoming.detailedDescription !== undefined
        ? incoming.detailedDescription
        : existing.detailedDescription
  };
}

export function mergeProjectListRow(existing: Project | undefined, incoming: Project) {
  if (!existing) {
    return incoming;
  }
  return mergeProject(existing, {
    ...incoming,
    detailedDescription: undefined
  });
}

export function canUseCachedProjectDetail(
  cached: Project | undefined,
  loadedDetailVersion: string | undefined,
  options: ProjectDetailLoadOptions = {}
) {
  return Boolean(
    !options.force &&
      cached &&
      loadedDetailVersion === cached.updatedAt &&
      (!options.requireDetail || hasProjectDetailFields(cached))
  );
}

export function getProjectDetailInFlightKey(
  scope: AuthRequestScope,
  projectId: string,
  options: ProjectDetailLoadOptions = {}
) {
  return getAuthScopedRequestKey(
    scope,
    options.force ? `force-detail:${projectId}` : `detail:${projectId}`
  );
}
