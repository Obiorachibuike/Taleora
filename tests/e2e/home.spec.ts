import { test, expect } from "@playwright/test";

test.describe("Home & landing", () => {
  test("landing page loads and shows value prop", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /Where Every Story/i })).toBeVisible();
    await expect(page.getByText("Imagine. Write. Humanize.")).toBeVisible();
  });

  test("login page loads", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: /Welcome back/i })).toBeVisible();
    await expect(page.getByPlaceholder("you@example.com")).toBeVisible();
  });

  test("register page loads", async ({ page }) => {
    await page.goto("/register");
    await expect(page.getByRole("heading", { name: /Start writing/i })).toBeVisible();
  });
});
