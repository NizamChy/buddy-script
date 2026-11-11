import type { Prisma, User } from "@prisma/client";

/** Fields of another user that are safe to expose to any authenticated viewer. */
export const publicUserSelect = {
  id: true,
  firstName: true,
  lastName: true,
  avatarUrl: true,
} satisfies Prisma.UserSelect;

export type PublicUser = Prisma.UserGetPayload<{ select: typeof publicUserSelect }>;

export function toMe(user: User) {
  return {
    id: user.id,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    role: user.role,
    avatarUrl: user.avatarUrl,
    createdAt: user.createdAt,
  };
}
