import type { NextFunction, Request, Response } from "express";
import { env } from "../config/env";
import { forbidden } from "../lib/errors";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF defence in depth (on top of SameSite=Lax cookies): state-changing requests that
 * come from a browser must originate from one of our own web origins.
 * Requests without Origin/Referer (curl, server-to-server) carry no ambient cookies
 * from a victim's browser, so they are allowed.
 */
export function originGuard(req: Request, _res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method)) return next();
  const origin = req.headers.origin ?? refererOrigin(req.headers.referer);
  if (!origin) return next();
  if (env.corsOrigins.includes(origin)) return next();
  next(forbidden("Cross-origin request blocked"));
}

function refererOrigin(referer?: string): string | undefined {
  if (!referer) return undefined;
  try {
    return new URL(referer).origin;
  } catch {
    return undefined;
  }
}
