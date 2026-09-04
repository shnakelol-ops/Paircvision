# PáircVision — Shape Lock (Maintain Shape) Audit

**Status:** Analysis only. No production code, no schema changes, no coding PR. This document is the sole deliverable.
**Author role:** Senior product engineer + senior coach.
**Baseline:** current `main` (`929357c`, after merged PR #262).
**Scope of feature under audit:** a lightweight, **editing-only** tool in **Tactical Slate** that lets a coach drag one player and have a chosen group keep their current relative spacing — purely to build phases faster. **Not football AI. Not tactical intelligence.**

---

## 1. Executive Summary

**Verdict: build it. It is small, safe, genuinely useful, and it fits the current Tactical Slate architecture almost perfectly.**

The premise of this audit turns out to be even more favourable than assumed. Tactical Slate stores each phase as a **complete snapshot of every player's position** (a keyframe model), and playback simply interpolates between consecutive snapshots. Player positions live in a single mutable array; dragging mutates one player's `current` position and nothing else. This means a "keep the shape while I drag" tool is a **pure authoring-time behaviour that never touches playback, never changes the save format, and never needs to persist anything**.

Concretely, Shape Lock can be exactly what the brief hoped:
- a **transient member list** (a set of selected player ids, held only while editing),
- **relative offsets captured at drag-start** (no stored schema),
- **temporary guide lines** (reusing the drag-guide rendering that already exists),
- **linked dragging during editing only**,
- **with zero playback changes and effectively zero schema changes.**

It touches essentially **one engine file** (`createTacticalPadLiteSurface.ts`) plus the Slate page UI (`TacticalPadLiteClean.tsx`). Regression surface is tiny because the change is additive and confined to the drag path in edit mode.

As a coach: yes, this saves real time. The specific, repeated pain — nudging a 6–8 player press or defensive block forward/across between phases while keeping spacing — is exactly what it fixes, and that is one of the most common things a coach does when authoring phases. It does **not** help (nor should it) when players genuinely need to change spacing; there, individual drags remain, which is correct.

**Should it replace the earlier Tactical Play "Linked Units" proposal?** For a launch-era feature, **prefer Shape Lock**. It is a fraction of the cost and risk, delivers a concrete authoring win, and is the honest "editing-only, drag-one-others-follow" core that the Linked Units audit itself identified as the cheap heart of the idea. They are not the same feature (different product, different model — see §9), so "replace" is the wrong word, but as the thing to ship first, Shape Lock wins clearly.

---

## 2. Existing Architecture (Audit Question 1)

### 2.1 Where Tactical Slate lives
- Coach-facing **Tactical Slate** → route `/vision-tactics/slate` → `src/pages/TacticalPadLiteClean.tsx` (React shell/UI).
- Rendering + interaction engine → `src/engine/pixi/createTacticalPadLiteSurface.ts` (PixiJS imperative surface).

> Correction to the prior Linked Units audit: that document described Tactical Slate as a "static coaching whiteboard with no animation". That was **incomplete**. Slate **does** support phases and animated playback via `createTacticalPadLiteSurface` — it simply uses a **different movement model** from Tactical Play (snapshots vs per-player routes). This audit supersedes that characterisation.

### 2.2 How phases store player positions — a keyframe/snapshot model
A phase is a full snapshot of all positions:

```ts
// createTacticalPadLiteSurface.ts
type PhaseSnapshot = {
  players: NormalizedPoint[];          // positions, indexed by player order (0–100 world)
  football: PhaseBallSnapshot[];
};
```

Capture reads each live player's current position:

```ts
function captureCurrentSnapshot(): PhaseSnapshot {
  return {
    players: players.map((p) => ({ x: p.current.x, y: p.current.y })),
    football: /* ball snapshots */,
  };
}

addPhase: () => {
  // …release drag, cancel playback…
  phases = [...phases, captureCurrentSnapshot()];   // append a snapshot
  options.onPhaseCountChange?.(phases.length);
}
```

Playback (`startPlayback(path: PhaseSnapshot[])`) interpolates **between** these stored snapshots. **The crucial consequence: the coach's authoring gestures only ever change live player positions; a phase is just a photograph of those positions at "Add Phase". Anything that helps the coach reach the desired positions faster is invisible to playback by construction.**

### 2.3 How player dragging works — single player, one hook
Players are held in a mutable array; each has a `current: NormalizedPoint`. There is exactly one drag mutation point:

```ts
function updateDraggedPlayerFromEvent(event) {
  if (!activeDrag || activeDrag.type !== "player" || isPlaybackInputLocked()) return;
  // …resolve pointer → normalized point…
  dragPlayer.current = { x: clamp(normalized.x), y: clamp(normalized.y) };
  setTokenWorldPositionForPoint(dragPlayer, dragPlayer.current, mapper);
  updateAttachedBallsForPlayer(dragPlayer.id);
  renderPlayerOriginGraphic();          // ← already draws a guide line while dragging
}
```

`activeDrag` is a **single** state (`{ type: "player", playerId, … }` | `{ type: "item", … }` | null). This one function is the entire seam Shape Lock needs.

### 2.4 How multi-select works today — it does not
Selection is single: `let selectedPlayerId: string | null`. There is **no** multi-select, marquee, or lasso in Slate. Shape Lock therefore has to introduce a small selection affordance (see §3/§4), but it can be minimal and editing-scoped.

### 2.5 Do relative offsets already exist? — No
No offset concept is stored on players or phases. (`ATTACHED_BALL_OFFSETS_WORLD` is unrelated — it positions the ball beside a carrier.) Offsets for Shape Lock would be computed transiently at drag-start.

### 2.6 Does grouped movement exist anywhere? — No
No grouped/linked movement exists in Slate. In Tactical Play there is the `buildMemberRoutes` helper, but it is **route-based** (it copies a leader's polyline route to members), which does not map onto Slate's snapshot model. So it is conceptually related but **not directly reusable code**.

### 2.7 Can Tactical Play code be reused?
- **Reusable in spirit:** the offset-translation idea from `buildMemberRoutes` (member = anchor + fixed offset).
- **Reusable directly:** the normalized `0–100` coordinate system and clamping (shared), and the visual pattern of the existing Slate **drag origin guide line** (`renderPlayerOriginGraphic`) for the guide-line rendering.
- **Not reusable:** Play's route model, its `TacticalUnit`/`units[]` schema, and its playback orchestrator — different product, different movement model. Shape Lock should **not** import any of it.

**Summary of §1 audit answers:** phases = position snapshots; drag = single player via one function; no multi-select; no offsets; no grouping; minimal reuse from Play (concept + coordinate system + guide-line pattern only).

---

## 3. Smallest Viable Feature (Audit Question 2)

**Yes — Shape Lock can be nothing more than: a transient member set + drag-start offsets + temporary guide lines + linked dragging in edit mode, with no playback change and no required schema change.**

Minimum mechanism:

1. **Membership (transient):** an in-surface `Set<string>` of "locked" player ids. Held only while the shape is active. It does **not** need to be saved, because it has no meaning outside editing — once positions are snapshotted into a phase, the shape has done its job.
2. **Offsets (transient):** on drag-start of any locked member, snapshot each locked member's `current` and the dragged member's `current`. During the drag, for every other locked member: `member.current = memberStart + (dragged.current - draggedStart)`. This is a **rigid translation** = "preserve current relative spacing". No stored offset schema, no solver.
3. **Guide lines (transient):** while a shape is active, draw thin lines between locked members (extend the existing origin-graphic layer). Cleared whenever the shape is deactivated or playback starts.
4. **Playback:** untouched. `captureCurrentSnapshot()` already reads final `.current` positions; it neither knows nor cares that some were moved together.

Optional, only if product wants shapes to survive save/reload for re-editing: persist the member set. This is a tiny additive field and is **explicitly not required** for the feature to deliver its value. Default recommendation: **do not persist in v1** (keeps schema untouched).

---

## 4. Proposed Editing Workflow (Audit Question 3)

Recommended flow (close to the brief, with two refinements):

```
Select players  →  Create Shape  →  Move together (linked drag)  →  Fine-tune (individual drag)  →  Add Phase (normal)  →  shape stays active for next phase  →  Break Shape when done
```

Refinements and why:

- **Select first, then Create Shape.** With no existing multi-select, the lightest path is: tap **Shape** to enter a brief "pick members" state, tap players to include them (they get a subtle ring), tap **Create Shape** to lock. This avoids building a full marquee tool. (A marquee/lasso is a nice-to-have, not required.)
- **The shape persists across Add Phase.** The single biggest time-saving is authoring *several* phases of the same block moving. So after **Add Phase**, the shape should remain active by default, ready to be nudged again for the next phase. This is the core value multiplier over the brief's linear flow.
- **Fine-tune is just normal dragging of one member.** Dragging a single locked member with a modifier/second interaction (see §6/individual override) moves only that player, leaving the rest of the shape intact.
- **"Break Shape" (not an auto "Finish Editing").** Because the shape stays active across phases, ending it is an explicit **Break Shape** (or auto-breaks on leaving edit mode / starting playback). Playback automatically hides guides and behaves exactly as today.

Why this beats the strict "Create → Move → Fine tune → Finish → resume" loop: the brief's loop implies one shape per editing session; in real phase authoring the coach builds *the same unit across multiple phases*, so keeping the shape alive between Add Phase calls is where the workload actually drops.

---

## 5. UX Mock-up

Landscape, edit mode. Everything below is transient and disappears in playback.

```
┌───────────────────────────────────────────────────────────────┐
│  [ Move ]  [ Draw ]  [ ⬚ Shape ]           Phase 2 / 3   ▷ Play │
│                                                                 │
│                 ●───────●───────●        ← guide lines (thin,   │
│                 │ 3     4      5 │          low-alpha, only      │
│                 │       ●        │          between shape members│
│                 │       6        │                              │
│                 ●───────●───────●                               │
│                 7       8      9                                 │
│                                                                 │
│   drag any one member → whole shape slides, spacing preserved   │
│                                                                 │
│  Shape active: 7 players   [ Fine-tune: hold ]   [ Break Shape ]│
└───────────────────────────────────────────────────────────────┘
```

Selection sub-state (before Create Shape):
```
[ ⬚ Shape ]  ← tap to enter “pick members”
   tap players to add (each gets a ring)     Selected: 5
   [ Create Shape ]   [ Cancel ]
```

States:
- **Inactive:** no guides, normal Slate.
- **Picking members:** rings on tapped players; Create/Cancel.
- **Shape active:** guide lines visible; dragging one → all translate; badge "Shape active: N players"; Break Shape.
- **Fine-tune:** dragging a single member moves only it (via modifier / long-press — see §6).
- **Playback:** guides hidden; identical to today.

Visual language: guide lines should be **neutral and quiet** (a thin low-alpha grey, consistent with the existing drag-origin guide colour `#94a3b8`), never the canonical event-family colours — these are editing scaffolding, not tactical meaning.

---

## 6. Individual Overrides (Audit Question 5)

**Yes — the coach can drag the whole shape and then move individual players without destroying the shape.** Because offsets are recomputed at each drag-start (not stored once), individual fine-tuning is naturally non-destructive:

- **Move whole shape:** drag any locked member → all members translate by the same delta.
- **Fine-tune one player:** drag that one member in "individual" mode → only that member's `current` changes.
- **Shape survives:** the member set is unchanged; the next whole-shape drag simply captures the new relative spacing (including the fine-tuned player's new position) at drag-start. So fine-tuning *redefines* the shape's spacing rather than breaking it — exactly the desired behaviour.

How to distinguish "move whole shape" from "move one player" without clutter:
- **Recommended:** default drag = move whole shape (that is the feature's purpose); **long-press then drag** (or a small "Fine-tune" toggle) = move one member. Long-press is already used elsewhere in the codebase for token interactions, so it is idiom-consistent and needs no extra chrome.
- Alternative: a persistent "Fine-tune" toggle in the shape bar. Slightly more visible, one extra tap per mode switch.

Either way, **no stored shape is destroyed** because the shape is a membership set plus live positions, and offsets are always derived fresh.

---

## 7. Guide Lines (Audit Question 4)

- **Do they improve editing?** Yes — they make the unit legible while nudging it and give the coach confidence that spacing is holding. They also communicate "these are linked right now".
- **Do they risk clutter?** Only if drawn as a dense mesh between all pairs. Mitigation: draw a **minimal connector** (e.g. nearest-neighbour chain or convex-hull outline of the members), not every pairwise line. For a 3-1-3 that reads as a clean outline, not a cat's cradle.
- **Do they disappear during playback?** **Yes, always.** They are edit-only scaffolding; playback must look identical to today.
- **Should they be optional?** Make them **on by default while a shape is active, with a toggle**. Some coaches will want a clean pitch even while editing.

**Cleanest UX recommendation:** on-by-default hull/chain outline in quiet grey, toggleable, auto-hidden in playback and when no shape is active. Reuse the existing `renderPlayerOriginGraphic` layer/pattern rather than adding a new rendering subsystem.

---

## 8. Scope — what must NOT be built (Audit Question 6)

Deliberately excluded, to keep this a pure authoring accelerator:
- **No football AI / tactical intelligence** of any kind.
- **No automatic pressing or positioning decisions** — the tool never suggests or guesses where players "should" go.
- **No behaviour presets** (no Slide/Drop/Squeeze/Press buttons).
- **No dynamic/auto leaders** — any member can be the one you grab; there is no privileged "leader" object.
- **No runtime constraints** — nothing runs during playback; shapes exist only in edit mode.
- **No pathfinding, no collision, no spacing solver** — spacing is preserved by rigid translation only, never optimised.
- **No shape compression/rotation/stretch** — v1 preserves current spacing exactly; changing spacing is done by fine-tuning individuals.
- **No persistence requirement** — v1 need not save shapes (optional later).
- **No spread to Tactical Play** in this scope — this is a Slate authoring tool.

The single rule: **Shape Lock moves things the coach already decided to move together. It never decides anything.**

---

## 9. Technical Feasibility (Audit Question 7)

### 9.1 Complexity — Low
The whole feature is: (a) a transient member set, (b) a drag-start offset capture, (c) a translation loop in one existing drag function, (d) a guide-line graphic, (e) a small selection UI. No new movement model, no playback work, no solver.

### 9.2 Files likely affected
- `src/engine/pixi/createTacticalPadLiteSurface.ts` — primary. Add: shape member set + API (`setShapeMembers`/`createShape`/`breakShape`), offset capture in the player-drag start, translation of members in `updateDraggedPlayerFromEvent`, a guide-line graphic (mirroring `renderPlayerOriginGraphic`), and hide-in-playback wiring.
- `src/pages/TacticalPadLiteClean.tsx` — the Slate UI: a **Shape** tool button, member-pick sub-state, "Create Shape / Break Shape" controls, guide-line toggle, optional Fine-tune toggle.
- Possibly a tiny types export for the surface handle. **No new files strictly required.**

### 9.3 Schema changes — None required
Positions are still captured per phase exactly as today. If (optionally) shapes should survive save/reload, add one additive, optional field to the board state — but v1 recommendation is **no schema change**.

### 9.4 Performance — Negligible
Translating ≤8 players and redrawing a handful of guide lines per pointer-move is trivial next to existing per-frame token rendering. No per-frame solving. No mobile risk.

### 9.5 Regression risk — Low, and contained
- The behaviour change is gated to: edit mode + move tool + an active shape + the dragged player being a member. Outside those conditions the drag path is byte-for-byte today's behaviour.
- Main things to watch: (1) drag-threshold / long-press interaction not clashing with the fine-tune modifier; (2) guide-line layer cleared on playback start, phase reset, orientation change, and WebGL context-loss restore; (3) member set kept consistent when a player is deleted.

### 9.6 Testing required
- Unit: offset math (drag delta applied equally; clamped at pitch bounds), member-set add/remove, delete-player cleanup.
- Behavioural: whole-shape drag preserves spacing; fine-tune moves one and redefines spacing on next group drag; `captureCurrentSnapshot` output identical whether positions were reached via shape or manual drags (proves playback parity).
- Rendering smoke: guides hidden in playback, cleared on reset/orientation/context-loss.
- Mobile: single-pointer long-press vs group drag on touch.

---

## 10. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Guide-line clutter | Low | Hull/chain outline, quiet colour, toggle, edit-only |
| Group-drag vs fine-tune ambiguity on touch | Medium | Long-press for fine-tune (existing idiom) or explicit toggle |
| Guides not cleared on playback/reset/context-loss | Medium | Explicit teardown in each transition; smoke tests |
| Scope creep toward presets/solver | Medium | §8 exclusions are firm; v1 is translation-only |
| Player deletion desyncs member set | Low | Prune member set on delete (pattern already exists in codebase) |
| Coaches expect spacing to auto-adapt (compress/rotate) | Low | Set expectation: v1 preserves spacing; changing spacing = fine-tune |

There is no playback risk and no save-format risk, which removes the two categories that usually make this kind of feature dangerous.

---

## 11. Estimated Effort

One experienced engineer familiar with this codebase:

- **Prototype** (translate-on-drag + crude guides, no polish): **1–2 days.**
- **Production v1** (selection UX, hull/chain guides, toggle, fine-tune modifier, teardown wiring, tests): **~4–7 working days (≈1–1.5 weeks).**
- **Optional persistence of shapes** (if product wants shapes to survive reload): **+1–2 days.**

This is materially smaller than the Tactical Play "Linked Units" MVP (estimated ~1.5–3 weeks) because there is no schema migration, no new renderer subsystem beyond a guide graphic, and no playback engine work.

---

## 12. Recommendation

**Build Shape Lock as an editing-only Tactical Slate tool, v1 = rigid-translation + guide lines, no persistence, no playback change.** Keep it ruthlessly small per §8. Ship the "shape persists across Add Phase" behaviour (§4) because that is where the real workload reduction lives.

Prefer it over the Tactical Play Linked Units MVP as the **launch-era** coordinated-movement feature: lower cost, lower risk, concrete authoring win, and it is the honest core both audits converge on. Revisit the richer Play-side Linked Units (routes, leader/follower over time) as a **post-launch** investment if demand appears.

---

## 13. Final Verdict (Audit Question 8 + the five closing questions)

**Is this worth building?** Yes. It is a rare high-value / low-cost / low-risk feature, and the architecture is already shaped for it.

**Does it genuinely reduce coach workload?** Yes, meaningfully — for the exact, repeated task of nudging a 6–8 player press or block across phases while holding spacing. Today that is one drag per player per phase (7 drags × N phases, with spacing drift); Shape Lock makes it one drag per phase. It does not help when spacing must change — and it should not — but "move the block, keep the shape" is one of the most common authoring motions, so the saving is real and frequent.

**Is the current manual workflow already good enough?** For 2–3 players, yes. For 6–8 players across multiple phases, no — it is tedious and spacing drifts. The feature earns its place precisely at the scale the brief describes.

**Is it small enough for a launch-era feature?** Yes — roughly 1–1.5 weeks, one engineer, no schema/playback risk. That is a launch-appropriate size.

**Should it replace the previous Linked Units proposal?** Not "replace" — they target different products and models (Slate snapshots vs Play routes). But as the **first** thing to ship, **yes, prefer Shape Lock**: it is cheaper, safer, and is the editing-only core the Linked Units audit itself flagged as the low-cost heart of the idea. Treat Play-side Linked Units as post-launch.

**If I were building PáircVision myself, would I implement this?** **Yes — without hesitation, and before the Play-side Linked Units.** It is honest (no fake intelligence), it slots into the existing snapshot/drag model with a tiny, contained change, it removes a genuine daily annoyance in phase authoring, and it carries almost none of the risk that makes coordinated-movement features dangerous. The only discipline required is holding the line on scope (§8): translation and guide lines only — nothing that pretends to understand the game.
