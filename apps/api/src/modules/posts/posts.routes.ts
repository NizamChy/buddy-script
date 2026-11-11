import { Router } from "express";
import multer from "multer";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { decodeCursor, limitSchema } from "../../lib/cursor";
import { badRequest } from "../../lib/errors";
import { deleteImage, inspectImage } from "../../lib/storage";
import { requireAuth } from "../../middleware/auth";
import {
  likePost,
  listPostLikers,
  unlikePost,
} from "../likes/likes.service";
import { createCommentSchema, listCommentsQuery } from "../comments/comments.schemas";
import { createComment, listComments } from "../comments/comments.service";
import {
  createPost,
  deletePost,
  getPost,
  getVisiblePostOrThrow,
  listFeed,
  listFollowingFeed,
  updatePost,
} from "./posts.service";

export const postsRouter = Router();
postsRouter.use(requireAuth);

// Vercel functions cap request bodies at 4.5 MB; the web client downsizes images before upload.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 4 * 1024 * 1024, files: 1, fields: 5 },
  fileFilter: (_req, file, cb) => {
    if (/^image\/(jpeg|png|webp|gif|avif)$/.test(file.mimetype)) cb(null, true);
    else cb(badRequest("Only JPEG, PNG, WebP, GIF or AVIF images are allowed"));
  },
});

const writeLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 30,
  keyGenerator: (req) => req.user!.id,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "You're doing that too fast" } },
});

const idParam = z.object({ id: z.uuid("Invalid id") });
const listQuery = z.object({
  cursor: z.string().optional(),
  limit: limitSchema(10, 30),
  scope: z.enum(["all", "following"]).default("all"),
});

const visibility = z.enum(["PUBLIC", "PRIVATE"]);
const content = z.string().trim().max(5000, "Post is too long (max 5000 characters)");

const createSchema = z.object({
  content: content.optional().default(""),
  visibility: visibility.default("PUBLIC"),
});

const updateSchema = z
  .object({ content: content.optional(), visibility: visibility.optional() })
  .refine((v) => v.content !== undefined || v.visibility !== undefined, "Nothing to update");

postsRouter.get("/", async (req, res) => {
  const { cursor, limit, scope } = listQuery.parse(req.query);
  const list = scope === "following" ? listFollowingFeed : listFeed;
  res.json(await list(req.user!, limit, decodeCursor(cursor)));
});

postsRouter.post("/", writeLimiter, upload.single("image"), async (req, res) => {
  const body = createSchema.parse(req.body);
  if (!body.content && !req.file) throw badRequest("Write something or add a photo");
  // Only a header check here; the heavy re-encode runs in a background job.
  const image = req.file
    ? { buffer: req.file.buffer, ...(await inspectImage(req.file.buffer)) }
    : undefined;
  const post = await createPost(req.user!, { ...body, image });
  res.status(201).json({ post });
});

postsRouter.get("/:id", async (req, res) => {
  const { id } = idParam.parse(req.params);
  res.json({ post: await getPost(id, req.user!) });
});

postsRouter.patch("/:id", writeLimiter, async (req, res) => {
  const { id } = idParam.parse(req.params);
  const data = updateSchema.parse(req.body);
  res.json({ post: await updatePost(id, req.user!, data) });
});

postsRouter.delete("/:id", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const imageUrl = await deletePost(id, req.user!);
  await deleteImage(imageUrl);
  res.status(204).end();
});

// ---- Likes ----
postsRouter.put("/:id/like", async (req, res) => {
  const { id } = idParam.parse(req.params);
  await getVisiblePostOrThrow(id, req.user!.id);
  res.json(await likePost(id, req.user!.id));
});

postsRouter.delete("/:id/like", async (req, res) => {
  const { id } = idParam.parse(req.params);
  await getVisiblePostOrThrow(id, req.user!.id);
  res.json(await unlikePost(id, req.user!.id));
});

postsRouter.get("/:id/likes", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const { cursor, limit } = z
    .object({ cursor: z.string().optional(), limit: limitSchema(20, 50) })
    .parse(req.query);
  await getVisiblePostOrThrow(id, req.user!.id);
  res.json(await listPostLikers(id, limit, decodeCursor(cursor)));
});

// ---- Comments ----
postsRouter.get("/:id/comments", async (req, res) => {
  const { id } = idParam.parse(req.params);
  const { cursor, limit } = listCommentsQuery.parse(req.query);
  await getVisiblePostOrThrow(id, req.user!.id);
  res.json(await listComments(id, req.user!, limit, decodeCursor(cursor)));
});

postsRouter.post("/:id/comments", writeLimiter, async (req, res) => {
  const { id } = idParam.parse(req.params);
  const body = createCommentSchema.parse(req.body);
  await getVisiblePostOrThrow(id, req.user!.id);
  res.status(201).json({ comment: await createComment(id, req.user!, body) });
});
