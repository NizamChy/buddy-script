"use client";

import { memo, useRef, useState } from "react";
import { Globe, Link2, Loader2, Lock, UserCheck, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { UserAvatar } from "@/components/user-avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useDeletePost, useTogglePostLike, useUpdatePost } from "@/hooks/use-feed";
import { useToggleFollow } from "@/hooks/use-social";
import { compactNumber, fullName, timeAgo } from "@/lib/format";
import type { Me, Post, Visibility } from "@/lib/types";
import type { CommentFormHandle } from "./comment-form";
import { CommentSection } from "./comments";
import { Icons } from "./icons";
import { LikersDialog } from "./likers-dialog";
import { PostImage } from "./post-image";

const COLLAPSE_AT = 400;

function likeSummary(post: Post, me: Me) {
  if (post.likeCount === 0) return "";
  const others = post.recentLikers.filter((u) => u.id !== me.id);
  const names = [...(post.likedByMe ? ["You"] : []), ...others.map((u) => u.firstName)];
  const shown = names.slice(0, 2);
  const rest = post.likeCount - shown.length;
  if (rest <= 0) return shown.join(" and ");
  return `${shown.join(", ")} and ${compactNumber(rest)} ${rest === 1 ? "other" : "others"}`;
}

export const PostCard = memo(function PostCard({ post, me }: { post: Post; me: Me }) {
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [likersOpen, setLikersOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const commentRef = useRef<CommentFormHandle>(null);

  const like = useTogglePostLike(me);
  const del = useDeletePost();
  const update = useUpdatePost();
  const follow = useToggleFollow();
  const isMine = post.authorId === me.id;

  const content = post.content ?? "";
  const long = content.length > COLLAPSE_AT;
  const shownContent = long && !expanded ? `${content.slice(0, COLLAPSE_AT).trimEnd()}…` : content;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/feed#post-${post.id}`);
      toast.success("Link copied to clipboard");
    } catch {
      toast.error("Couldn't copy the link");
    }
  };

  const setVisibility = (visibility: Visibility) => update.mutate({ id: post.id, visibility });

  return (
    <article
      id={`post-${post.id}`}
      className="_feed_inner_timeline_post_area _b_radious6 _padd_b24 _padd_t24 _mar_b16"
      aria-label={`Post by ${fullName(post.author)}`}
    >
      <div className="_feed_inner_timeline_content _padd_r24 _padd_l24">
        <div className="_feed_inner_timeline_post_top">
          <div className="_feed_inner_timeline_post_box">
            <div className="_feed_inner_timeline_post_box_image">
              <UserAvatar user={post.author} size={44} className="_post_img" />
            </div>
            <div className="_feed_inner_timeline_post_box_txt">
              <h4 className="_feed_inner_timeline_post_box_title">{fullName(post.author)}</h4>
              <p className="_feed_inner_timeline_post_box_para">
                <time dateTime={post.createdAt} title={new Date(post.createdAt).toLocaleString()}>
                  {timeAgo(post.createdAt)}
                </time>
                {post.editedAt && (
                  <span title={`Edited ${new Date(post.editedAt).toLocaleString()}`}> · edited</span>
                )}{" "}
                .{" "}
                <span
                  className="inline-flex items-center gap-1 text-[#1890ff]"
                  title={post.visibility === "PUBLIC" ? "Visible to everyone" : "Only visible to you"}
                >
                  {post.visibility === "PUBLIC" ? <Globe className="size-3" /> : <Lock className="size-3" />}
                  {post.visibility === "PUBLIC" ? "Public" : "Only me"}
                </span>
              </p>
            </div>
          </div>
          <div className="_feed_inner_timeline_post_box_dropdown">
            <div className="_feed_timeline_post_dropdown">
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger className="_feed_timeline_post_dropdown_link" aria-label="Post options">
                  {Icons.dots}
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem onClick={copyLink}>
                    <Link2 className="size-4 text-[#1890ff]" /> Copy link
                  </DropdownMenuItem>
                  {!isMine && (
                    <DropdownMenuItem
                      onClick={() =>
                        follow.mutate({
                          userId: post.authorId,
                          follow: !post.followingAuthor,
                          name: post.author.firstName,
                        })
                      }
                    >
                      {post.followingAuthor ? (
                        <UserCheck className="size-4 text-[#1890ff]" />
                      ) : (
                        <UserPlus className="size-4 text-[#1890ff]" />
                      )}
                      {post.followingAuthor ? "Unfollow" : "Follow"} {post.author.firstName}
                    </DropdownMenuItem>
                  )}
                  {post.canEdit && (
                    <>
                      <DropdownMenuItem onClick={() => setEditOpen(true)}>
                        {Icons.edit} Edit post
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setVisibility(post.visibility === "PUBLIC" ? "PRIVATE" : "PUBLIC")}
                      >
                        {post.visibility === "PUBLIC" ? (
                          <Lock className="size-4 text-[#1890ff]" />
                        ) : (
                          <Globe className="size-4 text-[#1890ff]" />
                        )}
                        {post.visibility === "PUBLIC" ? "Make private" : "Make public"}
                      </DropdownMenuItem>
                    </>
                  )}
                  {post.canDelete && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
                        {Icons.trash} Delete post
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </div>

        {content && (
          <div className="_feed_inner_timeline_post_title bs-post-content mb-3 text-[15px] font-normal leading-relaxed">
            {shownContent}
            {long && (
              <>
                {" "}
                <button
                  type="button"
                  className="bs-link-btn font-medium text-[#1890ff]"
                  onClick={() => setExpanded((v) => !v)}
                >
                  {expanded ? "See less" : "See more"}
                </button>
              </>
            )}
          </div>
        )}
        {(post.imageUrl || post.imageStatus) && <PostImage post={post} />}
      </div>

      <div className="_feed_inner_timeline_total_reacts _padd_r24 _padd_l24 _mar_b26">
        <div className="_feed_inner_timeline_total_reacts_image">
          {post.likeCount > 0 ? (
            <button
              type="button"
              className="bs-link-btn flex items-center"
              onClick={() => setLikersOpen(true)}
              aria-label="See who liked this post"
            >
              <span className="mr-2 inline-flex items-center">
                {post.recentLikers.map((u, i) => (
                  <UserAvatar
                    key={u.id}
                    user={u}
                    size={28}
                    className={`border-2 border-white ${i > 0 ? "-ml-2" : ""}`}
                  />
                ))}
              </span>
              <span className="text-[14px] text-[#666]">{likeSummary(post, me)}</span>
            </button>
          ) : (
            <span className="text-[14px] text-[#999]">Be the first to like this</span>
          )}
        </div>
        <div className="_feed_inner_timeline_total_reacts_txt">
          <p className="_feed_inner_timeline_total_reacts_para1">
            <button type="button" className="bs-link-btn" onClick={() => setCommentsOpen(true)}>
              <span>{compactNumber(post.commentCount)}</span> {post.commentCount === 1 ? "Comment" : "Comments"}
            </button>
          </p>
        </div>
      </div>

      <div className="_feed_inner_timeline_reaction">
        <button
          type="button"
          className={`_feed_inner_timeline_reaction_emoji _feed_reaction ${post.likedByMe ? "_feed_reaction_active" : ""}`}
          aria-pressed={post.likedByMe}
          disabled={like.isPending}
          onClick={() => like.mutate({ post, like: !post.likedByMe })}
        >
          <span className="_feed_inner_timeline_reaction_link">
            <span className="inline-flex items-center gap-2">
              {Icons.thumbsUp(post.likedByMe)}
              {post.likedByMe ? "Liked" : "Like"}
            </span>
          </span>
        </button>
        <button
          type="button"
          className="_feed_inner_timeline_reaction_comment _feed_reaction"
          onClick={() => {
            setCommentsOpen(true);
            commentRef.current?.focus();
          }}
        >
          <span className="_feed_inner_timeline_reaction_link">
            <span className="inline-flex items-center gap-2">
              {Icons.comment}
              Comment
            </span>
          </span>
        </button>
        <button type="button" className="_feed_inner_timeline_reaction_share _feed_reaction" onClick={copyLink}>
          <span className="_feed_inner_timeline_reaction_link">
            <span className="inline-flex items-center gap-2">
              {Icons.share}
              Share
            </span>
          </span>
        </button>
      </div>

      <CommentSection
        ref={commentRef}
        me={me}
        postId={post.id}
        commentCount={post.commentCount}
        open={commentsOpen}
        onOpen={() => setCommentsOpen(true)}
      />

      <LikersDialog
        open={likersOpen}
        onOpenChange={setLikersOpen}
        target="post"
        id={post.id}
        count={post.likeCount}
      />
      <ConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title="Delete post?"
        description="The post, its comments and likes will be removed permanently."
        pending={del.isPending}
        onConfirm={() => del.mutate(post.id, { onSuccess: () => setDeleteOpen(false) })}
      />
      {editOpen && (
        <EditPostDialog
          post={post}
          open={editOpen}
          onOpenChange={setEditOpen}
          pending={update.isPending}
          onSave={(data) => update.mutate({ id: post.id, ...data }, { onSuccess: () => setEditOpen(false) })}
        />
      )}
    </article>
  );
});

function EditPostDialog({
  post,
  open,
  onOpenChange,
  pending,
  onSave,
}: {
  post: Post;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  pending: boolean;
  onSave: (data: { content: string; visibility: Visibility }) => void;
}) {
  const [content, setContent] = useState(post.content ?? "");
  const [visibility, setVisibility] = useState<Visibility>(post.visibility);
  const empty = !content.trim() && !post.imageUrl;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit post</DialogTitle>
          <DialogDescription className="sr-only">Change the text or who can see this post</DialogDescription>
        </DialogHeader>
        <textarea
          className="form-control min-h-32 text-[15px]"
          value={content}
          maxLength={5000}
          onChange={(e) => setContent(e.target.value)}
          aria-label="Post text"
          autoFocus
        />
        <label className="flex items-center gap-2 text-sm">
          Visibility
          <select
            className="rounded-md border px-2 py-1"
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as Visibility)}
          >
            <option value="PUBLIC">Public</option>
            <option value="PRIVATE">Only me</option>
          </select>
        </label>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            onClick={() => onSave({ content: content.trim(), visibility })}
            disabled={pending || empty}
          >
            {pending && <Loader2 className="size-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
