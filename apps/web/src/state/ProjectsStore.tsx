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
import { useAuditLog } from "./AuditLogStore";
import { loadJSON, saveJSON, STORAGE_KEYS } from "./persistence";

type ProjectCreateInput = Omit<
  Project,
  | "id"
  | "createdAt"
  | "updatedAt"
  | "attachments"
  | "externalParticipants"
  | "participantUserIds"
  | "internalParticipants"
  | "isArchived"
  | "archivedAt"
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
  restoreProject: (id: string) => boolean;
  setOwner: (projectId: string, ownerUserId?: string) => boolean;
  setDeputy: (projectId: string, deputyUserId?: string) => boolean;
  setParticipants: (projectId: string, participantUserIds: string[]) => boolean;
  addProjectAttachment: (projectId: string, attachment: ProjectAttachment) => boolean;
  removeProjectAttachment: (projectId: string, attachmentId: string) => boolean;
  addExternalParticipant: (
    projectId: string,
    participant: Omit<ExternalParticipant, "id" | "createdAt" | "updatedAt">
  ) => boolean;
  updateExternalParticipant: (
    projectId: string,
    participantId: string,
    input: Partial<ExternalParticipant>
  ) => boolean;
  archiveExternalParticipant: (projectId: string, participantId: string) => boolean;
  restoreExternalParticipant: (projectId: string, participantId: string) => boolean;
  replaceProjects: (projects: Project[]) => void;
  resetProjects: () => void;
};

const ProjectsContext = createContext<ProjectsContextValue | undefined>(undefined);

function createId(prefix: "p" | "pa" | "ep") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

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
  return value
    .map((project, index) => normalizeProject(project as Partial<Project>, index))
    .filter((project): project is Project => Boolean(project));
}

function isProjectArchived(project: Project) {
  return Boolean(project.archivedAt || project.isArchived);
}

export function ProjectsProvider({ children }: { children: React.ReactNode }) {
  const { actor } = useAuthorization();
  const { logEvent } = useAuditLog();
  const [projects, setProjects] = useState<Project[]>(() =>
    loadJSON<Project[]>(STORAGE_KEYS.projects, {
      fallback: initialProjects,
      migrate: (value) => {
        const normalized = normalizeProjects(value);
        return normalized.length ? normalized : initialProjects;
      }
    }) ?? initialProjects
  );

  React.useEffect(() => {
    saveJSON(STORAGE_KEYS.projects, projects);
  }, [projects]);

  const addProject = useCallback(
    (input: ProjectCreateInput) => {
      if (!ProjectPolicy.create(actor)) {
        return false;
      }
      const timestamp = nowStamp();
      const participantUserIds = normalizeParticipantUserIds(input);
      const internalParticipants =
        input.internalParticipants && input.internalParticipants.length
          ? input.internalParticipants
          : participantUserIds.map((userId) => ({ userId }));

      const newProject: Project = {
        ...input,
        id: createId("p"),
        attachments: (input.attachments ?? []).map((attachment, index) =>
          normalizeAttachment(attachment, `pa-${timestamp}-${index}`)
        ),
        externalParticipants: (input.externalParticipants ?? [])
          .map((participant, index) =>
            normalizeExternalParticipant(participant, `ep-${timestamp}-${index}`)
          )
          .filter((participant): participant is ExternalParticipant => Boolean(participant)),
        internalParticipants,
        participantUserIds:
          participantUserIds.length > 0
            ? participantUserIds
            : internalParticipants.map((participant) => participant.userId),
        archivedAt: undefined,
        isArchived: false,
        createdAt: timestamp,
        updatedAt: timestamp
      };

      setProjects((prev) => [newProject, ...prev]);
      logEvent({
        actorLabel: "Demo User",
        entityType: "PROJECT",
        entityId: newProject.id,
        action: "CREATED",
        summary: newProject.title
      });
      return true;
    },
    [actor, logEvent]
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

      const timestamp = nowStamp();
      const participantUserIds = normalizeParticipantUserIds({
        internalParticipants: input.internalParticipants,
        participantUserIds: input.participantUserIds
      });

      setProjects((prev) =>
        prev.map((project) =>
          project.id === id
            ? {
                ...project,
                ...input,
                internalParticipants:
                  input.internalParticipants && input.internalParticipants.length
                    ? input.internalParticipants
                    : project.internalParticipants,
                participantUserIds:
                  participantUserIds.length > 0 ? participantUserIds : project.participantUserIds,
                attachments: Array.isArray(input.attachments)
                  ? input.attachments.map((attachment, index) =>
                      normalizeAttachment(attachment, `pa-${id}-${index}`)
                    )
                  : project.attachments,
                externalParticipants: Array.isArray(input.externalParticipants)
                  ? input.externalParticipants
                      .map((participant, index) =>
                        normalizeExternalParticipant(
                          participant,
                          `ep-${id}-${index}`
                        )
                      )
                      .filter(
                        (participant): participant is ExternalParticipant => Boolean(participant)
                      )
                  : project.externalParticipants,
                updatedAt: timestamp
              }
            : project
        )
      );

      logEvent({
        actorLabel: "Demo User",
        entityType: "PROJECT",
        entityId: id,
        action: "UPDATED",
        summary: currentProject.title
      });
      return true;
    },
    [actor, logEvent, projects]
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
      const timestamp = nowStamp();
      setProjects((prev) =>
        prev.map((project) =>
          project.id === id
            ? {
                ...project,
                archivedAt: timestamp,
                isArchived: true,
                updatedAt: timestamp
              }
            : project
        )
      );
      logEvent({
        actorLabel: "Demo User",
        entityType: "PROJECT",
        entityId: id,
        action: "ARCHIVED",
        summary: currentProject.title
      });
      return true;
    },
    [actor, logEvent, projects]
  );

  const restoreProject = useCallback(
    (id: string) => {
      const currentProject = projects.find((project) => project.id === id);
      if (!currentProject) {
        return false;
      }
      if (!ProjectPolicy.archive(actor, currentProject)) {
        return false;
      }
      const timestamp = nowStamp();
      setProjects((prev) =>
        prev.map((project) =>
          project.id === id
            ? {
                ...project,
                archivedAt: undefined,
                isArchived: false,
                updatedAt: timestamp
              }
            : project
        )
      );
      logEvent({
        actorLabel: "Demo User",
        entityType: "PROJECT",
        entityId: id,
        action: "RESTORED",
        summary: currentProject.title
      });
      return true;
    },
    [actor, logEvent, projects]
  );

  const setOwner = useCallback(
    (projectId: string, ownerUserId?: string) =>
      updateProject(projectId, { ownerUserId }),
    [updateProject]
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
    (projectId: string, attachment: ProjectAttachment) => {
      const currentProject = projects.find((project) => project.id === projectId);
      if (!currentProject || isProjectArchived(currentProject)) {
        return false;
      }
      if (!ProjectPolicy.update(actor, currentProject)) {
        return false;
      }

      const timestamp = nowStamp();
      setProjects((prev) =>
        prev.map((project) =>
          project.id === projectId
            ? {
                ...project,
                attachments: [
                  ...project.attachments,
                  normalizeAttachment(attachment, createId("pa"))
                ],
                updatedAt: timestamp
              }
            : project
        )
      );
      logEvent({
        actorLabel: "Demo User",
        entityType: "PROJECT",
        entityId: projectId,
        action: "UPDATED",
        summary: currentProject.title
      });
      return true;
    },
    [actor, logEvent, projects]
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
      const timestamp = nowStamp();
      setProjects((prev) =>
        prev.map((project) =>
          project.id === projectId
            ? {
                ...project,
                attachments: project.attachments.filter((item) => item.id !== attachmentId),
                updatedAt: timestamp
              }
            : project
        )
      );
      logEvent({
        actorLabel: "Demo User",
        entityType: "PROJECT",
        entityId: projectId,
        action: "UPDATED",
        summary: currentProject.title
      });
      return true;
    },
    [actor, logEvent, projects]
  );

  const addExternalParticipant = useCallback(
    (
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
      const timestamp = nowStamp();
      setProjects((prev) =>
        prev.map((project) =>
          project.id === projectId
            ? {
                ...project,
                externalParticipants: [
                  ...project.externalParticipants,
                  {
                    id: createId("ep"),
                    type: participant.type,
                    organization: participant.organization ?? "",
                    name: participant.name,
                    email: participant.email ?? "",
                    phone: participant.phone ?? "",
                    notes: participant.notes ?? "",
                    archivedAt: participant.archivedAt,
                    isArchived: Boolean(participant.isArchived),
                    createdAt: timestamp,
                    updatedAt: timestamp
                  }
                ],
                updatedAt: timestamp
              }
            : project
        )
      );
      logEvent({
        actorLabel: "Demo User",
        entityType: "PROJECT",
        entityId: projectId,
        action: "UPDATED",
        summary: currentProject.title
      });
      return true;
    },
    [actor, logEvent, projects]
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
      const timestamp = nowStamp();
      setProjects((prev) =>
        prev.map((project) =>
          project.id === projectId
            ? {
                ...project,
                externalParticipants: project.externalParticipants.map((participant) =>
                  participant.id === participantId
                    ? {
                        ...participant,
                        ...input,
                        updatedAt: timestamp
                      }
                    : participant
                ),
                updatedAt: timestamp
              }
            : project
        )
      );
      logEvent({
        actorLabel: "Demo User",
        entityType: "PROJECT",
        entityId: projectId,
        action: "UPDATED",
        summary: currentProject.title
      });
      return true;
    },
    [actor, logEvent, projects]
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
      const timestamp = nowStamp();
      setProjects((prev) =>
        prev.map((project) =>
          project.id === projectId
            ? {
                ...project,
                externalParticipants: project.externalParticipants.map((participant) =>
                  participant.id === participantId
                    ? {
                        ...participant,
                        archivedAt: timestamp,
                        isArchived: true,
                        updatedAt: timestamp
                      }
                    : participant
                ),
                updatedAt: timestamp
              }
            : project
        )
      );
      logEvent({
        actorLabel: "Demo User",
        entityType: "PROJECT",
        entityId: projectId,
        action: "UPDATED",
        summary: currentProject.title
      });
      return true;
    },
    [actor, logEvent, projects]
  );

  const restoreExternalParticipant = useCallback(
    (projectId: string, participantId: string) => {
      const currentProject = projects.find((project) => project.id === projectId);
      if (!currentProject || isProjectArchived(currentProject)) {
        return false;
      }
      if (!ProjectPolicy.update(actor, currentProject)) {
        return false;
      }
      const timestamp = nowStamp();
      setProjects((prev) =>
        prev.map((project) =>
          project.id === projectId
            ? {
                ...project,
                externalParticipants: project.externalParticipants.map((participant) =>
                  participant.id === participantId
                    ? {
                        ...participant,
                        archivedAt: undefined,
                        isArchived: false,
                        updatedAt: timestamp
                      }
                    : participant
                ),
                updatedAt: timestamp
              }
            : project
        )
      );
      logEvent({
        actorLabel: "Demo User",
        entityType: "PROJECT",
        entityId: projectId,
        action: "UPDATED",
        summary: currentProject.title
      });
      return true;
    },
    [actor, logEvent, projects]
  );

  const replaceProjects = useCallback((value: Project[]) => {
    const normalized = normalizeProjects(value);
    setProjects(normalized.length ? normalized : initialProjects);
  }, []);

  const resetProjects = useCallback(() => {
    setProjects(initialProjects);
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
      replaceProjects,
      resetProjects
    }),
    [
      addExternalParticipant,
      addProject,
      addProjectAttachment,
      archiveExternalParticipant,
      archiveProject,
      projects,
      removeProjectAttachment,
      replaceProjects,
      resetProjects,
      restoreExternalParticipant,
      restoreProject,
      setDeputy,
      setOwner,
      setParticipants,
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
