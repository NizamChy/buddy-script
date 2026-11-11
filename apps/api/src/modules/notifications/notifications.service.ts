import type { NotificationType, Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { encodeCursor, type Cursor } from "../../lib/cursor";
import { publicUserSelect } from "../../lib/serializers";

type Db = Prisma.TransactionClient | typeof prisma;

interface NotificationInput {
  recipientId: string;
  actorId: string;
  type: NotificationType;
  postId?: string | null;
  commentId?: string | null;
}

/**
 * Notifications are written in the same transaction as the action that causes them
 * (a single indexed insert), so they can never be lost or point at rolled-back data.
 * Self-actions never notify.
 */
export async function notify(db: Db, input: NotificationInput | NotificationInput[]) {
  const rows = (Array.isArray(input) ? input : [input]).filter((n) => n.recipientId !== n.actorId);
  if (rows.length === 0) return;
  await db.notification.createMany({ data: rows });
}

/** Undo (unlike / unfollow): drop the matching notification if it hasn't been seen yet. */
export async function retract(db: Db, input: NotificationInput) {
  if (input.recipientId === input.actorId) return;
  await db.notification.deleteMany({
    where: {
      recipientId: input.recipientId,
      actorId: input.actorId,
      type: input.type,
      postId: input.postId ?? null,
      commentId: input.commentId ?? null,
      readAt: null,
    },
  });
}

const excerpt = (text: string | null | undefined, n = 80) => {
  if (!text) return null;
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > n ? `${clean.slice(0, n - 1)}…` : clean;
};

/** Inbox, newest first. Notifications about posts the recipient can no longer see are hidden. */
export async function listNotifications(
  viewerId: string,
  limit: number,
  cursor?: Cursor,
  unreadOnly = false,
) {
  const rows = await prisma.notification.findMany({
    where: {
      recipientId: viewerId,
      ...(unreadOnly ? { readAt: null } : {}),
      OR: [
        { postId: null },
        { post: { OR: [{ visibility: "PUBLIC" }, { authorId: viewerId }] } },
      ],
      ...(cursor
        ? {
            AND: [
              {
                OR: [
                  { createdAt: { lt: cursor.createdAt } },
                  { createdAt: cursor.createdAt, id: { lt: cursor.id } },
                ],
              },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    select: {
      id: true,
      type: true,
      createdAt: true,
      readAt: true,
      actor: { select: publicUserSelect },
      post: { select: { id: true, content: true, imageUrl: true } },
      comment: { select: { id: true, content: true, parentId: true } },
    },
  });
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  return {
    items: items.map((n) => ({
      id: n.id,
      type: n.type,
      createdAt: n.createdAt,
      read: n.readAt !== null,
      actor: n.actor,
      post: n.post ? { id: n.post.id, excerpt: excerpt(n.post.content), hasImage: !!n.post.imageUrl } : null,
      comment: n.comment
        ? { id: n.comment.id, excerpt: excerpt(n.comment.content), parentId: n.comment.parentId }
        : null,
    })),
    nextCursor: hasMore && last ? encodeCursor(last) : null,
  };
}

/** Badge count, capped so a huge backlog stays a cheap bounded index scan ("99+"). */
export async function unreadCount(viewerId: string) {
  const [row] = await prisma.$queryRaw<Array<{ count: number }>>`
    SELECT count(*)::int AS count FROM (
      SELECT 1 FROM notifications n
        LEFT JOIN posts p ON p.id = n.post_id
       WHERE n.recipient_id = ${viewerId}::uuid AND n.read_at IS NULL
         AND (n.post_id IS NULL OR p.visibility = 'PUBLIC'::"Visibility" OR p.author_id = ${viewerId}::uuid)
       LIMIT 100) t`;
  return row?.count ?? 0;
}

export async function markRead(viewerId: string, ids?: string[]) {
  const { count } = await prisma.notification.updateMany({
    where: { recipientId: viewerId, readAt: null, ...(ids ? { id: { in: ids } } : {}) },
    data: { readAt: new Date() },
  });
  return count;
}
