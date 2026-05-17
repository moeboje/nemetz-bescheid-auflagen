import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { Router, type NextFunction, type Request, type Response } from "express";
import { hasPermission } from "../accessControl.js";
import {
  ensureDefaultProcedureMasterData,
  normalizeBadgeVariant,
  normalizeMasterDataCode
} from "../procedureMasterData.js";
import {
  applyNoStoreHeaders,
  requireAdminRoutePermissions,
  requireAuthenticatedRouteUser,
  type RouteUser
} from "./routeAuth.js";

const legalMatterSelect = {
  id: true,
  code: true,
  name: true,
  shortName: true,
  description: true,
  isActive: true,
  sortOrder: true,
  badgeVariant: true,
  createdAt: true,
  updatedAt: true
} satisfies Prisma.LegalMatterSelect;

const procedureTypeSelect = {
  id: true,
  code: true,
  name: true,
  shortName: true,
  description: true,
  isActive: true,
  sortOrder: true,
  createdAt: true,
  updatedAt: true
} satisfies Prisma.ProcedureTypeSelect;

const submissionTypeSelect = {
  id: true,
  code: true,
  name: true,
  shortName: true,
  description: true,
  legalMatterId: true,
  procedureTypeId: true,
  isActive: true,
  isLegacy: true,
  sortOrder: true,
  badgeVariant: true,
  legacyAliases: true,
  createdAt: true,
  updatedAt: true,
  legalMatter: {
    select: {
      id: true,
      code: true,
      name: true,
      shortName: true,
      isActive: true,
      badgeVariant: true
    }
  },
  procedureType: {
    select: {
      id: true,
      code: true,
      name: true,
      shortName: true,
      isActive: true
    }
  },
  _count: {
    select: {
      projects: true
    }
  }
} satisfies Prisma.SubmissionTypeSelect;

type LegalMatterRow = Prisma.LegalMatterGetPayload<{ select: typeof legalMatterSelect }>;
type ProcedureTypeRow = Prisma.ProcedureTypeGetPayload<{ select: typeof procedureTypeSelect }>;
type SubmissionTypeRow = Prisma.SubmissionTypeGetPayload<{ select: typeof submissionTypeSelect }>;

function createServerId(prefix: string) {
  return `${prefix}-${randomUUID()}`;
}

function hasOwn(value: unknown, key: string) {
  return typeof value === "object" && value !== null && Object.prototype.hasOwnProperty.call(value, key);
}

function toOptionalTrimmedString(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function ensureStringField(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSortOrder(value: unknown) {
  if (value === undefined || value === null || value === "") {
    return undefined;
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) {
    throw new Error("sortOrder must be an integer.");
  }
  return parsed;
}

function normalizeLegacyAliases(value: unknown) {
  if (value === undefined || value === null) {
    return undefined;
  }
  if (!Array.isArray(value)) {
    throw new Error("legacyAliases must be an array.");
  }
  const aliases = value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean);
  return Array.from(new Set(aliases));
}

function normalizeRequiredCode(value: unknown, fallback: string) {
  const code = normalizeMasterDataCode(toOptionalTrimmedString(value) ?? fallback);
  if (!code) {
    throw new Error("code is required.");
  }
  return code;
}

function normalizeImportRows(value: unknown, field: string) {
  if (!Array.isArray(value)) {
    throw new Error(`${field} must be an array.`);
  }
  return value.map((row) => (row && typeof row === "object" ? row as Record<string, unknown> : {}));
}

function isUniqueConstraintError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

function isForeignKeyError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2003";
}

function canReadProcedureLookup(user: RouteUser) {
  if (String(user.type).toUpperCase() === "EXTERNAL") {
    return false;
  }
  return (
    hasPermission(user.permissionKeys, "projects.view") ||
    hasPermission(user.permissionKeys, "projects.create") ||
    hasPermission(user.permissionKeys, "projects.edit") ||
    hasPermission(user.permissionKeys, "masterData.view") ||
    hasPermission(user.permissionKeys, "masterData.manage")
  );
}

function toLegalMatterDto(row: LegalMatterRow, usageCount = 0) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    shortName: row.shortName ?? "",
    description: row.description ?? "",
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    badgeVariant: row.badgeVariant ?? undefined,
    usageCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function toProcedureTypeDto(row: ProcedureTypeRow, usageCount = 0) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    shortName: row.shortName ?? "",
    description: row.description ?? "",
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    usageCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function toSubmissionTypeDto(row: SubmissionTypeRow) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    shortName: row.shortName ?? "",
    description: row.description ?? "",
    legalMatterId: row.legalMatterId,
    procedureTypeId: row.procedureTypeId,
    legalMatterCode: row.legalMatter.code,
    legalMatterLabel: row.legalMatter.name,
    legalMatterShortName: row.legalMatter.shortName ?? "",
    legalMatterIsActive: row.legalMatter.isActive,
    procedureTypeCode: row.procedureType.code,
    procedureTypeLabel: row.procedureType.name,
    procedureTypeShortName: row.procedureType.shortName ?? "",
    procedureTypeIsActive: row.procedureType.isActive,
    isActive: row.isActive,
    isLegacy: row.isLegacy,
    sortOrder: row.sortOrder,
    badgeVariant: row.badgeVariant ?? row.legalMatter.badgeVariant ?? undefined,
    legacyAliases: Array.isArray(row.legacyAliases)
      ? row.legacyAliases.filter((entry): entry is string => typeof entry === "string")
      : [],
    usageCount: row._count.projects,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

async function listLegalMatters(prisma: PrismaClient, options: { activeOnly?: boolean } = {}) {
  await ensureDefaultProcedureMasterData(prisma);
  const rows = await prisma.legalMatter.findMany({
    where: options.activeOnly ? { isActive: true } : undefined,
    select: legalMatterSelect,
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }, { id: "asc" }]
  });
  const usageRows = await prisma.submissionType.groupBy({
    by: ["legalMatterId"],
    _count: {
      _all: true
    }
  });
  const usageById = new Map(usageRows.map((row) => [row.legalMatterId, row._count._all] as const));
  return rows.map((row) => toLegalMatterDto(row, usageById.get(row.id) ?? 0));
}

async function listProcedureTypes(prisma: PrismaClient, options: { activeOnly?: boolean } = {}) {
  await ensureDefaultProcedureMasterData(prisma);
  const rows = await prisma.procedureType.findMany({
    where: options.activeOnly ? { isActive: true } : undefined,
    select: procedureTypeSelect,
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }, { id: "asc" }]
  });
  const usageRows = await prisma.submissionType.groupBy({
    by: ["procedureTypeId"],
    _count: {
      _all: true
    }
  });
  const usageById = new Map(usageRows.map((row) => [row.procedureTypeId, row._count._all] as const));
  return rows.map((row) => toProcedureTypeDto(row, usageById.get(row.id) ?? 0));
}

async function listSubmissionTypes(
  prisma: PrismaClient,
  options: {
    activeOnly?: boolean;
    legalMatterId?: string;
    procedureTypeId?: string;
  } = {}
) {
  await ensureDefaultProcedureMasterData(prisma);
  const rows = await prisma.submissionType.findMany({
    where: {
      ...(options.activeOnly
        ? {
            isActive: true,
            legalMatter: {
              isActive: true
            },
            procedureType: {
              isActive: true
            }
          }
        : {}),
      ...(options.legalMatterId ? { legalMatterId: options.legalMatterId } : {}),
      ...(options.procedureTypeId ? { procedureTypeId: options.procedureTypeId } : {})
    },
    select: submissionTypeSelect,
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }, { id: "asc" }]
  });
  return rows.map(toSubmissionTypeDto);
}

async function requireProcedureLookupUser(req: Request, res: Response, prisma: PrismaClient) {
  const user = await requireAuthenticatedRouteUser(req, res, prisma);
  if (!user) {
    return null;
  }
  if (!canReadProcedureLookup(user)) {
    res.status(403).json({ ok: false, message: "Forbidden." });
    return null;
  }
  return user;
}

function legalMatterCreateData(body: unknown) {
  const row = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const name = ensureStringField(row.name);
  if (!name) {
    throw new Error("name is required.");
  }
  const code = normalizeMasterDataCode(toOptionalTrimmedString(row.code) ?? name);
  if (!code) {
    throw new Error("code is required.");
  }
  return {
    id: toOptionalTrimmedString(row.id) ?? createServerId("lm"),
    code,
    name,
    shortName: toOptionalTrimmedString(row.shortName),
    description: toOptionalTrimmedString(row.description),
    isActive: hasOwn(row, "isActive") ? Boolean(row.isActive) : true,
    sortOrder: normalizeSortOrder(row.sortOrder) ?? 0,
    badgeVariant: normalizeBadgeVariant(row.badgeVariant)
  };
}

function procedureTypeCreateData(body: unknown) {
  const row = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const name = ensureStringField(row.name);
  if (!name) {
    throw new Error("name is required.");
  }
  const code = normalizeMasterDataCode(toOptionalTrimmedString(row.code) ?? name);
  if (!code) {
    throw new Error("code is required.");
  }
  return {
    id: toOptionalTrimmedString(row.id) ?? createServerId("pt"),
    code,
    name,
    shortName: toOptionalTrimmedString(row.shortName),
    description: toOptionalTrimmedString(row.description),
    isActive: hasOwn(row, "isActive") ? Boolean(row.isActive) : true,
    sortOrder: normalizeSortOrder(row.sortOrder) ?? 0
  };
}

function submissionTypeCreateData(body: unknown) {
  const row = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const name = ensureStringField(row.name);
  const legalMatterId = ensureStringField(row.legalMatterId);
  const procedureTypeId = ensureStringField(row.procedureTypeId);
  if (!name || !legalMatterId || !procedureTypeId) {
    throw new Error("name, legalMatterId and procedureTypeId are required.");
  }
  const code = normalizeMasterDataCode(toOptionalTrimmedString(row.code) ?? name);
  if (!code) {
    throw new Error("code is required.");
  }
  return {
    id: toOptionalTrimmedString(row.id) ?? createServerId("st"),
    code,
    name,
    shortName: toOptionalTrimmedString(row.shortName),
    description: toOptionalTrimmedString(row.description),
    legalMatterId,
    procedureTypeId,
    isActive: hasOwn(row, "isActive") ? Boolean(row.isActive) : true,
    isLegacy: hasOwn(row, "isLegacy") ? Boolean(row.isLegacy) : false,
    sortOrder: normalizeSortOrder(row.sortOrder) ?? 0,
    badgeVariant: normalizeBadgeVariant(row.badgeVariant),
    legacyAliases: normalizeLegacyAliases(row.legacyAliases) ?? Prisma.JsonNull,
  };
}

function legalMatterUpdateData(body: unknown) {
  const row = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const data: Prisma.LegalMatterUpdateInput = {};
  if (hasOwn(row, "code")) {
    const code = normalizeMasterDataCode(ensureStringField(row.code));
    if (!code) {
      throw new Error("code is required.");
    }
    data.code = code;
  }
  if (hasOwn(row, "name")) {
    const name = ensureStringField(row.name);
    if (!name) {
      throw new Error("name is required.");
    }
    data.name = name;
  }
  if (hasOwn(row, "shortName")) {
    data.shortName = toOptionalTrimmedString(row.shortName) ?? null;
  }
  if (hasOwn(row, "description")) {
    data.description = toOptionalTrimmedString(row.description) ?? null;
  }
  if (hasOwn(row, "isActive")) {
    data.isActive = Boolean(row.isActive);
  }
  if (hasOwn(row, "sortOrder")) {
    data.sortOrder = normalizeSortOrder(row.sortOrder) ?? 0;
  }
  if (hasOwn(row, "badgeVariant")) {
    data.badgeVariant = normalizeBadgeVariant(row.badgeVariant) ?? null;
  }
  return data;
}

function procedureTypeUpdateData(body: unknown) {
  const row = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const data: Prisma.ProcedureTypeUpdateInput = {};
  if (hasOwn(row, "code")) {
    const code = normalizeMasterDataCode(ensureStringField(row.code));
    if (!code) {
      throw new Error("code is required.");
    }
    data.code = code;
  }
  if (hasOwn(row, "name")) {
    const name = ensureStringField(row.name);
    if (!name) {
      throw new Error("name is required.");
    }
    data.name = name;
  }
  if (hasOwn(row, "shortName")) {
    data.shortName = toOptionalTrimmedString(row.shortName) ?? null;
  }
  if (hasOwn(row, "description")) {
    data.description = toOptionalTrimmedString(row.description) ?? null;
  }
  if (hasOwn(row, "isActive")) {
    data.isActive = Boolean(row.isActive);
  }
  if (hasOwn(row, "sortOrder")) {
    data.sortOrder = normalizeSortOrder(row.sortOrder) ?? 0;
  }
  return data;
}

function submissionTypeUpdateData(body: unknown) {
  const row = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const data: Prisma.SubmissionTypeUncheckedUpdateInput = {};
  if (hasOwn(row, "code")) {
    const code = normalizeMasterDataCode(ensureStringField(row.code));
    if (!code) {
      throw new Error("code is required.");
    }
    data.code = code;
  }
  if (hasOwn(row, "name")) {
    const name = ensureStringField(row.name);
    if (!name) {
      throw new Error("name is required.");
    }
    data.name = name;
  }
  if (hasOwn(row, "shortName")) {
    data.shortName = toOptionalTrimmedString(row.shortName) ?? null;
  }
  if (hasOwn(row, "description")) {
    data.description = toOptionalTrimmedString(row.description) ?? null;
  }
  if (hasOwn(row, "legalMatterId")) {
    data.legalMatterId = ensureStringField(row.legalMatterId);
  }
  if (hasOwn(row, "procedureTypeId")) {
    data.procedureTypeId = ensureStringField(row.procedureTypeId);
  }
  if (hasOwn(row, "isActive")) {
    data.isActive = Boolean(row.isActive);
  }
  if (hasOwn(row, "isLegacy")) {
    data.isLegacy = Boolean(row.isLegacy);
  }
  if (hasOwn(row, "sortOrder")) {
    data.sortOrder = normalizeSortOrder(row.sortOrder) ?? 0;
  }
  if (hasOwn(row, "badgeVariant")) {
    data.badgeVariant = normalizeBadgeVariant(row.badgeVariant) ?? null;
  }
  if (hasOwn(row, "legacyAliases")) {
    data.legacyAliases = normalizeLegacyAliases(row.legacyAliases) ?? Prisma.JsonNull;
  }
  return data;
}

async function validateActiveReferenceRows(
  prisma: PrismaClient,
  input: { legalMatterId?: string; procedureTypeId?: string }
) {
  if (input.legalMatterId) {
    const legalMatter = await prisma.legalMatter.findUnique({
      where: {
        id: input.legalMatterId
      },
      select: {
        isActive: true
      }
    });
    if (!legalMatter || !legalMatter.isActive) {
      throw new Error("legalMatterId must reference an active legal matter.");
    }
  }
  if (input.procedureTypeId) {
    const procedureType = await prisma.procedureType.findUnique({
      where: {
        id: input.procedureTypeId
      },
      select: {
        isActive: true
      }
    });
    if (!procedureType || !procedureType.isActive) {
      throw new Error("procedureTypeId must reference an active procedure type.");
    }
  }
}

async function createImportId(
  tx: Prisma.TransactionClient,
  table: "legalMatter" | "procedureType" | "submissionType",
  preferredId: string | undefined,
  prefix: string
) {
  if (!preferredId) {
    return createServerId(prefix);
  }

  if (table === "legalMatter") {
    const existing = await tx.legalMatter.findUnique({ where: { id: preferredId }, select: { id: true } });
    return existing ? createServerId(prefix) : preferredId;
  }
  if (table === "procedureType") {
    const existing = await tx.procedureType.findUnique({ where: { id: preferredId }, select: { id: true } });
    return existing ? createServerId(prefix) : preferredId;
  }

  const existing = await tx.submissionType.findUnique({ where: { id: preferredId }, select: { id: true } });
  return existing ? createServerId(prefix) : preferredId;
}

async function replaceProcedureMasterDataSnapshot(prisma: PrismaClient, body: unknown) {
  const snapshot = body && typeof body === "object" ? body as Record<string, unknown> : {};
  const legalMatterRows = normalizeImportRows(snapshot.legalMatters, "legalMatters");
  const procedureTypeRows = normalizeImportRows(snapshot.procedureTypes, "procedureTypes");
  const submissionTypeRows = normalizeImportRows(snapshot.submissionTypes, "submissionTypes");

  return prisma.$transaction(async (tx) => {
    await ensureDefaultProcedureMasterData(tx);

    const legalMatterIds: Record<string, string> = {};
    const procedureTypeIds: Record<string, string> = {};
    const submissionTypeIds: Record<string, string> = {};
    const submissionTypeCodes: Record<string, string> = {};
    const legalMatterIdByCode = new Map<string, string>();
    const procedureTypeIdByCode = new Map<string, string>();
    const importedLegalMatterDbIds = new Set<string>();
    const importedProcedureTypeDbIds = new Set<string>();
    const importedSubmissionTypeDbIds = new Set<string>();

    for (const row of legalMatterRows) {
      const name = ensureStringField(row.name);
      if (!name) {
        throw new Error("legal matter name is required.");
      }
      const code = normalizeRequiredCode(row.code, name);
      const importedId = toOptionalTrimmedString(row.id);
      const existing = await tx.legalMatter.findUnique({
        where: { code },
        select: { id: true }
      });
      const data = {
        code,
        name,
        shortName: toOptionalTrimmedString(row.shortName),
        description: toOptionalTrimmedString(row.description),
        isActive: hasOwn(row, "isActive") ? Boolean(row.isActive) : true,
        sortOrder: normalizeSortOrder(row.sortOrder) ?? 0,
        badgeVariant: normalizeBadgeVariant(row.badgeVariant)
      };
      const saved = existing
        ? await tx.legalMatter.update({
            where: { id: existing.id },
            data,
            select: { id: true, code: true }
          })
        : await tx.legalMatter.create({
            data: {
              id: await createImportId(tx, "legalMatter", importedId, "lm"),
              ...data
            },
            select: { id: true, code: true }
          });
      if (importedId) {
        legalMatterIds[importedId] = saved.id;
      }
      legalMatterIdByCode.set(saved.code, saved.id);
      importedLegalMatterDbIds.add(saved.id);
    }

    for (const row of procedureTypeRows) {
      const name = ensureStringField(row.name);
      if (!name) {
        throw new Error("procedure type name is required.");
      }
      const code = normalizeRequiredCode(row.code, name);
      const importedId = toOptionalTrimmedString(row.id);
      const existing = await tx.procedureType.findUnique({
        where: { code },
        select: { id: true }
      });
      const data = {
        code,
        name,
        shortName: toOptionalTrimmedString(row.shortName),
        description: toOptionalTrimmedString(row.description),
        isActive: hasOwn(row, "isActive") ? Boolean(row.isActive) : true,
        sortOrder: normalizeSortOrder(row.sortOrder) ?? 0
      };
      const saved = existing
        ? await tx.procedureType.update({
            where: { id: existing.id },
            data,
            select: { id: true, code: true }
          })
        : await tx.procedureType.create({
            data: {
              id: await createImportId(tx, "procedureType", importedId, "pt"),
              ...data
            },
            select: { id: true, code: true }
          });
      if (importedId) {
        procedureTypeIds[importedId] = saved.id;
      }
      procedureTypeIdByCode.set(saved.code, saved.id);
      importedProcedureTypeDbIds.add(saved.id);
    }

    for (const row of submissionTypeRows) {
      const name = ensureStringField(row.name);
      if (!name) {
        throw new Error("submission type name is required.");
      }
      const code = normalizeRequiredCode(row.code, name);
      const importedId = toOptionalTrimmedString(row.id);
      const legalMatterCode = normalizeMasterDataCode(
        toOptionalTrimmedString(row.legalMatterCode) ?? toOptionalTrimmedString(row.legalMatterId) ?? ""
      );
      const procedureTypeCode = normalizeMasterDataCode(
        toOptionalTrimmedString(row.procedureTypeCode) ?? toOptionalTrimmedString(row.procedureTypeId) ?? ""
      );
      const legalMatterId =
        legalMatterIds[toOptionalTrimmedString(row.legalMatterId) ?? ""] ??
        legalMatterIdByCode.get(legalMatterCode);
      const procedureTypeId =
        procedureTypeIds[toOptionalTrimmedString(row.procedureTypeId) ?? ""] ??
        procedureTypeIdByCode.get(procedureTypeCode);
      if (!legalMatterId || !procedureTypeId) {
        throw new Error("submission type references are required.");
      }

      const existing = await tx.submissionType.findUnique({
        where: { code },
        select: { id: true }
      });
      const data = {
        code,
        name,
        shortName: toOptionalTrimmedString(row.shortName),
        description: toOptionalTrimmedString(row.description),
        legalMatterId,
        procedureTypeId,
        isActive: hasOwn(row, "isActive") ? Boolean(row.isActive) : true,
        isLegacy: hasOwn(row, "isLegacy") ? Boolean(row.isLegacy) : false,
        sortOrder: normalizeSortOrder(row.sortOrder) ?? 0,
        badgeVariant: normalizeBadgeVariant(row.badgeVariant),
        legacyAliases: normalizeLegacyAliases(row.legacyAliases) ?? Prisma.JsonNull
      };
      const saved = existing
        ? await tx.submissionType.update({
            where: { id: existing.id },
            data,
            select: { id: true, code: true }
          })
        : await tx.submissionType.create({
            data: {
              id: await createImportId(tx, "submissionType", importedId, "st"),
              ...data
            },
            select: { id: true, code: true }
          });
      if (importedId) {
        submissionTypeIds[importedId] = saved.id;
      }
      submissionTypeCodes[saved.code] = saved.id;
      importedSubmissionTypeDbIds.add(saved.id);
    }

    const importedSubmissionTypeIdList = [...importedSubmissionTypeDbIds];
    await tx.submissionType.updateMany({
      where: {
        isActive: true,
        ...(importedSubmissionTypeIdList.length > 0 ? { id: { notIn: importedSubmissionTypeIdList } } : {})
      },
      data: { isActive: false }
    });

    const importedLegalMatterIdList = [...importedLegalMatterDbIds];
    await tx.legalMatter.updateMany({
      where: {
        isActive: true,
        ...(importedLegalMatterIdList.length > 0 ? { id: { notIn: importedLegalMatterIdList } } : {})
      },
      data: { isActive: false }
    });

    const importedProcedureTypeIdList = [...importedProcedureTypeDbIds];
    await tx.procedureType.updateMany({
      where: {
        isActive: true,
        ...(importedProcedureTypeIdList.length > 0 ? { id: { notIn: importedProcedureTypeIdList } } : {})
      },
      data: { isActive: false }
    });

    return {
      idMapping: {
        legalMatterIds,
        procedureTypeIds,
        submissionTypeIds,
        submissionTypeCodes
      }
    };
  });
}

export function createProcedureMasterDataRouter(prisma: PrismaClient) {
  const router = Router();

  router.get("/procedure-master-data", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);
      const user = await requireProcedureLookupUser(req, res, prisma);
      if (!user) {
        return;
      }
      res.json({
        ok: true,
        legalMatters: await listLegalMatters(prisma, { activeOnly: true }),
        procedureTypes: await listProcedureTypes(prisma, { activeOnly: true }),
        submissionTypes: await listSubmissionTypes(prisma, { activeOnly: true })
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/procedure-master-data/legal-matters", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);
      const user = await requireProcedureLookupUser(req, res, prisma);
      if (!user) {
        return;
      }
      res.json({ ok: true, items: await listLegalMatters(prisma, { activeOnly: true }) });
    } catch (error) {
      next(error);
    }
  });

  router.get("/procedure-master-data/procedure-types", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);
      const user = await requireProcedureLookupUser(req, res, prisma);
      if (!user) {
        return;
      }
      res.json({ ok: true, items: await listProcedureTypes(prisma, { activeOnly: true }) });
    } catch (error) {
      next(error);
    }
  });

  router.get("/procedure-master-data/submission-types", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);
      const user = await requireProcedureLookupUser(req, res, prisma);
      if (!user) {
        return;
      }
      res.json({
        ok: true,
        items: await listSubmissionTypes(prisma, {
          activeOnly: true,
          legalMatterId: toOptionalTrimmedString(req.query.legalMatterId),
          procedureTypeId: toOptionalTrimmedString(req.query.procedureTypeId)
        })
      });
    } catch (error) {
      next(error);
    }
  });

  router.get("/admin/procedure-master-data", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);
      const user = await requireAdminRoutePermissions(req, res, prisma, "masterData.manage");
      if (!user) {
        return;
      }
      res.json({
        ok: true,
        legalMatters: await listLegalMatters(prisma),
        procedureTypes: await listProcedureTypes(prisma),
        submissionTypes: await listSubmissionTypes(prisma)
      });
    } catch (error) {
      next(error);
    }
  });

  router.put("/admin/internal/procedure-master-data/bulk-replace", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);
      const user = await requireAdminRoutePermissions(req, res, prisma, "masterData.manage");
      if (!user) {
        return;
      }
      const result = await replaceProcedureMasterDataSnapshot(prisma, req.body);
      res.json({
        ok: true,
        legalMatters: await listLegalMatters(prisma),
        procedureTypes: await listProcedureTypes(prisma),
        submissionTypes: await listSubmissionTypes(prisma),
        idMapping: result.idMapping
      });
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.endsWith("is required.") ||
          error.message.endsWith("must be an integer.") ||
          error.message.endsWith("must be an array.") ||
          error.message === "submission type references are required.")
      ) {
        res.status(400).json({ ok: false, message: error.message });
        return;
      }
      if (isUniqueConstraintError(error)) {
        res.status(409).json({ ok: false, message: "Code or name already exists." });
        return;
      }
      if (isForeignKeyError(error)) {
        res.status(400).json({ ok: false, message: "Invalid legal matter or procedure type reference." });
        return;
      }
      next(error);
    }
  });

  router.get("/admin/procedure-master-data/legal-matters", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);
      const user = await requireAdminRoutePermissions(req, res, prisma, "masterData.manage");
      if (!user) {
        return;
      }
      res.json({ ok: true, items: await listLegalMatters(prisma) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/admin/procedure-master-data/legal-matters", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);
      const user = await requireAdminRoutePermissions(req, res, prisma, "masterData.manage");
      if (!user) {
        return;
      }
      await ensureDefaultProcedureMasterData(prisma);
      const created = await prisma.legalMatter.create({
        data: legalMatterCreateData(req.body),
        select: legalMatterSelect
      });
      res.status(201).json({ ok: true, legalMatter: toLegalMatterDto(created) });
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.endsWith("is required.") || error.message.endsWith("must be an integer."))
      ) {
        res.status(400).json({ ok: false, message: error.message });
        return;
      }
      if (isUniqueConstraintError(error)) {
        res.status(409).json({ ok: false, message: "Code or name already exists." });
        return;
      }
      next(error);
    }
  });

  router.patch("/admin/procedure-master-data/legal-matters/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);
      const user = await requireAdminRoutePermissions(req, res, prisma, "masterData.manage");
      if (!user) {
        return;
      }
      const updated = await prisma.legalMatter.update({
        where: {
          id: req.params.id
        },
        data: legalMatterUpdateData(req.body),
        select: legalMatterSelect
      });
      res.json({ ok: true, legalMatter: toLegalMatterDto(updated) });
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.endsWith("is required.") || error.message.endsWith("must be an integer."))
      ) {
        res.status(400).json({ ok: false, message: error.message });
        return;
      }
      if (isUniqueConstraintError(error)) {
        res.status(409).json({ ok: false, message: "Code or name already exists." });
        return;
      }
      next(error);
    }
  });

  router.post("/admin/procedure-master-data/legal-matters/:id/deactivate", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);
      const user = await requireAdminRoutePermissions(req, res, prisma, "masterData.manage");
      if (!user) {
        return;
      }
      const updated = await prisma.legalMatter.update({
        where: { id: req.params.id },
        data: { isActive: false },
        select: legalMatterSelect
      });
      res.json({ ok: true, legalMatter: toLegalMatterDto(updated) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/admin/procedure-master-data/legal-matters/:id/reactivate", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);
      const user = await requireAdminRoutePermissions(req, res, prisma, "masterData.manage");
      if (!user) {
        return;
      }
      const updated = await prisma.legalMatter.update({
        where: { id: req.params.id },
        data: { isActive: true },
        select: legalMatterSelect
      });
      res.json({ ok: true, legalMatter: toLegalMatterDto(updated) });
    } catch (error) {
      next(error);
    }
  });

  router.get("/admin/procedure-master-data/procedure-types", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);
      const user = await requireAdminRoutePermissions(req, res, prisma, "masterData.manage");
      if (!user) {
        return;
      }
      res.json({ ok: true, items: await listProcedureTypes(prisma) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/admin/procedure-master-data/procedure-types", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);
      const user = await requireAdminRoutePermissions(req, res, prisma, "masterData.manage");
      if (!user) {
        return;
      }
      await ensureDefaultProcedureMasterData(prisma);
      const created = await prisma.procedureType.create({
        data: procedureTypeCreateData(req.body),
        select: procedureTypeSelect
      });
      res.status(201).json({ ok: true, procedureType: toProcedureTypeDto(created) });
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.endsWith("is required.") || error.message.endsWith("must be an integer."))
      ) {
        res.status(400).json({ ok: false, message: error.message });
        return;
      }
      if (isUniqueConstraintError(error)) {
        res.status(409).json({ ok: false, message: "Code or name already exists." });
        return;
      }
      next(error);
    }
  });

  router.patch("/admin/procedure-master-data/procedure-types/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);
      const user = await requireAdminRoutePermissions(req, res, prisma, "masterData.manage");
      if (!user) {
        return;
      }
      const updated = await prisma.procedureType.update({
        where: {
          id: req.params.id
        },
        data: procedureTypeUpdateData(req.body),
        select: procedureTypeSelect
      });
      res.json({ ok: true, procedureType: toProcedureTypeDto(updated) });
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.endsWith("is required.") || error.message.endsWith("must be an integer."))
      ) {
        res.status(400).json({ ok: false, message: error.message });
        return;
      }
      if (isUniqueConstraintError(error)) {
        res.status(409).json({ ok: false, message: "Code or name already exists." });
        return;
      }
      next(error);
    }
  });

  router.post("/admin/procedure-master-data/procedure-types/:id/deactivate", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);
      const user = await requireAdminRoutePermissions(req, res, prisma, "masterData.manage");
      if (!user) {
        return;
      }
      const updated = await prisma.procedureType.update({
        where: { id: req.params.id },
        data: { isActive: false },
        select: procedureTypeSelect
      });
      res.json({ ok: true, procedureType: toProcedureTypeDto(updated) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/admin/procedure-master-data/procedure-types/:id/reactivate", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);
      const user = await requireAdminRoutePermissions(req, res, prisma, "masterData.manage");
      if (!user) {
        return;
      }
      const updated = await prisma.procedureType.update({
        where: { id: req.params.id },
        data: { isActive: true },
        select: procedureTypeSelect
      });
      res.json({ ok: true, procedureType: toProcedureTypeDto(updated) });
    } catch (error) {
      next(error);
    }
  });

  router.get("/admin/procedure-master-data/submission-types", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);
      const user = await requireAdminRoutePermissions(req, res, prisma, "masterData.manage");
      if (!user) {
        return;
      }
      res.json({ ok: true, items: await listSubmissionTypes(prisma) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/admin/procedure-master-data/submission-types", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);
      const user = await requireAdminRoutePermissions(req, res, prisma, "masterData.manage");
      if (!user) {
        return;
      }
      await ensureDefaultProcedureMasterData(prisma);
      const data = submissionTypeCreateData(req.body);
      await validateActiveReferenceRows(prisma, {
        legalMatterId: data.legalMatterId,
        procedureTypeId: data.procedureTypeId
      });
      const created = await prisma.submissionType.create({
        data,
        select: submissionTypeSelect
      });
      res.status(201).json({ ok: true, submissionType: toSubmissionTypeDto(created) });
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.endsWith("is required.") ||
          error.message.endsWith("must be an integer.") ||
          error.message.endsWith("must be an array.") ||
          error.message.includes("must reference an active"))
      ) {
        res.status(400).json({ ok: false, message: error.message });
        return;
      }
      if (isUniqueConstraintError(error)) {
        res.status(409).json({ ok: false, message: "Code or name already exists." });
        return;
      }
      if (isForeignKeyError(error)) {
        res.status(400).json({ ok: false, message: "Invalid legal matter or procedure type reference." });
        return;
      }
      next(error);
    }
  });

  router.patch("/admin/procedure-master-data/submission-types/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);
      const user = await requireAdminRoutePermissions(req, res, prisma, "masterData.manage");
      if (!user) {
        return;
      }
      const data = submissionTypeUpdateData(req.body);
      const existing = await prisma.submissionType.findUnique({
        where: {
          id: req.params.id
        },
        select: {
          legalMatterId: true,
          procedureTypeId: true
        }
      });
      if (!existing) {
        res.status(404).json({ ok: false, message: "Submission type not found." });
        return;
      }
      const legalMatterId = typeof data.legalMatterId === "string" ? data.legalMatterId : undefined;
      const procedureTypeId = typeof data.procedureTypeId === "string" ? data.procedureTypeId : undefined;
      await validateActiveReferenceRows(prisma, {
        legalMatterId: legalMatterId && legalMatterId !== existing.legalMatterId ? legalMatterId : undefined,
        procedureTypeId:
          procedureTypeId && procedureTypeId !== existing.procedureTypeId ? procedureTypeId : undefined
      });
      const updated = await prisma.submissionType.update({
        where: {
          id: req.params.id
        },
        data,
        select: submissionTypeSelect
      });
      res.json({ ok: true, submissionType: toSubmissionTypeDto(updated) });
    } catch (error) {
      if (
        error instanceof Error &&
        (error.message.endsWith("is required.") ||
          error.message.endsWith("must be an integer.") ||
          error.message.endsWith("must be an array.") ||
          error.message.includes("must reference an active"))
      ) {
        res.status(400).json({ ok: false, message: error.message });
        return;
      }
      if (isUniqueConstraintError(error)) {
        res.status(409).json({ ok: false, message: "Code or name already exists." });
        return;
      }
      if (isForeignKeyError(error)) {
        res.status(400).json({ ok: false, message: "Invalid legal matter or procedure type reference." });
        return;
      }
      next(error);
    }
  });

  router.post("/admin/procedure-master-data/submission-types/:id/deactivate", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);
      const user = await requireAdminRoutePermissions(req, res, prisma, "masterData.manage");
      if (!user) {
        return;
      }
      const updated = await prisma.submissionType.update({
        where: { id: req.params.id },
        data: { isActive: false },
        select: submissionTypeSelect
      });
      res.json({ ok: true, submissionType: toSubmissionTypeDto(updated) });
    } catch (error) {
      next(error);
    }
  });

  router.post("/admin/procedure-master-data/submission-types/:id/reactivate", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);
      const user = await requireAdminRoutePermissions(req, res, prisma, "masterData.manage");
      if (!user) {
        return;
      }
      const existing = await prisma.submissionType.findUnique({
        where: { id: req.params.id },
        select: {
          legalMatterId: true,
          procedureTypeId: true
        }
      });
      if (!existing) {
        res.status(404).json({ ok: false, message: "Submission type not found." });
        return;
      }
      await validateActiveReferenceRows(prisma, existing);
      const updated = await prisma.submissionType.update({
        where: { id: req.params.id },
        data: { isActive: true },
        select: submissionTypeSelect
      });
      res.json({ ok: true, submissionType: toSubmissionTypeDto(updated) });
    } catch (error) {
      if (error instanceof Error && error.message.includes("must reference an active")) {
        res.status(400).json({ ok: false, message: error.message });
        return;
      }
      next(error);
    }
  });

  return router;
}
