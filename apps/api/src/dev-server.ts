// Long-running server for local development / container hosting.
import { createApp } from "./create-app";
import { env } from "./config/env";
import { drainJobs } from "./modules/jobs/queue";

createApp().listen(env.PORT, () => {
  console.log(`Buddy Script API listening on http://localhost:${env.PORT}`);
});

// A long-running process can simply poll the job queue (retries, delayed jobs).
// On Vercel the same role is played by waitUntil() after each request plus a cron sweep.
if (env.jobsMode !== "off") {
  let busy = false;
  setInterval(() => {
    if (busy) return;
    busy = true;
    drainJobs({ maxJobs: 50, budgetMs: 10_000 })
      .catch((err) => console.error("[jobs] poll failed:", err))
      .finally(() => (busy = false));
  }, 3_000).unref();
}
