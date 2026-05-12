import { randomUUID } from "node:crypto";
import {
  Prisma,
  type PrismaClient,
  type TaskStateEntry as DbTaskStateEntry
} from "@prisma/client";
import { Router, type NextFunction, type Request, type Response } from "express";
import type { AppConfig } from "../config.js";
import { resolveExistingStoredDocumentPath } from "../documentStorage.js";
import {
  applyNoStoreHeaders,
  requireAdminRoutePermissions,
  requireAuthenticatedRouteUser,
  requireInternalRouteUser,
  type RouteUser
} from "./routeAuth.js";
import { hasPermission } from "../accessControl.js";
import {
  getReadableProjectIdsForDomain,
  hasGlobalProjectReadAccess,
  requireProjectDomainWrite,
  resolveTaskInstanceProjectId
} from "../projectAccess.js";

type AttachmentKindDto = "PHOTO" | "DOCUMENT" | "REPORT";
type AttachmentStorageDto = "indexeddb" | "none";
type EvidenceOutcomeDto = "OK" | "NOK" | "FOLLOW_UP";
type TaskStateStatusDto = "OPEN" | "IN_PROGRESS" | "DONE";

type AttachmentRequirementsDto = {
  requirePhoto: boolean;
  requireDocument: boolean;
  requireReport: boolean;
};

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

type TaskStateEntryDto = {
  status: TaskStateStatusDto;
  completedAt?: string;
  completedByUserId?: string;
  completedByLabel?: string;
  evidence?: EvidenceDto[];
  updatedAt: string;
};

type TaskStateMapDto = Record<string, TaskStateEntryDto>;

type AttachmentKindCountsDto = Record<AttachmentKindDto, number>;

type DbClient = PrismaClient | Prisma.TransactionClient;
const DOCUMENT_FILE_MISSING_ERROR_CODE = "FILE_MISSING";

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

function nowStamp() {
  return new Date().toISOString();
}

function createStableId(prefix: string) {
  return `${prefix}-${randomUUID()}`;
}

function toJsonInput(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? [])) as Prisma.InputJsonValue;
}

function buildObligationTaskInstanceId(obligationId: string, dueDateISO: string) {
  return `obligation:${obligationId}:${dueDateISO}`;
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
    obligationId: parts[1],
    dueDateISO: parts[2]
  };
}

function parseISODate(value: string) {
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseInstanceId(rawKey: string): string | null {
  if (!rawKey || typeof rawKey !== "string") {
    return null;
  }


  if (rawKey.startsWith("obligation:")) {
    const parts = rawKey.split(":");
    if (parts.length !== 3 || !parts[1] || !parts[2]) {
      return null;
    }
    return rawKey;
  }

  if (rawKey.startsWith("ob-") && rawKey.length > 14) {
    const dueDateISO = rawKey.slice(-10);
    const between = rawKey.slice(3, -11);
    if (parseISODate(dueDateISO) && between) {
      return buildObligationTaskInstanceId(between, dueDateISO);
    }
  }

  return null;
}

function isTaskStateStatus(value: unknown): value is TaskStateStatusDto {
  return value === "OPEN" || value === "IN_PROGRESS" || value === "DONE";
}

function normalizeStatus(value: unknown): TaskStateStatusDto {
  if (value === "DONE") {
    return "DONE";
  }
  if (value === "IN_PROGRESS") {
    return "IN_PROGRESS";
  }
  return "OPEN";
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

function normalizeAttachmentRequirements(value: unknown): AttachmentRequirementsDto {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      requirePhoto: false,
      requireDocument: false,
      requireReport: false
    };
  }

  const row = value as Partial<AttachmentRequirementsDto>;
  return {
    requirePhoto: Boolean(row.requirePhoto),
    requireDocument: Boolean(row.requireDocument),
    requireReport: Boolean(row.requireReport)
  };
}

function createEmptyKindCounts(): AttachmentKindCountsDto {
  return {
    PHOTO: 0,
    DOCUMENT: 0,
    REPORT: 0
  };
}

function consumeMatchingAttachment(
  remaining: AttachmentMetaDto[],
  predicate: (attachment: AttachmentMetaDto) => boolean
) {
  const index = remaining.findIndex(predicate);
  if (index < 0) {
    return false;
  }
  remaining.splice(index, 1);
  return true;
}

function countAttachmentsForRequirements(
  requirements: AttachmentRequirementsDto | undefined,
  attachments: AttachmentMetaDto[]
): AttachmentKindCountsDto {
  const counts = createEmptyKindCounts();
  if (!requirements) {
    return counts;
  }

  const remaining = [...attachments];

  if (requirements.requirePhoto && consumeMatchingAttachment(remaining, (item) => item.kind === "PHOTO")) {
    counts.PHOTO = 1;
  }

  if (requirements.requireReport && consumeMatchingAttachment(remaining, (item) => item.kind === "REPORT")) {
    counts.REPORT = 1;
  }

  if (
    requirements.requireDocument &&
    (consumeMatchingAttachment(remaining, (item) => item.kind === "DOCUMENT") ||
      consumeMatchingAttachment(remaining, (item) => item.kind === "REPORT"))
  ) {
    counts.DOCUMENT = 1;
  }

  return counts;
}

function getMissingRequiredAttachmentKinds(
  requirements: AttachmentRequirementsDto | undefined,
  attachments: AttachmentMetaDto[]
): AttachmentKindDto[] {
  if (!requirements) {
    return [];
  }

  const counts = countAttachmentsForRequirements(requirements, attachments);
  const missing: AttachmentKindDto[] = [];

  if (requirements.requirePhoto && counts.PHOTO < 1) {
    missing.push("PHOTO");
  }
  if (requirements.requireDocument && counts.DOCUMENT < 1) {
    missing.push("DOCUMENT");
  }
  if (requirements.requireReport && counts.REPORT < 1) {
    missing.push("REPORT");
  }

  return missing;
}

function hasRequiredEvidenceRequirements(requirements: AttachmentRequirementsDto | undefined) {
  return Boolean(requirements?.requirePhoto || requirements?.requireDocument || requirements?.requireReport);
}

function normalizeEvidenceDocumentIds(value: unknown) {
  if (value === undefined) {
    return {
      ok: true as const,
      ids: []
    };
  }

  if (!Array.isArray(value)) {
    return {
      ok: false as const,
      ids: []
    };
  }

  const ids: string[] = [];
  for (const entry of value) {
    const id = toOptionalTrimmedString(entry);
    if (!id) {
      return {
        ok: false as const,
        ids: []
      };
    }
    ids.push(id);
  }

  return {
    ok: true as const,
    ids: Array.from(new Set(ids))
  };
}

function documentToAttachmentMeta(document: {
  id: string;
  filename: string;
  originalFilename: string | null;
  mimeType: string;
  sizeBytes: number;
  createdAt: Date;
}): AttachmentMetaDto {
  const filename = document.originalFilename || document.filename;
  return {
    id: `doc-${document.id}`,
    kind: normalizeAttachmentKind(undefined, document.mimeType, filename),
    filename,
    sizeKb: Math.max(1, Math.ceil(document.sizeBytes / 1024)),
    mime: document.mimeType,
    addedAt: document.createdAt.toISOString().slice(0, 10),
    storage: "none"
  };
}

async function getServerEvidenceAttachments(
  prisma: DbClient,
  config: AppConfig,
  taskInstanceId: string,
  evidenceDocumentIds: string[]
) {
  const documents = await prisma.document.findMany({
    where: {
      ownerType: "TASK_EVIDENCE",
      ownerId: taskInstanceId,
      isArchived: false
    },
    select: {
      id: true,
      filename: true,
      originalFilename: true,
      mimeType: true,
      sizeBytes: true,
      createdAt: true,
      storagePath: true
    }
  });

  const explicitDocumentIdSet = new Set(evidenceDocumentIds);
  const ownerDocumentIdSet = new Set(documents.map((document) => document.id));
  if (evidenceDocumentIds.some((documentId) => !ownerDocumentIdSet.has(documentId))) {
    return {
      ok: false as const,
      fileMissing: false,
      attachments: []
    };
  }

  const attachments: AttachmentMetaDto[] = [];
  let hasMissingFile = false;
  let hasInvalidStoragePath = false;

  for (const document of documents) {
    const storageResolution = await resolveExistingStoredDocumentPath(config, document.storagePath);
    if (!storageResolution.isSafe) {
      if (explicitDocumentIdSet.has(document.id)) {
        hasInvalidStoragePath = true;
      }
      continue;
    }
    if (!storageResolution.absoluteFilePath) {
      if (explicitDocumentIdSet.has(document.id)) {
        hasMissingFile = true;
      }
      continue;
    }
    attachments.push(documentToAttachmentMeta(document));
  }

  if (hasInvalidStoragePath) {
    return {
      ok: false as const,
      fileMissing: false,
      attachments: []
    };
  }

  if (hasMissingFile) {
    return {
      ok: false as const,
      fileMissing: true,
      attachments: []
    };
  }

  return {
    ok: true as const,
    fileMissing: false,
    attachments
  };
}

function flattenEvidenceAttachments(evidence: EvidenceDto[] | undefined) {
  return (evidence ?? []).flatMap((entry) => entry.attachments ?? []);
}

async function getObligationRequirementsForTaskInstance(
  prisma: DbClient,
  taskInstanceId: string
): Promise<AttachmentRequirementsDto | undefined> {
  const parsed = parseObligationTaskInstanceId(taskInstanceId);
  if (!parsed) {
    return undefined;
  }

  const obligation = await prisma.obligation.findUnique({
    where: {
      id: parsed.obligationId
    },
    select: {
      evidenceRequirements: true
    }
  });

  return obligation ? normalizeAttachmentRequirements(obligation.evidenceRequirements) : undefined;
}

async function getMissingTaskCompletionRequirements(
  prisma: DbClient,
  config: AppConfig,
  taskInstanceId: string,
  evidenceDocumentIds: string[] = []
) {
  const requirements = await getObligationRequirementsForTaskInstance(prisma, taskInstanceId);
  const hasRequirements = hasRequiredEvidenceRequirements(requirements);
  if (!hasRequirements && evidenceDocumentIds.length === 0) {
    return {
      invalidEvidenceDocuments: false,
      fileMissingEvidenceDocuments: false,
      missingAttachmentKinds: [] as AttachmentKindDto[]
    };
  }

  const serverEvidenceAttachments = await getServerEvidenceAttachments(prisma, config, taskInstanceId, evidenceDocumentIds);
  if (!serverEvidenceAttachments.ok) {
    return {
      invalidEvidenceDocuments: !serverEvidenceAttachments.fileMissing,
      fileMissingEvidenceDocuments: serverEvidenceAttachments.fileMissing,
      missingAttachmentKinds: [] as AttachmentKindDto[]
    };
  }

  return {
    invalidEvidenceDocuments: false,
    fileMissingEvidenceDocuments: false,
    missingAttachmentKinds: hasRequirements
      ? getMissingRequiredAttachmentKinds(requirements, serverEvidenceAttachments.attachments)
      : []
  };
}

function sendMissingEvidenceRequirementsResponse(res: Response, missingAttachmentKinds: AttachmentKindDto[]) {
  res.status(400).json({
    ok: false,
    message: "Missing required evidence attachments.",
    missingAttachmentKinds
  });
}

function sendInvalidEvidenceDocumentsResponse(res: Response) {
  res.status(400).json({
    ok: false,
    message: "Invalid evidence documents."
  });
}

function sendMissingEvidenceDocumentFileResponse(res: Response) {
  res.status(400).json({
    ok: false,
    errorCode: DOCUMENT_FILE_MISSING_ERROR_CODE,
    message: "Evidence document content missing."
  });
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

function normalizeTaskStateEntry(value: unknown): TaskStateEntryDto | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const row = value as Partial<TaskStateEntryDto> & { status?: unknown };
  const status = normalizeStatus(row.status);
  const updatedAt = toOptionalTrimmedString(row.updatedAt) ?? nowStamp();
  const completedAt =
    status === "DONE"
      ? toOptionalTrimmedString(row.completedAt) ?? updatedAt
      : undefined;

  return {
    status,
    completedAt,
    completedByUserId: toOptionalTrimmedString(row.completedByUserId),
    completedByLabel: toOptionalTrimmedString(row.completedByLabel),
    evidence: normalizeEvidenceArray(row.evidence),
    updatedAt
  };
}

function normalizeTaskStateMap(value: unknown): TaskStateMapDto {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([rawKey, rawEntry]) => {
        const instanceId = parseInstanceId(rawKey);
        const entry = normalizeTaskStateEntry(rawEntry);
        if (!instanceId || !entry) {
          return null;
        }
        return [instanceId, entry] as const;
      })
      .filter((entry): entry is readonly [string, TaskStateEntryDto] => Boolean(entry))
  );
}

function containsCompletedTaskState(taskState: TaskStateMapDto) {
  return Object.values(taskState).some((entry) => entry.status === "DONE");
}

function toUpdatedAtMillis(value: string | undefined) {
  if (!value) {
    return null;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function pickPreferredTaskStateEntry(
  current: TaskStateEntryDto,
  incoming: TaskStateEntryDto
): TaskStateEntryDto {
  const currentUpdatedAt = toUpdatedAtMillis(current.updatedAt);
  const incomingUpdatedAt = toUpdatedAtMillis(incoming.updatedAt);

  if (currentUpdatedAt !== null && incomingUpdatedAt !== null) {
    if (incomingUpdatedAt > currentUpdatedAt) {
      return incoming;
    }
    return current;
  }

  if (incomingUpdatedAt !== null && currentUpdatedAt === null) {
    return incoming;
  }

  return current;
}

function mergeTaskStateMaps(
  current: TaskStateMapDto,
  incoming: TaskStateMapDto
): TaskStateMapDto {
  const merged: TaskStateMapDto = { ...current };

  Object.entries(incoming).forEach(([taskInstanceId, entry]) => {
    const existing = merged[taskInstanceId];
    merged[taskInstanceId] = existing ? pickPreferredTaskStateEntry(existing, entry) : entry;
  });

  return merged;
}

function toTaskStateEntryDto(entry: DbTaskStateEntry): TaskStateEntryDto {
  return {
    status: normalizeStatus(entry.status),
    completedAt: entry.completedAt ? entry.completedAt.toISOString() : undefined,
    completedByUserId: entry.completedByUserId ?? undefined,
    completedByLabel: entry.completedByLabel ?? undefined,
    evidence: normalizeEvidenceArray(entry.evidence),
    updatedAt: entry.updatedAt.toISOString()
  };
}

function toTaskStateEntryCreateInput(
  taskInstanceId: string,
  entry: TaskStateEntryDto
): Prisma.TaskStateEntryUncheckedCreateInput {
  return {
    taskInstanceId,
    status: entry.status,
    completedAt: entry.completedAt ? new Date(entry.completedAt) : null,
    completedByUserId: entry.completedByUserId ?? null,
    completedByLabel: entry.completedByLabel ?? null,
    evidence: toJsonInput(entry.evidence ?? []),
    updatedAt: new Date(entry.updatedAt)
  };
}

function toTaskStateEntryUpdateInput(entry: TaskStateEntryDto): Prisma.TaskStateEntryUncheckedUpdateInput {
  return {
    status: entry.status,
    completedAt: entry.completedAt ? new Date(entry.completedAt) : null,
    completedByUserId: entry.completedByUserId ?? null,
    completedByLabel: entry.completedByLabel ?? null,
    evidence: toJsonInput(entry.evidence ?? []),
    updatedAt: new Date(entry.updatedAt)
  };
}

async function listTaskStateFromDb(db: DbClient, taskInstanceIds?: string[]): Promise<TaskStateMapDto> {
  if (taskInstanceIds && taskInstanceIds.length === 0) {
    return {};
  }

  const rows = await db.taskStateEntry.findMany({
    where: taskInstanceIds
      ? {
          taskInstanceId: {
            in: taskInstanceIds
          }
        }
      : undefined,
    orderBy: [{ updatedAt: "desc" }, { taskInstanceId: "asc" }]
  });

  return Object.fromEntries(
    rows.map((row) => [row.taskInstanceId, toTaskStateEntryDto(row)] as const)
  );
}

async function listAccessibleTaskInstanceIds(db: DbClient, projectIds: string[]) {
  if (projectIds.length === 0) {
    return [];
  }

  const obligations = await db.obligation.findMany({
    where: {
      legalDocument: {
        projectId: {
          in: projectIds
        }
      }
    },
    select: {
      id: true
    }
  });
  const obligationIds = new Set(obligations.map((obligation) => obligation.id));
  const rows = await db.taskStateEntry.findMany({
    select: {
      taskInstanceId: true
    }
  });

  return rows
    .map((row) => row.taskInstanceId)
    .filter((taskInstanceId) => {
      const parsed = parseObligationTaskInstanceId(taskInstanceId);
      return parsed ? obligationIds.has(parsed.obligationId) : false;
    });
}

async function requireTaskInstanceWriteAccess(input: {
  prisma: PrismaClient;
  taskInstanceId: string;
  user: RouteUser;
  res: Response;
  permission: "tasks.edit" | "tasks.complete";
}) {
  if (!input.user) {
    return false;
  }

  const projectId = await resolveTaskInstanceProjectId(input.prisma, input.taskInstanceId);
  if (!projectId) {
    input.res.status(404).json({ ok: false, message: "Task not found." });
    return false;
  }

  return requireProjectDomainWrite({
    db: input.prisma,
    user: input.user,
    projectId,
    domain: "tasks",
    permission: input.permission,
    res: input.res,
    notFoundMessage: "Task not found."
  });
}

async function findTaskStateEntry(db: DbClient, taskInstanceId: string) {
  return db.taskStateEntry.findUnique({
    where: {
      taskInstanceId
    }
  });
}

async function stripTaskStateFromSnapshot(db: DbClient, updatedByUserId?: string) {
  const snapshot = await db.portalSnapshot.findUnique({
    where: {
      scopeKey: "default"
    },
    select: {
      payload: true
    }
  });

  if (!snapshot || !snapshot.payload || typeof snapshot.payload !== "object" || Array.isArray(snapshot.payload)) {
    return;
  }

  const payload = { ...(snapshot.payload as Prisma.JsonObject) };
  if (!hasOwn(payload, "taskState")) {
    return;
  }

  delete payload.taskState;

  await db.portalSnapshot.update({
    where: {
      scopeKey: "default"
    },
    data: {
      payload,
      updatedByUserId: updatedByUserId ?? null
    }
  });
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

async function upsertTaskStateEntries(db: DbClient, taskState: TaskStateMapDto) {
  for (const [taskInstanceId, entry] of Object.entries(taskState)) {
    await db.taskStateEntry.upsert({
      where: {
        taskInstanceId
      },
      update: toTaskStateEntryUpdateInput(entry),
      create: toTaskStateEntryCreateInput(taskInstanceId, entry)
    });
  }
}

async function replaceTaskStateInDb(prisma: PrismaClient, taskState: TaskStateMapDto, updatedByUserId: string) {
  await prisma.$transaction(async (tx) => {
    await tx.taskStateEntry.deleteMany();

    for (const [taskInstanceId, entry] of Object.entries(taskState)) {
      await tx.taskStateEntry.create({
        data: toTaskStateEntryCreateInput(taskInstanceId, entry)
      });
    }

    await stripTaskStateFromSnapshot(tx, updatedByUserId);
  });
}

async function reconcileLegacyTaskStateInDb(
  prisma: PrismaClient,
  clientTaskState: TaskStateMapDto,
  updatedByUserId: string
) {
  return prisma.$transaction(async (tx) => {
    const current = await listTaskStateFromDb(tx);
    const merged = mergeTaskStateMaps(current, clientTaskState);
    await upsertTaskStateEntries(tx, merged);
    await stripTaskStateFromSnapshot(tx, updatedByUserId);
    return merged;
  });
}

export function createTaskStateRouter(prisma: PrismaClient, config: AppConfig) {
  const router = Router();

  router.get("/task-state", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireAuthenticatedRouteUser(req, res, prisma);
      if (!user) {
        return;
      }

      const readableProjectIds = await getReadableProjectIdsForDomain(prisma, user, "tasks");
      const taskState =
        readableProjectIds === null
          ? await listTaskStateFromDb(prisma)
          : await listTaskStateFromDb(
              prisma,
              await listAccessibleTaskInstanceIds(prisma, readableProjectIds)
            );

      res.json(taskState);
    } catch (error) {
      next(error);
    }
  });

  router.post("/task-state/reconcile-legacy", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireInternalRouteUser(req, res, prisma);
      if (!user) {
        return;
      }

      const input =
        hasOwn(req.body, "taskState") && typeof req.body === "object" && req.body !== null
          ? req.body.taskState
          : req.body;
      const normalizedTaskState = normalizeTaskStateMap(input);
      if (!hasGlobalProjectReadAccess(user)) {
        res.status(403).json({ ok: false, message: "Forbidden." });
        return;
      }
      if (containsCompletedTaskState(normalizedTaskState) && !hasPermission(user.permissionKeys, "tasks.complete")) {
        res.status(403).json({ ok: false, message: "Forbidden." });
        return;
      }
      const merged = await reconcileLegacyTaskStateInDb(
        prisma,
        normalizedTaskState,
        user.id
      );

      res.json({
        ok: true,
        taskState: merged
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/task-state/:taskInstanceId/status", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireInternalRouteUser(req, res, prisma);
      if (!user) {
        return;
      }


      const taskInstanceId = parseInstanceId(req.params.taskInstanceId);
      if (!taskInstanceId) {
        res.status(400).json({ ok: false, message: "Invalid task instance id." });
        return;
      }

      if (!isTaskStateStatus(req.body?.status)) {
        res.status(400).json({ ok: false, message: "Invalid task status." });
        return;
      }
      if (
        !(await requireTaskInstanceWriteAccess({
          prisma,
          taskInstanceId,
          user,
          res,
          permission: req.body.status === "DONE" ? "tasks.complete" : "tasks.edit"
        }))
      ) {
        return;
      }

      const existing = await findTaskStateEntry(prisma, taskInstanceId);
      const previous = existing ? toTaskStateEntryDto(existing) : undefined;
      if (req.body.status === "DONE") {
        const requirementsResult = await getMissingTaskCompletionRequirements(
          prisma,
          config,
          taskInstanceId
        );
        if (requirementsResult.invalidEvidenceDocuments) {
          sendInvalidEvidenceDocumentsResponse(res);
          return;
        }
        if (requirementsResult.fileMissingEvidenceDocuments) {
          sendMissingEvidenceDocumentFileResponse(res);
          return;
        }
        if (requirementsResult.missingAttachmentKinds.length) {
          sendMissingEvidenceRequirementsResponse(res, requirementsResult.missingAttachmentKinds);
          return;
        }
      }

      const timestamp = nowStamp();
      const completedByLabel = req.body.status === "DONE" ? await getUserDisplayLabel(prisma, user.id) : undefined;
      const nextEntry: TaskStateEntryDto = {
        status: req.body.status,
        completedAt: req.body.status === "DONE" ? previous?.completedAt ?? timestamp : undefined,
        completedByUserId: req.body.status === "DONE" ? previous?.completedByUserId ?? user.id : undefined,
        completedByLabel: req.body.status === "DONE" ? previous?.completedByLabel ?? completedByLabel : undefined,
        evidence: previous?.evidence ?? [],
        updatedAt: timestamp
      };

      const updated = await prisma.taskStateEntry.upsert({
        where: {
          taskInstanceId
        },
        update: toTaskStateEntryUpdateInput(nextEntry),
        create: toTaskStateEntryCreateInput(taskInstanceId, nextEntry)
      });

      res.json({
        ok: true,
        taskStateEntry: toTaskStateEntryDto(updated)
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/task-state/:taskInstanceId/complete", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireInternalRouteUser(req, res, prisma);
      if (!user) {
        return;
      }


      const taskInstanceId = parseInstanceId(req.params.taskInstanceId);
      if (!taskInstanceId) {
        res.status(400).json({ ok: false, message: "Invalid task instance id." });
        return;
      }
      if (
        !(await requireTaskInstanceWriteAccess({
          prisma,
          taskInstanceId,
          user,
          res,
          permission: "tasks.complete"
        }))
      ) {
        return;
      }

      const existing = await findTaskStateEntry(prisma, taskInstanceId);
      const previous = existing ? toTaskStateEntryDto(existing) : undefined;
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
      const evidenceDocumentIds = normalizeEvidenceDocumentIds(req.body?.evidenceDocumentIds);
      if (!evidenceDocumentIds.ok) {
        sendInvalidEvidenceDocumentsResponse(res);
        return;
      }

      const requirementsResult = await getMissingTaskCompletionRequirements(
        prisma,
        config,
        taskInstanceId,
        evidenceDocumentIds.ids
      );
      if (requirementsResult.invalidEvidenceDocuments) {
        sendInvalidEvidenceDocumentsResponse(res);
        return;
      }
      if (requirementsResult.fileMissingEvidenceDocuments) {
        sendMissingEvidenceDocumentFileResponse(res);
        return;
      }
      if (requirementsResult.missingAttachmentKinds.length) {
        sendMissingEvidenceRequirementsResponse(res, requirementsResult.missingAttachmentKinds);
        return;
      }

      const nextEntry: TaskStateEntryDto = {
        status: "DONE",
        completedAt: previous?.completedAt ?? timestamp,
        completedByUserId: previous?.completedByUserId ?? user.id,
        completedByLabel: previous?.completedByLabel ?? createdByLabel,
        evidence: [evidenceEntry, ...(previous?.evidence ?? [])],
        updatedAt: timestamp
      };

      const updated = await prisma.taskStateEntry.upsert({
        where: {
          taskInstanceId
        },
        update: toTaskStateEntryUpdateInput(nextEntry),
        create: toTaskStateEntryCreateInput(taskInstanceId, nextEntry)
      });

      res.json({
        ok: true,
        taskStateEntry: toTaskStateEntryDto(updated)
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/task-state/:taskInstanceId/evidence", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireInternalRouteUser(req, res, prisma);
      if (!user) {
        return;
      }


      const taskInstanceId = parseInstanceId(req.params.taskInstanceId);
      if (!taskInstanceId) {
        res.status(400).json({ ok: false, message: "Invalid task instance id." });
        return;
      }
      if (
        !(await requireTaskInstanceWriteAccess({
          prisma,
          taskInstanceId,
          user,
          res,
          permission: "tasks.complete"
        }))
      ) {
        return;
      }

      const existing = await findTaskStateEntry(prisma, taskInstanceId);
      const previous = existing ? toTaskStateEntryDto(existing) : undefined;
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
      const evidenceDocumentIds = normalizeEvidenceDocumentIds(req.body?.evidenceDocumentIds);
      if (!evidenceDocumentIds.ok) {
        sendInvalidEvidenceDocumentsResponse(res);
        return;
      }

      const requirementsResult = await getMissingTaskCompletionRequirements(
        prisma,
        config,
        taskInstanceId,
        evidenceDocumentIds.ids
      );
      if (requirementsResult.invalidEvidenceDocuments) {
        sendInvalidEvidenceDocumentsResponse(res);
        return;
      }
      if (requirementsResult.fileMissingEvidenceDocuments) {
        sendMissingEvidenceDocumentFileResponse(res);
        return;
      }
      if (requirementsResult.missingAttachmentKinds.length) {
        sendMissingEvidenceRequirementsResponse(res, requirementsResult.missingAttachmentKinds);
        return;
      }

      const nextEntry: TaskStateEntryDto = {
        status: "DONE",
        completedAt: previous?.completedAt ?? timestamp,
        completedByUserId: previous?.completedByUserId ?? user.id,
        completedByLabel: previous?.completedByLabel ?? createdByLabel,
        evidence: [evidenceEntry, ...(previous?.evidence ?? [])],
        updatedAt: timestamp
      };

      const updated = await prisma.taskStateEntry.upsert({
        where: {
          taskInstanceId
        },
        update: toTaskStateEntryUpdateInput(nextEntry),
        create: toTaskStateEntryCreateInput(taskInstanceId, nextEntry)
      });

      res.json({
        ok: true,
        taskStateEntry: toTaskStateEntryDto(updated)
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/task-state/:taskInstanceId/reopen", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireInternalRouteUser(req, res, prisma);
      if (!user) {
        return;
      }


      const taskInstanceId = parseInstanceId(req.params.taskInstanceId);
      if (!taskInstanceId) {
        res.status(400).json({ ok: false, message: "Invalid task instance id." });
        return;
      }
      if (
        !(await requireTaskInstanceWriteAccess({
          prisma,
          taskInstanceId,
          user,
          res,
          permission: "tasks.edit"
        }))
      ) {
        return;
      }

      const existing = await findTaskStateEntry(prisma, taskInstanceId);
      const previous = existing ? toTaskStateEntryDto(existing) : undefined;
      const nextEntry: TaskStateEntryDto = {
        status: "OPEN",
        completedAt: undefined,
        completedByUserId: undefined,
        completedByLabel: undefined,
        evidence: previous?.evidence ?? [],
        updatedAt: nowStamp()
      };

      const updated = await prisma.taskStateEntry.upsert({
        where: {
          taskInstanceId
        },
        update: toTaskStateEntryUpdateInput(nextEntry),
        create: toTaskStateEntryCreateInput(taskInstanceId, nextEntry)
      });

      res.json({
        ok: true,
        taskStateEntry: toTaskStateEntryDto(updated)
      });
    } catch (error) {
      next(error);
    }
  });

  router.post(
    "/task-state/:taskInstanceId/attachments/:attachmentId/mark-unavailable",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        applyNoStoreHeaders(res);

        const user = await requireInternalRouteUser(req, res, prisma);
        if (!user) {
          return;
        }

  
        const taskInstanceId = parseInstanceId(req.params.taskInstanceId);
        if (!taskInstanceId) {
          res.status(400).json({ ok: false, message: "Invalid task instance id." });
          return;
        }
        if (
          !(await requireTaskInstanceWriteAccess({
            prisma,
            taskInstanceId,
            user,
            res,
            permission: "tasks.edit"
          }))
        ) {
          return;
        }

        const existingRecord = await findTaskStateEntry(prisma, taskInstanceId);
        if (!existingRecord) {
          res.json({ ok: true, changed: false, taskStateEntry: null });
          return;
        }

        const existing = toTaskStateEntryDto(existingRecord);
        let changed = false;
        const nextEvidence = (existing.evidence ?? []).map((entry) => ({
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
          ? await prisma.taskStateEntry.update({
              where: {
                taskInstanceId
              },
              data: {
                evidence: toJsonInput(nextEvidence),
                updatedAt: new Date(nowStamp())
              }
            })
          : existingRecord;

        res.json({
          ok: true,
          changed,
          taskStateEntry: toTaskStateEntryDto(updated)
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.post("/admin/internal/task-state/cleanup-old", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireAdminRoutePermissions(req, res, prisma, "tasks.edit", "tasks.complete");
      if (!user) {
        return;
      }


      const horizonDays = toPositiveInteger(req.body?.horizonDays) ?? 365;
      const now = new Date(`${nowStamp().slice(0, 10)}T00:00:00`);
      const maxPast = new Date(now);
      maxPast.setDate(maxPast.getDate() - 730);
      const maxFuture = new Date(now);
      maxFuture.setDate(maxFuture.getDate() + horizonDays);

      const rows = await prisma.taskStateEntry.findMany();
      const removeIds = rows
        .filter((entry) => {
          const dueDateISO = entry.taskInstanceId.split(":")[2] ?? "";
          const dueDate = parseISODate(dueDateISO);
          const isTooOld = entry.updatedAt < maxPast;
          const isOutsideHorizon = !dueDate || dueDate < maxPast || dueDate > maxFuture;
          return isTooOld || isOutsideHorizon;
        })
        .map((entry) => entry.taskInstanceId);

      if (removeIds.length) {
        await prisma.taskStateEntry.deleteMany({
          where: {
            taskInstanceId: {
              in: removeIds
            }
          }
        });
      }

      res.json({
        ok: true,
        removedCount: removeIds.length,
        taskState: await listTaskStateFromDb(prisma)
      });
    } catch (error) {
      next(error);
    }
  });

  router.put("/admin/internal/task-state/bulk-replace", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireAdminRoutePermissions(req, res, prisma, "tasks.edit", "tasks.complete");
      if (!user) {
        return;
      }

      const taskState = normalizeTaskStateMap(req.body);
      await replaceTaskStateInDb(prisma, taskState, user.id);

      res.json({
        ok: true,
        taskState
      });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/admin/internal/task-state/bulk-delete", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireAdminRoutePermissions(req, res, prisma, "tasks.edit", "tasks.complete");
      if (!user) {
        return;
      }

      await prisma.taskStateEntry.deleteMany();
      await stripTaskStateFromSnapshot(prisma, user.id);

      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
