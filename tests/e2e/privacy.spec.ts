import { test, expect } from "@playwright/test";

test.describe("API auth enforcement", () => {
  test("admin APIs return 401 without a session", async ({ request }) => {
    for (const path of ["/api/v1/admin/overview", "/api/v1/admin/users", "/api/v1/admin/ai-providers", "/api/v1/admin/ai-usage"]) {
      const res = await request.get(path);
      expect([401, 403]).toContain(res.status());
    }
  });

  test("private project endpoints return 401 without a session", async ({ request }) => {
    for (const path of ["/api/v1/projects", "/api/v1/humanization", "/api/v1/subscriptions", "/api/v1/users/me"]) {
      const res = await request.get(path);
      expect([401, 403]).toContain(res.status());
    }
  });

  test("public story page renders for valid slugs only when configured", async ({ request }) => {
    // No public story should exist yet — the endpoint must not leak data
    const res = await request.get("/api/v1/p/definitely-not-a-real-slug-xyz");
    expect(res.status()).toBe(404);
  });
});
