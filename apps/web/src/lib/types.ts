export type Role = "USER" | "ADMIN";
export type Visibility = "PUBLIC" | "PRIVATE";

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
  visibility: Visibility;
  likeCount: number;
  commentCount: number;
  createdAt: string;
  editedAt: string | null;
  author: PublicUser;
  likedByMe: boolean;
  recentLikers: PublicUser[];
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
