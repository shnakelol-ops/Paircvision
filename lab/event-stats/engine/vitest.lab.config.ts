// Guardian V1 — Event Stats laboratory, engine path. Developer-side only.
// Run from the repo root:  npx vitest run --config lab/event-stats/engine/vitest.lab.config.ts
// Separate from the app's vitest.config.ts (src/** only), so the lab is never part of the
// app's test count, and nothing under lab/ is imported by the app or its build.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["lab/event-stats/engine/**/*.lab.test.ts"],
    environment: "node",
    testTimeout: 60_000,
  },
});
