import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { Router, type NextFunction, type Request, type Response } from "express";
import {
  applyNoStoreHeaders,
  requireAdminRouteUser,
  requireInternalRouteUser
} from "./routeAuth.js";

type Authority = {
  id: string;
  name: string;
  shortName?: string;
  isArchived: boolean;
  createdAt?: string;
  updatedAt?: string;
};

type AuthorityContact = {
  id: string;
  authorityId: string;
  name: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  mobile?: string;
  roleTitle?: string;
  notes?: string;
  department?: string;
  isPrimary?: boolean;
  isArchived: boolean;
  createdAt?: string;
  updatedAt?: string;
};

type AuthoritiesSnapshotDto = {
  authorities: Authority[];
  contacts: AuthorityContact[];
};

type AuthorityRow = {
  id: string;
  name: string;
  shortName: string | null;
  isArchived: boolean;
  createdAt: Date;
  updatedAt: Date;
};

type AuthorityContactRow = {
  id: string;
  authorityId: string;
  name: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  roleTitle: string | null;
  notes: string | null;
  department: string | null;
  isPrimary: boolean;
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

function deriveContactName(input: { name?: string | null; firstName?: string | null; lastName?: string | null }) {
  const firstName = toOptionalTrimmedString(input.firstName) ?? "";
  const lastName = toOptionalTrimmedString(input.lastName) ?? "";
  const combinedName = [firstName, lastName].filter(Boolean).join(" ");
  if (combinedName) {
    return combinedName;
  }

  return toOptionalTrimmedString(input.name) ?? "";
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

function toAuthorityDto(authority: AuthorityRow): Authority {
  return {
    id: authority.id,
    name: authority.name,
    shortName: authority.shortName ?? "",
    isArchived: authority.isArchived,
    createdAt: authority.createdAt.toISOString(),
    updatedAt: authority.updatedAt.toISOString()
  };
}

function toContactDto(contact: AuthorityContactRow): AuthorityContact {
  return {
    id: contact.id,
    authorityId: contact.authorityId,
    name: deriveContactName(contact),
    firstName: contact.firstName ?? "",
    lastName: contact.lastName ?? "",
    email: contact.email ?? "",
    phone: contact.phone ?? "",
    mobile: contact.mobile ?? "",
    roleTitle: contact.roleTitle ?? "",
    notes: contact.notes ?? "",
    department: contact.department ?? "",
    isPrimary: contact.isPrimary,
    isArchived: contact.isArchived,
    createdAt: contact.createdAt.toISOString(),
    updatedAt: contact.updatedAt.toISOString()
  };
}

function normalizeAuthoritiesSnapshot(value: unknown): AuthoritiesSnapshotDto {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      authorities: [],
      contacts: []
    };
  }

  const row = value as {
    authorities?: unknown;
    contacts?: unknown;
  };

  const authorities = Array.isArray(row.authorities)
    ? row.authorities
        .map<Authority | null>((item) => {
          if (!item || typeof item !== "object") {
            return null;
          }

          const authority = item as Partial<Authority>;
          if (typeof authority.id !== "string" || !authority.id.trim() || typeof authority.name !== "string" || !authority.name.trim()) {
            return null;
          }

          const createdAt = toOptionalTrimmedString(authority.createdAt) ?? new Date().toISOString();
          const updatedAt = toOptionalTrimmedString(authority.updatedAt) ?? createdAt;

          return {
            id: authority.id,
            name: authority.name,
            shortName: authority.shortName ?? "",
            isArchived: Boolean(authority.isArchived),
            createdAt,
            updatedAt
          };
        })
        .filter(isPresent)
    : [];

  const authorityIds = new Set(authorities.map((authority) => authority.id));

  const contacts = Array.isArray(row.contacts)
    ? row.contacts
        .map<AuthorityContact | null>((item) => {
          if (!item || typeof item !== "object") {
            return null;
          }

          const contact = item as Partial<AuthorityContact>;
          if (
            typeof contact.id !== "string" ||
            !contact.id.trim() ||
            typeof contact.authorityId !== "string" ||
            !contact.authorityId.trim() ||
            !authorityIds.has(contact.authorityId)
          ) {
            return null;
          }

          const createdAt = toOptionalTrimmedString(contact.createdAt) ?? new Date().toISOString();
          const updatedAt = toOptionalTrimmedString(contact.updatedAt) ?? createdAt;
          const name = deriveContactName({
            name: typeof contact.name === "string" ? contact.name : undefined,
            firstName: typeof contact.firstName === "string" ? contact.firstName : undefined,
            lastName: typeof contact.lastName === "string" ? contact.lastName : undefined
          });
          if (!name) {
            return null;
          }

          return {
            id: contact.id,
            authorityId: contact.authorityId,
            name,
            firstName: contact.firstName ?? "",
            lastName: contact.lastName ?? "",
            email: contact.email ?? "",
            phone: contact.phone ?? "",
            mobile: contact.mobile ?? "",
            roleTitle: contact.roleTitle ?? "",
            notes: contact.notes ?? "",
            department: contact.department ?? "",
            isPrimary: Boolean(contact.isPrimary),
            isArchived: Boolean(contact.isArchived),
            createdAt,
            updatedAt
          };
        })
        .filter(isPresent)
    : [];

  return {
    authorities,
    contacts
  };
}

async function listAuthorityRows(db: DbClient) {
  return db.$queryRaw<AuthorityRow[]>(Prisma.sql`
    SELECT "id", "name", "shortName", "isArchived", "createdAt", "updatedAt"
    FROM "Authority"
    ORDER BY "createdAt" ASC, "id" ASC
  `);
}

async function listAuthorityContactRows(db: DbClient) {
  return db.$queryRaw<AuthorityContactRow[]>(Prisma.sql`
    SELECT "id", "authorityId", "name", "firstName", "lastName", "email", "phone", "mobile", "roleTitle", "notes", "department", "isPrimary", "isArchived", "createdAt", "updatedAt"
    FROM "AuthorityContact"
    ORDER BY "createdAt" ASC, "id" ASC
  `);
}

async function findAuthorityById(db: DbClient, id: string) {
  const rows = await db.$queryRaw<AuthorityRow[]>(Prisma.sql`
    SELECT "id", "name", "shortName", "isArchived", "createdAt", "updatedAt"
    FROM "Authority"
    WHERE "id" = ${id}
    LIMIT 1
  `);
  return rows[0] ?? null;
}

async function findAuthorityContactById(db: DbClient, id: string) {
  const rows = await db.$queryRaw<AuthorityContactRow[]>(Prisma.sql`
    SELECT "id", "authorityId", "name", "firstName", "lastName", "email", "phone", "mobile", "roleTitle", "notes", "department", "isPrimary", "isArchived", "createdAt", "updatedAt"
    FROM "AuthorityContact"
    WHERE "id" = ${id}
    LIMIT 1
  `);
  return rows[0] ?? null;
}

async function insertAuthority(
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
  const rows = await db.$queryRaw<AuthorityRow[]>(Prisma.sql`
    INSERT INTO "Authority" ("id", "name", "shortName", "isArchived", "createdAt", "updatedAt")
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

async function insertAuthorityContact(
  db: DbClient,
  input: {
    id: string;
    authorityId: string;
    name: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    mobile?: string;
    roleTitle?: string;
    notes?: string;
    department?: string;
    isPrimary?: boolean;
    isArchived?: boolean;
    createdAt?: Date;
    updatedAt?: Date;
  }
) {
  const rows = await db.$queryRaw<AuthorityContactRow[]>(Prisma.sql`
    INSERT INTO "AuthorityContact" ("id", "authorityId", "name", "firstName", "lastName", "email", "phone", "mobile", "roleTitle", "notes", "department", "isPrimary", "isArchived", "createdAt", "updatedAt")
    VALUES (
      ${input.id},
      ${input.authorityId},
      ${input.name},
      ${toOptionalTrimmedString(input.firstName) ?? null},
      ${toOptionalTrimmedString(input.lastName) ?? null},
      ${toOptionalTrimmedString(input.email) ?? null},
      ${toOptionalTrimmedString(input.phone) ?? null},
      ${toOptionalTrimmedString(input.mobile) ?? null},
      ${toOptionalTrimmedString(input.roleTitle) ?? null},
      ${toOptionalTrimmedString(input.notes) ?? null},
      ${toOptionalTrimmedString(input.department) ?? null},
      ${input.isPrimary ?? false},
      ${input.isArchived ?? false},
      ${input.createdAt ?? new Date()},
      ${input.updatedAt ?? input.createdAt ?? new Date()}
    )
    RETURNING "id", "authorityId", "name", "firstName", "lastName", "email", "phone", "mobile", "roleTitle", "notes", "department", "isPrimary", "isArchived", "createdAt", "updatedAt"
  `);
  return rows[0] ?? null;
}

async function updateAuthorityRow(db: DbClient, id: string, input: { name: string; shortName?: string }) {
  const rows = await db.$queryRaw<AuthorityRow[]>(Prisma.sql`
    UPDATE "Authority"
    SET "name" = ${input.name},
        "shortName" = ${toOptionalTrimmedString(input.shortName) ?? null},
        "updatedAt" = ${new Date()}
    WHERE "id" = ${id}
    RETURNING "id", "name", "shortName", "isArchived", "createdAt", "updatedAt"
  `);
  return rows[0] ?? null;
}

async function updateAuthorityContactRow(
  db: DbClient,
  id: string,
  input: {
    authorityId: string;
    name: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    mobile?: string;
    roleTitle?: string;
    notes?: string;
    department?: string;
    isPrimary?: boolean;
  }
) {
  const rows = await db.$queryRaw<AuthorityContactRow[]>(Prisma.sql`
    UPDATE "AuthorityContact"
    SET "authorityId" = ${input.authorityId},
        "name" = ${input.name},
        "firstName" = ${toOptionalTrimmedString(input.firstName) ?? null},
        "lastName" = ${toOptionalTrimmedString(input.lastName) ?? null},
        "email" = ${toOptionalTrimmedString(input.email) ?? null},
        "phone" = ${toOptionalTrimmedString(input.phone) ?? null},
        "mobile" = ${toOptionalTrimmedString(input.mobile) ?? null},
        "roleTitle" = ${toOptionalTrimmedString(input.roleTitle) ?? null},
        "notes" = ${toOptionalTrimmedString(input.notes) ?? null},
        "department" = ${toOptionalTrimmedString(input.department) ?? null},
        "isPrimary" = ${input.isPrimary ?? false},
        "updatedAt" = ${new Date()}
    WHERE "id" = ${id}
    RETURNING "id", "authorityId", "name", "firstName", "lastName", "email", "phone", "mobile", "roleTitle", "notes", "department", "isPrimary", "isArchived", "createdAt", "updatedAt"
  `);
  return rows[0] ?? null;
}

async function setAuthorityArchived(db: DbClient, id: string, isArchived: boolean) {
  const rows = await db.$queryRaw<AuthorityRow[]>(Prisma.sql`
    UPDATE "Authority"
    SET "isArchived" = ${isArchived},
        "updatedAt" = ${new Date()}
    WHERE "id" = ${id}
    RETURNING "id", "name", "shortName", "isArchived", "createdAt", "updatedAt"
  `);
  return rows[0] ?? null;
}

async function setAuthorityContactArchived(db: DbClient, id: string, isArchived: boolean) {
  const rows = await db.$queryRaw<AuthorityContactRow[]>(Prisma.sql`
    UPDATE "AuthorityContact"
    SET "isArchived" = ${isArchived},
        "updatedAt" = ${new Date()}
    WHERE "id" = ${id}
    RETURNING "id", "authorityId", "name", "firstName", "lastName", "email", "phone", "mobile", "roleTitle", "notes", "department", "isPrimary", "isArchived", "createdAt", "updatedAt"
  `);
  return rows[0] ?? null;
}

async function listAuthoritiesSnapshot(prisma: PrismaClient): Promise<AuthoritiesSnapshotDto> {
  const [authorities, contacts] = await Promise.all([
    listAuthorityRows(prisma),
    listAuthorityContactRows(prisma)
  ]);

  return {
    authorities: authorities.map((authority: AuthorityRow) => toAuthorityDto(authority)),
    contacts: contacts.map((contact: AuthorityContactRow) => toContactDto(contact))
  };
}

async function replaceAuthoritiesSnapshot(prisma: PrismaClient, snapshot: AuthoritiesSnapshotDto) {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw(Prisma.sql`DELETE FROM "AuthorityContact"`);
    await tx.$executeRaw(Prisma.sql`DELETE FROM "Authority"`);

    for (const authority of snapshot.authorities) {
      await insertAuthority(tx, {
        id: authority.id,
        name: authority.name,
        shortName: authority.shortName,
        isArchived: authority.isArchived,
        createdAt: toDateValue(authority.createdAt),
        updatedAt: toDateValue(authority.updatedAt)
      });
    }

    for (const contact of snapshot.contacts) {
      await insertAuthorityContact(tx, {
        id: contact.id,
        authorityId: contact.authorityId,
        name: deriveContactName(contact),
        firstName: contact.firstName,
        lastName: contact.lastName,
        email: contact.email,
        phone: contact.phone,
        mobile: contact.mobile,
        roleTitle: contact.roleTitle,
        notes: contact.notes,
        department: contact.department,
        isPrimary: contact.isPrimary,
        isArchived: contact.isArchived,
        createdAt: toDateValue(contact.createdAt),
        updatedAt: toDateValue(contact.updatedAt)
      });
    }
  });
}

async function readAuthoritiesSnapshotFromPortal(prisma: PrismaClient) {
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
  return normalizeAuthoritiesSnapshot(payload.authorities);
}

async function writeAuthoritiesSnapshotToPortal(
  prisma: PrismaClient,
  authorities: AuthoritiesSnapshotDto,
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

  payload.authorities = authorities as unknown as Prisma.JsonObject;

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

export function createAuthoritiesRouter(prisma: PrismaClient) {
  const router = Router();

  router.get("/authorities", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireInternalRouteUser(req, res, prisma);
      if (!user) {
        return;
      }

      res.json(await listAuthoritiesSnapshot(prisma));
    } catch (error) {
      next(error);
    }
  });

  router.post("/authorities", async (req: Request, res: Response, next: NextFunction) => {
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

      const authority = await insertAuthority(prisma, {
        id: requestedId ?? createServerId("authority"),
        name,
        shortName
      });

      res.status(201).json({
        ok: true,
        authority: authority ? toAuthorityDto(authority) : null
      });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/authorities/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireInternalRouteUser(req, res, prisma);
      if (!user) {
        return;
      }

      const existing = await findAuthorityById(prisma, req.params.id);
      if (!existing) {
        res.status(404).json({ ok: false, message: "Authority not found." });
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

      const updated = await updateAuthorityRow(prisma, existing.id, { name, shortName });
      res.json({
        ok: true,
        authority: updated ? toAuthorityDto(updated) : null
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/authorities/:id/archive", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireInternalRouteUser(req, res, prisma);
      if (!user) {
        return;
      }

      const existing = await findAuthorityById(prisma, req.params.id);
      if (!existing) {
        res.status(404).json({ ok: false, message: "Authority not found." });
        return;
      }

      const updated = existing.isArchived ? existing : await setAuthorityArchived(prisma, existing.id, true);
      res.json({
        ok: true,
        authority: updated ? toAuthorityDto(updated) : null
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/authorities/:id/restore", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireInternalRouteUser(req, res, prisma);
      if (!user) {
        return;
      }

      const existing = await findAuthorityById(prisma, req.params.id);
      if (!existing) {
        res.status(404).json({ ok: false, message: "Authority not found." });
        return;
      }

      const updated = !existing.isArchived ? existing : await setAuthorityArchived(prisma, existing.id, false);
      res.json({
        ok: true,
        authority: updated ? toAuthorityDto(updated) : null
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/authorities/contacts", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireInternalRouteUser(req, res, prisma);
      if (!user) {
        return;
      }

      const requestedId = toOptionalTrimmedString(req.body?.id);
      const authorityId = ensureStringField(req.body?.authorityId);
      const firstName = toOptionalTrimmedString(req.body?.firstName);
      const lastName = toOptionalTrimmedString(req.body?.lastName);
      const name = deriveContactName({
        name: ensureStringField(req.body?.name),
        firstName,
        lastName
      });
      const email = toOptionalTrimmedString(req.body?.email);
      const phone = toOptionalTrimmedString(req.body?.phone);
      const mobile = toOptionalTrimmedString(req.body?.mobile);
      const roleTitle = toOptionalTrimmedString(req.body?.roleTitle);
      const notes = toOptionalTrimmedString(req.body?.notes);
      const department = toOptionalTrimmedString(req.body?.department);
      const isPrimary = hasOwn(req.body, "isPrimary") ? Boolean(req.body?.isPrimary) : false;

      if (!authorityId || !name) {
        res.status(400).json({ ok: false, message: "authorityId and name are required." });
        return;
      }

      const authority = await findAuthorityById(prisma, authorityId);
      if (!authority) {
        res.status(404).json({ ok: false, message: "Authority not found." });
        return;
      }

      const contact = await insertAuthorityContact(prisma, {
        id: requestedId ?? createServerId("authority-contact"),
        authorityId,
        name,
        firstName,
        lastName,
        email,
        phone,
        mobile,
        roleTitle,
        notes,
        department,
        isPrimary
      });

      res.status(201).json({
        ok: true,
        contact: contact ? toContactDto(contact) : null
      });
    } catch (error) {
      next(error);
    }
  });

  router.patch("/authorities/contacts/:id", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireInternalRouteUser(req, res, prisma);
      if (!user) {
        return;
      }

      const existing = await findAuthorityContactById(prisma, req.params.id);
      if (!existing) {
        res.status(404).json({ ok: false, message: "Authority contact not found." });
        return;
      }

      const authorityId = hasOwn(req.body, "authorityId")
        ? ensureStringField(req.body?.authorityId)
        : existing.authorityId;
      const firstName = hasOwn(req.body, "firstName")
        ? toOptionalTrimmedString(req.body?.firstName)
        : existing.firstName ?? undefined;
      const lastName = hasOwn(req.body, "lastName")
        ? toOptionalTrimmedString(req.body?.lastName)
        : existing.lastName ?? undefined;
      const name = deriveContactName({
        name: hasOwn(req.body, "name") ? ensureStringField(req.body?.name) : existing.name,
        firstName,
        lastName
      });
      const email = hasOwn(req.body, "email")
        ? toOptionalTrimmedString(req.body?.email)
        : existing.email ?? undefined;
      const phone = hasOwn(req.body, "phone")
        ? toOptionalTrimmedString(req.body?.phone)
        : existing.phone ?? undefined;
      const mobile = hasOwn(req.body, "mobile")
        ? toOptionalTrimmedString(req.body?.mobile)
        : existing.mobile ?? undefined;
      const roleTitle = hasOwn(req.body, "roleTitle")
        ? toOptionalTrimmedString(req.body?.roleTitle)
        : existing.roleTitle ?? undefined;
      const notes = hasOwn(req.body, "notes")
        ? toOptionalTrimmedString(req.body?.notes)
        : existing.notes ?? undefined;
      const department = hasOwn(req.body, "department")
        ? toOptionalTrimmedString(req.body?.department)
        : existing.department ?? undefined;
      const isPrimary = hasOwn(req.body, "isPrimary")
        ? Boolean(req.body?.isPrimary)
        : existing.isPrimary;

      if (!authorityId || !name) {
        res.status(400).json({ ok: false, message: "authorityId and name are required." });
        return;
      }

      const authority = await findAuthorityById(prisma, authorityId);
      if (!authority) {
        res.status(404).json({ ok: false, message: "Authority not found." });
        return;
      }

      const updated = await updateAuthorityContactRow(prisma, existing.id, {
        authorityId,
        name,
        firstName,
        lastName,
        email,
        phone,
        mobile,
        roleTitle,
        notes,
        department,
        isPrimary
      });

      res.json({
        ok: true,
        contact: updated ? toContactDto(updated) : null
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/authorities/contacts/:id/archive", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireInternalRouteUser(req, res, prisma);
      if (!user) {
        return;
      }

      const existing = await findAuthorityContactById(prisma, req.params.id);
      if (!existing) {
        res.status(404).json({ ok: false, message: "Authority contact not found." });
        return;
      }

      const updated =
        existing.isArchived ? existing : await setAuthorityContactArchived(prisma, existing.id, true);

      res.json({
        ok: true,
        contact: updated ? toContactDto(updated) : null
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/authorities/contacts/:id/restore", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireInternalRouteUser(req, res, prisma);
      if (!user) {
        return;
      }

      const existing = await findAuthorityContactById(prisma, req.params.id);
      if (!existing) {
        res.status(404).json({ ok: false, message: "Authority contact not found." });
        return;
      }

      const updated =
        !existing.isArchived ? existing : await setAuthorityContactArchived(prisma, existing.id, false);

      res.json({
        ok: true,
        contact: updated ? toContactDto(updated) : null
      });
    } catch (error) {
      next(error);
    }
  });

  router.put("/admin/internal/authorities/bulk-replace", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireAdminRouteUser(req, res, prisma);
      if (!user) {
        return;
      }

      const snapshot = normalizeAuthoritiesSnapshot(req.body);
      await replaceAuthoritiesSnapshot(prisma, snapshot);

      res.json({
        ok: true,
        authorities: await listAuthoritiesSnapshot(prisma)
      });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/admin/internal/authorities/bulk-delete", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireAdminRouteUser(req, res, prisma);
      if (!user) {
        return;
      }

      await prisma.$transaction(async (tx) => {
        await tx.$executeRaw(Prisma.sql`DELETE FROM "AuthorityContact"`);
        await tx.$executeRaw(Prisma.sql`DELETE FROM "Authority"`);
      });

      res.json({
        ok: true
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/admin/internal/authorities/backfill-from-snapshot", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireAdminRouteUser(req, res, prisma);
      if (!user) {
        return;
      }

      const snapshot = await readAuthoritiesSnapshotFromPortal(prisma);
      if (!snapshot) {
        res.status(404).json({ ok: false, message: "Snapshot authorities not found." });
        return;
      }

      await replaceAuthoritiesSnapshot(prisma, snapshot);

      res.json({
        ok: true,
        authorities: await listAuthoritiesSnapshot(prisma)
      });
    } catch (error) {
      next(error);
    }
  });

  router.post("/admin/internal/authorities/rollback-to-snapshot", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireAdminRouteUser(req, res, prisma);
      if (!user) {
        return;
      }

      const authorities = await listAuthoritiesSnapshot(prisma);
      await writeAuthoritiesSnapshotToPortal(prisma, authorities, user.id);

      res.json({
        ok: true,
        authorities
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
