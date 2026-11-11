import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { badRequest, notFound } from "../../lib/errors";
import { publicUserSelect, type PublicUser } from "../../lib/serializers";
import { notify, retract } from "../notifications/notifications.service";
import { invalidateTimeline } from "../timeline/timeline.service";

const summarySelect = {
  ...publicUserSelect,
  followerCount: true,
  followingCount: true,
} satisfies Prisma.UserSelect;

type SummaryRow = Prisma.UserGetPayload<{ select: typeof summarySelect }>;

/** Adds viewer-relative fields (followedByMe, isMe) in one query. */
async function withFollowState(rows: SummaryRow[], viewerId: string) {
  const ids = rows.map((r) => r.id);
  const follows = ids.length
    ? await prisma.follow.findMany({
        where: { followerId: viewerId, followeeId: { in: ids } },
        select: { followeeId: true },
      })
    : [];
  const set = new Set(follows.map((f) => f.followeeId));
  return rows.map((r) => ({ ...r, followedByMe: set.has(r.id), isMe: r.id === viewerId }));
}

export async function getUserSummary(userId: string, viewerId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: summarySelect });
  if (!user) throw notFound("User not found");
  const [summary] = await withFollowState([user], viewerId);
  return summary;
}

/**
 * Idempotent follow: the (follower, followee) primary key absorbs duplicates and the
 * counters only move when an edge was actually inserted, in the same transaction.
 */
export async function follow(viewerId: string, targetId: string) {
  if (viewerId === targetId) throw badRequest("You can't follow yourself");
  const changed = await prisma.$transaction(async (tx) => {
    const target = await tx.user.findUnique({ where: { id: targetId }, select: { id: true } });
    if (!target) throw notFound("User not found");
    const { count } = await tx.follow.createMany({
      data: [{ followerId: viewerId, followeeId: targetId }],
      skipDuplicates: true,
    });
    if (count) {
      await tx.user.update({ where: { id: targetId }, data: { followerCount: { increment: 1 } } });
      await tx.user.update({ where: { id: viewerId }, data: { followingCount: { increment: 1 } } });
      await notify(tx, { recipientId: targetId, actorId: viewerId, type: "FOLLOW" });
    }
    return count > 0;
  });
  if (changed) await invalidateTimeline(viewerId);
  return getUserSummary(targetId, viewerId);
}

export async function unfollow(viewerId: string, targetId: string) {
  const changed = await prisma.$transaction(async (tx) => {
    const { count } = await tx.follow.deleteMany({ where: { followerId: viewerId, followeeId: targetId } });
    if (count) {
      await tx.user.update({ where: { id: targetId }, data: { followerCount: { decrement: 1 } } });
      await tx.user.update({ where: { id: viewerId }, data: { followingCount: { decrement: 1 } } });
      await retract(tx, { recipientId: targetId, actorId: viewerId, type: "FOLLOW" });
    }
    return count > 0;
  });
  if (changed) await invalidateTimeline(viewerId);
  return getUserSummary(targetId, viewerId);
}

/** "You might like": popular people the viewer doesn't follow yet. */
export async function suggestions(viewerId: string, limit: number) {
  const rows = await prisma.user.findMany({
    where: { id: { not: viewerId }, followers: { none: { followerId: viewerId } } },
    orderBy: [{ followerCount: "desc" }, { createdAt: "desc" }],
    take: limit,
    select: summarySelect,
  });
  return withFollowState(rows, viewerId);
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

/**
 * Substring / fuzzy name search. `lower(first_name || ' ' || last_name)` matches the
 * trigram GIN index expression exactly, so LIKE '%q%' is an index scan, not a table scan.
 */
export async function searchUsers(viewerId: string, q: string, limit: number, offset: number) {
  const needle = q.trim().toLowerCase().replace(/\s+/g, " ");
  if (needle.length < 2) return { items: [], nextCursor: null };
  const rows = await prisma.$queryRaw<SummaryRow[]>`
    SELECT id::text AS id, first_name AS "firstName", last_name AS "lastName", avatar_url AS "avatarUrl",
           follower_count AS "followerCount", following_count AS "followingCount"
      FROM users
     WHERE lower(first_name || ' ' || last_name) LIKE ${`%${escapeLike(needle)}%`}
     ORDER BY similarity(lower(first_name || ' ' || last_name), ${needle}) DESC,
              follower_count DESC, id
     LIMIT ${limit + 1} OFFSET ${offset}`;
  const hasMore = rows.length > limit;
  return {
    items: await withFollowState(hasMore ? rows.slice(0, limit) : rows, viewerId),
    nextCursor: hasMore ? String(offset + limit) : null,
  };
}

export type UserSummary = Awaited<ReturnType<typeof getUserSummary>>;
export type { PublicUser };
