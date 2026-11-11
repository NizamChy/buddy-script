"use client";

import { useInfiniteQuery } from "@tanstack/react-query";
import { Loader2, ThumbsUp } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { UserAvatar } from "@/components/user-avatar";
import { api } from "@/lib/api";
import { fullName, timeAgo } from "@/lib/format";

/** Paginated "who liked this" list for a post, comment or reply. */
export function LikersDialog({
  open,
  onOpenChange,
  target,
  id,
  count,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: "post" | "comment";
  id: string;
  count: number;
}) {
  const query = useInfiniteQuery({
    queryKey: ["likers", target, id],
    queryFn: ({ pageParam }) =>
      target === "post" ? api.postLikers(id, pageParam) : api.commentLikers(id, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: open,
  });
  const likers = query.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <span className="inline-flex size-6 items-center justify-center rounded-full bg-[#1890ff] text-white">
              <ThumbsUp className="size-3.5" />
            </span>
            {count} {count === 1 ? "like" : "likes"}
          </DialogTitle>
          <DialogDescription className="sr-only">People who liked this {target}</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto -mx-2 px-2">
          {query.isPending ? (
            <ul className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <li key={i} className="flex items-center gap-3">
                  <Skeleton className="size-10 rounded-full" />
                  <Skeleton className="h-4 w-40" />
                </li>
              ))}
            </ul>
          ) : query.isError ? (
            <p className="py-6 text-center text-sm text-red-600">Couldn&apos;t load likes.</p>
          ) : likers.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">No likes yet.</p>
          ) : (
            <ul className="space-y-3">
              {likers.map(({ user, likedAt }) => (
                <li key={user.id} className="flex items-center gap-3">
                  <UserAvatar user={user} size={40} />
                  <div className="min-w-0">
                    <p className="m-0 truncate text-sm font-medium">{fullName(user)}</p>
                    <p className="m-0 text-xs text-muted-foreground">{timeAgo(likedAt)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {query.hasNextPage && (
            <button
              type="button"
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-md border py-2 text-sm hover:bg-muted"
              onClick={() => query.fetchNextPage()}
              disabled={query.isFetchingNextPage}
            >
              {query.isFetchingNextPage && <Loader2 className="size-4 animate-spin" />}
              Show more
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
