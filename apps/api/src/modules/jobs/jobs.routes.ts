import crypto from "node:crypto";
import { Router, type NextFunction, type Request, type Response } from "express";
import { env } from "../../config/env";
import { prisma } from "../../lib/prisma";
import { requireAuth, requireRole } from "../../middleware/auth";
import { cleanupJobs, drainJobs } from "./queue";

export const jobsRouter = Router();

const safeEqual = (a: string, b: string) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};

/** Vercel Cron authenticates with `Authorization: Bearer $CRON_SECRET`; admins may also trigger it. */
function cronOrAdmin(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? "";
  if (env.CRON_SECRET && safeEqual(header, `Bearer ${env.CRON_SECRET}`)) return next();
  requireAuth(req, res, (err?: unknown) => (err ? next(err) : requireRole("ADMIN")(req, res, next)));
}

// GET because that's what Vercel Cron sends.
jobsRouter.get("/jobs/run", cronOrAdmin, async (_req, res) => {
  const processed = await drainJobs({ maxJobs: 200, budgetMs: 50_000 });
  res.json({ processed, ...(await cleanupJobs()) });
});

jobsRouter.get("/jobs/stats", cronOrAdmin, async (_req, res) => {
  const rows = await prisma.job.groupBy({ by: ["type", "status"], _count: { _all: true } });
  res.json({ jobs: rows.map((r) => ({ type: r.type, status: r.status, count: r._count._all })) });
});
