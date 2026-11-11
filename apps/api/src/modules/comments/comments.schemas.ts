import { z } from "zod";
import { limitSchema } from "../../lib/cursor";

export const createCommentSchema = z.object({
  content: z
    .string({ error: "Comment is required" })
    .trim()
    .min(1, "Comment cannot be empty")
    .max(2000, "Comment is too long (max 2000 characters)"),
  /// When set, the new comment is a reply. Replying to a reply attaches to its top-level comment.
  parentId: z.uuid("Invalid parent comment").optional(),
});

export const updateCommentSchema = createCommentSchema.pick({ content: true });

export const listCommentsQuery = z.object({
  cursor: z.string().optional(),
  limit: limitSchema(5, 30),
});
