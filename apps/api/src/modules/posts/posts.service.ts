import { Prisma, type Role, type Visibility } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { encodeCursor, type Cursor } from "../../lib/cursor";
import { badRequest, forbidden, notFound } from "../../lib/errors";
import { publicUserSelect } from "../../lib/serializers";
import { recentPostLikers } from "../likes/likes.service";
import { fanoutPostJob, processPostImage } from "../jobs/definitions";
import { kickJobs } from "../jobs/queue";
import { followingTimeline, timelineEnabled, type TimelineEntry } from "../timeline/timeline.service";

export interface Viewer {
  id: string;
  role: Role;
}

const postSelect = {
  id: true,
  authorId: true,
  content: true,
  imageUrl: true,
  imageWidth: true,
  imageHeight: true,
  imageStatus: true,
  imageBlur: true,
  visibility: true,
  likeCount: true,
  commentCount: true,
  createdAt: true,
  editedAt: true,
  author: { select: publicUserSelect },
} satisfies Prisma.PostSelect;

type PostRow = Prisma.PostGetPayload<{ select: typeof postSelect }>;

/** Prisma filter for "posts this viewer is allowed to see". */
export const visibleTo = (viewerId: string): Prisma.PostWhereInput => ({
  OR: [{ visibility: "PUBLIC" }, { authorId: viewerId }],
});

/** Loads a post the viewer may see; private posts of others are reported as missing. */
export async function getVisiblePostOrThrow(postId: string, viewerId: string) {
  const post = await prisma.post.findFirst({
    where: { id: postId, ...visibleTo(viewerId) },
    select: { id: true, authorId: true, visibility: true, imageUrl: true, content: true },
  });
  if (!post) throw notFound("Post not found");
  return post;
}

/** Adds viewer-specific state (likedByMe) and a preview of recent likers. */
async function hydrate(posts: PostRow[], viewer: Viewer) {
  const ids = posts.map((p) => p.id);
  const authorIds = [...new Set(posts.map((p) => p.authorId).filter((a) => a !== viewer.id))];
  const [myLikes, likers, follows] = await Promise.all([
    ids.length
      ? prisma.postLike.findMany({
          where: { userId: viewer.id, postId: { in: ids } },
          select: { postId: true },
        })
      : [],
    recentPostLikers(ids),
    authorIds.length
      ? prisma.follow.findMany({
          where: { followerId: viewer.id, followeeId: { in: authorIds } },
          select: { followeeId: true },
        })
      : [],
  ]);
  const liked = new Set(myLikes.map((l) => l.postId));
  const following = new Set(follows.map((f) => f.followeeId));
  return posts.map((p) => ({
    ...p,
    likedByMe: liked.has(p.id),
    recentLikers: likers.get(p.id) ?? [],
    followingAuthor: following.has(p.authorId),
    canEdit: p.authorId === viewer.id,
    canDelete: p.authorId === viewer.id || viewer.role === "ADMIN",
  }));
}

/**
 * Turns an ordered list of candidate ids into a page of fully hydrated posts.
 * Candidates are re-checked against visibility, so stale cache entries (deleted or
 * privatised posts) silently drop out. The cursor follows the candidates, not the
 * survivors, so pagination always makes progress.
 */
async function pageFromCandidates(candidates: TimelineEntry[], limit: number, viewer: Viewer) {
  const hasMore = candidates.length > limit;
  const pageIds = candidates.slice(0, limit);
  const ids = pageIds.map((c) => c.id);
  const rows = ids.length
    ? await prisma.post.findMany({ where: { id: { in: ids }, ...visibleTo(viewer.id) }, select: postSelect })
    : [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ordered = ids.map((id) => byId.get(id)).filter((p): p is PostRow => Boolean(p));
  const last = pageIds[pageIds.length - 1];
  return {
    items: await hydrate(ordered, viewer),
    nextCursor: hasMore && last ? encodeCursor(last) : null,
  };
}

/**
 * Newest-first feed of public posts + the viewer's own private posts.
 *
 * Instead of one query with `visibility = PUBLIC OR author_id = me` (which can't walk a
 * single index in order), we take the top N from each of two index-ordered branches and
 * merge them. Each branch is an index range scan that stops after N rows, so a page costs
 * the same whether the table holds a thousand posts or a hundred million.
 */
export async function listFeed(viewer: Viewer, limit: number, cursor?: Cursor) {
  const after = cursor
    ? Prisma.sql`AND (created_at, id) < (${cursor.createdAt}, ${cursor.id}::uuid)`
    : Prisma.empty;
  const take = limit + 1;
  const page = await prisma.$queryRaw<Array<{ id: string; created_at: Date }>>`
    SELECT id::text AS id, created_at FROM (
      (SELECT id, created_at FROM posts
        WHERE visibility = 'PUBLIC'::"Visibility" ${after}
        ORDER BY created_at DESC, id DESC LIMIT ${take})
      UNION ALL
      (SELECT id, created_at FROM posts
        WHERE author_id = ${viewer.id}::uuid AND visibility = 'PRIVATE'::"Visibility" ${after}
        ORDER BY created_at DESC, id DESC LIMIT ${take})
    ) feed
    ORDER BY created_at DESC, id DESC
    LIMIT ${take}`;
  return pageFromCandidates(
    page.map((r) => ({ id: r.id, createdAt: r.created_at })),
    limit,
    viewer,
  );
}

/** Posts from people the viewer follows (plus their own), served from the Redis timeline cache. */
export async function listFollowingFeed(viewer: Viewer, limit: number, cursor?: Cursor) {
  return pageFromCandidates(await followingTimeline(viewer.id, limit + 1, cursor), limit, viewer);
}

/**
 * Full-text search over posts the viewer may see, best match first.
 * Each word is a prefix match ("photo" finds "photography"), stemmed with the English
 * dictionary. The expression matches the GIN index in the search_indexes migration.
 */
export async function searchPosts(viewer: Viewer, q: string, limit: number, offset: number) {
  const words = (q.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).slice(0, 8);
  if (words.length === 0) return { items: [], nextCursor: null };
  const query = words.map((w) => `${w}:*`).join(" & ");
  const rows = await prisma.$queryRaw<Array<{ id: string; created_at: Date }>>`
    SELECT id::text AS id, created_at
      FROM posts, to_tsquery('english'::regconfig, ${query}) AS q
     WHERE to_tsvector('english'::regconfig, coalesce(content, '')) @@ q
       AND (visibility = 'PUBLIC'::"Visibility" OR author_id = ${viewer.id}::uuid)
     ORDER BY ts_rank(to_tsvector('english'::regconfig, coalesce(content, '')), q) DESC,
              created_at DESC, id DESC
     LIMIT ${limit + 1} OFFSET ${offset}`;
  const page = await pageFromCandidates(
    rows.map((r) => ({ id: r.id, createdAt: r.created_at })),
    limit,
    viewer,
  );
  return { items: page.items, nextCursor: rows.length > limit ? String(offset + limit) : null };
}

export async function getPost(postId: string, viewer: Viewer) {
  const post = await prisma.post.findFirst({
    where: { id: postId, ...visibleTo(viewer.id) },
    select: postSelect,
  });
  if (!post) throw notFound("Post not found");
  const [hydrated] = await hydrate([post], viewer);
  return hydrated;
}

export async function createPost(
  viewer: Viewer,
  data: {
    content?: string;
    visibility: Visibility;
    /** Validated original upload; normalised later by the image.process job. */
    image?: { buffer: Buffer; width: number; height: number };
  },
) {
  const post = await prisma.$transaction(async (tx) => {
    const created = await tx.post.create({
      data: {
        authorId: viewer.id,
        content: data.content || null,
        visibility: data.visibility,
        imageWidth: data.image?.width,
        imageHeight: data.image?.height,
        imageStatus: data.image ? "PROCESSING" : null,
      },
      select: postSelect,
    });
    // Outbox: the jobs commit atomically with the post they belong to.
    if (data.image) {
      const staging = await tx.uploadStaging.create({
        data: { data: new Uint8Array(data.image.buffer) },
        select: { id: true },
      });
      await processPostImage.enqueue({ postId: created.id, stagingId: staging.id }, { tx, maxAttempts: 3 });
    }
    if (timelineEnabled()) await fanoutPostJob.enqueue({ postId: created.id }, { tx });
    return created;
  });
  kickJobs();
  return {
    ...post,
    likedByMe: false,
    recentLikers: [],
    followingAuthor: false,
    canEdit: true,
    canDelete: true,
  };
}

export async function updatePost(
  postId: string,
  viewer: Viewer,
  data: { content?: string | null; visibility?: Visibility },
) {
  const existing = await getVisiblePostOrThrow(postId, viewer.id);
  if (existing.authorId !== viewer.id) throw forbidden("Only the author can edit this post");
  if (data.content !== undefined && !data.content && !existing.imageUrl) {
    throw badRequest("A post cannot be empty");
  }
  // Becoming public: followers' cached timelines need it now.
  const publishing = data.visibility === "PUBLIC" && existing.visibility === "PRIVATE";
  await prisma.post.update({
    where: { id: postId },
    data: {
      ...(data.content !== undefined && (data.content || null) !== existing.content
        ? { content: data.content || null, editedAt: new Date() }
        : {}),
      ...(data.visibility ? { visibility: data.visibility } : {}),
    },
  });
  if (publishing && timelineEnabled()) {
    await fanoutPostJob.enqueue({ postId });
    kickJobs();
  }
  return getPost(postId, viewer);
}

export async function deletePost(postId: string, viewer: Viewer) {
  const existing = await prisma.post.findFirst({
    where: { id: postId, ...visibleTo(viewer.id) },
    select: { authorId: true, imageUrl: true },
  });
  if (!existing) throw notFound("Post not found");
  if (existing.authorId !== viewer.id && viewer.role !== "ADMIN") {
    throw forbidden("You can only delete your own posts");
  }
  // Comments and likes are removed by ON DELETE CASCADE.
  await prisma.post.delete({ where: { id: postId } });
  return existing.imageUrl;
}
