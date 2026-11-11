import Redis from "ioredis";
import { env } from "../config/env";

/**
 * Shared Redis connection (or null when Redis isn't configured).
 * Redis is only a cache here: every caller has a Postgres fallback, so a Redis outage
 * degrades performance, never correctness.
 */
let client: Redis | null | undefined;

export function getRedis(): Redis | null {
  if (client !== undefined) return client;
  if (!env.redisUrl) return (client = null);
  client = new Redis(env.redisUrl, {
    maxRetriesPerRequest: 2,
    connectTimeout: 3_000,
    // Fail fast instead of queueing commands while disconnected; callers fall back to SQL.
    enableOfflineQueue: false,
  });
  client.on("error", (err) => console.warn("[redis]", err.message));
  return client;
}

/** Runs `fn` against Redis; returns `fallback` if Redis is absent, not ready or the call fails. */
export async function withRedis<T>(fallback: T, fn: (r: Redis) => Promise<T>): Promise<T> {
  const r = getRedis();
  if (!r) return fallback;
  if (r.status !== "ready") {
    // A fresh connection (serverless cold start) gets a moment to come up.
    await new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, 1_500);
      r.once("ready", () => {
        clearTimeout(timer);
        resolve();
      });
    });
    if ((r.status as string) !== "ready") return fallback;
  }
  try {
    return await fn(r);
  } catch (err) {
    console.warn("[redis] falling back:", (err as Error).message);
    return fallback;
  }
}

export async function closeRedis() {
  if (client) await client.quit().catch(() => undefined);
  client = undefined;
}
