import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { env } from "./config/env";
import { LOCAL_UPLOAD_DIR } from "./lib/storage";
import { prisma } from "./lib/prisma";
import { ACCESS_COOKIE, verifyAccessToken } from "./lib/tokens";
import { originGuard } from "./middleware/security";
import { errorHandler, notFoundHandler } from "./middleware/error";
import { authRouter } from "./modules/auth/auth.routes";
import { postsRouter } from "./modules/posts/posts.routes";
import { commentsRouter } from "./modules/comments/comments.routes";
import { adminRouter } from "./modules/admin/admin.routes";
import { jobsRouter } from "./modules/jobs/jobs.routes";
import { notificationsRouter } from "./modules/notifications/notifications.routes";
import { searchRouter } from "./modules/search/search.routes";
import { usersRouter } from "./modules/users/users.routes";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  if (env.TRUST_PROXY === "true" || process.env.VERCEL) app.set("trust proxy", 1);

  app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
  app.use(
    cors({
      origin: env.corsOrigins,
      credentials: true,
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: "100kb" }));
  app.use(cookieParser());
  app.use(originGuard);

  // Coarse global limiter; tighter per-route limiters live next to the routes.
  // Keyed per signed-in user (all traffic may arrive via the Next.js proxy, so IPs can be shared),
  // falling back to the client IP for anonymous requests.
  app.use(
    "/api",
    rateLimit({
      windowMs: 60 * 1000,
      limit: 600,
      keyGenerator: (req) => {
        const token = req.cookies?.[ACCESS_COOKIE];
        if (typeof token === "string") {
          try {
            return `user:${verifyAccessToken(token).sub}`;
          } catch {
            /* expired or invalid: fall through to IP */
          }
        }
        return `ip:${ipKeyGenerator(req.ip ?? "unknown")}`;
      },
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: { error: { code: "RATE_LIMITED", message: "Too many requests" } },
    }),
  );

  // API responses are per-user; never let a shared cache store them.
  app.use("/api", (_req, res, next) => {
    res.setHeader("Cache-Control", "private, no-store");
    next();
  });

  app.get("/api/health", async (_req, res) => {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/posts", postsRouter);
  app.use("/api/comments", commentsRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/users", usersRouter);
  app.use("/api/search", searchRouter);
  app.use("/api/notifications", notificationsRouter);
  app.use("/api/internal", jobsRouter);

  if (!env.BLOB_READ_WRITE_TOKEN) {
    // Local development: uploaded images are served from disk.
    app.use("/uploads", express.static(LOCAL_UPLOAD_DIR, { maxAge: "365d", immutable: true }));
  }

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
