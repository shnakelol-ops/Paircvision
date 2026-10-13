import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// EXPERIMENTAL Goal View (src/experimental/goal-view/sequenceGoalView.tsx):
// `?goalview` may only unlock it on the experimental branch's Vercel preview.
// Vercel production builds and previews of any other branch get `false`, which
// compiles the feature out. Rollback: delete this block and the `define` entry.
const GOAL_VIEW_EXPERIMENT_BRANCH = "claude/paircvision-goal-view-audit-uaecv4";
const vercelEnv = process.env.VERCEL_ENV;
const vercelBranch = process.env.VERCEL_GIT_COMMIT_REF;
const goalViewPreviewEligible =
  vercelEnv !== "production" && (!vercelBranch || vercelBranch === GOAL_VIEW_EXPERIMENT_BRANCH);

export default defineConfig({
  define: {
    __GOAL_VIEW_PREVIEW_ELIGIBLE__: JSON.stringify(goalViewPreviewEligible),
  },
  plugins: [
    react(),
    VitePWA({
      filename: "sw.js",
      injectRegister: null,
      manifest: false,
      workbox: {
        cleanupOutdatedCaches: true,
        clientsClaim: false,
        skipWaiting: false,
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//, /\/[^/?]+\.[^/]+$/],
        globPatterns: ["**/*.{js,css,html,svg,json,webmanifest}"],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
    }),
  ],
});
