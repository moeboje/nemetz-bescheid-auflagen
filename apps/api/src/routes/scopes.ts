import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { Router, type NextFunction, type Request, type Response } from "express";
import {
  applyNoStoreHeaders,
  requireAdminRouteUser,
  requireInternalRouteUser
} from "./routeAuth.js";

type ScopeCompanyDto = {
  id: string;
  name: string;
  shortName?: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
};

type ScopeSiteDto = {
  id: string;
  companyId: string;
  name: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
};

type ScopeFacilityDto = {
  id: string;
  companyId: string;
  siteId: string;
  name: string;
  type?: string;
  isArchived: boolean;
  createdAt: string;
  updatedAt: string;
};

type ScopesSnapshotDto = {
  companies: ScopeCompanyDto[];
  sites: ScopeSiteDto[];
  facilities: ScopeFacilityDto[];
};

type CompanyRow = {
  id: string;
  name: string;
  shortName: string | null;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type SiteRow = {
  id: string;
  companyId: string;
  name: string;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type FacilityRow = {
  id: string;
  companyId: string;
  siteId: string;
  name: string;
  type: string | null;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type DbClient = PrismaClient | Prisma.TransactionClient;

function hasOwn(value: unknown, key: string) {
  return typeof value === "object" && value !== null && Object.prototype.hasOwnProperty.call(value, key);
}

function isPresent<T>(value: T | null): value is T {
  return value !== null;
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

function toCompanyDto(company: CompanyRow): ScopeCompanyDto {
  return {
    id: company.id,
    name: company.name,
    shortName: company.shortName ?? "",
    isArchived: company.isArchived,
    createdAt: company.createdAt.toISOString(),
    updatedAt: company.updatedAt.toISOString()
  };
}

function toSiteDto(site: SiteRow): ScopeSiteDto {
  return {
    id: site.id,
    companyId: site.companyId,
    name: site.name,
    isArchived: site.isArchived,
    createdAt: site.createdAt.toISOString(),
    updatedAt: site.updatedAt.toISOString()
  };
}

function toFacilityDto(facility: FacilityRow): ScopeFacilityDto {
  return {
    id: facility.id,
    companyId: facility.companyId,
    siteId: facility.siteId,
    name: facility.name,
    type: facility.type ?? "",
    isArchived: facility.isArchived,
    createdAt: facility.createdAt.toISOString(),
    updatedAt: facility.updatedAt.toISOString()
  };
}

function normalizeScopesSnapshot(value: unknown): ScopesSnapshotDto {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      companies: [],
      sites: [],
      facilities: []
    };
  }

  const row = value as {
    companies?: unknown;
    sites?: unknown;
    facilities?: unknown;
  };

  const companies = Array.isArray(row.companies)
    ? row.companies
        .map<ScopeCompanyDto | null>((item) => {
          if (!item || typeof item !== "object") {
            return null;
          }

          const company = item as Partial<ScopeCompanyDto>;
          if (typeof company.id !== "string" || !company.id.trim() || typeof company.name !== "string" || !company.name.trim()) {
            return null;
          }

          const createdAt = toOptionalTrimmedString(company.createdAt) ?? new Date().toISOString();
          const updatedAt = toOptionalTrimmedString(company.updatedAt) ?? createdAt;

          return {
            id: company.id,
            name: company.name,
            shortName: company.shortName ?? "",
            isArchived: Boolean(company.isArchived),
            createdAt,
            updatedAt
          };
        })
        .filter(isPresent)
    : [];

  const companyIds = new Set(companies.map((company) => company.id));

  const sites = Array.isArray(row.sites)
    ? row.sites
        .map<ScopeSiteDto | null>((item) => {
          if (!item || typeof item !== "object") {
            return null;
          }

          const site = item as Partial<ScopeSiteDto>;
          if (
            typeof site.id !== "string" ||
            !site.id.trim() ||
            typeof site.companyId !== "string" ||
            !site.companyId.trim() ||
            !companyIds.has(site.companyId) ||
            typeof site.name !== "string" ||
            !site.name.trim()
          ) {
            return null;
          }

          const createdAt = toOptionalTrimmedString(site.createdAt) ?? new Date().toISOString();
          const updatedAt = toOptionalTrimmedString(site.updatedAt) ?? createdAt;

          return {
            id: site.id,
            companyId: site.companyId,
            name: site.name,
            isArchived: Boolean(site.isArchived),
            createdAt,
            updatedAt
          };
        })
        .filter(isPresent)
    : [];

  const siteById = new Map(sites.map((site) => [site.id, site] as const));

  const facilities = Array.isArray(row.facilities)
    ? row.facilities
        .map<ScopeFacilityDto | null>((item) => {
          if (!item || typeof item !== "object") {
            return null;
          }

          const facility = item as Partial<ScopeFacilityDto>;
          if (
            typeof facility.id !== "string" ||
            !facility.id.trim() ||
            typeof facility.siteId !== "string" ||
            !facility.siteId.trim() ||
            typeof facility.name !== "string" ||
            !facility.name.trim()
          ) {
            return null;
          }

          const parentSite = siteById.get(facility.siteId);
          if (!parentSite) {
            return null;
          }

          const createdAt = toOptionalTrimmedString(facility.createdAt) ?? new Date().toISOString();
          const updatedAt = toOptionalTrimmedString(facility.updatedAt) ?? createdAt;

          return {
            id: facility.id,
            companyId:
              facility.companyId && companyIds.has(facility.companyId)
                ? facility.companyId
                : parentSite.companyId,
            siteId: facility.siteId,
            name: facility.name,
            type: facility.type ?? "",
            isArchived: Boolean(facility.isArchived),
            createdAt,
            updatedAt
          };
        })
        .filter(isPresent)
    : [];

  return {
    companies,
    sites,
    facilities
  };
}

async function listCompanies(db: DbClient) {
  return db.$queryRaw<CompanyRow[]>(Prisma.sql`
    SELECT "id", "name", "shortName", "isArchived", "createdAt", "updatedAt"
    FROM "Company"
    ORDER BY "createdAt" ASC, "id" ASC
  `);
}

async function listSites(db: DbClient) {
  return db.$queryRaw<SiteRow[]>(Prisma.sql`
    SELECT "id", "companyId", "name", "isArchived", "createdAt", "updatedAt"
    FROM "Site"
    ORDER BY "createdAt" ASC, "id" ASC
  `);
}

async function listFacilities(db: DbClient) {
  return db.$queryRaw<FacilityRow[]>(Prisma.sql`
    SELECT "id", "companyId", "siteId", "name", "type", "isArchived", "createdAt", "updatedAt"
    FROM "Facility"
    ORDER BY "createdAt" ASC, "id" ASC
  `);
}

async function findCompanyById(db: DbClient, id: string) {
  const rows = await db.$queryRaw<CompanyRow[]>(Prisma.sql`
    SELECT "id", "name", "shortName", "isArchived", "createdAt", "updatedAt"
    FROM "Company"
    WHERE "id" = ${id}
    LIMIT 1
  `);
  return rows[0] ?? null;
}

async function findSiteById(db: DbClient, id: string) {
  const rows = await db.$queryRaw<SiteRow[]>(Prisma.sql`
    SELECT "id", "companyId", "name", "isArchived", "createdAt", "updatedAt"
    FROM "Site"
    WHERE "id" = ${id}
    LIMIT 1
  `);
  return rows[0] ?? null;
}

async function findFacilityById(db: DbClient, id: string) {
  const rows = await db.$queryRaw<FacilityRow[]>(Prisma.sql`
    SELECT "id", "companyId", "siteId", "name", "type", "isArchived", "createdAt", "updatedAt"
    FROM "Facility"
    WHERE "id" = ${id}
    LIMIT 1
  `);
  return rows[0] ?? null;
}

async function insertCompany(
  db: DbClient,
  input: {
    id: string;
    name: string;
    shortName?: string;
    isArchived?: boolean;
    createdAt?: Date;
    updatedAt?: Date;
  }
) {
  const rows = await db.$queryRaw<CompanyRow[]>(Prisma.sql`
    INSERT INTO "Company" ("id", "name", "shortName", "isArchived", "createdAt", "updatedAt")
    VALUES (
      ${input.id},
      ${input.name},
      ${toOptionalTrimmedString(input.shortName) ?? null},
      ${input.isArchived ?? false},
      ${input.createdAt ?? new Date()},
      ${input.updatedAt ?? input.createdAt ?? new Date()}
    )
    RETURNING "id", "name", "shortName", "isArchived", "createdAt", "updatedAt"
  `);
  return rows[0] ?? null;
}

async function insertSite(
  db: DbClient,
  input: {
    id: string;
    companyId: string;
    name: string;
    isArchived?: boolean;
    createdAt?: Date;
    updatedAt?: Date;
  }
) {
  const rows = await db.$queryRaw<SiteRow[]>(Prisma.sql`
    INSERT INTO "Site" ("id", "companyId", "name", "isArchived", "createdAt", "updatedAt")
    VALUES (
      ${input.id},
      ${input.companyId},
      ${input.name},
      ${input.isArchived ?? false},
      ${input.createdAt ?? new Date()},
      ${input.updatedAt ?? input.createdAt ?? new Date()}
    )
    RETURNING "id", "companyId", "name", "isArchived", "createdAt", "updatedAt"
  `);
  return rows[0] ?? null;
}

async function insertFacility(
  db: DbClient,
  input: {
    id: string;
    companyId: string;
    siteId: string;
    name: string;
    type?: string;
    isArchived?: boolean;
    createdAt?: Date;
    updatedAt?: Date;
  }
) {
  const rows = await db.$queryRaw<FacilityRow[]>(Prisma.sql`
    INSERT INTO "Facility" ("id", "companyId", "siteId", "name", "type", "isArchived", "createdAt", "updatedAt")
    VALUES (
      ${input.id},
      ${input.companyId},
      ${input.siteId},
      ${input.name},
      ${toOptionalTrimmedString(input.type) ?? null},
      ${input.isArchived ?? false},
      ${input.createdAt ?? new Date()},
      ${input.updatedAt ?? input.createdAt ?? new Date()}
    )
    RETURNING "id", "companyId", "siteId", "name", "type", "isArchived", "createdAt", "updatedAt"
  `);
  return rows[0] ?? null;
}

async function updateCompanyRow(db: DbClient, id: string, input: { name: string; shortName?: string }) {
  const rows = await db.$queryRaw<CompanyRow[]>(Prisma.sql`
    UPDATE "Company"
    SET "name" = ${input.name},
        "shortName" = ${toOptionalTrimmedString(input.shortName) ?? null},
        "updatedAt" = ${new Date()}
    WHERE "id" = ${id}
    RETURNING "id", "name", "shortName", "isArchived", "createdAt", "updatedAt"
  `);
  return rows[0] ?? null;
}

async function updateSiteRow(db: DbClient, id: string, input: { companyId: string; name: string }) {
  const rows = await db.$queryRaw<SiteRow[]>(Prisma.sql`
    UPDATE "Site"
    SET "companyId" = ${input.companyId},
        "name" = ${input.name},
        "updatedAt" = ${new Date()}
    WHERE "id" = ${id}
    RETURNING "id", "companyId", "name", "isArchived", "createdAt", "updatedAt"
  `);
  return rows[0] ?? null;
}

async function updateFacilityRow(
  db: DbClient,
  id: string,
  input: { companyId: string; siteId: string; name: string; type?: string }
) {
  const rows = await db.$queryRaw<FacilityRow[]>(Prisma.sql`
    UPDATE "Facility"
    SET "companyId" = ${input.companyId},
        "siteId" = ${input.siteId},
        "name" = ${input.name},
        "type" = ${toOptionalTrimmedString(input.type) ?? null},
        "updatedAt" = ${new Date()}
    WHERE "id" = ${id}
    RETURNING "id", "companyId", "siteId", "name", "type", "isArchived", "createdAt", "updatedAt"
  `);
  return rows[0] ?? null;
}

async function setCompanyArchived(db: DbClient, id: string, isArchived: boolean) {
  const rows = await db.$queryRaw<CompanyRow[]>(Prisma.sql`
    UPDATE "Company"
    SET "isArchived" = ${isArchived},
        "updatedAt" = ${new Date()}
    WHERE "id" = ${id}
    RETURNING "id", "name", "shortName", "isArchived", "createdAt", "updatedAt"
  `);
  return rows[0] ?? null;
}

async function setSiteArchived(db: DbClient, id: string, isArchived: boolean) {
  const rows = await db.$queryRaw<SiteRow[]>(Prisma.sql`
    UPDATE "Site"
    SET "isArchived" = ${isArchived},
        "updatedAt" = ${new Date()}
    WHERE "id" = ${id}
    RETURNING "id", "companyId", "name", "isArchived", "createdAt", "updatedAt"
  `);
  return rows[0] ?? null;
}

async function setFacilityArchived(db: DbClient, id: string, isArchived: boolean) {
  const rows = await db.$queryRaw<FacilityRow[]>(Prisma.sql`
    UPDATE "Facility"
    SET "isArchived" = ${isArchived},
        "updatedAt" = ${new Date()}
    WHERE "id" = ${id}
    RETURNING "id", "companyId", "siteId", "name", "type", "isArchived", "createdAt", "updatedAt"
  `);
  return rows[0] ?? null;
}

async function listScopesSnapshot(prisma: PrismaClient): Promise<ScopesSnapshotDto> {
  const [companies, sites, facilities] = await Promise.all([
    listCompanies(prisma),
    listSites(prisma),
    listFacilities(prisma)
  ]);

  return {
    companies: companies.map((company: CompanyRow) => toCompanyDto(company)),
    sites: sites.map((site: SiteRow) => toSiteDto(site)),
    facilities: facilities.map((facility: FacilityRow) => toFacilityDto(facility))
  };
}

async function ensureScopesBulkMutationAllowed(db: DbClient) {
  const projectCount = await db.project.count();
  const blockers = [projectCount > 0 ? "projects" : null].filter(isPresent);

  if (blockers.length === 0) {
    return null;
  }

  return `Scopes cannot be replaced or deleted while persisted scope-dependent data exists (${blockers.join(", ")}). Import a full package with dependent domains or clear persisted projects first.`;
}

async function replaceScopesSnapshot(prisma: PrismaClient, snapshot: ScopesSnapshotDto) {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`DELETE FROM "Facility"`);
    await tx.$executeRaw(Prisma.sql`DELETE FROM "Site"`);
    await tx.$executeRaw(Prisma.sql`DELETE FROM "Company"`);

    for (const company of snapshot.companies) {
      await insertCompany(tx, {
        id: company.id,
        name: company.name,
        shortName: company.shortName,
        isArchived: company.isArchived,
        createdAt: toDateValue(company.createdAt),
        updatedAt: toDateValue(company.updatedAt)
      });
    }

    for (const site of snapshot.sites) {
      await insertSite(tx, {
        id: site.id,
        companyId: site.companyId,
        name: site.name,
        isArchived: site.isArchived,
        createdAt: toDateValue(site.createdAt),
        updatedAt: toDateValue(site.updatedAt)
      });
    }

    for (const facility of snapshot.facilities) {
      await insertFacility(tx, {
        id: facility.id,
        companyId: facility.companyId,
        siteId: facility.siteId,
        name: facility.name,
        type: facility.type,
        isArchived: facility.isArchived,
        createdAt: toDateValue(facility.createdAt),
        updatedAt: toDateValue(facility.updatedAt)
      });
    }
  });
}

async function readScopesSnapshotFromPortal(prisma: PrismaClient) {
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
  return normalizeScopesSnapshot(payload.scopes);
}

async function writeScopesSnapshotToPortal(prisma: PrismaClient, scopes: ScopesSnapshotDto, updatedByUserId: string) {
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

  payload.scopes = scopes as unknown as Prisma.JsonObject;

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

export function createScopesRouter(prisma: PrismaClient) {
  const router = Router();

  router.get("/scopes", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireInternalRouteUser(req, res, prisma);
      if (!user) {
        return;
      }

      res.json(await listScopesSnapshot(prisma));
    } catch (error) {
      next(error);
    }
  });

  router.post("/scopes/companies", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireInternalRouteUser(req, res, prisma);
      if (!user) {
        return;
      }

      const requestedId = toOptionalTrimmedString(req.body?.id);
      const name = ensureStringField(req.body?.name);
      const shortName = toOptionalTrimmedString(req.body?.shortName);

      if (!name) {
        res.status(400).json({ ok: false, message: "name is required." });
        return;
      }

      const company = await insertCompany(prisma, {
        id: requestedId ?? createServerId("company"),
        name,
        shortName
      });

      res.status(201).json({
        ok: true,
        company: company ? toCompanyDto(company) : null
      });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/scopes/companies/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireInternalRouteUser(req, res, prisma);
      if (!user) {
        return;
      }

      const existing = await findCompanyById(prisma, req.params.id);
      if (!existing) {
        res.status(404).json({ ok: false, message: "Company not found." });
        return;
      }

      const name = hasOwn(req.body, "name") ? ensureStringField(req.body?.name) : existing.name;
      const shortName = hasOwn(req.body, "shortName")
        ? toOptionalTrimmedString(req.body?.shortName)
        : existing.shortName ?? undefined;

      if (!name) {
        res.status(400).json({ ok: false, message: "name is required." });
        return;
      }

      const updated = await updateCompanyRow(prisma, existing.id, { name, shortName });
      res.json({
        ok: true,
        company: updated ? toCompanyDto(updated) : null
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/scopes/companies/:id/archive", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireInternalRouteUser(req, res, prisma);
      if (!user) {
        return;
      }

      const existing = await findCompanyById(prisma, req.params.id);
      if (!existing) {
        res.status(404).json({ ok: false, message: "Company not found." });
        return;
      }

      const updated = existing.isArchived ? existing : await setCompanyArchived(prisma, existing.id, true);
      res.json({
        ok: true,
        company: updated ? toCompanyDto(updated) : null
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/scopes/companies/:id/restore", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireInternalRouteUser(req, res, prisma);
      if (!user) {
        return;
      }

      const existing = await findCompanyById(prisma, req.params.id);
      if (!existing) {
        res.status(404).json({ ok: false, message: "Company not found." });
        return;
      }

      const updated = !existing.isArchived ? existing : await setCompanyArchived(prisma, existing.id, false);
      res.json({
        ok: true,
        company: updated ? toCompanyDto(updated) : null
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/scopes/sites", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireInternalRouteUser(req, res, prisma);
      if (!user) {
        return;
      }

      const requestedId = toOptionalTrimmedString(req.body?.id);
      const companyId = ensureStringField(req.body?.companyId);
      const name = ensureStringField(req.body?.name);

      if (!companyId || !name) {
        res.status(400).json({ ok: false, message: "companyId and name are required." });
        return;
      }

      const company = await findCompanyById(prisma, companyId);
      if (!company) {
        res.status(404).json({ ok: false, message: "Company not found." });
        return;
      }

      const site = await insertSite(prisma, {
        id: requestedId ?? createServerId("site"),
        companyId,
        name
      });

      res.status(201).json({
        ok: true,
        site: site ? toSiteDto(site) : null
      });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/scopes/sites/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireInternalRouteUser(req, res, prisma);
      if (!user) {
        return;
      }

      const existing = await findSiteById(prisma, req.params.id);
      if (!existing) {
        res.status(404).json({ ok: false, message: "Site not found." });
        return;
      }

      const companyId = hasOwn(req.body, "companyId") ? ensureStringField(req.body?.companyId) : existing.companyId;
      const name = hasOwn(req.body, "name") ? ensureStringField(req.body?.name) : existing.name;

      if (!companyId || !name) {
        res.status(400).json({ ok: false, message: "companyId and name are required." });
        return;
      }

      const company = await findCompanyById(prisma, companyId);
      if (!company) {
        res.status(404).json({ ok: false, message: "Company not found." });
        return;
      }

      const updated = await updateSiteRow(prisma, existing.id, { companyId, name });
      res.json({
        ok: true,
        site: updated ? toSiteDto(updated) : null
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/scopes/sites/:id/archive", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireInternalRouteUser(req, res, prisma);
      if (!user) {
        return;
      }

      const existing = await findSiteById(prisma, req.params.id);
      if (!existing) {
        res.status(404).json({ ok: false, message: "Site not found." });
        return;
      }

      const updated = existing.isArchived ? existing : await setSiteArchived(prisma, existing.id, true);
      res.json({
        ok: true,
        site: updated ? toSiteDto(updated) : null
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/scopes/sites/:id/restore", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireInternalRouteUser(req, res, prisma);
      if (!user) {
        return;
      }

      const existing = await findSiteById(prisma, req.params.id);
      if (!existing) {
        res.status(404).json({ ok: false, message: "Site not found." });
        return;
      }

      const updated = !existing.isArchived ? existing : await setSiteArchived(prisma, existing.id, false);
      res.json({
        ok: true,
        site: updated ? toSiteDto(updated) : null
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/scopes/facilities", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireInternalRouteUser(req, res, prisma);
      if (!user) {
        return;
      }

      const requestedId = toOptionalTrimmedString(req.body?.id);
      const companyId = ensureStringField(req.body?.companyId);
      const siteId = ensureStringField(req.body?.siteId);
      const name = ensureStringField(req.body?.name);
      const type = toOptionalTrimmedString(req.body?.type);

      if (!companyId || !siteId || !name) {
        res.status(400).json({ ok: false, message: "companyId, siteId and name are required." });
        return;
      }

      const site = await findSiteById(prisma, siteId);
      if (!site) {
        res.status(404).json({ ok: false, message: "Site not found." });
        return;
      }

      if (site.companyId !== companyId) {
        res.status(400).json({ ok: false, message: "siteId does not belong to companyId." });
        return;
      }

      const facility = await insertFacility(prisma, {
        id: requestedId ?? createServerId("facility"),
        companyId,
        siteId,
        name,
        type
      });

      res.status(201).json({
        ok: true,
        facility: facility ? toFacilityDto(facility) : null
      });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/scopes/facilities/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireInternalRouteUser(req, res, prisma);
      if (!user) {
        return;
      }

      const existing = await findFacilityById(prisma, req.params.id);
      if (!existing) {
        res.status(404).json({ ok: false, message: "Facility not found." });
        return;
      }

      const companyId = hasOwn(req.body, "companyId") ? ensureStringField(req.body?.companyId) : existing.companyId;
      const siteId = hasOwn(req.body, "siteId") ? ensureStringField(req.body?.siteId) : existing.siteId;
      const name = hasOwn(req.body, "name") ? ensureStringField(req.body?.name) : existing.name;
      const type = hasOwn(req.body, "type") ? toOptionalTrimmedString(req.body?.type) : existing.type ?? undefined;

      if (!companyId || !siteId || !name) {
        res.status(400).json({ ok: false, message: "companyId, siteId and name are required." });
        return;
      }

      const site = await findSiteById(prisma, siteId);
      if (!site) {
        res.status(404).json({ ok: false, message: "Site not found." });
        return;
      }

      if (site.companyId !== companyId) {
        res.status(400).json({ ok: false, message: "siteId does not belong to companyId." });
        return;
      }

      const updated = await updateFacilityRow(prisma, existing.id, {
        companyId,
        siteId,
        name,
        type
      });

      res.json({
        ok: true,
        facility: updated ? toFacilityDto(updated) : null
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/scopes/facilities/:id/archive", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireInternalRouteUser(req, res, prisma);
      if (!user) {
        return;
      }

      const existing = await findFacilityById(prisma, req.params.id);
      if (!existing) {
        res.status(404).json({ ok: false, message: "Facility not found." });
        return;
      }

      const updated = existing.isArchived ? existing : await setFacilityArchived(prisma, existing.id, true);
      res.json({
        ok: true,
        facility: updated ? toFacilityDto(updated) : null
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/scopes/facilities/:id/restore", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireInternalRouteUser(req, res, prisma);
      if (!user) {
        return;
      }

      const existing = await findFacilityById(prisma, req.params.id);
      if (!existing) {
        res.status(404).json({ ok: false, message: "Facility not found." });
        return;
      }

      const updated = !existing.isArchived ? existing : await setFacilityArchived(prisma, existing.id, false);
      res.json({
        ok: true,
        facility: updated ? toFacilityDto(updated) : null
      });
    } catch (error) {
      next(error);
    }
  });

  router.put("/admin/internal/scopes/bulk-replace", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireAdminRouteUser(req, res, prisma);
      if (!user) {
        return;
      }

      const mutationConflict = await ensureScopesBulkMutationAllowed(prisma);
      if (mutationConflict) {
        res.status(409).json({ ok: false, message: mutationConflict });
        return;
      }

      const snapshot = normalizeScopesSnapshot(req.body);
      await replaceScopesSnapshot(prisma, snapshot);

      res.json({
        ok: true,
        scopes: await listScopesSnapshot(prisma)
      });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/admin/internal/scopes/bulk-delete", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireAdminRouteUser(req, res, prisma);
      if (!user) {
        return;
      }

      const mutationConflict = await ensureScopesBulkMutationAllowed(prisma);
      if (mutationConflict) {
        res.status(409).json({ ok: false, message: mutationConflict });
        return;
      }

      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw(Prisma.sql`DELETE FROM "Facility"`);
        await tx.$executeRaw(Prisma.sql`DELETE FROM "Site"`);
        await tx.$executeRaw(Prisma.sql`DELETE FROM "Company"`);
      });

      res.json({
        ok: true
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/admin/internal/scopes/backfill-from-snapshot", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireAdminRouteUser(req, res, prisma);
      if (!user) {
        return;
      }

      const snapshot = await readScopesSnapshotFromPortal(prisma);
      if (!snapshot) {
        res.status(404).json({ ok: false, message: "Snapshot scopes not found." });
        return;
      }

      await replaceScopesSnapshot(prisma, snapshot);

      res.json({
        ok: true,
        scopes: await listScopesSnapshot(prisma)
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/admin/internal/scopes/rollback-to-snapshot", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireAdminRouteUser(req, res, prisma);
      if (!user) {
        return;
      }

      const snapshot = await listScopesSnapshot(prisma);
      await writeScopesSnapshotToPortal(prisma, snapshot, user.id);

      res.json({
        ok: true,
        scopes: snapshot
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
