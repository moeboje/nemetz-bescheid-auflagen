import { randomUUID } from "node:crypto";
import {
  Prisma,
  type Deadline as DbDeadline,
  type PrismaClient
} from "@prisma/client";
import { Router, type NextFunction, type Request, type Response } from "express";
import {
  applyNoStoreHeaders,
  requireAdminRoutePermissions,
  requireAuthenticatedRouteUser,
  requireInternalRouteUser,
  type RouteUser
} from "./routeAuth.js";
import { hasPermission, type PermissionKey } from "../accessControl.js";
import { enqueueDeadlineAssignmentNotificationsForChange } from "../notifications.js";
import {
  getProjectWriteAccessMap,
  getReadableProjectIdsForDomain,
  hasGlobalProjectReadAccess,
  listWritableProjectOptionsForDomain,
  requireProjectDomainRead,
  requireProjectDomainReadPermission,
  requireProjectDomainWrite,
  resolveDeadlineProjectId
} from "../projectAccess.js";

type AttachmentKindDto = "PHOTO" | "DOCUMENT" | "REPORT";
type AttachmentStorageDto = "indexeddb" | "none";
type EvidenceOutcomeDto = "OK" | "NOK" | "FOLLOW_UP";
type DeadlineStoredStatusDto = "OPEN" | "DONE";

type AttachmentMetaDto = {
  id: string;
  kind: AttachmentKindDto;
  filename: string;
  sizeKb?: number;
  mime?: string;
  addedAt: string;
  storage: AttachmentStorageDto;
};

type EvidenceDto = {
  id: string;
  note?: string;
  outcome?: EvidenceOutcomeDto;
  attachments: AttachmentMetaDto[];
  createdAt: string;
  createdByUserId?: string;
  createdByLabel?: string;
};

type DeadlineDto = {
  id: string;
  title: string;
  description?: string;
  dueDate: string;
  status: DeadlineStoredStatusDto;
  projectId?: string;
  resolvedProjectId?: string;
  projectTitle?: string;
  currentUserCanWriteProject?: boolean;
  legalDocId?: string;
  authorityId?: string;
  ownerUserId?: string;
  deputyUserId?: string;
  emailReminderEnabled: boolean;
  emailReminderDaysBefore?: number;
  completedAt?: string;
  completedByUserId?: string;
  evidence: EvidenceDto[];
  archivedAt?: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
};

type DbClient = PrismaClient | Prisma.TransactionClient;

type DeadlineRelationValidationResult =
  | {
      ok: true;
      projectId?: string;
      legalDocId?: string;
      authorityId?: string;
      ownerUserId?: string;
      deputyUserId?: string;
      completedByUserId?: string;
    }
  | {
      ok: false;
      status: number;
      message: string;
    };

function hasOwn(value: unknown, key: string) {
  return typeof value === "object" && value !== null && Object.prototype.hasOwnProperty.call(value, key);
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

function toPositiveInteger(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  const normalized = Math.trunc(value);
  return normalized > 0 ? normalized : undefined;
}

function toNonNegativeInteger(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  const normalized = Math.trunc(value);
  return normalized >= 0 ? normalized : undefined;
}

function parseReminderDaysBefore(value: unknown):
  | { ok: true; value?: number }
  | { ok: false; status: number; message: string } {
  if (value === undefined || value === null) {
    return { ok: true };
  }

  if (typeof value !== "number" || !Number.isFinite(value)) {
    return {
      ok: false,
      status: 400,
      message: "emailReminderDaysBefore must be a non-negative integer."
    };
  }

  const normalized = Math.trunc(value);
  if (normalized < 0) {
    return {
      ok: false,
      status: 400,
      message: "emailReminderDaysBefore must be a non-negative integer."
    };
  }

  return { ok: true, value: normalized };
}

function nowStamp() {
  return new Date().toISOString();
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

function createStableId(prefix: string) {
  return `${prefix}-${randomUUID()}`;
}

function toJsonInput(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? [])) as Prisma.InputJsonValue;
}

function normalizeStoredStatus(value: unknown): DeadlineStoredStatusDto {
  return value === "DONE" ? "DONE" : "OPEN";
}

function normalizeAttachmentKind(value: unknown, mime?: string, filename?: string): AttachmentKindDto {
  if (value === "PHOTO" || value === "DOCUMENT" || value === "REPORT") {
    return value;
  }

  const normalizedMime = typeof mime === "string" ? mime.toLowerCase() : "";
  if (normalizedMime.startsWith("image/")) {
    return "PHOTO";
  }
  if (normalizedMime === "application/pdf") {
    return "REPORT";
  }

  const extension =
    typeof filename === "string" && filename.includes(".")
      ? filename.toLowerCase().split(".").at(-1) ?? ""
      : "";
  if (["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg", "tif", "tiff"].includes(extension)) {
    return "PHOTO";
  }
  if (extension === "pdf") {
    return "REPORT";
  }
  return "DOCUMENT";
}

function normalizeReminder(value: {
  emailReminderEnabled: boolean;
  emailReminderDaysBefore?: number;
}) {
  if (!value.emailReminderEnabled) {
    return {
      emailReminderEnabled: false,
      emailReminderDaysBefore: undefined
    };
  }

  return {
    emailReminderEnabled: true,
    emailReminderDaysBefore:
      typeof value.emailReminderDaysBefore === "number" && value.emailReminderDaysBefore >= 0
        ? Math.trunc(value.emailReminderDaysBefore)
        : 7
  };
}

function normalizeAttachmentMeta(value: unknown): AttachmentMetaDto | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const row = value as Partial<AttachmentMetaDto>;
  const filename = ensureStringField(row.filename);
  if (!filename) {
    return null;
  }

  return {
    id: toOptionalTrimmedString(row.id) ?? createStableId("att"),
    kind: normalizeAttachmentKind(row.kind, row.mime, filename),
    filename,
    sizeKb:
      typeof row.sizeKb === "number" && Number.isFinite(row.sizeKb)
        ? Number(row.sizeKb)
        : undefined,
    mime: toOptionalTrimmedString(row.mime),
    addedAt: toOptionalTrimmedString(row.addedAt) ?? nowStamp().slice(0, 10),
    storage: row.storage === "indexeddb" ? "indexeddb" : "none"
  };
}

function normalizeEvidenceOutcome(value: unknown): EvidenceOutcomeDto | undefined {
  if (value === "OK" || value === "NOK" || value === "FOLLOW_UP") {
    return value;
  }
  return undefined;
}

function normalizeEvidence(value: unknown): EvidenceDto | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const row = value as Partial<EvidenceDto>;
  return {
    id: toOptionalTrimmedString(row.id) ?? createStableId("ev"),
    note: toOptionalTrimmedString(row.note),
    outcome: normalizeEvidenceOutcome(row.outcome),
    attachments: Array.isArray(row.attachments)
      ? row.attachments
          .map((attachment) => normalizeAttachmentMeta(attachment))
          .filter((attachment: AttachmentMetaDto | null): attachment is AttachmentMetaDto => Boolean(attachment))
      : [],
    createdAt: toOptionalTrimmedString(row.createdAt) ?? nowStamp(),
    createdByUserId: toOptionalTrimmedString(row.createdByUserId),
    createdByLabel: toOptionalTrimmedString(row.createdByLabel)
  };
}

function normalizeEvidenceArray(value: unknown): EvidenceDto[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => normalizeEvidence(entry))
    .filter((entry): entry is EvidenceDto => Boolean(entry));
}

function normalizeDeadlineDto(value: unknown, index: number): DeadlineDto | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const row = value as Partial<DeadlineDto>;
  const title = ensureStringField(row.title);
  const dueDate = ensureStringField(row.dueDate);

  if (
    typeof row.id !== "string" ||
    !row.id.trim() ||
    !title ||
    !dueDate
  ) {
    return null;
  }

  const createdAt = toOptionalTrimmedString(row.createdAt) ?? nowStamp();
  const updatedAt = toOptionalTrimmedString(row.updatedAt) ?? createdAt;
  const normalizedReminder = normalizeReminder({
    emailReminderEnabled: Boolean(row.emailReminderEnabled),
    emailReminderDaysBefore: toNonNegativeInteger(row.emailReminderDaysBefore)
  });

  return {
    id: row.id || `dl-seed-${index}`,
    title,
    description: typeof row.description === "string" ? row.description : "",
    dueDate,
    status: normalizeStoredStatus(row.status),
    projectId: toOptionalTrimmedString(row.projectId),
    legalDocId: toOptionalTrimmedString(row.legalDocId),
    authorityId: toOptionalTrimmedString(row.authorityId),
    ownerUserId: toOptionalTrimmedString(row.ownerUserId),
    deputyUserId: toOptionalTrimmedString(row.deputyUserId),
    emailReminderEnabled: normalizedReminder.emailReminderEnabled,
    emailReminderDaysBefore: normalizedReminder.emailReminderDaysBefore,
    completedAt: toOptionalTrimmedString(row.completedAt),
    completedByUserId: toOptionalTrimmedString(row.completedByUserId),
    evidence: normalizeEvidenceArray(row.evidence),
    archivedAt: toOptionalTrimmedString(row.archivedAt),
    isArchived: Boolean(row.isArchived || row.archivedAt),
    createdAt,
    updatedAt
  };
}

function normalizeDeadlinesSnapshot(value: unknown): DeadlineDto[] {
  const source =
    Array.isArray(value)
      ? value
      : value &&
          typeof value === "object" &&
          !Array.isArray(value) &&
          Array.isArray((value as { deadlines?: unknown }).deadlines)
      ? (value as { deadlines: unknown[] }).deadlines
      : [];

  return source
    .map((deadline, index) => normalizeDeadlineDto(deadline, index))
    .filter((deadline): deadline is DeadlineDto => Boolean(deadline));
}

function toDeadlineDto(deadline: DbDeadline): DeadlineDto {
  const normalizedReminder = normalizeReminder({
    emailReminderEnabled: deadline.emailReminderEnabled,
    emailReminderDaysBefore: deadline.emailReminderDaysBefore ?? undefined
  });

  return {
    id: deadline.id,
    title: deadline.title,
    description: deadline.description ?? "",
    dueDate: deadline.dueDate,
    status: normalizeStoredStatus(deadline.status),
    projectId: deadline.projectId ?? undefined,
    legalDocId: deadline.legalDocId ?? undefined,
    authorityId: deadline.authorityId ?? undefined,
    ownerUserId: deadline.ownerUserId ?? undefined,
    deputyUserId: deadline.deputyUserId ?? undefined,
    emailReminderEnabled: normalizedReminder.emailReminderEnabled,
    emailReminderDaysBefore: normalizedReminder.emailReminderDaysBefore,
    completedAt: deadline.completedAt ? deadline.completedAt.toISOString() : undefined,
    completedByUserId: deadline.completedByUserId ?? undefined,
    evidence: normalizeEvidenceArray(deadline.evidence),
    archivedAt: deadline.archivedAt ? deadline.archivedAt.toISOString() : undefined,
    isArchived: deadline.isArchived,
    createdAt: deadline.createdAt.toISOString(),
    updatedAt: deadline.updatedAt.toISOString()
  };
}

function toDeadlineCreateInput(input: DeadlineDto): Prisma.DeadlineUncheckedCreateInput {
  return {
    id: input.id,
    title: input.title,
    description: input.description || null,
    dueDate: input.dueDate,
    status: input.status,
    projectId: input.projectId ?? null,
    legalDocId: input.legalDocId ?? null,
    authorityId: input.authorityId ?? null,
    ownerUserId: input.ownerUserId ?? null,
    deputyUserId: input.deputyUserId ?? null,
    emailReminderEnabled: input.emailReminderEnabled,
    emailReminderDaysBefore: input.emailReminderDaysBefore ?? null,
    completedAt: input.completedAt ? new Date(input.completedAt) : null,
    completedByUserId: input.completedByUserId ?? null,
    evidence: toJsonInput(input.evidence),
    archivedAt: input.archivedAt ? new Date(input.archivedAt) : null,
    isArchived: Boolean(input.isArchived || input.archivedAt),
    createdAt: toDateValue(input.createdAt),
    updatedAt: toDateValue(input.updatedAt)
  };
}

function toDeadlineUpdateInput(input: DeadlineDto): Prisma.DeadlineUncheckedUpdateInput {
  return {
    title: input.title,
    description: input.description || null,
    dueDate: input.dueDate,
    status: input.status,
    projectId: input.projectId ?? null,
    legalDocId: input.legalDocId ?? null,
    authorityId: input.authorityId ?? null,
    ownerUserId: input.ownerUserId ?? null,
    deputyUserId: input.deputyUserId ?? null,
    emailReminderEnabled: input.emailReminderEnabled,
    emailReminderDaysBefore: input.emailReminderDaysBefore ?? null,
    completedAt: input.completedAt ? new Date(input.completedAt) : null,
    completedByUserId: input.completedByUserId ?? null,
    evidence: toJsonInput(input.evidence),
    archivedAt: input.archivedAt ? new Date(input.archivedAt) : null,
    isArchived: Boolean(input.isArchived || input.archivedAt),
    updatedAt: toDateValue(input.updatedAt)
  };
}

async function listDeadlinesFromDb(db: DbClient, where?: Prisma.DeadlineWhereInput): Promise<DeadlineDto[]> {
  const deadlines = await db.deadline.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }]
  });

  return deadlines.map((deadline) => toDeadlineDto(deadline));
}

async function enrichDeadlineDtosWithProjectAccess(
  db: DbClient,
  user: RouteUser,
  deadlines: DeadlineDto[]
): Promise<DeadlineDto[]> {
  if (deadlines.length === 0) {
    return deadlines;
  }

  const legalDocIds = Array.from(
    new Set(deadlines.map((deadline) => deadline.legalDocId).filter((id): id is string => Boolean(id)))
  );
  const legalDocs = legalDocIds.length
    ? await db.legalDocument.findMany({
        where: {
          id: {
            in: legalDocIds
          }
        },
        select: {
          id: true,
          projectId: true
        }
      })
    : [];
  const projectIdByLegalDocId = new Map(
    legalDocs.map((legalDoc) => [legalDoc.id, legalDoc.projectId] as const)
  );
  const resolvedProjectIds = Array.from(
    new Set(
      deadlines
        .map((deadline) => deadline.projectId ?? (deadline.legalDocId ? projectIdByLegalDocId.get(deadline.legalDocId) : undefined))
        .filter((id): id is string => Boolean(id))
    )
  );
  const [projects, writeAccessMap] = await Promise.all([
    resolvedProjectIds.length
      ? db.project.findMany({
          where: {
            id: {
              in: resolvedProjectIds
            }
          },
          select: {
            id: true,
            title: true
          }
        })
      : Promise.resolve([]),
    getProjectWriteAccessMap(db, user, resolvedProjectIds)
  ]);
  const projectTitleById = new Map(projects.map((project) => [project.id, project.title] as const));

  return deadlines.map((deadline) => {
    const resolvedProjectId =
      deadline.projectId ?? (deadline.legalDocId ? projectIdByLegalDocId.get(deadline.legalDocId) : undefined);
    return {
      ...deadline,
      resolvedProjectId,
      projectTitle: resolvedProjectId ? projectTitleById.get(resolvedProjectId) : undefined,
      currentUserCanWriteProject: resolvedProjectId
        ? Boolean(writeAccessMap.get(resolvedProjectId))
        : false
    };
  });
}

async function toDeadlineDtoForUser(
  db: DbClient,
  user: RouteUser,
  deadline: DbDeadline
) {
  const [dto] = await enrichDeadlineDtosWithProjectAccess(db, user, [toDeadlineDto(deadline)]);
  return dto;
}

async function findDeadlineById(db: DbClient, id: string) {
  return db.deadline.findUnique({
    where: {
      id
    }
  });
}

async function replaceDeadlinesInDb(prisma: PrismaClient, deadlines: DeadlineDto[]) {
  await prisma.$transaction(async (tx) => {
    await tx.deadline.deleteMany();

    for (const deadline of deadlines) {
      await tx.deadline.create({
        data: toDeadlineCreateInput(deadline)
      });
    }
  });
}

async function readDeadlinesSnapshotFromPortal(prisma: PrismaClient) {
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
  if (!hasOwn(payload, "deadlines")) {
    return null;
  }

  return normalizeDeadlinesSnapshot(payload.deadlines);
}

async function writeDeadlinesSnapshotToPortal(
  prisma: PrismaClient,
  deadlines: DeadlineDto[],
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

  payload.deadlines = deadlines as unknown as Prisma.JsonArray;

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

async function validateDeadlineRelations(
  prisma: PrismaClient,
  input: {
    projectId?: string;
    legalDocId?: string;
    authorityId?: string;
    ownerUserId?: string;
    deputyUserId?: string;
    completedByUserId?: string;
  }
): Promise<DeadlineRelationValidationResult> {
  const projectId = toOptionalTrimmedString(input.projectId);
  const legalDocId = toOptionalTrimmedString(input.legalDocId);
  const authorityId = toOptionalTrimmedString(input.authorityId);
  const ownerUserId = toOptionalTrimmedString(input.ownerUserId);
  const deputyUserId = toOptionalTrimmedString(input.deputyUserId);
  const completedByUserId = toOptionalTrimmedString(input.completedByUserId);

  if (projectId) {
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      select: { id: true }
    });
    if (!project) {
      return { ok: false, status: 404, message: "Project not found." };
    }
  }

  if (legalDocId) {
    const legalDoc = await prisma.legalDocument.findUnique({
      where: { id: legalDocId },
      select: { id: true, projectId: true }
    });
    if (!legalDoc) {
      return { ok: false, status: 404, message: "Legal document not found." };
    }
    if (projectId && legalDoc.projectId !== projectId) {
      return { ok: false, status: 400, message: "legalDocId does not belong to projectId." };
    }
  }

  if (authorityId) {
    const authority = await prisma.authority.findUnique({
      where: { id: authorityId },
      select: { id: true }
    });
    if (!authority) {
      return { ok: false, status: 404, message: "Authority not found." };
    }
  }

  for (const [userId, label] of [
    [ownerUserId, "Owner"],
    [deputyUserId, "Deputy"],
    [completedByUserId, "Completed by user"]
  ] as const) {
    if (!userId) {
      continue;
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true }
    });
    if (!user) {
      return { ok: false, status: 404, message: `${label} not found.` };
    }
  }

  return {
    ok: true,
    projectId,
    legalDocId,
    authorityId,
    ownerUserId,
    deputyUserId,
    completedByUserId
  };
}

async function normalizeDeadlineForWrite(
  prisma: PrismaClient,
  input: DeadlineDto
) {
  const relationValidation = await validateDeadlineRelations(prisma, {
    projectId: input.projectId,
    legalDocId: input.legalDocId,
    authorityId: input.authorityId,
    ownerUserId: input.ownerUserId,
    deputyUserId: input.deputyUserId,
    completedByUserId: input.completedByUserId
  });

  if (!relationValidation.ok) {
    return relationValidation;
  }

  const normalizedReminder = normalizeReminder({
    emailReminderEnabled: Boolean(input.emailReminderEnabled),
    emailReminderDaysBefore: input.emailReminderDaysBefore
  });
  const normalizedStatus = normalizeStoredStatus(input.status);
  const normalizedCompletedAt =
    normalizedStatus === "DONE"
      ? toOptionalTrimmedString(input.completedAt) ?? nowStamp()
      : undefined;

  return {
    ok: true as const,
    deadline: {
      ...input,
      title: input.title.trim(),
      description: input.description ?? "",
      dueDate: input.dueDate.trim(),
      status: normalizedStatus,
      projectId: relationValidation.projectId,
      legalDocId: relationValidation.legalDocId,
      authorityId: relationValidation.authorityId,
      ownerUserId: relationValidation.ownerUserId,
      deputyUserId: relationValidation.deputyUserId,
      emailReminderEnabled: normalizedReminder.emailReminderEnabled,
      emailReminderDaysBefore: normalizedReminder.emailReminderDaysBefore,
      completedAt: normalizedCompletedAt,
      completedByUserId: normalizedStatus === "DONE" ? relationValidation.completedByUserId : undefined,
      evidence: normalizeEvidenceArray(input.evidence),
      archivedAt: toOptionalTrimmedString(input.archivedAt),
      isArchived: Boolean(input.isArchived || input.archivedAt)
    } satisfies DeadlineDto
  };
}

async function getUserDisplayLabel(prisma: PrismaClient, userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      firstName: true,
      lastName: true
    }
  });

  if (!user) {
    return undefined;
  }

  const label = `${user.firstName} ${user.lastName}`.trim();
  return label || undefined;
}

function requireDeadlineActionPermission(
  user: RouteUser,
  res: Response,
  permissionKey: PermissionKey
) {
  if (hasPermission(user.permissionKeys, permissionKey)) {
    return true;
  }

  res.status(403).json({ ok: false, message: "Forbidden." });
  return false;
}

function getDeadlineStatusTransitionPermission(
  currentStatus: DeadlineStoredStatusDto,
  nextStatus: DeadlineStoredStatusDto
): PermissionKey | null {
  if (currentStatus === nextStatus) {
    return null;
  }

  return nextStatus === "DONE" ? "tasks.complete" : "tasks.edit";
}

function requireDeadlineStatusTransitionPermission(
  user: RouteUser,
  res: Response,
  currentStatus: DeadlineStoredStatusDto,
  nextStatus: DeadlineStoredStatusDto
) {
  const permissionKey = getDeadlineStatusTransitionPermission(currentStatus, nextStatus);
  return permissionKey ? requireDeadlineActionPermission(user, res, permissionKey) : true;
}

async function requireDeadlineReadAccess(
  prisma: PrismaClient,
  user: RouteUser,
  res: Response,
  deadlineId: string
) {
  const context = await resolveDeadlineProjectId(prisma, deadlineId);
  if (!context.exists) {
    res.status(404).json({ ok: false, message: "Deadline not found." });
    return false;
  }

  if (!context.projectId) {
    if (hasGlobalProjectReadAccess(user) && hasPermission(user.permissionKeys, "deadlines.view")) {
      return true;
    }
    res.status(403).json({ ok: false, message: "Forbidden." });
    return false;
  }

  return requireProjectDomainRead({
    db: prisma,
    user,
    projectId: context.projectId,
    domain: "deadlines",
    res,
    notFoundMessage: "Deadline not found."
  });
}

async function requireDeadlineWriteAccess(input: {
  prisma: PrismaClient;
  user: RouteUser;
  res: Response;
  deadlineId?: string;
  projectId?: string;
  permission: PermissionKey;
}) {
  const projectId = input.deadlineId
    ? (await resolveDeadlineProjectId(input.prisma, input.deadlineId)).projectId
    : input.projectId ?? null;

  if (!projectId) {
    if (hasGlobalProjectReadAccess(input.user) && hasPermission(input.user.permissionKeys, input.permission)) {
      return true;
    }
    input.res.status(403).json({ ok: false, message: "Forbidden." });
    return false;
  }

  return requireProjectDomainWrite({
    db: input.prisma,
    user: input.user,
    projectId,
    domain: "deadlines",
    permission: input.permission,
    res: input.res,
    notFoundMessage: "Deadline not found."
  });
}

export function createDeadlinesRouter(prisma: PrismaClient) {
  const router = Router();

  router.get("/deadlines", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireAuthenticatedRouteUser(req, res, prisma);
      if (!user) {
        return;
      }

      const readableProjectIds = await getReadableProjectIdsForDomain(prisma, user, "deadlines");
      const deadlines =
        readableProjectIds === null
          ? await listDeadlinesFromDb(prisma)
          : readableProjectIds.length > 0
          ? await listDeadlinesFromDb(prisma, {
              OR: [
                {
                  projectId: {
                    in: readableProjectIds
                  }
                },
                {
                  legalDocument: {
                    projectId: {
                      in: readableProjectIds
                    }
                  }
                }
              ]
            })
          : [];

      res.json(await enrichDeadlineDtosWithProjectAccess(prisma, user, deadlines));
    } catch (error) {
      next(error);
    }
  });

  router.get("/deadlines/project-options", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireAuthenticatedRouteUser(req, res, prisma);
      if (!user) {
        return;
      }

      const projects = await listWritableProjectOptionsForDomain({
        db: prisma,
        user,
        domain: "deadlines",
        permission: "deadlines.create"
      });

      res.json(projects);
    } catch (error) {
      next(error);
    }
  });

  router.get("/deadlines/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireAuthenticatedRouteUser(req, res, prisma);
      if (!user) {
        return;
      }

      if (!requireProjectDomainReadPermission({ user, domain: "deadlines", res })) {
        return;
      }

      const deadline = await findDeadlineById(prisma, req.params.id);
      if (!deadline) {
        res.status(404).json({ ok: false, message: "Deadline not found." });
        return;
      }
      if (!(await requireDeadlineReadAccess(prisma, user, res, deadline.id))) {
        return;
      }

      res.json({
        ok: true,
        deadline: await toDeadlineDtoForUser(prisma, user, deadline)
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/deadlines", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireInternalRouteUser(req, res, prisma);
      if (!user) {
        return;
      }

      const requestedId = toOptionalTrimmedString(req.body?.id);
      const deadlineId = requestedId ?? createServerId("dl");
      const title = ensureStringField(req.body?.title);
      const dueDate = ensureStringField(req.body?.dueDate);

      if (!title || !dueDate) {
        res.status(400).json({ ok: false, message: "title and dueDate are required." });
        return;
      }

      const existing = await findDeadlineById(prisma, deadlineId);
      if (existing) {
        res.status(409).json({ ok: false, message: "Deadline already exists." });
        return;
      }

      const reminderDays = parseReminderDaysBefore(req.body?.emailReminderDaysBefore);
      if (!reminderDays.ok) {
        res.status(reminderDays.status).json({ ok: false, message: reminderDays.message });
        return;
      }

      const normalized = await normalizeDeadlineForWrite(prisma, {
        id: deadlineId,
        title,
        description: typeof req.body?.description === "string" ? req.body.description : "",
        dueDate,
        status: normalizeStoredStatus(req.body?.status),
        projectId: toOptionalTrimmedString(req.body?.projectId),
        legalDocId: toOptionalTrimmedString(req.body?.legalDocId),
        authorityId: toOptionalTrimmedString(req.body?.authorityId),
        ownerUserId: toOptionalTrimmedString(req.body?.ownerUserId),
        deputyUserId: toOptionalTrimmedString(req.body?.deputyUserId),
        emailReminderEnabled: Boolean(req.body?.emailReminderEnabled),
        emailReminderDaysBefore: reminderDays.value,
        completedAt: undefined,
        completedByUserId: undefined,
        evidence: [],
        archivedAt: undefined,
        isArchived: false,
        createdAt: nowStamp(),
        updatedAt: nowStamp()
      });

      if (!normalized.ok) {
        res.status(normalized.status).json({ ok: false, message: normalized.message });
        return;
      }
      let targetProjectId = normalized.deadline.projectId;
      if (!targetProjectId && normalized.deadline.legalDocId) {
        const legalDoc = await prisma.legalDocument.findUnique({
          where: { id: normalized.deadline.legalDocId },
          select: { projectId: true }
        });
        targetProjectId = legalDoc?.projectId;
      }
      if (
        !(await requireDeadlineWriteAccess({
          prisma,
          user,
          res,
          projectId: targetProjectId,
          permission: "deadlines.create"
        }))
      ) {
        return;
      }

      const deadline = await prisma.$transaction(async (tx) => {
        const created = await tx.deadline.create({
          data: toDeadlineCreateInput(normalized.deadline)
        });

        await enqueueDeadlineAssignmentNotificationsForChange(tx, created.id, {
          ownerUserId: null,
          deputyUserId: null
        });

        return created;
      });

      res.status(201).json({
        ok: true,
        deadline: await toDeadlineDtoForUser(prisma, user, deadline)
      });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/deadlines/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireInternalRouteUser(req, res, prisma);
      if (!user) {
        return;
      }

      const existingRecord = await findDeadlineById(prisma, req.params.id);
      if (!existingRecord) {
        res.status(404).json({ ok: false, message: "Deadline not found." });
        return;
      }
      if (
        !(await requireDeadlineWriteAccess({
          prisma,
          user,
          res,
          deadlineId: existingRecord.id,
          permission: "deadlines.edit"
        }))
      ) {
        return;
      }

      const existing = toDeadlineDto(existingRecord);
      const requestedStatus = hasOwn(req.body, "status")
        ? normalizeStoredStatus(req.body?.status)
        : undefined;
      if (
        requestedStatus &&
        !requireDeadlineStatusTransitionPermission(user, res, existing.status, requestedStatus)
      ) {
        return;
      }

      const reminderDays = hasOwn(req.body, "emailReminderDaysBefore")
        ? parseReminderDaysBefore(req.body?.emailReminderDaysBefore)
        : ({ ok: true, value: existing.emailReminderDaysBefore } as const);
      if (!reminderDays.ok) {
        res.status(reminderDays.status).json({ ok: false, message: reminderDays.message });
        return;
      }

      const merged: DeadlineDto = {
        ...existing,
        title: hasOwn(req.body, "title") ? ensureStringField(req.body?.title) : existing.title,
        description: hasOwn(req.body, "description")
          ? (typeof req.body?.description === "string" ? req.body.description : "")
          : existing.description ?? "",
        dueDate: hasOwn(req.body, "dueDate") ? ensureStringField(req.body?.dueDate) : existing.dueDate,
        status: requestedStatus ?? existing.status,
        projectId: hasOwn(req.body, "projectId")
          ? toOptionalTrimmedString(req.body?.projectId)
          : existing.projectId,
        legalDocId: hasOwn(req.body, "legalDocId")
          ? toOptionalTrimmedString(req.body?.legalDocId)
          : existing.legalDocId,
        authorityId: hasOwn(req.body, "authorityId")
          ? toOptionalTrimmedString(req.body?.authorityId)
          : existing.authorityId,
        ownerUserId: hasOwn(req.body, "ownerUserId")
          ? toOptionalTrimmedString(req.body?.ownerUserId)
          : existing.ownerUserId,
        deputyUserId: hasOwn(req.body, "deputyUserId")
          ? toOptionalTrimmedString(req.body?.deputyUserId)
          : existing.deputyUserId,
        emailReminderEnabled: hasOwn(req.body, "emailReminderEnabled")
          ? Boolean(req.body?.emailReminderEnabled)
          : existing.emailReminderEnabled,
        emailReminderDaysBefore: reminderDays.value,
        completedAt: hasOwn(req.body, "completedAt")
          ? toOptionalTrimmedString(req.body?.completedAt)
          : existing.completedAt,
        completedByUserId: hasOwn(req.body, "completedByUserId")
          ? toOptionalTrimmedString(req.body?.completedByUserId)
          : existing.completedByUserId,
        evidence: hasOwn(req.body, "evidence")
          ? normalizeEvidenceArray(req.body?.evidence)
          : existing.evidence,
        archivedAt: hasOwn(req.body, "archivedAt")
          ? toOptionalTrimmedString(req.body?.archivedAt)
          : existing.archivedAt,
        isArchived: hasOwn(req.body, "isArchived")
          ? Boolean(req.body?.isArchived)
          : existing.isArchived,
        createdAt: existing.createdAt,
        updatedAt: nowStamp()
      };

      if (!merged.title || !merged.dueDate) {
        res.status(400).json({ ok: false, message: "title and dueDate are required." });
        return;
      }

      const normalized = await normalizeDeadlineForWrite(prisma, merged);
      if (!normalized.ok) {
        res.status(normalized.status).json({ ok: false, message: normalized.message });
        return;
      }
      let targetProjectId = normalized.deadline.projectId;
      if (!targetProjectId && normalized.deadline.legalDocId) {
        const legalDoc = await prisma.legalDocument.findUnique({
          where: { id: normalized.deadline.legalDocId },
          select: { projectId: true }
        });
        targetProjectId = legalDoc?.projectId;
      }
      if (
        !(await requireDeadlineWriteAccess({
          prisma,
          user,
          res,
          projectId: targetProjectId,
          permission: "deadlines.edit"
        }))
      ) {
        return;
      }

      const updated = await prisma.$transaction(async (tx) => {
        const next = await tx.deadline.update({
          where: {
            id: existing.id
          },
          data: toDeadlineUpdateInput(normalized.deadline)
        });

        await enqueueDeadlineAssignmentNotificationsForChange(tx, existing.id, {
          ownerUserId: existingRecord.ownerUserId,
          deputyUserId: existingRecord.deputyUserId
        });

        return next;
      });

      res.json({
        ok: true,
        deadline: await toDeadlineDtoForUser(prisma, user, updated)
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/deadlines/:id/status", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireInternalRouteUser(req, res, prisma);
      if (!user) {
        return;
      }

      const existing = await findDeadlineById(prisma, req.params.id);
      if (!existing) {
        res.status(404).json({ ok: false, message: "Deadline not found." });
        return;
      }
      const status = normalizeStoredStatus(req.body?.status);
      const requiredPermission = status === "DONE" ? "tasks.complete" : "tasks.edit";
      if (
        !(await requireDeadlineWriteAccess({
          prisma,
          user,
          res,
          deadlineId: existing.id,
          permission: requiredPermission
        }))
      ) {
        return;
      }

      if (!requireDeadlineActionPermission(user, res, requiredPermission)) {
        return;
      }

      const updated = await prisma.deadline.update({
        where: { id: existing.id },
        data: {
          status,
          completedAt: status === "DONE" ? new Date() : null,
          completedByUserId: status === "DONE" ? user.id : null
        }
      });

      res.json({
        ok: true,
        deadline: await toDeadlineDtoForUser(prisma, user, updated)
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/deadlines/:id/complete", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireInternalRouteUser(req, res, prisma);
      if (!user) {
        return;
      }

      if (!requireDeadlineActionPermission(user, res, "tasks.complete")) {
        return;
      }

      const existingRecord = await findDeadlineById(prisma, req.params.id);
      if (!existingRecord) {
        res.status(404).json({ ok: false, message: "Deadline not found." });
        return;
      }
      if (
        !(await requireDeadlineWriteAccess({
          prisma,
          user,
          res,
          deadlineId: existingRecord.id,
          permission: "tasks.complete"
        }))
      ) {
        return;
      }

      const timestamp = nowStamp();
      const createdByLabel = await getUserDisplayLabel(prisma, user.id);
      const evidenceEntry: EvidenceDto = {
        id: createStableId("ev"),
        note: toOptionalTrimmedString(req.body?.note),
        outcome: normalizeEvidenceOutcome(req.body?.outcome),
        attachments: Array.isArray(req.body?.attachments)
          ? req.body.attachments
              .map((attachment: unknown) => normalizeAttachmentMeta(attachment))
              .filter((attachment: AttachmentMetaDto | null): attachment is AttachmentMetaDto => Boolean(attachment))
          : [],
        createdAt: timestamp,
        createdByUserId: user.id,
        createdByLabel
      };

      const existing = toDeadlineDto(existingRecord);
      const updated = await prisma.deadline.update({
        where: { id: existing.id },
        data: {
          status: "DONE",
          completedAt: new Date(timestamp),
          completedByUserId: user.id,
          evidence: toJsonInput([evidenceEntry, ...existing.evidence])
        }
      });

      res.json({
        ok: true,
        deadline: await toDeadlineDtoForUser(prisma, user, updated)
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/deadlines/:id/reopen", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireInternalRouteUser(req, res, prisma);
      if (!user) {
        return;
      }

      if (!requireDeadlineActionPermission(user, res, "tasks.edit")) {
        return;
      }

      const existing = await findDeadlineById(prisma, req.params.id);
      if (!existing) {
        res.status(404).json({ ok: false, message: "Deadline not found." });
        return;
      }
      if (
        !(await requireDeadlineWriteAccess({
          prisma,
          user,
          res,
          deadlineId: existing.id,
          permission: "tasks.edit"
        }))
      ) {
        return;
      }

      const updated = await prisma.deadline.update({
        where: { id: existing.id },
        data: {
          status: "OPEN",
          completedAt: null,
          completedByUserId: null
        }
      });

      res.json({
        ok: true,
        deadline: await toDeadlineDtoForUser(prisma, user, updated)
      });
    } catch (error) {
      next(error);
    }
  });

  router.post(
    "/deadlines/:id/attachments/:attachmentId/mark-unavailable",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        applyNoStoreHeaders(res);

        const user = await requireInternalRouteUser(req, res, prisma);
        if (!user) {
          return;
        }

        const existingRecord = await findDeadlineById(prisma, req.params.id);
        if (!existingRecord) {
          res.status(404).json({ ok: false, message: "Deadline not found." });
          return;
        }
        if (
          !(await requireDeadlineWriteAccess({
            prisma,
            user,
            res,
            deadlineId: existingRecord.id,
            permission: "tasks.edit"
          }))
        ) {
          return;
        }

        const existing = toDeadlineDto(existingRecord);
        let changed = false;
        const nextEvidence = existing.evidence.map((entry) => ({
          ...entry,
          attachments: entry.attachments.map((attachment) => {
            if (attachment.id !== req.params.attachmentId || attachment.storage === "none") {
              return attachment;
            }

            changed = true;
            return {
              ...attachment,
              storage: "none" as const
            };
          })
        }));

        const updated = changed
          ? await prisma.deadline.update({
              where: { id: existing.id },
              data: {
                evidence: toJsonInput(nextEvidence)
              }
            })
          : existingRecord;

        res.json({
          ok: true,
          deadline: await toDeadlineDtoForUser(prisma, user, updated)
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.post("/deadlines/:id/archive", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireInternalRouteUser(req, res, prisma);
      if (!user) {
        return;
      }

      const existing = await findDeadlineById(prisma, req.params.id);
      if (!existing) {
        res.status(404).json({ ok: false, message: "Deadline not found." });
        return;
      }
      if (
        !(await requireDeadlineWriteAccess({
          prisma,
          user,
          res,
          deadlineId: existing.id,
          permission: "deadlines.archive"
        }))
      ) {
        return;
      }

      const updated = existing.isArchived
        ? existing
        : await prisma.deadline.update({
            where: { id: existing.id },
            data: {
              archivedAt: new Date(),
              isArchived: true
            }
          });

      res.json({
        ok: true,
        deadline: await toDeadlineDtoForUser(prisma, user, updated)
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/deadlines/:id/restore", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireInternalRouteUser(req, res, prisma);
      if (!user) {
        return;
      }

      const existing = await findDeadlineById(prisma, req.params.id);
      if (!existing) {
        res.status(404).json({ ok: false, message: "Deadline not found." });
        return;
      }
      if (
        !(await requireDeadlineWriteAccess({
          prisma,
          user,
          res,
          deadlineId: existing.id,
          permission: "deadlines.archive"
        }))
      ) {
        return;
      }

      const updated = !existing.isArchived && !existing.archivedAt
        ? existing
        : await prisma.deadline.update({
            where: { id: existing.id },
            data: {
              archivedAt: null,
              isArchived: false
            }
          });

      res.json({
        ok: true,
        deadline: await toDeadlineDtoForUser(prisma, user, updated)
      });
    } catch (error) {
      next(error);
    }
  });

  router.put("/admin/internal/deadlines/bulk-replace", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireAdminRoutePermissions(req, res, prisma, "deadlines.edit", "deadlines.archive");
      if (!user) {
        return;
      }

      const snapshot = normalizeDeadlinesSnapshot(req.body);
      const normalizedDeadlines: DeadlineDto[] = [];

      for (const deadline of snapshot) {
        const normalized = await normalizeDeadlineForWrite(prisma, deadline);
        if (!normalized.ok) {
          res.status(normalized.status).json({ ok: false, message: normalized.message });
          return;
        }
        normalizedDeadlines.push(normalized.deadline);
      }

      await replaceDeadlinesInDb(prisma, normalizedDeadlines);

      res.json({
        ok: true,
        deadlines: await listDeadlinesFromDb(prisma)
      });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/admin/internal/deadlines/bulk-delete", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireAdminRoutePermissions(req, res, prisma, "deadlines.edit", "deadlines.archive");
      if (!user) {
        return;
      }

      await prisma.deadline.deleteMany();

      res.json({
        ok: true
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/admin/internal/deadlines/backfill-from-snapshot", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireAdminRoutePermissions(req, res, prisma, "deadlines.edit", "deadlines.archive");
      if (!user) {
        return;
      }

      const snapshot = await readDeadlinesSnapshotFromPortal(prisma);
      if (!snapshot) {
        res.status(404).json({ ok: false, message: "Snapshot deadlines not found." });
        return;
      }

      const normalizedDeadlines: DeadlineDto[] = [];
      for (const deadline of snapshot) {
        const normalized = await normalizeDeadlineForWrite(prisma, deadline);
        if (!normalized.ok) {
          res.status(normalized.status).json({ ok: false, message: normalized.message });
          return;
        }
        normalizedDeadlines.push(normalized.deadline);
      }

      await replaceDeadlinesInDb(prisma, normalizedDeadlines);

      res.json({
        ok: true,
        deadlines: await listDeadlinesFromDb(prisma)
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/admin/internal/deadlines/rollback-to-snapshot", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireAdminRoutePermissions(req, res, prisma, "deadlines.edit", "deadlines.archive");
      if (!user) {
        return;
      }

      const deadlines = await listDeadlinesFromDb(prisma);
      await writeDeadlinesSnapshotToPortal(prisma, deadlines, user.id);

      res.json({
        ok: true,
        deadlines
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
