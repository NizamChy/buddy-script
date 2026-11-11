import { expect, test } from "@playwright/test";
import { createPost, registerViaUi, uniqueTag } from "./helpers";

test("post, like, comment and reply; private posts stay private", async ({ browser }) => {
  const ann = await registerViaUi(browser, "Ann");
  const ben = await registerViaUi(browser, "Ben");
  const tag = uniqueTag();

  // Ann posts publicly and privately.
  const publicText = `Hello from Ann ${tag}`;
  const privateText = `Ann's secret ${tag}`;
  await createPost(ann.page, publicText);
  const privCard = await createPost(ann.page, privateText, "Only me");
  await expect(privCard.getByText("Only me")).toBeVisible();

  // Ben sees the public post only.
  await ben.page.reload();
  const card = ben.page.locator("article", { hasText: publicText });
  await expect(card).toBeVisible();
  await expect(ben.page.locator("article", { hasText: privateText })).toHaveCount(0);

  // Like (optimistic + persisted).
  await card.getByRole("button", { name: "Like", exact: true }).click();
  await expect(card.getByRole("button", { name: "Liked", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(card.getByText("You", { exact: true })).toBeVisible();

  // Comment.
  await card.getByRole("button", { name: "Comment", exact: true }).click();
  await card.getByPlaceholder("Write a comment").fill(`Nice one ${tag}`);
  await card.getByRole("button", { name: "Send comment" }).click();
  await expect(card.getByText(`Nice one ${tag}`)).toBeVisible();

  // Ann replies to Ben's comment.
  await ann.page.reload();
  const annCard = ann.page.locator("article", { hasText: publicText });
  await expect(annCard.getByText("1 Comment")).toBeVisible();
  await annCard.getByRole("button", { name: "1 Comment" }).click();
  await annCard.getByRole("button", { name: "Reply", exact: true }).click();
  await annCard.getByPlaceholder("Reply to Ben…").fill(`Thanks Ben ${tag}`);
  await annCard.getByRole("button", { name: "Send reply" }).click();
  await expect(annCard.getByText(`Thanks Ben ${tag}`)).toBeVisible();

  // The like survives a reload.
  await ben.page.reload();
  await expect(
    ben.page.locator("article", { hasText: publicText }).getByRole("button", { name: "Liked", exact: true }),
  ).toBeVisible();
});
