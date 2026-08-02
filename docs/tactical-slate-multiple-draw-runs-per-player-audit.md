# PáircVision — Tactical Slate: Multiple Draw Runs Per Player Audit

**Status:** Audit/report only, as requested — no branch, no code changes. Traces the code as it exists after the pass-timing fix (`1e5fdc2`, PR #275).

---

## Current Data Shape

Not one map — three parallel `Map<string, ...>` values, all keyed by `playerId`, all assuming exactly one route per player:

```ts
let routeByPlayerId = new Map<string, RoutePoint[]>();                    // :1401
let routeStartSegmentIndexByPlayerId = new Map<string, number>();          // :1405
let routePassTimingByPlayerId = new Map<string, RoutePassTiming>();        // :1408
```

Runtime/active-session state is separate and already keyed the same way:

```ts
let activeRouteRunsByPlayerId = new Map<string, ActiveBasicRouteFollow>(); // :1418
let routeControlledPlayerIds = new Set<string>();                          // :1419
```

## Exact Overwrite Point

`handleStagePointerUp()`, the route-commit handler, on pointer-up after drawing:

```ts
// createTacticalPadLiteSurface.ts:4180-4189
const hasExistingRoute = routeByPlayerId.has(currentRouteDraftPlayerId);
if (hasExistingRoute || routeByPlayerId.size < MAX_BASIC_ROUTE_PLAYERS) {
  routeByPlayerId.set(
    currentRouteDraftPlayerId,
    currentRouteDraftPoints.map((point) => ({ x: point.x, y: point.y })),
  );
  routeStartSegmentIndexByPlayerId.set(currentRouteDraftPlayerId, phases.length);
  emitRouteStateChange();
}
```

`Map.set()` on a key that already exists silently replaces the previous value. This is the single point where "Player 3 draws a run in Phase 5" destroys "Player 3's run from Phase 2" — confirmed, this is the only place it happens; nothing else in the file mutates these maps except whole-board clears (`clearRouteAssignments()`, `:2980-2982`) and player removal (`:4119-4127`), neither of which is the bug — they're correct, intentional full clears.

## The Key Design Finding: Runtime State Doesn't Need To Change

`activeRouteRunsByPlayerId` / `routeControlledPlayerIds` are keyed 1:1 by `playerId` and treated everywhere as "is this player currently route-controlled, yes/no" — a boolean-shaped fact, not "which of this player's routes is active." This assumption runs through `stepPlayback()`'s per-player skip (`:3385`), the ball-transition classifier (`:3415`), `applySnapshotToSurface`'s `preserveActiveRoutePlayers` option (`:2837`), and `stepBasicRouteFollow()`'s per-player loop (`:3480`).

**Recommendation: keep it that way.** Player 3 running a Phase 2 route and a Phase 5 route are never active at the same instant in the brief's own example (they're far apart in the sequence) — so the smallest safe rule is: **starting a player's next due route supersedes/replaces whatever route-run is currently active for that player** (if any). Under that rule, `activeRouteRunsByPlayerId`/`routeControlledPlayerIds`/`ActiveBasicRouteFollow` require **zero changes** — they keep meaning exactly what they mean today. The alternative (allowing two truly concurrent active runs for the same player, requiring these to be keyed by a route id instead of player id) would ripple through every one of those call sites for a scenario nothing in the brief asks for. Flag this as the one edge case worth a product decision: **what happens if a route's assigned phase arrives before the player's previous route has finished?** Recommend: the new run simply takes over immediately (same supersede rule), rather than queuing — consistent with "no timeline, no scheduler."

## Recommended Shape

Collapse the three parallel per-route maps into one, matching the brief's proposed name and shape almost exactly:

```ts
type RouteEntry = {
  id: string;                    // stable per-route id — new; lets the runtime tell entries apart
  points: RoutePoint[];          // unchanged geometry, verbatim from today's routeByPlayerId
  startSegmentIndex: number;     // unchanged meaning, verbatim from today's routeStartSegmentIndexByPlayerId
  passTiming: RoutePassTiming | null; // unchanged, verbatim from today's routePassTimingByPlayerId
};

let routesByPlayerId = new Map<string, RouteEntry[]>();
```

This is a consolidation, not just an addition — it replaces three maps with one, and every existing field keeps its exact current meaning. `RoutePoint`, `RoutePassTiming`, `ActiveBasicRouteFollow` are all untouched.

## Persistence Impact

**Smaller than it looks.** The current wire format for a saved board's `routes` array is already a **flat list of per-route rows**, not a nested per-player structure:

```ts
routes: Array.from(routeByPlayerId.entries()).map(([playerId, points]) => ({
  playerId, points, startSegmentIndex, passTiming,
}))
```

`sanitizeBoardRoutes()` (`:733-...`) parses this same flat list back — and the *only* thing preventing two rows from the same `playerId` today is one explicit guard: `if (parsed.has(playerId)) continue;`. Multi-route support at the wire level is: **remove that one guard, group by `playerId` into an array instead of a single value, and add one new optional field (`id`) per row.** The row shape itself (`{playerId, points, startSegmentIndex, passTiming}`) does not change.

## Legacy Compatibility

Full, with no migration step. Every board saved before this change has at most one row per `playerId` in its `routes` array — importing it into a `Map<string, RouteEntry[]>` produces a single-element array per player, identical in every respect (geometry, start index, pass timing) to today's behavior. Rows with no `id` (all legacy rows) get one generated at import time (e.g. `` `route-${playerId}-legacy` `` or a running counter) — `id` is new, purely internal bookkeeping never surfaced to the coach, so any generation scheme is safe.

## What Changes, Concretely

All within `createTacticalPadLiteSurface.ts`:

1. **State** (`:1401-1408`): three maps → one `routesByPlayerId: Map<string, RouteEntry[]>`.
2. **Commit handler** (`:4180-4189`): `.set()` (replace) → `.push()` onto the player's array (create the array if this is their first route). Stamp a freshly generated `id` per commit.
3. **`startRoutesForResolvedSegment`** (`:3055-3082`): today iterates `routeByPlayerId.keys()` and checks one start index per player; needs to iterate each player's `RouteEntry[]`, skip entries already consumed this playback session (track consumed route `id`s — a small `Set<string>`, reset alongside `activeRouteRunsByPlayerId` at playback start/cancel), and pick whichever due entry to start next. Applies the supersede rule from above if a run is already active for that player.
4. **`buildBasicRouteRunsForPlayers`** (`:3034-...`): currently takes a list of player ids and reads `routeByPlayerId.get(playerId)` (unambiguous, one route). Needs to instead take the specific chosen `RouteEntry` per player (there can now be more than one candidate), so the caller (item 3) must resolve "which entry" before calling it.
5. **`renderBasicRoutePreview`** (`:2896-2908` area): today loops `routeByPlayerId.entries()` once per player; needs a nested loop over each player's `RouteEntry[]` so multiple committed runs for the same player all draw (this is the only genuinely new rendering behavior — today's code has never had to draw two strokes for one player).
6. **Whole-board / per-player clears** (`:2980-2982`, `:4119-4127`): `.clear()` / `.delete(playerId)` on the single consolidated map — mechanically identical to today, just one map instead of three.
7. **Persistence** (`captureBoardState` `:3866-3870`, `sanitizeBoardRoutes`, `importBoardState` `:3999-4013`): flatten `routesByPlayerId` back to the same flat row shape (now potentially several rows sharing a `playerId`) on save; on load, remove the one-row-per-player dedup guard and group into arrays, defaulting missing `id`s.
8. **`hasExistingRoute` gate** (`:4180-4181`): becomes unnecessary in its current form — every commit is now an append, not a conditional replace-or-insert. The `MAX_BASIC_ROUTE_PLAYERS` cap (still meaning "distinct players with at least one route," i.e. `routesByPlayerId.size`) is unaffected in meaning, but worth pairing with a small **secondary per-player cap** (e.g. 6 runs) — the drawing-time resample cost identified in the earlier route-limit audit scales with *total* route entries, and multi-route-per-player raises the realistic ceiling on that total beyond what that audit assumed.

No changes needed to: `RoutePoint`, `RoutePassTiming`, `ActiveBasicRouteFollow`, `stepBasicRouteFollow`, the ball-transition classifier, `stepPlayback`'s per-player skip, or any UI copy/labels (`routeCount`/`hasAssignedRoutes` keep meaning "distinct players with a route").

## Estimated Files and Effort

**One file** (`createTacticalPadLiteSurface.ts`) for the engine change. **Zero required UI changes** in `TacticalPadLiteClean.tsx` — drawing a route already just calls into the engine the same way regardless of whether the player has zero or several existing routes; the "Route" pill / draw gesture doesn't need to know or ask which run this is.

**0.75–1.5 engineering days**: the map consolidation and persistence flattening are mechanical; the one piece requiring actual care is item 3 (per-session consumed-route tracking + the supersede rule), plus manual verification of the brief's exact scenario (three runs for one player across phases 2/5/8, each with independent pass timing) and a legacy-board load/replay check.

## PR #275 or a Follow-Up?

**Recommend amending PR #275**, for now: it's still open and unreviewed (`state: open`, `mergeable_state: clean`, last checked), this is a direct, small extension of the exact data model PR #275 already introduced (`routeStartSegmentIndexByPlayerId`, `routePassTimingByPlayerId` are precisely the two maps this change folds into `RouteEntry`), and splitting it into a separate PR right now would mean reviewing the same lines twice — once as three parallel maps, again as a consolidation into one. If PR #275 merges before this is implemented, or if a reviewer would rather see the hybrid-playback/pass-timing work land and stabilize first, a follow-up PR is equally reasonable — the two aren't coupled at the commit level, just at the data-model level, and either path is low-risk given how localized the change is.

---

## Summary

No code changed by this report, as requested. The recommended shape (`routesByPlayerId: Map<string, RouteEntry[]>`) is a strict generalization of the current three-map structure with identical wire compatibility, requires no schema version bump, and the one substantive design decision — what happens if a route's phase arrives before the player's previous route finishes — has a small, timeline-free answer (the new run supersedes the old one) that keeps every runtime call site touching `activeRouteRunsByPlayerId`/`routeControlledPlayerIds` completely unchanged.
