"use client";

import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { Loader2, SendHorizontal } from "lucide-react";
import { UserAvatar } from "@/components/user-avatar";
import { useCreateComment } from "@/hooks/use-feed";
import type { Me } from "@/lib/types";

export interface CommentFormHandle {
  focus: () => void;
}

/** Comment / reply box. Enter sends, Shift+Enter inserts a new line. */
export const CommentForm = forwardRef<
  CommentFormHandle,
  {
    me: Me;
    postId: string;
    parentId?: string;
    placeholder?: string;
    autoFocus?: boolean;
    onPosted?: () => void;
  }
>(function CommentForm({ me, postId, parentId, placeholder = "Write a comment", autoFocus, onPosted }, ref) {
  const [value, setValue] = useState("");
  const textRef = useRef<HTMLTextAreaElement>(null);
  const create = useCreateComment(postId);

  useImperativeHandle(ref, () => ({ focus: () => textRef.current?.focus() }));

  const grow = (el: HTMLTextAreaElement) => {
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  const submit = () => {
    const content = value.trim();
    if (!content || create.isPending) return;
    create.mutate(
      { content, parentId },
      {
        onSuccess: () => {
          setValue("");
          if (textRef.current) textRef.current.style.height = "auto";
          onPosted?.();
        },
      },
    );
  };

  return (
    <div className="_feed_inner_comment_box">
      <form
        className="_feed_inner_comment_box_form"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <div className="_feed_inner_comment_box_content">
          <div className="_feed_inner_comment_box_content_image">
            <UserAvatar user={me} size={26} className="_comment_img" />
          </div>
          <div className="_feed_inner_comment_box_content_txt">
            <textarea
              ref={textRef}
              className="form-control _comment_textarea"
              placeholder={placeholder}
              aria-label={placeholder}
              rows={1}
              maxLength={2000}
              value={value}
              autoFocus={autoFocus}
              onChange={(e) => {
                setValue(e.target.value);
                grow(e.target);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  submit();
                }
              }}
            />
          </div>
        </div>
        <div className="_feed_inner_comment_box_icon">
          <button
            type="submit"
            className="_feed_inner_comment_box_icon_btn disabled:opacity-40"
            disabled={!value.trim() || create.isPending}
            aria-label={parentId ? "Send reply" : "Send comment"}
          >
            {create.isPending ? (
              <Loader2 className="size-4 animate-spin text-[#1890ff]" />
            ) : (
              <SendHorizontal className="size-4 text-[#1890ff]" />
            )}
          </button>
        </div>
      </form>
    </div>
  );
});
