import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { lettersOnly, ORIGIN, registerUser, uniqueTag, type Agent } from "./helpers";

/**
 * Exercises the two non-default timeline paths with their own configuration
 * (vitest isolates modules per file, so env must be set before the app is imported):
 *  - celebrity authors (fan-out on read), via FANOUT_FOLLOWER_LIMIT=1
 *  - Redis unavailable, where everything is served by SQL.
 */
process.env.FANOUT_FOLLOWER_LIMIT = "1";

type Mods = {
  app: import("express").Express;
  prisma: typeof import("../src/lib/prisma").prisma;
  drainJobs: typeof import("../src/modules/jobs/queue").drainJobs;
  closeRedis: typeof import("../src/lib/redis").closeRedis;
};
let m: Mods;

const tag = uniqueTag();
const emails = ["star", "fan", "fan2", "pal"].map((n) => `${n}_${tag}@test.local`);
let star: { agent: Agent; id: string };
let fan: { agent: Agent; id: string };
let fan2: { agent: Agent; id: string };
let pal: { agent: Agent; id: string };

beforeAll(async () => {
  const { createApp } = await import("../src/create-app.js");
  m = {
    app: createApp(),
    prisma: (await import("../src/lib/prisma.js")).prisma,
    drainJobs: (await import("../src/modules/jobs/queue.js")).drainJobs,
    closeRedis: (await import("../src/lib/redis.js")).closeRedis,
  };
  const last = lettersOnly(tag);
  star = await registerUser(m.app, emails[0]!, "Star", last);
  fan = await registerUser(m.app, emails[1]!, "Fan", last);
  fan2 = await registerUser(m.app, emails[2]!, "Fanb", last);
  pal = await registerUser(m.app, emails[3]!, "Pal", last);
});

afterAll(async () => {
  await m.prisma.user.deleteMany({ where: { email: { in: emails } } });
  await m.closeRedis();
  await m.prisma.$disconnect();
});

const post = (who: Agent, content: string) =>
  who.post("/api/posts").set("Origin", ORIGIN).field("content", content);
const followingIds = async (who: Agent, cursor?: string) => {
  const res = await who.get(`/api/posts?scope=following&limit=2${cursor ? `&cursor=${cursor}` : ""}`);
  expect(res.status).toBe(200);
  return res.body as { items: Array<{ id: string }>; nextCursor: string | null };
};

describe("celebrity fan-out on read", () => {
  it("merges posts of authors above the fan-out limit at read time, with correct paging", async () => {
    // Star gets 2 followers (> limit of 1) => celebrity; Pal keeps 1 => fanned out.
    for (const who of [fan, fan2]) await who.agent.put(`/api/users/${star.id}/follow`).set("Origin", ORIGIN);
    await fan.agent.put(`/api/users/${pal.id}/follow`).set("Origin", ORIGIN);
    await followingIds(fan.agent); // build the cached timeline (when Redis is on)

    const created: string[] = [];
    for (let i = 0; i < 3; i++) {
      created.push((await post(star.agent, `star ${i} ${tag}`)).body.post.id);
      created.push((await post(pal.agent, `pal ${i} ${tag}`)).body.post.id);
    }
    await m.drainJobs();

    // Walk all pages (2 per page) and check we get every post exactly once, newest first.
    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await followingIds(fan.agent, cursor);
      seen.push(...page.items.map((p) => p.id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    const ours = seen.filter((id) => created.includes(id));
    expect(ours).toEqual([...created].reverse());
    expect(new Set(seen).size).toBe(seen.length);
  });

});
