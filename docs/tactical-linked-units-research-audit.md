# PáircVision — Linked Tactical Units: Research & Feasibility Audit

**Status:** Research only. No production code, schema, test or UI changes are proposed for merge in this document.
**Author role:** Senior product engineer / tactical-sports researcher / interaction designer.
**Baseline:** current `main` after merged PR #262.
**Current-main SHA:** `929357ca0e25812da02703dd52468cfec78c6c6d` (`929357c`, "Merge pull request #262 from shnakelol-ops/claude/tactical-play-card-migration").
**Date:** 2026-07-26.

---

## 0. Executive verdict

PáircVision should build a **genuine linked tactical unit system**, but it should be an **evolution of the existing "Move as 1" feature inside Tactical Play**, not a new product surface and not a physics/AI engine.

The current "Move as 1" is **not** the originally intended concept. It is a one-shot, author-time **rigid route copy**: the coach draws a route for one selected player, presses *Apply to Unit*, and every other member receives an independent copy of that route translated by its starting offset. After the copy is baked there is **no live link, no leader, no relationship line, and no coordinated reaction** — editing the "leader" again does nothing to the followers until the coach manually re-applies. This is a real gap between what the feature *looks like it promises* and what it *does*.

The good news: the foundations needed for a real linked-unit system already exist and are clean.

- The world model is **resolution-independent normalized `0–100` coordinates**, so relative offsets and shape maths are trivial and orientation-safe.
- A `TacticalUnit` type and a persisted `units[]` slot **already exist** in the saved-play schema.
- The playback engine already supports **per-token routes, staggered starts, and event chaining** (`triggeredBy`), which is most of what "one player triggers, the rest react" needs.

The realistic first version is **Model B (leader/follower offsets) rendered with relationship lines, authored the way Move as 1 already is** (draw the leader, the unit follows) — but with the link made **visible, persistent, editable, and re-appliable**, plus a stored leader. This is meaningfully better than today's Move as 1 while staying inside the current architecture. Shape-preserving constraint solvers (Model C) and behaviour presets (Model D) are **V2**, not MVP.

**Direct verdict is at the end of this document (Section 14).**

---

## 1. Tactical Play vs Tactical Slate — the decision

**Recommendation: Shared data foundation, first shipped in Tactical Play. Tactical Slate reuse is a deliberate fast-follow, not a co-launch.**

This is a decision, not a hedge. The reasoning:

- Every worked example in the product brief — "a defensive three staying connected", "a half-forward line sliding across together", "a kickout press squeezing around the receiving area", "a full-back line dropping while retaining width" — describes **coordinated movement over time**. Time-based coordinated movement is the definition of **Tactical Play**. **Tactical Slate has no animation engine at all** (`src/pages/TacticalPadLiteClean.tsx` is a static coaching whiteboard: tokens, equipment, freehand/tactical drawing, text annotations, screenshots — no playback orchestrator, no routes, no `units`).
- The building blocks already live in Tactical Play: the `TacticalUnit` type, the persisted `units[]` slot, `buildMemberRoutes`, the route model, and the playback orchestrator. Slate would have to import an animation subsystem it does not currently have just to express the *interesting* half of the feature.
- The genuinely Slate-shaped subset — a **static linked shape** you drag as one, with relationship lines, for coaching diagrams and screenshots — is real and valuable, but it is a strict subset of the same data model. It should reuse the shared `LinkedUnit` model once that model is proven in Play.

So: **one shared model, two behaviours.** Play gets the animated leader/follower behaviour (the reason to build this at all). Slate gets static "drag-the-shape / show-the-lines" as a later, cheap addition on top of the identical schema. We do **not** split the model, and we do **not** try to launch both behaviours at once.

| | **Tactical Play** (recommended first home) | **Tactical Slate** (fast-follow) |
|---|---|---|
| Animation engine present today | Yes (`playback-orchestrator.ts`) | No |
| `units[]` / routes today | Yes | No |
| Value of linked units | High — press/drop/slide/squeeze over time | Moderate — static shape + relationship lines for diagrams |
| Build cost to reach value | Moderate (evolve existing feature) | Would need to import animation to match Play; only cheap if scoped to *static* grouping |
| Verdict | **Ship MVP here** | **Reuse shared model later for static grouping** |

---

## 2. Current architecture audit (Phase 1)

### 2.1 Product surface mapping

| Coach-facing name | Route | Implementation file | Character |
|---|---|---|---|
| Tactical Play | `/vision-tactics/play` | `src/features/vision-tactics/TacticalPlaySurface.tsx` (3,362 lines) | Animated movement board: tokens, routes, passes, shots, playback. **Home of "Move as 1".** |
| Tactical Slate | `/vision-tactics/slate` | `src/pages/TacticalPadLiteClean.tsx` (6,110 lines) | Static coaching whiteboard: tokens, equipment, drawing, text. **No animation, no units.** |
| Hub | `/vision-tactics` | `VisionTacticsHub.tsx`, `VisionTacticsShell.tsx` | Landing + router (`slate` / `play` / `hub`). |

Confirmed by `VisionTacticsShell.tsx`: `view === "slate" → <TacticalPadLiteClean/>`, `view === "play" → <TacticalPlaySurface/>`.

### 2.2 The shared movement-board engine

Both the routes/playback machinery live under `src/movement-board/`:

```
movement-board/
  coordinates/   normalization.ts (0–100 world), viewport.ts, coordinates.ts
  shell/         createMovementCanvasShell.ts, types.ts   ← the imperative handle
  playback/      playback-orchestrator.ts                 ← the animation engine
  routes/        route-layer.ts, route-sampling.ts, route-colors.ts
  movement/      basic-route-follow.ts                    ← per-token follow session
  tokens/ ball/ zones/ items/ pitch/ input/
```

The React surface (`TacticalPlaySurface.tsx`) talks to the engine through an imperative handle, `MovementCanvasShellHandle` (`shell/types.ts`), e.g. `getTokens`, `setRoutes`, `setStartPositions`, `playAll`, `setRouteMeta`, `addPassEvent`. This is the seam any linked-unit work must respect.

### 2.3 The core movement model (no phases, no keyframes)

The unit of movement is **one route per token**:

```ts
// movement-board/shell/types.ts
export type MovementBoardRoute = {
  playerId: string;
  points: NormalizedPoint[];       // 0–100 world coords
  concept?: MovementConcept;       // "support-run" | "overlap" | "shadow-run" | "rotation" | "custom"
  label?: string;
  delayMs?: number;                // fixed start delay
  triggeredBy?: string;            // start after another player's route completes  ← chaining
  sequenceIndex?: number;
};
```

There is **no phase/keyframe system**. Searching `src/movement-board` for `phase`/`keyframe` returns nothing. Coordinated timing is expressed only through `delayMs` (fixed stagger) and `triggeredBy` (start-after-completion chaining). This is a **path/route model**, not a **keyframe model** — a distinction that matters for the competitor comparison (Section 4) and the behaviour models (Section 6).

### 2.4 Playback interpolation (`playback/playback-orchestrator.ts`)

- On `start()`, `buildRuns()` reads every token's start position, its route, and its route meta. For each token with a route of ≥2 points it builds a `BasicRouteFollowSession` (constant-speed `BASIC_ROUTE_FOLLOW_SPEED = 22`, ease-in-out via sampling).
- Tokens with `triggeredBy` are held **pending** until the named token's run completes, then promoted to active (`step()` loop). Passes (`TacticalPassEvent`) and shots (`TacticalShotEvent`) have their own pending/active promotion, including `notifyPassLanded()` gating shots on possession.
- Default staggering: `PLAY_ALL_STAGGER_MS = 90` per token when no explicit `delayMs`.
- **Each token is animated independently.** There is no notion of "these tokens move as a group at runtime" — the coordination is entirely pre-baked into the individual routes before playback starts.

**Implication for linked units:** the engine can *already* play back a coordinated unit **if** the member routes are generated correctly beforehand. A live, runtime "followers track the leader" behaviour during playback would require new orchestrator logic; a **pre-baked** coordinated unit (generate member routes at author time, then play normally) is supported today. This strongly favours an author-time model for the MVP.

### 2.5 Set Start

`setStartPositions()` (shell handle) snapshots current token positions as each token's playback origin (`startPositionByTokenId`). `reset()` returns every token to its stored start. Dragging a token in setup mode updates its start position and re-anchors point 0 of its route (`handleDragMove`, `createMovementCanvasShell.ts:810–835`). Relevant because a linked unit's "home shape" is naturally the set-start snapshot.

### 2.6 Drag handling (single object today)

`createMovementCanvasShell.ts` maintains a single `activeDrag` (`{ tokenId, pointerId, offsetWorld }`). `handleDragMove` moves exactly one token, updates its start, re-anchors its route's first point, and fires `onTokenMove`. **There is no multi-select and no group drag** in either surface. A "drag the leader, followers follow live" interaction would hook here (move followers by the same delta) — feasible but a genuine engine change.

### 2.7 What "Move as 1" actually is (traced end-to-end)

**Data model** — deliberately minimal:

```ts
// features/vision-tactics/tacticalUnitTypes.ts
export type TacticalUnit = {
  id: string;
  name: string;
  memberIds: string[];   // no leader, no offsets, no shape, no behaviour
};
```

**State** (`TacticalPlaySurface.tsx`): `units`, `unitsOpen`, `unitNameDraft`, `unitEditingId`, `unitDrawingId`, plus `unitsRef` for WebGL context-loss restore. Units are held in React state and mirrored into save snapshots.

**Authoring flow** (as coded):
1. Open the **"Move as 1"** panel (button labelled `Move as 1`, `TacticalPlaySurface.tsx:2457`).
2. Type a name, press **+ Unit** → `onCreateUnit()` creates `{id, name, memberIds: []}`.
3. Toggle member chips → `onToggleUnitMember()` adds/removes `memberIds`.
4. Enter "draw" mode for the unit, select one token, draw that token's route.
5. Press **Apply to Unit** → `onApplyUnitRoute()`.

**The apply step** (`onApplyUnitRoute` → `buildMemberRoutes`):

```ts
// features/vision-tactics/tacticalUnitHelpers.ts
export function buildMemberRoutes(leaderRoute, unit, leaderId, tokenPositions) {
  const leaderPos = tokenPositions.get(leaderId);
  const result = [{ playerId: leaderId, points: leaderRoute, delayMs: 0 }];
  for (const memberId of unit.memberIds) {
    if (memberId === leaderId) continue;
    const memberPos = tokenPositions.get(memberId);
    const dx = memberPos.x - leaderPos.x;         // fixed offset from the "leader"
    const dy = memberPos.y - leaderPos.y;
    const points = leaderRoute.map(pt => ({       // leader route, translated by that offset
      x: clamp(pt.x + dx), y: clamp(pt.y + dy),
    }));
    result.push({ playerId: memberId, points, delayMs: 0 });
  }
  return result;
}
```

**So Move as 1 is, precisely: a shared *translation* baked into independent copied routes at author time (Model A).** It is:
- **Not** a live link — after apply, members hold their own ordinary routes.
- **Not** a runtime constraint — playback treats members as unrelated tokens.
- **Not** a shape — no offsets, angles, or distances are stored; the offset is recomputed from live positions only at the moment of apply.
- **Not** visualised — there is **no rope/relationship line rendering anywhere** (grep for `memberIds` shows only logic in `TacticalPlaySurface.tsx` and `tacticalUnitHelpers.ts`; no renderer references units).
- **Not leader-aware** — the "leader" is simply whichever token happens to be selected at apply time; it is never stored on the unit. Re-drawing that token later does nothing to followers until the coach re-applies.

**Persistence** — units *are* saved:

```ts
// features/vision-tactics/tacticalPlayStorage.ts  (TacticalScenario)
units?: TacticalUnit[];   // persisted alongside tokens, routes, ballState, passEvents, shotEvents, zones, items, textAnnotations
```

So membership survives save/load and context-loss restore, but because it carries no leader/offsets/shape, the saved unit is only useful as a re-apply grouping, not as a living relationship.

### 2.8 Can current world coordinates + playback support linked-relative movement?

**Yes — for an author-time (pre-baked) model.** Reasons:
- Normalized `0–100` coordinates make relative offsets and shape maths straightforward and orientation-independent (`setOrientation` is presentation-only; "coordinates, routes, timeline and saves are unaffected" per the shell docstring).
- `buildMemberRoutes` already proves the core transform.
- The orchestrator already plays independent per-token routes, with `delayMs`/`triggeredBy` for coordinated timing.

**Not today — for a live runtime constraint** ("followers continuously track the leader *during* playback", or "drag the leader and followers move live in setup"). Both would require new code: the orchestrator animates tokens independently, and drag handles a single token. These are the two places new subsystems would be needed.

### 2.9 Reuse vs new subsystem

**Reuse safely:**
- Normalized coordinate system and clamping (`coordinates/normalization.ts`).
- `TacticalUnit` type and the persisted `units[]` schema slot (extend, don't replace).
- `buildMemberRoutes` (the Model A/B transform core).
- The route model + playback orchestrator for **pre-baked** coordinated movement.
- The `triggeredBy` chaining pattern for "leader completes → cover reacts".
- The save/restore + WebGL-restore plumbing (`unitsRef`, snapshot round-trip).

**New subsystem / model work required:**
- Extend `TacticalUnit` with `leaderId`, optional per-member `offset`, optional `shape`/`behaviour` (schema migration + version guard).
- A **relationship-line renderer** (the "rope/string" visual) in the PixiJS layer — nothing renders unit links today.
- Optional **live group drag** in `createMovementCanvasShell.ts` (multi-token move by delta).
- Optional **live runtime follow** in the orchestrator (V2+; not needed for a pre-baked MVP).
- Optional **shape/constraint solver** (Model C) — only if V2 pursues shape preservation.

---

## 3. (reserved — see Section 1 for the Play/Slate decision)

---

## 4. Competitor & web research (Phase 3)

Scope note: I distinguish **confirmed functionality** (from product docs / tutorials) from **marketing language / inference**. Almost every "linked players" feature on the market is one of three things, and only one of them matches PáircVision's intent:

- **(a) Telestration linking** — drawing lines/spotlights/"bases" on top of *video* footage, optionally tracking real players. (KlipDraw, Coach Paint, Once, Metrica.)
- **(b) Static tactical lines** — a drawn line *between* player markers to show shape/units, with no coordinated animation. (Metrica links, most tactics boards.)
- **(c) Authored coordinated movement** — the coach designs how a group moves together over time on a blank board. (Basketball play designers via keyframes; PáircVision's actual goal.)

PáircVision's intent is **(c)**. The most transferable prior art is therefore the **basketball keyframe play designers**, not the football telestrators — even though the telestrators are where the "rope between players" *visual* is most mature.

### 4.1 KlipDraw / KlipDraw Motion (Nacsport)

- **What it does (confirmed):** A telestration tool. Its **"Linked Bases"** tool lets you connect the "bases" (markers/spotlights placed on players) so that a **line joins them and the connected shape shows changing formations**. In *KlipDraw Motion* (v4.3+) you can link **tracking events** — bases that follow players in a moving video — so the formation line updates as the footage plays. A tip explicitly recommends combining Linked Bases with the area tool to shade the space between two lines of the team.
- **Movement type:** Telestration-driven. Movement comes from the **video** (or from manual tracking of the video), **not** from an authored constraint on a blank board. The "link" is a **visual relationship line** layered over tracked markers.
- **How the relationship is created/edited:** The user places bases on players, then applies the Linked Bases tool to connect them; on video, bases are attached to tracking events.
- **Operates during animation?** Yes, but the "animation" is video playback with markers tracking players — not a designed play.
- **What PáircVision should learn:** The **relationship-line visual language** (lines joining a unit, shading the corridor between two lines) is proven and coach-legible. Adopt the *visual*.
- **What not to copy:** The video/telestration dependency. PáircVision authors plays on a blank pitch; there is no footage to track.
- Sources: Nacsport "KlipDraw Motion in 7 Videos" and KlipDraw Motion tutorials (see links, §4.9).

### 4.2 Metrica Sports — Play / Nexus

- **What it does (confirmed):** Video analysis with tactical boards. Annotations include Player IDs, Spotlights, Magnifiers and **"Links between players to create tactical lines"**; players can be **animated across the field to show pressing sequences, rotations, or buildup actions**.
- **Movement type:** The **links are static visual lines**; the **animation is a separate capability** (moving players along the field). The two are not the same feature — linking draws shape; animating moves players. There is no confirmed "move the line and the linked players follow as a constrained unit".
- **How created/edited:** Drawing/annotation tools over clips.
- **What PáircVision should learn:** Coaches already read "a link line = a unit/line of the team". The vocabulary is established.
- **What not to copy:** Treating links purely as decoration disconnected from movement — which is exactly the trap PáircVision should *avoid* by making the link drive the movement.
- Source: Metrica Nexus tactical-boards help centre (see §4.9).

### 4.3 Coach Paint (Chyron / Tracab)

- **What it does (confirmed):** Broadcast/pro telestration. Has **"linked cursors"** that track multiple players at once, a **Formation Tool** for visually planning shape, spotlights that lock onto players and stay in sync during motion, and AI player tracking.
- **Movement type:** Telestration over video + AI tracking. "Linked cursors" is a *tracking-and-highlight* linkage, not an authored constraint.
- **What PáircVision should learn:** Locking a highlight/line to a moving player so the relationship stays visually coherent during motion is exactly the *rendering* behaviour a link line needs during playback.
- **What not to copy:** The AI-tracking / broadcast-production scope. Out of scope and out of budget.
- Source: Chyron PAINT / Tracab CoachPaint product pages, Coach Paint Pro (see §4.9).

### 4.4 Once Sport (Analyser / Coach Board)

- **What it does (confirmed):** Video analysis + 3D telestration + a **Coach Board** for drills/lineups/tactics with animation, across many sports. Uses AI keyframing for tracking; drawings can be normal/dashed/curved.
- **Movement type:** Telestration (video) plus a separate animated coach board. No confirmed leader/follower constraint linkage.
- **What PáircVision should learn:** A single product cleanly separates "telestrate the video" from "animate on a board" — PáircVision's Slate/Play split mirrors this and is sound.
- **What not to copy:** Multi-sport 3D breadth; not relevant to a focused Gaelic MVP.
- Source: once.sport product pages (see §4.9).

### 4.5 Basketball play designers (Elite Hoops, The Hoops Geek, Play Designer) — the closest match

- **What they do (confirmed):**
  - **Elite Hoops Play Designer:** **"Movement Links"** — tap a player to attach an action to them and they **automatically move along its path in the next frame**.
  - **The Hoops Geek:** drag-and-drop; every drawn action is instantly animated; supports **"synchronized actions"** and timing-based movements.
  - **Play Designer (Basketball):** add **concurrent movement** to other players for complex offensive/defensive plays.
- **Movement type:** **Authored, keyframe/frame-based.** The dominant model across board-animation tools (also DrawTactics, Sportsanim, TacticSlate) is: set the starting frame → move who changes → **"+ step" copies positions and interpolates between frames**. This is the (c) category and the true analogue to PáircVision's goal — but expressed with **keyframes**, whereas PáircVision uses **per-player routes**.
- **How the relationship is created/edited:** Per-frame positioning; "concurrent"/"synchronized" movement is achieved by editing several players within the same frame/step, not by a persistent leader→follower constraint object.
- **Operates during animation?** Yes — interpolation between frames *is* the animation.
- **What PáircVision should learn:** (1) Coaches accept and understand **coordinated multi-player movement authored on a blank board**. (2) The keyframe "+step copies then move what changed" idiom is extremely low-friction — worth studying for the authoring UX even though PáircVision stays route-based. (3) "Concurrent/synchronized" is the coach-legible framing of "these move together".
- **What not to copy:** A full keyframe timeline rebuild is a large architecture change PáircVision does **not** need for an MVP. PáircVision's route model can express the same coordinated result via leader route + offset followers.
- Sources: Elite Hoops, The Hoops Geek, Play Designer app listings (see §4.9).

### 4.6 TacticalPad / Tactic3D / general soccer boards

- **What they do (confirmed / mixed):** TacticalPad — animated player movements, passing patterns, 2D/3D, enhanced animation curves; the de-facto GAA-capable incumbent. Tactic3D — "move players like a magnet board" with group manipulation "maintaining formation" (this last phrase is **marketing**, not documented constraint behaviour). Generic boards (Tactico, TacticBoard, Coach Tactic Board) — drag-and-drop formations, simple animations; **no documented "move the whole line as a locked unit" constraint**.
- **Movement type:** Path/keyframe animation; group manipulation where present is drag-time convenience, not a persistent authored relationship.
- **What PáircVision should learn:** Even the incumbents largely **do not** offer authored leader/follower *constraint* units — a genuine linked-unit system is a **differentiator**, not table stakes.
- **What not to copy:** 3D realism and breadth; irrelevant to the coaching value.
- Sources: TacticalPad, Tactic3D, Tactico, TacticBoard listings (see §4.9).

### 4.7 GAA-specific landscape (uniqueness check)

- **What exists (confirmed):** TacticalPad (GAA-capable, with a coaching webinar), Coach Tactic Board (now supports Gaelic football), tactical-board.com (Gaelic football boards), iGamePlanner, and physical/whiteboard products (iGAACoach, Galactico boards). These are **static boards or basic path animations**.
- **Finding:** No researched GAA product offers **authored linked tactical units** with leader/follower relationship lines and coordinated press/drop/slide behaviour. **This is a genuine, defensible differentiator for PáircVision** in the Gaelic-games niche.
- Sources: see §4.9.

### 4.8 Cross-tool synthesis

| Tool | Category | Link is… | Movement is… | Operates in animation? | Take / Leave |
|---|---|---|---|---|---|
| KlipDraw | (a) telestration | visual line over tracked bases | from video/tracking | yes (video) | Take: line visual. Leave: video dependency. |
| Metrica | (a)+(b) | static tactical line | separate animate feature | partially | Take: link vocabulary. Leave: link/movement disconnect. |
| Coach Paint | (a) | linked cursors / formation tool | video + AI track | yes | Take: line stays locked during motion. Leave: AI/broadcast scope. |
| Once | (a)+(c) | telestration | board animation | yes | Take: Slate/Play separation. Leave: 3D breadth. |
| Basketball designers | **(c)** | (no persistent link object) | **authored keyframes** | **yes** | **Take: authored coordinated movement + low-friction idiom.** Leave: full keyframe rebuild. |
| TacticalPad/Tactic3D | (c) | none/marketing | path/keyframe | yes | Take: nothing new. Leave: 3D. |
| GAA incumbents | (b) | static | static/basic | no | Differentiation opportunity. |

**Headline:** the *visual* (rope/line joining a unit) is borrowed from telestrators; the *behaviour* (authored coordinated movement) is borrowed from basketball designers; **no competitor combines them as a persistent leader/follower constraint object on a blank board** — which is exactly the space for PáircVision.

### 4.9 Sources

- TacticalPad — https://www.tacticalpad.com/en-us/new/index.php ; App Store https://apps.apple.com/us/app/tacticalpad-coachs-whiteboard/id512949303 ; GAA webinar https://www.youtube.com/watch?v=6ok2jA7INQ4
- KlipDraw Motion tutorials (Linked Bases) — https://www.klipdraw.com/blog/en/Tips/klipdraw-motion ; Nacsport "KlipDraw Motion in 7 Videos" https://www.nacsport.com/blog/en-gb/Tips/klipdraw-motion-7-videos ; https://cgi.nacsport.com/blog/en-us/Tips/7-videos-klipdraw-motion ; KlipDraw pro tips https://www.nacsport.com/blog/en-gb/Tips/klipdraw-tips
- Metrica Sports — tactical boards help https://www.metrica-sports.com/help-center/tactical-boards ; field radar / Nexus https://www.metrica-sports.com/blog/discover-the-new-field-radar-visualizations-in-metrica-nexus
- Coach Paint / Chyron / Tracab — https://www.coachpaint.com/coach-paint-pro/ ; https://chyron.com/products/all-in-one-production-systems/telestrated-replay-and-sports-analysis/ ; https://tracab.com/products/coachpaint/
- Once Sport — https://once.sport/coach-board/ ; https://once.sport/once-telestrator/ ; https://once.sport/once-sport-analyser/
- Basketball designers — Elite Hoops https://apps.apple.com/us/app/play-designer-elite-hoops/id6443711183 ; The Hoops Geek https://app.thehoopsgeek.com/ ; Play Designer Basketball https://apps.apple.com/us/app/basketball-play-designer/id1407281336
- Keyframe/path board tools — DrawTactics https://drawtactics.com/animated-tactics-board ; Sportsanim https://sportsanim.com/ ; TacticSlate https://tacticslate.com/ ; Athletepath https://www.athletepath.com/soccer-tactics-board/
- Tactic3D — https://www.tactic3d.com/ ; generic boards Tactico https://tactico.pro/soccer-tactics ; TacticBoard https://www.tacticboard.app/
- GAA landscape — tactical-board.com https://tactical-board.com/uk/gaelic-football ; iGamePlanner http://igameplanner.com/gaelic-football-coaching-software ; iGaelicCoach https://igaeliccoach.ie/ ; Galactico GAA boards https://galacticosports.ie/gaa-tactics-board ; SportsJOE feature https://www.sportsjoe.ie/gaa/new-gaa-tactics-board-revolutionising-coaching-grassroots-inter-county-245729

---

## 5. Gaelic-games problem definition (Phase 4)

Designed for Gaelic football and hurling specifically — not a relabelled soccer feature. Gaelic games differ in ways that matter here: **kickouts/puckouts are contested restarts with pressing structures**, defences use **sweepers and massed retreats**, and **transition is fast and end-to-end**. The most valuable linked-unit use cases cluster around **restart structure** and **defensive shape**, because those are the situations where a *unit moving together* is the whole coaching point.

Terminology follows the locked project standard (Kickouts / Puckouts, not "Restarts" in display; team names always attributed).

### 5.1 Defensive shape
- Full-back line dropping while retaining width.
- Sweeper relationship to the back line (one player offset behind a unit).
- Half-back screen sliding across as a line.
- Zonal unit shifting toward the ball without every player running an identical route.
- Pressing player with one/two covering behind.
- Protecting the scoring zone (a unit collapsing toward the D).
- Forcing play toward the sideline (a line angling its shift).

### 5.2 Kickout / puckout structure
- 3- or 4-player pressing unit squeezing around the target/receiving zone.
- Midfield diamond or box holding shape.
- Keeping central cover while wide players press.
- Second-ball structure (a compact unit around the likely break).
- Retreating into shape after the kickout/puckout is won or lost.

### 5.3 Attacking shape
- Support triangles around the ball carrier.
- Overlap/underlap relationships.
- Keeping width while runners maintain staggered depth.
- Creating and preserving overloads.
- Handpass support arriving in shape around the carrier.

### 5.4 Transition
- Nearest player presses; second covers; third blocks the central lane.
- Coordinated recovery runs (a line sprinting back together).
- Temporary compactness before expanding.

### 5.5 Ranked use cases

Ranking weighs **coaching value**, **ease of authoring in the current engine**, **technical difficulty**, **coach comprehension**, **uniqueness to PáircVision**, and **launch suitability**.

| Rank | Use case | Coaching value | Author ease | Tech difficulty | Coach clarity | Uniqueness | Best phase |
|---|---|---|---|---|---|---|---|
| 1 | **Kickout/puckout press unit (3–4) squeezing/holding** | Very high | High | Low–Med | Very high | High | **MVP** |
| 2 | **Full-back line drop retaining width** | Very high | High | Low | Very high | High | **MVP** |
| 3 | **Pressing player + cover behind (leader/follower)** | High | High | Low–Med | High | High | **MVP** |
| 4 | **Half-back / defensive line lateral slide** | High | High | Low | High | Med | **MVP** |
| 5 | Sweeper relationship (offset behind a unit) | High | Med | Low–Med | High | High | MVP/V2 |
| 6 | Zonal unit ball-relative shift | Very high | Med | **High** | Med | Very high | **V2** |
| 7 | Attacking support triangle (compress/rotate) | High | Med | **High** | Med | High | **V2** |
| 8 | Overload creation/preservation | High | Low | High | Med | High | V2 |
| 9 | Transition press→cover→block chain | Very high | Med | Med | Med | High | V2 (leans on `triggeredBy`) |

**MVP should target ranks 1–4** (and 5 if cheap): units that **slide, drop, and squeeze while holding relative shape** — all expressible as leader route + fixed-offset followers, which the engine already supports at author time. **Shape compression/rotation and ball-relative shifting (6–8) are V2**, because they need a constraint solver or ball-anchored logic. The transition chain (9) is a natural V2 because it maps onto the existing `triggeredBy` mechanism (leader completes → cover reacts).

---

## 6. Behaviour-model comparison (Phase 5)

### Model A — Rigid formation translation
Every member keeps exactly the same offset from the anchor; move the anchor 5 m left, all move 5 m left.
- **Ease:** trivial — **this is literally today's `buildMemberRoutes`.**
- **Usefulness:** genuinely good for lines that slide/drop with fixed spacing (full-back line, half-back slide) — ranks 2 and 4.
- **Similarity to Move as 1:** identical.
- **Limitations:** cannot compress, rotate, or shift asymmetrically; every member traces the same shaped path; no leader stored; no live link.

### Model B — Leader/follower offsets
One stored **leader**; followers keep **editable** offsets from the leader.
- **Usability:** high and coach-legible ("6 presses, 5 and 7 cover off him").
- **Schema:** add `leaderId` + per-member `offset {dx,dy}` (default = current relative position). Small, additive.
- **Playback:** still pre-bakeable via `buildMemberRoutes` (extended to read stored offsets and leader); no orchestrator change required for MVP.
- **Editing complexity:** moderate — editable offsets and a persistent link, but no solver.
- **Verdict:** **the MVP model.** It is a minimal, honest superset of Move as 1 that adds a real, editable, visible relationship.

### Model C — Shape-preserving constraints
Members maintain approximate distances/angles; the shape may compress/rotate/stretch within limits.
- **Value:** high for triangles and zonal units (ranks 6–7).
- **Complexity:** needs a constraint solver (e.g. iterative relaxation / soft constraints) integrated into both drag and playback.
- **Risk:** **unpredictable/emergent behaviour** — the #1 way this feature could feel "the app is pretending to understand tactics". Hard to test deterministically; performance risk on phones with per-frame solving.
- **Verdict:** **V2 only**, and only for specific shapes with tight, documented limits.

### Model D — Tactical behaviour presets
Coach links players and picks a behaviour (Slide Left/Right, Press Ball, Drop, Squeeze, Expand, Maintain Width/Depth, Cover Behind); the engine generates the movement.
- **Gaelic usefulness:** high — the presets map directly onto §5's use cases.
- **Authoring speed:** fastest of all once presets exist.
- **Risk:** highest risk of the app **overclaiming tactical intelligence**; a preset that moves players "wrong" for a given situation erodes coach trust fast.
- **Coach control:** must remain fully overridable.
- **Verdict:** **V2**, layered on top of B, and only presets that are mechanically unambiguous (Slide/Drop/Squeeze/Expand/Maintain Width) — defer anything "smart" (ball-relative, auto-cover) until proven.

### Model E — Manual linked keyframes with relationship lines
Coach positions every member per phase; PáircVision shows the relationship lines and helps preserve chosen spacing, but does not move players automatically.
- **Verdict:** the **most conservative** honest first version. Its weakness in PáircVision specifically: the engine is **route-based, not keyframe-based**, so "position per phase" has no native home without building a keyframe subsystem. Given that, **Model B reaches the same coaching value more cheaply** by reusing routes. Model E's genuinely valuable half — **always-visible relationship lines and spacing readouts** — should be **folded into the MVP as the link visual**, rather than shipped as a separate model.

### Recommendation
**Ship Model B (leader/follower offsets) + the relationship-line visual from Model E.** Defer Model C (shape solver) and Model D (presets) to V2. Do **not** build a physics or AI system. This is a staged combination, weighted firmly toward the cheapest model that is genuinely better than today.

---

## 7. Interaction design (Phase 6)

### 7.1 Naming
Audited candidates: *Move as 1, Linked Unit, Create Unit, Unit Shape, Shape Lock, Stay Connected, Move Together, Defensive Unit.*

**Recommended coach-facing terms:**
- Feature / mode: **"Linked Units"** (menu), verb **"Link Players"** to create. (Clear, sport-neutral, and — importantly — *accurate*, unlike "Move as 1", which over-promises unison.)
- The object: **"Unit"** (e.g. "Full-Back Unit"), with the coach's own name.
- The lead: **"Lead player"** (not "leader" — softer, and matches "who leads the movement").
- The visual: **"link lines"**.
- Avoid **"Shape Lock"** (implies rigidity the MVP shouldn't over-promise) and keep **"Move as 1"** only as a possible sublabel during transition (see Section 9).

### 7.2 Recommended workflow (MVP)
1. In setup, open **Linked Units** (evolved "Move as 1" panel).
2. **Select 2–5 players** (via the existing member chips; a marquee/multi-select is a nice-to-have, not required).
3. Tap **Link Players** → a Unit is created; **link lines appear immediately** between members.
4. **Set the lead player** (tap a member → "Set as lead"; defaults to the first selected / most central).
5. Optionally choose a **unit type** for the link-line drawing only: **Line / Triangle / Box / Diamond / Custom** (this affects how lines connect members visually; it does **not** impose a solver in MVP).
6. **Draw the lead player's route** (existing route tool).
7. **Apply** → followers receive offset-preserving routes (extended `buildMemberRoutes` using stored offsets). Link lines persist.
8. **Override any player** by drawing/dragging them individually — an overridden member is visually flagged and excluded from the next auto-apply.
9. **Play** → the unit moves together (pre-baked). Link lines remain visible during playback (toggleable).
10. **Unlink** at any time (breaks the unit, leaves routes intact).

### 7.3 Specific answers
- **How units are created:** select members → Link Players. Additive to the existing panel.
- **How the lead is identified:** stored `leaderId`; shown with a distinct token ring/badge; changeable anytime.
- **Lines visible during playback:** **yes, by default, with a toggle.** (Learned from Coach Paint's locked lines and KlipDraw's formation lines — the line staying coherent during motion is the payoff.)
- **How a unit is edited:** re-select members, move the lead and re-apply, or edit per-member offsets (V1.1) / individual override.
- **How players leave a unit:** deselect chip / "remove from unit"; membership cleanup already exists (`removePlayersById`, member filtering on delete).
- **Multiple-unit membership:** **MVP = a player belongs to at most one unit** (simplest, avoids constraint conflicts). Multi-membership is V2.
- **Individual routes override unit behaviour:** an explicit per-member override wins; that member is excluded from auto-apply until re-included.
- **Passes/shots interaction:** unchanged — passes/shots reference `playerId` and are agnostic to units; a lead player can still be a passer/shooter. No special-casing in MVP.
- **Units across phases:** there are no phases today; the unit applies to the single route timeline. (Phases are out of scope; see Not Recommended.)
- **Conflicting constraints:** not possible in MVP (single membership, no solver). In V2, last-explicit-edit wins and the solver clamps within limits.
- **Undo/reset:** Apply is a discrete action; **Unlink** and per-member **override** are reversible; `reset()` returns tokens to set-start as today. An explicit undo stack is out of scope for MVP.
- **Phone/tablet:** link lines are cheap to draw; member selection uses existing chips (touch-friendly); no per-frame solver in MVP means no mobile perf risk. Group live-drag (if added) must respect single-pointer drag on phones.

---

## 8. Technical feasibility & difficulty (Phase 7)

Ranges, not false precision; one experienced engineer familiar with this codebase.

### 8.1 MVP (Model B + link lines) — **Moderate**
- **Schema:** extend `TacticalUnit` → `{ id, name, memberIds, leaderId?, memberOffsets?, unitShape?, showLinks? }`. Additive + version-guarded loader (existing scenarios have `units?` optional already). **Migration:** trivial — old units load with `leaderId` undefined; treat first member as lead. **Low risk.**
- **Files/systems touched:** `tacticalUnitTypes.ts` (type), `tacticalUnitHelpers.ts` (`buildMemberRoutes` reads stored leader/offsets), `TacticalPlaySurface.tsx` (panel UX, lead selection, override flagging, apply), `tacticalPlayStorage.ts` (persist new fields), a **new link-line renderer** in the PixiJS layer (`movement-board/…` — a new overlay reading unit membership + token positions).
- **Playback-engine changes:** **none required** (pre-baked routes). This is the key de-risking choice.
- **Renderer changes:** one new overlay (lines between member tokens; lead badge). Moderate.
- **UI changes:** evolve the existing panel; add lead-select and override affordances.
- **Test burden:** moderate — offset maths (extend existing helper tests), schema round-trip, override exclusion, render smoke tests.
- **Regression risk:** **low–moderate** — additive; the main risk is the renderer overlay and the save-schema change. Contained.
- **Perf risk (phone/tablet):** low (static lines; no solver).
- **Estimate:** **prototype 2–4 days; production-ready MVP ~1.5–3 weeks.**

### 8.2 V2 (offset editing UI, presets, live group drag, transition chains) — **High**
- Editable per-member offsets UI; behaviour presets (Model D) generating routes; **live group drag** in `createMovementCanvasShell.ts` (multi-token delta move — a real engine change); transition chains via `triggeredBy`.
- **Estimate:** **~3–6 weeks** on top of MVP, depending on preset count and whether live drag ships.

### 8.3 V2+ (shape-preserving constraints, ball-relative shifting) — **Very high**
- Constraint solver in drag + playback; ball-anchored zonal shift; per-frame solving.
- **Regression/perf risk:** high; **testability:** poor (emergent behaviour). Only pursue with explicit product appetite.
- **Estimate:** **several weeks**, plus significant QA; recommend a spike before committing.

### 8.4 Architecture verdict
The current architecture supports the **MVP cleanly** because it can be **pre-baked into existing routes** — no coupling into the orchestrator, no new timeline concept. The dangerous coupling only appears at **V2+** (live runtime constraints touching both drag and playback). Keeping the MVP author-time is what keeps this safe.

---

## 9. Current "Move as 1" recommendation (Phase 9)

**Evolve it into Linked Units — do not retire, do not leave unchanged.**

- **Do not remove or rewrite it in this audit** (as instructed).
- The existing `TacticalUnit`/`units[]`/`buildMemberRoutes` are the **seed** of the MVP; the MVP is a superset. Retiring would waste working, persisted infrastructure.
- **Rename** the coach-facing label from **"Move as 1" → "Linked Units"** when the MVP ships (the current name over-promises unison and mislabels the behaviour). During transition, "Move as 1" may remain as a secondary hint.
- **Backwards compatibility:** existing saved scenarios with bare `{id,name,memberIds}` units must keep loading — guaranteed by additive, optional fields and a default-lead fallback.

---

## 10. MVP / V2 boundaries (Phase 8)

### PáircVision Linked Units — Recommended MVP
- **Home:** **Tactical Play** (evolve "Move as 1").
- **Coach workflow:** Section 7.2 (select 2–5 → Link Players → set lead → draw lead route → Apply → override as needed → Play).
- **Supported unit size:** 2–5 players.
- **Supported shapes (visual link only):** Line, Triangle, Box, Diamond, Custom. Shape governs *link-line drawing*, not a solver.
- **Supported movement behaviour:** **leader/follower offset translation** — slide, drop, squeeze, expand-by-moving-lead. (Model B.) Movement is **pre-baked into routes**; playback unchanged.
- **Visual link style:** thin, semi-transparent **link lines** joining members (rope/string metaphor), a distinct **lead badge**, and an **overridden-member flag**. Lines visible during playback (toggle). Colours must respect the locked Visual Language (no new page-specific overrides; reuse neutral link styling).
- **Storage model:** extended `TacticalUnit` (`leaderId?`, `memberOffsets?`, `unitShape?`, `showLinks?`) persisted in the existing `units[]` slot; fully backward compatible.
- **Playback rules:** members follow pre-baked offset routes; explicit per-member overrides win; passes/shots unaffected.
- **Override rules:** any member can be individually routed/dragged; doing so flags it and excludes it from the next Apply until re-included.
- **Deliberately excluded from MVP:** shape compression/rotation (solver), ball-relative shifting, behaviour presets, live runtime follow, live group drag, multi-unit membership, phases/keyframes, Slate integration.
- **Why it delivers Gaelic value:** it directly authors the top-ranked use cases — **kickout/puckout press units, full-back line drops retaining width, press-with-cover, and line slides** — as genuine, visible, editable relationships, which today's Move as 1 cannot express (no link, no lead, no persistence of the relationship). It is honestly better, and it is buildable in weeks.

### V2 (only after MVP is stable)
- Editable per-member offsets UI.
- Behaviour presets (Slide/Drop/Squeeze/Expand/Maintain Width) — Model D, unambiguous presets only.
- Automatic cover-behind and ball-relative shifting (with tight limits).
- Shape compression/rotation within documented bounds — Model C.
- Live group drag and live runtime follow.
- Transition press→cover→block chains via `triggeredBy`.
- Slate static-grouping reuse of the shared model.

### Not recommended (impressive but risky/misleading)
- Full physics/spring simulation of unit shape.
- AI/auto-tactics that decide how a unit *should* react to the ball.
- Per-frame constraint solving on mobile as a default.
- A full keyframe timeline rebuild solely to serve units.
- Anything that makes the app appear to "understand" tactics it cannot reliably reproduce.

---

## 11. Proposed implementation phases

1. **Phase 0 — Prototype (2–4 days):** extend `TacticalUnit` + `buildMemberRoutes` for stored lead/offsets; add a throwaway link-line overlay; validate the authoring feel on one use case (kickout press unit).
2. **Phase 1 — MVP (1.5–3 weeks):** production link-line renderer, lead selection, override flagging, schema persistence + migration guard, tests, rename to "Linked Units".
3. **Phase 2 — V2a (2–4 weeks):** editable offsets UI + first unambiguous behaviour presets.
4. **Phase 3 — V2b (spike first):** live group drag / transition chains; evaluate shape solver appetite.
5. **Phase 4 — Slate reuse:** static grouping + link lines in Tactical Slate on the shared model.

---

## 12. Open questions for the product owner

1. **Launch timing:** is Linked Units a pre-launch differentiator, or a post-launch V1.1? (Affects whether Phase 1 is prioritised now.)
2. **Rename appetite:** are you comfortable renaming "Move as 1" → "Linked Units" at ship, or must "Move as 1" persist as the primary label?
3. **Unit size cap:** is 2–5 the right ceiling, or do kickout structures need 6+?
4. **Link-lines-during-playback default:** on or off by default?
5. **Slate priority:** is static Slate grouping wanted soon, or genuinely later?
6. **Preset appetite (V2):** how much "the engine moves players for you" is acceptable before it feels like the app is overclaiming?
7. **Hurling specifics:** do puckout press structures differ enough from kickout structures to need distinct preset defaults?

---

## 13. Risks

- **Over-promising (product):** the biggest risk is repeating the Move as 1 gap — a feature that looks smarter than it is. The MVP mitigates this by being honest (offset translation + visible lines), not by faking intelligence.
- **Schema drift:** mitigated by additive, optional fields and a default-lead fallback.
- **Renderer regressions:** the one net-new subsystem (link-line overlay) needs smoke tests across orientations and context-loss restore.
- **Scope creep into V2+:** the constraint solver is where cost and unpredictability explode; keep it behind an explicit product decision.

---

## 14. Direct verdict

- **Best home:** **Shared foundation, shipped first in Tactical Play.** (Tactical Slate reuses the same model later for static grouping — a deliberate fast-follow, not a co-launch.)
- **Recommended first version:** **Linked Units MVP = Model B (stored lead + editable follower offsets) with always-available relationship "link lines", authored by drawing the lead player's route and applying offset-preserving follower routes — pre-baked into the existing route/playback engine.** An honest superset of today's "Move as 1".
- **Difficulty:** **Moderate** (MVP). High for V2 presets/live-drag; Very high for V2+ shape/AI constraints.
- **Production estimate:** **~1.5–3 weeks** for a production-ready MVP (2–4 day prototype first); V2 a further ~3–6 weeks.
- **Launch recommendation:** **Prototype before launch; ship MVP after launch.** The prototype de-risks the authoring feel cheaply; the polished MVP does not need to gate launch.
- **Why it matters:** it converts a mislabelled, invisible route-copy into a **genuine, visible, editable coaching relationship** that authors the highest-value Gaelic-games structures — **kickout/puckout press units, full-back line drops, press-with-cover, line slides** — and, per the research, **no GAA product and essentially no mainstream tactics product offers authored leader/follower constraint units on a blank board**, making it a real, defensible differentiator that is realistic to build and test.
