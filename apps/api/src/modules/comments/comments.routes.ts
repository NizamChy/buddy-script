import { Router } from "express";
import { z } from "zod";
import { decodeCursor, limitSchema } from "../../lib/cursor";
import { requireAuth } from "../../middleware/auth";
import { likeComment, listCommentLikers, unlikeComment } from "../likes/likes.service";
import { listCommentsQuery, updateCommentSchema } from "./comments.schemas";
import {
  deleteComment,
  getVisibleCommentOrThrow,
  listReplies,
  updateComment,
} from "./comments.service";

export const commentsRouter = Router();
commentsRouter.use(requireAuth);

const idParam = z.object({ id: z.uuid("Invalid id") });

commentsRouter.get("/:id/replies", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const { cursor, limit } = listCommentsQuery.parse(req.query);
  await getVisibleCommentOrThrow(id, req.user!.id);
  res.json(await listReplies(id, req.user!, limit, decodeCursor(cursor)));
});

commentsRouter.patch("/:id", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const { content } = updateCommentSchema.parse(req.body);
  res.json({ comment: await updateComment(id, req.user!, content) });
});

commentsRouter.delete("/:id", async (req, res) => {
  const { id } = idParam.parse(req.params);
  await deleteComment(id, req.user!);
  res.status(204).end();
});

commentsRouter.put("/:id/like", async (req, res) => {
  const { id } = idParam.parse(req.params);
  await getVisibleCommentOrThrow(id, req.user!.id);
  res.json(await likeComment(id, req.user!.id));
});

commentsRouter.delete("/:id/like", async (req, res) => {
  const { id } = idParam.parse(req.params);
  await getVisibleCommentOrThrow(id, req.user!.id);
  res.json(await unlikeComment(id, req.user!.id));
});

commentsRouter.get("/:id/likes", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const { cursor, limit } = z
    .object({ cursor: z.string().optional(), limit: limitSchema(20, 50) })
    .parse(req.query);
  await getVisibleCommentOrThrow(id, req.user!.id);
  res.json(await listCommentLikers(id, limit, decodeCursor(cursor)));
});
