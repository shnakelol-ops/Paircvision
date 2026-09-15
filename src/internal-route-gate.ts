// Split out of main.tsx so this decision is unit-testable without importing
// main.tsx itself — main.tsx runs createRoot(...).render(...) as a top-level
// module side effect against a real DOM, which would crash under Vitest's
// node test environment (no `document`).
//
// Internal tools ("/internal", "/internal/team-sheet") stay fully reachable
// under `npm run dev` (isDev true) but are never selected in a production
// build (isDev false), regardless of hostname, so they can't be reached in a
// public deploy merely by knowing the route.
export function shouldExposeInternalRoute(isDev: boolean): boolean {
  return isDev;
}
