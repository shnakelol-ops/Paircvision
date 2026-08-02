# PáircVision — Tactical Slate: "Continue Run" Workflow & Architecture Audit

**Status:** Audit only. No branch, no code, no commit. Combines external competitive research with internal architecture grounded in the current engine (`createTacticalPadLiteSurface.ts`, post pass-timing fix).

---

## 1. How Leading Tactical Tools Handle Extending an Existing Run

Researched via public documentation, tutorials, and app listings for TacticalPad, SportDraw, and Coach Paint (sources at bottom). Worth being upfront about the limits of this: public marketing/tutorial pages describe *capabilities*, not always exact micro-interactions (e.g., precisely what happens if you drag past a path's last point). Where the evidence is direct, it's stated as fact; where it's inferred from a consistent pattern across sources, it's flagged as such.

**The dominant paradigm across all three is waypoint/keyframe-based, not freehand-stroke-based.**

- **TacticalPad** — its animation model is built on **frames** (the app explicitly organizes boards into "Static and Animated," and its own tutorials describe "how multiple frames work to create animated plays"). Player movement between frames is described as animating "realistically at path **waypoints**," with acceleration/deceleration physics applied at each waypoint and animation curves smoothing the motion between them. This is structurally the same idea as PáircVision's own Phase system for players — a run is a sequence of positions (waypoints/frames), not a single captured pen stroke.
- **SportDraw** — explicitly frame-based: "automated player movement... automatically creates linear and curved motion of players and balls **between frames**," with manual/freehand motion offered as a *supplementary* option alongside the automated frame-to-frame interpolation, not the primary authoring model.
- **Coach Paint** — a different category entirely, worth naming rather than force-fitting: it's **video telestration** software (drawing/tracking on top of real match video, cut-out tools, player tracking circles), not a from-scratch tactics-board movement authoring tool. It doesn't have an "extend a drawn run" concept in the same sense — there's no synthetic run to extend, only annotations on footage that already happened.

**Answering the checklist directly, against this evidence:**
- **Redraw the whole route?** Not the norm in a waypoint-based tool — the point of waypoints is that you don't have to.
- **Append to the end?** Yes, and it's the natural consequence of the waypoint model: a run is an ordered list of positions, and extending it is adding another position at the end.
- **Insert waypoints?** Also natural under this model, and a superset of "append" — waypoint-based authoring generally allows inserting anywhere, not only at the end.
- **Create another movement?** This is how these tools represent *temporally distinct* actions (a player stops, does something else, moves again later) — a new frame-group/segment, not an edit to the existing one. Reasoned, not directly sourced, but consistent with frame-based authoring generally.
- **Keyframes?** Confirmed as the dominant underlying model across both TacticalPad and SportDraw.

**The useful takeaway for this audit isn't "copy TacticalPad's UI"** — PáircVision's Draw Run is deliberately *not* frame/waypoint-based; it's a single freehand captured stroke (confirmed from the engine: `RoutePoint[]` is a dense point cloud sampled from a drag gesture, smoothed via Catmull-Rom in `sampleRoutePoints()`, with no discrete, individually-addressable waypoint objects today). The takeaway is that the *concept* these tools converge on — a run is fundamentally something you extend by continuing to add to it, not something you re-author from scratch — maps cleanly onto "append," which (per §3) is also the cheapest, most natural operation given how PáircVision's routes are actually stored.

---

## 2. How Should PáircVision Feel?

Recommend a variant closer to the first sketch, refined against how route selection already works today:

**Recommended: tap the player who already has a run → a small choice appears → drag to keep drawing.**

Not "tap the end point." Here's why, grounded in the current engine rather than general UX taste: route commitment today already tolerates the coach's continuation drag starting *anywhere*, not precisely at a token or a prior point — selecting a player is a discrete tap (`selectedPlayerId`), and the actual drawing drag is a *separate* gesture that can begin wherever the coach's finger lands. Requiring a coach to land a second tap exactly on a small existing line's endpoint, on a phone, to resume it, reintroduces the kind of precision-dependent interaction the whole Draw Run gesture was built to avoid. It also risks a real failure mode: a slightly-missed tap starts drawing from the wrong point instead of continuing, with no obvious error state — a bad failure to hand a coach mid-session.

**Better shape: reuse the interaction pattern already shipped and proven.** The Before/During/After pass-timing prompt already established a working pattern for exactly this kind of moment — tap something that already has state, get a small compact choice, pick one, continue. Apply the same shape here: tap a player who already has a Draw Run → a compact "Continue" / "New Run" choice (mirroring the existing `hasExistingRoute` check that already exists at the route-commit gate) → dragging anywhere then appends to the existing run (Continue) or replaces it (New Run, today's current behavior, unchanged). This adds no new interaction vocabulary — the coach already knows how to tap-then-choose from the pass-timing feature, and already knows how to drag-to-draw from Draw Run itself.

---

## 3. Architecture — Append, or Separate Entries?

**These aren't actually competing answers to the same question — they're the correct answer to two different coach intents, and the previously-recommended data shape already supports both without new concepts.**

- **"Continue Run"** (this audit's subject) means: the coach is still authoring *the same continuous movement*, just doing it in more than one physical drag because of phone screen size/reach, not because the player did two different things. This should **append new points to the existing stored route**, leaving `startSegmentIndex` (the phase-start information) completely untouched — it's the same `RouteEntry`, longer.
- **"Multiple Draw Runs"** (the prior audit's subject — Phase 2 / Phase 5 / Phase 8) means the player genuinely does something else in between — three separate actions at three separate points in the sequence. That **does** need separate `RouteEntry` objects, each with its own `startSegmentIndex`, because they aren't contiguous.

Confirmed directly: **yes, Continue Run can simply append new points to the existing stored route while keeping the phase start information intact.** Under the `RouteEntry[]` shape already recommended (`{id, points, startSegmentIndex, passTiming}`), Continue Run is not a new data concept at all — it's a second, smaller operation on the same structure:

| Operation | Effect | New data concept? |
|---|---|---|
| Continue Run | `entry.points.push(...newPoints)` on the player's *most recent* entry | No — same entry, `startSegmentIndex` untouched |
| New Run (Phase 2 / 5 / 8 pattern) | push a new `RouteEntry` onto the player's array | No — the multi-run audit already scoped this |

One small rule worth stating explicitly: Continue should only ever be offered against the player's **most recently drawn** entry, not an arbitrary earlier one — otherwise "which run am I continuing" becomes ambiguous. This is a UI constraint, not a data-model one.

**Which is cleaner?** Neither option "wins" because they're not alternatives — Option A (separate entries) is correct for temporally distinct movements, Option B (append) is correct for one continuous movement authored in installments. The clean architectural result is that both live in the same `RouteEntry[]` structure as two different, small, well-scoped operations, rather than needing two different systems.

---

## 4. Product Boundary — Does This Turn Slate Into Play?

No, and the reason is structural, not just intentional. Continue Run stays entirely inside Slate's existing identity — one continuous freehand stroke, constant speed (`BASIC_ROUTE_FOLLOW_SPEED`), no per-segment timing, no waypoint-level editing UI — extended in installments purely for phone-screen ergonomics, not given any new authored precision.

| | **Slate — Continue Run** | **Play — Multi-Leg Movement** |
|---|---|---|
| Unit of authorship | One continuous drawn stroke (possibly drawn across several physical drags) | Discrete, individually authored legs |
| Data shape | One flat `RoutePoint[]` array, appended to | A structured, addressable list of segments, each independently controllable |
| Timing | Implicit — constant speed, eased convergence, no per-leg duration | Explicit — Play's whole identity is precision timing per leg |
| Editability | None today beyond redraw/extend — no drag-a-single-point, no reorder | Legs are inspectable, retimeable, reorderable by design |
| Coach mental model | "Draw it, watch it" | "Walk through movement and timing" |

**The boundary is enforced by the architecture decision in §3, not just by restraint.** As long as Continue Run stays an *append to one flat point array* rather than becoming a *list of independently-controllable named legs*, it cannot structurally drift into Play's territory — there is no per-leg timing to set, no leg to select and retime, no sequencing to configure, because there are no legs, only a longer single stroke. The moment "Continue Run" were reimplemented as a list of separately-tracked, independently-editable sub-segments, *that* would be the actual line crossed into Play's model — not before.

---

## 5. Recommendation

**Tap the player who already has a Draw Run → compact Continue/New Run choice (reusing the Before/During/After prompt pattern already shipped) → drag anywhere to keep drawing → new points append to that player's most recent `RouteEntry`, phase start untouched.**

Against the five criteria:
- **Fastest on phone.** No precision tap on a small existing endpoint required — the exact failure mode a "tap the end point" design would introduce on a small screen.
- **Easiest to discover.** Same trigger condition (`hasExistingRoute`) already computed at the route-commit gate today; same choice-prompt shape already proven discoverable (though the earlier pass-timing round found a real z-index bug in that pattern — worth explicit regression coverage here, not just visual QA by inspection).
- **Simplest to implement.** No new data concept — `entry.points.push(...)` on the most-recently-drawn entry, reusing the exact `RouteEntry[]` shape and the "which entry is due to start when" machinery already scoped for multi-run support. Smaller than the multi-run change itself, since it doesn't need a new trigger-scheduling rule, only a new append path at the commit gate.
- **Easiest to teach.** Zero new gestures — drag-to-draw and tap-then-choose are both already-shipped vocabulary.
- **Least likely to confuse coaches.** One continuous idea ("this player's run got longer") stays visually and conceptually one run, rather than presenting as several — and the New Run alternative in the same prompt keeps the genuinely-separate-movement case (multi-run) discoverable from the same entry point, without conflating the two.

---

## Sources

- [TacticalPad App - App Store](https://apps.apple.com/us/app/tacticalpad/id946927077?mt=12)
- [TacticalPad Coach's Whiteboard - App Store](https://apps.apple.com/us/app/tacticalpad-coachs-whiteboard/id512949303)
- [TacticalPad - The #1 app for drawing drills, lineups and tactics](https://www.tacticalpad.com/en-us/new/index.php)
- [TacticalPad - Quick Training](https://www.tacticalpad.com/edu/formation.php)
- [TacticalPad Tutorials - Showing player path in animations (YouTube)](https://www.youtube.com/watch?v=3iUmXCYaBsE)
- [SportDraw: Animated Playbook Software](http://www.sportcode.co.rs/draw.htm)
- [SportDraw miniFootball animated playbook software](http://www.sportcode.co.rs/drawsm.htm)
- [Coach Paint – The Ultimate Video Analysis Tool for Coaches](https://www.coachpaint.com/)
- [Videoanalysis editing software: Coach Paint and KlipDraw](https://www.sportperformanceanalysis.com/articles/videoanalysis-editing-software-coach-paint-and-klipdraw/)
- [Multiple frames interface (Wikipedia, general reference for the frame-based animation concept)](https://en.wikipedia.org/wiki/Multiple_frames_interface)
