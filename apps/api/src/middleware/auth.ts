import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import type { Role } from "@prisma/client";
import { ACCESS_COOKIE, verifyAccessToken } from "../lib/tokens";
import { forbidden, unauthorized } from "../lib/errors";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: { id: string; role: Role };
    }
  }
}

function readToken(req: Request): string | undefined {
  const cookie = req.cookies?.[ACCESS_COOKIE];
  if (cookie) return cookie;
  // Also accept a Bearer token so the API is usable from non-browser clients.
  const header = req.headers.authorization;
  if (header?.startsWith("Bearer ")) return header.slice(7);
  return undefined;
}

/** Rejects the request unless it carries a valid access token. */
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = readToken(req);
  if (!token) return next(unauthorized());
  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      // The client reacts to this code by calling /auth/refresh and retrying once.
      return next(unauthorized("Access token expired", "TOKEN_EXPIRED"));
    }
    next(unauthorized("Invalid access token"));
  }
}

/** Role-based guard; use after requireAuth. */
export const requireRole =
  (...roles: Role[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized());
    if (!roles.includes(req.user.role)) return next(forbidden());
    next();
  };
