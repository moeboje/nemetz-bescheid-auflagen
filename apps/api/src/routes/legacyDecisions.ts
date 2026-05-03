import { randomUUID } from "node:crypto";
import {
  type LegacyDecision as DbLegacyDecision,
  type LegacyDecisionReviewStatus,
  type LegacyDecisionStatus,
  type Prisma,
  type PrismaClient
} from "@prisma/client";
import { Router, type NextFunction, type Request, type Response } from "express";
import {
  applyNoStoreHeaders,
  requireAuthenticatedRouteUser,
  requireInternalRouteUser
} from "./routeAuth.js";
import {
  getReadableProjectIdsForDomain,
  requireProjectDomainRead,
  requireProjectDomainReadPermission,
  requireProjectDomainWrite
} from "../projectAccess.js";

const LEGACY_DECISION_STATUS_VALUES = [
  "ARCHIVE_ONLY",
  "HISTORICALLY_RELEVANT",
  "PARTIALLY_RELEVANT",
  "NEEDS_REVIEW",
  "SUPERSEDED",
  "CONVERTED"
] as const satisfies readonly LegacyDecisionStatus[];

const LEGACY_DECISION_REVIEW_STATUS_VALUES = [
  "NOT_REVIEWED",
  "IN_REVIEW",
  "REVIEWED"
] as const satisfies readonly LegacyDecisionReviewStatus[];

type LegacyDecisionDto = {
  id: string;
  projectId: string;
  title: string;
  fileNumber?: string;
  authorityId?: string;
  authorityName?: string;
  issuedAt?: string;
  validFrom?: string;
  validUntil?: string;
  legacyStatus: LegacyDecisionStatus;
  reviewStatus: LegacyDecisionReviewStatus;
  relevanceNote?: string;
  reviewedAt?: string;
  reviewedByUserId?: string;
  linkedLegalDocId?: string;
  supersededByLegalDocId?: string;
  archivedAt?: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
};

type DbClient = PrismaClient | Prisma.TransactionClient;

type LegacyDecisionValidationResult =
  | {
      ok: true;
      legacyDecision: LegacyDecisionDto;
    }
  | {
      ok: false;
      status: number;
      message: string;
    };

function createServerId(prefix: string) {
  return `${prefix}-${randomUUID()}`;
}

function nowStamp() {
  return new Date().toISOString();
}

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

function normalizeLegacyDecisionStatus(value: unknown): LegacyDecisionStatus {
  if (typeof value !== "string" || !value.trim()) {
    return "ARCHIVE_ONLY";
  }

  const trimmed = value.trim().toUpperCase();
  if (LEGACY_DECISION_STATUS_VALUES.includes(trimmed as LegacyDecisionStatus)) {
    return trimmed as LegacyDecisionStatus;
  }

  throw new Error(`Invalid legacyStatus. Allowed values: ${LEGACY_DECISION_STATUS_VALUES.join(", ")}.`);
}

function normalizeLegacyDecisionReviewStatus(value: unknown): LegacyDecisionReviewStatus {
  if (typeof value !== "string" || !value.trim()) {
    return "NOT_REVIEWED";
  }

  const trimmed = value.trim().toUpperCase();
  if (LEGACY_DECISION_REVIEW_STATUS_VALUES.includes(trimmed as LegacyDecisionReviewStatus)) {
    return trimmed as LegacyDecisionReviewStatus;
  }

  throw new Error(
    `Invalid reviewStatus. Allowed values: ${LEGACY_DECISION_REVIEW_STATUS_VALUES.join(", ")}.`
  );
}

function normalizeDateOnly(value: unknown, fieldName: string): { ok: true; value?: string } | { ok: false; message: string } {
  const trimmed = toOptionalTrimmedString(value);
  if (!trimmed) {
    return { ok: true };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return { ok: false, message: `${fieldName} must be a valid YYYY-MM-DD date.` };
  }

  const parsed = new Date(`${trimmed}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== trimmed) {
    return { ok: false, message: `${fieldName} must be a valid YYYY-MM-DD date.` };
  }

  return { ok: true, value: trimmed };
}

function toLegacyDecisionDto(legacyDecision: DbLegacyDecision): LegacyDecisionDto {
  return {
    id: legacyDecision.id,
    projectId: legacyDecision.projectId,
    title: legacyDecision.title,
    fileNumber: legacyDecision.fileNumber ?? undefined,
    authorityId: legacyDecision.authorityId ?? undefined,
    authorityName: legacyDecision.authorityName ?? undefined,
    issuedAt: legacyDecision.issuedAt ?? undefined,
    validFrom: legacyDecision.validFrom ?? undefined,
    validUntil: legacyDecision.validUntil ?? undefined,
    legacyStatus: legacyDecision.legacyStatus,
    reviewStatus: legacyDecision.reviewStatus,
    relevanceNote: legacyDecision.relevanceNote ?? undefined,
    reviewedAt: legacyDecision.reviewedAt?.toISOString(),
    reviewedByUserId: legacyDecision.reviewedByUserId ?? undefined,
    linkedLegalDocId: legacyDecision.linkedLegalDocId ?? undefined,
    supersededByLegalDocId: legacyDecision.supersededByLegalDocId ?? undefined,
    archivedAt: legacyDecision.archivedAt?.toISOString(),
    isArchived: legacyDecision.isArchived,
    createdAt: legacyDecision.createdAt.toISOString(),
    updatedAt: legacyDecision.updatedAt.toISOString()
  };
}

function toLegacyDecisionCreateInput(input: LegacyDecisionDto): Prisma.LegacyDecisionUncheckedCreateInput {
  return {
    id: input.id,
    projectId: input.projectId,
    title: input.title,
    fileNumber: input.fileNumber ?? null,
    authorityId: input.authorityId ?? null,
    authorityName: input.authorityName ?? null,
    issuedAt: input.issuedAt ?? null,
    validFrom: input.validFrom ?? null,
    validUntil: input.validUntil ?? null,
    legacyStatus: input.legacyStatus,
    reviewStatus: input.reviewStatus,
    relevanceNote: input.relevanceNote ?? null,
    reviewedAt: input.reviewedAt ? new Date(input.reviewedAt) : null,
    reviewedByUserId: input.reviewedByUserId ?? null,
    linkedLegalDocId: input.linkedLegalDocId ?? null,
    supersededByLegalDocId: input.supersededByLegalDocId ?? null,
    archivedAt: input.archivedAt ? new Date(input.archivedAt) : null,
    isArchived: input.isArchived,
    createdAt: new Date(input.createdAt),
    updatedAt: new Date(input.updatedAt)
  };
}

function toLegacyDecisionUpdateInput(input: LegacyDecisionDto): Prisma.LegacyDecisionUncheckedUpdateInput {
  return {
    projectId: input.projectId,
    title: input.title,
    fileNumber: input.fileNumber ?? null,
    authorityId: input.authorityId ?? null,
    authorityName: input.authorityName ?? null,
    issuedAt: input.issuedAt ?? null,
    validFrom: input.validFrom ?? null,
    validUntil: input.validUntil ?? null,
    legacyStatus: input.legacyStatus,
    reviewStatus: input.reviewStatus,
    relevanceNote: input.relevanceNote ?? null,
    reviewedAt: input.reviewedAt ? new Date(input.reviewedAt) : null,
    reviewedByUserId: input.reviewedByUserId ?? null,
    linkedLegalDocId: input.linkedLegalDocId ?? null,
    supersededByLegalDocId: input.supersededByLegalDocId ?? null,
    archivedAt: input.archivedAt ? new Date(input.archivedAt) : null,
    isArchived: input.isArchived,
    updatedAt: new Date(input.updatedAt)
  };
}

async function listLegacyDecisions(
  db: DbClient,
  where?: Prisma.LegacyDecisionWhereInput
) {
  const rows = await db.legacyDecision.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }]
  });

  return rows.map((row) => toLegacyDecisionDto(row));
}

async function findLegacyDecisionById(db: DbClient, id: string) {
  return db.legacyDecision.findUnique({
    where: {
      id
    }
  });
}

async function normalizeLegacyDecisionForWrite(
  prisma: PrismaClient,
  input: LegacyDecisionDto
): Promise<LegacyDecisionValidationResult> {
  const title = input.title.trim();
  if (!title) {
    return { ok: false, status: 400, message: "title is required." };
  }

  const project = await prisma.project.findUnique({
    where: { id: input.projectId },
    select: { id: true }
  });
  if (!project) {
    return { ok: false, status: 404, message: "Project not found." };
  }

  if (input.authorityId) {
    const authority = await prisma.authority.findUnique({
      where: { id: input.authorityId },
      select: { id: true }
    });
    if (!authority) {
      return { ok: false, status: 404, message: "Authority not found." };
    }
  }

  for (const [legalDocId, label] of [
    [input.linkedLegalDocId, "linkedLegalDocId"],
    [input.supersededByLegalDocId, "supersededByLegalDocId"]
  ] as const) {
    if (!legalDocId) {
      continue;
    }

    const legalDoc = await prisma.legalDocument.findUnique({
      where: { id: legalDocId },
      select: { id: true, projectId: true }
    });
    if (!legalDoc) {
      return { ok: false, status: 404, message: `${label} not found.` };
    }
    if (legalDoc.projectId !== input.projectId) {
      return { ok: false, status: 400, message: `${label} must belong to the same project.` };
    }
  }

  const issuedAt = normalizeDateOnly(input.issuedAt, "issuedAt");
  const validFrom = normalizeDateOnly(input.validFrom, "validFrom");
  const validUntil = normalizeDateOnly(input.validUntil, "validUntil");
  for (const dateValidation of [issuedAt, validFrom, validUntil]) {
    if (!dateValidation.ok) {
      return { ok: false, status: 400, message: dateValidation.message };
    }
  }
  const issuedAtValue = issuedAt.ok ? issuedAt.value : undefined;
  const validFromValue = validFrom.ok ? validFrom.value : undefined;
  const validUntilValue = validUntil.ok ? validUntil.value : undefined;
  if (validFromValue && validUntilValue && validUntilValue < validFromValue) {
    return { ok: false, status: 400, message: "validUntil must not be before validFrom." };
  }

  return {
    ok: true,
    legacyDecision: {
      ...input,
      title,
      fileNumber: input.fileNumber,
      authorityId: input.authorityId,
      authorityName: input.authorityName,
      issuedAt: issuedAtValue,
      validFrom: validFromValue,
      validUntil: validUntilValue,
      relevanceNote: input.relevanceNote,
      archivedAt: input.archivedAt,
      isArchived: Boolean(input.isArchived || input.archivedAt)
    }
  };
}

export function createLegacyDecisionsRouter(prisma: PrismaClient) {
  const router = Router();

  router.get("/legacy-decisions", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireAuthenticatedRouteUser(req, res, prisma);
      if (!user) {
        return;
      }

      const requestedProjectId = toOptionalTrimmedString(req.query.projectId);
      const readableProjectIds = await getReadableProjectIdsForDomain(prisma, user, "legacyDecisions");
      const projectIds =
        readableProjectIds === null
          ? requestedProjectId
            ? [requestedProjectId]
            : null
          : requestedProjectId
          ? readableProjectIds.includes(requestedProjectId)
            ? [requestedProjectId]
            : []
          : readableProjectIds;

      const legacyDecisions =
        projectIds === null
          ? await listLegacyDecisions(prisma)
          : projectIds.length > 0
          ? await listLegacyDecisions(prisma, {
              projectId: {
                in: projectIds
              }
            })
          : [];

      res.json(legacyDecisions);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Invalid ")) {
        res.status(400).json({ ok: false, message: error.message });
        return;
      }
      next(error);
    }
  });

  router.get("/projects/:projectId/legacy-decisions", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireAuthenticatedRouteUser(req, res, prisma);
      if (!user) {
        return;
      }

      if (
        !(await requireProjectDomainRead({
          db: prisma,
          user,
          projectId: req.params.projectId,
          domain: "legacyDecisions",
          res
        }))
      ) {
        return;
      }

      res.json(
        await listLegacyDecisions(prisma, {
          projectId: req.params.projectId
        })
      );
    } catch (error) {
      next(error);
    }
  });

  router.get("/legacy-decisions/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireAuthenticatedRouteUser(req, res, prisma);
      if (!user) {
        return;
      }

      if (!requireProjectDomainReadPermission({ user, domain: "legacyDecisions", res })) {
        return;
      }

      const legacyDecision = await findLegacyDecisionById(prisma, req.params.id);
      if (!legacyDecision) {
        res.status(404).json({ ok: false, message: "Legacy decision not found." });
        return;
      }
      if (
        !(await requireProjectDomainRead({
          db: prisma,
          user,
          projectId: legacyDecision.projectId,
          domain: "legacyDecisions",
          res,
          notFoundMessage: "Legacy decision not found."
        }))
      ) {
        return;
      }

      res.json({
        ok: true,
        legacyDecision: toLegacyDecisionDto(legacyDecision)
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/projects/:projectId/legacy-decisions", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireAuthenticatedRouteUser(req, res, prisma);
      if (!user) {
        return;
      }
      if (String(user.type).toUpperCase() === "EXTERNAL") {
        res.status(403).json({ ok: false, message: "Forbidden." });
        return;
      }

      const requestedId = toOptionalTrimmedString(req.body?.id);
      const legacyDecisionId = requestedId ?? createServerId("legacy");
      const title = ensureStringField(req.body?.title);
      if (!title) {
        res.status(400).json({ ok: false, message: "title is required." });
        return;
      }

      const existing = await findLegacyDecisionById(prisma, legacyDecisionId);
      if (existing) {
        res.status(409).json({ ok: false, message: "Legacy decision already exists." });
        return;
      }

      if (
        !(await requireProjectDomainWrite({
          db: prisma,
          user,
          projectId: req.params.projectId,
          domain: "legacyDecisions",
          permission: "legalDocs.create",
          res
        }))
      ) {
        return;
      }

      const timestamp = nowStamp();
      const normalized = await normalizeLegacyDecisionForWrite(prisma, {
        id: legacyDecisionId,
        projectId: req.params.projectId,
        title,
        fileNumber: toOptionalTrimmedString(req.body?.fileNumber),
        authorityId: toOptionalTrimmedString(req.body?.authorityId),
        authorityName: toOptionalTrimmedString(req.body?.authorityName),
        issuedAt: toOptionalTrimmedString(req.body?.issuedAt),
        validFrom: toOptionalTrimmedString(req.body?.validFrom),
        validUntil: toOptionalTrimmedString(req.body?.validUntil),
        legacyStatus: normalizeLegacyDecisionStatus(req.body?.legacyStatus),
        reviewStatus: normalizeLegacyDecisionReviewStatus(req.body?.reviewStatus),
        relevanceNote: toOptionalTrimmedString(req.body?.relevanceNote),
        reviewedAt: undefined,
        reviewedByUserId: undefined,
        linkedLegalDocId: toOptionalTrimmedString(req.body?.linkedLegalDocId),
        supersededByLegalDocId: toOptionalTrimmedString(req.body?.supersededByLegalDocId),
        archivedAt: undefined,
        isArchived: false,
        createdAt: timestamp,
        updatedAt: timestamp
      });

      if (!normalized.ok) {
        res.status(normalized.status).json({ ok: false, message: normalized.message });
        return;
      }

      const legacyDecision = await prisma.legacyDecision.create({
        data: toLegacyDecisionCreateInput(normalized.legacyDecision)
      });

      res.status(201).json({
        ok: true,
        legacyDecision: toLegacyDecisionDto(legacyDecision)
      });
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Invalid ")) {
        res.status(400).json({ ok: false, message: error.message });
        return;
      }
      next(error);
    }
  });

  router.patch("/legacy-decisions/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireInternalRouteUser(req, res, prisma);
      if (!user) {
        return;
      }

      const existingRecord = await findLegacyDecisionById(prisma, req.params.id);
      if (!existingRecord) {
        res.status(404).json({ ok: false, message: "Legacy decision not found." });
        return;
      }
      if (
        !(await requireProjectDomainWrite({
          db: prisma,
          user,
          projectId: existingRecord.projectId,
          domain: "legacyDecisions",
          permission: "legalDocs.edit",
          res,
          notFoundMessage: "Legacy decision not found."
        }))
      ) {
        return;
      }

      const existing = toLegacyDecisionDto(existingRecord);
      const merged: LegacyDecisionDto = {
        ...existing,
        projectId: hasOwn(req.body, "projectId") ? ensureStringField(req.body?.projectId) : existing.projectId,
        title: hasOwn(req.body, "title") ? ensureStringField(req.body?.title) : existing.title,
        fileNumber: hasOwn(req.body, "fileNumber")
          ? toOptionalTrimmedString(req.body?.fileNumber)
          : existing.fileNumber,
        authorityId: hasOwn(req.body, "authorityId")
          ? toOptionalTrimmedString(req.body?.authorityId)
          : existing.authorityId,
        authorityName: hasOwn(req.body, "authorityName")
          ? toOptionalTrimmedString(req.body?.authorityName)
          : existing.authorityName,
        issuedAt: hasOwn(req.body, "issuedAt") ? toOptionalTrimmedString(req.body?.issuedAt) : existing.issuedAt,
        validFrom: hasOwn(req.body, "validFrom") ? toOptionalTrimmedString(req.body?.validFrom) : existing.validFrom,
        validUntil: hasOwn(req.body, "validUntil") ? toOptionalTrimmedString(req.body?.validUntil) : existing.validUntil,
        legacyStatus: hasOwn(req.body, "legacyStatus")
          ? normalizeLegacyDecisionStatus(req.body?.legacyStatus)
          : existing.legacyStatus,
        reviewStatus: hasOwn(req.body, "reviewStatus")
          ? normalizeLegacyDecisionReviewStatus(req.body?.reviewStatus)
          : existing.reviewStatus,
        relevanceNote: hasOwn(req.body, "relevanceNote")
          ? toOptionalTrimmedString(req.body?.relevanceNote)
          : existing.relevanceNote,
        reviewedAt: hasOwn(req.body, "reviewedAt")
          ? toOptionalTrimmedString(req.body?.reviewedAt)
          : existing.reviewedAt,
        reviewedByUserId: hasOwn(req.body, "reviewedByUserId")
          ? toOptionalTrimmedString(req.body?.reviewedByUserId)
          : existing.reviewedByUserId,
        linkedLegalDocId: hasOwn(req.body, "linkedLegalDocId")
          ? toOptionalTrimmedString(req.body?.linkedLegalDocId)
          : existing.linkedLegalDocId,
        supersededByLegalDocId: hasOwn(req.body, "supersededByLegalDocId")
          ? toOptionalTrimmedString(req.body?.supersededByLegalDocId)
          : existing.supersededByLegalDocId,
        archivedAt: hasOwn(req.body, "archivedAt")
          ? toOptionalTrimmedString(req.body?.archivedAt)
          : existing.archivedAt,
        isArchived: hasOwn(req.body, "isArchived") ? Boolean(req.body?.isArchived) : existing.isArchived,
        createdAt: existing.createdAt,
        updatedAt: nowStamp()
      };

      if (
        merged.projectId !== existingRecord.projectId &&
        !(await requireProjectDomainWrite({
          db: prisma,
          user,
          projectId: merged.projectId,
          domain: "legacyDecisions",
          permission: "legalDocs.edit",
          res
        }))
      ) {
        return;
      }

      const normalized = await normalizeLegacyDecisionForWrite(prisma, merged);
      if (!normalized.ok) {
        res.status(normalized.status).json({ ok: false, message: normalized.message });
        return;
      }

      const updated = await prisma.legacyDecision.update({
        where: {
          id: existing.id
        },
        data: toLegacyDecisionUpdateInput(normalized.legacyDecision)
      });

      res.json({
        ok: true,
        legacyDecision: toLegacyDecisionDto(updated)
      });
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Invalid ")) {
        res.status(400).json({ ok: false, message: error.message });
        return;
      }
      next(error);
    }
  });

  router.post("/legacy-decisions/:id/archive", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireInternalRouteUser(req, res, prisma);
      if (!user) {
        return;
      }

      const existing = await findLegacyDecisionById(prisma, req.params.id);
      if (!existing) {
        res.status(404).json({ ok: false, message: "Legacy decision not found." });
        return;
      }
      if (
        !(await requireProjectDomainWrite({
          db: prisma,
          user,
          projectId: existing.projectId,
          domain: "legacyDecisions",
          permission: "legalDocs.archive",
          res,
          notFoundMessage: "Legacy decision not found."
        }))
      ) {
        return;
      }

      const updated = existing.isArchived
        ? existing
        : await prisma.legacyDecision.update({
            where: { id: existing.id },
            data: {
              archivedAt: new Date(),
              isArchived: true
            }
          });

      res.json({
        ok: true,
        legacyDecision: toLegacyDecisionDto(updated)
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/legacy-decisions/:id/restore", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireInternalRouteUser(req, res, prisma);
      if (!user) {
        return;
      }

      const existing = await findLegacyDecisionById(prisma, req.params.id);
      if (!existing) {
        res.status(404).json({ ok: false, message: "Legacy decision not found." });
        return;
      }
      if (
        !(await requireProjectDomainWrite({
          db: prisma,
          user,
          projectId: existing.projectId,
          domain: "legacyDecisions",
          permission: "legalDocs.archive",
          res,
          notFoundMessage: "Legacy decision not found."
        }))
      ) {
        return;
      }

      const updated = !existing.isArchived && !existing.archivedAt
        ? existing
        : await prisma.legacyDecision.update({
            where: { id: existing.id },
            data: {
              archivedAt: null,
              isArchived: false
            }
          });

      res.json({
        ok: true,
        legacyDecision: toLegacyDecisionDto(updated)
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
