import { randomUUID } from "node:crypto";
import {
  Prisma,
  type PrismaClient,
  type TaskStateEntry as DbTaskStateEntry
} from "@prisma/client";
import { Router, type NextFunction, type Request, type Response } from "express";
import {
  applyNoStoreHeaders,
  requireAdminRoutePermissions,
  requireInternalRouteUser
} from "./routeAuth.js";

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
  taskInstanceId: string,
  attachments: AttachmentMetaDto[]
) {
  const requirements = await getObligationRequirementsForTaskInstance(prisma, taskInstanceId);
  return getMissingRequiredAttachmentKinds(requirements, attachments);
}

function sendMissingEvidenceRequirementsResponse(res: Response, missingAttachmentKinds: AttachmentKindDto[]) {
  res.status(400).json({
    ok: false,
    message: "Missing required evidence attachments.",
    missingAttachmentKinds
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

async function listTaskStateFromDb(db: DbClient): Promise<TaskStateMapDto> {
  const rows = await db.taskStateEntry.findMany({
    orderBy: [{ updatedAt: "desc" }, { taskInstanceId: "asc" }]
  });

  return Object.fromEntries(
    rows.map((row) => [row.taskInstanceId, toTaskStateEntryDto(row)] as const)
  );
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

export function createTaskStateRouter(prisma: PrismaClient) {
  const router = Router();

  router.get("/task-state", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireInternalRouteUser(req, res, prisma);
      if (!user) {
        return;
      }

      res.json(await listTaskStateFromDb(prisma));
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
      const merged = await reconcileLegacyTaskStateInDb(
        prisma,
        normalizeTaskStateMap(input),
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

      const existing = await findTaskStateEntry(prisma, taskInstanceId);
      const previous = existing ? toTaskStateEntryDto(existing) : undefined;
      if (req.body.status === "DONE") {
        const missingAttachmentKinds = await getMissingTaskCompletionRequirements(
          prisma,
          taskInstanceId,
          flattenEvidenceAttachments(previous?.evidence)
        );
        if (missingAttachmentKinds.length) {
          sendMissingEvidenceRequirementsResponse(res, missingAttachmentKinds);
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
      const missingAttachmentKinds = await getMissingTaskCompletionRequirements(
        prisma,
        taskInstanceId,
        [...evidenceEntry.attachments, ...flattenEvidenceAttachments(previous?.evidence)]
      );
      if (missingAttachmentKinds.length) {
        sendMissingEvidenceRequirementsResponse(res, missingAttachmentKinds);
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
      const missingAttachmentKinds = await getMissingTaskCompletionRequirements(
        prisma,
        taskInstanceId,
        [...evidenceEntry.attachments, ...flattenEvidenceAttachments(previous?.evidence)]
      );
      if (missingAttachmentKinds.length) {
        sendMissingEvidenceRequirementsResponse(res, missingAttachmentKinds);
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
