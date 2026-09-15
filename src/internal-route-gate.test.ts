// Regression coverage for the public-scope hardening fix (Fix 8, Event Stats
// release audit): "/internal" (and "/internal/team-sheet") had no
// authentication or environment gate at all in main.tsx's route table — a
// plain exact-pathname match, reachable in a production deploy simply by
// typing the URL, fronting the old Match Stats capture surface and a real
// club's Team Sheet roster data. It was not linked from any public screen
// (Home, Event Stats, or their nav), so it failed only the "existence" test,
// not "discoverability" — but shipping a bare, unauthenticated internal-tools
// launcher in the production bundle was flagged as worth hardening
// regardless (one leaked link away from becoming publicly discoverable).
//
// The gate decision lives in its own module (internal-route-gate.ts) rather
// than inline in main.tsx, specifically so it's importable here without also
// importing main.tsx — main.tsx calls createRoot(...).render(...) as a
// top-level module side effect against a real DOM, which would crash under
// Vitest's node test environment (no `document`).
import { describe, expect, it } from "vitest";
import { shouldExposeInternalRoute } from "./internal-route-gate";

describe("shouldExposeInternalRoute — /internal production gate (Fix 8)", () => {
  it("is NOT exposed in a production build (import.meta.env.DEV === false)", () => {
    expect(shouldExposeInternalRoute(false)).toBe(false);
  });

  it("IS exposed under `npm run dev` (import.meta.env.DEV === true) — still usable for development/personal use", () => {
    expect(shouldExposeInternalRoute(true)).toBe(true);
  });
});
