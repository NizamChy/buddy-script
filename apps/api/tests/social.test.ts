import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/create-app";
import { prisma } from "../src/lib/prisma";
import { closeRedis } from "../src/lib/redis";
import { drainJobs } from "../src/modules/jobs/queue";
import { deleteImage } from "../src/lib/storage";
import { lettersOnly, ORIGIN, registerUser, uniqueTag, type Agent } from "./helpers";

const app = createApp();
const tag = uniqueTag();
const nameTag = lettersOnly(tag);
const emails = ["ann", "ben", "cat"].map((n) => `${n}_${tag}@test.local`);

let ann: { agent: Agent; id: string };
let ben: { agent: Agent; id: string };
let cat: { agent: Agent; id: string };

beforeAll(async () => {
  ann = await registerUser(app, emails[0]!, "Ann", `Zq${nameTag}`);
  ben = await registerUser(app, emails[1]!, "Ben", `Zq${nameTag}`);
  cat = await registerUser(app, emails[2]!, "Cat", `Zq${nameTag}`);
});

afterAll(async () => {
  const posts = await prisma.post.findMany({
    where: { author: { email: { in: emails } } },
    select: { imageUrl: true },
  });
  await Promise.all(posts.map((p) => deleteImage(p.imageUrl)));
  await prisma.user.deleteMany({ where: { email: { in: emails } } });
  await closeRedis();
  await prisma.$disconnect();
});

const post = (who: Agent, content: string, visibility = "PUBLIC") =>
  who.post("/api/posts").set("Origin", ORIGIN).field("content", content).field("visibility", visibility);

const feedIds = async (who: Agent, scope: "all" | "following") => {
  const res = await who.get(`/api/posts?scope=${scope}&limit=30`);
  expect(res.status).toBe(200);
  return res.body.items.map((p: { id: string }) => p.id) as string[];
};

describe("follow graph", () => {
  it("follows idempotently, maintains counters and refuses self-follow", async () => {
    expect((await ann.agent.put(`/api/users/${ann.id}/follow`).set("Origin", ORIGIN)).status).toBe(400);
    await ann.agent.put(`/api/users/${ben.id}/follow`).set("Origin", ORIGIN);
    const again = await ann.agent.put(`/api/users/${ben.id}/follow`).set("Origin", ORIGIN);
    expect(again.status).toBe(200);
    expect(again.body.user).toMatchObject({ followedByMe: true, followerCount: 1 });
    const me = await ann.agent.get(`/api/users/${ann.id}`);
    expect(me.body.user).toMatchObject({ followingCount: 1, isMe: true });
  });

  it("suggests people the viewer does not follow", async () => {
    const res = await ann.agent.get("/api/users/suggestions?limit=20");
    const ids = res.body.items.map((u: { id: string }) => u.id);
    expect(ids).not.toContain(ben.id);
    expect(ids).not.toContain(ann.id);
  });
});

describe("following timeline (fan-out on write + SQL fallback)", () => {
  it("contains followees' public posts and my own posts, newest first, but not strangers'", async () => {
    // Read once so the cached timeline exists before Ben posts (exercises the fan-out path).
    await feedIds(ann.agent, "following");
    const b1 = (await post(ben.agent, `ben first ${tag}`)).body.post.id;
    const bPrivate = (await post(ben.agent, `ben secret ${tag}`, "PRIVATE")).body.post.id;
    const c1 = (await post(cat.agent, `cat post ${tag}`)).body.post.id;
    const a1 = (await post(ann.agent, `ann own ${tag}`)).body.post.id;
    await drainJobs();

    const ids = await feedIds(ann.agent, "following");
    expect(ids).toContain(b1);
    expect(ids).toContain(a1);
    expect(ids).not.toContain(c1);
    expect(ids).not.toContain(bPrivate);
    expect(ids.indexOf(a1)).toBeLessThan(ids.indexOf(b1));

    // The global feed is unchanged: everyone's public posts.
    const all = await feedIds(ann.agent, "all");
    expect(all).toEqual(expect.arrayContaining([b1, c1, a1]));
  });

  it("updates when following and unfollowing", async () => {
    const c2 = (await post(cat.agent, `cat second ${tag}`)).body.post.id;
    await drainJobs();
    expect(await feedIds(ann.agent, "following")).not.toContain(c2);
    await ann.agent.put(`/api/users/${cat.id}/follow`).set("Origin", ORIGIN);
    expect(await feedIds(ann.agent, "following")).toContain(c2);
    await ann.agent.delete(`/api/users/${cat.id}/follow`).set("Origin", ORIGIN);
    expect(await feedIds(ann.agent, "following")).not.toContain(c2);
  });

  it("drops deleted posts from the cached timeline", async () => {
    const b2 = (await post(ben.agent, `ben temp ${tag}`)).body.post.id;
    await drainJobs();
    expect(await feedIds(ann.agent, "following")).toContain(b2);
    await ben.agent.delete(`/api/posts/${b2}`).set("Origin", ORIGIN);
    expect(await feedIds(ann.agent, "following")).not.toContain(b2);
  });
});

describe("notifications", () => {
  it("notifies on likes, comments, replies and follows, never for self-actions", async () => {
    const before = (await ben.agent.get("/api/notifications/unread-count")).body.count as number;
    const p = (await post(ben.agent, `notify me ${tag}`)).body.post.id;
    await ann.agent.put(`/api/posts/${p}/like`).set("Origin", ORIGIN);
    await ben.agent.put(`/api/posts/${p}/like`).set("Origin", ORIGIN); // self: ignored
    const c = await ann.agent.post(`/api/posts/${p}/comments`).set("Origin", ORIGIN).send({ content: "hi" });
    const r = await ben.agent
      .post(`/api/posts/${p}/comments`)
      .set("Origin", ORIGIN)
      .send({ content: "hello back", parentId: c.body.comment.id });
    await ben.agent.put(`/api/comments/${c.body.comment.id}/like`).set("Origin", ORIGIN);

    const benInbox = await ben.agent.get("/api/notifications?limit=10");
    const benTypes = benInbox.body.items.slice(0, 2).map((n: { type: string }) => n.type);
    expect(benTypes.sort()).toEqual(["COMMENT", "POST_LIKE"]);
    expect((await ben.agent.get("/api/notifications/unread-count")).body.count).toBe(before + 2);

    const annInbox = await ann.agent.get("/api/notifications?limit=10");
    const annTypes = annInbox.body.items.map((n: { type: string }) => n.type);
    expect(annTypes).toEqual(expect.arrayContaining(["REPLY", "COMMENT_LIKE"]));
    const reply = annInbox.body.items.find((n: { type: string }) => n.type === "REPLY");
    expect(reply.actor.firstName).toBe("Ben");
    expect(reply.comment.id).toBe(r.body.comment.id);
  });

  it("retracts unread notifications on unlike / unfollow and marks read", async () => {
    const p = (await post(cat.agent, `retract ${tag}`)).body.post.id;
    await ben.agent.put(`/api/posts/${p}/like`).set("Origin", ORIGIN);
    await ben.agent.put(`/api/users/${cat.id}/follow`).set("Origin", ORIGIN);
    expect((await cat.agent.get("/api/notifications/unread-count")).body.count).toBeGreaterThanOrEqual(2);
    await ben.agent.delete(`/api/posts/${p}/like`).set("Origin", ORIGIN);
    await ben.agent.delete(`/api/users/${cat.id}/follow`).set("Origin", ORIGIN);
    const inbox = await cat.agent.get("/api/notifications");
    expect(inbox.body.items.filter((n: { actor: { id: string } }) => n.actor.id === ben.id)).toHaveLength(0);

    await ann.agent.put(`/api/posts/${p}/like`).set("Origin", ORIGIN);
    expect((await cat.agent.get("/api/notifications/unread-count")).body.count).toBeGreaterThan(0);
    await cat.agent.post("/api/notifications/read").set("Origin", ORIGIN).send({});
    expect((await cat.agent.get("/api/notifications/unread-count")).body.count).toBe(0);
  });

  it("hides notifications about posts that became private", async () => {
    const p = (await post(cat.agent, `soon private ${tag}`)).body.post.id;
    const c = await ann.agent.post(`/api/posts/${p}/comments`).set("Origin", ORIGIN).send({ content: "nice" });
    await cat.agent
      .post(`/api/posts/${p}/comments`)
      .set("Origin", ORIGIN)
      .send({ content: "thanks", parentId: c.body.comment.id });
    const hasReply = async () =>
      (await ann.agent.get("/api/notifications")).body.items.some(
        (n: { post: { id: string } | null }) => n.post?.id === p,
      );
    expect(await hasReply()).toBe(true);
    await cat.agent.patch(`/api/posts/${p}`).set("Origin", ORIGIN).send({ visibility: "PRIVATE" });
    expect(await hasReply()).toBe(false);
  });
});

describe("search", () => {
  it("finds posts by word prefix and respects visibility", async () => {
    const word = `xylo${tag}`;
    const pub = (await post(ben.agent, `I love ${word}phones and photography`)).body.post.id;
    const priv = (await post(ben.agent, `${word} private diary`, "PRIVATE")).body.post.id;
    const res = await ann.agent.get(`/api/search/posts?q=${encodeURIComponent(word)}`);
    expect(res.status).toBe(200);
    const ids = res.body.items.map((p: { id: string }) => p.id);
    expect(ids).toContain(pub);
    expect(ids).not.toContain(priv);
    const own = await ben.agent.get(`/api/search/posts?q=${encodeURIComponent(word)}`);
    expect(own.body.items.map((p: { id: string }) => p.id)).toEqual(expect.arrayContaining([pub, priv]));
  });

  it("is safe with operators and punctuation in the query", async () => {
    for (const q of ["a & | ! ( ) :*", "' OR 1=1 --", "%_\\"]) {
      const res = await ann.agent.get(`/api/search/posts?q=${encodeURIComponent(q)}`);
      expect(res.status).toBe(200);
      const people = await ann.agent.get(`/api/search/users?q=${encodeURIComponent(q)}`);
      expect(people.status).toBe(200);
    }
  });

  it("finds people by partial name with follow state", async () => {
    const res = await ann.agent.get(`/api/search/users?q=${encodeURIComponent(`zq${nameTag.slice(0, 6)}`)}`);
    const found = res.body.items.map((u: { firstName: string }) => u.firstName).sort();
    expect(found).toEqual(["Ann", "Ben", "Cat"]);
    const benRow = res.body.items.find((u: { id: string }) => u.id === ben.id);
    expect(benRow.followedByMe).toBe(true);
  });
});

describe("background image processing", () => {
  it("accepts the upload immediately, then the job produces a normalised WebP + blur", async () => {
    const png = await sharp({
      create: { width: 3000, height: 1500, channels: 3, background: "#1890ff" },
    })
      .png()
      .withMetadata({ exif: { IFD0: { Copyright: "secret-gps" } } })
      .toBuffer();
    const res = await ann.agent
      .post("/api/posts")
      .set("Origin", ORIGIN)
      .field("content", `photo ${tag}`)
      .attach("image", png, { filename: "big.png", contentType: "image/png" });
    expect(res.status).toBe(201);
    expect(res.body.post).toMatchObject({ imageStatus: "PROCESSING", imageUrl: null, imageWidth: 2048, imageHeight: 1024 });

    await drainJobs();
    const ready = (await ann.agent.get(`/api/posts/${res.body.post.id}`)).body.post;
    expect(ready.imageStatus).toBe("READY");
    expect(ready.imageUrl).toMatch(/\.webp$/);
    expect(ready.imageBlur).toMatch(/^data:image\/webp;base64,/);
  });

  it("rejects non-images synchronously, whatever the declared type", async () => {
    const res = await ann.agent
      .post("/api/posts")
      .set("Origin", ORIGIN)
      .field("content", "fake")
      .attach("image", Buffer.from("<script>alert(1)</script>"), { filename: "x.png", contentType: "image/png" });
    expect(res.status).toBe(400);
  });
});
