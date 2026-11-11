/* eslint-disable @next/next/no-img-element */
import type { PublicUser } from "@/lib/types";
import { fullName } from "@/lib/format";
import { cn } from "@/lib/utils";

const COLORS = ["#1890ff", "#13c2c2", "#52c41a", "#fa8c16", "#eb2f96", "#722ed1", "#2f54eb", "#f5222d"];

function colorFor(id: string) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return COLORS[Math.abs(h) % COLORS.length];
}

/** Profile picture, or coloured initials when the user has none. */
export function UserAvatar({
  user,
  size = 40,
  className,
}: {
  user: Pick<PublicUser, "id" | "firstName" | "lastName" | "avatarUrl">;
  size?: number;
  className?: string;
}) {
  const style = { width: size, height: size, minWidth: size };
  if (user.avatarUrl) {
    return (
      <img
        src={user.avatarUrl}
        alt={fullName(user)}
        width={size}
        height={size}
        loading="lazy"
        decoding="async"
        className={cn("rounded-full object-cover", className)}
        style={style}
      />
    );
  }
  const initials = `${user.firstName[0] ?? ""}${user.lastName[0] ?? ""}`.toUpperCase();
  return (
    <span
      role="img"
      aria-label={fullName(user)}
      className={cn("inline-flex items-center justify-center rounded-full font-medium text-white select-none", className)}
      style={{ ...style, background: colorFor(user.id), fontSize: Math.round(size * 0.38) }}
    >
      {initials}
    </span>
  );
}
