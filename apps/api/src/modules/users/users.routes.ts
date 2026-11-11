import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { limitSchema } from "../../lib/cursor";
import { requireAuth } from "../../middleware/auth";
import { follow, getUserSummary, suggestions, unfollow } from "./users.service";

export const usersRouter = Router();
usersRouter.use(requireAuth);

const idParam = z.object({ id: z.uuid("Invalid id") });

const followLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 60,
  keyGenerator: (req) => req.user!.id,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "You're doing that too fast" } },
});

usersRouter.get("/suggestions", async (req, res) => {
  const { limit } = z.object({ limit: limitSchema(5, 20) }).parse(req.query);
  res.json({ items: await suggestions(req.user!.id, limit) });
});

usersRouter.get("/:id", async (req, res) => {
  const { id } = idParam.parse(req.params);
  res.json({ user: await getUserSummary(id, req.user!.id) });
});

usersRouter.put("/:id/follow", followLimiter, async (req, res) => {
  const { id } = idParam.parse(req.params);
  res.json({ user: await follow(req.user!.id, id) });
});

usersRouter.delete("/:id/follow", followLimiter, async (req, res) => {
  const { id } = idParam.parse(req.params);
  res.json({ user: await unfollow(req.user!.id, id) });
});
