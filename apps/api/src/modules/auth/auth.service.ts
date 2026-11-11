import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import type { User } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma";
import { env } from "../../config/env";
import { conflict, unauthorized } from "../../lib/errors";
import { generateRefreshToken, hashToken, signAccessToken } from "../../lib/tokens";

const BCRYPT_COST = 12;
// Used to keep login timing constant when the email does not exist (prevents user enumeration).
// Computed lazily so it doesn't slow down serverless cold starts.
let dummyHash: Promise<string> | undefined;
const getDummyHash = () => (dummyHash ??= bcrypt.hash("not-a-real-password", BCRYPT_COST));

export interface IssuedSession {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
}

export async function registerUser(input: {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}): Promise<User> {
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_COST);
  try {
    return await prisma.user.create({
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        passwordHash,
      },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw conflict("An account with this email already exists");
    }
    throw err;
  }
}

export async function verifyCredentials(email: string, password: string): Promise<User> {
  const user = await prisma.user.findUnique({ where: { email } });
  const ok = await bcrypt.compare(password, user?.passwordHash ?? (await getDummyHash()));
  if (!user || !ok) throw unauthorized("Invalid email or password", "INVALID_CREDENTIALS");
  return user;
}

export async function issueSession(
  user: Pick<User, "id" | "role">,
  userAgent?: string,
  familyId: string = crypto.randomUUID(),
): Promise<IssuedSession> {
  const { token, hash } = generateRefreshToken();
  const refreshExpiresAt = new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 86_400_000);
  await prisma.session.create({
    data: {
      userId: user.id,
      tokenHash: hash,
      familyId,
      userAgent: userAgent?.slice(0, 255),
      expiresAt: refreshExpiresAt,
    },
  });
  return {
    accessToken: signAccessToken({ sub: user.id, role: user.role }),
    refreshToken: token,
    refreshExpiresAt,
  };
}

/**
 * Refresh-token rotation with reuse detection: every refresh revokes the presented token
 * and issues a new one in the same family. If an already-revoked token is presented,
 * it has been stolen or replayed, so the whole family is revoked.
 */
export async function rotateSession(
  refreshToken: string,
  userAgent?: string,
): Promise<{ session: IssuedSession; user: User }> {
  const existing = await prisma.session.findUnique({
    where: { tokenHash: hashToken(refreshToken) },
    include: { user: true },
  });
  if (!existing) throw unauthorized("Session expired, please log in again", "SESSION_INVALID");

  if (existing.revokedAt) {
    // Small grace window so two tabs refreshing simultaneously don't log the user out.
    const graceMs = 10_000;
    if (Date.now() - existing.revokedAt.getTime() > graceMs) {
      await prisma.session.updateMany({
        where: { familyId: existing.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    throw unauthorized("Session expired, please log in again", "SESSION_INVALID");
  }
  if (existing.expiresAt < new Date()) {
    throw unauthorized("Session expired, please log in again", "SESSION_INVALID");
  }

  // Revoke atomically: only one concurrent request may win the rotation.
  const { count } = await prisma.session.updateMany({
    where: { id: existing.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (count === 0) throw unauthorized("Session expired, please log in again", "SESSION_INVALID");

  const session = await issueSession(existing.user, userAgent, existing.familyId);
  return { session, user: existing.user };
}

export async function revokeSession(refreshToken: string) {
  await prisma.session.updateMany({
    where: { tokenHash: hashToken(refreshToken), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
