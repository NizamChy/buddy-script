"use client";

import { useEffect } from "react";
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
  type QueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import type { Comment, FeedScope, Me, Page, Post, Visibility } from "@/lib/types";

/**
 * Every list of posts lives under ["posts", ...] (both feeds, search results), so one
 * cache update (like, edit, delete, image ready) reaches every place a post is shown.
 */
export const postsKey = ["posts"] as const;
export const feedKey = (scope: FeedScope) => ["posts", "feed", scope] as const;
export const searchPostsKey = (q: string) => ["posts", "search", q] as const;
export const commentsKey = (postId: string) => ["comments", postId] as const;
export const repliesKey = (commentId: string) => ["replies", commentId] as const;

type Pages<T> = InfiniteData<Page<T>, string | null>;

const errorMessage = (err: unknown) =>
  err instanceof ApiError ? err.message : "Network error. Please try again.";

// ---------- cache helpers ----------
export function patchPost(qc: QueryClient, postId: string, fn: (p: Post) => Post) {
  qc.setQueriesData<Pages<Post>>({ queryKey: postsKey }, (data) =>
    data && {
      ...data,
      pages: data.pages.map((pg) => ({
        ...pg,
        items: pg.items.map((p) => (p.id === postId ? fn(p) : p)),
      })),
    },
  );
}

function removePost(qc: QueryClient, postId: string) {
  qc.setQueriesData<Pages<Post>>({ queryKey: postsKey }, (data) =>
    data && {
      ...data,
      pages: data.pages.map((pg) => ({ ...pg, items: pg.items.filter((p) => p.id !== postId) })),
    },
  );
}

function patchCommentEverywhere(qc: QueryClient, commentId: string, fn: (c: Comment) => Comment) {
  for (const key of [["comments"], ["replies"]]) {
    qc.setQueriesData<Pages<Comment>>({ queryKey: key }, (data) =>
      data && {
        ...data,
        pages: data.pages.map((pg) => ({
          ...pg,
          items: pg.items.map((c) => (c.id === commentId ? fn(c) : c)),
        })),
      },
    );
  }
}

// ---------- queries ----------
export function useFeed(scope: FeedScope) {
  return useInfiniteQuery({
    queryKey: feedKey(scope),
    queryFn: ({ pageParam }) => api.feed(scope, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
}

export function useSearchPosts(q: string) {
  return useInfiniteQuery({
    queryKey: searchPostsKey(q),
    queryFn: ({ pageParam }) => api.searchPosts(q, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: q.trim().length > 0,
  });
}

/**
 * While the server normalises an uploaded image in the background, poll that one post
 * (backing off) and swap the finished image into every cached list when it's ready.
 */
export function useImageProcessing(post: Post) {
  const qc = useQueryClient();
  const processing = post.imageStatus === "PROCESSING";
  const query = useQuery({
    queryKey: ["post", post.id, "image"],
    queryFn: () => api.post(post.id),
    enabled: processing,
    refetchInterval: (q) => Math.min(1000 * 2 ** (q.state.dataUpdateCount ?? 0), 8000),
    refetchIntervalInBackground: false,
    retry: false,
  });
  const fresh = query.data?.post;
  useEffect(() => {
    if (processing && fresh && fresh.imageStatus !== "PROCESSING") {
      patchPost(qc, post.id, (p) => ({
        ...p,
        imageUrl: fresh.imageUrl,
        imageWidth: fresh.imageWidth,
        imageHeight: fresh.imageHeight,
        imageBlur: fresh.imageBlur,
        imageStatus: fresh.imageStatus,
      }));
    }
  }, [processing, fresh, qc, post.id]);
}

export function useComments(postId: string, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: commentsKey(postId),
    queryFn: ({ pageParam }) => api.comments(postId, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled,
  });
}

export function useReplies(commentId: string, enabled: boolean) {
  return useInfiniteQuery({
    queryKey: repliesKey(commentId),
    queryFn: ({ pageParam }) => api.replies(commentId, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled,
  });
}

// ---------- post mutations ----------
export function useCreatePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.createPost,
    onSuccess: ({ post }) => {
      // Your own posts head both feeds.
      for (const scope of ["all", "following"] as const) {
        qc.setQueryData<Pages<Post>>(feedKey(scope), (data) => {
          if (!data) return data;
          const [first, ...rest] = data.pages;
          return { ...data, pages: [{ ...first, items: [post, ...first.items] }, ...rest] };
        });
      }
      toast.success(post.visibility === "PRIVATE" ? "Private post published (only you can see it)" : "Post published");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useUpdatePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; content?: string; visibility?: Visibility }) =>
      api.updatePost(v.id, { content: v.content, visibility: v.visibility }),
    onSuccess: ({ post }) => {
      patchPost(qc, post.id, () => post);
      toast.success("Post updated");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useDeletePost() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: api.deletePost,
    onSuccess: (_d, id) => {
      removePost(qc, id);
      toast.success("Post deleted");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

/** Optimistic like/unlike: the UI flips instantly and rolls back if the request fails. */
export function useTogglePostLike(me: Me | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { post: Post; like: boolean }) => api.setPostLike(v.post.id, v.like),
    onMutate: async ({ post, like }) => {
      await qc.cancelQueries({ queryKey: postsKey });
      const before = post;
      patchPost(qc, post.id, (p) => ({
        ...p,
        likedByMe: like,
        likeCount: Math.max(0, p.likeCount + (like ? 1 : -1)),
        recentLikers: me
          ? like
            ? [me, ...p.recentLikers.filter((u) => u.id !== me.id)].slice(0, 3)
            : p.recentLikers.filter((u) => u.id !== me.id)
          : p.recentLikers,
      }));
      return { before };
    },
    onError: (err, { post }, ctx) => {
      if (ctx) patchPost(qc, post.id, () => ctx.before);
      toast.error(errorMessage(err));
    },
    onSuccess: (res, { post }) => {
      patchPost(qc, post.id, (p) => ({ ...p, likedByMe: res.liked, likeCount: res.likeCount }));
      qc.invalidateQueries({ queryKey: ["likers", "post", post.id] });
    },
  });
}

// ---------- comment mutations ----------
export function useCreateComment(postId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { content: string; parentId?: string }) =>
      api.createComment(postId, v.content, v.parentId),
    onSuccess: ({ comment }) => {
      if (comment.parentId) {
        // Append the reply to its thread and bump the parent's reply counter.
        qc.setQueryData<Pages<Comment>>(repliesKey(comment.parentId), (data) => {
          // Not loaded yet: leave it; the thread is opened and fetched fresh by the UI.
          if (!data) return data;
          const pages = [...data.pages];
          const last = pages[pages.length - 1];
          pages[pages.length - 1] = { ...last, items: [...last.items, comment] };
          return { ...data, pages };
        });
        patchCommentEverywhere(qc, comment.parentId, (c) => ({ ...c, replyCount: c.replyCount + 1 }));
      } else {
        // Top-level pages are newest-first, so the new comment goes to the front of page 0.
        qc.setQueryData<Pages<Comment>>(commentsKey(postId), (data) => {
          // Not loaded yet: leave it; the thread is opened and fetched fresh by the UI.
          if (!data) return data;
          const [first, ...rest] = data.pages;
          return { ...data, pages: [{ ...first, items: [comment, ...first.items] }, ...rest] };
        });
      }
      patchPost(qc, postId, (p) => ({ ...p, commentCount: p.commentCount + 1 }));
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useDeleteComment(postId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (c: Comment) => api.deleteComment(c.id),
    onSuccess: (_d, c) => {
      const key = c.parentId ? repliesKey(c.parentId) : commentsKey(postId);
      qc.setQueryData<Pages<Comment>>(key, (data) =>
        data && {
          ...data,
          pages: data.pages.map((pg) => ({ ...pg, items: pg.items.filter((x) => x.id !== c.id) })),
        },
      );
      if (c.parentId) {
        patchCommentEverywhere(qc, c.parentId, (p) => ({ ...p, replyCount: Math.max(0, p.replyCount - 1) }));
      }
      const removed = 1 + (c.parentId ? 0 : c.replyCount);
      patchPost(qc, postId, (p) => ({ ...p, commentCount: Math.max(0, p.commentCount - removed) }));
      toast.success(c.parentId ? "Reply deleted" : "Comment deleted");
    },
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useUpdateComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { id: string; content: string }) => api.updateComment(v.id, v.content),
    onSuccess: ({ comment }) => patchCommentEverywhere(qc, comment.id, () => comment),
    onError: (err) => toast.error(errorMessage(err)),
  });
}

export function useToggleCommentLike() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { comment: Comment; like: boolean }) => api.setCommentLike(v.comment.id, v.like),
    onMutate: ({ comment, like }) => {
      patchCommentEverywhere(qc, comment.id, (c) => ({
        ...c,
        likedByMe: like,
        likeCount: Math.max(0, c.likeCount + (like ? 1 : -1)),
      }));
      return { before: comment };
    },
    onError: (err, { comment }, ctx) => {
      if (ctx) patchCommentEverywhere(qc, comment.id, () => ctx.before);
      toast.error(errorMessage(err));
    },
    onSuccess: (res, { comment }) => {
      patchCommentEverywhere(qc, comment.id, (c) => ({ ...c, likedByMe: res.liked, likeCount: res.likeCount }));
      qc.invalidateQueries({ queryKey: ["likers", "comment", comment.id] });
    },
  });
}
