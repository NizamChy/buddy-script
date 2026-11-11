import { expect, test } from "@playwright/test";
import { DEMO } from "./helpers";

test("protected pages redirect to login, demo user can sign in and out", async ({ page }) => {
  await page.goto("/feed");
  await expect(page).toHaveURL(/\/login/);

  await page.getByLabel("Email").fill(DEMO.email);
  await page.getByLabel("Password", { exact: true }).fill("wrong-password");
  await page.getByRole("button", { name: "Login now" }).click();
  await expect(page.getByText(/invalid email or password/i)).toBeVisible();

  await page.getByLabel("Password", { exact: true }).fill(DEMO.password);
  await page.getByRole("button", { name: "Login now" }).click();
  await expect(page).toHaveURL(/\/feed$/);
  await expect(page.getByRole("tab", { name: "For you" })).toHaveAttribute("aria-selected", "true");

  // Signed-in users are bounced away from the auth pages.
  await page.goto("/login");
  await expect(page).toHaveURL(/\/feed$/);

  await page.getByRole("button", { name: "Open profile menu" }).click();
  await page.getByRole("menuitem", { name: /log out/i }).click();
  await expect(page).toHaveURL(/\/login/);
  await page.goto("/notifications");
  await expect(page).toHaveURL(/\/login/);
});
