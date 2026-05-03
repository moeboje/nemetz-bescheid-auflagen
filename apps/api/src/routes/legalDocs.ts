import { randomUUID } from "node:crypto";
import {
  Prisma,
  type LegalDocument as DbLegalDocument,
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
import {
  getProjectWriteAccessMap,
  getReadableProjectIdsForDomain,
  listWritableProjectOptionsForDomain,
  requireProjectDomainRead,
  requireProjectDomainReadPermission,
  requireProjectDomainWrite
} from "../projectAccess.js";

type LegalDocAttachmentDto = {
  id: string;
  filename: string;
  sizeKb: number;
  mime?: string;
  addedAt: string;
  addedByLabel?: string;
};

type LegalDocScopeOverrideDto = {
  companyId: string;
  siteId?: string;
  facilityId?: string;
};

type LegalDocAiExtractionDto = Record<string, unknown>;

type LegalDocDto = {
  id: string;
  projectId: string;
  type: string;
  title: string;
  shortDescription?: string;
  reference?: string;
  issuedAt?: string;
  authorityId?: string;
  authorityContactId?: string;
  attachments: LegalDocAttachmentDto[];
  aiExtraction?: LegalDocAiExtractionDto;
  scopeOverride?: LegalDocScopeOverrideDto;
  projectTitle?: string;
  currentUserCanWriteProject?: boolean;
  archivedAt?: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
};

type DbClient = PrismaClient | Prisma.TransactionClient;

type LegalDocRelationValidationResult =
  | {
      ok: true;
      projectId: string;
      authorityId?: string;
      authorityContactId?: string;
      scopeOverride?: LegalDocScopeOverrideDto;
    }
  | {
      ok: false;
      status: number;
      message: string;
    };

const LEGAL_DOC_DOWNSTREAM_CONFLICT_MESSAGE =
  "Legal documents cannot be replaced while obligations or linked deadlines exist. Import legal documents together with obligations and deadlines or clear downstream data first.";
const LEGAL_DOC_BULK_SERIALIZATION_CONFLICT_MESSAGE =
  "Legal documents changed while the bulk operation was running. Retry the import after reloading current data.";

class LegalDocBulkMutationConflictError extends Error {
  status = 409;

  constructor(message: string) {
    super(message);
    this.name = "LegalDocBulkMutationConflictError";
  }
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
  return JSON.parse(JSON.stringify(value ?? [])) as Prisma.InputJsonValue;
}

function normalizeAttachment(
  attachment: Partial<LegalDocAttachmentDto>,
  fallbackId: string
): LegalDocAttachmentDto {
  return {
    id: typeof attachment.id === "string" && attachment.id.trim() ? attachment.id : fallbackId,
    filename: attachment.filename ?? "",
    sizeKb: Number.isFinite(attachment.sizeKb) ? Number(attachment.sizeKb) : 0,
    mime: attachment.mime ?? undefined,
    addedAt: attachment.addedAt ?? nowStamp().slice(0, 10),
    addedByLabel: attachment.addedByLabel ?? undefined
  };
}

function normalizeAiExtraction(value: unknown): LegalDocAiExtractionDto | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return JSON.parse(JSON.stringify(value)) as LegalDocAiExtractionDto;
}

function normalizeScopeOverride(value: unknown): LegalDocScopeOverrideDto | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const row = value as Partial<LegalDocScopeOverrideDto>;
  if (typeof row.companyId !== "string" || !row.companyId.trim()) {
    return undefined;
  }

  return {
    companyId: row.companyId.trim(),
    siteId: toOptionalTrimmedString(row.siteId),
    facilityId: toOptionalTrimmedString(row.facilityId)
  };
}

function normalizeLegalDocDto(value: unknown, index: number): LegalDocDto | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const row = value as Partial<LegalDocDto>;
  if (
    typeof row.id !== "string" ||
    !row.id.trim() ||
    typeof row.projectId !== "string" ||
    !row.projectId.trim() ||
    typeof row.type !== "string" ||
    !row.type.trim() ||
    typeof row.title !== "string" ||
    !row.title.trim()
  ) {
    return null;
  }

  const createdAt =
    typeof row.createdAt === "string" && row.createdAt.trim() ? row.createdAt : nowStamp();
  const updatedAt =
    typeof row.updatedAt === "string" && row.updatedAt.trim() ? row.updatedAt : createdAt;

  const attachments = Array.isArray(row.attachments)
    ? row.attachments.map((attachment, attachmentIndex) =>
        normalizeAttachment(
          attachment as Partial<LegalDocAttachmentDto>,
          `lda-${row.id}-${index}-${attachmentIndex}`
        )
      )
    : [];

  return {
    id: row.id,
    projectId: row.projectId,
    type: row.type,
    title: row.title,
    shortDescription: row.shortDescription ?? "",
    reference: row.reference ?? "",
    issuedAt: row.issuedAt ?? "",
    authorityId: toOptionalTrimmedString(row.authorityId),
    authorityContactId: toOptionalTrimmedString(row.authorityContactId),
    attachments,
    aiExtraction: normalizeAiExtraction(row.aiExtraction),
    scopeOverride: normalizeScopeOverride(row.scopeOverride),
    archivedAt: row.archivedAt ?? undefined,
    isArchived: Boolean(row.isArchived || row.archivedAt),
    createdAt,
    updatedAt
  };
}

function normalizeLegalDocsSnapshot(value: unknown): LegalDocDto[] {
  const source =
    Array.isArray(value)
      ? value
      : value &&
          typeof value === "object" &&
          !Array.isArray(value) &&
          Array.isArray((value as { legalDocs?: unknown }).legalDocs)
      ? (value as { legalDocs: unknown[] }).legalDocs
      : [];

  return source
    .map((legalDoc, index) => normalizeLegalDocDto(legalDoc, index))
    .filter((legalDoc): legalDoc is LegalDocDto => Boolean(legalDoc));
}

function toLegalDocDto(legalDoc: DbLegalDocument): LegalDocDto {
  const rawAttachments = Array.isArray(legalDoc.attachments)
    ? (legalDoc.attachments as unknown[])
    : [];

  const attachments = rawAttachments.map((attachment, index) =>
        normalizeAttachment(
          attachment as Partial<LegalDocAttachmentDto>,
          `lda-${legalDoc.id}-${index}`
        )
      );

  return {
    id: legalDoc.id,
    projectId: legalDoc.projectId,
    type: legalDoc.type,
    title: legalDoc.title,
    shortDescription: legalDoc.shortDescription ?? "",
    reference: legalDoc.reference ?? "",
    issuedAt: legalDoc.issuedAt ?? "",
    authorityId: legalDoc.authorityId ?? undefined,
    authorityContactId: legalDoc.authorityContactId ?? undefined,
    attachments,
    aiExtraction: normalizeAiExtraction(legalDoc.aiExtraction),
    scopeOverride: normalizeScopeOverride(legalDoc.scopeOverride),
    archivedAt: legalDoc.archivedAt ? legalDoc.archivedAt.toISOString() : undefined,
    isArchived: legalDoc.isArchived,
    createdAt: legalDoc.createdAt.toISOString(),
    updatedAt: legalDoc.updatedAt.toISOString()
  };
}

function toLegalDocCreateInput(input: LegalDocDto): Prisma.LegalDocumentUncheckedCreateInput {
  return {
    id: input.id,
    projectId: input.projectId,
    type: input.type,
    title: input.title,
    shortDescription: input.shortDescription || null,
    reference: input.reference || null,
    issuedAt: input.issuedAt || null,
    authorityId: input.authorityId ?? null,
    authorityContactId: input.authorityContactId ?? null,
    attachments: toJsonInput(input.attachments),
    aiExtraction: input.aiExtraction ? toJsonInput(input.aiExtraction) : Prisma.JsonNull,
    scopeOverride: input.scopeOverride ? toJsonInput(input.scopeOverride) : Prisma.JsonNull,
    archivedAt: input.archivedAt ? new Date(input.archivedAt) : null,
    isArchived: Boolean(input.isArchived || input.archivedAt),
    createdAt: toDateValue(input.createdAt),
    updatedAt: toDateValue(input.updatedAt)
  };
}

function toLegalDocUpdateInput(input: LegalDocDto): Prisma.LegalDocumentUncheckedUpdateInput {
  return {
    projectId: input.projectId,
    type: input.type,
    title: input.title,
    shortDescription: input.shortDescription || null,
    reference: input.reference || null,
    issuedAt: input.issuedAt || null,
    authorityId: input.authorityId ?? null,
    authorityContactId: input.authorityContactId ?? null,
    attachments: toJsonInput(input.attachments),
    aiExtraction: input.aiExtraction ? toJsonInput(input.aiExtraction) : Prisma.JsonNull,
    scopeOverride: input.scopeOverride ? toJsonInput(input.scopeOverride) : Prisma.JsonNull,
    archivedAt: input.archivedAt ? new Date(input.archivedAt) : null,
    isArchived: Boolean(input.isArchived || input.archivedAt),
    updatedAt: toDateValue(input.updatedAt)
  };
}

async function listLegalDocsFromDb(db: DbClient, where?: Prisma.LegalDocumentWhereInput): Promise<LegalDocDto[]> {
  const legalDocs = await db.legalDocument.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }]
  });

  return legalDocs.map((legalDoc) => toLegalDocDto(legalDoc));
}

async function enrichLegalDocDtosWithProjectAccess(
  db: DbClient,
  user: RouteUser,
  legalDocs: LegalDocDto[]
): Promise<LegalDocDto[]> {
  if (legalDocs.length === 0) {
    return legalDocs;
  }

  const projectIds = Array.from(new Set(legalDocs.map((legalDoc) => legalDoc.projectId)));
  const [projects, writeAccessMap] = await Promise.all([
    db.project.findMany({
      where: {
        id: {
          in: projectIds
        }
      },
      select: {
        id: true,
        title: true
      }
    }),
    getProjectWriteAccessMap(db, user, projectIds)
  ]);
  const projectTitleById = new Map(projects.map((project) => [project.id, project.title] as const));

  return legalDocs.map((legalDoc) => ({
    ...legalDoc,
    projectTitle: projectTitleById.get(legalDoc.projectId),
    currentUserCanWriteProject: Boolean(writeAccessMap.get(legalDoc.projectId))
  }));
}

async function toLegalDocDtoForUser(
  db: DbClient,
  user: RouteUser,
  legalDoc: DbLegalDocument
) {
  const [dto] = await enrichLegalDocDtosWithProjectAccess(db, user, [toLegalDocDto(legalDoc)]);
  return dto;
}

async function findLegalDocById(db: DbClient, id: string) {
  return db.legalDocument.findUnique({
    where: {
      id
    }
  });
}

async function lockLegalDocParentsForBulkMutation(tx: Prisma.TransactionClient) {
  await tx.$executeRaw(Prisma.sql`LOCK TABLE "LegalDocument" IN SHARE ROW EXCLUSIVE MODE`);
  await tx.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`SELECT "id" FROM "LegalDocument" ORDER BY "id" FOR UPDATE`
  );
}

async function getLegalDocsBulkMutationConflict(db: DbClient) {
  const obligationCount = await db.obligation.count();
  const linkedDeadlineCount = await db.deadline.count({
    where: {
      legalDocId: {
        not: null
      }
    }
  });

  return obligationCount > 0 || linkedDeadlineCount > 0
    ? LEGAL_DOC_DOWNSTREAM_CONFLICT_MESSAGE
    : null;
}

function isSerializationConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034";
}

function sendLegalDocBulkMutationConflict(res: Response, error: unknown) {
  if (!(error instanceof LegalDocBulkMutationConflictError)) {
    return false;
  }

  res.status(error.status).json({ ok: false, message: error.message });
  return true;
}

async function runLegalDocsBulkMutation(
  prisma: PrismaClient,
  mutate: (tx: Prisma.TransactionClient) => Promise<void>
) {
  try {
    await prisma.$transaction(
      async (tx) => {
        await lockLegalDocParentsForBulkMutation(tx);
        const mutationConflict = await getLegalDocsBulkMutationConflict(tx);
        if (mutationConflict) {
          throw new LegalDocBulkMutationConflictError(mutationConflict);
        }

        await mutate(tx);
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable
      }
    );
  } catch (error) {
    if (isSerializationConflict(error)) {
      throw new LegalDocBulkMutationConflictError(LEGAL_DOC_BULK_SERIALIZATION_CONFLICT_MESSAGE);
    }
    throw error;
  }
}

async function replaceLegalDocsInDb(prisma: PrismaClient, legalDocs: LegalDocDto[]) {
  await runLegalDocsBulkMutation(prisma, async (tx) => {
    await tx.legalDocument.deleteMany();

    for (const legalDoc of legalDocs) {
      await tx.legalDocument.create({
        data: toLegalDocCreateInput(legalDoc)
      });
    }
  });
}

async function deleteLegalDocsInDb(prisma: PrismaClient) {
  await runLegalDocsBulkMutation(prisma, async (tx) => {
    await tx.legalDocument.deleteMany();
  });
}

async function readLegalDocsSnapshotFromPortal(prisma: PrismaClient) {
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
  if (!hasOwn(payload, "legalDocs")) {
    return null;
  }

  return normalizeLegalDocsSnapshot(payload.legalDocs);
}

async function writeLegalDocsSnapshotToPortal(
  prisma: PrismaClient,
  legalDocs: LegalDocDto[],
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

  payload.legalDocs = legalDocs as unknown as Prisma.JsonArray;

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

async function validateScopeOverride(
  prisma: PrismaClient,
  scopeOverride: LegalDocScopeOverrideDto | undefined
): Promise<LegalDocRelationValidationResult> {
  if (!scopeOverride) {
    return { ok: true, projectId: "" };
  }

  const company = await prisma.company.findUnique({
    where: {
      id: scopeOverride.companyId
    },
    select: {
      id: true
    }
  });
  if (!company) {
    return { ok: false, status: 404, message: "Scope company not found." };
  }

  let siteId = scopeOverride.siteId;
  let facilityId = scopeOverride.facilityId;

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
      return { ok: false, status: 404, message: "Scope facility not found." };
    }
    if (facility.companyId !== scopeOverride.companyId) {
      return { ok: false, status: 400, message: "scopeOverride.facilityId does not belong to scopeOverride.companyId." };
    }

    siteId = siteId ?? facility.siteId;
    if (siteId && facility.siteId !== siteId) {
      return { ok: false, status: 400, message: "scopeOverride.facilityId does not belong to scopeOverride.siteId." };
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
      return { ok: false, status: 404, message: "Scope site not found." };
    }
    if (site.companyId !== scopeOverride.companyId) {
      return { ok: false, status: 400, message: "scopeOverride.siteId does not belong to scopeOverride.companyId." };
    }
  }

  return {
    ok: true,
    projectId: "",
    scopeOverride: {
      companyId: scopeOverride.companyId,
      siteId,
      facilityId
    }
  };
}

async function validateLegalDocRelations(
  prisma: PrismaClient,
  input: {
    projectId: string;
    authorityId?: string;
    authorityContactId?: string;
    scopeOverride?: LegalDocScopeOverrideDto;
  }
): Promise<LegalDocRelationValidationResult> {
  const projectId = ensureStringField(input.projectId);
  if (!projectId) {
    return { ok: false, status: 400, message: "projectId is required." };
  }

  const project = await prisma.project.findUnique({
    where: {
      id: projectId
    },
    select: {
      id: true
    }
  });
  if (!project) {
    return { ok: false, status: 404, message: "Project not found." };
  }

  let authorityId = toOptionalTrimmedString(input.authorityId);
  const authorityContactId = toOptionalTrimmedString(input.authorityContactId);

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
    if (authorityId && authorityId !== contact.authorityId) {
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

  const scopeOverrideValidation = await validateScopeOverride(prisma, input.scopeOverride);
  if (!scopeOverrideValidation.ok) {
    return scopeOverrideValidation;
  }

  return {
    ok: true,
    projectId,
    authorityId,
    authorityContactId,
    scopeOverride: scopeOverrideValidation.scopeOverride
  };
}

async function normalizeLegalDocForWrite(
  prisma: PrismaClient,
  input: LegalDocDto
) {
  const relationValidation = await validateLegalDocRelations(prisma, {
    projectId: input.projectId,
    authorityId: input.authorityId,
    authorityContactId: input.authorityContactId,
    scopeOverride: input.scopeOverride
  });

  if (!relationValidation.ok) {
    return relationValidation;
  }

  return {
    ok: true as const,
    legalDoc: {
      ...input,
      projectId: relationValidation.projectId,
      authorityId: relationValidation.authorityId,
      authorityContactId: relationValidation.authorityContactId,
      shortDescription: input.shortDescription ?? "",
      reference: input.reference ?? "",
      issuedAt: input.issuedAt ?? "",
      attachments: input.attachments,
      aiExtraction: input.aiExtraction,
      scopeOverride: relationValidation.scopeOverride,
      archivedAt: input.archivedAt ?? undefined,
      isArchived: Boolean(input.isArchived || input.archivedAt)
    } satisfies LegalDocDto
  };
}

export function createLegalDocsRouter(prisma: PrismaClient) {
  const router = Router();

  router.get("/legal-docs", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireAuthenticatedRouteUser(req, res, prisma);
      if (!user) {
        return;
      }

      const readableProjectIds = await getReadableProjectIdsForDomain(prisma, user, "legalDocs");
      const legalDocs =
        readableProjectIds === null
          ? await listLegalDocsFromDb(prisma)
          : readableProjectIds.length > 0
          ? await listLegalDocsFromDb(prisma, {
              projectId: {
                in: readableProjectIds
              }
          })
          : [];

      res.json(await enrichLegalDocDtosWithProjectAccess(prisma, user, legalDocs));
    } catch (error) {
      next(error);
    }
  });

  router.get("/legal-docs/project-options", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireAuthenticatedRouteUser(req, res, prisma);
      if (!user) {
        return;
      }

      const projects = await listWritableProjectOptionsForDomain({
        db: prisma,
        user,
        domain: "legalDocs",
        permission: "legalDocs.create"
      });

      res.json(projects);
    } catch (error) {
      next(error);
    }
  });

  router.get("/legal-docs/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireAuthenticatedRouteUser(req, res, prisma);
      if (!user) {
        return;
      }

      if (!requireProjectDomainReadPermission({ user, domain: "legalDocs", res })) {
        return;
      }

      const legalDoc = await findLegalDocById(prisma, req.params.id);
      if (!legalDoc) {
        res.status(404).json({ ok: false, message: "Legal document not found." });
        return;
      }
      if (
        !(await requireProjectDomainRead({
          db: prisma,
          user,
          projectId: legalDoc.projectId,
          domain: "legalDocs",
          res,
          notFoundMessage: "Legal document not found."
        }))
      ) {
        return;
      }

      res.json({
        ok: true,
        legalDoc: await toLegalDocDtoForUser(prisma, user, legalDoc)
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/legal-docs", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireInternalRouteUser(req, res, prisma);
      if (!user) {
        return;
      }

      const requestedId = toOptionalTrimmedString(req.body?.id);
      const legalDocId = requestedId ?? createServerId("ld");
      const projectId = ensureStringField(req.body?.projectId);
      const type = ensureStringField(req.body?.type);
      const title = ensureStringField(req.body?.title);

      if (!projectId || !type || !title) {
        res.status(400).json({ ok: false, message: "projectId, type and title are required." });
        return;
      }

      const existing = await findLegalDocById(prisma, legalDocId);
      if (existing) {
        res.status(409).json({ ok: false, message: "Legal document already exists." });
        return;
      }

      const normalized = await normalizeLegalDocForWrite(prisma, {
        id: legalDocId,
        projectId,
        type,
        title,
        shortDescription: ensureStringField(req.body?.shortDescription),
        reference: ensureStringField(req.body?.reference),
        issuedAt: ensureStringField(req.body?.issuedAt),
        authorityId: toOptionalTrimmedString(req.body?.authorityId),
        authorityContactId: toOptionalTrimmedString(req.body?.authorityContactId),
        attachments: Array.isArray(req.body?.attachments)
          ? req.body.attachments.map((attachment: unknown, index: number) =>
              normalizeAttachment(
                attachment as Partial<LegalDocAttachmentDto>,
                `lda-${legalDocId}-${index}`
              )
            )
          : [],
        aiExtraction: normalizeAiExtraction(req.body?.aiExtraction),
        scopeOverride: normalizeScopeOverride(req.body?.scopeOverride),
        archivedAt: undefined,
        isArchived: false,
        createdAt: nowStamp(),
        updatedAt: nowStamp()
      });

      if (!normalized.ok) {
        res.status(normalized.status).json({ ok: false, message: normalized.message });
        return;
      }
      if (
        !(await requireProjectDomainWrite({
          db: prisma,
          user,
          projectId: normalized.legalDoc.projectId,
          domain: "legalDocs",
          permission: "legalDocs.create",
          res
        }))
      ) {
        return;
      }

      const legalDoc = await prisma.legalDocument.create({
        data: toLegalDocCreateInput(normalized.legalDoc)
      });

      res.status(201).json({
        ok: true,
        legalDoc: await toLegalDocDtoForUser(prisma, user, legalDoc)
      });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/legal-docs/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireInternalRouteUser(req, res, prisma);
      if (!user) {
        return;
      }

      const existingRecord = await findLegalDocById(prisma, req.params.id);
      if (!existingRecord) {
        res.status(404).json({ ok: false, message: "Legal document not found." });
        return;
      }
      if (
        !(await requireProjectDomainWrite({
          db: prisma,
          user,
          projectId: existingRecord.projectId,
          domain: "legalDocs",
          permission: "legalDocs.edit",
          res,
          notFoundMessage: "Legal document not found."
        }))
      ) {
        return;
      }

      const existing = toLegalDocDto(existingRecord);
      const merged: LegalDocDto = {
        ...existing,
        projectId: hasOwn(req.body, "projectId") ? ensureStringField(req.body?.projectId) : existing.projectId,
        type: hasOwn(req.body, "type") ? ensureStringField(req.body?.type) : existing.type,
        title: hasOwn(req.body, "title") ? ensureStringField(req.body?.title) : existing.title,
        shortDescription: hasOwn(req.body, "shortDescription")
          ? ensureStringField(req.body?.shortDescription)
          : existing.shortDescription ?? "",
        reference: hasOwn(req.body, "reference")
          ? ensureStringField(req.body?.reference)
          : existing.reference ?? "",
        issuedAt: hasOwn(req.body, "issuedAt")
          ? ensureStringField(req.body?.issuedAt)
          : existing.issuedAt ?? "",
        authorityId: hasOwn(req.body, "authorityId")
          ? toOptionalTrimmedString(req.body?.authorityId)
          : existing.authorityId,
        authorityContactId: hasOwn(req.body, "authorityContactId")
          ? toOptionalTrimmedString(req.body?.authorityContactId)
          : existing.authorityContactId,
        attachments: hasOwn(req.body, "attachments")
          ? Array.isArray(req.body?.attachments)
            ? req.body.attachments.map((attachment: unknown, index: number) =>
                normalizeAttachment(
                  attachment as Partial<LegalDocAttachmentDto>,
                  `lda-${existing.id}-${index}`
                )
              )
            : []
          : existing.attachments,
        aiExtraction: hasOwn(req.body, "aiExtraction")
          ? normalizeAiExtraction(req.body?.aiExtraction)
          : existing.aiExtraction,
        scopeOverride: hasOwn(req.body, "scopeOverride")
          ? normalizeScopeOverride(req.body?.scopeOverride)
          : existing.scopeOverride,
        archivedAt: hasOwn(req.body, "archivedAt")
          ? toOptionalTrimmedString(req.body?.archivedAt)
          : existing.archivedAt,
        isArchived: hasOwn(req.body, "isArchived")
          ? Boolean(req.body?.isArchived)
          : existing.isArchived,
        createdAt: existing.createdAt,
        updatedAt: nowStamp()
      };

      if (!merged.projectId || !merged.type || !merged.title) {
        res.status(400).json({ ok: false, message: "projectId, type and title are required." });
        return;
      }

      const normalized = await normalizeLegalDocForWrite(prisma, merged);
      if (!normalized.ok) {
        res.status(normalized.status).json({ ok: false, message: normalized.message });
        return;
      }
      if (
        normalized.legalDoc.projectId !== existingRecord.projectId &&
        !(await requireProjectDomainWrite({
          db: prisma,
          user,
          projectId: normalized.legalDoc.projectId,
          domain: "legalDocs",
          permission: "legalDocs.edit",
          res
        }))
      ) {
        return;
      }

      const updated = await prisma.legalDocument.update({
        where: {
          id: existing.id
        },
        data: toLegalDocUpdateInput(normalized.legalDoc)
      });

      res.json({
        ok: true,
        legalDoc: await toLegalDocDtoForUser(prisma, user, updated)
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/legal-docs/:id/archive", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireInternalRouteUser(req, res, prisma);
      if (!user) {
        return;
      }

      const existing = await findLegalDocById(prisma, req.params.id);
      if (!existing) {
        res.status(404).json({ ok: false, message: "Legal document not found." });
        return;
      }
      if (
        !(await requireProjectDomainWrite({
          db: prisma,
          user,
          projectId: existing.projectId,
          domain: "legalDocs",
          permission: "legalDocs.archive",
          res,
          notFoundMessage: "Legal document not found."
        }))
      ) {
        return;
      }

      const updated = existing.isArchived
        ? existing
        : await prisma.legalDocument.update({
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
        legalDoc: await toLegalDocDtoForUser(prisma, user, updated)
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/legal-docs/:id/restore", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireInternalRouteUser(req, res, prisma);
      if (!user) {
        return;
      }

      const existing = await findLegalDocById(prisma, req.params.id);
      if (!existing) {
        res.status(404).json({ ok: false, message: "Legal document not found." });
        return;
      }
      if (
        !(await requireProjectDomainWrite({
          db: prisma,
          user,
          projectId: existing.projectId,
          domain: "legalDocs",
          permission: "legalDocs.archive",
          res,
          notFoundMessage: "Legal document not found."
        }))
      ) {
        return;
      }

      const updated = !existing.isArchived && !existing.archivedAt
        ? existing
        : await prisma.legalDocument.update({
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
        legalDoc: await toLegalDocDtoForUser(prisma, user, updated)
      });
    } catch (error) {
      next(error);
    }
  });

  router.put("/admin/internal/legal-docs/bulk-replace", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireAdminRoutePermissions(req, res, prisma, "legalDocs.edit", "legalDocs.archive");
      if (!user) {
        return;
      }

      const snapshot = normalizeLegalDocsSnapshot(req.body);
      const normalizedLegalDocs: LegalDocDto[] = [];

      for (const legalDoc of snapshot) {
        const normalized = await normalizeLegalDocForWrite(prisma, legalDoc);
        if (!normalized.ok) {
          res.status(normalized.status).json({ ok: false, message: normalized.message });
          return;
        }
        normalizedLegalDocs.push(normalized.legalDoc);
      }

      await replaceLegalDocsInDb(prisma, normalizedLegalDocs);

      res.json({
        ok: true,
        legalDocs: await listLegalDocsFromDb(prisma)
      });
    } catch (error) {
      if (sendLegalDocBulkMutationConflict(res, error)) {
        return;
      }
      next(error);
    }
  });

  router.delete("/admin/internal/legal-docs/bulk-delete", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireAdminRoutePermissions(req, res, prisma, "legalDocs.edit", "legalDocs.archive");
      if (!user) {
        return;
      }

      await deleteLegalDocsInDb(prisma);

      res.json({
        ok: true
      });
    } catch (error) {
      if (sendLegalDocBulkMutationConflict(res, error)) {
        return;
      }
      next(error);
    }
  });

  router.post("/admin/internal/legal-docs/backfill-from-snapshot", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireAdminRoutePermissions(req, res, prisma, "legalDocs.edit", "legalDocs.archive");
      if (!user) {
        return;
      }

      const snapshot = await readLegalDocsSnapshotFromPortal(prisma);
      if (!snapshot) {
        res.status(404).json({ ok: false, message: "Snapshot legal documents not found." });
        return;
      }

      const normalizedLegalDocs: LegalDocDto[] = [];
      for (const legalDoc of snapshot) {
        const normalized = await normalizeLegalDocForWrite(prisma, legalDoc);
        if (!normalized.ok) {
          res.status(normalized.status).json({ ok: false, message: normalized.message });
          return;
        }
        normalizedLegalDocs.push(normalized.legalDoc);
      }

      await replaceLegalDocsInDb(prisma, normalizedLegalDocs);

      res.json({
        ok: true,
        legalDocs: await listLegalDocsFromDb(prisma)
      });
    } catch (error) {
      if (sendLegalDocBulkMutationConflict(res, error)) {
        return;
      }
      next(error);
    }
  });

  router.post("/admin/internal/legal-docs/rollback-to-snapshot", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireAdminRoutePermissions(req, res, prisma, "legalDocs.edit", "legalDocs.archive");
      if (!user) {
        return;
      }

      const legalDocs = await listLegalDocsFromDb(prisma);
      await writeLegalDocsSnapshotToPortal(prisma, legalDocs, user.id);

      res.json({
        ok: true,
        legalDocs
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
