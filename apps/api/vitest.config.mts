import { existsSync } from "node:fs";
import { defineConfig } from "vitest/config";

// Integration tests run against the database in DATABASE_URL (the local docker-compose one).
if (existsSync(".env")) process.loadEnvFile(".env");

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 20_000,
  },
});
