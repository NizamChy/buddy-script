import { randomUUID } from "node:crypto";
import type { Express } from "express";
import request from "supertest";
import { expect } from "vitest";

export const ORIGIN = (process.env.CORS_ORIGINS ?? "http://localhost:3000").split(",")[0]!.trim();
export const PASSWORD = "Str0ng!Passw0rd";

export type Agent = ReturnType<typeof request.agent>;

export const uniqueTag = () => randomUUID().replace(/-/g, "").slice(0, 10);

export async function registerUser(app: Express, email: string, firstName: string, lastName = "Tester") {
  const agent = request.agent(app);
  const res = await agent
    .post("/api/auth/register")
    .set("Origin", ORIGIN)
    .send({ firstName, lastName, email, password: PASSWORD });
  expect(res.status).toBe(201);
  return { agent, id: res.body.user.id as string };
}

/** Letters-only version of a tag (names may only contain letters). */
export const lettersOnly = (tag: string) => tag.replace(/\d/g, (d) => "ghijklmnop"[Number(d)]!);
