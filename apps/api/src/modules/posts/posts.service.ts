import { Prisma, type Role, type Visibility } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { encodeCursor, type Cursor } from "../../lib/cursor";
import { badRequest, forbidden, notFound } from "../../lib/errors";
import { publicUserSelect } from "../../lib/serializers";
import { recentPostLikers } from "../likes/likes.service";

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
  const [myLikes, likers] = await Promise.all([
    ids.length
      ? prisma.postLike.findMany({
          where: { userId: viewer.id, postId: { in: ids } },
          select: { postId: true },
        })
      : [],
    recentPostLikers(ids),
  ]);
  const liked = new Set(myLikes.map((l) => l.postId));
  return posts.map((p) => ({
    ...p,
    likedByMe: liked.has(p.id),
    recentLikers: likers.get(p.id) ?? [],
    canEdit: p.authorId === viewer.id,
    canDelete: p.authorId === viewer.id || viewer.role === "ADMIN",
  }));
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
  const page = await prisma.$queryRaw<Array<{ id: string }>>`
    SELECT id::text AS id FROM (
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

  const hasMore = page.length > limit;
  const ids = page.slice(0, limit).map((r) => r.id);
  const rows = ids.length
    ? await prisma.post.findMany({ where: { id: { in: ids } }, select: postSelect })
    : [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const ordered = ids.map((id) => byId.get(id)).filter((p): p is PostRow => Boolean(p));
  const last = ordered[ordered.length - 1];

  return {
    items: await hydrate(ordered, viewer),
    nextCursor: hasMore && last ? encodeCursor(last) : null,
  };
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
    image?: { url: string; width: number; height: number };
  },
) {
  const post = await prisma.post.create({
    data: {
      authorId: viewer.id,
      content: data.content || null,
      visibility: data.visibility,
      imageUrl: data.image?.url,
      imageWidth: data.image?.width,
      imageHeight: data.image?.height,
    },
    select: postSelect,
  });
  return {
    ...post,
    likedByMe: false,
    recentLikers: [],
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
  await prisma.post.update({
    where: { id: postId },
    data: {
      ...(data.content !== undefined && (data.content || null) !== existing.content
        ? { content: data.content || null, editedAt: new Date() }
        : {}),
      ...(data.visibility ? { visibility: data.visibility } : {}),
    },
  });
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
