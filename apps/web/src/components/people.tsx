"use client";

import { Loader2 } from "lucide-react";
import { useState } from "react";
import { UserAvatar } from "@/components/user-avatar";
import { useSuggestions, useToggleFollow } from "@/hooks/use-social";
import { compactNumber, fullName } from "@/lib/format";
import type { UserSummary } from "@/lib/types";

const followers = (u: UserSummary) =>
  `${compactNumber(u.followerCount)} ${u.followerCount === 1 ? "follower" : "followers"}`;

export function FollowButton({ user, className = "" }: { user: UserSummary; className?: string }) {
  const follow = useToggleFollow();
  if (user.isMe) return null;
  return (
    <button
      type="button"
      className={`_right_info_btn_link ${user.followedByMe ? "" : "_right_info_btn_link_active"} ${className}`}
      aria-pressed={user.followedByMe}
      onClick={() => follow.mutate({ userId: user.id, follow: !user.followedByMe, name: user.firstName })}
    >
      {user.followedByMe ? "Following" : "Follow"}
    </button>
  );
}

/** "You Might Like": people the viewer doesn't follow yet, most-followed first. */
export function Suggestions() {
  const q = useSuggestions(5);
  // Hide people dismissed with "Ignore" for this session.
  const [ignored, setIgnored] = useState<string[]>([]);
  const items = (q.data?.items ?? []).filter((u) => !ignored.includes(u.id));

  return (
    <div className="_right_inner_area_info _padd_t24 _padd_b24 _padd_r24 _padd_l24 _b_radious6 _feed_inner_area">
      <div className="_right_inner_area_info_content _mar_b24">
        <h4 className="_right_inner_area_info_content_title _title5">You Might Like</h4>
        <span className="_right_inner_area_info_content_txt">
          <a className="_right_inner_area_info_content_txt_link" href="/search?tab=people">
            Find people
          </a>
        </span>
      </div>
      <hr className="_underline" />
      {q.isPending && (
        <p className="flex items-center gap-2 text-sm text-[#666]">
          <Loader2 className="size-4 animate-spin" /> Loading…
        </p>
      )}
      {q.isSuccess && items.length === 0 && (
        <p className="mb-0 text-sm text-[#666]">You&apos;re following everyone we&apos;d suggest. 🎉</p>
      )}
      {items.map((u) => (
        <div key={u.id} className="_right_inner_area_info_ppl mb-4">
          <div className="_right_inner_area_info_box">
            <div className="_right_inner_area_info_box_image">
              <UserAvatar user={u} size={56} className="_ppl_img" />
            </div>
            <div className="_right_inner_area_info_box_txt">
              <h4 className="_right_inner_area_info_box_title">{fullName(u)}</h4>
              <p className="_right_inner_area_info_box_para">{followers(u)}</p>
            </div>
          </div>
          <div className="_right_info_btn_grp">
            <button type="button" className="_right_info_btn_link" onClick={() => setIgnored((l) => [...l, u.id])}>
              Ignore
            </button>
            <FollowButton user={u} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** A row in people search results. */
export function PersonRow({ user }: { user: UserSummary }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <UserAvatar user={user} size={48} />
        <div className="min-w-0">
          <p className="mb-0 truncate font-medium text-[var(--color6)]">
            {fullName(user)} {user.isMe && <span className="text-xs text-[#999]">(you)</span>}
          </p>
          <p className="mb-0 text-xs text-[#666]">
            {followers(user)} · {compactNumber(user.followingCount)} following
          </p>
        </div>
      </div>
      <div className="_right_info_btn_grp shrink-0">
        <FollowButton user={user} />
      </div>
    </div>
  );
}
