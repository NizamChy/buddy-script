import { Router } from "express";
import { z } from "zod";
import { decodeCursor, limitSchema } from "../../lib/cursor";
import { requireAuth } from "../../middleware/auth";
import { listNotifications, markRead, unreadCount } from "./notifications.service";

export const notificationsRouter = Router();
notificationsRouter.use(requireAuth);

const listQuery = z.object({
  cursor: z.string().optional(),
  limit: limitSchema(15, 50),
  unread: z.enum(["true", "false"]).optional(),
});

notificationsRouter.get("/", async (req, res) => {
  const { cursor, limit, unread } = listQuery.parse(req.query);
  res.json(await listNotifications(req.user!.id, limit, decodeCursor(cursor), unread === "true"));
});

notificationsRouter.get("/unread-count", async (req, res) => {
  res.json({ count: await unreadCount(req.user!.id) });
});

const readBody = z.object({ ids: z.array(z.uuid()).min(1).max(100).optional() });

notificationsRouter.post("/read", async (req, res) => {
  const { ids } = readBody.parse(req.body ?? {});
  res.json({ updated: await markRead(req.user!.id, ids) });
});
