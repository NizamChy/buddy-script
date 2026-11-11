import { Prisma } from "@prisma/client";
import { env } from "../../config/env";
import type { Cursor } from "../../lib/cursor";
import { prisma } from "../../lib/prisma";
import { getRedis, withRedis } from "../../lib/redis";

/**
 * "Following" timelines: hybrid fan-out.
 *
 * Write path (fan-out on write): when a user posts, a background job pushes the post id into
 * the Redis sorted set `tl:<followerId>` of each follower (score = created_at in ms), capped
 * at TIMELINE_MAX entries. Reading a timeline is then one ZREVRANGEBYSCORE instead of a
 * join over everyone you follow.
 *
 * Celebrities (followerCount > FANOUT_FOLLOWER_LIMIT) are NOT fanned out: writing to
 * millions of timelines per post doesn't scale. Their recent posts are merged in at read
 * time (fan-out on read) from the (author_id, created_at) index instead.
 *
 * Timelines are a cache: they're only written if they already exist (a Lua script checks),
 * are rebuilt from Postgres on a miss, expire when idle, and every read path falls back to
 * Postgres if Redis is unavailable. Deleted / privatised posts are filtered at hydration.
 */

export const TIMELINE_MAX = 800;
const TIMELINE_TTL_SECONDS = 7 * 24 * 3600;
/** Marker member so an empty-but-built timeline is distinguishable from a missing one. */
const BUILT_MARKER = "_built";
const PER_AUTHOR_REBUILD = 100;

const timelineKey = (userId: string) => `tl:${userId}`;

// Add to a timeline only if it exists (i.e. has been built), then trim the oldest entries.
// The marker sits at +inf so trimming by rank never removes it.
const ADD_IF_BUILT = `
if redis.call('EXISTS', KEYS[1]) == 1 then
  redis.call('ZADD', KEYS[1], ARGV[1], ARGV[2])
  redis.call('ZREMRANGEBYRANK', KEYS[1], 0, -(tonumber(ARGV[3]) + 2))
  return 1
end
return 0`;

export interface TimelineEntry {
  id: string;
  createdAt: Date;
}

const afterCursor = (cursor?: Cursor) =>
  cursor ? Prisma.sql`AND (created_at, id) < (${cursor.createdAt}, ${cursor.id}::uuid)` : Prisma.empty;

const byNewest = (a: TimelineEntry, b: TimelineEntry) =>
  b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);

/**
 * Pure-SQL timeline page: public posts of everyone the viewer follows + the viewer's own
 * posts. Each followee is a LATERAL index range scan that stops after `take` rows.
 * `celebrities`: undefined = all followees, true = only celebrities (and not own posts).
 */
async function sqlTimeline(viewerId: string, take: number, cursor?: Cursor, celebritiesOnly = false) {
  const celebFilter = celebritiesOnly
    ? Prisma.sql`AND u.follower_count > ${env.FANOUT_FOLLOWER_LIMIT}`
    : Prisma.empty;
  const own = celebritiesOnly
    ? Prisma.empty
    : Prisma.sql`UNION ALL
        (SELECT id, created_at FROM posts
          WHERE author_id = ${viewerId}::uuid ${afterCursor(cursor)}
          ORDER BY created_at DESC, id DESC LIMIT ${take})`;
  const rows = await prisma.$queryRaw<Array<{ id: string; created_at: Date }>>`
    SELECT id::text AS id, created_at FROM (
      (SELECT p.id, p.created_at
         FROM follows f
         JOIN users u ON u.id = f.followee_id ${celebFilter}
         CROSS JOIN LATERAL (
           SELECT id, created_at FROM posts
            WHERE author_id = f.followee_id AND visibility = 'PUBLIC'::"Visibility" ${afterCursor(cursor)}
            ORDER BY created_at DESC, id DESC
            LIMIT ${take}) p
        WHERE f.follower_id = ${viewerId}::uuid)
      ${own}
    ) t
    ORDER BY created_at DESC, id DESC
    LIMIT ${take}`;
  return rows.map((r) => ({ id: r.id, createdAt: r.created_at }));
}

/** Rebuilds a missing timeline from Postgres (non-celebrity followees + own posts). */
async function rebuild(viewerId: string) {
  const r = getRedis();
  if (!r) return;
  const rows = await prisma.$queryRaw<Array<{ id: string; created_at: Date }>>`
    SELECT id::text AS id, created_at FROM (
      (SELECT p.id, p.created_at
         FROM follows f
         JOIN users u ON u.id = f.followee_id AND u.follower_count <= ${env.FANOUT_FOLLOWER_LIMIT}
         CROSS JOIN LATERAL (
           SELECT id, created_at FROM posts
            WHERE author_id = f.followee_id AND visibility = 'PUBLIC'::"Visibility"
            ORDER BY created_at DESC, id DESC
            LIMIT ${PER_AUTHOR_REBUILD}) p
        WHERE f.follower_id = ${viewerId}::uuid)
      UNION ALL
      (SELECT id, created_at FROM posts WHERE author_id = ${viewerId}::uuid
        ORDER BY created_at DESC, id DESC LIMIT ${TIMELINE_MAX})
    ) t
    ORDER BY created_at DESC, id DESC
    LIMIT ${TIMELINE_MAX}`;
  const key = timelineKey(viewerId);
  const args: Array<string | number> = ["+inf", BUILT_MARKER];
  for (const row of rows) args.push(row.created_at.getTime(), row.id);
  await r.multi().del(key).zadd(key, ...args).expire(key, TIMELINE_TTL_SECONDS).exec();
}

/** Reads one page of the cached timeline; null means "use SQL for this page". */
async function cachedPage(viewerId: string, take: number, cursor?: Cursor) {
  return withRedis<TimelineEntry[] | null>(null, async (r) => {
    const key = timelineKey(viewerId);
    if (!(await r.exists(key))) await rebuild(viewerId);
    // Inclusive upper bound so posts sharing the cursor's millisecond aren't skipped;
    // the exclusive "(+inf" bound skips the marker.
    const max = cursor ? String(cursor.createdAt.getTime()) : "(+inf";
    const [raw, size] = await Promise.all([
      r.zrevrangebyscore(key, max, "-inf", "WITHSCORES", "LIMIT", 0, take + 20),
      r.zcard(key),
    ]);
    r.expire(key, TIMELINE_TTL_SECONDS).catch(() => undefined);
    const entries: TimelineEntry[] = [];
    for (let i = 0; i < raw.length; i += 2) {
      const id = raw[i]!;
      const ms = Number(raw[i + 1]);
      if (id === BUILT_MARKER) continue;
      // Members with equal scores come back in reverse lexical order, which matches
      // ORDER BY created_at DESC, id DESC, so the keyset comparison is exact.
      if (cursor && ms === cursor.createdAt.getTime() && id >= cursor.id) continue;
      entries.push({ id, createdAt: new Date(ms) });
    }
    const truncated = size - 1 >= TIMELINE_MAX;
    // Ran past the oldest cached post of a truncated timeline: older pages come from SQL.
    if (entries.length < take && truncated) return null;
    return entries.slice(0, take);
  });
}

/** Candidate ids (newest first, up to `take`) for the viewer's Following timeline. */
export async function followingTimeline(viewerId: string, take: number, cursor?: Cursor) {
  const cached = getRedis() ? await cachedPage(viewerId, take, cursor) : null;
  if (!cached) return sqlTimeline(viewerId, take, cursor);
  // Fan-out on read for celebrities, merged with the fanned-out timeline.
  const celebs = await sqlTimeline(viewerId, take, cursor, true);
  if (celebs.length === 0) return cached;
  const seen = new Set<string>();
  return [...cached, ...celebs]
    .sort(byNewest)
    .filter((e) => !seen.has(e.id) && Boolean(seen.add(e.id)))
    .slice(0, take);
}

/** Job: push a new post into its author's and followers' timelines. */
export async function fanoutPost(postId: string) {
  const r = getRedis();
  if (!r) return;
  const post = await prisma.post.findUnique({
    where: { id: postId },
    select: {
      id: true,
      authorId: true,
      visibility: true,
      createdAt: true,
      author: { select: { followerCount: true } },
    },
  });
  if (!post) return; // deleted before the job ran
  const score = post.createdAt.getTime();
  await r.eval(ADD_IF_BUILT, 1, timelineKey(post.authorId), score, post.id, TIMELINE_MAX);
  if (post.visibility !== "PUBLIC" || post.author.followerCount > env.FANOUT_FOLLOWER_LIMIT) return;

  // Walk followers in primary-key order, 1000 at a time, one pipelined round trip per batch.
  let after: string | undefined;
  for (;;) {
    const batch = await prisma.follow.findMany({
      where: { followeeId: post.authorId, ...(after ? { followerId: { gt: after } } : {}) },
      select: { followerId: true },
      orderBy: { followerId: "asc" },
      take: 1000,
    });
    if (batch.length === 0) break;
    const pipe = r.pipeline();
    for (const { followerId } of batch) {
      pipe.eval(ADD_IF_BUILT, 1, timelineKey(followerId), score, post.id, TIMELINE_MAX);
    }
    const results = await pipe.exec();
    const failed = results?.find(([err]) => err);
    if (failed) throw failed[0];
    after = batch[batch.length - 1]!.followerId;
    if (batch.length < 1000) break;
  }
}

/** Following someone new changes what the timeline should contain: drop it, rebuild lazily. */
export async function invalidateTimeline(userId: string) {
  await withRedis(undefined, async (r) => {
    await r.del(timelineKey(userId));
  });
}

export const timelineEnabled = () => getRedis() !== null;
