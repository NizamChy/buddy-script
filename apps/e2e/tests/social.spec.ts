import { expect, test } from "@playwright/test";
import { createPost, registerViaUi, uniqueTag } from "./helpers";

test("search, follow, Following feed and notifications", async ({ browser }) => {
  const cara = await registerViaUi(browser, "Cara");
  const dev = await registerViaUi(browser, "Dev");
  const word = `quokka${uniqueTag()}`;
  const text = `Spotted a ${word} today`;
  await createPost(cara.page, text);

  // Full-text search (prefix match) finds the post.
  const d = dev.page;
  await d.getByRole("searchbox", { name: "Search posts and people" }).fill(word.slice(0, -2));
  await d.getByRole("searchbox", { name: "Search posts and people" }).press("Enter");
  await expect(d).toHaveURL(/\/search\?q=/);
  await expect(d.locator("article", { hasText: text })).toBeVisible();

  // People search finds Cara by her (unique) last name; follow her.
  await d.getByRole("tab", { name: "People" }).click();
  const main = d.getByRole("main");
  await main.getByRole("searchbox", { name: "Search", exact: true }).fill(cara.lastName);
  await main.getByRole("searchbox", { name: "Search", exact: true }).press("Enter");
  await expect(main.getByText(`${cara.firstName} ${cara.lastName}`)).toBeVisible();
  await main.getByRole("button", { name: "Follow", exact: true }).click();
  await expect(main.getByRole("button", { name: "Following", exact: true })).toHaveAttribute("aria-pressed", "true");

  // Her post shows up in Dev's Following feed.
  await d.goto("/feed");
  await d.getByRole("tab", { name: "Following" }).click();
  await expect(d.locator("article", { hasText: text })).toBeVisible();

  // Like it so Cara gets two notifications (follow + like).
  await d.locator("article", { hasText: text }).getByRole("button", { name: "Like", exact: true }).click();
  await expect(d.locator("article", { hasText: text }).getByRole("button", { name: "Liked", exact: true })).toBeVisible();

  const c = cara.page;
  await c.reload();
  const bell = c.getByRole("button", { name: /^Notifications, 2 unread$/ });
  await expect(bell).toBeVisible();
  await bell.click();
  const dropdown = c.getByRole("dialog", { name: "Notifications" });
  await expect(dropdown.getByText("started following you")).toBeVisible();
  await expect(dropdown.getByText(/liked your post/)).toBeVisible();
  await dropdown.getByRole("button", { name: "Mark all as read" }).click();
  await expect(c.getByRole("button", { name: "Notifications", exact: true })).toBeVisible();
});

test("an uploaded photo is processed in the background and shown", async ({ browser }) => {
  const eve = await registerViaUi(browser, "Eve");
  const p = eve.page;
  // A tiny valid PNG (1x1, blue) is enough to exercise the pipeline.
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
    "base64",
  );
  await p.locator('input[type="file"]').setInputFiles({ name: "dot.png", mimeType: "image/png", buffer: png });
  const text = `Photo post ${uniqueTag()}`;
  await p.locator("#composer").fill(text);
  await p.getByRole("button", { name: /^Post$/ }).click();
  const card = p.locator("article", { hasText: text });
  await expect(card).toBeVisible();
  // Either still processing or already done; it must end with a rendered .webp image.
  await expect(card.locator("._feed_inner_timeline_image img")).toHaveAttribute("src", /\.webp|_next\/image/, {
    timeout: 30_000,
  });
});
