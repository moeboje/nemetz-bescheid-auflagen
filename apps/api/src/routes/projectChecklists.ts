import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { Router, type NextFunction, type Request, type Response } from "express";
import {
  applyNoStoreHeaders,
  requireAdminRoutePermissions,
  requireAuthenticatedRouteUser,
  requireInternalRouteUser
} from "./routeAuth.js";
import {
  getReadableProjectIdsForDomain,
  requireProjectDomainRead,
  requireProjectDomainReadPermission,
  requireProjectDomainWrite
} from "../projectAccess.js";
import type { AppConfig } from "../config.js";
import { createPerfTimer } from "../perf.js";

const CHECKLIST_ITEM_STATUS_VALUES = [
  "OPEN",
  "IN_PROGRESS",
  "DONE",
  "NOT_REQUIRED"
] as const;

type ChecklistItemStatusValue = (typeof CHECKLIST_ITEM_STATUS_VALUES)[number];

type ProjectChecklistItemDto = {
  id: string;
  title: string;
  description?: string;
  status: ChecklistItemStatusValue;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

type ProjectChecklistSectionDto = {
  id: string;
  title: string;
  description?: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  items: ProjectChecklistItemDto[];
};

type ProjectChecklistDto = {
  id: string;
  projectId: string;
  createdAt: string;
  updatedAt: string;
  sections: ProjectChecklistSectionDto[];
};

type NormalizedProjectChecklistItem = {
  id: string;
  title: string;
  description?: string;
  status: ChecklistItemStatusValue;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

type NormalizedProjectChecklistSection = {
  id: string;
  title: string;
  description?: string;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  items: NormalizedProjectChecklistItem[];
};

type NormalizedProjectChecklist = {
  id: string;
  projectId: string;
  createdAt: Date;
  updatedAt: Date;
  sections: NormalizedProjectChecklistSection[];
};

type DbProjectChecklistRow = {
  id: string;
  projectId: string;
  createdAt: Date | string;
  updatedAt: Date | string;
};

type DbProjectChecklistSectionRow = {
  id: string;
  projectChecklistId: string;
  title: string;
  description: string | null;
  sortOrder: number;
  createdAt: Date | string;
  updatedAt: Date | string;
};

type DbProjectChecklistItemRow = {
  id: string;
  projectChecklistSectionId: string;
  title: string;
  description: string | null;
  status: string;
  sortOrder: number;
  createdAt: Date | string;
  updatedAt: Date | string;
};

type DbProjectChecklistSnapshot = {
  id: string;
  projectId: string;
  createdAt: Date;
  updatedAt: Date;
  sections: Array<{
    id: string;
    title: string;
    description?: string;
    sortOrder: number;
    createdAt: Date;
    updatedAt: Date;
    items: NormalizedProjectChecklistItem[];
  }>;
};

type DbClient = PrismaClient | Prisma.TransactionClient;

function nowDate() {
  return new Date();
}

function createServerId(prefix: string) {
  return `${prefix}-${randomUUID()}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toOptionalTrimmedString(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function ensureNonEmptyTitle(value: unknown, message: string) {
  const title = toOptionalTrimmedString(value);
  if (!title) {
    throw new Error(message);
  }
  return title;
}

function toDateValue(value: unknown) {
  if (value instanceof Date) {
    return value;
  }
  if (typeof value !== "string" || !value.trim()) {
    return nowDate();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? nowDate() : parsed;
}

function normalizeChecklistItemStatus(value: unknown): ChecklistItemStatusValue {
  if (value === undefined || value === null || value === "") {
    return "OPEN";
  }

  if (
    typeof value === "string" &&
    (CHECKLIST_ITEM_STATUS_VALUES as readonly string[]).includes(value)
  ) {
    return value as ChecklistItemStatusValue;
  }

  throw new Error(
    `Invalid checklist item status. Allowed values: ${CHECKLIST_ITEM_STATUS_VALUES.join(", ")}.`
  );
}

function assertUniqueIds(kind: string, ids: string[]) {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      throw new Error(`Duplicate ${kind} ids are not allowed.`);
    }
    seen.add(id);
  }
}

function normalizeProjectChecklistInput(
  projectId: string,
  value: unknown,
  existingChecklistId?: string
): NormalizedProjectChecklist {
  if (!isRecord(value)) {
    throw new Error("Invalid project checklist payload.");
  }

  const sectionsRaw = Array.isArray(value.sections) ? value.sections : [];
  const normalizedSections = sectionsRaw.map((rawSection, sectionIndex) => {
    if (!isRecord(rawSection)) {
      throw new Error("Invalid project checklist section payload.");
    }

    const itemsRaw = Array.isArray(rawSection.items) ? rawSection.items : [];
    const normalizedItems = itemsRaw.map((rawItem, itemIndex) => {
      if (!isRecord(rawItem)) {
        throw new Error("Invalid project checklist item payload.");
      }

      return {
        id: toOptionalTrimmedString(rawItem.id) ?? createServerId("pci"),
        title: ensureNonEmptyTitle(rawItem.title, "Checklist items require a title."),
        description: toOptionalTrimmedString(rawItem.description),
        status: normalizeChecklistItemStatus(rawItem.status),
        sortOrder: itemIndex,
        createdAt: toDateValue(rawItem.createdAt),
        updatedAt: toDateValue(rawItem.updatedAt)
      } satisfies NormalizedProjectChecklistItem;
    });

    assertUniqueIds(
      "checklist item",
      normalizedItems.map((item) => item.id)
    );

    return {
      id: toOptionalTrimmedString(rawSection.id) ?? createServerId("pcs"),
      title: ensureNonEmptyTitle(rawSection.title, "Checklist sections require a title."),
      description: toOptionalTrimmedString(rawSection.description),
      sortOrder: sectionIndex,
      createdAt: toDateValue(rawSection.createdAt),
      updatedAt: toDateValue(rawSection.updatedAt),
      items: normalizedItems
    } satisfies NormalizedProjectChecklistSection;
  });

  assertUniqueIds(
    "checklist section",
    normalizedSections.map((section) => section.id)
  );

  return {
    id: existingChecklistId ?? toOptionalTrimmedString(value.id) ?? createServerId("pcl"),
    projectId,
    createdAt: toDateValue(value.createdAt),
    updatedAt: toDateValue(value.updatedAt),
    sections: normalizedSections
  };
}

function toProjectChecklistDto(snapshot: DbProjectChecklistSnapshot): ProjectChecklistDto {
  return {
    id: snapshot.id,
    projectId: snapshot.projectId,
    createdAt: snapshot.createdAt.toISOString(),
    updatedAt: snapshot.updatedAt.toISOString(),
    sections: snapshot.sections.map((section) => ({
      id: section.id,
      title: section.title,
      description: section.description,
      sortOrder: section.sortOrder,
      createdAt: section.createdAt.toISOString(),
      updatedAt: section.updatedAt.toISOString(),
      items: section.items.map((item) => ({
        id: item.id,
        title: item.title,
        description: item.description,
        status: item.status,
        sortOrder: item.sortOrder,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString()
      }))
    }))
  };
}

function buildChecklistSnapshot(
  checklistRow: DbProjectChecklistRow,
  sectionsByChecklistId: Map<string, DbProjectChecklistSectionRow[]>,
  itemsBySectionId: Map<string, DbProjectChecklistItemRow[]>
): DbProjectChecklistSnapshot {
  const sectionRows = sectionsByChecklistId.get(checklistRow.id) ?? [];

  return {
    id: checklistRow.id,
    projectId: checklistRow.projectId,
    createdAt: toDateValue(checklistRow.createdAt),
    updatedAt: toDateValue(checklistRow.updatedAt),
    sections: sectionRows.map((sectionRow) => ({
      id: sectionRow.id,
      title: sectionRow.title,
      description: sectionRow.description ?? undefined,
      sortOrder: sectionRow.sortOrder,
      createdAt: toDateValue(sectionRow.createdAt),
      updatedAt: toDateValue(sectionRow.updatedAt),
      items: (itemsBySectionId.get(sectionRow.id) ?? []).map((itemRow) => ({
        id: itemRow.id,
        title: itemRow.title,
        description: itemRow.description ?? undefined,
        status: normalizeChecklistItemStatus(itemRow.status),
        sortOrder: itemRow.sortOrder,
        createdAt: toDateValue(itemRow.createdAt),
        updatedAt: toDateValue(itemRow.updatedAt)
      }))
    }))
  };
}

async function loadChecklistRelations(db: DbClient, checklistIds: string[]) {
  if (checklistIds.length === 0) {
    return {
      sectionsByChecklistId: new Map<string, DbProjectChecklistSectionRow[]>(),
      itemsBySectionId: new Map<string, DbProjectChecklistItemRow[]>()
    };
  }

  const sectionRows = await db.$queryRaw<DbProjectChecklistSectionRow[]>(
    Prisma.sql`
      SELECT
        "id",
        "projectChecklistId",
        "title",
        "description",
        "sortOrder",
        "createdAt",
        "updatedAt"
      FROM "ProjectChecklistSection"
      WHERE "projectChecklistId" IN (${Prisma.join(checklistIds)})
      ORDER BY "projectChecklistId" ASC, "sortOrder" ASC
    `
  );

  const sectionIds = sectionRows.map((section) => section.id);
  const itemRows =
    sectionIds.length > 0
      ? await db.$queryRaw<DbProjectChecklistItemRow[]>(
          Prisma.sql`
            SELECT
              "id",
              "projectChecklistSectionId",
              "title",
              "description",
              "status"::text AS "status",
              "sortOrder",
              "createdAt",
              "updatedAt"
            FROM "ProjectChecklistItem"
            WHERE "projectChecklistSectionId" IN (${Prisma.join(sectionIds)})
            ORDER BY "projectChecklistSectionId" ASC, "sortOrder" ASC
          `
        )
      : [];

  const sectionsByChecklistId = new Map<string, DbProjectChecklistSectionRow[]>();
  sectionRows.forEach((section) => {
    const entries = sectionsByChecklistId.get(section.projectChecklistId) ?? [];
    entries.push(section);
    sectionsByChecklistId.set(section.projectChecklistId, entries);
  });

  const itemsBySectionId = new Map<string, DbProjectChecklistItemRow[]>();
  itemRows.forEach((item) => {
    const entries = itemsBySectionId.get(item.projectChecklistSectionId) ?? [];
    entries.push(item);
    itemsBySectionId.set(item.projectChecklistSectionId, entries);
  });

  return {
    sectionsByChecklistId,
    itemsBySectionId
  };
}

async function ensureProjectExists(db: DbClient, projectId: string) {
  const project = await db.project.findUnique({
    where: {
      id: projectId
    },
    select: {
      id: true
    }
  });

  return Boolean(project);
}

async function readProjectChecklistByProjectId(db: DbClient, projectId: string) {
  const checklistRows = await db.$queryRaw<DbProjectChecklistRow[]>(
    Prisma.sql`
      SELECT
        "id",
        "projectId",
        "createdAt",
        "updatedAt"
      FROM "ProjectChecklist"
      WHERE "projectId" = ${projectId}
      LIMIT 1
    `
  );

  const checklistRow = checklistRows[0];
  if (!checklistRow) {
    return null;
  }

  const relations = await loadChecklistRelations(db, [checklistRow.id]);
  return buildChecklistSnapshot(
    checklistRow,
    relations.sectionsByChecklistId,
    relations.itemsBySectionId
  );
}

async function listProjectChecklistSnapshots(db: DbClient, projectIds?: string[]) {
  if (projectIds && projectIds.length === 0) {
    return [];
  }

  const checklistRows = await db.$queryRaw<DbProjectChecklistRow[]>(
    projectIds
      ? Prisma.sql`
          SELECT
            "id",
            "projectId",
            "createdAt",
            "updatedAt"
          FROM "ProjectChecklist"
          WHERE "projectId" IN (${Prisma.join(projectIds)})
          ORDER BY "projectId" ASC
        `
      : Prisma.sql`
          SELECT
            "id",
            "projectId",
            "createdAt",
            "updatedAt"
          FROM "ProjectChecklist"
          ORDER BY "projectId" ASC
        `
  );

  if (checklistRows.length === 0) {
    return [];
  }

  const relations = await loadChecklistRelations(
    db,
    checklistRows.map((row) => row.id)
  );

  return checklistRows.map((row) =>
    toProjectChecklistDto(
      buildChecklistSnapshot(row, relations.sectionsByChecklistId, relations.itemsBySectionId)
    )
  );
}

async function replaceProjectChecklistSnapshot(
  db: DbClient,
  snapshot: NormalizedProjectChecklist
) {
  await db.$executeRaw(
    Prisma.sql`DELETE FROM "ProjectChecklist" WHERE "projectId" = ${snapshot.projectId}`
  );

  await db.$executeRaw(
    Prisma.sql`
      INSERT INTO "ProjectChecklist" ("id", "projectId", "createdAt", "updatedAt")
      VALUES (${snapshot.id}, ${snapshot.projectId}, ${snapshot.createdAt}, ${snapshot.updatedAt})
    `
  );

  for (const section of snapshot.sections) {
    await db.$executeRaw(
      Prisma.sql`
        INSERT INTO "ProjectChecklistSection" (
          "id",
          "projectChecklistId",
          "title",
          "description",
          "sortOrder",
          "createdAt",
          "updatedAt"
        )
        VALUES (
          ${section.id},
          ${snapshot.id},
          ${section.title},
          ${section.description ?? null},
          ${section.sortOrder},
          ${section.createdAt},
          ${section.updatedAt}
        )
      `
    );

    for (const item of section.items) {
      await db.$executeRaw(
        Prisma.sql`
          INSERT INTO "ProjectChecklistItem" (
            "id",
            "projectChecklistSectionId",
            "title",
            "description",
            "status",
            "sortOrder",
            "createdAt",
            "updatedAt"
          )
          VALUES (
            ${item.id},
            ${section.id},
            ${item.title},
            ${item.description ?? null},
            CAST(${item.status} AS "ChecklistItemStatus"),
            ${item.sortOrder},
            ${item.createdAt},
            ${item.updatedAt}
          )
        `
      );
    }
  }

  return readProjectChecklistByProjectId(db, snapshot.projectId);
}

export function createProjectChecklistsRouter(prisma: PrismaClient, config: AppConfig) {
  const router = Router();

  router.get("/project-checklists", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireAuthenticatedRouteUser(req, res, prisma);
      if (!user) {
        return;
      }

      const readableProjectIds = await getReadableProjectIdsForDomain(prisma, user, "projectChecklists");
      res.json(
        readableProjectIds === null
          ? await listProjectChecklistSnapshots(prisma)
          : await listProjectChecklistSnapshots(prisma, readableProjectIds)
      );
    } catch (error) {
      next(error);
    }
  });

  router.get("/projects/:id/checklist", async (req: Request, res: Response, next: NextFunction) => {
    try {
      const perf = createPerfTimer(config, req, "projects.checklist.read");
      applyNoStoreHeaders(res);

      const user = await perf.measure("auth", async () => requireAuthenticatedRouteUser(req, res, prisma));
      if (!user) {
        return;
      }

      if (!requireProjectDomainReadPermission({ user, domain: "projectChecklists", res })) {
        return;
      }

      const projectExists = await perf.measure("project lookup", async () => ensureProjectExists(prisma, req.params.id));
      if (!projectExists) {
        res.status(404).json({ ok: false, message: "Project not found." });
        return;
      }
      if (
        !(await perf.measure("project scope validation", async () =>
          requireProjectDomainRead({
            db: prisma,
            user,
            projectId: req.params.id,
            domain: "projectChecklists",
            res
          })
        ))
      ) {
        return;
      }

      const checklist = await perf.measure("checklist query", async () =>
        readProjectChecklistByProjectId(prisma, req.params.id)
      );
      perf.mark("response", { hasChecklist: Boolean(checklist) });
      res.json({
        ok: true,
        checklist: checklist ? toProjectChecklistDto(checklist) : null
      });
    } catch (error) {
      next(error);
    }
  });

  router.put("/projects/:id/checklist", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireInternalRouteUser(req, res, prisma);
      if (!user) {
        return;
      }

      const projectExists = await ensureProjectExists(prisma, req.params.id);
      if (!projectExists) {
        res.status(404).json({ ok: false, message: "Project not found." });
        return;
      }
      if (
        !(await requireProjectDomainWrite({
          db: prisma,
          user,
          projectId: req.params.id,
          domain: "projectChecklists",
          permission: "projects.edit",
          res
        }))
      ) {
        return;
      }

      const existing = await readProjectChecklistByProjectId(prisma, req.params.id);
      let normalized: NormalizedProjectChecklist;
      try {
        normalized = normalizeProjectChecklistInput(req.params.id, req.body, existing?.id);
      } catch (error) {
        if (error instanceof Error) {
          res.status(400).json({ ok: false, message: error.message });
          return;
        }
        throw error;
      }

      const checklist = await prisma.$transaction((tx) =>
        replaceProjectChecklistSnapshot(tx, normalized)
      );

      res.json({
        ok: true,
        checklist: checklist ? toProjectChecklistDto(checklist) : null
      });
    } catch (error) {
      next(error);
    }
  });

  router.delete("/projects/:id/checklist", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const user = await requireInternalRouteUser(req, res, prisma);
      if (!user) {
        return;
      }

      const projectExists = await ensureProjectExists(prisma, req.params.id);
      if (!projectExists) {
        res.status(404).json({ ok: false, message: "Project not found." });
        return;
      }
      if (
        !(await requireProjectDomainWrite({
          db: prisma,
          user,
          projectId: req.params.id,
          domain: "projectChecklists",
          permission: "projects.edit",
          res
        }))
      ) {
        return;
      }

      await prisma.$executeRaw(
        Prisma.sql`DELETE FROM "ProjectChecklist" WHERE "projectId" = ${req.params.id}`
      );

      res.json({
        ok: true,
        checklist: null
      });
    } catch (error) {
      next(error);
    }
  });

  router.put(
    "/admin/internal/project-checklists/bulk-replace",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        applyNoStoreHeaders(res);

        const user = await requireAdminRoutePermissions(req, res, prisma, "projects.edit", "projects.archive");
        if (!user) {
          return;
        }

        if (!Array.isArray(req.body)) {
          res.status(400).json({ ok: false, message: "Project checklist snapshot must be an array." });
          return;
        }

        let normalized: NormalizedProjectChecklist[];
        try {
          normalized = req.body.map((row) => {
            if (!isRecord(row)) {
              throw new Error("Invalid project checklist payload.");
            }

            const projectId = toOptionalTrimmedString(row.projectId);
            if (!projectId) {
              throw new Error("Project checklists require a projectId.");
            }

            return normalizeProjectChecklistInput(projectId, row);
          });
        } catch (error) {
          if (error instanceof Error) {
            res.status(400).json({ ok: false, message: error.message });
            return;
          }
          throw error;
        }

        assertUniqueIds(
          "project checklist",
          normalized.map((checklist) => checklist.projectId)
        );

        const projectIds = normalized.map((checklist) => checklist.projectId);
        const existingProjects = projectIds.length
          ? await prisma.project.findMany({
              where: {
                id: {
                  in: projectIds
                }
              },
              select: {
                id: true
              }
            })
          : [];
        const existingProjectIds = new Set(existingProjects.map((project) => project.id));
        const missingProjectIds = projectIds.filter((projectId) => !existingProjectIds.has(projectId));

        if (missingProjectIds.length > 0) {
          res.status(400).json({
            ok: false,
            message: `Project checklists reference missing projects: ${missingProjectIds.join(", ")}.`
          });
          return;
        }

        await prisma.$transaction(async (tx) => {
          if (projectIds.length > 0) {
            await tx.$executeRaw(
              Prisma.sql`DELETE FROM "ProjectChecklist" WHERE "projectId" IN (${Prisma.join(projectIds)})`
            );
          }

          for (const checklist of normalized) {
            await replaceProjectChecklistSnapshot(tx, checklist);
          }
        });

        res.json({
          ok: true,
          projectChecklists: await listProjectChecklistSnapshots(prisma)
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.delete(
    "/admin/internal/project-checklists/bulk-delete",
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        applyNoStoreHeaders(res);

        const user = await requireAdminRoutePermissions(req, res, prisma, "projects.edit", "projects.archive");
        if (!user) {
          return;
        }

        await prisma.$executeRaw(Prisma.sql`DELETE FROM "ProjectChecklist"`);
        res.json({ ok: true });
      } catch (error) {
        next(error);
      }
    }
  );

  return router;
}
