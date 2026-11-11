import { randomUUID } from "node:crypto";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { prisma } from "../src/lib/prisma";

const app = createApp();
const ORIGIN = (process.env.CORS_ORIGINS ?? "http://localhost:3000").split(",")[0]!.trim();
const tag = randomUUID().slice(0, 8);
const emails = [`alice_${tag}@test.local`, `bob_${tag}@test.local`];
const PASSWORD = "Str0ng!Passw0rd";

type Agent = ReturnType<typeof request.agent>;
let alice: Agent;
let bob: Agent;

async function register(email: string, firstName: string) {
  const agent = request.agent(app);
  const res = await agent
    .post("/api/auth/register")
    .set("Origin", ORIGIN)
    .send({ firstName, lastName: "Tester", email, password: PASSWORD });
  expect(res.status).toBe(201);
  return agent;
}

beforeAll(async () => {
  alice = await register(emails[0]!, "Alice");
  bob = await register(emails[1]!, "Bob");
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { in: emails } } });
  await prisma.$disconnect();
});

describe("auth", () => {
  it("rejects weak passwords and duplicate emails", async () => {
    const weak = await request(app)
      .post("/api/auth/register")
      .set("Origin", ORIGIN)
      .send({ firstName: "W", lastName: "P", email: `weak_${tag}@test.local`, password: "short" });
    expect(weak.status).toBe(400);

    const dup = await request(app)
      .post("/api/auth/register")
      .set("Origin", ORIGIN)
      .send({ firstName: "A", lastName: "B", email: emails[0]!.toUpperCase(), password: PASSWORD });
    expect(dup.status).toBe(409);
  });

  it("sets httpOnly cookies on login and never leaks the password hash", async () => {
    const res = await request(app).post("/api/auth/login").set("Origin", ORIGIN).send({ email: emails[0], password: PASSWORD });
    expect(res.status).toBe(200);
    const cookies = ([] as string[]).concat(res.headers["set-cookie"] ?? []);
    expect(cookies.some((c) => c.startsWith("bs_at=") && /HttpOnly/i.test(c))).toBe(true);
    expect(cookies.some((c) => c.startsWith("bs_rt=") && /HttpOnly/i.test(c))).toBe(true);
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");
  });

  it("returns a generic error for bad credentials", async () => {
    const res = await request(app).post("/api/auth/login").set("Origin", ORIGIN).send({ email: emails[0], password: "Wrong!Passw0rd" });
    expect(res.status).toBe(401);
  });

  it("protects the feed", async () => {
    expect((await request(app).get("/api/posts")).status).toBe(401);
    expect((await alice.get("/api/posts")).status).toBe(200);
  });

  it("blocks cross-origin writes (CSRF)", async () => {
    const res = await alice.post("/api/posts").set("Origin", "https://evil.example").field("content", "nope");
    expect(res.status).toBe(403);
  });

  it("enforces RBAC on admin routes", async () => {
    expect((await alice.get("/api/admin/stats")).status).toBe(403);
  });
});

describe("posts, visibility, likes and comments", () => {
  let publicId: string;
  let privateId: string;

  it("creates public and private posts", async () => {
    const pub = await alice.post("/api/posts").set("Origin", ORIGIN).field("content", `public ${tag}`).field("visibility", "PUBLIC");
    const priv = await alice.post("/api/posts").set("Origin", ORIGIN).field("content", `private ${tag}`).field("visibility", "PRIVATE");
    expect(pub.status).toBe(201);
    expect(priv.status).toBe(201);
    publicId = pub.body.post.id;
    privateId = priv.body.post.id;
  });

  it("shows private posts only to their author, newest first", async () => {
    const mine = await alice.get("/api/posts");
    const ids = mine.body.items.map((p: { id: string }) => p.id);
    expect(ids.indexOf(privateId)).toBeLessThan(ids.indexOf(publicId)); // newer first
    expect(ids).toContain(publicId);

    const theirs = await bob.get("/api/posts");
    const bobIds = theirs.body.items.map((p: { id: string }) => p.id);
    expect(bobIds).toContain(publicId);
    expect(bobIds).not.toContain(privateId);
    expect((await bob.get(`/api/posts/${privateId}`)).status).toBe(404);
    expect((await bob.put(`/api/posts/${privateId}/like`).set("Origin", ORIGIN)).status).toBe(404);
  });

  it("only lets the author edit or delete", async () => {
    expect((await bob.patch(`/api/posts/${publicId}`).set("Origin", ORIGIN).send({ content: "hijack" })).status).toBe(403);
    expect((await bob.delete(`/api/posts/${publicId}`).set("Origin", ORIGIN)).status).toBe(403);
    const edit = await alice.patch(`/api/posts/${publicId}`).set("Origin", ORIGIN).send({ content: "edited" });
    expect(edit.status).toBe(200);
    expect(edit.body.post.editedAt).toBeTruthy();
  });

  it("likes idempotently and lists who liked", async () => {
    await bob.put(`/api/posts/${publicId}/like`).set("Origin", ORIGIN);
    const again = await bob.put(`/api/posts/${publicId}/like`).set("Origin", ORIGIN);
    expect(again.status).toBe(200);
    const post = await alice.get(`/api/posts/${publicId}`);
    expect(post.body.post.likeCount).toBe(1);
    const likers = await alice.get(`/api/posts/${publicId}/likes`);
    expect(likers.body.items[0].user.firstName).toBe("Bob");

    await bob.delete(`/api/posts/${publicId}/like`).set("Origin", ORIGIN);
    await bob.delete(`/api/posts/${publicId}/like`).set("Origin", ORIGIN);
    expect((await alice.get(`/api/posts/${publicId}`)).body.post.likeCount).toBe(0);
  });

  it("supports comments, replies and comment likes with consistent counters", async () => {
    const c = await bob.post(`/api/posts/${publicId}/comments`).set("Origin", ORIGIN).send({ content: "nice" });
    expect(c.status).toBe(201);
    const commentId = c.body.comment.id;
    const r = await alice
      .post(`/api/posts/${publicId}/comments`)
      .set("Origin", ORIGIN)
      .send({ content: "thanks", parentId: commentId });
    expect(r.status).toBe(201);
    expect(r.body.comment.parentId).toBe(commentId);

    expect((await alice.put(`/api/comments/${commentId}/like`).set("Origin", ORIGIN)).status).toBe(200);
    const likers = await bob.get(`/api/comments/${commentId}/likes`);
    expect(likers.body.items[0].user.firstName).toBe("Alice");

    const post = await alice.get(`/api/posts/${publicId}`);
    expect(post.body.post.commentCount).toBe(2);

    // Bob cannot delete Alice's reply; Alice (post owner) can moderate Bob's comment.
    expect((await bob.delete(`/api/comments/${r.body.comment.id}`).set("Origin", ORIGIN)).status).toBe(403);
    // Deleting the top-level comment removes its reply too and fixes the counter.
    expect((await alice.delete(`/api/comments/${commentId}`).set("Origin", ORIGIN)).status).toBe(204);
    expect((await alice.get(`/api/posts/${publicId}`)).body.post.commentCount).toBe(0);
  });
});
