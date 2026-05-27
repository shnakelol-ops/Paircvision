# PáircVision Pro Tagging System — Audit & Plan

**Branch:** `experiment/pro-tagging-system-vision-labs`  
**Date:** Phase 0 — Audit Only  
**Status:** Plan approved before first code commit

---

## PHASE 0 — AUDIT FINDINGS

---

### 1. Current Architecture Findings

#### 1.1 Routing System

There is **no router library** (no react-router, no tanstack-router). Navigation is a
simple `pickRootComponent()` function in `src/main.tsx` that reads
`window.location.pathname` and returns the appropriate React component.

Existing registered paths:
```
/            → redirects to /board (PitchFlowCoachShell)
/vision-board → TacticalPadLiteClean
/flowstats    → TacticalPadLiteClean (initialMode="stats")
/stats        → redirects to /flowstats
/board        → PitchFlowCoachShell
/notes        → PitchFlowCoachShell (initialTab="notes")
/sessions     → PitchFlowCoachShell (initialTab="sessions")
/plans        → PitchFlowCoachShell (initialTab="plans")
/player-performance-tracker → PlayerPerformanceTracker
/movement-board-labs        → MovementBoardCanvasShellPage
```

**Impact on Pro Tagging:**  
Adding `/vision-labs/pro-tagging` requires ONE `if` block in `main.tsx` and a new
page component. Zero risk to any existing route.

---

#### 1.2 Current MatchEvent Shape (verbatim from `stats-event-model.ts`)

```typescript
export const MATCH_EVENT_KINDS = [
  "GOAL", "POINT", "WIDE", "TURNOVER_WON", "TURNOVER_LOST",
  "TWO_POINTER", "FORTY_FIVE_TWO_POINT", "SHOT",
  "FREE_WON", "FREE_CONCEDED", "FREE_SCORED", "FREE_MISSED",
  "KICKOUT_WON", "KICKOUT_CONCEDED",
] as const;

export type MatchEventKind = (typeof MATCH_EVENT_KINDS)[number]; // 14 kinds

export type MatchEvent = {
  id: string;
  kind: MatchEventKind;
  type?: MatchEventKind;       // legacy alias for kind — always identical
  tags?: string[];
  nx: number;                  // normalized 0–1
  ny: number;                  // normalized 0–1
  x?: number;                  // alias for nx (same value)
  y?: number;                  // alias for ny (same value)
  half: 1 | 2;
  period?: "1H" | "2H";        // derived from half
  timestamp: number;
  matchClockSeconds?: number;  // alias for timestamp — same value
  createdAt?: number;          // alias for timestamp — same value
  segment?: 1|2|3|4|5|6;
  teamSide?: "FOR" | "OPP" | "own" | "opposition";
  matchTimeSeconds?: number;   // third alias for timestamp
  halfSegment?: 1|2|3;
};
```

**Three time-aliased fields:** `timestamp`, `matchClockSeconds`, `matchTimeSeconds` are always
identical. Legacy artifact — do not add more.

**Two coordinate-aliased pairs:** `nx`/`x` and `ny`/`y` are always identical.
`nx`/`ny` are canonical (0–1). Do not add more aliases in Pro.

**The `kind` union is a closed `as const` tuple.** Many existing consumers
(`gaaModeConfig`, `buildEventLabels`, `ChainableEvent`, `PdfExportEvent`,
`ReviewCategoryKindMap`) type-check against this exact set. Adding new kinds to
this tuple would propagate type errors into every exhaustive `Record<MatchEventKind, …>`
throughout the codebase.

**DECISION: Pro Tagging MUST use a separate `ProEventKind` union.**
Do not extend `MATCH_EVENT_KINDS`. Use an adapter to bridge where needed.

---

#### 1.3 LoggedMatchEvent (StatsModeSurface extension of MatchEvent)

```typescript
// Defined inline inside StatsModeSurface.tsx (~7,643 lines)
type LoggedMatchEvent = MatchEvent & {
  playerId?: string;
  playerName?: string;
  playerNumber?: number;
  squadId?: string;
  team?: "HOME" | "AWAY";
};
```

This is the enriched event shape used in the existing live-stats flow. It is the
closest existing analog to what Pro Tagging needs — but it is defined inline in
a 7,643-line component. **Do not import from StatsModeSurface.tsx**.

**DECISION:** Pro Tagging defines its own `ProEvent` type that is structurally
compatible with `ChainableEvent` but not dependent on `StatsModeSurface`.

---

#### 1.4 Current Player Tagging Flow

In the existing stats system:
1. User selects event kind from button panel
2. User taps pitch (Pixi canvas fires `onEventLogged`)
3. If `activePlayer` is set (persistent across taps), player fields are attached

The player is **persistent and optional** — not per-event and not prompted.

In the Training Tracker (`PlayerPerformanceTracker`):
1. Select event from `EventGrid`
2. Select player from `PlayerPicker` grid
3. Event is immediately logged (no pitch tap)

The Training Tracker pattern is **Event → Player → Done**.

**Pro Tagging needs: Event → Player → Pitch → Back to Event.**

The Training Tracker's `PlayerPicker` component is the closest UX precedent.
Its grid of numbered buttons, live rating chips, and 1-tap player selection
can be directly adapted for Pro.

---

#### 1.5 Training Tracker Scoring Logic (reuse candidate)

`trainingScoring.ts` defines `TRAINING_EVENTS: TrainingEventDef[]`:

```typescript
type TrainingEventDef = {
  key: TrainingEventKey;
  label: string;
  points: number;            // signed integer weight
  color: string;
  category: EventCategory;
};
```

Current weights:
- goal: +3, point: +1, 2PT: +2
- turnover+: +1, turnover−: −1
- kickout+: +1, kickout−: −1
- free+: +1, free−: −1, free scored: +1, free missed: −1
- good decision: +1, bad decision: −1
- good pass: +1, bad pass: −1
- work rate+: +1, work rate−: −1
- repeated mistake: −3
- shot variants: −1 to −2

**DECISION:** Extract `computePlayerRating(events, playerId)` as a pure function.
Do not import from the component files. Reuse the weight concept directly in
`contribution-engine.ts` with Pro-extended weights for new event kinds.

**DECISION:** Do NOT import `trainingScoring.ts` directly into Pro features.
Copy the weight concept into Pro's own model files. This keeps the experiment
isolated and the production tracker unchanged.

---

#### 1.6 Chain Engine (reuse confirmed safe)

`analyseChains<TEvent extends ChainableEvent>(events, rules?) => ChainAnalysis<TEvent>`

This is a **pure function with no side effects**. It is generic over `TEvent`.
As long as Pro events can provide the `ChainableEvent` minimum contract:

```typescript
type ChainableEvent = {
  id: string;
  kind: MatchEventKind;          // ← THIS IS THE COUPLING POINT
  teamSide: "FOR" | "OPP";
  period: "1H" | "2H";
  segment: 1|2|3|4|5|6;
  matchClockSeconds?: number;
  nx: number;
  ny: number;
  tags?: string[];
};
```

The `kind` field is typed as `MatchEventKind`. Pro events that don't map to
existing kinds cannot flow directly into `analyseChains` without an adapter.

**DECISION:** Build `ProChainableEvent` that extends `ChainableEvent` but uses
`proKind: ProEventKind` alongside a `kind: MatchEventKind | "__PRO_UNMAPPED__"`
approach for the chain engine. For V1, the chain engine can operate on the
mapped subset (events with valid `MatchEventKind`). Full Pro chain support is a
Phase 6+ concern where we'd fork the chain-engine types.

---

#### 1.7 Zone Engine (reuse confirmed safe)

```typescript
// Accepts any object with optional x/y/nx/ny
type ZoneCoordinateEvent = { x?: number; y?: number; nx?: number; ny?: number; };
buildZoneOverlayModel<TEvent extends ZoneCoordinateEvent>(events, zoneMap)
```

Zero coupling to `MatchEventKind`. Pro events can be passed directly.

**DECISION:** Reuse zone engine as-is. No changes needed.

---

#### 1.8 Review Selectors (partially reusable)

`selectReviewEvents<TEvent extends ReviewSelectableEvent>(events, filters)`

`ReviewSelectableEvent` is `MatchEvent & { playerId?, playerName?, team?, teamSide? }`.

The coupling is through `MatchEvent` which requires `kind: MatchEventKind`.

**DECISION:** For V1, build a lightweight Pro-specific filter function rather than
forcing Pro events through `selectReviewEvents`. Phase 7+ can revisit.

---

#### 1.9 Review Session / PDF Export (reuse deferred)

`ReviewSession` and `PdfExportEvent` require `kind: MatchEventKind` throughout.

**DECISION:** Phase 8 is the Report Adapter Plan. Do not touch PDF or review
session in this experiment. Build an adapter contract definition only.

---

#### 1.10 GAA Mode Config (partially reusable — too thin for Pro profiles)

`gaaModeConfig` in `src/config/gaaModeConfig.ts`:
- Handles 4 codes ✓
- Provides `pitchSport`, `restartLabel`, `eventLabels` ✓
- Event buttons are flat arrays of 12–14 items only
- No sport-specific events (Hook, Block, Break, Sideline for hurling)
- No chain timing windows
- No possession rules
- No derived intelligence rules
- No keyboard layout definitions

**DECISION:** Create new `SportProfile` type in Pro feature folder.
`gaaModeConfig` can be consulted for existing labels but Pro profiles are
standalone. Do not modify `gaaModeConfig.ts`.

---

#### 1.11 Pitch Rendering (safe to reuse reference)

`createPixiPitchSurface` in `src/core/pitch/create-pixi-pitch-surface.ts` is a
Pixi.js canvas surface. It communicates via imperative handles and an
`onEventLogged` callback with raw `MatchEvent` shape.

For Phase 3 (Event → Player → Pitch), we need pitch tap with normalized `nx`/`ny`.
The simplest approach is a lightweight React overlay div (CSS grid cells or SVG
overlay) for V1 rather than wiring into the full Pixi surface. Pixi integration
can come in Phase 7.

**DECISION:** Phase 3 uses a simple React-rendered pitch SVG/div overlay.
Full Pixi integration deferred to Phase 7. This avoids a 7,643-line surface
dependency in the experiment.

---

### 2. Smallest Safe File Set for Experiment

Files that will be **created** (experiment-only):
```
src/main.tsx                                      ← ONE line added for new route
src/pages/ProTaggingLabPage.tsx                   ← new experiment page shell
src/features/pro-tagging/
  docs/AUDIT-AND-PLAN.md                          ← this document
  model/
    pro-event-model.ts                            ← ProEventKind, ProEvent
    sport-profile-types.ts                        ← SportProfile interface
    sport-profiles/
      football-profile.ts
      ladies-football-profile.ts
      hurling-profile.ts
      camogie-profile.ts
  engine/
    pro-match-event-adapter.ts                    ← ProEvent → ChainableEvent adapter
    possession-engine.ts                          ← pure function
    contribution-engine.ts                        ← pure function
  components/
    ProTaggingShell.tsx
    EventKeyboard.tsx
    ProPlayerPicker.tsx
    PitchTapSurface.tsx
    ProTaggingReviewStrip.tsx
  storage/
    pro-session-storage.ts
  styles/
    pro-tagging.css
```

Files that will **NOT be touched** in this experiment:
```
src/core/stats/stats-event-model.ts
src/core/stats/match-event-store.ts
src/StatsModeSurface.tsx
src/App.tsx
src/config/gaaModeConfig.ts
src/stats/chains/*
src/stats/zones/*
src/stats/review-selectors.ts
src/stats/review-types.ts
src/stats/reviewPdfExport.ts
src/stats/reviewSession.ts
src/stats/statsReviewSnapshot.ts
src/features/player-performance-tracker/*
src/features/notes/*
src/features/quickboard/*
src/core/pitch/*
src/core/match/*
```

---

### 3. Proposed Experiment Route

**Route:** `/vision-labs/pro-tagging`

Rationale:
- Consistent with `/movement-board-labs` convention (experiment path prefix)
- Clear separation from production routes (`/flowstats`, `/stats`)
- `vision-labs` prefix signals experiment status sitewide
- Easy to add more lab routes later under `/vision-labs/*`

Registration: ONE `if` block in `main.tsx`:
```typescript
const PRO_TAGGING_LAB_PATH = "/vision-labs/pro-tagging";
// in pickRootComponent():
if (normalizedPath === PRO_TAGGING_LAB_PATH) {
  return ProTaggingLabPage;
}
```

---

### 4. Proposed Data Model / MatchEvent Extension Strategy

#### ProEventKind — New Closed Union (isolated from MatchEventKind)

```typescript
// src/features/pro-tagging/model/pro-event-model.ts

export const PRO_EVENT_KINDS = [
  // === SCORING (maps to existing MatchEventKind) ===
  "GOAL",
  "POINT",
  "WIDE",
  "SHOT",
  "FREE_SCORED",
  "FREE_MISSED",
  "TWO_POINTER",          // football/ladies only
  "FORTY_FIVE_TWO_POINT", // ladies only

  // === RESTARTS (maps KICKOUT_WON / KICKOUT_CONCEDED via profile) ===
  "RESTART_WON",          // maps to KICKOUT_WON
  "RESTART_LOST",         // maps to KICKOUT_CONCEDED
  "SHORT_RESTART",        // new — no MatchEventKind equivalent
  "LONG_RESTART",         // new — no MatchEventKind equivalent

  // === POSSESSION ===
  "TURNOVER_WON",         // maps to existing
  "TURNOVER_LOST",        // maps to existing
  "POSSESSION_WON",       // new
  "POSSESSION_LOST",      // new

  // === FREES ===
  "FREE_WON",             // maps to existing
  "FREE_CONCEDED",        // maps to existing

  // === DELIVERY / ATTACK ===
  "DELIVERY_WON",         // new
  "DELIVERY_LOST",        // new
  "INSIDE_BALL_WON",      // new
  "INSIDE_BALL_LOST",     // new

  // === HURLING / CAMOGIE SPECIFIC ===
  "BREAK_WON",            // new
  "BREAK_LOST",           // new
  "HOOK",                 // new
  "BLOCK",                // new
  "SIXTY_FIVE",           // new (65)
  "SIDELINE",             // new

  // === QUALITY / EFFORT ===
  "GOOD_DECISION",        // new
  "BAD_DECISION",         // new
  "GOOD_PASS",            // new
  "BAD_PASS",             // new
  "WORK_RATE_PLUS",       // new
  "WORK_RATE_MINUS",      // new
  "REPEATED_MISTAKE",     // new
] as const;

export type ProEventKind = (typeof PRO_EVENT_KINDS)[number];
```

#### ProEvent — Extended event shape

```typescript
export type ProEvent = {
  id: string;
  proKind: ProEventKind;
  // For chain engine compatibility — only set when proKind maps to existing MatchEventKind
  mappedKind: MatchEventKind | null;
  nx: number;             // normalized 0–1 (canonical)
  ny: number;             // normalized 0–1 (canonical)
  half: 1 | 2;
  period: "1H" | "2H";   // always derived and set (not optional in Pro)
  segment: 1|2|3|4|5|6;  // always derived and set
  timestamp: number;      // wall clock ms since epoch
  matchClockSeconds: number; // match clock seconds (single source of truth)
  teamSide: "FOR" | "OPP"; // always set in Pro
  sportProfile: SportProfileId;
  playerId?: string | null;
  playerName?: string | null;
  playerNumber?: number | null;
  tags?: string[] | null; // optional chip metadata
  possessionId?: string | null; // linked possession (set during/after derivation)
};
```

#### Adapter: ProEvent → MatchEventKind (for chain engine V1)

```typescript
// src/features/pro-tagging/engine/pro-match-event-adapter.ts

const PRO_TO_MATCH_KIND: Partial<Record<ProEventKind, MatchEventKind>> = {
  GOAL: "GOAL",
  POINT: "POINT",
  WIDE: "WIDE",
  SHOT: "SHOT",
  FREE_SCORED: "FREE_SCORED",
  FREE_MISSED: "FREE_MISSED",
  TWO_POINTER: "TWO_POINTER",
  FORTY_FIVE_TWO_POINT: "FORTY_FIVE_TWO_POINT",
  RESTART_WON: "KICKOUT_WON",
  RESTART_LOST: "KICKOUT_CONCEDED",
  TURNOVER_WON: "TURNOVER_WON",
  TURNOVER_LOST: "TURNOVER_LOST",
  FREE_WON: "FREE_WON",
  FREE_CONCEDED: "FREE_CONCEDED",
};

export function toMatchEventKind(kind: ProEventKind): MatchEventKind | null {
  return PRO_TO_MATCH_KIND[kind] ?? null;
}

// Adapter to make Pro events consumable by the existing chain engine
export function toChainableEvent(event: ProEvent): ChainableEvent | null {
  const kind = toMatchEventKind(event.proKind);
  if (kind === null) return null; // unmapped Pro events cannot flow into legacy chain engine
  return { ...event, kind };
}
```

---

### 5. Sport Profile Architecture

```typescript
// src/features/pro-tagging/model/sport-profile-types.ts

export type SportProfileId = "FOOTBALL" | "LADIES_FOOTBALL" | "HURLING" | "CAMOGIE";

export type EventButtonDef = {
  proKind: ProEventKind;
  label: string;          // display text on button
  shortLabel?: string;    // optional compact label for tight layouts
  tone: EventTone;        // visual category colour
  category: ProEventCategory;
};

export type EventTone =
  | "score" | "wide" | "turnover" | "restart" | "free"
  | "delivery" | "effort" | "hurling";

export type ProEventCategory =
  | "scoring" | "restarts" | "possession" | "frees"
  | "delivery" | "effort" | "hurling-specific";

export type KeyboardLayout = {
  // buttons are grouped into rows/sections for display
  sections: ReadonlyArray<{
    id: string;
    label?: string;
    buttons: ReadonlyArray<EventButtonDef>;
  }>;
};

export type ChainTimingWindow = {
  anchorKind: ProEventKind;
  maxGapSeconds: number;
  maxWindowSeconds: number;
};

export type PossessionStartKind = ProEventKind;
export type PossessionEndKind = ProEventKind;

export type SportProfile = {
  id: SportProfileId;
  displayName: string;            // "Hurling", "Camogie", etc.
  pitchSport: "gaelic" | "hurling";
  restartLabel: string;           // "Kickout" or "Puckout"
  enabledProKinds: ReadonlySet<ProEventKind>;
  keyboardLayout: KeyboardLayout;
  scoringKinds: ReadonlySet<ProEventKind>;
  possessionStartKinds: ReadonlySet<PossessionStartKind>;
  possessionEndKinds: ReadonlySet<PossessionEndKind>;
  chainTimingWindows: readonly ChainTimingWindow[];
  reportVocabulary: {
    restart: string;              // "Kickout" or "Puckout"
    breakdown: string;            // "Hook / Block" or "Tackle / Break"
    insideBall: string;           // "Inside ball" or "Delivery into the square"
  };
};
```

#### Hurling Profile Design (the hardest test)

Hurling keyboard layout — 5 sections, portrait-first:

```
SECTION 1: SCORING (3 wide)
  [GOAL]  [POINT]  [WIDE]

SECTION 2: RESTARTS (2 wide)
  [PUCKOUT WON]  [PUCKOUT LOST]

SECTION 3: POSSESSION / TURNOVER (2 wide)
  [TURNOVER WON]  [TURNOVER LOST]

SECTION 4: HURLING-SPECIFIC (3 wide)
  [BREAK WON]  [BREAK LOST]  [HOOK]
  [BLOCK]      [65]          [SIDELINE]

SECTION 5: DELIVERY / EFFORT (3 wide)
  [DELIVERY WON]  [DELIVERY LOST]  [INSIDE BALL WON]
  [FREES ▶]  (expander to FREE_WON / FREE_CONCEDED / FREE_SCORED / FREE_MISSED)
  [EFFORT ▶] (expander to GOOD_DECISION / BAD_DECISION / WORK_RATE+/-)
```

No modal. The expanders slide open in-place and close after one tap.
Events are logged first; player/pitch follow.

#### Football Profile Design

```
SECTION 1: SCORING (3–4 wide)
  [GOAL]  [POINT]  [WIDE]  [2PT]

SECTION 2: RESTARTS (2 wide)
  [KICKOUT WON]  [KICKOUT LOST]

SECTION 3: POSSESSION (2 wide)
  [TURNOVER WON]  [TURNOVER LOST]

SECTION 4: FREES (2+2)
  [FREE WON]  [FREE CONCEDED]
  [FREE SCORED]  [FREE MISSED]

SECTION 5: DELIVERY / EFFORT (expanders)
  [DELIVERY WON]  [DELIVERY LOST]
  [GOOD DECISION]  [BAD DECISION]
  [WORK RATE+]  [WORK RATE-]
```

#### Ladies Football Profile

Same as football, plus FORTY_FIVE_TWO_POINT button.

#### Camogie Profile

Same as hurling profile exactly.

---

### 6. Event Keyboard Design

**Principles:**
- Portrait-first, phone-first, thumb-first
- Target size: minimum 56px height per button (ideally 64px)
- High contrast — white text on tone-coloured background
- No scrolling on the primary keyboard — all primary events visible
- Secondary events behind in-place expanders (non-blocking)
- After tap: immediately transition to Player Picker, not back to keyboard
- Show current active sport profile label in top bar

**State machine:**
```
IDLE ──tap event──► AWAITING_PLAYER
AWAITING_PLAYER ──select player──► AWAITING_PITCH
AWAITING_PLAYER ──skip player──► AWAITING_PITCH
AWAITING_PITCH  ──tap pitch──► [log event] ──► IDLE + optional chips
AWAITING_PITCH  ──skip pitch──► [log event at 0,0] ──► IDLE
```

**No confirmation step.** Event is committed on pitch tap.
**No blocking modal.** Chips appear only after commit, auto-dismiss in 1.5s.

---

### 7. Player Picker Design

Directly adapts `features/player-performance-tracker/components/PlayerPicker.tsx`.

**Changes for Pro:**
- Add "SKIP" button prominently at top-left
- Add "CLEAR" button to remove current active player
- Show player contribution rating chip from current session if available
- Grid: 1–15 starters, then subs below divider
- Numbered buttons: `#1`, `#2`, … with name beneath (truncated)
- After player tap: immediately show Pitch Tap surface

**Props for ProPlayerPicker:**
```typescript
type ProPlayerPickerProps = {
  players: readonly ProPlayer[];
  contributions: ReadonlyMap<string, number>; // playerId → session rating
  onSelectPlayer: (player: ProPlayer) => void;
  onSkip: () => void;
  activePlayerId?: string | null;
};
```

---

### 8. Pitch Tap Design

**V1 approach:** React div overlay with normalized coordinate capture.
No Pixi dependency in the experiment.

A `PitchTapSurface` component renders:
- Background: simple SVG GAA pitch outline (or a PNG)
- Capture: `onPointerDown` on the overlay div
- Coordinate: normalized `(nx, ny)` from `e.clientX - rect.left / rect.width`
- Visual feedback: a circle dot appears at tap point for 800ms then fades
- After tap: `onPitchTapped({ nx, ny })` callback fires, surface returns to neutral

**No confirmation step on the surface.**

```typescript
type PitchTapSurfaceProps = {
  onPitchTapped: (coords: { nx: number; ny: number }) => void;
  onSkip: () => void;
  pitchSport: "gaelic" | "hurling";
  attackingDirection: "LEFT" | "RIGHT";
  pendingEventLabel: string;    // "GOAL — #11 Seán Murphy" shown above pitch
};
```

Phase 7 upgrades this to Pixi integration with existing `createPixiPitchSurface`.

---

### 9. Possession Engine Plan

**File:** `src/features/pro-tagging/engine/possession-engine.ts`

**Design:**

```typescript
export type PossessionStartReason =
  | "RESTART_WON"      // kickout/puckout won
  | "TURNOVER_WON"     // turnover won
  | "POSSESSION_WON"   // possession won
  | "BREAK_WON"        // break won (hurling)
  | "FREE_WON"         // free awarded
  | "DELIVERY_WON"     // won delivery into forward area
  | "MATCH_START";     // beginning of period

export type PossessionEndReason =
  | "SCORE"            // goal or point
  | "SHOT_MISSED"      // wide or missed free
  | "TURNOVER_LOST"    // possession lost via turnover
  | "FREE_CONCEDED"    // free conceded
  | "POSSESSION_LOST"  // explicit possession lost
  | "PERIOD_END"       // ball dead, end of half
  | "RESTART_AGAINST"; // ball given over via kickout/puckout lost

export type Possession = {
  id: string;
  teamSide: "FOR" | "OPP";
  startEvent: ProEvent;
  endEvent: ProEvent | null;   // null if possession is still live
  events: readonly ProEvent[];
  startReason: PossessionStartReason;
  endReason: PossessionEndReason | null;
  durationSeconds: number | null;
  resulted_in_score: boolean;
  resulted_in_shot: boolean;
  period: "1H" | "2H";
  segment: 1|2|3|4|5|6;
};

export type PossessionDataset = {
  possessions: readonly Possession[];
  totalFor: number;
  totalOpp: number;
  scoringPossessionsFor: number;
  scoringPossessionsOpp: number;
  scoreReturnRateFor: number;   // scoringPossessionsFor / totalFor
  scoreReturnRateOpp: number;
  shotReturnRateFor: number;
  shotReturnRateOpp: number;
  avgDurationFor: number;       // seconds
  avgDurationOpp: number;
};

// Pure function — no side effects
export function derivePossessions(
  events: readonly ProEvent[],
  profile: SportProfile
): PossessionDataset;
```

**V1 Algorithm:**
1. Sort events by `matchClockSeconds` ascending
2. Scan forward; when a `possessionStartKinds` event is encountered for side X,
   open a new possession for X
3. Continue accumulating events for that possession
4. When a `possessionEndKinds` event is encountered, close the possession
5. If team changes happen without explicit possession events, possession ends implicitly

V1 does NOT attempt to resolve every edge case. It produces a best-effort
possession dataset from logged events. The analyst can improve data quality
by logging more events.

---

### 10. Player Contribution Engine Plan

**File:** `src/features/pro-tagging/engine/contribution-engine.ts`

**Design:**

```typescript
export type ProContributionWeights = {
  // Positive
  GOAL: number;
  POINT: number;
  TWO_POINTER: number;
  FREE_SCORED: number;
  TURNOVER_WON: number;
  RESTART_WON: number;
  BREAK_WON: number;
  DELIVERY_WON: number;
  INSIDE_BALL_WON: number;
  GOOD_DECISION: number;
  GOOD_PASS: number;
  WORK_RATE_PLUS: number;
  HOOK: number;
  BLOCK: number;
  FREE_WON: number;
  // Negative
  WIDE: number;           // −1
  TURNOVER_LOST: number;  // −1
  RESTART_LOST: number;   // −1
  BREAK_LOST: number;     // −1
  DELIVERY_LOST: number;  // −1
  BAD_DECISION: number;   // −1
  BAD_PASS: number;       // −1
  WORK_RATE_MINUS: number;// −1
  REPEATED_MISTAKE: number; // −3
  FREE_CONCEDED: number;  // −1
  POSSESSION_LOST: number;// −1
};

export type PlayerContributionCard = {
  playerId: string;
  playerName: string | null;
  playerNumber: number | null;
  totalScore: number;
  eventCounts: Partial<Record<ProEventKind, number>>;
  scoringInvolvements: number;    // chains where player appeared before a score
  possessionInvolvements: number; // possessions player appeared in
  positiveCount: number;
  negativeCount: number;
  breakdown: {
    scoring: number;
    restarts: number;
    possession: number;
    delivery: number;
    effort: number;
    hurlingSepecific: number;
  };
};

export type ContributionDataset = {
  players: readonly PlayerContributionCard[];
  topContributor: PlayerContributionCard | null;
  lowestContributor: PlayerContributionCard | null;
};

// Pure function — no side effects
export function deriveContributions(
  events: readonly ProEvent[],
  possessions: readonly Possession[],
  weights: ProContributionWeights
): ContributionDataset;
```

**V1 Algorithm:**
1. Group events by `playerId` where not null
2. For each player, sum weighted scores
3. For scoring involvements: any event by player in same possession as a scoring event
4. Return sorted `PlayerContributionCard[]` descending by `totalScore`

Possession involvement requires `derivePossessions` output — run possession engine first.
**Contribution score is never displayed during live logging — only in post-session review.**

---

### 11. Tactical Intelligence Derivation Plan

**Phase 7+ only. Not built in V1.**

Planned derivations (pure functions, all post-capture):

| Insight | Input Required | Phase |
|---|---|---|
| Puckout/kickout return rate | RESTART_WON/LOST events | Phase 5+ |
| Second-ball success rate | BREAK_WON/LOST events | Phase 5+ |
| Delivery efficiency | DELIVERY_WON/LOST | Phase 5+ |
| Turnover-to-score rate | Chain analysis | Phase 5 |
| Possession score return | Possession engine | Phase 5 |
| Player impact score | Contribution engine | Phase 6 |
| Momentum swings | Scoring runs | Phase 7 |
| Zone danger clustering | Zone engine | Phase 7 |
| Pressure waves | Event density over time | Phase 8+ |

V1 experiment only builds: possession engine (Phase 5) + contribution engine (Phase 6).
Momentum and zone danger reuse existing chain engine + zone engine directly.

---

### 12. Reuse vs Duplicate Decision for Tracker Scoring Logic

| System | Decision | Reason |
|---|---|---|
| `trainingScoring.ts` weight values | **Copy concept, not import** | trainingTypes are training-specific (TrainingEventKey union doesn't cover Pro events); importing would create a production → experiment dependency |
| `PlayerPicker.tsx` component | **Adapt, not import** | Component is tightly coupled to TrainingPlayer/TrainingSessionState; build ProPlayerPicker from scratch using same grid pattern |
| `RatingsScreen.tsx` layout | **Reference only** | The leaderboard pattern (sorted by score, breakdown chips) is the right UX; build ProContributionView from scratch |
| `ratingColor()` function | **Copy verbatim** | 8 lines, pure function, no type deps — safe to duplicate |
| `TRAINING_EVENTS` weights | **Reference for initial values** | Use same point values for shared events (turnover, kickout, decisions, passes) |

---

### 13. Regression Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Adding `if` block to `main.tsx` | Low | Path-matching only; no shared state; other paths unaffected |
| `ProEventKind` name collision with `MatchEventKind` | Medium | Use distinct names (`RESTART_WON` not `KICKOUT_WON`, `SIXTY_FIVE` not `FORTY_FIVE_TWO_POINT`) |
| Importing from `StatsModeSurface.tsx` | **Critical — DO NOT** | 7,643-line file with inline types; any import would create a tight coupling |
| Writing to existing localStorage keys | High | Use new storage keys prefixed `paircvision.pro-tagging.*` |
| Modifying `MATCH_EVENT_KINDS` | **Critical — DO NOT** | Would break exhaustive Record<MatchEventKind,…> type checks across codebase |
| Modifying `gaaModeConfig.ts` | High | Config is consumed by production stats flow |
| Touching `chain-rules.ts` | Medium | New Pro chain rules belong in Pro feature folder only |
| Touching existing pitch rendering | Low | Phase 3 uses independent React overlay, not Pixi |

---

### 14. Build Phases

#### Phase 0 — Audit Only ✅ COMPLETE
No code. This document.

#### Phase 1 — Experiment Shell
Files touched: `src/main.tsx` (+1 route), `src/pages/ProTaggingLabPage.tsx` (new)
Deliverable: `/vision-labs/pro-tagging` renders a placeholder screen showing
"PáircVision Pro Tagging — Vision Labs" with sport selector (4 codes).
**No production changes.**

#### Phase 2 — Shared Pro Event Model + Sport Profiles
Files created:
- `src/features/pro-tagging/model/pro-event-model.ts`
- `src/features/pro-tagging/model/sport-profile-types.ts`
- `src/features/pro-tagging/model/profiles/hurling-profile.ts`
- `src/features/pro-tagging/model/profiles/football-profile.ts`
- `src/features/pro-tagging/model/profiles/ladies-football-profile.ts`
- `src/features/pro-tagging/model/profiles/camogie-profile.ts`
- `src/features/pro-tagging/engine/pro-match-event-adapter.ts`

Deliverable: Pure type system + profiles. No UI yet. All types typecheck.

#### Phase 3 — Event → Player → Pitch Loop
Files created:
- `src/features/pro-tagging/components/ProTaggingShell.tsx`
- `src/features/pro-tagging/components/EventKeyboard.tsx`
- `src/features/pro-tagging/components/ProPlayerPicker.tsx`
- `src/features/pro-tagging/components/PitchTapSurface.tsx`
- `src/features/pro-tagging/storage/pro-session-storage.ts`
- `src/features/pro-tagging/styles/pro-tagging.css`

Deliverable: Full capture loop working for hurling profile.
Event logged → Player picked → Pitch tapped → Back to keyboard.
Stored in localStorage under `paircvision.pro-tagging.*`.
No reports. No review. Just capture.

#### Phase 4 — Sport Profile Switching
Deliverable: All 4 sport profiles switchable at session setup.
Keyboard layout and button labels change per profile.
Hurling shows hook/block/break/65. Football shows 2PT/mark.

#### Phase 5 — Possession Chain Prototype
Files created:
- `src/features/pro-tagging/engine/possession-engine.ts`

Deliverable: Given logged ProEvents, `derivePossessions()` produces a
`PossessionDataset`. Unit tests as pure function calls. No UI yet.

#### Phase 6 — Player Contribution Prototype
Files created:
- `src/features/pro-tagging/engine/contribution-engine.ts`
- `src/features/pro-tagging/components/ProContributionView.tsx`

Deliverable: After capture session, a review screen shows `PlayerContributionCard`
per player. Leaderboard. Event breakdown. Scoring involvements.

#### Phase 7 — Visual Review Prototype
Deliverable: Captured Pro events displayed on a pitch map (either the React SVG
overlay or a Pixi integration). Zone overlays reuse existing zone engine.

#### Phase 8 — Report Adapter Plan
Deliverable: Documented adapter contract showing how `ProEvent[]` can be
translated to `PdfExportEvent[]` for the existing PDF system.
**No PDF code changes.** Plan only.

---

### 15. Acceptance Tests

#### Phase 1
- [ ] `/vision-labs/pro-tagging` renders without error
- [ ] All existing routes still work (manual spot-check)
- [ ] `npm run build` passes
- [ ] `npm run typecheck` passes

#### Phase 2
- [ ] `ProEventKind` union compiles
- [ ] All 4 sport profiles typecheck against `SportProfile` interface
- [ ] `toMatchEventKind` returns null for unmapped Pro events
- [ ] `toMatchEventKind` returns correct `MatchEventKind` for all mapped Pro events

#### Phase 3
- [ ] User can tap event → select player → tap pitch in under 5 seconds
- [ ] Event is stored with correct `proKind`, `nx`, `ny`, `playerId`, `teamSide`
- [ ] "Skip player" still logs event without player attribution
- [ ] "Skip pitch" still logs event at nx=0.5, ny=0.5 (centre)
- [ ] No chips block the next event
- [ ] Session state persists on page reload

#### Phase 4
- [ ] Hurling keyboard shows PUCKOUT WON, PUCKOUT LOST, HOOK, BLOCK, BREAK WON/LOST, 65, SIDELINE
- [ ] Football keyboard shows KICKOUT WON, KICKOUT LOST, 2PT
- [ ] Ladies Football keyboard shows KICKOUT WON, KICKOUT LOST, 2PT, 45+2
- [ ] Camogie keyboard shows PUCKOUT WON, PUCKOUT LOST, HOOK, BLOCK

#### Phase 5
- [ ] `derivePossessions([])` returns empty dataset without error
- [ ] RESTART_WON followed by GOAL returns 1 possession, resulted_in_score=true
- [ ] TURNOVER_LOST ends the current team's possession
- [ ] Two consecutive RESTART_WON for same team creates 2 possessions

#### Phase 6
- [ ] Player with 2 GOALs has higher score than player with 1 POINT
- [ ] REPEATED_MISTAKE penalty of −3 is applied correctly
- [ ] Player with no events has score 0
- [ ] `deriveContributions([], [], weights)` returns empty dataset without error

---

### 16. What Will NOT Be Touched

The following files and systems are **guaranteed read-only** for this experiment:

```
✗ src/core/stats/stats-event-model.ts       — MatchEventKind is not extended
✗ src/core/stats/match-event-store.ts       — not used in Pro session
✗ src/StatsModeSurface.tsx                  — not imported, not modified
✗ src/App.tsx                               — not modified
✗ src/config/gaaModeConfig.ts               — not modified (Pro uses own profiles)
✗ src/stats/chains/chain-engine.ts          — not modified (adapter used)
✗ src/stats/chains/chain-rules.ts           — not modified (Pro rules in own folder)
✗ src/stats/chains/chain-types.ts           — not modified
✗ src/stats/chains/chain-selectors.ts       — not modified
✗ src/stats/zones/zone-engine.ts            — not modified (imported read-only if needed)
✗ src/stats/zones/zone-maps.ts              — not modified
✗ src/stats/zones/zone-selectors.ts         — not modified
✗ src/stats/review-selectors.ts             — not modified
✗ src/stats/review-types.ts                 — not modified
✗ src/stats/reviewPdfExport.ts              — not modified
✗ src/stats/reviewSession.ts                — not modified
✗ src/stats/statsReviewSnapshot.ts          — not modified
✗ src/stats/statsShareCard.ts               — not modified
✗ src/stats/statsSegments.ts                — not modified (may import read-only)
✗ src/features/player-performance-tracker/* — not modified
✗ src/features/notes/*                      — not modified
✗ src/features/quickboard/*                 — not modified
✗ src/core/pitch/*                          — not modified (may import types read-only)
✗ src/core/match/*                          — not modified (may import types read-only)
✗ src/engine/pixi/*                         — not modified
✗ src/movement-board/*                      — not modified
✗ src/pages/PitchFlowCoachShell.tsx         — not modified
✗ src/pages/TacticalPadLiteClean.tsx        — not modified
✗ src/pages/PlayerPerformanceTracker.tsx    — not modified
✗ src/pages/MovementBoardCanvasShellPage.tsx— not modified
✗ src/demo/demoMatchData.ts                 — not modified
✗ public/sw.js (if exists)                  — not modified
```

**Only `src/main.tsx` is touched in production-adjacent code — one `if` block.**

---

### HONESTY NOTES

1. **Scope creep risk is real.** The product vision describes 8+ phases.
   V1 experiment should strictly target Phases 1–3 (shell + model + capture loop).
   Phases 4–8 are future work.

2. **The optional chips (post-pitch-tap enrichment) are deferred.** They add
   significant UX complexity for marginal capture-time value. Defer to Phase 4+.

3. **The Pixi pitch integration is deferred.** A React overlay captures coordinates
   with zero risk of breaking existing pitch rendering. Phase 7 for Pixi.

4. **Player contribution display during live logging MUST stay out of V1.**
   Computing contributions on every event adds render overhead and distracts
   the analyst. Show only in post-session review.

5. **The `tags` / quick-chips system on `ProEvent` is modelled but NOT built in V1.**
   The field exists on the type for future use. No chip UI in Phase 3.

6. **The possession engine (Phase 5) needs careful timing window design.**
   GAA matches have frequent stoppages. A possession that spans a stoppage should
   not be split without careful rules. V1 possession engine is explicitly "best-effort."

7. **Do not let perfect be the enemy of fast.** The entire value of this experiment
   is proving the capture loop is fast enough for hurling. Get Phase 3 working
   and time it before building anything else.

---

*End of Phase 0 Audit. Phase 1 build begins after this document is committed.*
