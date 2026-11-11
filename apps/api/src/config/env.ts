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
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment configuration:", z.prettifyError(parsed.error));
  throw new Error("Invalid environment configuration");
}

export const env = {
  ...parsed.data,
  isProd: parsed.data.NODE_ENV === "production",
  corsOrigins: parsed.data.CORS_ORIGINS.split(",")
    .map((o) => o.trim())
    .filter(Boolean),
};
