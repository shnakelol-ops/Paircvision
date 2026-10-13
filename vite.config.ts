import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// EXPERIMENTAL Goal View (src/experimental/goal-view/sequenceGoalView.tsx).
// Rollback: delete this block, the `define` entry and `selfDestroying` below.
//
// - goalViewBranchPreview: Vercel says this is a PREVIEW build of the
//   experimental branch. Goal View is then always available (any URL of that
//   preview, no query needed), and the PWA service worker is replaced by a
//   self-destroying one on that preview only, so phones never keep serving a
//   stale cached build of the experiment.
// - goalViewPreviewEligible: false for Vercel production builds and previews of
//   any other branch, which compiles Goal View out of those bundles entirely.
//   (True when Vercel's variables are absent, e.g. a local build; the runtime
//   then still requires the experimental preview's exact host.)
const GOAL_VIEW_EXPERIMENT_BRANCH = "claude/paircvision-goal-view-audit-uaecv4";
const vercelEnv = process.env.VERCEL_ENV ?? process.env.VITE_VERCEL_ENV;
const vercelBranch = process.env.VERCEL_GIT_COMMIT_REF ?? process.env.VITE_VERCEL_GIT_COMMIT_REF;
const goalViewBranchPreview = vercelEnv === "preview" && vercelBranch === GOAL_VIEW_EXPERIMENT_BRANCH;
const goalViewPreviewEligible =
  vercelEnv !== "production" && (!vercelBranch || vercelBranch === GOAL_VIEW_EXPERIMENT_BRANCH);

export default defineConfig({
  define: {
    __GOAL_VIEW_PREVIEW_ELIGIBLE__: JSON.stringify(goalViewPreviewEligible),
    __GOAL_VIEW_BRANCH_PREVIEW__: JSON.stringify(goalViewBranchPreview),
  },
  plugins: [
    react(),
    VitePWA({
      filename: "sw.js",
      injectRegister: null,
      selfDestroying: goalViewBranchPreview,
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
