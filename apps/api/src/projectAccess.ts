import { Prisma, type PrismaClient, type ProjectAccessRole } from "@prisma/client";
import type { Response } from "express";
import { hasPermission, type PermissionKey } from "./accessControl.js";
import type { RouteUser } from "./routes/routeAuth.js";

type DbClient = PrismaClient | Prisma.TransactionClient;

export type ProjectAccessSource =
  | "GLOBAL"
  | "IMPLICIT_OWNER"
  | "IMPLICIT_DEPUTY"
  | "IMPLICIT_PARTICIPANT"
  | "EXPLICIT";

export type ProjectAccessAction = "read" | "write" | "manageAccess";

export type ProjectAccessFacts = {
  exists: boolean;
  canRead: boolean;
  canWrite: boolean;
  source?: ProjectAccessSource;
  role?: ProjectAccessRole;
};

export type ProjectDomain =
  | "projects"
  | "legalDocs"
  | "obligations"
  | "deadlines"
  | "tasks"
  | "documents"
  | "projectChecklists"
  | "legacyDecisions"
  | "comments";

export type ProjectAccessEntryDto = {
  id?: string;
  projectId: string;
  userId: string;
  accessRole: ProjectAccessRole;
  note?: string;
  source: ProjectAccessSource;
  grantedByUserId?: string;
  createdAt?: string;
  updatedAt?: string;
  user?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: string;
    type: string;
    externalOrgId?: string;
    externalOrgName?: string;
    isArchived: boolean;
  };
};

const INTERNAL_PROJECT_ACCESS_ROLES = new Set<ProjectAccessRole>([
  "PROJECT_VIEWER",
  "PROJECT_EDITOR"
]);

const EXTERNAL_PROJECT_ACCESS_ROLES = new Set<ProjectAccessRole>([
  "EXTERNAL_PROJECT_VIEWER",
  "EXTERNAL_EXECUTOR"
]);

const PROJECT_EDITOR_ROLES = new Set<ProjectAccessRole>([
  "PROJECT_EDITOR"
]);

function normalizeUserType(user: Pick<RouteUser, "type">) {
  return String(user.type ?? "").trim().toUpperCase();
}

export function isInternalUser(user: Pick<RouteUser, "type">) {
  return normalizeUserType(user) === "INTERNAL";
}

export function isExternalUser(user: Pick<RouteUser, "type">) {
  return normalizeUserType(user) === "EXTERNAL";
}

export function hasGlobalProjectReadAccess(user: RouteUser) {
  return (
    isInternalUser(user) &&
    hasPermission(user.permissionKeys, "projects.viewAll")
  );
}

export function hasGlobalProjectWriteAccess(user: RouteUser) {
  return (
    hasGlobalProjectReadAccess(user) &&
    hasPermission(user.permissionKeys, "projects.edit")
  );
}

export function canManageProjectAccess(user: RouteUser) {
  return (
    isInternalUser(user) &&
    hasPermission(user.permissionKeys, "admin.access") &&
    hasPermission(user.permissionKeys, "users.manage")
  );
}

function roleMatchesUserType(user: RouteUser, accessRole: ProjectAccessRole) {
  if (isExternalUser(user)) {
    return EXTERNAL_PROJECT_ACCESS_ROLES.has(accessRole);
  }
  return INTERNAL_PROJECT_ACCESS_ROLES.has(accessRole);
}

function toStringArrayFromJson(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (typeof entry === "string") {
        return entry.trim();
      }
      if (
        entry &&
        typeof entry === "object" &&
        typeof (entry as { userId?: unknown }).userId === "string"
      ) {
        return (entry as { userId: string }).userId.trim();
      }
      return "";
    })
    .filter((entry) => Boolean(entry));
}

export function projectIncludesInternalParticipant(
  project: { participantUserIds: Prisma.JsonValue; internalParticipants: Prisma.JsonValue },
  userId: string
) {
  const participantIds = new Set([
    ...toStringArrayFromJson(project.participantUserIds),
    ...toStringArrayFromJson(project.internalParticipants)
  ]);
  return participantIds.has(userId);
}

async function loadProjectAccessBasis(db: DbClient, projectId: string, userId: string) {
  const [project, explicitAccess] = await Promise.all([
    db.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        ownerUserId: true,
        deputyUserId: true,
        participantUserIds: true,
        internalParticipants: true
      }
    }),
    db.projectAccess.findUnique({
      where: {
        projectId_userId: {
          projectId,
          userId
        }
      },
      select: {
        accessRole: true
      }
    })
  ]);

  return {
    project,
    explicitAccess
  };
}

export async function getProjectAccessFacts(
  db: DbClient,
  user: RouteUser,
  projectId: string
): Promise<ProjectAccessFacts> {
  const { project, explicitAccess } = await loadProjectAccessBasis(db, projectId, user.id);
  if (!project) {
    return {
      exists: false,
      canRead: false,
      canWrite: false
    };
  }

  const matchingExplicitAccess = explicitAccess && roleMatchesUserType(user, explicitAccess.accessRole)
    ? explicitAccess
    : null;

  if (isInternalUser(user)) {
    if (project.ownerUserId === user.id) {
      return {
        exists: true,
        canRead: true,
        canWrite: true,
        source: "IMPLICIT_OWNER",
        role: "PROJECT_EDITOR"
      };
    }

    if (project.deputyUserId === user.id) {
      return {
        exists: true,
        canRead: true,
        canWrite: true,
        source: "IMPLICIT_DEPUTY",
        role: "PROJECT_EDITOR"
      };
    }
  }

  if (matchingExplicitAccess && PROJECT_EDITOR_ROLES.has(matchingExplicitAccess.accessRole)) {
    return {
      exists: true,
      canRead: true,
      canWrite: true,
      source: "EXPLICIT",
      role: matchingExplicitAccess.accessRole
    };
  }

  if (hasGlobalProjectWriteAccess(user)) {
    return {
      exists: true,
      canRead: true,
      canWrite: true,
      source: "GLOBAL",
      role: "PROJECT_EDITOR"
    };
  }

  if (matchingExplicitAccess) {
    return {
      exists: true,
      canRead: true,
      canWrite: false,
      source: "EXPLICIT",
      role: matchingExplicitAccess.accessRole
    };
  }

  if (isInternalUser(user) && projectIncludesInternalParticipant(project, user.id)) {
    return {
      exists: true,
      canRead: true,
      canWrite: false,
      source: "IMPLICIT_PARTICIPANT",
      role: "PROJECT_VIEWER"
    };
  }

  if (hasGlobalProjectReadAccess(user)) {
    return {
      exists: true,
      canRead: true,
      canWrite: false,
      source: "GLOBAL"
    };
  }

  return {
    exists: true,
    canRead: false,
    canWrite: false
  };
}

export async function getAccessibleProjectIds(db: DbClient, user: RouteUser) {
  if (hasGlobalProjectReadAccess(user)) {
    return null;
  }

  const explicitAccessRows = await db.projectAccess.findMany({
    where: {
      userId: user.id,
      accessRole: {
        in: isExternalUser(user)
          ? Array.from(EXTERNAL_PROJECT_ACCESS_ROLES)
          : Array.from(INTERNAL_PROJECT_ACCESS_ROLES)
      }
    },
    select: {
      projectId: true
    }
  });
  const projectIds = new Set(explicitAccessRows.map((entry) => entry.projectId));

  if (isInternalUser(user)) {
    const projects = await db.project.findMany({
      select: {
        id: true,
        ownerUserId: true,
        deputyUserId: true,
        participantUserIds: true,
        internalParticipants: true
      }
    });

    projects.forEach((project) => {
      if (
        project.ownerUserId === user.id ||
        project.deputyUserId === user.id ||
        projectIncludesInternalParticipant(project, user.id)
      ) {
        projectIds.add(project.id);
      }
    });
  }

  return Array.from(projectIds);
}

export async function getAccessibleProjectIdFilter(db: DbClient, user: RouteUser) {
  const projectIds = await getAccessibleProjectIds(db, user);
  if (projectIds === null) {
    return undefined;
  }
  return {
    in: projectIds
  };
}

export async function requireProjectAccess(input: {
  db: DbClient;
  user: RouteUser;
  projectId: string;
  action?: ProjectAccessAction;
  res: Response;
}) {
  const facts = await getProjectAccessFacts(input.db, input.user, input.projectId);
  if (!facts.exists) {
    input.res.status(404).json({ ok: false, message: "Project not found." });
    return null;
  }

  const action = input.action ?? "read";
  const allowed = action === "write" || action === "manageAccess" ? facts.canWrite : facts.canRead;
  if (!allowed) {
    input.res.status(403).json({ ok: false, message: "Forbidden." });
    return null;
  }

  return facts;
}

function domainReadPermissions(domain: ProjectDomain): PermissionKey[] {
  switch (domain) {
    case "projects":
    case "documents":
    case "projectChecklists":
    case "comments":
      return ["projects.view"];
    case "legalDocs":
    case "legacyDecisions":
      return ["legalDocs.view", "legalDocs.edit", "legalDocs.archive", "legalDocs.export"];
    case "obligations":
      return ["obligations.view", "obligations.edit", "obligations.archive", "obligations.export"];
    case "deadlines":
      return ["deadlines.view", "deadlines.edit", "deadlines.archive", "deadlines.export"];
    case "tasks":
      return ["tasks.view"];
    default:
      return [];
  }
}

export function hasDomainReadPermission(user: RouteUser, domain: ProjectDomain) {
  if (domain === "projects" && isExternalUser(user)) {
    return true;
  }

  const permissions = domainReadPermissions(domain);
  return permissions.length > 0 && permissions.some((permission) => hasPermission(user.permissionKeys, permission));
}

export function requireProjectDomainReadPermission(input: {
  user: RouteUser;
  domain: ProjectDomain;
  res: Response;
}) {
  if (isExternalUser(input.user) && input.domain !== "projects") {
    input.res.status(403).json({ ok: false, message: "Forbidden." });
    return false;
  }

  if (!hasDomainReadPermission(input.user, input.domain)) {
    input.res.status(403).json({ ok: false, message: "Forbidden." });
    return false;
  }

  return true;
}

function domainWritePermission(domain: ProjectDomain): PermissionKey | null {
  switch (domain) {
    case "projects":
    case "documents":
    case "projectChecklists":
    case "comments":
      return "projects.edit";
    case "legalDocs":
    case "legacyDecisions":
      return "legalDocs.edit";
    case "obligations":
      return "obligations.edit";
    case "deadlines":
      return "deadlines.edit";
    case "tasks":
      return "tasks.complete";
    default:
      return null;
  }
}

export async function getReadableProjectIdsForDomain(
  db: DbClient,
  user: RouteUser,
  domain: ProjectDomain
) {
  if (isExternalUser(user) && domain !== "projects") {
    return [];
  }

  if (!hasDomainReadPermission(user, domain)) {
    return [];
  }

  if (hasGlobalProjectReadAccess(user)) {
    return null;
  }

  return getAccessibleProjectIds(db, user);
}

export async function canReadProjectDomain(
  db: DbClient,
  user: RouteUser,
  projectId: string,
  domain: ProjectDomain
) {
  if (isExternalUser(user) && domain !== "projects") {
    return false;
  }

  if (!hasDomainReadPermission(user, domain)) {
    return false;
  }

  if (hasGlobalProjectReadAccess(user)) {
    return true;
  }

  const facts = await getProjectAccessFacts(db, user, projectId);
  return facts.exists && facts.canRead;
}

export async function requireProjectDomainRead(input: {
  db: DbClient;
  user: RouteUser;
  projectId: string;
  domain: ProjectDomain;
  res: Response;
  notFoundMessage?: string;
}) {
  if (!requireProjectDomainReadPermission(input)) {
    return false;
  }

  const facts = await getProjectAccessFacts(input.db, input.user, input.projectId);
  if (!facts.exists) {
    input.res.status(404).json({ ok: false, message: input.notFoundMessage ?? "Project not found." });
    return false;
  }

  if (!facts.canRead) {
    input.res.status(403).json({ ok: false, message: "Forbidden." });
    return false;
  }

  return true;
}

export async function requireProjectDomainWrite(input: {
  db: DbClient;
  user: RouteUser;
  projectId: string;
  domain: ProjectDomain;
  permission?: PermissionKey;
  res: Response;
  notFoundMessage?: string;
}) {
  if (isExternalUser(input.user)) {
    input.res.status(403).json({ ok: false, message: "Forbidden." });
    return false;
  }

  const permission = input.permission ?? domainWritePermission(input.domain);
  if (permission && !hasPermission(input.user.permissionKeys, permission)) {
    input.res.status(403).json({ ok: false, message: "Forbidden." });
    return false;
  }

  const facts = await getProjectAccessFacts(input.db, input.user, input.projectId);
  if (!facts.exists) {
    input.res.status(404).json({ ok: false, message: input.notFoundMessage ?? "Project not found." });
    return false;
  }

  if (!facts.canWrite) {
    input.res.status(403).json({ ok: false, message: "Forbidden." });
    return false;
  }

  return true;
}

function parseObligationTaskInstanceId(taskInstanceId: string) {
  if (!taskInstanceId.startsWith("obligation:")) {
    return null;
  }

  const parts = taskInstanceId.split(":");
  if (parts.length !== 3 || !parts[1] || !parts[2]) {
    return null;
  }

  return {
    obligationId: parts[1]
  };
}

export async function resolveTaskInstanceProjectId(db: DbClient, taskInstanceId: string) {
  const parsed = parseObligationTaskInstanceId(taskInstanceId);
  if (!parsed) {
    return null;
  }

  const obligation = await db.obligation.findUnique({
    where: {
      id: parsed.obligationId
    },
    select: {
      legalDocument: {
        select: {
          projectId: true
        }
      }
    }
  });

  return obligation?.legalDocument.projectId ?? null;
}

export async function resolveDeadlineProjectId(db: DbClient, deadlineId: string) {
  const deadline = await db.deadline.findUnique({
    where: {
      id: deadlineId
    },
    select: {
      projectId: true,
      legalDocument: {
        select: {
          projectId: true
        }
      }
    }
  });

  if (!deadline) {
    return { exists: false as const, projectId: null };
  }

  return {
    exists: true as const,
    projectId: deadline.projectId ?? deadline.legalDocument?.projectId ?? null
  };
}

export async function resolveDocumentOwnerProjectContext(
  db: DbClient,
  ownerType: string,
  ownerId: string
): Promise<{ exists: boolean; projectId: string | null }> {
  switch (ownerType.trim().toUpperCase()) {
    case "PROJECT": {
      const project = await db.project.findUnique({
        where: { id: ownerId },
        select: { id: true }
      });
      return { exists: Boolean(project), projectId: project?.id ?? null };
    }
    case "LEGAL_DOC": {
      const legalDoc = await db.legalDocument.findUnique({
        where: { id: ownerId },
        select: { projectId: true }
      });
      return { exists: Boolean(legalDoc), projectId: legalDoc?.projectId ?? null };
    }
    case "OBLIGATION": {
      const obligation = await db.obligation.findUnique({
        where: { id: ownerId },
        select: {
          legalDocument: {
            select: {
              projectId: true
            }
          }
        }
      });
      return {
        exists: Boolean(obligation),
        projectId: obligation?.legalDocument.projectId ?? null
      };
    }
    case "DEADLINE": {
      const deadline = await resolveDeadlineProjectId(db, ownerId);
      return { exists: deadline.exists, projectId: deadline.projectId };
    }
    case "TASK_EVIDENCE": {
      const projectId = await resolveTaskInstanceProjectId(db, ownerId);
      return { exists: Boolean(projectId), projectId };
    }
    case "LEGACY_DECISION": {
      const legacyDecision = await db.legacyDecision.findUnique({
        where: { id: ownerId },
        select: { projectId: true }
      });
      return { exists: Boolean(legacyDecision), projectId: legacyDecision?.projectId ?? null };
    }
    default:
      return { exists: false, projectId: null };
  }
}

export function toProjectAccessEntryDto(input: {
  entry: {
    id?: string;
    projectId: string;
    userId: string;
    accessRole: ProjectAccessRole;
    note?: string | null;
    grantedByUserId?: string | null;
    createdAt?: Date;
    updatedAt?: Date;
    user?: {
      id: string;
      firstName: string;
      lastName: string;
      email: string;
      role: string;
      type: string;
      externalOrgId?: string | null;
      isArchived: boolean;
      externalOrg?: {
        id: string;
        name: string;
      } | null;
    };
  };
  source: ProjectAccessSource;
}): ProjectAccessEntryDto {
  const user = input.entry.user;
  return {
    id: input.entry.id,
    projectId: input.entry.projectId,
    userId: input.entry.userId,
    accessRole: input.entry.accessRole,
    note: input.entry.note ?? undefined,
    source: input.source,
    grantedByUserId: input.entry.grantedByUserId ?? undefined,
    createdAt: input.entry.createdAt?.toISOString(),
    updatedAt: input.entry.updatedAt?.toISOString(),
    user: user
      ? {
          id: user.id,
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          role: user.role,
          type: user.type,
          externalOrgId: user.externalOrgId ?? undefined,
          externalOrgName: user.externalOrg?.name,
          isArchived: user.isArchived
        }
      : undefined
  };
}
