export type Role = "USER" | "ADMIN";
export type Visibility = "PUBLIC" | "PRIVATE";
export type ImageStatus = "PROCESSING" | "READY" | "FAILED";
export type FeedScope = "all" | "following";

export interface PublicUser {
  id: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
}

export interface Me extends PublicUser {
  email: string;
  role: Role;
  createdAt: string;
}

export interface Post {
  id: string;
  authorId: string;
  content: string | null;
  imageUrl: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  /** null = no image; PROCESSING while the background job normalises the upload. */
  imageStatus: ImageStatus | null;
  imageBlur: string | null;
  visibility: Visibility;
  likeCount: number;
  commentCount: number;
  createdAt: string;
  editedAt: string | null;
  author: PublicUser;
  likedByMe: boolean;
  recentLikers: PublicUser[];
  followingAuthor: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

export interface Comment {
  id: string;
  postId: string;
  parentId: string | null;
  authorId: string;
  content: string;
  likeCount: number;
  replyCount: number;
  createdAt: string;
  editedAt: string | null;
  author: PublicUser;
  likedByMe: boolean;
  canEdit: boolean;
  canDelete: boolean;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface Liker {
  user: PublicUser;
  likedAt: string;
}

export interface LikeResult {
  liked: boolean;
  likeCount: number;
}

export interface UserSummary extends PublicUser {
  followerCount: number;
  followingCount: number;
  followedByMe: boolean;
  isMe: boolean;
}

export type NotificationType = "POST_LIKE" | "COMMENT" | "REPLY" | "COMMENT_LIKE" | "FOLLOW";

export interface AppNotification {
  id: string;
  type: NotificationType;
  createdAt: string;
  read: boolean;
  actor: PublicUser;
  post: { id: string; excerpt: string | null; hasImage: boolean } | null;
  comment: { id: string; excerpt: string | null; parentId: string | null } | null;
}
