import type { Project } from "../data/projects";

export type ProjectActor = {
  userId?: string;
  isAdmin: boolean;
  isExternal: boolean;
  canCreateProject?: boolean;
  canEditProject?: boolean;
  canArchiveProject?: boolean;
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

function hasServerGrantedView(project: Project) {
  return Boolean(project.currentUserAccessSource);
}

function hasServerGrantedEdit(project: Project) {
  if (project.currentUserAccessSource === "GLOBAL") {
    return false;
  }
  return project.currentUserAccessRole === "PROJECT_EDITOR";
}

export const ProjectPolicy = {
  view(actor: ProjectActor, project: Project) {
    if (actor.isAdmin) {
      return true;
    }
    if (isProjectArchived(project)) {
      return false;
    }
    if (hasServerGrantedView(project)) {
      return true;
    }
    return hasProjectRelation(actor, project);
  },
  create(actor: ProjectActor) {
    const hasCreatePermission = actor.canCreateProject ?? actor.isAdmin;
    return Boolean(actor.userId && !actor.isExternal && hasCreatePermission);
  },
  write(actor: ProjectActor, project: Project) {
    if (isProjectArchived(project)) {
      return false;
    }
    if (typeof project.currentUserCanWrite === "boolean") {
      return project.currentUserCanWrite;
    }
    if (!actor.userId) {
      return false;
    }
    if (hasServerGrantedEdit(project)) {
      return true;
    }
    return project.ownerUserId === actor.userId || project.deputyUserId === actor.userId;
  },
  update(actor: ProjectActor, project: Project) {
    if (isProjectArchived(project)) {
      return false;
    }
    if (typeof project.canUpdate === "boolean") {
      return project.canUpdate;
    }
    if (!actor.userId) {
      return false;
    }
    const hasEditPermission = actor.canEditProject ?? actor.isAdmin;
    if (!hasEditPermission) {
      return false;
    }
    if (hasServerGrantedEdit(project)) {
      return true;
    }
    return project.ownerUserId === actor.userId || project.deputyUserId === actor.userId;
  },
  archive(actor: ProjectActor, project: Project) {
    if (typeof project.canArchive === "boolean") {
      return project.canArchive;
    }
    if (isProjectArchived(project)) {
      return false;
    }
    const hasArchivePermission = actor.canArchiveProject ?? actor.isAdmin;
    return Boolean(
      actor.userId &&
        hasArchivePermission &&
        (project.ownerUserId === actor.userId || hasServerGrantedEdit(project))
    );
  },
  removeAttachment(actor: ProjectActor, project: Project) {
    return this.update(actor, project);
  }
};
