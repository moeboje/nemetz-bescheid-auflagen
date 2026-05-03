import { randomUUID } from "node:crypto";
import {
  Prisma,
  type PrismaClient,
  type Project as DbProject
} from "@prisma/client";
import { Router, type NextFunction, type Request, type Response } from "express";
import {
  applyNoStoreHeaders,
  requireAdminRoutePermissions,
  requireAuthenticatedRouteUser,
  requireInternalRouteUser,
  type RouteUser
} from "./routeAuth.js";
import {
  canManageProjectAccess,
  getAccessibleProjectIds,
  getProjectAccessFacts,
  hasGlobalProjectReadAccess,
  isInternalUser,
  requireProjectAccess,
  requireProjectDomainWrite,
  toProjectAccessEntryDto,
  type ProjectAccessSource
} from "../projectAccess.js";
import { hasPermission } from "../accessControl.js";

const PROJECT_STATUS_VALUES = [
  "DRAFT",
  "INTERNAL_REVIEW",
  "SUBMISSION_PREPARATION",
  "UVP_PREPARATION",
  "SUBMITTED",
  "ADDITIONAL_INFORMATION_REQUEST",
  "APPROVED",
  "IN_IMPLEMENTATION"
] as const;

type ProjectStatus = (typeof PROJECT_STATUS_VALUES)[number];

const PROJECT_SUBMISSION_TYPE_VALUES = ["GEWERBE", "AWG", "UVP_UVE"] as const;

type ProjectSubmissionType = (typeof PROJECT_SUBMISSION_TYPE_VALUES)[number];

const DEFAULT_PROJECT_STATUS: ProjectStatus = "DRAFT";
const INVALID_PROJECT_STATUS_MESSAGE = `Invalid project status. Allowed values: ${PROJECT_STATUS_VALUES.join(", ")}.`;
const INVALID_PROJECT_SUBMISSION_TYPE_MESSAGE = `Invalid project submission type. Allowed values: ${PROJECT_SUBMISSION_TYPE_VALUES.join(", ")}.`;

type ProjectAttachmentDto = {
  id: string;
  filename: string;
  sizeKb: number;
  mime?: string;
  addedAt: string;
  addedByLabel?: string;
};

type ProjectInternalParticipantDto = {
  userId: string;
  role?: string;
};

type ExternalParticipantDto = {
  id: string;
  type: string;
  externalOrgId?: string;
  externalUserId?: string;
  accessStatus?: string;
  organization?: string;
  name: string;
  email?: string;
  phone?: string;
  notes?: string;
  archivedAt?: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
};

type ProjectDto = {
  id: string;
  title: string;
  status?: ProjectStatus;
  submissionType?: ProjectSubmissionType;
  shortDescription?: string;
  authorityRef?: string;
  companyId: string;
  siteId?: string;
  facilityId?: string;
  authorityId?: string;
  authorityContactId?: string;
  ownerUserId?: string;
  deputyUserId?: string;
  internalParticipants: ProjectInternalParticipantDto[];
  participantUserIds: string[];
  dependsOnProjectIds: string[];
  referenceLegalDocIds: string[];
  externalParticipants: ExternalParticipantDto[];
  attachments: ProjectAttachmentDto[];
  archivedAt?: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
  currentUserAccessRole?: string;
  currentUserAccessSource?: ProjectAccessSource;
  currentUserCanWrite?: boolean;
  canUpdate?: boolean;
  canArchive?: boolean;
};

type ProjectDependencyValidationReason =
  | "missing"
  | "self"
  | "duplicate"
  | "cycle";

type ProjectDependencyValidationResult =
  | { ok: true }
  | { ok: false; reason: ProjectDependencyValidationReason };

type ProjectDependencyShape = Pick<ProjectDto, "id" | "dependsOnProjectIds">;

type SanitizeProjectRelationsResult = {
  projects: ProjectDto[];
  removedDependencyLinks: number;
  removedDependencyMissing: number;
  removedDependencySelf: number;
  removedDependencyCycles: number;
  removedLegalDocRefs: number;
};

type DbClient = PrismaClient | Prisma.TransactionClient;
type ProjectStatusRow = {
  id: string;
  status: string | null;
};

type ProjectRelationValidationResult =
  | {
      ok: true;
      companyId: string;
      siteId?: string;
      facilityId?: string;
      authorityId?: string;
      authorityContactId?: string;
      ownerUserId?: string;
      deputyUserId?: string;
    }
  | {
      ok: false;
      status: number;
      message: string;
    };

type InternalParticipantValidationResult =
  | { ok: true }
  | {
      ok: false;
      status: number;
      message: string;
    };

type ExternalParticipantValidationResult =
  | {
      ok: true;
      participants: ExternalParticipantDto[];
    }
  | {
      ok: false;
      status: number;
      message: string;
    };

function hasOwn(value: unknown, key: string) {
  return typeof value === "object" && value !== null && Object.prototype.hasOwnProperty.call(value, key);
}

function isPresent<T>(value: T | null): value is T {
  return value !== null;
}

function ensureStringField(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function toOptionalTrimmedString(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeProjectStatus(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  if (PROJECT_STATUS_VALUES.includes(trimmed as ProjectStatus)) {
    return trimmed as ProjectStatus;
  }

  throw new Error(INVALID_PROJECT_STATUS_MESSAGE);
}

function normalizeProjectSubmissionType(value: unknown) {
  if (value === undefined || value === null) {
    return undefined;
  }

  if (typeof value !== "string") {
    throw new Error(INVALID_PROJECT_SUBMISSION_TYPE_MESSAGE);
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  if (PROJECT_SUBMISSION_TYPE_VALUES.includes(trimmed as ProjectSubmissionType)) {
    return trimmed as ProjectSubmissionType;
  }

  throw new Error(INVALID_PROJECT_SUBMISSION_TYPE_MESSAGE);
}

function toDateValue(value?: string) {
  if (!value) {
    return new Date();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

function createServerId(prefix: string) {
  return `${prefix}-${randomUUID()}`;
}

function nowStamp() {
  return new Date().toISOString();
}

function toJsonInput(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? [])) as Prisma.InputJsonValue;
}

function normalizeRelationIds(value: unknown): string[] {
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

function normalizeAttachment(
  attachment: Partial<ProjectAttachmentDto>,
  fallbackId: string
): ProjectAttachmentDto {
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
  participant: Partial<ExternalParticipantDto>,
  fallbackId: string
): ExternalParticipantDto | null {
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
    type: typeof participant.type === "string" && participant.type.trim() ? participant.type : "OTHER",
    externalOrgId: toOptionalTrimmedString(participant.externalOrgId),
    externalUserId: toOptionalTrimmedString(participant.externalUserId),
    accessStatus: toOptionalTrimmedString(participant.accessStatus),
    organization: participant.organization ?? "",
    name: participant.name,
    email: participant.email ?? "",
    phone: participant.phone ?? "",
    notes: participant.notes ?? "",
    archivedAt: participant.archivedAt ?? undefined,
    isArchived: Boolean(participant.isArchived || participant.archivedAt),
    createdAt,
    updatedAt
  };
}

function normalizeInternalParticipants(
  value: unknown,
  participantUserIds: string[]
): ProjectInternalParticipantDto[] {
  if (Array.isArray(value) && value.length) {
    return value
      .map<ProjectInternalParticipantDto | null>((participant) => {
        if (!participant || typeof participant !== "object") {
          return null;
        }

        const row = participant as Partial<ProjectInternalParticipantDto>;
        if (typeof row.userId !== "string" || !row.userId.trim()) {
          return null;
        }

        return {
          userId: row.userId,
          role: row.role ?? ""
        };
      })
      .filter(isPresent);
  }

  return participantUserIds.map((userId) => ({ userId }));
}

function normalizeParticipantUserIds(input: {
  internalParticipants?: unknown;
  participantUserIds?: unknown;
}) {
  if (Array.isArray(input.internalParticipants) && input.internalParticipants.length) {
    return input.internalParticipants
      .map((participant) =>
        participant && typeof participant === "object" && typeof (participant as { userId?: unknown }).userId === "string"
          ? (participant as { userId: string }).userId
          : ""
      )
      .filter((value): value is string => Boolean(value.trim()));
  }

  return normalizeRelationIds(input.participantUserIds);
}

async function validateActiveInternalUser(
  prisma: PrismaClient,
  userId: string,
  messages: {
    notFound: string;
    invalid: string;
  }
): Promise<InternalParticipantValidationResult> {
  const user = await prisma.user.findUnique({
    where: {
      id: userId
    },
    select: {
      id: true,
      type: true,
      isArchived: true
    }
  });

  if (!user) {
    return { ok: false, status: 404, message: messages.notFound };
  }

  if (user.isArchived || String(user.type).toUpperCase() !== "INTERNAL") {
    return { ok: false, status: 400, message: messages.invalid };
  }

  return { ok: true };
}

async function validateInternalParticipantUsers(
  prisma: PrismaClient,
  userIds: string[]
): Promise<InternalParticipantValidationResult> {
  const normalizedUserIds = normalizeRelationIds(userIds);
  if (normalizedUserIds.length === 0) {
    return { ok: true };
  }

  const users = await prisma.user.findMany({
    where: {
      id: {
        in: normalizedUserIds
      }
    },
    select: {
      id: true,
      type: true,
      isArchived: true
    }
  });
  const usersById = new Map(users.map((user) => [user.id, user] as const));

  if (normalizedUserIds.some((userId) => !usersById.has(userId))) {
    return { ok: false, status: 404, message: "Internal participant user not found." };
  }

  const hasExternalOrArchivedUser = users.some(
    (user) => user.isArchived || String(user.type).toUpperCase() !== "INTERNAL"
  );
  if (hasExternalOrArchivedUser) {
    return {
      ok: false,
      status: 400,
      message: "Internal project participants must be active internal users."
    };
  }

  return { ok: true };
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

function isDependencyReachable(
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

function validateProjectDependencyCandidate(input: {
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
  overrideByProjectId.set(input.projectId, [...selectedDependencyIds, input.candidateProjectId]);

  const adjacency = buildDependencyAdjacency(input.projects, overrideByProjectId);
  if (isDependencyReachable(adjacency, input.candidateProjectId, input.projectId)) {
    return { ok: false, reason: "cycle" };
  }

  return { ok: true };
}

function sanitizeProjectDependencyIds(input: {
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

function sanitizeProjectRelations(projects: ProjectDto[]): SanitizeProjectRelationsResult {
  const projectIds = new Set(projects.map((project) => project.id));
  const adjacency = new Map(projects.map((project) => [project.id, [] as string[]]));

  let removedDependencyMissing = 0;
  let removedDependencySelf = 0;
  let removedDependencyCycles = 0;

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

    return {
      ...project,
      dependsOnProjectIds: sanitizedDependencyIds,
      referenceLegalDocIds: normalizeRelationIds(project.referenceLegalDocIds)
    };
  });

  return {
    projects: sanitizedProjects,
    removedDependencyLinks:
      removedDependencyMissing + removedDependencySelf + removedDependencyCycles,
    removedDependencyMissing,
    removedDependencySelf,
    removedDependencyCycles,
    removedLegalDocRefs: 0
  };
}

function normalizeProjectDto(value: unknown, index: number): ProjectDto | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const row = value as Partial<ProjectDto>;
  if (
    typeof row.id !== "string" ||
    !row.id.trim() ||
    typeof row.title !== "string" ||
    !row.title.trim() ||
    typeof row.companyId !== "string" ||
    !row.companyId.trim()
  ) {
    return null;
  }

  const createdAt =
    typeof row.createdAt === "string" && row.createdAt.trim() ? row.createdAt : nowStamp();
  const updatedAt =
    typeof row.updatedAt === "string" && row.updatedAt.trim() ? row.updatedAt : createdAt;
  const status = normalizeProjectStatus(row.status);
  const submissionType = normalizeProjectSubmissionType(row.submissionType);

  const participantUserIds = normalizeParticipantUserIds({
    internalParticipants: row.internalParticipants,
    participantUserIds: row.participantUserIds
  });
  const internalParticipants = normalizeInternalParticipants(
    row.internalParticipants,
    participantUserIds
  );

  const attachments = Array.isArray(row.attachments)
    ? row.attachments
        .map((attachment, attachmentIndex) =>
          normalizeAttachment(
            attachment,
            `pa-${row.id}-${index}-${attachmentIndex}`
          )
        )
    : [];

  const externalParticipants = Array.isArray(row.externalParticipants)
    ? row.externalParticipants
        .map((participant, participantIndex) =>
          normalizeExternalParticipant(
            participant,
            `ep-${row.id}-${index}-${participantIndex}`
          )
        )
        .filter(isPresent)
    : [];

  return {
    id: row.id,
    title: row.title,
    status,
    submissionType,
    shortDescription: row.shortDescription ?? "",
    authorityRef: row.authorityRef ?? "",
    companyId: row.companyId,
    siteId: row.siteId ?? undefined,
    facilityId: row.facilityId ?? undefined,
    authorityId: row.authorityId ?? undefined,
    authorityContactId: row.authorityContactId ?? undefined,
    ownerUserId: row.ownerUserId ?? undefined,
    deputyUserId: row.deputyUserId ?? undefined,
    internalParticipants,
    participantUserIds,
    dependsOnProjectIds: normalizeRelationIds(row.dependsOnProjectIds),
    referenceLegalDocIds: normalizeRelationIds(row.referenceLegalDocIds),
    externalParticipants,
    attachments,
    archivedAt: row.archivedAt ?? undefined,
    isArchived: Boolean(row.isArchived || row.archivedAt),
    createdAt,
    updatedAt
  };
}

function normalizeProjectsSnapshot(value: unknown): ProjectDto[] {
  const source =
    Array.isArray(value)
      ? value
      : value && typeof value === "object" && !Array.isArray(value) && Array.isArray((value as { projects?: unknown }).projects)
        ? (value as { projects: unknown[] }).projects
        : [];

  const normalized = source
    .map((project, index) => normalizeProjectDto(project, index))
    .filter(isPresent);

  return sanitizeProjectRelations(normalized).projects;
}

function toProjectDto(
  project: DbProject,
  status?: ProjectStatus
): ProjectDto {
  const participantUserIds = normalizeParticipantUserIds({
    participantUserIds: project.participantUserIds,
    internalParticipants: project.internalParticipants
  });
  const internalParticipants = normalizeInternalParticipants(
    project.internalParticipants,
    participantUserIds
  );

  const attachments = Array.isArray(project.attachments)
    ? project.attachments
        .map((attachment, index) =>
          normalizeAttachment(
            attachment as Partial<ProjectAttachmentDto>,
            `pa-${project.id}-${index}`
          )
        )
    : [];

  const externalParticipants = Array.isArray(project.externalParticipants)
    ? project.externalParticipants
        .map((participant, index) =>
          normalizeExternalParticipant(
            participant as Partial<ExternalParticipantDto>,
            `ep-${project.id}-${index}`
          )
        )
        .filter(isPresent)
    : [];

  return {
    id: project.id,
    title: project.title,
    status,
    submissionType: normalizeProjectSubmissionType(project.submissionType),
    shortDescription: project.shortDescription ?? "",
    authorityRef: project.authorityRef ?? "",
    companyId: project.companyId,
    siteId: project.siteId ?? undefined,
    facilityId: project.facilityId ?? undefined,
    authorityId: project.authorityId ?? undefined,
    authorityContactId: project.authorityContactId ?? undefined,
    ownerUserId: project.ownerUserId ?? undefined,
    deputyUserId: project.deputyUserId ?? undefined,
    internalParticipants,
    participantUserIds,
    dependsOnProjectIds: normalizeRelationIds(project.dependsOnProjectIds),
    referenceLegalDocIds: normalizeRelationIds(project.referenceLegalDocIds),
    externalParticipants,
    attachments,
    archivedAt: project.archivedAt ? project.archivedAt.toISOString() : undefined,
    isArchived: project.isArchived,
    createdAt: project.createdAt.toISOString(),
    updatedAt: project.updatedAt.toISOString()
  };
}

function toProjectCreateInput(project: ProjectDto): Prisma.ProjectUncheckedCreateInput {
  return {
    id: project.id,
    title: project.title,
    submissionType: project.submissionType ?? null,
    shortDescription: project.shortDescription || null,
    authorityRef: project.authorityRef || null,
    companyId: project.companyId,
    siteId: project.siteId ?? null,
    facilityId: project.facilityId ?? null,
    authorityId: project.authorityId ?? null,
    authorityContactId: project.authorityContactId ?? null,
    ownerUserId: project.ownerUserId ?? null,
    deputyUserId: project.deputyUserId ?? null,
    participantUserIds: toJsonInput(project.participantUserIds),
    internalParticipants: toJsonInput(project.internalParticipants),
    externalParticipants: toJsonInput(project.externalParticipants),
    attachments: toJsonInput(project.attachments),
    dependsOnProjectIds: toJsonInput(project.dependsOnProjectIds),
    referenceLegalDocIds: toJsonInput(project.referenceLegalDocIds),
    archivedAt: project.archivedAt ? new Date(project.archivedAt) : null,
    isArchived: Boolean(project.isArchived || project.archivedAt),
    createdAt: toDateValue(project.createdAt),
    updatedAt: toDateValue(project.updatedAt)
  };
}

function toProjectUpdateInput(project: ProjectDto): Prisma.ProjectUncheckedUpdateInput {
  return {
    title: project.title,
    submissionType: project.submissionType ?? null,
    shortDescription: project.shortDescription || null,
    authorityRef: project.authorityRef || null,
    companyId: project.companyId,
    siteId: project.siteId ?? null,
    facilityId: project.facilityId ?? null,
    authorityId: project.authorityId ?? null,
    authorityContactId: project.authorityContactId ?? null,
    ownerUserId: project.ownerUserId ?? null,
    deputyUserId: project.deputyUserId ?? null,
    participantUserIds: toJsonInput(project.participantUserIds),
    internalParticipants: toJsonInput(project.internalParticipants),
    externalParticipants: toJsonInput(project.externalParticipants),
    attachments: toJsonInput(project.attachments),
    dependsOnProjectIds: toJsonInput(project.dependsOnProjectIds),
    referenceLegalDocIds: toJsonInput(project.referenceLegalDocIds),
    archivedAt: project.archivedAt ? new Date(project.archivedAt) : null,
    isArchived: Boolean(project.isArchived || project.archivedAt),
    updatedAt: toDateValue(project.updatedAt)
  };
}

async function readProjectStatusMap(db: DbClient, projectIds: string[]) {
  if (projectIds.length === 0) {
    return new Map<string, ProjectStatus | undefined>();
  }

  const rows = await db.$queryRaw<ProjectStatusRow[]>(
    Prisma.sql`SELECT "id", "status"::text AS "status" FROM "Project" WHERE "id" IN (${Prisma.join(projectIds)})`
  );

  const statusByProjectId = new Map<string, ProjectStatus | undefined>();
  rows.forEach((row) => {
    statusByProjectId.set(row.id, normalizeProjectStatus(row.status));
  });

  return statusByProjectId;
}

async function readProjectStatus(db: DbClient, projectId: string) {
  const statusByProjectId = await readProjectStatusMap(db, [projectId]);
  return statusByProjectId.get(projectId);
}

async function updateProjectStatus(
  db: DbClient,
  projectId: string,
  status?: ProjectStatus
) {
  await db.$executeRaw(
    Prisma.sql`UPDATE "Project" SET "status" = ${status ?? null}::"ProjectStatus" WHERE "id" = ${projectId}`
  );
}

async function listProjectsSnapshot(db: DbClient, where?: Prisma.ProjectWhereInput): Promise<ProjectDto[]> {
  const projects = await db.project.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }]
  });

  const statusByProjectId = await readProjectStatusMap(
    db,
    projects.map((project) => project.id)
  );

  return sanitizeProjectRelations(
    projects.map((project) => toProjectDto(project, statusByProjectId.get(project.id)))
  ).projects;
}

async function annotateProjectForUser(
  db: DbClient,
  user: RouteUser,
  project: ProjectDto
) {
  const facts = await getProjectAccessFacts(db, user, project.id);
  const canWriteProject = isInternalUser(user) && facts.canWrite;
  return {
    ...project,
    currentUserAccessRole: facts.role,
    currentUserAccessSource: facts.source,
    currentUserCanWrite: canWriteProject,
    canUpdate: canWriteProject && hasPermission(user.permissionKeys, "projects.edit"),
    canArchive: canWriteProject && hasPermission(user.permissionKeys, "projects.archive")
  };
}

async function annotateProjectsForUser(
  db: DbClient,
  user: RouteUser,
  projects: ProjectDto[]
) {
  return Promise.all(projects.map((project) => annotateProjectForUser(db, user, project)));
}

async function findProjectById(db: DbClient, id: string) {
  return db.project.findUnique({
    where: {
      id
    }
  });
}

async function findProjectSnapshotById(db: DbClient, id: string) {
  const project = await findProjectById(db, id);
  if (!project) {
    return null;
  }

  const status = await readProjectStatus(db, id);
  return toProjectDto(project, status);
}

async function listProjectIds(db: DbClient) {
  const rows = await db.project.findMany({
    select: {
      id: true
    }
  });

  return rows.map((row) => row.id);
}

async function ensureProjectsCanBeDeleted(db: DbClient, projectIds: string[]) {
  if (projectIds.length === 0) {
    return null;
  }

  const dependentLegalDocs = await db.legalDocument.findMany({
    where: {
      projectId: {
        in: projectIds
      }
    },
    select: {
      projectId: true
    }
  });

  if (dependentLegalDocs.length === 0) {
    return null;
  }

  const blockedProjectIds = Array.from(
    new Set(dependentLegalDocs.map((legalDoc) => legalDoc.projectId))
  ).sort();

  return `Projects cannot be removed because dependent legal documents or obligations still exist for: ${blockedProjectIds.join(", ")}`;
}

async function replaceProjectsSnapshot(prisma: PrismaClient, snapshot: ProjectDto[]) {
  await prisma.$transaction(async (tx) => {
    const existingIds = await listProjectIds(tx);
    const incomingIds = new Set(snapshot.map((project) => project.id));
    const removedIds = existingIds.filter((id) => !incomingIds.has(id));
    const deleteConflict = await ensureProjectsCanBeDeleted(tx, removedIds);
    if (deleteConflict) {
      throw new Error(deleteConflict);
    }

    if (removedIds.length > 0) {
      await tx.project.deleteMany({
        where: {
          id: {
            in: removedIds
          }
        }
      });
    }

    for (const project of snapshot) {
      await tx.project.upsert({
        where: {
          id: project.id
        },
        create: toProjectCreateInput(project),
        update: toProjectUpdateInput(project)
      });
      await updateProjectStatus(tx, project.id, project.status);
    }
  });
}

async function readProjectsSnapshotFromPortal(prisma: PrismaClient) {
  const snapshot = await prisma.portalSnapshot.findUnique({
    where: {
      scopeKey: "default"
    },
    select: {
      payload: true
    }
  });

  if (!snapshot || !snapshot.payload || typeof snapshot.payload !== "object" || Array.isArray(snapshot.payload)) {
    return null;
  }

  const payload = snapshot.payload as Prisma.JsonObject;
  if (!hasOwn(payload, "projects")) {
    return null;
  }
  return normalizeProjectsSnapshot(payload.projects);
}

async function writeProjectsSnapshotToPortal(
  prisma: PrismaClient,
  projects: ProjectDto[],
  updatedByUserId: string
) {
  const existing = await prisma.portalSnapshot.findUnique({
    where: {
      scopeKey: "default"
    },
    select: {
      payload: true
    }
  });

  const payload =
    existing?.payload && typeof existing.payload === "object" && !Array.isArray(existing.payload)
      ? ({ ...(existing.payload as Prisma.JsonObject) } satisfies Prisma.JsonObject)
      : ({} satisfies Prisma.JsonObject);

  payload.projects = projects as unknown as Prisma.JsonArray;

  await prisma.portalSnapshot.upsert({
    where: {
      scopeKey: "default"
    },
    update: {
      payload,
      updatedByUserId
    },
    create: {
      scopeKey: "default",
      payload,
      updatedByUserId
    }
  });
}

async function validateProjectRelations(
  prisma: PrismaClient,
  input: {
    companyId: string;
    siteId?: string;
    facilityId?: string;
    authorityId?: string;
    authorityContactId?: string;
    ownerUserId?: string;
    deputyUserId?: string;
  }
): Promise<ProjectRelationValidationResult> {
  const companyId = ensureStringField(input.companyId);
  if (!companyId) {
    return { ok: false, status: 400, message: "companyId is required." };
  }

  const company = await prisma.company.findUnique({
    where: {
      id: companyId
    },
    select: {
      id: true
    }
  });
  if (!company) {
    return { ok: false, status: 404, message: "Company not found." };
  }

  let siteId = toOptionalTrimmedString(input.siteId);
  let facilityId = toOptionalTrimmedString(input.facilityId);
  let authorityId = toOptionalTrimmedString(input.authorityId);
  const authorityContactId = toOptionalTrimmedString(input.authorityContactId);
  const ownerUserId = toOptionalTrimmedString(input.ownerUserId);
  const deputyUserId = toOptionalTrimmedString(input.deputyUserId);

  if (facilityId) {
    const facility = await prisma.facility.findUnique({
      where: {
        id: facilityId
      },
      select: {
        id: true,
        companyId: true,
        siteId: true
      }
    });

    if (!facility) {
      return { ok: false, status: 404, message: "Facility not found." };
    }

    if (facility.companyId !== companyId) {
      return { ok: false, status: 400, message: "facilityId does not belong to companyId." };
    }

    siteId = siteId ?? facility.siteId;
    if (siteId && facility.siteId !== siteId) {
      return { ok: false, status: 400, message: "facilityId does not belong to siteId." };
    }
  }

  if (siteId) {
    const site = await prisma.site.findUnique({
      where: {
        id: siteId
      },
      select: {
        id: true,
        companyId: true
      }
    });

    if (!site) {
      return { ok: false, status: 404, message: "Site not found." };
    }

    if (site.companyId !== companyId) {
      return { ok: false, status: 400, message: "siteId does not belong to companyId." };
    }
  }

  if (authorityContactId) {
    const contact = await prisma.authorityContact.findUnique({
      where: {
        id: authorityContactId
      },
      select: {
        id: true,
        authorityId: true
      }
    });

    if (!contact) {
      return { ok: false, status: 404, message: "Authority contact not found." };
    }

    authorityId = authorityId ?? contact.authorityId;
    if (authorityId && contact.authorityId !== authorityId) {
      return { ok: false, status: 400, message: "authorityContactId does not belong to authorityId." };
    }
  }

  if (authorityId) {
    const authority = await prisma.authority.findUnique({
      where: {
        id: authorityId
      },
      select: {
        id: true
      }
    });

    if (!authority) {
      return { ok: false, status: 404, message: "Authority not found." };
    }
  }

  if (ownerUserId) {
    const ownerValidation = await validateActiveInternalUser(prisma, ownerUserId, {
      notFound: "Owner user not found.",
      invalid: "Owner user must be an active internal user."
    });
    if (!ownerValidation.ok) {
      return ownerValidation;
    }
  }

  if (deputyUserId) {
    const deputyValidation = await validateActiveInternalUser(prisma, deputyUserId, {
      notFound: "Deputy user not found.",
      invalid: "Deputy user must be an active internal user."
    });
    if (!deputyValidation.ok) {
      return deputyValidation;
    }
  }

  return {
    ok: true,
    companyId,
    siteId,
    facilityId,
    authorityId,
    authorityContactId,
    ownerUserId,
    deputyUserId
  };
}

async function validateExternalParticipants(
  prisma: PrismaClient,
  participants: ExternalParticipantDto[]
): Promise<ExternalParticipantValidationResult> {
  const normalizedParticipants: ExternalParticipantDto[] = [];

  for (const participant of participants) {
    let externalOrgId = toOptionalTrimmedString(participant.externalOrgId);
    const externalUserId = toOptionalTrimmedString(participant.externalUserId);

    let externalUser:
      | {
          id: string;
          type: string;
          isArchived: boolean;
          externalOrgId: string | null;
        }
      | null = null;

    if (externalUserId) {
      externalUser = await prisma.user.findUnique({
        where: {
          id: externalUserId
        },
        select: {
          id: true,
          type: true,
          isArchived: true,
          externalOrgId: true
        }
      });

      if (!externalUser || externalUser.isArchived) {
        return { ok: false, status: 400, message: "External participant user must be active." };
      }
      if (String(externalUser.type).toUpperCase() !== "EXTERNAL") {
        return { ok: false, status: 400, message: "External participant user must have type EXTERNAL." };
      }
      if (!externalOrgId) {
        if (!externalUser.externalOrgId) {
          return { ok: false, status: 400, message: "externalOrgId is required for linked external participants." };
        }
        externalOrgId = externalUser.externalOrgId;
      }
    }

    if (externalOrgId) {
      const externalOrg = await prisma.externalOrganization.findUnique({
        where: {
          id: externalOrgId
        },
        select: {
          id: true,
          isArchived: true
        }
      });

      if (!externalOrg || externalOrg.isArchived) {
        return { ok: false, status: 400, message: "External participant organization must be active." };
      }
    }

    if (externalUser && externalOrgId && externalUser.externalOrgId !== externalOrgId) {
      return { ok: false, status: 400, message: "External participant user does not belong to externalOrgId." };
    }

    normalizedParticipants.push({
      ...participant,
      externalOrgId,
      externalUserId
    });
  }

  return {
    ok: true,
    participants: normalizedParticipants
  };
}

async function normalizeProjectForWrite(
  prisma: PrismaClient,
  input: ProjectDto,
  currentProjects: ProjectDto[]
) {
  const relationValidation = await validateProjectRelations(prisma, {
    companyId: input.companyId,
    siteId: input.siteId,
    facilityId: input.facilityId,
    authorityId: input.authorityId,
    authorityContactId: input.authorityContactId,
    ownerUserId: input.ownerUserId,
    deputyUserId: input.deputyUserId
  });

  if (!relationValidation.ok) {
    return relationValidation;
  }

  const participantUserIds = normalizeParticipantUserIds({
    internalParticipants: input.internalParticipants,
    participantUserIds: input.participantUserIds
  });
  const internalParticipants = normalizeInternalParticipants(
    input.internalParticipants,
    participantUserIds
  );
  const internalParticipantValidation = await validateInternalParticipantUsers(
    prisma,
    participantUserIds
  );
  if (!internalParticipantValidation.ok) {
    return internalParticipantValidation;
  }

  const externalParticipantValidation = await validateExternalParticipants(
    prisma,
    input.externalParticipants
  );
  if (!externalParticipantValidation.ok) {
    return externalParticipantValidation;
  }
  const dependencyValidationProjects = currentProjects.some((project) => project.id === input.id)
    ? currentProjects
    : [...currentProjects, { id: input.id, dependsOnProjectIds: [] }];

  const dependencyIds = sanitizeProjectDependencyIds({
    projects: dependencyValidationProjects,
    projectId: input.id,
    dependencyIds: normalizeRelationIds(input.dependsOnProjectIds)
  }).dependencyIds;

  return {
    ok: true as const,
    project: {
      ...input,
      status: input.status,
      submissionType: input.submissionType,
      companyId: relationValidation.companyId,
      siteId: relationValidation.siteId,
      facilityId: relationValidation.facilityId,
      authorityId: relationValidation.authorityId,
      authorityContactId: relationValidation.authorityContactId,
      ownerUserId: relationValidation.ownerUserId,
      deputyUserId: relationValidation.deputyUserId,
      shortDescription: input.shortDescription ?? "",
      authorityRef: input.authorityRef ?? "",
      internalParticipants,
      participantUserIds:
        participantUserIds.length > 0
          ? participantUserIds
          : internalParticipants.map((participant) => participant.userId),
      dependsOnProjectIds: dependencyIds,
      referenceLegalDocIds: normalizeRelationIds(input.referenceLegalDocIds),
      externalParticipants: externalParticipantValidation.participants,
      attachments: input.attachments,
      archivedAt: input.archivedAt ?? undefined,
      isArchived: Boolean(input.isArchived || input.archivedAt)
    } satisfies ProjectDto
  };
}

const PROJECT_ACCESS_ROLE_VALUES = [
  "PROJECT_VIEWER",
  "PROJECT_EDITOR",
  "EXTERNAL_PROJECT_VIEWER",
  "EXTERNAL_EXECUTOR"
] as const;

type ProjectAccessRoleValue = (typeof PROJECT_ACCESS_ROLE_VALUES)[number];

function normalizeProjectAccessRole(value: unknown): ProjectAccessRoleValue | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim().toUpperCase();
  return PROJECT_ACCESS_ROLE_VALUES.includes(trimmed as ProjectAccessRoleValue)
    ? (trimmed as ProjectAccessRoleValue)
    : null;
}

function roleMatchesTargetUserType(role: ProjectAccessRoleValue, userType: string) {
  const normalizedType = userType.trim().toUpperCase();
  if (normalizedType === "EXTERNAL") {
    return role === "EXTERNAL_PROJECT_VIEWER" || role === "EXTERNAL_EXECUTOR";
  }
  return role === "PROJECT_VIEWER" || role === "PROJECT_EDITOR";
}

async function requireInternalAuthenticatedUser(req: Request, res: Response, prisma: PrismaClient) {
  const user = await requireAuthenticatedRouteUser(req, res, prisma);
  if (!user) {
    return null;
  }

  if (String(user.type).toUpperCase() === "EXTERNAL") {
    res.status(403).json({ ok: false, message: "Forbidden." });
    return null;
  }

  return user;
}

async function listProjectAccessEntries(prisma: PrismaClient, projectId: string) {
  const [project, explicitEntries] = await Promise.all([
    prisma.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        ownerUserId: true,
        deputyUserId: true,
        participantUserIds: true,
        internalParticipants: true
      }
    }),
    prisma.projectAccess.findMany({
      where: {
        projectId
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            role: true,
            type: true,
            externalOrgId: true,
            isArchived: true,
            externalOrg: {
              select: {
                id: true,
                name: true
              }
            }
          }
        }
      },
      orderBy: [{ createdAt: "asc" }, { userId: "asc" }]
    })
  ]);

  if (!project) {
    return null;
  }

  const implicitUserRoles = new Map<string, { role: ProjectAccessRoleValue; source: ProjectAccessSource }>();
  if (project.ownerUserId) {
    implicitUserRoles.set(project.ownerUserId, {
      role: "PROJECT_EDITOR",
      source: "IMPLICIT_OWNER"
    });
  }
  if (project.deputyUserId) {
    implicitUserRoles.set(project.deputyUserId, {
      role: "PROJECT_EDITOR",
      source: "IMPLICIT_DEPUTY"
    });
  }

  const participantIds = [
    ...new Set(
      [
        ...(Array.isArray(project.participantUserIds) ? project.participantUserIds : []),
        ...(Array.isArray(project.internalParticipants)
          ? project.internalParticipants.map((entry) =>
              entry &&
              typeof entry === "object" &&
              typeof (entry as { userId?: unknown }).userId === "string"
                ? (entry as { userId: string }).userId
                : ""
            )
          : [])
      ].filter((entry): entry is string => typeof entry === "string" && Boolean(entry.trim()))
    )
  ];
  participantIds.forEach((userId) => {
    if (!implicitUserRoles.has(userId)) {
      implicitUserRoles.set(userId, {
        role: "PROJECT_VIEWER",
        source: "IMPLICIT_PARTICIPANT"
      });
    }
  });

  const implicitUserIds = [...implicitUserRoles.keys()];
  const implicitUsers = implicitUserIds.length
    ? await prisma.user.findMany({
        where: {
          id: {
            in: implicitUserIds
          }
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          role: true,
          type: true,
          externalOrgId: true,
          isArchived: true,
          externalOrg: {
            select: {
              id: true,
              name: true
            }
          }
        }
      })
    : [];
  const implicitUserById = new Map(implicitUsers.map((user) => [user.id, user] as const));

  const implicitDtos = implicitUserIds
    .map((userId) => {
      const role = implicitUserRoles.get(userId);
      const user = implicitUserById.get(userId);
      if (!role || !user) {
        return null;
      }
      return toProjectAccessEntryDto({
        source: role.source,
        entry: {
          projectId,
          userId,
          accessRole: role.role,
          user
        }
      });
    })
    .filter((entry): entry is ReturnType<typeof toProjectAccessEntryDto> => Boolean(entry));
  const explicitDtos = explicitEntries.map((entry) =>
    toProjectAccessEntryDto({ source: "EXPLICIT", entry })
  );

  return [...implicitDtos, ...explicitDtos];
}

export function createProjectsRouter(prisma: PrismaClient) {
  const router = Router();

  router.get("/projects", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireAuthenticatedRouteUser(req, res, prisma);
      if (!user) {
        return;
      }

      const accessibleProjectIds = await getAccessibleProjectIds(prisma, user);
      const projects =
        accessibleProjectIds === null
          ? await listProjectsSnapshot(prisma)
          : accessibleProjectIds.length > 0
          ? await listProjectsSnapshot(prisma, {
              id: {
                in: accessibleProjectIds
              }
            })
          : [];

      res.json(await annotateProjectsForUser(prisma, user, projects));
    } catch (error) {
      if (
        error instanceof Error &&
        [INVALID_PROJECT_STATUS_MESSAGE, INVALID_PROJECT_SUBMISSION_TYPE_MESSAGE].includes(
          error.message
        )
      ) {
        res.status(400).json({ ok: false, message: error.message });
        return;
      }
      next(error);
    }
  });

  router.get("/projects/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireAuthenticatedRouteUser(req, res, prisma);
      if (!user) {
        return;
      }

      const access = await requireProjectAccess({
        db: prisma,
        user,
        projectId: req.params.id,
        res
      });
      if (!access) {
        return;
      }

      const project = await findProjectSnapshotById(prisma, req.params.id);
      if (!project) {
        res.status(404).json({ ok: false, message: "Project not found." });
        return;
      }

      res.json({
        ok: true,
        project: await annotateProjectForUser(prisma, user, project)
      });
    } catch (error) {
      if (
        error instanceof Error &&
        [INVALID_PROJECT_STATUS_MESSAGE, INVALID_PROJECT_SUBMISSION_TYPE_MESSAGE].includes(
          error.message
        )
      ) {
        res.status(400).json({ ok: false, message: error.message });
        return;
      }
      next(error);
    }
  });

  router.get("/projects/:id/access", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireInternalAuthenticatedUser(req, res, prisma);
      if (!user) {
        return;
      }

      if (!canManageProjectAccess(user)) {
        res.status(403).json({ ok: false, message: "Forbidden." });
        return;
      }

      const entries = await listProjectAccessEntries(prisma, req.params.id);
      if (!entries) {
        res.status(404).json({ ok: false, message: "Project not found." });
        return;
      }

      res.json({
        ok: true,
        items: entries
      });
    } catch (error) {
      next(error);
    }
  });

  router.put("/projects/:id/access/:userId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireInternalAuthenticatedUser(req, res, prisma);
      if (!user) {
        return;
      }

      if (!canManageProjectAccess(user)) {
        res.status(403).json({ ok: false, message: "Forbidden." });
        return;
      }

      const projectExists = await prisma.project.count({
        where: {
          id: req.params.id
        }
      });
      if (!projectExists) {
        res.status(404).json({ ok: false, message: "Project not found." });
        return;
      }

      const accessRole = normalizeProjectAccessRole(req.body?.accessRole);
      if (!accessRole) {
        res.status(400).json({ ok: false, message: "Invalid project access role." });
        return;
      }

      const targetUser = await prisma.user.findUnique({
        where: {
          id: req.params.userId
        },
        select: {
          id: true,
          type: true,
          isArchived: true
        }
      });
      if (!targetUser || targetUser.isArchived) {
        res.status(404).json({ ok: false, message: "User not found." });
        return;
      }
      if (!roleMatchesTargetUserType(accessRole, targetUser.type)) {
        res.status(400).json({ ok: false, message: "Project access role does not match user type." });
        return;
      }

      const note = toOptionalTrimmedString(req.body?.note);
      const entry = await prisma.projectAccess.upsert({
        where: {
          projectId_userId: {
            projectId: req.params.id,
            userId: targetUser.id
          }
        },
        create: {
          projectId: req.params.id,
          userId: targetUser.id,
          accessRole,
          note,
          grantedByUserId: user.id
        },
        update: {
          accessRole,
          note,
          grantedByUserId: user.id
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              role: true,
              type: true,
              externalOrgId: true,
              isArchived: true,
              externalOrg: {
                select: {
                  id: true,
                  name: true
                }
              }
            }
          }
        }
      });

      res.json({
        ok: true,
        access: toProjectAccessEntryDto({
          source: "EXPLICIT",
          entry
        })
      });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/projects/:id/access/:userId", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireInternalAuthenticatedUser(req, res, prisma);
      if (!user) {
        return;
      }

      if (!canManageProjectAccess(user)) {
        res.status(403).json({ ok: false, message: "Forbidden." });
        return;
      }

      const projectExists = await prisma.project.count({
        where: {
          id: req.params.id
        }
      });
      if (!projectExists) {
        res.status(404).json({ ok: false, message: "Project not found." });
        return;
      }

      await prisma.projectAccess.deleteMany({
        where: {
          projectId: req.params.id,
          userId: req.params.userId
        }
      });

      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  router.post("/projects", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireInternalRouteUser(req, res, prisma);
      if (!user) {
        return;
      }

      const requestedId = toOptionalTrimmedString(req.body?.id);
      const projectId = requestedId ?? createServerId("p");
      const title = ensureStringField(req.body?.title);
      const companyId = ensureStringField(req.body?.companyId);
      const status = normalizeProjectStatus(req.body?.status) ?? DEFAULT_PROJECT_STATUS;
      const submissionType = hasOwn(req.body, "submissionType")
        ? normalizeProjectSubmissionType(req.body?.submissionType)
        : undefined;

      if (!title || !companyId) {
        res.status(400).json({ ok: false, message: "title and companyId are required." });
        return;
      }

      const currentProjects = await listProjectsSnapshot(prisma);
      const normalized = await normalizeProjectForWrite(
        prisma,
        {
          id: projectId,
          title,
          status,
          submissionType,
          shortDescription: ensureStringField(req.body?.shortDescription),
          authorityRef: ensureStringField(req.body?.authorityRef),
          companyId,
          siteId: toOptionalTrimmedString(req.body?.siteId),
          facilityId: toOptionalTrimmedString(req.body?.facilityId),
          authorityId: toOptionalTrimmedString(req.body?.authorityId),
          authorityContactId: toOptionalTrimmedString(req.body?.authorityContactId),
          ownerUserId: toOptionalTrimmedString(req.body?.ownerUserId),
          deputyUserId: toOptionalTrimmedString(req.body?.deputyUserId),
          internalParticipants: normalizeInternalParticipants(
            req.body?.internalParticipants,
            normalizeParticipantUserIds({
              internalParticipants: req.body?.internalParticipants,
              participantUserIds: req.body?.participantUserIds
            })
          ),
          participantUserIds: normalizeParticipantUserIds({
            internalParticipants: req.body?.internalParticipants,
            participantUserIds: req.body?.participantUserIds
          }),
          dependsOnProjectIds: normalizeRelationIds(req.body?.dependsOnProjectIds),
          referenceLegalDocIds: normalizeRelationIds(req.body?.referenceLegalDocIds),
          externalParticipants: Array.isArray(req.body?.externalParticipants)
            ? req.body.externalParticipants
                .map((participant: unknown, index: number) =>
                  normalizeExternalParticipant(
                    participant as Partial<ExternalParticipantDto>,
                    `ep-${projectId}-${index}`
                  )
                )
                .filter(isPresent)
            : [],
          attachments: Array.isArray(req.body?.attachments)
            ? req.body.attachments.map((attachment: unknown, index: number) =>
                normalizeAttachment(
                  attachment as Partial<ProjectAttachmentDto>,
                  `pa-${projectId}-${index}`
                )
              )
            : [],
          archivedAt: undefined,
          isArchived: false,
          createdAt: nowStamp(),
          updatedAt: nowStamp()
        },
        currentProjects
      );

      if (!normalized.ok) {
        res.status(normalized.status).json({ ok: false, message: normalized.message });
        return;
      }

      const project = await prisma.$transaction(async (tx) => {
        const created = await tx.project.create({
          data: toProjectCreateInput(normalized.project)
        });
        await updateProjectStatus(tx, created.id, normalized.project.status);
        if (!hasGlobalProjectReadAccess(user)) {
          await tx.projectAccess.upsert({
            where: {
              projectId_userId: {
                projectId: created.id,
                userId: user.id
              }
            },
            create: {
              projectId: created.id,
              userId: user.id,
              accessRole: "PROJECT_EDITOR",
              grantedByUserId: user.id,
              note: "Automatisch beim Anlegen des Projekts vergeben."
            },
            update: {
              accessRole: "PROJECT_EDITOR",
              grantedByUserId: user.id
            }
          });
        }
        return created;
      });

      res.status(201).json({
        ok: true,
        project: await annotateProjectForUser(prisma, user, toProjectDto(project, normalized.project.status))
      });
    } catch (error) {
      if (
        error instanceof Error &&
        [INVALID_PROJECT_STATUS_MESSAGE, INVALID_PROJECT_SUBMISSION_TYPE_MESSAGE].includes(
          error.message
        )
      ) {
        res.status(400).json({ ok: false, message: error.message });
        return;
      }
      next(error);
    }
  });

  router.patch("/projects/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireInternalRouteUser(req, res, prisma);
      if (!user) {
        return;
      }

      const existing = await findProjectSnapshotById(prisma, req.params.id);
      if (!existing) {
        res.status(404).json({ ok: false, message: "Project not found." });
        return;
      }
      if (
        !(await requireProjectDomainWrite({
          db: prisma,
          user,
          projectId: existing.id,
          domain: "projects",
          permission: "projects.edit",
          res
        }))
      ) {
        return;
      }
      const participantUserIds = hasOwn(req.body, "internalParticipants") || hasOwn(req.body, "participantUserIds")
        ? normalizeParticipantUserIds({
            internalParticipants: req.body?.internalParticipants,
            participantUserIds: req.body?.participantUserIds
          })
        : existing.participantUserIds;
      const submissionType = hasOwn(req.body, "submissionType")
        ? normalizeProjectSubmissionType(req.body?.submissionType)
        : existing.submissionType;

      const merged: ProjectDto = {
        ...existing,
        title: hasOwn(req.body, "title") ? ensureStringField(req.body?.title) : existing.title,
        status: hasOwn(req.body, "status")
          ? normalizeProjectStatus(req.body?.status)
          : existing.status,
        submissionType,
        shortDescription: hasOwn(req.body, "shortDescription")
          ? ensureStringField(req.body?.shortDescription)
          : existing.shortDescription ?? "",
        authorityRef: hasOwn(req.body, "authorityRef")
          ? ensureStringField(req.body?.authorityRef)
          : existing.authorityRef ?? "",
        companyId: hasOwn(req.body, "companyId") ? ensureStringField(req.body?.companyId) : existing.companyId,
        siteId: hasOwn(req.body, "siteId") ? toOptionalTrimmedString(req.body?.siteId) : existing.siteId,
        facilityId: hasOwn(req.body, "facilityId")
          ? toOptionalTrimmedString(req.body?.facilityId)
          : existing.facilityId,
        authorityId: hasOwn(req.body, "authorityId")
          ? toOptionalTrimmedString(req.body?.authorityId)
          : existing.authorityId,
        authorityContactId: hasOwn(req.body, "authorityContactId")
          ? toOptionalTrimmedString(req.body?.authorityContactId)
          : existing.authorityContactId,
        ownerUserId: hasOwn(req.body, "ownerUserId")
          ? toOptionalTrimmedString(req.body?.ownerUserId)
          : existing.ownerUserId,
        deputyUserId: hasOwn(req.body, "deputyUserId")
          ? toOptionalTrimmedString(req.body?.deputyUserId)
          : existing.deputyUserId,
        internalParticipants:
          hasOwn(req.body, "internalParticipants") || hasOwn(req.body, "participantUserIds")
            ? normalizeInternalParticipants(req.body?.internalParticipants, participantUserIds)
            : existing.internalParticipants,
        participantUserIds,
        dependsOnProjectIds: hasOwn(req.body, "dependsOnProjectIds")
          ? normalizeRelationIds(req.body?.dependsOnProjectIds)
          : existing.dependsOnProjectIds,
        referenceLegalDocIds: hasOwn(req.body, "referenceLegalDocIds")
          ? normalizeRelationIds(req.body?.referenceLegalDocIds)
          : existing.referenceLegalDocIds,
        externalParticipants: hasOwn(req.body, "externalParticipants")
          ? Array.isArray(req.body?.externalParticipants)
            ? req.body.externalParticipants
                .map((participant: unknown, index: number) =>
                  normalizeExternalParticipant(
                    participant as Partial<ExternalParticipantDto>,
                    `ep-${existing.id}-${index}`
                  )
                )
                .filter(isPresent)
            : []
          : existing.externalParticipants,
        attachments: hasOwn(req.body, "attachments")
          ? Array.isArray(req.body?.attachments)
            ? req.body.attachments.map((attachment: unknown, index: number) =>
                normalizeAttachment(
                  attachment as Partial<ProjectAttachmentDto>,
                  `pa-${existing.id}-${index}`
                )
              )
            : []
          : existing.attachments,
        archivedAt: hasOwn(req.body, "archivedAt")
          ? toOptionalTrimmedString(req.body?.archivedAt)
          : existing.archivedAt,
        isArchived: hasOwn(req.body, "isArchived")
          ? Boolean(req.body?.isArchived)
          : existing.isArchived,
        createdAt: existing.createdAt,
        updatedAt: nowStamp()
      };

      if (!merged.title || !merged.companyId) {
        res.status(400).json({ ok: false, message: "title and companyId are required." });
        return;
      }

      const currentProjects = await listProjectsSnapshot(prisma);
      const normalized = await normalizeProjectForWrite(prisma, merged, currentProjects);
      if (!normalized.ok) {
        res.status(normalized.status).json({ ok: false, message: normalized.message });
        return;
      }

      const updated = await prisma.$transaction(async (tx) => {
        const nextProject = await tx.project.update({
          where: {
            id: existing.id
          },
          data: toProjectUpdateInput(normalized.project)
        });
        await updateProjectStatus(tx, existing.id, normalized.project.status);
        return nextProject;
      });

      res.json({
        ok: true,
        project: await annotateProjectForUser(prisma, user, toProjectDto(updated, normalized.project.status))
      });
    } catch (error) {
      if (
        error instanceof Error &&
        [INVALID_PROJECT_STATUS_MESSAGE, INVALID_PROJECT_SUBMISSION_TYPE_MESSAGE].includes(
          error.message
        )
      ) {
        res.status(400).json({ ok: false, message: error.message });
        return;
      }
      next(error);
    }
  });

  router.post("/projects/:id/archive", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireInternalRouteUser(req, res, prisma);
      if (!user) {
        return;
      }

      const existing = await findProjectById(prisma, req.params.id);
      if (!existing) {
        res.status(404).json({ ok: false, message: "Project not found." });
        return;
      }
      if (
        !(await requireProjectDomainWrite({
          db: prisma,
          user,
          projectId: existing.id,
          domain: "projects",
          permission: "projects.archive",
          res
        }))
      ) {
        return;
      }
      const status = await readProjectStatus(prisma, existing.id);

      const updated = existing.isArchived
        ? existing
        : await prisma.project.update({
            where: {
              id: existing.id
            },
            data: {
              archivedAt: new Date(),
              isArchived: true
            }
          });

      res.json({
        ok: true,
        project: await annotateProjectForUser(prisma, user, toProjectDto(updated, status))
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/projects/:id/restore", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireInternalRouteUser(req, res, prisma);
      if (!user) {
        return;
      }

      const existing = await findProjectById(prisma, req.params.id);
      if (!existing) {
        res.status(404).json({ ok: false, message: "Project not found." });
        return;
      }
      if (
        !(await requireProjectDomainWrite({
          db: prisma,
          user,
          projectId: existing.id,
          domain: "projects",
          permission: "projects.archive",
          res
        }))
      ) {
        return;
      }
      const status = await readProjectStatus(prisma, existing.id);

      const updated = !existing.isArchived && !existing.archivedAt
        ? existing
        : await prisma.project.update({
            where: {
              id: existing.id
            },
            data: {
              archivedAt: null,
              isArchived: false
            }
          });

      res.json({
        ok: true,
        project: await annotateProjectForUser(prisma, user, toProjectDto(updated, status))
      });
    } catch (error) {
      next(error);
    }
  });

  router.put("/admin/internal/projects/bulk-replace", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireAdminRoutePermissions(req, res, prisma, "projects.edit", "projects.archive");
      if (!user) {
        return;
      }

      let snapshot: ProjectDto[];
      try {
        snapshot = normalizeProjectsSnapshot(req.body);
      } catch (error) {
        if (
          error instanceof Error &&
          [INVALID_PROJECT_STATUS_MESSAGE, INVALID_PROJECT_SUBMISSION_TYPE_MESSAGE].includes(
            error.message
          )
        ) {
          res.status(400).json({ ok: false, message: error.message });
          return;
        }
        throw error;
      }
      const normalizedProjects: ProjectDto[] = [];

      for (const project of snapshot) {
        const normalized = await normalizeProjectForWrite(prisma, project, normalizedProjects);
        if (!normalized.ok) {
          res.status(normalized.status).json({ ok: false, message: normalized.message });
          return;
        }
        normalizedProjects.push(normalized.project);
      }

      const sanitized = sanitizeProjectRelations(normalizedProjects).projects;
      try {
        await replaceProjectsSnapshot(prisma, sanitized);
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("Projects cannot be removed")) {
          res.status(409).json({ ok: false, message: error.message });
          return;
        }
        throw error;
      }

      res.json({
        ok: true,
        projects: await listProjectsSnapshot(prisma)
      });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/admin/internal/projects/bulk-delete", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireAdminRoutePermissions(req, res, prisma, "projects.edit", "projects.archive");
      if (!user) {
        return;
      }

      const existingIds = await listProjectIds(prisma);
      const deleteConflict = await ensureProjectsCanBeDeleted(prisma, existingIds);
      if (deleteConflict) {
        res.status(409).json({ ok: false, message: deleteConflict });
        return;
      }

      await prisma.project.deleteMany();

      res.json({
        ok: true
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/admin/internal/projects/backfill-from-snapshot", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireAdminRoutePermissions(req, res, prisma, "projects.edit", "projects.archive");
      if (!user) {
        return;
      }

      let snapshot: ProjectDto[] | null;
      try {
        snapshot = await readProjectsSnapshotFromPortal(prisma);
      } catch (error) {
        if (
          error instanceof Error &&
          [INVALID_PROJECT_STATUS_MESSAGE, INVALID_PROJECT_SUBMISSION_TYPE_MESSAGE].includes(
            error.message
          )
        ) {
          res.status(400).json({ ok: false, message: error.message });
          return;
        }
        throw error;
      }
      if (!snapshot) {
        res.status(404).json({ ok: false, message: "Snapshot projects not found." });
        return;
      }

      const normalizedProjects: ProjectDto[] = [];
      for (const project of snapshot) {
        const normalized = await normalizeProjectForWrite(prisma, project, normalizedProjects);
        if (!normalized.ok) {
          res.status(normalized.status).json({ ok: false, message: normalized.message });
          return;
        }
        normalizedProjects.push(normalized.project);
      }

      try {
        await replaceProjectsSnapshot(prisma, sanitizeProjectRelations(normalizedProjects).projects);
      } catch (error) {
        if (error instanceof Error && error.message.startsWith("Projects cannot be removed")) {
          res.status(409).json({ ok: false, message: error.message });
          return;
        }
        throw error;
      }

      res.json({
        ok: true,
        projects: await listProjectsSnapshot(prisma)
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/admin/internal/projects/rollback-to-snapshot", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireAdminRoutePermissions(req, res, prisma, "projects.edit", "projects.archive");
      if (!user) {
        return;
      }

      const projects = await listProjectsSnapshot(prisma);
      await writeProjectsSnapshotToPortal(prisma, projects, user.id);

      res.json({
        ok: true,
        projects
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
