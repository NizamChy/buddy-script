import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { encodeCursor, type Cursor } from "../../lib/cursor";
import { publicUserSelect } from "../../lib/serializers";
import { notify, retract } from "../notifications/notifications.service";

/**
 * Likes are idempotent: liking twice or unliking something not liked is a no-op.
 * The (target, user) composite primary key enforces one like per user, and the
 * denormalised counter is only touched when a row was actually inserted/deleted,
 * inside the same transaction, so counts never drift.
 */
export async function likePost(postId: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.postLike.createMany({
      data: [{ postId, userId }],
      skipDuplicates: true,
    });
    const post = count
      ? await tx.post.update({
          where: { id: postId },
          data: { likeCount: { increment: 1 } },
          select: { likeCount: true, authorId: true },
        })
      : await tx.post.findUniqueOrThrow({ where: { id: postId }, select: { likeCount: true, authorId: true } });
    if (count) await notify(tx, { recipientId: post.authorId, actorId: userId, type: "POST_LIKE", postId });
    return { liked: true, likeCount: post.likeCount };
  });
}

export async function unlikePost(postId: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.postLike.deleteMany({ where: { postId, userId } });
    const post = count
      ? await tx.post.update({
          where: { id: postId },
          data: { likeCount: { decrement: 1 } },
          select: { likeCount: true, authorId: true },
        })
      : await tx.post.findUniqueOrThrow({ where: { id: postId }, select: { likeCount: true, authorId: true } });
    if (count) await retract(tx, { recipientId: post.authorId, actorId: userId, type: "POST_LIKE", postId });
    return { liked: false, likeCount: post.likeCount };
  });
}

export async function likeComment(commentId: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.commentLike.createMany({
      data: [{ commentId, userId }],
      skipDuplicates: true,
    });
    const c = count
      ? await tx.comment.update({
          where: { id: commentId },
          data: { likeCount: { increment: 1 } },
          select: { likeCount: true, authorId: true, postId: true },
        })
      : await tx.comment.findUniqueOrThrow({
          where: { id: commentId },
          select: { likeCount: true, authorId: true, postId: true },
        });
    if (count) {
      await notify(tx, {
        recipientId: c.authorId,
        actorId: userId,
        type: "COMMENT_LIKE",
        postId: c.postId,
        commentId,
      });
    }
    return { liked: true, likeCount: c.likeCount };
  });
}

export async function unlikeComment(commentId: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.commentLike.deleteMany({ where: { commentId, userId } });
    const c = count
      ? await tx.comment.update({
          where: { id: commentId },
          data: { likeCount: { decrement: 1 } },
          select: { likeCount: true, authorId: true, postId: true },
        })
      : await tx.comment.findUniqueOrThrow({
          where: { id: commentId },
          select: { likeCount: true, authorId: true, postId: true },
        });
    if (count) {
      await retract(tx, {
        recipientId: c.authorId,
        actorId: userId,
        type: "COMMENT_LIKE",
        postId: c.postId,
        commentId,
      });
    }
    return { liked: false, likeCount: c.likeCount };
  });
}

function likersWhere(cursor?: Cursor) {
  if (!cursor) return {};
  // Likes have no surrogate id; userId is the tie-breaker for equal timestamps.
  return {
    OR: [
      { createdAt: { lt: cursor.createdAt } },
      { createdAt: cursor.createdAt, userId: { lt: cursor.id } },
    ],
  };
}

const likerOrder = [{ createdAt: "desc" as const }, { userId: "desc" as const }];

function pageOf<T extends { createdAt: Date; userId: string; user: unknown }>(
  rows: T[],
  limit: number,
) {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items[items.length - 1];
  return {
    items: items.map((r) => ({ user: r.user, likedAt: r.createdAt })),
    nextCursor: hasMore && last ? encodeCursor({ createdAt: last.createdAt, id: last.userId }) : null,
  };
}

export async function listPostLikers(postId: string, limit: number, cursor?: Cursor) {
  const rows = await prisma.postLike.findMany({
    where: { postId, ...likersWhere(cursor) },
    orderBy: likerOrder,
    take: limit + 1,
    select: { createdAt: true, userId: true, user: { select: publicUserSelect } },
  });
  return pageOf(rows, limit);
}

export async function listCommentLikers(commentId: string, limit: number, cursor?: Cursor) {
  const rows = await prisma.commentLike.findMany({
    where: { commentId, ...likersWhere(cursor) },
    orderBy: likerOrder,
    take: limit + 1,
    select: { createdAt: true, userId: true, user: { select: publicUserSelect } },
  });
  return pageOf(rows, limit);
}

/**
 * Up to `n` most recent likers for each post, in one round-trip.
 * LATERAL + LIMIT walks the (post_id, created_at DESC) index and stops after n rows per
 * post, so the cost is independent of how many likes a post has.
 */
export async function recentPostLikers(postIds: string[], n = 3) {
  const result = new Map<string, Array<{ id: string; firstName: string; lastName: string; avatarUrl: string | null }>>();
  if (postIds.length === 0) return result;
  const rows = await prisma.$queryRaw<
    Array<{ post_id: string; id: string; first_name: string; last_name: string; avatar_url: string | null }>
  >`
    SELECT p.id::text AS post_id, u.id::text AS id, u.first_name, u.last_name, u.avatar_url
    FROM unnest(ARRAY[${Prisma.join(postIds.map((id) => Prisma.sql`${id}::uuid`))}]) AS p(id)
    CROSS JOIN LATERAL (
      SELECT pl.user_id, pl.created_at
      FROM post_likes pl
      WHERE pl.post_id = p.id
      ORDER BY pl.created_at DESC
      LIMIT ${n}
    ) l
    JOIN users u ON u.id = l.user_id
    ORDER BY p.id, l.created_at DESC`;
  for (const r of rows) {
    const list = result.get(r.post_id) ?? [];
    list.push({ id: r.id, firstName: r.first_name, lastName: r.last_name, avatarUrl: r.avatar_url });
    result.set(r.post_id, list);
  }
  return result;
}
