import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import {
  ExternalParticipant,
  ProjectInternalParticipant,
  Project,
  ProjectAttachment,
  projects as initialProjects
} from "../data/projects";
import { ProjectPolicy } from "../policies/ProjectPolicy";
import { useAuthorization } from "./AuthorizationStore";

type ProjectCreateInput = Omit<
  Project,
  "id" | "updatedAt" | "attachments" | "externalParticipants" | "internalParticipants"
> & {
  attachments?: ProjectAttachment[];
  externalParticipants?: ExternalParticipant[];
  internalParticipants?: ProjectInternalParticipant[];
  participantUserIds?: string[];
};

export type ProjectsContextValue = {
  projects: Project[];
  addProject: (input: ProjectCreateInput) => boolean;
  updateProject: (id: string, input: Partial<Project>) => boolean;
  archiveProject: (id: string) => boolean;
  addProjectAttachment: (projectId: string, attachment: ProjectAttachment) => boolean;
  removeProjectAttachment: (projectId: string, attachmentId: string) => boolean;
  addExternalParticipant: (
    projectId: string,
    participant: Omit<ExternalParticipant, "id">
  ) => boolean;
  updateExternalParticipant: (
    projectId: string,
    participantId: string,
    input: Partial<ExternalParticipant>
  ) => boolean;
  archiveExternalParticipant: (projectId: string, participantId: string) => boolean;
};

const ProjectsContext = createContext<ProjectsContextValue | undefined>(undefined);

function createId(prefix: "p" | "pa") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function createExternalParticipantId() {
  return `ep-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}

function isProjectArchived(project: Project) {
  return Boolean(project.archivedAt || project.isArchived);
}

function normalizeInternalParticipants(
  input: Pick<Project, "internalParticipants" | "participantUserIds"> | ProjectCreateInput
) {
  const explicitParticipants = input.internalParticipants ?? [];
  if (explicitParticipants.length) {
    return explicitParticipants;
  }
  return (input.participantUserIds ?? []).map((userId) => ({ userId }));
}

export function ProjectsProvider({ children }: { children: React.ReactNode }) {
  const { actor } = useAuthorization();
  const [projects, setProjects] = useState<Project[]>(initialProjects);

  const addProject = useCallback(
    (input: ProjectCreateInput) => {
      if (!ProjectPolicy.create(actor)) {
        return false;
      }
      const internalParticipants = normalizeInternalParticipants(input);
      const newProject: Project = {
        ...input,
        id: createId("p"),
        attachments: input.attachments ?? [],
        externalParticipants: input.externalParticipants ?? [],
        internalParticipants,
        participantUserIds: internalParticipants.map((participant) => participant.userId),
        updatedAt: todayStamp(),
        archivedAt: undefined,
        isArchived: false
      };
      setProjects((prev) => [newProject, ...prev]);
      return true;
    },
    [actor]
  );

  const updateProject = useCallback(
    (id: string, input: Partial<Project>) => {
      const currentProject = projects.find((project) => project.id === id);
      if (!currentProject) {
        return false;
      }
      if (!ProjectPolicy.update(actor, currentProject)) {
        return false;
      }

      const internalParticipants = input.internalParticipants
        ? normalizeInternalParticipants({
            internalParticipants: input.internalParticipants,
            participantUserIds: input.participantUserIds
          })
        : undefined;

      setProjects((prev) =>
        prev.map((project) =>
          project.id === id
            ? {
                ...project,
                ...input,
                internalParticipants: internalParticipants ?? project.internalParticipants,
                participantUserIds: (
                  internalParticipants ?? project.internalParticipants
                ).map((participant) => participant.userId),
                updatedAt: todayStamp()
              }
            : project
        )
      );
      return true;
    },
    [actor, projects]
  );

  const archiveProject = useCallback(
    (id: string) => {
      const currentProject = projects.find((project) => project.id === id);
      if (!currentProject) {
        return false;
      }
      if (!ProjectPolicy.archive(actor, currentProject)) {
        return false;
      }

      setProjects((prev) =>
        prev.map((project) =>
          project.id === id
            ? {
                ...project,
                archivedAt: todayStamp(),
                isArchived: true,
                updatedAt: todayStamp()
              }
            : project
        )
      );
      return true;
    },
    [actor, projects]
  );

  const addProjectAttachment = useCallback(
    (projectId: string, attachment: ProjectAttachment) => {
      const currentProject = projects.find((project) => project.id === projectId);
      if (!currentProject || isProjectArchived(currentProject)) {
        return false;
      }
      if (!ProjectPolicy.update(actor, currentProject)) {
        return false;
      }

      setProjects((prev) =>
        prev.map((project) =>
          project.id === projectId
            ? {
                ...project,
                attachments: [
                  ...project.attachments,
                  {
                    ...attachment,
                    id: attachment.id || createId("pa")
                  }
                ],
                updatedAt: todayStamp()
              }
            : project
        )
      );
      return true;
    },
    [actor, projects]
  );

  const removeProjectAttachment = useCallback(
    (projectId: string, attachmentId: string) => {
      const currentProject = projects.find((project) => project.id === projectId);
      if (!currentProject || isProjectArchived(currentProject)) {
        return false;
      }
      if (!ProjectPolicy.removeAttachment(actor, currentProject)) {
        return false;
      }

      setProjects((prev) =>
        prev.map((project) =>
          project.id === projectId
            ? {
                ...project,
                attachments: project.attachments.filter((item) => item.id !== attachmentId),
                updatedAt: todayStamp()
              }
            : project
        )
      );
      return true;
    },
    [actor, projects]
  );

  const addExternalParticipant = useCallback(
    (projectId: string, participant: Omit<ExternalParticipant, "id">) => {
      const currentProject = projects.find((project) => project.id === projectId);
      if (!currentProject || isProjectArchived(currentProject)) {
        return false;
      }
      if (!ProjectPolicy.update(actor, currentProject)) {
        return false;
      }

      setProjects((prev) =>
        prev.map((project) =>
          project.id === projectId
            ? {
                ...project,
                externalParticipants: [
                  ...(project.externalParticipants ?? []),
                  {
                    ...participant,
                    id: createExternalParticipantId()
                  }
                ],
                updatedAt: todayStamp()
              }
            : project
        )
      );
      return true;
    },
    [actor, projects]
  );

  const updateExternalParticipant = useCallback(
    (projectId: string, participantId: string, input: Partial<ExternalParticipant>) => {
      const currentProject = projects.find((project) => project.id === projectId);
      if (!currentProject || isProjectArchived(currentProject)) {
        return false;
      }
      if (!ProjectPolicy.update(actor, currentProject)) {
        return false;
      }

      setProjects((prev) =>
        prev.map((project) =>
          project.id === projectId
            ? {
                ...project,
                externalParticipants: (project.externalParticipants ?? []).map((participant) =>
                  participant.id === participantId ? { ...participant, ...input } : participant
                ),
                updatedAt: todayStamp()
              }
            : project
        )
      );
      return true;
    },
    [actor, projects]
  );

  const archiveExternalParticipant = useCallback(
    (projectId: string, participantId: string) => {
      const currentProject = projects.find((project) => project.id === projectId);
      if (!currentProject || isProjectArchived(currentProject)) {
        return false;
      }
      if (!ProjectPolicy.update(actor, currentProject)) {
        return false;
      }

      setProjects((prev) =>
        prev.map((project) =>
          project.id === projectId
            ? {
                ...project,
                externalParticipants: (project.externalParticipants ?? []).map((participant) =>
                  participant.id === participantId
                    ? { ...participant, archivedAt: todayStamp(), isArchived: true }
                    : participant
                ),
                updatedAt: todayStamp()
              }
            : project
        )
      );
      return true;
    },
    [actor, projects]
  );

  const value = useMemo(
    () => ({
      projects,
      addProject,
      updateProject,
      archiveProject,
      addProjectAttachment,
      removeProjectAttachment,
      addExternalParticipant,
      updateExternalParticipant,
      archiveExternalParticipant
    }),
    [
      addExternalParticipant,
      addProject,
      addProjectAttachment,
      archiveExternalParticipant,
      archiveProject,
      projects,
      removeProjectAttachment,
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
