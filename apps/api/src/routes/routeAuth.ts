import type { PrismaClient } from "@prisma/client";
import type { Request, Response } from "express";
import { hashToken, parseCookies } from "../security.js";

export type RouteUser = {
  id: string;
  role: string;
  type: string;
  isArchived: boolean;
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

  return session.user;
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

  if (String(user.role).toUpperCase() !== "ADMIN") {
    res.status(403).json({ ok: false, message: "Admin access required." });
    return null;
  }

  return user;
}
