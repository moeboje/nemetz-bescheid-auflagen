import type { Project } from "../data/projects";

export type ProjectActor = {
  userId?: string;
  isAdmin: boolean;
  isExternal: boolean;
};

function isProjectArchived(project: Project) {
  return Boolean(project.archivedAt || project.isArchived);
}

function hasProjectRelation(actor: ProjectActor, project: Project) {
  if (!actor.userId) {
    return false;
  }

  if (project.ownerUserId === actor.userId || project.deputyUserId === actor.userId) {
    return true;
  }

  return (project.internalParticipants ?? []).some(
    (participant) => participant.userId === actor.userId
  );
}

export const ProjectPolicy = {
  view(actor: ProjectActor, project: Project) {
    if (actor.isAdmin) {
      return true;
    }
    if (isProjectArchived(project)) {
      return false;
    }
    return hasProjectRelation(actor, project);
  },
  create(actor: ProjectActor) {
    if (actor.isAdmin) {
      return true;
    }
    return Boolean(actor.userId && !actor.isExternal);
  },
  update(actor: ProjectActor, project: Project) {
    if (actor.isAdmin) {
      return true;
    }
    if (isProjectArchived(project)) {
      return false;
    }
    if (!actor.userId) {
      return false;
    }
    return project.ownerUserId === actor.userId || project.deputyUserId === actor.userId;
  },
  archive(actor: ProjectActor, project: Project) {
    if (actor.isAdmin) {
      return true;
    }
    if (isProjectArchived(project)) {
      return false;
    }
    return Boolean(actor.userId && project.ownerUserId === actor.userId);
  },
  removeAttachment(actor: ProjectActor, project: Project) {
    return this.update(actor, project);
  }
};

