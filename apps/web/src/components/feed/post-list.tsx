"use client";

import { useEffect, useRef } from "react";
import { Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useFeed } from "@/hooks/use-feed";
import type { Me } from "@/lib/types";
import { PostCard } from "./post-card";

function PostSkeleton() {
  return (
    <div className="_feed_inner_timeline_post_area _b_radious6 _padd_b24 _padd_t24 _padd_r24 _padd_l24 _mar_b16">
      <div className="flex items-center gap-3">
        <Skeleton className="size-11 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-3 w-24" />
        </div>
      </div>
      <Skeleton className="mt-4 h-4 w-full" />
      <Skeleton className="mt-2 h-4 w-4/5" />
      <Skeleton className="mt-4 h-48 w-full" />
    </div>
  );
}

/** Infinite, newest-first feed. The next page loads as the sentinel nears the viewport. */
export function PostList({ me }: { me: Me }) {
  const feed = useFeed();
  const sentinel = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = feed;

  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasNextPage) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && !isFetchingNextPage) fetchNextPage();
      },
      { rootMargin: "800px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (feed.isPending) {
    return (
      <div aria-busy="true" aria-label="Loading posts">
        <PostSkeleton />
        <PostSkeleton />
      </div>
    );
  }

  if (feed.isError) {
    return (
      <div className="_feed_inner_timeline_post_area _b_radious6 _padd_b24 _padd_t24 _padd_r24 _padd_l24 _mar_b16 text-center">
        <p className="mb-3 text-[#666]">We couldn&apos;t load the feed.</p>
        <button type="button" className="_feed_inner_text_area_btn_link mx-auto" onClick={() => feed.refetch()}>
          Try again
        </button>
      </div>
    );
  }

  const posts = feed.data.pages.flatMap((p) => p.items);

  if (posts.length === 0) {
    return (
      <div className="_feed_inner_timeline_post_area _b_radious6 _padd_b24 _padd_t24 _padd_r24 _padd_l24 _mar_b16 text-center">
        <p className="mb-0 text-[#666]">No posts yet — be the first to share something!</p>
      </div>
    );
  }

  return (
    <>
      {posts.map((post) => (
        <PostCard key={post.id} post={post} me={me} />
      ))}
      <div ref={sentinel} />
      {isFetchingNextPage && (
        <p className="flex items-center justify-center gap-2 py-4 text-sm text-[#666]">
          <Loader2 className="size-4 animate-spin" /> Loading more posts…
        </p>
      )}
      {hasNextPage && !isFetchingNextPage && (
        <button
          type="button"
          className="mx-auto mb-6 block text-sm text-[#1890ff] hover:underline"
          onClick={() => fetchNextPage()}
        >
          Load more
        </button>
      )}
      {!hasNextPage && (
        <p className="py-4 text-center text-sm text-[#999]">You&apos;re all caught up ✨</p>
      )}
    </>
  );
}
