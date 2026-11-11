"use client";

import Image from "next/image";
import { ImageOff, Loader2 } from "lucide-react";
import { useImageProcessing } from "@/hooks/use-feed";
import { fullName } from "@/lib/format";
import type { Post } from "@/lib/types";

/**
 * The post photo. Served through the Next.js image optimizer (AVIF/WebP, responsive
 * widths, long CDN cache) with the blur placeholder computed by the background job.
 * While that job is still running we reserve the final aspect ratio and poll.
 */
export function PostImage({ post }: { post: Post }) {
  useImageProcessing(post);
  const alt = post.content ? post.content.slice(0, 120) : `Photo by ${fullName(post.author)}`;
  const ratio = post.imageWidth && post.imageHeight ? `${post.imageWidth} / ${post.imageHeight}` : "4 / 3";

  if (post.imageStatus === "PROCESSING" || post.imageStatus === "FAILED") {
    const failed = post.imageStatus === "FAILED";
    return (
      <div className="_feed_inner_timeline_image">
        <div
          className={`flex w-full items-center justify-center gap-2 rounded-md text-sm text-[#666] ${failed ? "bg-[#f5f5f5]" : "bs-shimmer"}`}
          style={{ aspectRatio: ratio, maxHeight: 520 }}
          role="status"
        >
          {failed ? (
            <>
              <ImageOff className="size-4" /> This photo couldn&apos;t be processed.
            </>
          ) : (
            <>
              <Loader2 className="size-4 animate-spin" /> Processing photo…
            </>
          )}
        </div>
      </div>
    );
  }
  if (!post.imageUrl) return null;

  // Local-disk uploads in development are already optimised WebP; skip the optimizer there.
  const local = post.imageUrl.startsWith("/uploads/") || post.imageUrl.includes("localhost");
  return (
    <div className="_feed_inner_timeline_image">
      {post.imageWidth && post.imageHeight ? (
        <Image
          src={post.imageUrl}
          alt={alt}
          width={post.imageWidth}
          height={post.imageHeight}
          sizes="(max-width: 991px) 100vw, 600px"
          className="_time_img h-auto w-full"
          placeholder={post.imageBlur ? "blur" : "empty"}
          blurDataURL={post.imageBlur ?? undefined}
          unoptimized={local}
        />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={post.imageUrl} alt={alt} className="_time_img" loading="lazy" decoding="async" />
      )}
    </div>
  );
}
