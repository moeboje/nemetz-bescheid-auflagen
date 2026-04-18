import { randomUUID } from "node:crypto";
import {
  Prisma,
  type Obligation as DbObligation,
  type PrismaClient
} from "@prisma/client";
import { Router, type NextFunction, type Request, type Response } from "express";
import {
  applyNoStoreHeaders,
  requireAdminRouteUser,
  requireInternalRouteUser
} from "./routeAuth.js";

type ObligationEvidenceRequirementsDto = {
  requirePhoto: boolean;
  requireDocument: boolean;
  requireReport: boolean;
};

type ObligationDto = {
  id: string;
  legalDocId: string;
  title: string;
  infoTextLong?: string;
  level: "MANDATORY" | "RECOMMENDED";
  criticality?: "LOW" | "MEDIUM" | "HIGH";
  scheduleType: "ONCE" | "RECURRING" | "ONCE_THEN_RECURRING";
  firstDueDate?: string;
  intervalUnit?: "DAY" | "WEEK" | "MONTH" | "QUARTER" | "YEAR";
  intervalValue?: number;
  ownerUserId?: string;
  deputyUserId?: string;
  origin?: "MANUAL" | "AI_ACCEPTED";
  sourceSuggestionId?: string;
  sourceRunId?: string;
  emailReminderEnabled: boolean;
  emailReminderDaysBefore?: number;
  evidenceRequirements: ObligationEvidenceRequirementsDto;
  archivedAt?: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
};

type DbClient = PrismaClient | Prisma.TransactionClient;

type ObligationRelationValidationResult =
  | {
      ok: true;
      legalDocId: string;
      ownerUserId?: string;
      deputyUserId?: string;
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

function toJsonInput(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? {})) as Prisma.InputJsonValue;
}

function normalizeLevel(value: unknown): ObligationDto["level"] {
  return value === "RECOMMENDED" ? "RECOMMENDED" : "MANDATORY";
}

function normalizeCriticality(value: unknown): ObligationDto["criticality"] {
  if (value === "LOW" || value === "MEDIUM" || value === "HIGH") {
    return value;
  }
  return undefined;
}

function normalizeScheduleType(value: unknown): ObligationDto["scheduleType"] {
  if (value === "RECURRING" || value === "ONCE_THEN_RECURRING") {
    return value;
  }
  return "ONCE";
}

function normalizeIntervalUnit(value: unknown): ObligationDto["intervalUnit"] {
  if (
    value === "DAY" ||
    value === "WEEK" ||
    value === "MONTH" ||
    value === "QUARTER" ||
    value === "YEAR"
  ) {
    return value;
  }
  return undefined;
}

function normalizeOrigin(value: unknown): ObligationDto["origin"] {
  if (value === "MANUAL" || value === "AI_ACCEPTED") {
    return value;
  }
  return undefined;
}

function normalizeEvidenceRequirements(value: unknown): ObligationEvidenceRequirementsDto {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      requirePhoto: false,
      requireDocument: false,
      requireReport: false
    };
  }

  const row = value as Partial<ObligationEvidenceRequirementsDto>;
  return {
    requirePhoto: Boolean(row.requirePhoto),
    requireDocument: Boolean(row.requireDocument),
    requireReport: Boolean(row.requireReport)
  };
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
      typeof value.emailReminderDaysBefore === "number" && value.emailReminderDaysBefore > 0
        ? Math.trunc(value.emailReminderDaysBefore)
        : 7
  };
}

function normalizeObligationDto(value: unknown, index: number): ObligationDto | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const row = value as Partial<ObligationDto>;
  if (
    typeof row.id !== "string" ||
    !row.id.trim() ||
    typeof row.legalDocId !== "string" ||
    !row.legalDocId.trim() ||
    typeof row.title !== "string" ||
    !row.title.trim()
  ) {
    return null;
  }

  const createdAt =
    typeof row.createdAt === "string" && row.createdAt.trim() ? row.createdAt : nowStamp();
  const updatedAt =
    typeof row.updatedAt === "string" && row.updatedAt.trim() ? row.updatedAt : createdAt;
  const normalizedReminder = normalizeReminder({
    emailReminderEnabled: Boolean(row.emailReminderEnabled),
    emailReminderDaysBefore: toPositiveInteger(row.emailReminderDaysBefore)
  });

  return {
    id: row.id || `ob-seed-${index}`,
    legalDocId: row.legalDocId,
    title: row.title,
    infoTextLong: row.infoTextLong ?? "",
    level: normalizeLevel(row.level),
    criticality: normalizeCriticality(row.criticality),
    scheduleType: normalizeScheduleType(row.scheduleType),
    firstDueDate: toOptionalTrimmedString(row.firstDueDate),
    intervalUnit: normalizeIntervalUnit(row.intervalUnit),
    intervalValue: toPositiveInteger(row.intervalValue),
    ownerUserId: toOptionalTrimmedString(row.ownerUserId),
    deputyUserId: toOptionalTrimmedString(row.deputyUserId),
    origin: normalizeOrigin(row.origin),
    sourceSuggestionId: toOptionalTrimmedString(row.sourceSuggestionId),
    sourceRunId: toOptionalTrimmedString(row.sourceRunId),
    emailReminderEnabled: normalizedReminder.emailReminderEnabled,
    emailReminderDaysBefore: normalizedReminder.emailReminderDaysBefore,
    evidenceRequirements: normalizeEvidenceRequirements(row.evidenceRequirements),
    archivedAt: toOptionalTrimmedString(row.archivedAt),
    isArchived: Boolean(row.isArchived || row.archivedAt),
    createdAt,
    updatedAt
  };
}

function normalizeObligationsSnapshot(value: unknown): ObligationDto[] {
  const source =
    Array.isArray(value)
      ? value
      : value &&
          typeof value === "object" &&
          !Array.isArray(value) &&
          Array.isArray((value as { obligations?: unknown }).obligations)
      ? (value as { obligations: unknown[] }).obligations
      : [];

  return source
    .map((obligation, index) => normalizeObligationDto(obligation, index))
    .filter((obligation): obligation is ObligationDto => Boolean(obligation));
}

function toObligationDto(obligation: DbObligation): ObligationDto {
  const normalizedReminder = normalizeReminder({
    emailReminderEnabled: obligation.emailReminderEnabled,
    emailReminderDaysBefore: obligation.emailReminderDaysBefore ?? undefined
  });

  return {
    id: obligation.id,
    legalDocId: obligation.legalDocId,
    title: obligation.title,
    infoTextLong: obligation.infoTextLong ?? "",
    level: normalizeLevel(obligation.level),
    criticality: normalizeCriticality(obligation.criticality),
    scheduleType: normalizeScheduleType(obligation.scheduleType),
    firstDueDate: obligation.firstDueDate ?? undefined,
    intervalUnit: normalizeIntervalUnit(obligation.intervalUnit),
    intervalValue: obligation.intervalValue ?? undefined,
    ownerUserId: obligation.ownerUserId ?? undefined,
    deputyUserId: obligation.deputyUserId ?? undefined,
    origin: normalizeOrigin(obligation.origin),
    sourceSuggestionId: obligation.sourceSuggestionId ?? undefined,
    sourceRunId: obligation.sourceRunId ?? undefined,
    emailReminderEnabled: normalizedReminder.emailReminderEnabled,
    emailReminderDaysBefore: normalizedReminder.emailReminderDaysBefore,
    evidenceRequirements: normalizeEvidenceRequirements(obligation.evidenceRequirements),
    archivedAt: obligation.archivedAt ? obligation.archivedAt.toISOString() : undefined,
    isArchived: obligation.isArchived,
    createdAt: obligation.createdAt.toISOString(),
    updatedAt: obligation.updatedAt.toISOString()
  };
}

function toObligationCreateInput(input: ObligationDto): Prisma.ObligationUncheckedCreateInput {
  return {
    id: input.id,
    legalDocId: input.legalDocId,
    title: input.title,
    infoTextLong: input.infoTextLong || null,
    level: input.level,
    criticality: input.criticality ?? null,
    scheduleType: input.scheduleType,
    firstDueDate: input.firstDueDate || null,
    intervalUnit: input.intervalUnit ?? null,
    intervalValue: input.intervalValue ?? null,
    ownerUserId: input.ownerUserId ?? null,
    deputyUserId: input.deputyUserId ?? null,
    origin: input.origin ?? null,
    sourceSuggestionId: input.sourceSuggestionId ?? null,
    sourceRunId: input.sourceRunId ?? null,
    emailReminderEnabled: input.emailReminderEnabled,
    emailReminderDaysBefore: input.emailReminderDaysBefore ?? null,
    evidenceRequirements: toJsonInput(input.evidenceRequirements),
    archivedAt: input.archivedAt ? new Date(input.archivedAt) : null,
    isArchived: Boolean(input.isArchived || input.archivedAt),
    createdAt: toDateValue(input.createdAt),
    updatedAt: toDateValue(input.updatedAt)
  };
}

function toObligationUpdateInput(input: ObligationDto): Prisma.ObligationUncheckedUpdateInput {
  return {
    legalDocId: input.legalDocId,
    title: input.title,
    infoTextLong: input.infoTextLong || null,
    level: input.level,
    criticality: input.criticality ?? null,
    scheduleType: input.scheduleType,
    firstDueDate: input.firstDueDate || null,
    intervalUnit: input.intervalUnit ?? null,
    intervalValue: input.intervalValue ?? null,
    ownerUserId: input.ownerUserId ?? null,
    deputyUserId: input.deputyUserId ?? null,
    origin: input.origin ?? null,
    sourceSuggestionId: input.sourceSuggestionId ?? null,
    sourceRunId: input.sourceRunId ?? null,
    emailReminderEnabled: input.emailReminderEnabled,
    emailReminderDaysBefore: input.emailReminderDaysBefore ?? null,
    evidenceRequirements: toJsonInput(input.evidenceRequirements),
    archivedAt: input.archivedAt ? new Date(input.archivedAt) : null,
    isArchived: Boolean(input.isArchived || input.archivedAt),
    updatedAt: toDateValue(input.updatedAt)
  };
}

async function listObligationsFromDb(db: DbClient): Promise<ObligationDto[]> {
  const obligations = await db.obligation.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "desc" }]
  });

  return obligations.map((obligation) => toObligationDto(obligation));
}

async function findObligationById(db: DbClient, id: string) {
  return db.obligation.findUnique({
    where: {
      id
    }
  });
}

async function replaceObligationsInDb(prisma: PrismaClient, obligations: ObligationDto[]) {
  await prisma.$transaction(async (tx) => {
    await tx.obligation.deleteMany();

    for (const obligation of obligations) {
      await tx.obligation.create({
        data: toObligationCreateInput(obligation)
      });
    }
  });
}

async function readObligationsSnapshotFromPortal(prisma: PrismaClient) {
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
  if (!hasOwn(payload, "obligations")) {
    return null;
  }

  return normalizeObligationsSnapshot(payload.obligations);
}

async function writeObligationsSnapshotToPortal(
  prisma: PrismaClient,
  obligations: ObligationDto[],
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

  payload.obligations = obligations as unknown as Prisma.JsonArray;

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

async function validateObligationRelations(
  prisma: PrismaClient,
  input: {
    legalDocId: string;
    ownerUserId?: string;
    deputyUserId?: string;
  }
): Promise<ObligationRelationValidationResult> {
  const legalDocId = ensureStringField(input.legalDocId);
  if (!legalDocId) {
    return { ok: false, status: 400, message: "legalDocId is required." };
  }

  const legalDoc = await prisma.legalDocument.findUnique({
    where: {
      id: legalDocId
    },
    select: {
      id: true
    }
  });
  if (!legalDoc) {
    return { ok: false, status: 404, message: "Legal document not found." };
  }

  const ownerUserId = toOptionalTrimmedString(input.ownerUserId);
  const deputyUserId = toOptionalTrimmedString(input.deputyUserId);

  if (ownerUserId) {
    const owner = await prisma.user.findUnique({
      where: {
        id: ownerUserId
      },
      select: {
        id: true
      }
    });

    if (!owner) {
      return { ok: false, status: 404, message: "Owner user not found." };
    }
  }

  if (deputyUserId) {
    const deputy = await prisma.user.findUnique({
      where: {
        id: deputyUserId
      },
      select: {
        id: true
      }
    });

    if (!deputy) {
      return { ok: false, status: 404, message: "Deputy user not found." };
    }
  }

  return {
    ok: true,
    legalDocId,
    ownerUserId,
    deputyUserId
  };
}

async function normalizeObligationForWrite(
  prisma: PrismaClient,
  input: ObligationDto
) {
  const relationValidation = await validateObligationRelations(prisma, {
    legalDocId: input.legalDocId,
    ownerUserId: input.ownerUserId,
    deputyUserId: input.deputyUserId
  });

  if (!relationValidation.ok) {
    return relationValidation;
  }

  const normalizedReminder = normalizeReminder({
    emailReminderEnabled: Boolean(input.emailReminderEnabled),
    emailReminderDaysBefore: input.emailReminderDaysBefore
  });

  return {
    ok: true as const,
    obligation: {
      ...input,
      legalDocId: relationValidation.legalDocId,
      title: input.title.trim(),
      infoTextLong: input.infoTextLong ?? "",
      level: normalizeLevel(input.level),
      criticality: normalizeCriticality(input.criticality),
      scheduleType: normalizeScheduleType(input.scheduleType),
      firstDueDate: toOptionalTrimmedString(input.firstDueDate),
      intervalUnit: normalizeIntervalUnit(input.intervalUnit),
      intervalValue: toPositiveInteger(input.intervalValue),
      ownerUserId: relationValidation.ownerUserId,
      deputyUserId: relationValidation.deputyUserId,
      origin: normalizeOrigin(input.origin),
      sourceSuggestionId: toOptionalTrimmedString(input.sourceSuggestionId),
      sourceRunId: toOptionalTrimmedString(input.sourceRunId),
      emailReminderEnabled: normalizedReminder.emailReminderEnabled,
      emailReminderDaysBefore: normalizedReminder.emailReminderDaysBefore,
      evidenceRequirements: normalizeEvidenceRequirements(input.evidenceRequirements),
      archivedAt: input.archivedAt ?? undefined,
      isArchived: Boolean(input.isArchived || input.archivedAt)
    } satisfies ObligationDto
  };
}

export function createObligationsRouter(prisma: PrismaClient) {
  const router = Router();

  router.get("/obligations", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireInternalRouteUser(req, res, prisma);
      if (!user) {
        return;
      }

      res.json(await listObligationsFromDb(prisma));
    } catch (error) {
      next(error);
    }
  });

  router.get("/obligations/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireInternalRouteUser(req, res, prisma);
      if (!user) {
        return;
      }

      const obligation = await findObligationById(prisma, req.params.id);
      if (!obligation) {
        res.status(404).json({ ok: false, message: "Obligation not found." });
        return;
      }

      res.json({
        ok: true,
        obligation: toObligationDto(obligation)
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/obligations", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireInternalRouteUser(req, res, prisma);
      if (!user) {
        return;
      }

      const requestedId = toOptionalTrimmedString(req.body?.id);
      const obligationId = requestedId ?? createServerId("ob");
      const legalDocId = ensureStringField(req.body?.legalDocId);
      const title = ensureStringField(req.body?.title);

      if (!legalDocId || !title) {
        res.status(400).json({ ok: false, message: "legalDocId and title are required." });
        return;
      }

      const existing = await findObligationById(prisma, obligationId);
      if (existing) {
        res.status(409).json({ ok: false, message: "Obligation already exists." });
        return;
      }

      const normalized = await normalizeObligationForWrite(prisma, {
        id: obligationId,
        legalDocId,
        title,
        infoTextLong: ensureStringField(req.body?.infoTextLong),
        level: normalizeLevel(req.body?.level),
        criticality: normalizeCriticality(req.body?.criticality),
        scheduleType: normalizeScheduleType(req.body?.scheduleType),
        firstDueDate: ensureStringField(req.body?.firstDueDate),
        intervalUnit: normalizeIntervalUnit(req.body?.intervalUnit),
        intervalValue: toPositiveInteger(req.body?.intervalValue),
        ownerUserId: toOptionalTrimmedString(req.body?.ownerUserId),
        deputyUserId: toOptionalTrimmedString(req.body?.deputyUserId),
        origin: normalizeOrigin(req.body?.origin) ?? "MANUAL",
        sourceSuggestionId: toOptionalTrimmedString(req.body?.sourceSuggestionId),
        sourceRunId: toOptionalTrimmedString(req.body?.sourceRunId),
        emailReminderEnabled: Boolean(req.body?.emailReminderEnabled),
        emailReminderDaysBefore: toPositiveInteger(req.body?.emailReminderDaysBefore),
        evidenceRequirements: normalizeEvidenceRequirements(req.body?.evidenceRequirements),
        archivedAt: undefined,
        isArchived: false,
        createdAt: nowStamp(),
        updatedAt: nowStamp()
      });

      if (!normalized.ok) {
        res.status(normalized.status).json({ ok: false, message: normalized.message });
        return;
      }

      const obligation = await prisma.obligation.create({
        data: toObligationCreateInput(normalized.obligation)
      });

      res.status(201).json({
        ok: true,
        obligation: toObligationDto(obligation)
      });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/obligations/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireInternalRouteUser(req, res, prisma);
      if (!user) {
        return;
      }

      const existingRecord = await findObligationById(prisma, req.params.id);
      if (!existingRecord) {
        res.status(404).json({ ok: false, message: "Obligation not found." });
        return;
      }

      const existing = toObligationDto(existingRecord);
      const merged: ObligationDto = {
        ...existing,
        legalDocId: hasOwn(req.body, "legalDocId")
          ? ensureStringField(req.body?.legalDocId)
          : existing.legalDocId,
        title: hasOwn(req.body, "title") ? ensureStringField(req.body?.title) : existing.title,
        infoTextLong: hasOwn(req.body, "infoTextLong")
          ? ensureStringField(req.body?.infoTextLong)
          : existing.infoTextLong ?? "",
        level: hasOwn(req.body, "level") ? normalizeLevel(req.body?.level) : existing.level,
        criticality: hasOwn(req.body, "criticality")
          ? normalizeCriticality(req.body?.criticality)
          : existing.criticality,
        scheduleType: hasOwn(req.body, "scheduleType")
          ? normalizeScheduleType(req.body?.scheduleType)
          : existing.scheduleType,
        firstDueDate: hasOwn(req.body, "firstDueDate")
          ? toOptionalTrimmedString(req.body?.firstDueDate)
          : existing.firstDueDate,
        intervalUnit: hasOwn(req.body, "intervalUnit")
          ? normalizeIntervalUnit(req.body?.intervalUnit)
          : existing.intervalUnit,
        intervalValue: hasOwn(req.body, "intervalValue")
          ? toPositiveInteger(req.body?.intervalValue)
          : existing.intervalValue,
        ownerUserId: hasOwn(req.body, "ownerUserId")
          ? toOptionalTrimmedString(req.body?.ownerUserId)
          : existing.ownerUserId,
        deputyUserId: hasOwn(req.body, "deputyUserId")
          ? toOptionalTrimmedString(req.body?.deputyUserId)
          : existing.deputyUserId,
        origin: hasOwn(req.body, "origin")
          ? normalizeOrigin(req.body?.origin)
          : existing.origin,
        sourceSuggestionId: hasOwn(req.body, "sourceSuggestionId")
          ? toOptionalTrimmedString(req.body?.sourceSuggestionId)
          : existing.sourceSuggestionId,
        sourceRunId: hasOwn(req.body, "sourceRunId")
          ? toOptionalTrimmedString(req.body?.sourceRunId)
          : existing.sourceRunId,
        emailReminderEnabled: hasOwn(req.body, "emailReminderEnabled")
          ? Boolean(req.body?.emailReminderEnabled)
          : existing.emailReminderEnabled,
        emailReminderDaysBefore: hasOwn(req.body, "emailReminderDaysBefore")
          ? toPositiveInteger(req.body?.emailReminderDaysBefore)
          : existing.emailReminderDaysBefore,
        evidenceRequirements: hasOwn(req.body, "evidenceRequirements")
          ? normalizeEvidenceRequirements(req.body?.evidenceRequirements)
          : existing.evidenceRequirements,
        archivedAt: hasOwn(req.body, "archivedAt")
          ? toOptionalTrimmedString(req.body?.archivedAt)
          : existing.archivedAt,
        isArchived: hasOwn(req.body, "isArchived")
          ? Boolean(req.body?.isArchived)
          : existing.isArchived,
        createdAt: existing.createdAt,
        updatedAt: nowStamp()
      };

      if (!merged.legalDocId || !merged.title) {
        res.status(400).json({ ok: false, message: "legalDocId and title are required." });
        return;
      }

      const normalized = await normalizeObligationForWrite(prisma, merged);
      if (!normalized.ok) {
        res.status(normalized.status).json({ ok: false, message: normalized.message });
        return;
      }

      const updated = await prisma.obligation.update({
        where: {
          id: existing.id
        },
        data: toObligationUpdateInput(normalized.obligation)
      });

      res.json({
        ok: true,
        obligation: toObligationDto(updated)
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/obligations/:id/archive", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireInternalRouteUser(req, res, prisma);
      if (!user) {
        return;
      }

      const existing = await findObligationById(prisma, req.params.id);
      if (!existing) {
        res.status(404).json({ ok: false, message: "Obligation not found." });
        return;
      }

      const updated = existing.isArchived
        ? existing
        : await prisma.obligation.update({
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
        obligation: toObligationDto(updated)
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/obligations/:id/restore", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireInternalRouteUser(req, res, prisma);
      if (!user) {
        return;
      }

      const existing = await findObligationById(prisma, req.params.id);
      if (!existing) {
        res.status(404).json({ ok: false, message: "Obligation not found." });
        return;
      }

      const updated = !existing.isArchived && !existing.archivedAt
        ? existing
        : await prisma.obligation.update({
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
        obligation: toObligationDto(updated)
      });
    } catch (error) {
      next(error);
    }
  });

  router.put("/admin/internal/obligations/bulk-replace", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireAdminRouteUser(req, res, prisma);
      if (!user) {
        return;
      }

      const snapshot = normalizeObligationsSnapshot(req.body);
      const normalizedObligations: ObligationDto[] = [];

      for (const obligation of snapshot) {
        const normalized = await normalizeObligationForWrite(prisma, obligation);
        if (!normalized.ok) {
          res.status(normalized.status).json({ ok: false, message: normalized.message });
          return;
        }
        normalizedObligations.push(normalized.obligation);
      }

      await replaceObligationsInDb(prisma, normalizedObligations);

      res.json({
        ok: true,
        obligations: await listObligationsFromDb(prisma)
      });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/admin/internal/obligations/bulk-delete", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireAdminRouteUser(req, res, prisma);
      if (!user) {
        return;
      }

      await prisma.obligation.deleteMany();

      res.json({
        ok: true
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/admin/internal/obligations/backfill-from-snapshot", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireAdminRouteUser(req, res, prisma);
      if (!user) {
        return;
      }

      const snapshot = await readObligationsSnapshotFromPortal(prisma);
      if (!snapshot) {
        res.status(404).json({ ok: false, message: "Snapshot obligations not found." });
        return;
      }

      const normalizedObligations: ObligationDto[] = [];
      for (const obligation of snapshot) {
        const normalized = await normalizeObligationForWrite(prisma, obligation);
        if (!normalized.ok) {
          res.status(normalized.status).json({ ok: false, message: normalized.message });
          return;
        }
        normalizedObligations.push(normalized.obligation);
      }

      await replaceObligationsInDb(prisma, normalizedObligations);

      res.json({
        ok: true,
        obligations: await listObligationsFromDb(prisma)
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/admin/internal/obligations/rollback-to-snapshot", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireAdminRouteUser(req, res, prisma);
      if (!user) {
        return;
      }

      const obligations = await listObligationsFromDb(prisma);
      await writeObligationsSnapshotToPortal(prisma, obligations, user.id);

      res.json({
        ok: true,
        obligations
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
