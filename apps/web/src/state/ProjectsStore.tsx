import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import {
  ExternalParticipant,
  Project,
  ProjectAttachment,
  projects as initialProjects
} from "../data/projects";

export type ProjectsContextValue = {
  projects: Project[];
  addProject: (
    input: Omit<Project, "id" | "updatedAt" | "attachments" | "externalParticipants"> & {
      attachments?: ProjectAttachment[];
      externalParticipants?: ExternalParticipant[];
    }
  ) => void;
  updateProject: (id: string, input: Partial<Project>) => void;
  archiveProject: (id: string) => void;
  addProjectAttachment: (projectId: string, attachment: ProjectAttachment) => void;
  removeProjectAttachment: (projectId: string, attachmentId: string) => void;
  addExternalParticipant: (
    projectId: string,
    participant: Omit<ExternalParticipant, "id">
  ) => void;
  updateExternalParticipant: (
    projectId: string,
    participantId: string,
    input: Partial<ExternalParticipant>
  ) => void;
  archiveExternalParticipant: (projectId: string, participantId: string) => void;
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

export function ProjectsProvider({ children }: { children: React.ReactNode }) {
  const [projects, setProjects] = useState<Project[]>(initialProjects);

  const addProject = useCallback(
    (
      input: Omit<Project, "id" | "updatedAt" | "attachments" | "externalParticipants"> & {
        attachments?: ProjectAttachment[];
        externalParticipants?: ExternalParticipant[];
      }
    ) => {
      const newProject: Project = {
        ...input,
        id: createId("p"),
        attachments: input.attachments ?? [],
        externalParticipants: input.externalParticipants ?? [],
        participantUserIds: input.participantUserIds ?? [],
        updatedAt: todayStamp(),
        isArchived: false
      };
      setProjects((prev) => [newProject, ...prev]);
    },
    []
  );

  const updateProject = useCallback((id: string, input: Partial<Project>) => {
    setProjects((prev) =>
      prev.map((project) =>
        project.id === id
          ? {
              ...project,
              ...input,
              updatedAt: todayStamp()
            }
          : project
      )
    );
  }, []);

  const archiveProject = useCallback((id: string) => {
    setProjects((prev) =>
      prev.map((project) =>
        project.id === id ? { ...project, isArchived: true, updatedAt: todayStamp() } : project
      )
    );
  }, []);

  const addProjectAttachment = useCallback((projectId: string, attachment: ProjectAttachment) => {
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
  }, []);

  const removeProjectAttachment = useCallback((projectId: string, attachmentId: string) => {
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
  }, []);

  const addExternalParticipant = useCallback(
    (projectId: string, participant: Omit<ExternalParticipant, "id">) => {
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
    },
    []
  );

  const updateExternalParticipant = useCallback(
    (projectId: string, participantId: string, input: Partial<ExternalParticipant>) => {
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
    },
    []
  );

  const archiveExternalParticipant = useCallback((projectId: string, participantId: string) => {
    setProjects((prev) =>
      prev.map((project) =>
        project.id === projectId
          ? {
              ...project,
              externalParticipants: (project.externalParticipants ?? []).map((participant) =>
                participant.id === participantId
                  ? { ...participant, isArchived: true }
                  : participant
              ),
              updatedAt: todayStamp()
            }
          : project
      )
    );
  }, []);

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
