"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api";
import type { AppNotification, Page, Post, UserSummary } from "@/lib/types";

type Pages<T> = InfiniteData<Page<T>, string | null>;

export const usersKey = ["users"] as const;
export const notificationsKey = ["notifications"] as const;
export const unreadKey = ["notifications", "unread"] as const;

export function useSuggestions(limit = 5) {
  return useQuery({
    queryKey: ["users", "suggestions", limit],
    queryFn: () => api.suggestions(limit),
    staleTime: 60_000,
  });
}

export function useSearchUsers(q: string) {
  return useInfiniteQuery({
    queryKey: ["users", "search", q],
    queryFn: ({ pageParam }) => api.searchUsers(q, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: q.trim().length > 0,
  });
}

/** Apply a change to a user wherever user summaries are cached (suggestions, people search). */
function patchUser(qc: ReturnType<typeof useQueryClient>, id: string, fn: (u: UserSummary) => UserSummary) {
  qc.setQueriesData<{ items: UserSummary[] } | Pages<UserSummary>>({ queryKey: usersKey }, (data) => {
    if (!data) return data;
    if ("pages" in data) {
      return { ...data, pages: data.pages.map((p) => ({ ...p, items: p.items.map((u) => (u.id === id ? fn(u) : u)) })) };
    }
    return { ...data, items: data.items.map((u) => (u.id === id ? fn(u) : u)) };
  });
}

/** Optimistic follow / unfollow, reflected on people lists and on that author's posts. */
export function useToggleFollow() {
  const qc = useQueryClient();
  const apply = (userId: string, follow: boolean) => {
    patchUser(qc, userId, (u) =>
      u.followedByMe === follow
        ? u
        : { ...u, followedByMe: follow, followerCount: Math.max(0, u.followerCount + (follow ? 1 : -1)) },
    );
    qc.setQueriesData<Pages<Post>>({ queryKey: ["posts"] }, (data) =>
      data
        ? {
            ...data,
            pages: data.pages.map((p) => ({
              ...p,
              items: p.items.map((post) => (post.authorId === userId ? { ...post, followingAuthor: follow } : post)),
            })),
          }
        : data,
    );
  };
  return useMutation({
    mutationFn: ({ userId, follow }: { userId: string; follow: boolean; name?: string }) =>
      api.setFollow(userId, follow),
    onMutate: ({ userId, follow }) => apply(userId, follow),
    onError: (err, { userId, follow }) => {
      apply(userId, !follow);
      toast.error(err instanceof ApiError ? err.message : "Couldn't update follow");
    },
    onSuccess: ({ user }, { follow, name }) => {
      patchUser(qc, user.id, () => user);
      if (name) toast.success(follow ? `You're following ${name}` : `Unfollowed ${name}`);
      // The Following timeline changes with the graph.
      void qc.invalidateQueries({ queryKey: ["posts", "feed", "following"] });
    },
  });
}

export function useUnreadCount(enabled = true) {
  return useQuery({
    queryKey: unreadKey,
    queryFn: api.unreadCount,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    enabled,
  });
}

export function useNotifications(enabled = true) {
  return useInfiniteQuery({
    queryKey: ["notifications", "list"],
    queryFn: ({ pageParam }) => api.notifications(false, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled,
  });
}

export function useMarkRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids?: string[]) => api.markNotificationsRead(ids),
    onMutate: (ids) => {
      const match = (n: AppNotification) => !ids || ids.includes(n.id);
      qc.setQueryData<Pages<AppNotification>>(["notifications", "list"], (data) =>
        data
          ? {
              ...data,
              pages: data.pages.map((p) => ({
                ...p,
                items: p.items.map((n) => (match(n) ? { ...n, read: true } : n)),
              })),
            }
          : data,
      );
      qc.setQueryData<{ count: number }>(unreadKey, (d) =>
        d ? { count: ids ? Math.max(0, d.count - ids.length) : 0 } : d,
      );
    },
    onSettled: () => qc.invalidateQueries({ queryKey: unreadKey }),
  });
}

