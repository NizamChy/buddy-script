"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { UserAvatar } from "@/components/user-avatar";
import { useMarkRead, useNotifications, useUnreadCount } from "@/hooks/use-social";
import { fullName, timeAgo } from "@/lib/format";
import type { AppNotification } from "@/lib/types";

function describe(n: AppNotification): string {
  const quote = (t: string | null | undefined) => (t ? `: “${t}”` : "");
  switch (n.type) {
    case "POST_LIKE":
      return `liked your post${quote(n.post?.excerpt) || (n.post?.hasImage ? " (photo)" : "")}`;
    case "COMMENT":
      return `commented on your post${quote(n.comment?.excerpt)}`;
    case "REPLY":
      return `replied to your comment${quote(n.comment?.excerpt)}`;
    case "COMMENT_LIKE":
      return `liked your comment${quote(n.comment?.excerpt)}`;
    case "FOLLOW":
      return "started following you";
  }
}

const hrefFor = (n: AppNotification) => (n.post ? `/feed#post-${n.post.id}` : `/search?tab=people&q=${encodeURIComponent(fullName(n.actor))}`);

export function NotificationItem({ n, onOpen }: { n: AppNotification; onOpen?: (n: AppNotification) => void }) {
  return (
    <Link
      href={hrefFor(n)}
      className="_notification_box w-full rounded-md text-left no-underline"
      onClick={() => onOpen?.(n)}
      style={n.read ? undefined : { background: "rgba(24,144,255,0.08)" }}
    >
      <div className="_notification_image">
        <UserAvatar user={n.actor} size={56} className="_notify_img" />
      </div>
      <div className="_notification_txt min-w-0">
        <p className="_notification_para mb-1 break-words">
          <span className="font-semibold">{fullName(n.actor)}</span> {describe(n)}
        </p>
        <div className="_nitification_time flex items-center gap-2">
          <span>{timeAgo(n.createdAt)}</span>
          {!n.read && <span className="inline-block size-2 rounded-full bg-[#1890ff]" aria-label="Unread" />}
        </div>
      </div>
    </Link>
  );
}

/** Notification list with infinite paging; marks an item read when it's opened. */
export function NotificationList({ enabled = true, compact = false }: { enabled?: boolean; compact?: boolean }) {
  const list = useNotifications(enabled);
  const markRead = useMarkRead();
  const open = (n: AppNotification) => !n.read && markRead.mutate([n.id]);

  if (list.isPending) {
    return (
      <p className="flex items-center justify-center gap-2 py-6 text-sm text-[#666]">
        <Loader2 className="size-4 animate-spin" /> Loading…
      </p>
    );
  }
  if (list.isError) return <p className="py-6 text-center text-sm text-[#666]">Couldn&apos;t load notifications.</p>;
  const items = list.data.pages.flatMap((p) => p.items);
  if (items.length === 0) {
    return <p className="py-6 text-center text-sm text-[#666]">No notifications yet.</p>;
  }
  return (
    <div>
      {items.map((n) => (
        <NotificationItem key={n.id} n={n} onOpen={open} />
      ))}
      {list.hasNextPage && (
        <button
          type="button"
          className="mx-auto block py-2 text-sm text-[#1890ff] hover:underline disabled:opacity-60"
          disabled={list.isFetchingNextPage}
          onClick={() => list.fetchNextPage()}
        >
          {list.isFetchingNextPage ? "Loading…" : compact ? "Show older" : "Load more"}
        </button>
      )}
    </div>
  );
}

export function MarkAllReadButton({ className = "_notifications_btn_link" }: { className?: string }) {
  const unread = useUnreadCount();
  const markRead = useMarkRead();
  return (
    <button
      type="button"
      className={className}
      disabled={!unread.data?.count || markRead.isPending}
      onClick={() => markRead.mutate(undefined)}
    >
      Mark all as read
    </button>
  );
}

export const badgeText = (count: number) => (count >= 100 ? "99+" : String(count));

/** Header bell: unread badge + the design's notification dropdown. */
export function NotificationBell({ icon }: { icon: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLLIElement>(null);
  const unread = useUnreadCount();
  const count = unread.data?.count ?? 0;

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <li className="nav-item _header_nav_item position-relative" ref={ref}>
      <button
        type="button"
        className="nav-link _header_nav_link border-0 bg-transparent"
        aria-label={count ? `Notifications, ${count} unread` : "Notifications"}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {icon}
        {count > 0 && <span className="_counting bs-counting">{badgeText(count)}</span>}
      </button>
      <div className={`_notification_dropdown ${open ? "show" : ""}`} role="dialog" aria-label="Notifications">
        <div className="_notifications_content">
          <h4 className="_notifications_content_title">Notifications</h4>
          <MarkAllReadButton className="text-sm text-[#1890ff] hover:underline disabled:text-[#999] disabled:no-underline" />
        </div>
        {open && <NotificationList compact />}
        <div className="_notifications_all text-center">
          <Link href="/notifications" className="text-sm text-[#1890ff]" onClick={() => setOpen(false)}>
            See all notifications
          </Link>
        </div>
      </div>
    </li>
  );
}
