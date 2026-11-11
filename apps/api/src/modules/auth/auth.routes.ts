import { Router } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { prisma } from "../../lib/prisma";
import { toMe } from "../../lib/serializers";
import { notFound, unauthorized } from "../../lib/errors";
import { REFRESH_COOKIE, clearAuthCookies, setAuthCookies } from "../../lib/tokens";
import { requireAuth } from "../../middleware/auth";
import { loginSchema, registerSchema } from "./auth.schemas";
import {
  issueSession,
  registerUser,
  revokeSession,
  rotateSession,
  verifyCredentials,
} from "./auth.service";

export const authRouter = Router();

// Brute-force protection for credential endpoints. Keyed by IP + target email so that
// users behind one NAT/proxy don't lock each other out, while guessing one account is capped.
const credentialLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  keyGenerator: (req) => {
    const email = typeof req.body?.email === "string" ? req.body.email.trim().toLowerCase() : "";
    return `${ipKeyGenerator(req.ip ?? "unknown")}:${email}`;
  },
  standardHeaders: "draft-8",
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: { code: "RATE_LIMITED", message: "Too many attempts, try again later" } },
});

authRouter.post("/register", credentialLimiter, async (req, res) => {
  const input = registerSchema.parse(req.body);
  const user = await registerUser(input);
  const session = await issueSession(user, req.headers["user-agent"]);
  setAuthCookies(res, session.accessToken, session.refreshToken, session.refreshExpiresAt, true);
  res.status(201).json({ user: toMe(user) });
});

authRouter.post("/login", credentialLimiter, async (req, res) => {
  const { email, password, remember } = loginSchema.parse(req.body);
  const user = await verifyCredentials(email, password);
  const session = await issueSession(user, req.headers["user-agent"]);
  setAuthCookies(res, session.accessToken, session.refreshToken, session.refreshExpiresAt, remember);
  res.json({ user: toMe(user) });
});

authRouter.post("/refresh", async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (!token) throw unauthorized("No session", "SESSION_INVALID");
  try {
    const { session, user } = await rotateSession(token, req.headers["user-agent"]);
    setAuthCookies(res, session.accessToken, session.refreshToken, session.refreshExpiresAt, true);
    res.json({ user: toMe(user) });
  } catch (err) {
    clearAuthCookies(res);
    throw err;
  }
});

authRouter.post("/logout", async (req, res) => {
  const token = req.cookies?.[REFRESH_COOKIE];
  if (token) await revokeSession(token);
  clearAuthCookies(res);
  res.status(204).end();
});

authRouter.get("/me", requireAuth, async (req, res) => {
  const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
  if (!user) throw notFound("User not found");
  res.json({ user: toMe(user) });
});
