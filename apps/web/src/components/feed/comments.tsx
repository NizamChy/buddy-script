"use client";

import { forwardRef, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { UserAvatar } from "@/components/user-avatar";
import {
  useComments,
  useDeleteComment,
  useReplies,
  useToggleCommentLike,
  useUpdateComment,
} from "@/hooks/use-feed";
import { compactNumber, fullName, shortAgo, timeAgo } from "@/lib/format";
import type { Comment, Me } from "@/lib/types";
import { CommentForm, type CommentFormHandle } from "./comment-form";
import { Icons } from "./icons";
import { LikersDialog } from "./likers-dialog";

function dedupe(items: Comment[]) {
  const seen = new Set<string>();
  return items.filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)));
}

/** Comment box + thread for one post. Comments are fetched only once the thread is opened. */
export const CommentSection = forwardRef<
  CommentFormHandle,
  { me: Me; postId: string; commentCount: number; open: boolean; onOpen: () => void }
>(function CommentSection({ me, postId, commentCount, open, onOpen }, ref) {
  const query = useComments(postId, open);
  // Pages arrive newest-first; display oldest at the top like a conversation.
  const comments = useMemo(
    () => dedupe(query.data?.pages.flatMap((p) => p.items) ?? []).reverse(),
    [query.data],
  );
  const hidden = Math.max(0, commentCount - comments.length);

  return (
    <>
      <div className="_feed_inner_timeline_cooment_area">
        <CommentForm ref={ref} me={me} postId={postId} onPosted={onOpen} />
      </div>
      <div className="_timline_comment_main">
        {!open && commentCount > 0 && (
          <div className="_previous_comment">
            <button type="button" className="_previous_comment_txt" onClick={onOpen}>
              View {commentCount} {commentCount === 1 ? "comment" : "comments"}
            </button>
          </div>
        )}
        {open && query.isPending && (
          <p className="flex items-center gap-2 py-2 text-sm text-gray-500">
            <Loader2 className="size-4 animate-spin" /> Loading comments…
          </p>
        )}
        {open && query.isError && (
          <p className="py-2 text-sm text-red-600">
            Couldn&apos;t load comments.{" "}
            <button type="button" className="bs-link-btn underline" onClick={() => query.refetch()}>
              Retry
            </button>
          </p>
        )}
        {open && query.hasNextPage && (
          <div className="_previous_comment">
            <button
              type="button"
              className="_previous_comment_txt"
              onClick={() => query.fetchNextPage()}
              disabled={query.isFetchingNextPage}
            >
              {query.isFetchingNextPage ? "Loading…" : `View ${hidden > 0 ? hidden : ""} previous comments`}
            </button>
          </div>
        )}
        {comments.map((c) => (
          <CommentItem key={c.id} me={me} comment={c} postId={postId} />
        ))}
      </div>
    </>
  );
});

function CommentItem({ me, comment, postId }: { me: Me; comment: Comment; postId: string }) {
  const isReply = !!comment.parentId;
  const [showReplies, setShowReplies] = useState(false);
  const [replying, setReplying] = useState(false);
  const [likersOpen, setLikersOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(comment.content);
  const replyRef = useRef<CommentFormHandle>(null);

  const toggleLike = useToggleCommentLike();
  const del = useDeleteComment(postId);
  const update = useUpdateComment();

  const startReply = () => {
    setShowReplies(true);
    setReplying(true);
    setTimeout(() => replyRef.current?.focus(), 0);
  };

  const saveEdit = () => {
    const content = draft.trim();
    if (!content || content === comment.content) return setEditing(false);
    update.mutate({ id: comment.id, content }, { onSuccess: () => setEditing(false) });
  };

  return (
    <div className="_comment_main" id={`comment-${comment.id}`}>
      <div className="_comment_image">
        <UserAvatar user={comment.author} size={isReply ? 32 : 40} className="_comment_img1" />
      </div>
      <div className="_comment_area">
        <div className="_comment_details">
          <div className="_comment_details_top">
            <div className="_comment_name">
              <h4 className="_comment_name_title">{fullName(comment.author)}</h4>
            </div>
          </div>
          <div className="_comment_status">
            {editing ? (
              <div className="py-1">
                <textarea
                  className="form-control text-sm"
                  value={draft}
                  maxLength={2000}
                  rows={2}
                  autoFocus
                  aria-label="Edit comment"
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      saveEdit();
                    }
                    if (e.key === "Escape") setEditing(false);
                  }}
                />
                <div className="mt-1 flex gap-3 text-xs">
                  <button type="button" className="bs-link-btn text-[#1890ff]" onClick={saveEdit} disabled={update.isPending}>
                    {update.isPending ? "Saving…" : "Save"}
                  </button>
                  <button type="button" className="bs-link-btn" onClick={() => setEditing(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <p className="_comment_status_text">
                <span>{comment.content}</span>
              </p>
            )}
          </div>
          {comment.likeCount > 0 && (
            <button
              type="button"
              className="_total_reactions border-0"
              onClick={() => setLikersOpen(true)}
              aria-label={`See who liked this ${isReply ? "reply" : "comment"}`}
            >
              <div className="_total_react">
                <span className="_reaction_like">{Icons.thumbsUpSmall}</span>
              </div>
              <span className="_total">{compactNumber(comment.likeCount)}</span>
            </button>
          )}
          <div className="_comment_reply">
            <div className="_comment_reply_num">
              <ul className="_comment_reply_list">
                <li>
                  <span>
                    <button
                      type="button"
                      className={`bs-link-btn ${comment.likedByMe ? "bs-liked font-semibold" : ""}`}
                      aria-pressed={comment.likedByMe}
                      disabled={toggleLike.isPending}
                      onClick={() => toggleLike.mutate({ comment, like: !comment.likedByMe })}
                    >
                      {comment.likedByMe ? "Liked" : "Like"}
                    </button>
                    .
                  </span>
                </li>
                <li>
                  <span>
                    <button type="button" className="bs-link-btn" onClick={startReply}>
                      Reply
                    </button>
                    .
                  </span>
                </li>
                {comment.canEdit && !editing && (
                  <li>
                    <span>
                      <button
                        type="button"
                        className="bs-link-btn"
                        onClick={() => {
                          setDraft(comment.content);
                          setEditing(true);
                        }}
                      >
                        Edit
                      </button>
                      .
                    </span>
                  </li>
                )}
                {comment.canDelete && (
                  <li>
                    <span>
                      <button type="button" className="bs-link-btn" onClick={() => setConfirmOpen(true)}>
                        Delete
                      </button>
                      .
                    </span>
                  </li>
                )}
                <li>
                  <span className="_time_link" title={timeAgo(comment.createdAt)}>
                    <time dateTime={comment.createdAt}>{shortAgo(comment.createdAt)}</time>
                    {comment.editedAt && " · edited"}
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {!isReply && (
          <Replies
            me={me}
            parent={comment}
            postId={postId}
            show={showReplies}
            onShow={() => setShowReplies(true)}
          />
        )}

        {replying && (
          <CommentForm
            ref={replyRef}
            me={me}
            postId={postId}
            // Replying to a reply keeps the conversation in the same thread.
            parentId={comment.parentId ?? comment.id}
            placeholder={`Reply to ${comment.author.firstName}…`}
            onPosted={() => setReplying(false)}
          />
        )}
      </div>

      <LikersDialog
        open={likersOpen}
        onOpenChange={setLikersOpen}
        target="comment"
        id={comment.id}
        count={comment.likeCount}
      />
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={isReply ? "Delete reply?" : "Delete comment?"}
        description={
          isReply || comment.replyCount === 0
            ? "This can't be undone."
            : `Its ${comment.replyCount} ${comment.replyCount === 1 ? "reply" : "replies"} will be deleted too. This can't be undone.`
        }
        pending={del.isPending}
        onConfirm={() => del.mutate(comment, { onSuccess: () => setConfirmOpen(false) })}
      />
    </div>
  );
}

function Replies({
  me,
  parent,
  postId,
  show,
  onShow,
}: {
  me: Me;
  parent: Comment;
  postId: string;
  show: boolean;
  onShow: () => void;
}) {
  const query = useReplies(parent.id, show);
  const replies = useMemo(() => dedupe(query.data?.pages.flatMap((p) => p.items) ?? []), [query.data]);
  const remaining = Math.max(0, parent.replyCount - replies.length);

  if (!show) {
    if (parent.replyCount === 0) return null;
    return (
      <button type="button" className="bs-link-btn mb-2 ml-2 text-[13px] font-medium text-[#666]" onClick={onShow}>
        ↳ View {parent.replyCount} {parent.replyCount === 1 ? "reply" : "replies"}
      </button>
    );
  }

  return (
    <div className="ml-1 border-l-2 border-gray-100 pl-3 dark:border-white/10">
      {query.isPending && (
        <p className="flex items-center gap-2 py-1 text-xs text-gray-500">
          <Loader2 className="size-3 animate-spin" /> Loading replies…
        </p>
      )}
      {replies.map((r) => (
        <CommentItem key={r.id} me={me} comment={r} postId={postId} />
      ))}
      {query.hasNextPage && remaining > 0 && (
        <button
          type="button"
          className="bs-link-btn mb-2 text-[13px] font-medium text-[#666]"
          onClick={() => query.fetchNextPage()}
          disabled={query.isFetchingNextPage}
        >
          {query.isFetchingNextPage ? "Loading…" : `View ${remaining} more ${remaining === 1 ? "reply" : "replies"}`}
        </button>
      )}
    </div>
  );
}
