import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { encodeCursor, type Cursor } from "../../lib/cursor";
import { badRequest, forbidden, notFound } from "../../lib/errors";
import { publicUserSelect } from "../../lib/serializers";
import type { Viewer } from "../posts/posts.service";
import { notify } from "../notifications/notifications.service";

const commentSelect = {
  id: true,
  postId: true,
  parentId: true,
  authorId: true,
  content: true,
  likeCount: true,
  replyCount: true,
  createdAt: true,
  editedAt: true,
  author: { select: publicUserSelect },
  post: { select: { authorId: true } },
} satisfies Prisma.CommentSelect;

type CommentRow = Prisma.CommentGetPayload<{ select: typeof commentSelect }>;

async function hydrate(rows: CommentRow[], viewer: Viewer) {
  const ids = rows.map((r) => r.id);
  const mine = ids.length
    ? await prisma.commentLike.findMany({
        where: { userId: viewer.id, commentId: { in: ids } },
        select: { commentId: true },
      })
    : [];
  const liked = new Set(mine.map((m) => m.commentId));
  return rows.map(({ post, ...c }) => ({
    ...c,
    likedByMe: liked.has(c.id),
    canEdit: c.authorId === viewer.id,
    // Comment author, the post's author (moderating their own post) or an admin.
    canDelete: c.authorId === viewer.id || post.authorId === viewer.id || viewer.role === "ADMIN",
  }));
}

/** Loads a comment only if its post is visible to the viewer. */
export async function getVisibleCommentOrThrow(commentId: string, viewerId: string) {
  const comment = await prisma.comment.findFirst({
    where: {
      id: commentId,
      post: { OR: [{ visibility: "PUBLIC" }, { authorId: viewerId }] },
    },
    select: { id: true, postId: true, parentId: true, authorId: true, replyCount: true, post: { select: { authorId: true } } },
  });
  if (!comment) throw notFound("Comment not found");
  return comment;
}

/** Top-level comments, newest first (the UI shows the latest and loads older on demand). */
export async function listComments(postId: string, viewer: Viewer, limit: number, cursor?: Cursor) {
  const rows = await prisma.comment.findMany({
    where: {
      postId,
      parentId: null,
      ...(cursor
        ? {
            OR: [
              { createdAt: { lt: cursor.createdAt } },
              { createdAt: cursor.createdAt, id: { lt: cursor.id } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    select: commentSelect,
  });
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  return {
    items: await hydrate(items, viewer),
    nextCursor: hasMore && last ? encodeCursor(last) : null,
  };
}

/** Replies of a top-level comment, oldest first (conversation order). */
export async function listReplies(commentId: string, viewer: Viewer, limit: number, cursor?: Cursor) {
  const rows = await prisma.comment.findMany({
    where: {
      parentId: commentId,
      ...(cursor
        ? {
            OR: [
              { createdAt: { gt: cursor.createdAt } },
              { createdAt: cursor.createdAt, id: { gt: cursor.id } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: limit + 1,
    select: commentSelect,
  });
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  return {
    items: await hydrate(items, viewer),
    nextCursor: hasMore && last ? encodeCursor(last) : null,
  };
}

export async function createComment(
  postId: string,
  viewer: Viewer,
  input: { content: string; parentId?: string },
) {
  let rootId: string | null = null;
  let parentAuthorId: string | null = null;
  if (input.parentId) {
    const parent = await prisma.comment.findUnique({
      where: { id: input.parentId },
      select: { id: true, postId: true, parentId: true, authorId: true },
    });
    if (!parent || parent.postId !== postId) throw badRequest("Parent comment not found on this post");
    // Replies are one level deep (like Facebook): a reply to a reply joins the same thread.
    rootId = parent.parentId ?? parent.id;
    parentAuthorId = parent.authorId;
  }

  const row = await prisma.$transaction(async (tx) => {
    const created = await tx.comment.create({
      data: { postId, authorId: viewer.id, parentId: rootId, content: input.content },
      select: commentSelect,
    });
    await tx.post.update({ where: { id: postId }, data: { commentCount: { increment: 1 } } });
    if (rootId) {
      await tx.comment.update({ where: { id: rootId }, data: { replyCount: { increment: 1 } } });
    }
    // The person replied to hears about the reply; the post author hears about any comment.
    const recipients = new Map<string, "REPLY" | "COMMENT">();
    if (parentAuthorId) recipients.set(parentAuthorId, "REPLY");
    if (!recipients.has(created.post.authorId)) recipients.set(created.post.authorId, "COMMENT");
    await notify(
      tx,
      [...recipients].map(([recipientId, type]) => ({
        recipientId,
        actorId: viewer.id,
        type,
        postId,
        commentId: created.id,
      })),
    );
    return created;
  });
  const [comment] = await hydrate([row], viewer);
  return comment;
}

export async function updateComment(commentId: string, viewer: Viewer, content: string) {
  const existing = await getVisibleCommentOrThrow(commentId, viewer.id);
  if (existing.authorId !== viewer.id) throw forbidden("Only the author can edit this comment");
  const row = await prisma.comment.update({
    where: { id: commentId },
    data: { content, editedAt: new Date() },
    select: commentSelect,
  });
  const [comment] = await hydrate([row], viewer);
  return comment;
}

export async function deleteComment(commentId: string, viewer: Viewer) {
  const existing = await getVisibleCommentOrThrow(commentId, viewer.id);
  const allowed =
    existing.authorId === viewer.id ||
    existing.post.authorId === viewer.id ||
    viewer.role === "ADMIN";
  if (!allowed) throw forbidden("You cannot delete this comment");

  await prisma.$transaction(async (tx) => {
    // Re-read inside the transaction so the reply count we subtract is current.
    const current = await tx.comment.findUnique({
      where: { id: commentId },
      select: { parentId: true, replyCount: true },
    });
    if (!current) return;
    // Deleting a top-level comment cascades to its replies.
    const removed = 1 + (current.parentId ? 0 : current.replyCount);
    await tx.comment.delete({ where: { id: commentId } });
    await tx.post.update({
      where: { id: existing.postId },
      data: { commentCount: { decrement: removed } },
    });
    if (current.parentId) {
      await tx.comment.update({
        where: { id: current.parentId },
        data: { replyCount: { decrement: 1 } },
      });
    }
  });
  return { postId: existing.postId, parentId: existing.parentId };
}
