import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must be at least 32 characters"),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(15 * 60),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  /// Comma separated list of browser origins allowed to call the API (the Next.js app).
  CORS_ORIGINS: z.string().default("http://localhost:3000"),
  /// When set, uploaded images are stored in Vercel Blob; otherwise on local disk.
  BLOB_READ_WRITE_TOKEN: z.string().optional(),
  /// Set to "true" when the API sits behind a proxy (Vercel / Render) so req.ip is correct.
  TRUST_PROXY: z.string().optional(),
  /// Redis for the "Following" timeline cache. Optional: without it timelines are read from Postgres.
  /// (Upstash on Vercel exposes it as REDIS_URL or KV_URL.)
  REDIS_URL: z.string().optional(),
  KV_URL: z.string().optional(),
  /// Authors with more followers than this are not fanned out on write; their posts are
  /// merged into followers' timelines at read time instead (the "celebrity" problem).
  FANOUT_FOLLOWER_LIMIT: z.coerce.number().int().positive().default(10_000),
  /// How background jobs run after a request enqueues them:
  /// "background" = process right after responding (Vercel waitUntil / fire-and-forget locally),
  /// "off" = leave them for a worker/cron (tests drain the queue explicitly).
  JOBS_MODE: z.enum(["background", "off"]).optional(),
  /// Shared secret Vercel Cron sends as "Authorization: Bearer <CRON_SECRET>".
  CRON_SECRET: z.string().min(16).optional(),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment configuration:", z.prettifyError(parsed.error));
  throw new Error("Invalid environment configuration");
}

export const env = {
  ...parsed.data,
  isProd: parsed.data.NODE_ENV === "production",
  redisUrl: parsed.data.REDIS_URL || parsed.data.KV_URL || undefined,
  jobsMode: parsed.data.JOBS_MODE ?? (parsed.data.NODE_ENV === "test" ? "off" : "background"),
  corsOrigins: parsed.data.CORS_ORIGINS.split(",")
    .map((o) => o.trim())
    .filter(Boolean),
};
