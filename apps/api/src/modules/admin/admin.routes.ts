import { Router } from "express";
import { prisma } from "../../lib/prisma";
import { requireAuth, requireRole } from "../../middleware/auth";

/** Admin-only endpoints (RBAC example). Admins can also delete any post or comment. */
export const adminRouter = Router();
adminRouter.use(requireAuth, requireRole("ADMIN"));

adminRouter.get("/stats", async (_req, res) => {
  const [users, posts, comments, postLikes, commentLikes] = await Promise.all([
    prisma.user.count(),
    prisma.post.count(),
    prisma.comment.count(),
    prisma.postLike.count(),
    prisma.commentLike.count(),
  ]);
  res.json({ users, posts, comments, likes: postLikes + commentLikes });
});
