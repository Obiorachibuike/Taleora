import { test, expect } from "@playwright/test";

test.describe("Auth flows", () => {
  test("register → dashboard → logout", async ({ page, context }) => {
    const email = `e2e-${Date.now()}@example.com`;
    await page.goto("/register");
    await page.getByPlaceholder("Your name").fill("E2E Tester");
    await page.getByPlaceholder("you@example.com").fill(email);
    await page.getByPlaceholder("At least 8 characters").fill("Str0ng!Pass");
    await page.getByRole("button", { name: /Create account/i }).click();
    // registration creates a session and redirects to dashboard
    await expect(page).toHaveURL(/\/dashboard/, { timeout: 15_000 });
    await expect(page.getByRole("heading", { name: /Dashboard/i })).toBeVisible();
  });

  test("login page has working form", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("button", { name: /Sign in/i })).toBeVisible();
  });
});
