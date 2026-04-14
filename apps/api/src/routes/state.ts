import { Router, type NextFunction, type Request, type Response } from "express";
import type { PrismaClient } from "@prisma/client";
import { hashToken, parseCookies } from "../security.js";

async function getSessionUserId(req: Request, prisma: PrismaClient): Promise<string | null> {
  const cookies = parseCookies(req.headers.cookie);
  const rawSessionToken = cookies.get("nemetz_session");

  if (!rawSessionToken) {
    return null;
  }

  const sessionTokenHash = hashToken(rawSessionToken);

  const session = await prisma.session.findFirst({
    where: {
      tokenHash: sessionTokenHash,
      expiresAt: {
        gt: new Date()
      }
    },
    select: {
      userId: true
    }
  });

  return session?.userId ?? null;
}

function applyNoStoreHeaders(res: Response) {
  res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.setHeader("Pragma", "no-cache");
  res.setHeader("Expires", "0");
  res.setHeader("Surrogate-Control", "no-store");
}

export function createStateRouter(prisma: PrismaClient) {
  const router = Router();

  router.get("/state", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const userId = await getSessionUserId(req, prisma);
      if (!userId) {
        res.status(401).json({ ok: false, message: "Unauthorized" });
        return;
      }

      const snapshot = await prisma.portalSnapshot.findUnique({
        where: { scopeKey: "default" }
      });

      res.json({
        ok: true,
        data: snapshot?.payload ?? null,
        updatedAt: snapshot?.updatedAt ?? null
      });
    } catch (error) {
      next(error);
    }
  });

  router.put("/state", async (req: Request, res: Response, next: NextFunction) => {
    try {
      applyNoStoreHeaders(res);

      const userId = await getSessionUserId(req, prisma);
      if (!userId) {
        res.status(401).json({ ok: false, message: "Unauthorized" });
        return;
      }

      await prisma.portalSnapshot.upsert({
        where: { scopeKey: "default" },
        update: {
          payload: req.body,
          updatedByUserId: userId
        },
        create: {
          scopeKey: "default",
          payload: req.body,
          updatedByUserId: userId
        }
      });

      res.json({ ok: true });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
