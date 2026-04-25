import type { NextFunction, Request, Response } from "express";
import type { PrismaClient } from "@prisma/client";
import type { AppConfig } from "./config.js";
import type { PermissionKey } from "./accessControl.js";
import { applyNoStoreHeaders, requireAdminRoutePermissions } from "./routes/routeAuth.js";

type LegacyRecoveryRouteConfig = {
  method: "DELETE" | "POST" | "PUT";
  path: string;
  permissionKeys: PermissionKey[];
};

const LEGACY_RECOVERY_BLOCK_MESSAGE =
  "Legacy recovery endpoints for migrated domains are disabled by default. Set ENABLE_LEGACY_RECOVERY_ENDPOINTS=true only for an explicit maintenance run.";

export const LEGACY_RECOVERY_ROUTE_DEFINITIONS: ReadonlyArray<LegacyRecoveryRouteConfig> = [
  {
    method: "PUT",
    path: "/admin/internal/authorities/bulk-replace",
    permissionKeys: ["authorities.manage"]
  },
  {
    method: "DELETE",
    path: "/admin/internal/authorities/bulk-delete",
    permissionKeys: ["authorities.manage"]
  },
  {
    method: "POST",
    path: "/admin/internal/authorities/backfill-from-snapshot",
    permissionKeys: ["authorities.manage"]
  },
  {
    method: "POST",
    path: "/admin/internal/authorities/rollback-to-snapshot",
    permissionKeys: ["authorities.manage"]
  },
  {
    method: "PUT",
    path: "/admin/internal/scopes/bulk-replace",
    permissionKeys: ["masterData.manage"]
  },
  {
    method: "DELETE",
    path: "/admin/internal/scopes/bulk-delete",
    permissionKeys: ["masterData.manage"]
  },
  {
    method: "POST",
    path: "/admin/internal/scopes/backfill-from-snapshot",
    permissionKeys: ["masterData.manage"]
  },
  {
    method: "POST",
    path: "/admin/internal/scopes/rollback-to-snapshot",
    permissionKeys: ["masterData.manage"]
  },
  {
    method: "PUT",
    path: "/admin/internal/projects/bulk-replace",
    permissionKeys: ["projects.edit", "projects.archive"]
  },
  {
    method: "DELETE",
    path: "/admin/internal/projects/bulk-delete",
    permissionKeys: ["projects.edit", "projects.archive"]
  },
  {
    method: "POST",
    path: "/admin/internal/projects/backfill-from-snapshot",
    permissionKeys: ["projects.edit", "projects.archive"]
  },
  {
    method: "POST",
    path: "/admin/internal/projects/rollback-to-snapshot",
    permissionKeys: ["projects.edit", "projects.archive"]
  },
  {
    method: "PUT",
    path: "/admin/internal/project-checklists/bulk-replace",
    permissionKeys: ["projects.edit", "projects.archive"]
  },
  {
    method: "DELETE",
    path: "/admin/internal/project-checklists/bulk-delete",
    permissionKeys: ["projects.edit", "projects.archive"]
  },
  {
    method: "PUT",
    path: "/admin/internal/legal-docs/bulk-replace",
    permissionKeys: ["legalDocs.edit", "legalDocs.archive"]
  },
  {
    method: "DELETE",
    path: "/admin/internal/legal-docs/bulk-delete",
    permissionKeys: ["legalDocs.edit", "legalDocs.archive"]
  },
  {
    method: "POST",
    path: "/admin/internal/legal-docs/backfill-from-snapshot",
    permissionKeys: ["legalDocs.edit", "legalDocs.archive"]
  },
  {
    method: "POST",
    path: "/admin/internal/legal-docs/rollback-to-snapshot",
    permissionKeys: ["legalDocs.edit", "legalDocs.archive"]
  },
  {
    method: "PUT",
    path: "/admin/internal/obligations/bulk-replace",
    permissionKeys: ["obligations.edit", "obligations.archive"]
  },
  {
    method: "DELETE",
    path: "/admin/internal/obligations/bulk-delete",
    permissionKeys: ["obligations.edit", "obligations.archive"]
  },
  {
    method: "POST",
    path: "/admin/internal/obligations/backfill-from-snapshot",
    permissionKeys: ["obligations.edit", "obligations.archive"]
  },
  {
    method: "POST",
    path: "/admin/internal/obligations/rollback-to-snapshot",
    permissionKeys: ["obligations.edit", "obligations.archive"]
  },
  {
    method: "PUT",
    path: "/admin/internal/deadlines/bulk-replace",
    permissionKeys: ["deadlines.edit", "deadlines.archive"]
  },
  {
    method: "DELETE",
    path: "/admin/internal/deadlines/bulk-delete",
    permissionKeys: ["deadlines.edit", "deadlines.archive"]
  },
  {
    method: "POST",
    path: "/admin/internal/deadlines/backfill-from-snapshot",
    permissionKeys: ["deadlines.edit", "deadlines.archive"]
  },
  {
    method: "POST",
    path: "/admin/internal/deadlines/rollback-to-snapshot",
    permissionKeys: ["deadlines.edit", "deadlines.archive"]
  },
  {
    method: "PUT",
    path: "/admin/internal/task-state/bulk-replace",
    permissionKeys: ["tasks.edit", "tasks.complete"]
  },
  {
    method: "DELETE",
    path: "/admin/internal/task-state/bulk-delete",
    permissionKeys: ["tasks.edit", "tasks.complete"]
  }
];

function normalizeLegacyRecoveryPath(path: string) {
  const trimmed = path.trim();
  if (!trimmed || trimmed === "/") {
    return "/";
  }

  const normalized = trimmed
    .replace(/\/+/g, "/")
    .replace(/\/+$/, "")
    .toLowerCase();
  return normalized || "/";
}

function findLegacyRecoveryRoute(method: string, path: string) {
  const normalizedMethod = method.toUpperCase();
  const normalizedPath = normalizeLegacyRecoveryPath(path);

  return LEGACY_RECOVERY_ROUTE_DEFINITIONS.find(
    (route) =>
      route.method === normalizedMethod && normalizeLegacyRecoveryPath(route.path) === normalizedPath
  );
}

export function createLegacyRecoveryGuard(prisma: PrismaClient, config: AppConfig) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const matchedRoute = findLegacyRecoveryRoute(req.method, req.path);
    if (!matchedRoute) {
      next();
      return;
    }

    applyNoStoreHeaders(res);

    const user = await requireAdminRoutePermissions(req, res, prisma, ...matchedRoute.permissionKeys);
    if (!user) {
      return;
    }

    if (config.legacyRecoveryEndpointsEnabled) {
      next();
      return;
    }

    res.status(403).json({
      ok: false,
      message: LEGACY_RECOVERY_BLOCK_MESSAGE
    });
  };
}
