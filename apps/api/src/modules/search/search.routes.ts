import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { limitSchema } from "../../lib/cursor";
import { requireAuth } from "../../middleware/auth";
import { searchPosts } from "../posts/posts.service";
import { searchUsers } from "../users/users.service";

export const searchRouter = Router();
searchRouter.use(requireAuth);

// Search is the most expensive read; keep a per-user ceiling (typing fires several requests).
searchRouter.use(
  rateLimit({
    windowMs: 60 * 1000,
    limit: 90,
    keyGenerator: (req) => req.user!.id,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: { code: "RATE_LIMITED", message: "Too many searches, slow down a little" } },
  }),
);

const searchQuery = z.object({
  q: z.string().trim().min(1, "Enter something to search for").max(100),
  // Relevance-ranked results are paged by offset; capped so deep pages stay cheap.
  cursor: z.coerce.number().int().min(0).max(200).optional().default(0),
  limit: limitSchema(10, 20),
});

searchRouter.get("/posts", async (req, res) => {
  const { q, cursor, limit } = searchQuery.parse(req.query);
  res.json(await searchPosts(req.user!, q, limit, cursor));
});

searchRouter.get("/users", async (req, res) => {
  const { q, cursor, limit } = searchQuery.parse(req.query);
  res.json(await searchUsers(req.user!.id, q, limit, cursor));
});
