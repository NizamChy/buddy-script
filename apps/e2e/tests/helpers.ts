import { randomUUID } from "node:crypto";
import { expect, type APIRequestContext, type Browser, type Page } from "@playwright/test";

export const PASSWORD = "Str0ng!Passw0rd";
export const DEMO = { email: "demo@buddyscript.com", password: "Demo@12345" };

/** Letters-only unique tag (names may only contain letters). */
export const uniqueTag = () =>
  randomUUID()
    .replace(/-/g, "")
    .slice(0, 8)
    .replace(/\d/g, (d) => "ghijklmnop"[Number(d)]!);

export type TestUser = { email: string; firstName: string; lastName: string; id: string; page: Page };

/** Registers through the UI and returns a signed-in page in its own browser context. */
export async function registerViaUi(browser: Browser, firstName: string): Promise<TestUser> {
  const tag = uniqueTag();
  const lastName = `E${tag}`;
  const email = `${firstName.toLowerCase()}_${tag}@e2e.test`;
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/register");
  await page.getByLabel("First name").fill(firstName);
  await page.getByLabel("Last name").fill(lastName);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Repeat password").fill(PASSWORD);
  await page.getByLabel("I agree to terms & conditions").check();
  await page.getByRole("button", { name: "Register now" }).click();
  await expect(page).toHaveURL(/\/feed$/);
  const me = await apiJson<{ user: { id: string } }>(page.request, "get", "/api/auth/me");
  return { email, firstName, lastName, id: me.user.id, page };
}

/** Calls the API through the web app's /api proxy with the page's cookies (+ CSRF Origin). */
export async function apiJson<T>(
  request: APIRequestContext,
  method: "get" | "post" | "put" | "delete" | "patch",
  path: string,
  data?: unknown,
): Promise<T> {
  const base = process.env.E2E_BASE_URL ?? "http://localhost:3000";
  const res = await request[method](path, { data, headers: { Origin: base } });
  expect(res.ok(), `${method.toUpperCase()} ${path} -> ${res.status()}`).toBeTruthy();
  return (res.status() === 204 ? undefined : await res.json()) as T;
}

/** Writes a post with the composer and waits for it to appear at the top of the feed. */
export async function createPost(page: Page, text: string, visibility: "Public" | "Only me" = "Public") {
  await page.locator("#composer").fill(text);
  await page.getByLabel("Who can see this?").selectOption({ label: visibility });
  await page.getByRole("button", { name: /^Post$/ }).click();
  const card = page.locator("article", { hasText: text });
  await expect(card).toBeVisible();
  return card;
}
