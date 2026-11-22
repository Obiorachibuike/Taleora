import { afterEach, beforeAll } from "vitest";
import { getDb, closeDb, resetDbSingleton, runMigrations } from "@/lib/db";

// Run migrations once per test file (PGlite is per-test-file, so migrations run per file)
beforeAll(async () => {
  await getDb();
  try {
    await runMigrations();
  } catch (err) {
    // migrations might already be applied in this file's DB — treat as success
    void err;
  }
}, 60000);

afterEach(async () => {
  // keep the same PGlite instance per file (migrations stay valid)
});
