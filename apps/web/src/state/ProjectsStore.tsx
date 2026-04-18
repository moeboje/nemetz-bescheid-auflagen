import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  ExternalParticipant,
  ProjectInternalParticipant,
  Project,
  ProjectAttachment,
  projects as initialProjects
} from "../data/projects";
import { ProjectPolicy } from "../policies/ProjectPolicy";
import { useAuthorization } from "./AuthorizationStore";
import { useAuditLog } from "./AuditLogStore";
import { clearPersistedValue, makeStorageKey } from "./persistence";
import {
  archiveProject as apiArchiveProject,
  bulkReplaceProjects,
  createProject as apiCreateProject,
  listProjects,
  restoreProject as apiRestoreProject,
  updateProject as apiUpdateProject
} from "../api/projects";
import { useAuth } from "./AuthStore";
import {
  normalizeRelationIds,
  sanitizeProjectDependencyIds,
  sanitizeProjectRelations,
  validateProjectDependencyCandidate,
  type ProjectDependencyValidationResult
} from "./projectRelations";
import { normalizeProjectStatus } from "../projectStatus";

type ProjectCreateInput = Omit<
  Project,
  | "id"
  | "createdAt"
  | "updatedAt"
  | "attachments"
  | "externalParticipants"
  | "participantUserIds"
  | "internalParticipants"
  | "dependsOnProjectIds"
  | "referenceLegalDocIds"
  | "isArchived"
  | "archivedAt"
> & {
  attachments?: ProjectAttachment[];
  externalParticipants?: ExternalParticipant[];
  internalParticipants?: ProjectInternalParticipant[];
  participantUserIds?: string[];
  dependsOnProjectIds?: string[];
  referenceLegalDocIds?: string[];
};

export type ProjectsContextValue = {
  projects: Project[];
  addProject: (input: ProjectCreateInput) => Promise<boolean>;
  updateProject: (id: string, input: Partial<Project>) => Promise<boolean>;
  archiveProject: (id: string) => Promise<boolean>;
  restoreProject: (id: string) => Promise<boolean>;
  setOwner: (projectId: string, ownerUserId?: string) => Promise<boolean>;
  setDeputy: (projectId: string, deputyUserId?: string) => Promise<boolean>;
  setParticipants: (projectId: string, participantUserIds: string[]) => Promise<boolean>;
  addProjectAttachment: (projectId: string, attachment: ProjectAttachment) => Promise<boolean>;
  removeProjectAttachment: (projectId: string, attachmentId: string) => Promise<boolean>;
  addExternalParticipant: (
    projectId: string,
    participant: Omit<ExternalParticipant, "id" | "createdAt" | "updatedAt">
  ) => Promise<boolean>;
  updateExternalParticipant: (
    projectId: string,
    participantId: string,
    input: Partial<ExternalParticipant>
  ) => Promise<boolean>;
  archiveExternalParticipant: (projectId: string, participantId: string) => Promise<boolean>;
  restoreExternalParticipant: (projectId: string, participantId: string) => Promise<boolean>;
  validateDependencyCandidate: (
    projectId: string,
    candidateProjectId: string,
    selectedDependencyIds?: string[]
  ) => ProjectDependencyValidationResult;
  replaceProjects: (projects: Project[]) => Promise<void>;
  resetProjects: () => Promise<void>;
  reloadProjects: () => Promise<Project[]>;
};

const ProjectsContext = createContext<ProjectsContextValue | undefined>(undefined);

export const PROJECTS_STORAGE_KEY = makeStorageKey("projects");

function nowStamp() {
  return new Date().toISOString();
}

function toBoolean(value: unknown) {
  return Boolean(value);
}

function normalizeAttachment(
  attachment: Partial<ProjectAttachment>,
  fallbackId: string
): ProjectAttachment {
  return {
    id: typeof attachment.id === "string" && attachment.id.trim() ? attachment.id : fallbackId,
    filename: attachment.filename ?? "",
    sizeKb: Number.isFinite(attachment.sizeKb) ? Number(attachment.sizeKb) : 0,
    mime: attachment.mime ?? undefined,
    addedAt: attachment.addedAt ?? nowStamp().slice(0, 10),
    addedByLabel: attachment.addedByLabel ?? undefined
  };
}

function normalizeExternalParticipant(
  participant: Partial<ExternalParticipant>,
  fallbackId: string
): ExternalParticipant | null {
  if (typeof participant.name !== "string" || !participant.name.trim()) {
    return null;
  }

  const createdAt =
    typeof participant.createdAt === "string" && participant.createdAt.trim()
      ? participant.createdAt
      : nowStamp();
  const updatedAt =
    typeof participant.updatedAt === "string" && participant.updatedAt.trim()
      ? participant.updatedAt
      : createdAt;

  return {
    id: typeof participant.id === "string" && participant.id.trim() ? participant.id : fallbackId,
    type: participant.type ?? "OTHER",
    organization: participant.organization ?? "",
    name: participant.name,
    email: participant.email ?? "",
    phone: participant.phone ?? "",
    notes: participant.notes ?? "",
    archivedAt: participant.archivedAt ?? undefined,
    isArchived: toBoolean(participant.isArchived || participant.archivedAt),
    createdAt,
    updatedAt
  };
}

function normalizeParticipantUserIds(input: {
  internalParticipants?: ProjectInternalParticipant[];
  participantUserIds?: string[];
}) {
  if (input.internalParticipants?.length) {
    return input.internalParticipants
      .map((participant) => participant.userId)
      .filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  }

  return (input.participantUserIds ?? []).filter(
    (value): value is string => typeof value === "string" && value.trim().length > 0
  );
}

function normalizeProject(value: Partial<Project>, index: number): Project | null {
  if (
    typeof value.id !== "string" ||
    !value.id.trim() ||
    typeof value.title !== "string" ||
    !value.title.trim() ||
    typeof value.companyId !== "string" ||
    !value.companyId.trim()
  ) {
    return null;
  }

  const createdAt =
    typeof value.createdAt === "string" && value.createdAt.trim() ? value.createdAt : nowStamp();
  const updatedAt =
    typeof value.updatedAt === "string" && value.updatedAt.trim()
      ? value.updatedAt
      : createdAt;

  const participantUserIds = normalizeParticipantUserIds(value);
  const internalParticipants =
    value.internalParticipants && value.internalParticipants.length
      ? value.internalParticipants
          .filter(
            (participant): participant is ProjectInternalParticipant =>
              Boolean(participant?.userId)
          )
          .map((participant) => ({
            userId: participant.userId,
            role: participant.role ?? ""
          }))
      : participantUserIds.map((userId) => ({ userId }));

  const attachments = Array.isArray(value.attachments)
    ? value.attachments.map((attachment, attachmentIndex) =>
        normalizeAttachment(
          attachment,
          `pa-seed-${value.id}-${index}-${attachmentIndex}`
        )
      )
    : [];

  const externalParticipants = Array.isArray(value.externalParticipants)
    ? value.externalParticipants
        .map((participant, participantIndex) =>
          normalizeExternalParticipant(
            participant,
            `ep-seed-${value.id}-${index}-${participantIndex}`
          )
        )
        .filter((participant): participant is ExternalParticipant => Boolean(participant))
    : [];

  return {
    id: value.id,
    title: value.title,
    status: normalizeProjectStatus(value.status),
    shortDescription: value.shortDescription ?? "",
    authorityRef: value.authorityRef ?? "",
    companyId: value.companyId,
    siteId: value.siteId ?? undefined,
    facilityId: value.facilityId ?? undefined,
    authorityId: value.authorityId ?? undefined,
    authorityContactId: value.authorityContactId ?? undefined,
    ownerUserId: value.ownerUserId ?? undefined,
    deputyUserId: value.deputyUserId ?? undefined,
    internalParticipants,
    participantUserIds,
    dependsOnProjectIds: normalizeRelationIds(value.dependsOnProjectIds),
    referenceLegalDocIds: normalizeRelationIds(value.referenceLegalDocIds),
    externalParticipants,
    attachments,
    archivedAt: value.archivedAt ?? undefined,
    isArchived: toBoolean(value.isArchived || value.archivedAt),
    createdAt,
    updatedAt
  };
}

function normalizeProjects(value: unknown): Project[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const normalized = value
    .map((project, index) => normalizeProject(project as Partial<Project>, index))
    .filter((project): project is Project => Boolean(project));
  return sanitizeProjectRelations(normalized).projects;
}

function isProjectArchived(project: Project) {
  return Boolean(project.archivedAt || project.isArchived);
}

const normalizedInitialProjects = sanitizeProjectRelations(initialProjects).projects;

export function ProjectsProvider({ children }: { children: React.ReactNode }) {
  const { user: authUser } = useAuth();
  const { actor } = useAuthorization();
  const { logEvent } = useAuditLog();
  const [projects, setProjects] = useState<Project[]>([]);

  const reloadProjects = useCallback(async () => {
    if (!authUser || authUser.type === "EXTERNAL") {
      setProjects([]);
      clearPersistedValue(PROJECTS_STORAGE_KEY);
      return [];
    }

    const next = normalizeProjects(await listProjects());
    setProjects(next);
    clearPersistedValue(PROJECTS_STORAGE_KEY);
    return next;
  }, [authUser]);

  useEffect(() => {
    if (!authUser || authUser.type === "EXTERNAL") {
      setProjects([]);
      clearPersistedValue(PROJECTS_STORAGE_KEY);
      return;
    }

    void reloadProjects().catch(() => {
      setProjects([]);
      clearPersistedValue(PROJECTS_STORAGE_KEY);
    });
  }, [authUser, reloadProjects]);

  const addProject = useCallback(
    async (input: ProjectCreateInput) => {
      if (!ProjectPolicy.create(actor)) {
        return false;
      }

      try {
        const participantUserIds = normalizeParticipantUserIds(input);
        const internalParticipants =
          input.internalParticipants && input.internalParticipants.length
            ? input.internalParticipants
            : participantUserIds.map((userId) => ({ userId }));
        const dependencyIds = sanitizeProjectDependencyIds({
          projects,
          projectId: "__draft__",
          dependencyIds: input.dependsOnProjectIds ?? []
        }).dependencyIds;
        const referenceLegalDocIds = normalizeRelationIds(input.referenceLegalDocIds);

        const createdProject = normalizeProjects([
          await apiCreateProject({
            ...input,
            shortDescription: input.shortDescription ?? "",
            authorityRef: input.authorityRef ?? "",
            internalParticipants,
            participantUserIds:
              participantUserIds.length > 0
                ? participantUserIds
                : internalParticipants.map((participant) => participant.userId),
            dependsOnProjectIds: dependencyIds,
            referenceLegalDocIds,
            attachments: (input.attachments ?? []).map((attachment, index) =>
              normalizeAttachment(attachment, `pa-create-${index}`)
            ),
            externalParticipants: (input.externalParticipants ?? [])
              .map((participant, index) =>
                normalizeExternalParticipant(participant, `ep-create-${index}`)
              )
              .filter((participant): participant is ExternalParticipant => Boolean(participant))
          })
        ])[0];

        if (!createdProject) {
          return false;
        }

        setProjects((prev) => sanitizeProjectRelations([createdProject, ...prev]).projects);
        clearPersistedValue(PROJECTS_STORAGE_KEY);
        logEvent({
          actorLabel: "Demo User",
          entityType: "PROJECT",
          entityId: createdProject.id,
          action: "CREATED",
          summary: createdProject.title
        });
        return true;
      } catch {
        return false;
      }
    },
    [actor, logEvent, projects]
  );

  const updateProject = useCallback(
    async (id: string, input: Partial<Project>) => {
      const currentProject = projects.find((project) => project.id === id);
      if (!currentProject) {
        return false;
      }
      if (!ProjectPolicy.update(actor, currentProject)) {
        return false;
      }

      try {
        const participantUserIds = normalizeParticipantUserIds({
          internalParticipants: input.internalParticipants,
          participantUserIds: input.participantUserIds
        });
        const nextInternalParticipants =
          input.internalParticipants !== undefined || input.participantUserIds !== undefined
            ? input.internalParticipants && input.internalParticipants.length
              ? input.internalParticipants
              : participantUserIds.map((userId) => ({ userId }))
            : undefined;
        const nextDependencyIds =
          input.dependsOnProjectIds !== undefined
            ? sanitizeProjectDependencyIds({
                projects,
                projectId: id,
                dependencyIds: input.dependsOnProjectIds
              }).dependencyIds
            : currentProject.dependsOnProjectIds;
        const nextReferenceLegalDocIds =
          input.referenceLegalDocIds !== undefined
            ? normalizeRelationIds(input.referenceLegalDocIds)
            : currentProject.referenceLegalDocIds;

        const updatedProject = normalizeProjects([
          await apiUpdateProject(id, {
            ...input,
            shortDescription:
              input.shortDescription !== undefined
                ? input.shortDescription
                : currentProject.shortDescription,
            authorityRef:
              input.authorityRef !== undefined ? input.authorityRef : currentProject.authorityRef,
            internalParticipants: nextInternalParticipants,
            participantUserIds:
              input.internalParticipants !== undefined || input.participantUserIds !== undefined
                ? participantUserIds
                : currentProject.participantUserIds,
            dependsOnProjectIds: nextDependencyIds,
            referenceLegalDocIds: nextReferenceLegalDocIds,
            attachments: Array.isArray(input.attachments)
              ? input.attachments.map((attachment, index) =>
                  normalizeAttachment(attachment, `pa-${id}-${index}`)
                )
              : undefined,
            externalParticipants: Array.isArray(input.externalParticipants)
              ? input.externalParticipants
                  .map((participant, index) =>
                    normalizeExternalParticipant(participant, `ep-${id}-${index}`)
                  )
                  .filter((participant): participant is ExternalParticipant => Boolean(participant))
              : undefined
          })
        ])[0];

        if (!updatedProject) {
          return false;
        }

        setProjects((prev) =>
          sanitizeProjectRelations(
            prev.map((project) => (project.id === id ? updatedProject : project))
          ).projects
        );
        clearPersistedValue(PROJECTS_STORAGE_KEY);

        logEvent({
          actorLabel: "Demo User",
          entityType: "PROJECT",
          entityId: id,
          action: "UPDATED",
          summary: currentProject.title
        });
        return true;
      } catch {
        return false;
      }
    },
    [actor, logEvent, projects]
  );

  const archiveProject = useCallback(
    async (id: string) => {
      const currentProject = projects.find((project) => project.id === id);
      if (!currentProject) {
        return false;
      }
      if (!ProjectPolicy.archive(actor, currentProject)) {
        return false;
      }

      try {
        const updatedProject = normalizeProjects([await apiArchiveProject(id)])[0];
        if (!updatedProject) {
          return false;
        }

        setProjects((prev) =>
          prev.map((project) => (project.id === id ? updatedProject : project))
        );
        clearPersistedValue(PROJECTS_STORAGE_KEY);
        logEvent({
          actorLabel: "Demo User",
          entityType: "PROJECT",
          entityId: id,
          action: "ARCHIVED",
          summary: currentProject.title
        });
        return true;
      } catch {
        return false;
      }
    },
    [actor, logEvent, projects]
  );

  const restoreProject = useCallback(
    async (id: string) => {
      const currentProject = projects.find((project) => project.id === id);
      if (!currentProject) {
        return false;
      }
      if (!ProjectPolicy.archive(actor, currentProject)) {
        return false;
      }

      try {
        const updatedProject = normalizeProjects([await apiRestoreProject(id)])[0];
        if (!updatedProject) {
          return false;
        }

        setProjects((prev) =>
          prev.map((project) => (project.id === id ? updatedProject : project))
        );
        clearPersistedValue(PROJECTS_STORAGE_KEY);
        logEvent({
          actorLabel: "Demo User",
          entityType: "PROJECT",
          entityId: id,
          action: "RESTORED",
          summary: currentProject.title
        });
        return true;
      } catch {
        return false;
      }
    },
    [actor, logEvent, projects]
  );

  const setOwner = useCallback(
    (projectId: string, ownerUserId?: string) =>
      updateProject(projectId, { ownerUserId }),
    [updateProject]
  );

  const validateDependencyCandidate = useCallback(
    (projectId: string, candidateProjectId: string, selectedDependencyIds?: string[]) =>
      validateProjectDependencyCandidate({
        projects,
        projectId,
        candidateProjectId,
        selectedDependencyIds
      }),
    [projects]
  );

  const setDeputy = useCallback(
    (projectId: string, deputyUserId?: string) =>
      updateProject(projectId, { deputyUserId }),
    [updateProject]
  );

  const setParticipants = useCallback(
    (projectId: string, participantUserIds: string[]) =>
      updateProject(projectId, {
        participantUserIds,
        internalParticipants: participantUserIds.map((userId) => ({ userId }))
      }),
    [updateProject]
  );

  const addProjectAttachment = useCallback(
    async (projectId: string, attachment: ProjectAttachment) => {
      const currentProject = projects.find((project) => project.id === projectId);
      if (!currentProject || isProjectArchived(currentProject)) {
        return false;
      }
      if (!ProjectPolicy.removeAttachment(actor, currentProject)) {
        return false;
      }

      const nextAttachments = [
        ...currentProject.attachments,
        normalizeAttachment(attachment, `pa-${projectId}-${currentProject.attachments.length}`)
      ];

      return updateProject(projectId, { attachments: nextAttachments });
    },
    [actor, projects, updateProject]
  );

  const removeProjectAttachment = useCallback(
    async (projectId: string, attachmentId: string) => {
      const currentProject = projects.find((project) => project.id === projectId);
      if (!currentProject || isProjectArchived(currentProject)) {
        return false;
      }
      if (!ProjectPolicy.removeAttachment(actor, currentProject)) {
        return false;
      }

      return updateProject(projectId, {
        attachments: currentProject.attachments.filter((item) => item.id !== attachmentId)
      });
    },
    [actor, projects, updateProject]
  );

  const addExternalParticipant = useCallback(
    async (
      projectId: string,
      participant: Omit<ExternalParticipant, "id" | "createdAt" | "updatedAt">
    ) => {
      const currentProject = projects.find((project) => project.id === projectId);
      if (!currentProject || isProjectArchived(currentProject)) {
        return false;
      }
      if (!ProjectPolicy.update(actor, currentProject)) {
        return false;
      }

      const nextParticipant = normalizeExternalParticipant(
        {
          ...participant,
          isArchived: Boolean(participant.isArchived),
          archivedAt: participant.archivedAt,
          createdAt: nowStamp(),
          updatedAt: nowStamp()
        },
        `ep-${projectId}-${currentProject.externalParticipants.length}`
      );

      if (!nextParticipant) {
        return false;
      }

      return updateProject(projectId, {
        externalParticipants: [...currentProject.externalParticipants, nextParticipant]
      });
    },
    [actor, projects, updateProject]
  );

  const updateExternalParticipant = useCallback(
    async (projectId: string, participantId: string, input: Partial<ExternalParticipant>) => {
      const currentProject = projects.find((project) => project.id === projectId);
      if (!currentProject || isProjectArchived(currentProject)) {
        return false;
      }
      if (!ProjectPolicy.update(actor, currentProject)) {
        return false;
      }

      return updateProject(projectId, {
        externalParticipants: currentProject.externalParticipants.map((participant) =>
          participant.id === participantId
            ? {
                ...participant,
                ...input
              }
            : participant
        )
      });
    },
    [actor, projects, updateProject]
  );

  const archiveExternalParticipant = useCallback(
    async (projectId: string, participantId: string) => {
      const currentProject = projects.find((project) => project.id === projectId);
      if (!currentProject || isProjectArchived(currentProject)) {
        return false;
      }
      if (!ProjectPolicy.update(actor, currentProject)) {
        return false;
      }

      return updateProject(projectId, {
        externalParticipants: currentProject.externalParticipants.map((participant) =>
          participant.id === participantId
            ? {
                ...participant,
                archivedAt: nowStamp(),
                isArchived: true
              }
            : participant
        )
      });
    },
    [actor, projects, updateProject]
  );

  const restoreExternalParticipant = useCallback(
    async (projectId: string, participantId: string) => {
      const currentProject = projects.find((project) => project.id === projectId);
      if (!currentProject || isProjectArchived(currentProject)) {
        return false;
      }
      if (!ProjectPolicy.update(actor, currentProject)) {
        return false;
      }

      return updateProject(projectId, {
        externalParticipants: currentProject.externalParticipants.map((participant) =>
          participant.id === participantId
            ? {
                ...participant,
                archivedAt: undefined,
                isArchived: false
              }
            : participant
        )
      });
    },
    [actor, projects, updateProject]
  );

  const replaceProjects = useCallback(async (value: Project[]) => {
    const replaced = normalizeProjects(await bulkReplaceProjects(normalizeProjects(value)));
    setProjects(replaced);
    clearPersistedValue(PROJECTS_STORAGE_KEY);
  }, []);

  const resetProjects = useCallback(async () => {
    const replaced = normalizeProjects(await bulkReplaceProjects(normalizedInitialProjects));
    setProjects(replaced);
    clearPersistedValue(PROJECTS_STORAGE_KEY);
  }, []);

  const value = useMemo(
    () => ({
      projects,
      addProject,
      updateProject,
      archiveProject,
      restoreProject,
      setOwner,
      setDeputy,
      setParticipants,
      addProjectAttachment,
      removeProjectAttachment,
      addExternalParticipant,
      updateExternalParticipant,
      archiveExternalParticipant,
      restoreExternalParticipant,
      validateDependencyCandidate,
      replaceProjects,
      resetProjects,
      reloadProjects
    }),
    [
      addExternalParticipant,
      addProject,
      addProjectAttachment,
      archiveExternalParticipant,
      archiveProject,
      projects,
      reloadProjects,
      removeProjectAttachment,
      replaceProjects,
      resetProjects,
      restoreExternalParticipant,
      restoreProject,
      setDeputy,
      setOwner,
      setParticipants,
      validateDependencyCandidate,
      updateExternalParticipant,
      updateProject
    ]
  );

  return <ProjectsContext.Provider value={value}>{children}</ProjectsContext.Provider>;
}

export function useProjects() {
  const context = useContext(ProjectsContext);
  if (!context) {
    throw new Error("useProjects must be used within ProjectsProvider");
  }
  return context;
}
