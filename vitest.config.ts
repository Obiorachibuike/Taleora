import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    globals: true,
    testTimeout: 15000,
    hookTimeout: 30000,
    include: ["tests/**/*.test.ts"],
    env: {
      NODE_ENV: "test",
      PGLITE_IN_MEMORY: "true",
      AI_CONFIG_ENCRYPTION_KEY: "",
      SSE_PORT: "0",
      AUTH_SECRET: "test-secret-test-secret-test-secret-test-secret",
    },
  },
});
