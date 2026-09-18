import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // .tsx added alongside the existing .ts pattern — purely additive, matches
    // nothing new that wasn't already excluded, and is what lets a React
    // component test (e.g. PlayerKitEditor.test.tsx) run at all. Component
    // tests opt into jsdom individually via a `// @vitest-environment jsdom`
    // pragma at the top of the file, so the default environment for every
    // existing .ts test is unchanged.
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
