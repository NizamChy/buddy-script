"use client";

/* eslint-disable @next/next/no-img-element */
import { useEffect, useMemo, useRef, useState } from "react";
import { Globe, Loader2, Lock, X } from "lucide-react";
import { toast } from "sonner";
import { UserAvatar } from "@/components/user-avatar";
import { useCreatePost } from "@/hooks/use-feed";
import { compressImage } from "@/lib/format";
import type { Me, Visibility } from "@/lib/types";
import { Icons } from "./icons";

const MAX_LEN = 5000;
const ACCEPT = "image/jpeg,image/png,image/webp,image/gif,image/avif";

export function Composer({ me }: { me: Me }) {
  const [content, setContent] = useState("");
  const [visibility, setVisibility] = useState<Visibility>("PUBLIC");
  const [image, setImage] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const create = useCreatePost();

  const preview = useMemo(() => (image ? URL.createObjectURL(image) : null), [image]);
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  const pickImage = (file?: File) => {
    if (!file) return;
    if (!ACCEPT.split(",").includes(file.type)) {
      toast.error("Please choose a JPEG, PNG, WebP, GIF or AVIF image");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      toast.error("That image is too large (max 20 MB)");
      return;
    }
    setImage(file);
  };

  const canPost = (content.trim().length > 0 || !!image) && content.length <= MAX_LEN && !create.isPending;

  const submit = async () => {
    if (!canPost) return;
    const blob = image ? await compressImage(image) : null;
    if (blob && blob.size > 4 * 1024 * 1024) {
      toast.error("Image is still larger than 4 MB after compression. Try a smaller one.");
      return;
    }
    create.mutate(
      { content: content.trim(), visibility, image: blob },
      {
        onSuccess: () => {
          setContent("");
          setImage(null);
          setVisibility("PUBLIC");
          if (fileRef.current) fileRef.current.value = "";
        },
      },
    );
  };

  const comingSoon = () => toast.info("Only text and photo posts are supported for now.");

  const actions = (withLabels: boolean) => (
    <div className="_feed_inner_text_area_item">
      <div className="_feed_inner_text_area_bottom_photo _feed_common">
        <button
          type="button"
          className="_feed_inner_text_area_bottom_photo_link"
          onClick={() => fileRef.current?.click()}
          aria-label="Add photo"
        >
          <span className="_feed_inner_text_area_bottom_photo_iamge _mar_img">{Icons.photo}</span>
          {withLabels && "Photo"}
        </button>
      </div>
      <div className="_feed_inner_text_area_bottom_video _feed_common">
        <button type="button" className="_feed_inner_text_area_bottom_photo_link" onClick={comingSoon} aria-label="Video">
          <span className="_feed_inner_text_area_bottom_photo_iamge _mar_img">{Icons.video}</span>
          {withLabels && "Video"}
        </button>
      </div>
      <div className="_feed_inner_text_area_bottom_event _feed_common">
        <button type="button" className="_feed_inner_text_area_bottom_photo_link" onClick={comingSoon} aria-label="Event">
          <span className="_feed_inner_text_area_bottom_photo_iamge _mar_img">{Icons.event}</span>
          {withLabels && "Event"}
        </button>
      </div>
      <div className="_feed_inner_text_area_bottom_article _feed_common">
        <button type="button" className="_feed_inner_text_area_bottom_photo_link" onClick={comingSoon} aria-label="Article">
          <span className="_feed_inner_text_area_bottom_photo_iamge _mar_img">{Icons.article}</span>
          {withLabels && "Article"}
        </button>
      </div>
    </div>
  );

  const visibilityPicker = (
    <div className="mt-2 flex items-center justify-end gap-2 text-[13px] text-[#666]">
      <label htmlFor="post-visibility">Who can see this?</label>
      <div className="relative">
        <select
          id="post-visibility"
          value={visibility}
          onChange={(e) => setVisibility(e.target.value as Visibility)}
          className="h-8 cursor-pointer appearance-none rounded-full border border-[#e4e6eb] bg-transparent pl-7 pr-3 text-[13px] text-[#444] dark:border-white/20 dark:text-gray-300"
        >
          <option value="PUBLIC">Public</option>
          <option value="PRIVATE">Only me</option>
        </select>
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2">
          {visibility === "PUBLIC" ? <Globe className="size-3.5" /> : <Lock className="size-3.5" />}
        </span>
      </div>
    </div>
  );

  const postButton = (
    <div className="_feed_inner_text_area_btn">
      <button
        type="button"
        className="_feed_inner_text_area_btn_link disabled:cursor-not-allowed disabled:opacity-60"
        onClick={submit}
        disabled={!canPost}
      >
        {create.isPending ? <Loader2 className="_mar_img size-[14px] animate-spin" /> : Icons.send}
        <span>{create.isPending ? "Posting" : "Post"}</span>
      </button>
    </div>
  );

  return (
    <div className="_feed_inner_text_area _b_radious6 _padd_b24 _padd_t24 _padd_r24 _padd_l24 _mar_b16">
      <div className="_feed_inner_text_area_box">
        <div className="_feed_inner_text_area_box_image">
          <UserAvatar user={me} size={40} className="_txt_img" />
        </div>
        <div className="form-floating _feed_inner_text_area_box_form">
          <textarea
            className="form-control _textarea"
            placeholder="Write something ..."
            id="composer"
            value={content}
            maxLength={MAX_LEN + 500}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submit();
            }}
            onPaste={(e) => {
              const file = Array.from(e.clipboardData.files).find((f) => f.type.startsWith("image/"));
              if (file) pickImage(file);
            }}
          />
          <label className="_feed_textarea_label" htmlFor="composer">
            Write something ...
            {Icons.pen}
          </label>
        </div>
      </div>

      {visibilityPicker}

      {content.length > MAX_LEN - 200 && (
        <p className={`mt-2 mb-0 text-right text-xs ${content.length > MAX_LEN ? "text-red-600" : "text-gray-500"}`}>
          {content.length}/{MAX_LEN}
        </p>
      )}

      {preview && (
        <div className="relative mt-3 overflow-hidden rounded-md border">
          <img src={preview} alt="Selected image preview" className="max-h-80 w-full object-contain bg-black/5" />
          <button
            type="button"
            onClick={() => {
              setImage(null);
              if (fileRef.current) fileRef.current.value = "";
            }}
            className="absolute right-2 top-2 inline-flex size-8 items-center justify-center rounded-full bg-black/60 text-white hover:bg-black/80"
            aria-label="Remove image"
          >
            <X className="size-4" />
          </button>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept={ACCEPT}
        className="hidden"
        onChange={(e) => pickImage(e.target.files?.[0])}
      />

      <div className="_feed_inner_text_area_bottom">
        {actions(true)}
        {postButton}
      </div>
      <div className="_feed_inner_text_area_bottom_mobile">
        <div className="_feed_inner_text_mobile">
          {actions(false)}
          {postButton}
        </div>
      </div>
    </div>
  );
}
