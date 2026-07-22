import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.spec.ts"],
    // Decision-engine modules read policy catalogs at import time and several
    // touch pooled Postgres handles; a single fork keeps that setup shared and
    // deterministic instead of racing across workers.
    pool: "forks",
    fileParallelism: false,
    maxWorkers: 1,
    testTimeout: 20_000,
    coverage: {
      provider: "v8",
      reportsDirectory: "coverage",
      include: ["src/services/**", "src/config/authorization.ts"],
      exclude: ["src/services/data/seed-db.ts", "**/*.d.ts"],
    },
  },
});
