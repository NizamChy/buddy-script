import type {
  AppNotification,
  Comment,
  FeedScope,
  LikeResult,
  Liker,
  Me,
  Page,
  Post,
  UserSummary,
  Visibility,
} from "./types";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: Array<{ path: string; message: string }>,
  ) {
    super(message);
  }
}

// Concurrent 401s share a single refresh call.
let refreshing: Promise<boolean> | null = null;

async function refreshSession(): Promise<boolean> {
  refreshing ??= fetch("/api/auth/refresh", { method: "POST", credentials: "same-origin" })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      setTimeout(() => (refreshing = null), 0);
    });
  return refreshing;
}

function onSessionLost() {
  if (typeof window === "undefined") return;
  if (!["/login", "/register"].includes(window.location.pathname)) {
    // Hard navigation on purpose: drops all in-memory state of the signed-out session.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname)}`;
  }
}

async function request<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !(init.body instanceof FormData)) headers.set("Content-Type", "application/json");
  headers.set("Accept", "application/json");

  const res = await fetch(`/api${path}`, { ...init, headers, credentials: "same-origin" });

  const isCredentialCall = /^\/auth\/(login|register|refresh|logout)/.test(path);
  if (res.status === 401 && retry && !isCredentialCall) {
    const body = await res.clone().json().catch(() => null);
    if (body?.error?.code === "TOKEN_EXPIRED" || body?.error?.code === "UNAUTHORIZED") {
      if (await refreshSession()) return request<T>(path, init, false);
      onSessionLost();
    }
  }

  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(
      res.status,
      data?.error?.code ?? "UNKNOWN",
      data?.error?.message ?? "Something went wrong. Please try again.",
      data?.error?.details,
    );
  }
  return data as T;
}

const qs = (params: Record<string, string | number | undefined | null>) => {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) s.set(k, String(v));
  const str = s.toString();
  return str ? `?${str}` : "";
};

export const api = {
  // Auth
  me: () => request<{ user: Me }>("/auth/me"),
  login: (body: { email: string; password: string; remember: boolean }) =>
    request<{ user: Me }>("/auth/login", { method: "POST", body: JSON.stringify(body) }),
  register: (body: { firstName: string; lastName: string; email: string; password: string }) =>
    request<{ user: Me }>("/auth/register", { method: "POST", body: JSON.stringify(body) }),
  logout: () => request<void>("/auth/logout", { method: "POST" }),

  // Posts
  feed: (scope: FeedScope, cursor?: string | null) =>
    request<Page<Post>>(`/posts${qs({ scope, cursor, limit: 10 })}`),
  post: (id: string) => request<{ post: Post }>(`/posts/${id}`),
  createPost: (data: { content: string; visibility: Visibility; image?: Blob | null }) => {
    const form = new FormData();
    form.set("content", data.content);
    form.set("visibility", data.visibility);
    if (data.image) form.set("image", data.image, "image.webp");
    return request<{ post: Post }>("/posts", { method: "POST", body: form });
  },
  updatePost: (id: string, data: { content?: string; visibility?: Visibility }) =>
    request<{ post: Post }>(`/posts/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  deletePost: (id: string) => request<void>(`/posts/${id}`, { method: "DELETE" }),
  setPostLike: (id: string, like: boolean) =>
    request<LikeResult>(`/posts/${id}/like`, { method: like ? "PUT" : "DELETE" }),
  postLikers: (id: string, cursor?: string | null) =>
    request<Page<Liker>>(`/posts/${id}/likes${qs({ cursor })}`),

  // Comments
  comments: (postId: string, cursor?: string | null) =>
    request<Page<Comment>>(`/posts/${postId}/comments${qs({ cursor, limit: 5 })}`),
  replies: (commentId: string, cursor?: string | null) =>
    request<Page<Comment>>(`/comments/${commentId}/replies${qs({ cursor, limit: 5 })}`),
  createComment: (postId: string, content: string, parentId?: string) =>
    request<{ comment: Comment }>(`/posts/${postId}/comments`, {
      method: "POST",
      body: JSON.stringify({ content, parentId }),
    }),
  updateComment: (id: string, content: string) =>
    request<{ comment: Comment }>(`/comments/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ content }),
    }),
  deleteComment: (id: string) => request<void>(`/comments/${id}`, { method: "DELETE" }),
  setCommentLike: (id: string, like: boolean) =>
    request<LikeResult>(`/comments/${id}/like`, { method: like ? "PUT" : "DELETE" }),
  commentLikers: (id: string, cursor?: string | null) =>
    request<Page<Liker>>(`/comments/${id}/likes${qs({ cursor })}`),

  // People
  user: (id: string) => request<{ user: UserSummary }>(`/users/${id}`),
  suggestions: (limit = 5) => request<{ items: UserSummary[] }>(`/users/suggestions${qs({ limit })}`),
  setFollow: (id: string, follow: boolean) =>
    request<{ user: UserSummary }>(`/users/${id}/follow`, { method: follow ? "PUT" : "DELETE" }),

  // Search
  searchPosts: (q: string, cursor?: string | null) =>
    request<Page<Post>>(`/search/posts${qs({ q, cursor })}`),
  searchUsers: (q: string, cursor?: string | null) =>
    request<Page<UserSummary>>(`/search/users${qs({ q, cursor })}`),

  // Notifications
  notifications: (unread: boolean, cursor?: string | null) =>
    request<Page<AppNotification>>(`/notifications${qs({ cursor, unread: unread ? "true" : undefined })}`),
  unreadCount: () => request<{ count: number }>("/notifications/unread-count"),
  markNotificationsRead: (ids?: string[]) =>
    request<{ updated: number }>("/notifications/read", { method: "POST", body: JSON.stringify(ids ? { ids } : {}) }),
};
