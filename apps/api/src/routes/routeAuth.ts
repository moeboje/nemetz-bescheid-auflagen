import type { PrismaClient } from "@prisma/client";
import type { Request, Response } from "express";
import { hashToken, parseCookies } from "../security.js";
import {
  getRoleCatalogEntry,
  hasPermission,
  mapRequestToPermission,
  resolvePermissionKeys,
  type PermissionKey
} from "../accessControl.js";
import { getStoredRolePermissionState } from "../rolePermissions.js";
import { getAllowExternalUsers } from "../securitySettings.js";

export type RouteUser = {
  id: string;
  role: string;
  type: string;
  isArchived: boolean;
  permissionKeys: PermissionKey[];
};

export function applyNoStoreHeaders(res: Response) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");
}

export async function getRouteUser(
  req: Request,
  prisma: PrismaClient
): Promise<RouteUser | null> {
  const cookies = parseCookies(req.headers.cookie);
  const rawSessionToken = cookies.get("nemetz_session");

  if (!rawSessionToken) {
    return null;
  }

  const tokenHash = hashToken(rawSessionToken);

  const session = await prisma.session.findFirst({
    where: {
      tokenHash,
      revokedAt: null,
      expiresAt: {
        gt: new Date()
      }
    },
    include: {
      user: {
        select: {
          id: true,
          role: true,
          type: true,
          isArchived: true
        }
      }
    }
  });

  if (!session || session.user.isArchived) {
    return null;
  }

  if (String(session.user.type).trim().toUpperCase() === "EXTERNAL" && !(await getAllowExternalUsers(prisma))) {
    await prisma.session.update({
      where: {
        id: session.id
      },
      data: {
        revokedAt: new Date()
      }
    });
    return null;
  }

  const roleState = await getStoredRolePermissionState(prisma, session.user.role);
  const isCatalogRole = Boolean(getRoleCatalogEntry(session.user.role));

  return {
    ...session.user,
    permissionKeys: resolvePermissionKeys({
      roleKey: session.user.role,
      userType: session.user.type,
      storedPermissionKeys: roleState.permissionKeys,
      hasStoredPermissionKeys: roleState.hasStoredPermissions,
      useLegacyInternalFallback: roleState.roleExists && !roleState.hasStoredPermissions && !isCatalogRole
    })
  };
}

export async function requireAuthenticatedRouteUser(
  req: Request,
  res: Response,
  prisma: PrismaClient
): Promise<RouteUser | null> {
  const user = await getRouteUser(req, prisma);
  if (!user) {
    res.status(401).json({ ok: false, message: "Authentication required." });
    return null;
  }
  return user;
}

export async function requireInternalRouteUser(
  req: Request,
  res: Response,
  prisma: PrismaClient
): Promise<RouteUser | null> {
  const user = await requireAuthenticatedRouteUser(req, res, prisma);
  if (!user) {
    return null;
  }

  if (String(user.type).toUpperCase() === "EXTERNAL") {
    res.status(403).json({ ok: false, message: "Forbidden." });
    return null;
  }

  const requiredPermission = mapRequestToPermission({
    method: req.method,
    path: req.path
  });
  if (requiredPermission && !hasPermission(user.permissionKeys, requiredPermission)) {
    res.status(403).json({ ok: false, message: "Forbidden." });
    return null;
  }

  return user;
}

export async function requireAdminRouteUser(
  req: Request,
  res: Response,
  prisma: PrismaClient
): Promise<RouteUser | null> {
  const user = await requireAuthenticatedRouteUser(req, res, prisma);
  if (!user) {
    return null;
  }

  if (!hasPermission(user.permissionKeys, "admin.access")) {
    res.status(403).json({ ok: false, message: "Admin access required." });
    return null;
  }

  return user;
}

export async function requireAdminRoutePermissions(
  req: Request,
  res: Response,
  prisma: PrismaClient,
  ...permissionKeys: PermissionKey[]
): Promise<RouteUser | null> {
  const user = await requireAdminRouteUser(req, res, prisma);
  if (!user) {
    return null;
  }

  const missingPermission = permissionKeys.find(
    (permissionKey) => !hasPermission(user.permissionKeys, permissionKey)
  );
  if (missingPermission) {
    res.status(403).json({ ok: false, message: "Forbidden." });
    return null;
  }

  return user;
}
