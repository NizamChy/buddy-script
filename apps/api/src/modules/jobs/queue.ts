import { Prisma } from "@prisma/client";
import { waitUntil } from "@vercel/functions";
import { env } from "../../config/env";
import { prisma } from "../../lib/prisma";

/**
 * A small durable job queue on top of Postgres.
 *
 * - Jobs are inserted in the same transaction as the data they belong to (outbox pattern),
 *   so a job exists if and only if the post/upload that needs it was committed.
 * - Workers claim jobs with `FOR UPDATE SKIP LOCKED`, so any number of serverless instances
 *   can drain the queue concurrently without double-processing.
 * - Failures are retried with exponential backoff; jobs whose worker died mid-run are
 *   reclaimed after a lock timeout.
 *
 * On Vercel the queue is drained right after the response is sent (`waitUntil`), and a cron
 * sweep picks up anything left over. Locally a poller in dev-server.ts does the same.
 */

type Tx = Prisma.TransactionClient;
type JobPayload = Prisma.InputJsonValue;

interface JobDefinition {
  run: (payload: never) => Promise<void>;
  /** Called once when the job has exhausted its attempts. */
  onFinalFailure?: (payload: never, error: Error) => Promise<void>;
}

const registry = new Map<string, JobDefinition>();
const LOCK_TIMEOUT = "5 minutes";

export function defineJob<P>(
  type: string,
  run: (payload: P) => Promise<void>,
  onFinalFailure?: (payload: P, error: Error) => Promise<void>,
) {
  registry.set(type, { run, onFinalFailure } as unknown as JobDefinition);
  return {
    type,
    enqueue: (payload: P, opts?: EnqueueOptions) => enqueue(type, payload as JobPayload, opts),
  };
}

interface EnqueueOptions {
  /** Enqueue inside an existing transaction (outbox pattern). */
  tx?: Tx;
  delayMs?: number;
  maxAttempts?: number;
}

export async function enqueue(type: string, payload: JobPayload, opts: EnqueueOptions = {}) {
  const db = opts.tx ?? prisma;
  await db.job.create({
    data: {
      type,
      payload,
      runAt: new Date(Date.now() + (opts.delayMs ?? 0)),
      maxAttempts: opts.maxAttempts ?? 5,
    },
  });
}

interface ClaimedJob {
  id: string;
  type: string;
  payload: unknown;
  attempts: number;
  max_attempts: number;
}

async function claim(): Promise<ClaimedJob | null> {
  const rows = await prisma.$queryRaw<ClaimedJob[]>`
    UPDATE jobs
       SET status = 'RUNNING'::"JobStatus", locked_at = now(), attempts = attempts + 1, updated_at = now()
     WHERE id = (
       SELECT id FROM jobs
        WHERE (status = 'PENDING'::"JobStatus" AND run_at <= now())
           OR (status = 'RUNNING'::"JobStatus" AND locked_at < now() - ${LOCK_TIMEOUT}::interval)
        ORDER BY run_at
        FOR UPDATE SKIP LOCKED
        LIMIT 1)
    RETURNING id::text AS id, type, payload, attempts, max_attempts`;
  return rows[0] ?? null;
}

async function execute(job: ClaimedJob) {
  const def = registry.get(job.type);
  try {
    if (!def) throw new Error(`Unknown job type "${job.type}"`);
    await def.run(job.payload as never);
    await prisma.job.update({
      where: { id: job.id },
      data: { status: "DONE", lockedAt: null, lastError: null },
    });
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    const final = !def || job.attempts >= job.max_attempts;
    // 10s, 20s, 40s, ... capped at 10 minutes.
    const backoffMs = Math.min(10_000 * 2 ** (job.attempts - 1), 600_000);
    await prisma.job.update({
      where: { id: job.id },
      data: {
        status: final ? "FAILED" : "PENDING",
        lockedAt: null,
        lastError: error.message.slice(0, 2000),
        runAt: final ? undefined : new Date(Date.now() + backoffMs),
      },
    });
    console.error(`[jobs] ${job.type} ${job.id} failed (attempt ${job.attempts}):`, error.message);
    if (final && def?.onFinalFailure) {
      await def.onFinalFailure(job.payload as never, error).catch((e) =>
        console.error("[jobs] onFinalFailure threw:", e),
      );
    }
  }
}

/** Processes due jobs until the queue is empty or a limit is hit. Returns how many ran. */
export async function drainJobs({ maxJobs = 50, budgetMs = 25_000 } = {}) {
  const deadline = Date.now() + budgetMs;
  let processed = 0;
  while (processed < maxJobs && Date.now() < deadline) {
    const job = await claim();
    if (!job) break;
    await execute(job);
    processed++;
  }
  return processed;
}

let draining: Promise<unknown> | null = null;
let again = false;

/**
 * Start draining in the background after the current request. Coalesces concurrent kicks
 * within one instance; other instances are kept apart by SKIP LOCKED.
 */
export function kickJobs() {
  if (env.jobsMode === "off") return;
  if (draining) {
    again = true;
    return;
  }
  const run = async () => {
    do {
      again = false;
      await drainJobs({ maxJobs: 25, budgetMs: 20_000 });
    } while (again);
  };
  draining = run()
    .catch((err) => console.error("[jobs] drain failed:", err))
    .finally(() => (draining = null));
  // On Vercel, keep the function alive until the work is done (no-op elsewhere).
  waitUntil(draining);
}

/** Housekeeping for the cron sweep: forget finished jobs and abandoned uploads. */
export async function cleanupJobs() {
  const [jobs, staging] = await Promise.all([
    prisma.job.deleteMany({
      where: { status: "DONE", updatedAt: { lt: new Date(Date.now() - 7 * 24 * 3600 * 1000) } },
    }),
    prisma.uploadStaging.deleteMany({
      where: { createdAt: { lt: new Date(Date.now() - 24 * 3600 * 1000) } },
    }),
  ]);
  return { deletedJobs: jobs.count, deletedStaging: staging.count };
}
