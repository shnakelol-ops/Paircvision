import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
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
        // Only the Event Stats atmosphere photo is added here, by its exact
        // hashed filename prefix — deliberately not broadened to "**/*.webp"
        // or any other raster pattern, so no unrelated repository image is
        // swept into the offline precache as a side effect of this change.
        globPatterns: ["**/*.{js,css,html,svg,json,webmanifest}", "**/scoreboard-pitch-*.webp"],
        maximumFileSizeToCacheInBytes: 6 * 1024 * 1024,
      },
    }),
  ],
});
