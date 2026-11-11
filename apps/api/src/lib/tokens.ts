import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import type { Response } from "express";
import type { Role } from "@prisma/client";
import { env } from "../config/env";

export const ACCESS_COOKIE = "bs_at";
export const REFRESH_COOKIE = "bs_rt";

export interface AccessPayload {
  sub: string;
  role: Role;
}

export function signAccessToken(payload: AccessPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    algorithm: "HS256",
    expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
    issuer: "buddy-script-api",
    audience: "buddy-script-web",
  });
}

export function verifyAccessToken(token: string): AccessPayload {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, {
    algorithms: ["HS256"],
    issuer: "buddy-script-api",
    audience: "buddy-script-web",
  }) as jwt.JwtPayload;
  return { sub: decoded.sub as string, role: decoded.role as Role };
}

/** Opaque, high-entropy refresh token. Only its SHA-256 hash is persisted. */
export function generateRefreshToken(): { token: string; hash: string } {
  const token = crypto.randomBytes(48).toString("base64url");
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

const baseCookie = {
  httpOnly: true,
  secure: env.isProd,
  // The web app proxies /api to this server, so cookies are first-party: Lax is enough
  // and blocks cross-site POSTs from carrying them.
  sameSite: "lax" as const,
  path: "/",
};

export function setAuthCookies(
  res: Response,
  accessToken: string,
  refreshToken: string,
  refreshExpiresAt: Date,
  persistent: boolean,
) {
  res.cookie(ACCESS_COOKIE, accessToken, {
    ...baseCookie,
    maxAge: env.ACCESS_TOKEN_TTL_SECONDS * 1000,
  });
  res.cookie(REFRESH_COOKIE, refreshToken, {
    ...baseCookie,
    // "Remember me" off => browser-session cookie (server-side expiry still applies).
    ...(persistent ? { expires: refreshExpiresAt } : {}),
  });
}

export function clearAuthCookies(res: Response) {
  res.clearCookie(ACCESS_COOKIE, baseCookie);
  res.clearCookie(REFRESH_COOKIE, baseCookie);
}
