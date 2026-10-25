# PáircVision Guided Tour Audit

**Audience:** First-time Gaelic games coach  
**Method:** Application launched locally (`http://127.0.0.1:5173`). All entry routes returned HTTP 200 (`/board`, `/vision-tactics`, `/vision-tactics/slate`, `/vision-tactics/play`, `/flowstats`, `/pro-tagger`, `/vision-training`, `/vision-board`). UI flows audited from live product chrome and source surfaces.  
**Scope:** Analysis only. No onboarding code.

---

## Home (before any mode)

**First screen (`/board`):** PáircVision header · “Gaelic Games Coaching Hub” · Tools tiles · Recent Boards · “Take the Tour”.

| Tile | Goes to | Coach-facing promise |
|------|---------|----------------------|
| Vision Tactics | `/vision-tactics` | Plan, explain and teach the game |
| Vision Training | `/vision-training` | Training Hub & Player Performance |
| Match Stats | `/flowstats` | Pitch-first live capture |
| Event Stats | `/pro-tagger` | Outcome-first live capture |
| Notes | `/notes` | Organisation |

Bottom nav labels: **Home · Board · Stats · Training · Notes**. “Board” opens PáircVision Board (`/vision-board`) — the same surface as Tactical Slate.

**Existing tour:** Six modal cards (`GuidedTour`). Mentions modes by name but does not enter any pitch, highlight any control, or teach a gesture. Replay via “Take the Tour”.

**Naming to reconcile before teaching:**

| Coach hears / sees | Product chrome |
|--------------------|----------------|
| Tactical Slate | Also “PáircVision Board”, bottom nav “Board”, hub CTA “Open Slate →” |
| Tactical Play | Under “Vision Tactics”; Share bubble hides Save/Load |
| Training Tracker | Home says “Vision Training”; tour says “Training Tracker & Notes” |
| Event Stats | Code/docs still “Pro Tagger” |

---

## 1. Tactical Slate

**Routes:** `/vision-tactics` → card **Tactical Slate** → `/vision-tactics/slate`  
Also: bottom nav **Board**, `/vision-board`, legacy redirects (`/quickboard`, `/whiteboard`, …).

### First screen

- Full stadium pitch (not a blank canvas).
- Default: Move tool; menus closed; **1 Team A + 1 Team B** token (not a 15).
- Bubbles: **☰ Tools**, **Ctrl**, **⋯**, **Phases: 0**.
- Orientation: portrait editable in tactical mode (no rotate gate).
- Possible interrupt: “Recovered unsaved board — Resume / Discard”.
- Chrome title says **PáircVision Board**; hub card says **Tactical Slate**.

### Every major action

| Surface | Actions |
|---------|---------|
| **☰ Tools** | Tabs **Draw · Teams · Items · Board**. Draw: Move, Label, Line/Arrow/Pen variants, zones, Eraser, colours. Teams: 1–15, Fill 15, Clear All (A/B). Items: Free Ball, cones/poles/goals/mannequins…, Clear Items. Board: New Board, Clear Drawings, Reset Board, Home, Menu. |
| **Ctrl** | Move · Route · Ball · Routes n/6 · Play / Play Routes · Set Start · Add Phase · Pause · Undo Phase · Reset · Clear Routes · speed |
| **⋯** | Player Tokens · Share Board · My Boards · Coaching Slideshow · New Board · Home |
| **Share Board** | Snapshot · Record / Voice Record · Stop · Share / Save / Discard clip |
| **My Boards** | Save Current · Open · Rename · Copy · Delete |
| **Coaching Slideshow** | Add Picture Slide · Save Current Slide · Generate Slideshow · Share |
| **Player kit** (double-tap) | Base · Pattern · Label |

### Minimum sequences

**Static shape (verbal teach)**  
Tools → Teams → Fill 15 → drag tokens → optional Draw Arrow/Label. Speak over board.

**Kickout with routes**  
Place players → Ctrl → Ball → type/size → Route → draw path(s) → Play Routes → Pause/Reset.

**Save & reopen**  
⋯ → My Boards → Save Current. Later: My Boards → Open, or Home Recent Boards.

**Share image/clip**  
⋯ → Share Board → Snapshot, or Record → Stop → Share/Save.

### Confusing UI

- Three hubs (**Tools / Ctrl / ⋯**) with Save buried under ⋯ → My Boards.
- Product name split: Slate vs PáircVision Board vs Board.
- Draw labels differ by layout (Line/Arrow vs Plain/Straight).
- Share toast pushes phone screen recorder while in-app Record exists.
- `/whiteboard` lands on the same tactical board — no separate whiteboard mode in current routing.
- Phases chip is display-only; phase editing lives in Ctrl.

### Best onboarding pause points

1. After Fill 15 + one drag — “the board is yours”.
2. After one Draw stroke — annotation clicks.
3. After one Route + Play Routes — movement story lands.
4. After Save Current — persistence lands.  
Stop before Record / Slideshow / token styles on first pass.

### Buttons to highlight

1. **☰ Tools** → **Teams** → **Fill 15**  
2. **Draw** → Arrow/Straight  
3. **Ctrl** → **Route** → **Play Routes**  
4. **⋯** → **My Boards** → **Save Current**  
5. Optional: **Share Board** → **Snapshot**

### Where coaches get stuck

- Empty-feeling start (only two tokens).
- Cannot find Save (3 taps deep).
- Route gesture opaque (select → second interaction draws).
- Ball path is 3–4 steps; Free Ball also under Items.
- Hunting “whiteboard” and never finding a mode switch.

### Tap reduction

| Today | Leaner |
|-------|--------|
| ⋯ → My Boards → Save Current | Top-level Save |
| Ctrl → Ball → type → size | Sticky last ball + one tap |
| Tools → Teams → many numbers | First-open “Fill 15” CTA / default formation |
| New Board → background picker → Blank Pitch | Blank as default; Upload secondary |

---

## 2. Tactical Play

**Routes:** `/vision-tactics` → **Tactical Play** → `/vision-tactics/play`

### First screen (hub then play)

**Hub:** “Coaching Tools / Vision Tactics / Your tactical workspace.” Two cards — Slate (Plan & Explain) vs Play (Bring Your Vision to Life).

**Play surface:** 15 players already on pitch. Chrome: **Vision Tactics** back · status pill · **TOOLS** · **Setup** · **Share** · **▶ Play** / **Reset**. Portrait Play only appears when content exists and bottom panels are closed. No rotate gate.

### Every major action

| Surface | Actions |
|---------|---------|
| **TOOLS** | Draw Route · Ball · Set Start · +/− Player · Clear Route/All · Move as 1 · Labels · Advanced (Sequence, Zones, Items, Reset Board) · SPD |
| **Setup** | Sport · Restart/Attack/Defence/Press/Demo templates · Players · Fill Our Team · colours · nicknames |
| **Share** (panel: Share & Save) | Play name · Save · Load / Ren / Copy / Del · Record / Voice Record · **Templates — Coming Soon** |
| **Player sheet** (long-press ~420ms) | Give Ball · Draw Run · Edit/Reset Run · Run Timing · Ball · Pass / Shoot |
| **Playback** | Play · Pause · Resume · Reset / Reset Play |

### Minimum sequences

**2-player pass play**  
Long-press passer → Give Ball → Draw Run → long-press receiver → Draw Run → Pass → To Pn → Add Pass → ▶ Play (close panels first on phone).

**Save / load**  
Share → name → Save. Later: Share → Load.

**Fastest wow**  
Setup → Demo → Demo → ▶ Play.

### Confusing UI

- **Share** bubble = save/load/record, not share-only.
- Share says **Templates — Coming Soon** while Setup already has live templates + Demo.
- Primary authoring gesture is **long-press**; short tap selects/closes sheet — opposite of many coaches’ expectation.
- Portrait Play vanishes whenever TOOLS/Setup/Share/sheet is open.
- Dual draw paths: sheet **Draw Run** vs TOOLS **Draw Route**.
- **Move as 1** = units (opaque label).
- Pass without Give Ball looks like it “does nothing”.

### Best onboarding pause points

1. Hub — lock Slate vs Play.  
2. First Play paint — orient TOOLS / Setup / Share / Play; teach long-press.  
3. After first sheet open — Give Ball / Draw Run / Pass triad.  
4. After first ▶ Play (esp. “close panels on phone”).  
5. Optional: Setup → Demo → Play, then Save under Share.

### Buttons to highlight

1. **Setup → Demo → Demo** (instant success)  
2. Long-press affordance on a token  
3. **Give Ball · Draw Run · Pass**  
4. **▶ Play** (+ portrait caveat)  
5. **Share → Save / Load**  
Defer: Zones, Move as 1, Record, Advanced.

### Where coaches get stuck

- Cannot open player actions (expecting tap).
- Cannot find Play on phone (panel open).
- Demo buried; Share templates look broken.
- 15 tokens overwhelm before first simple play.
- Save not visible on main chrome.

### Tap reduction

| Today | Leaner |
|-------|--------|
| Long-press only | Short tap opens sheet (drag still moves) |
| Manual first success | One-tap Try Demo on empty board |
| Share → name → Save | Autosave draft + chrome Save |
| Give Ball then Pass | Pass flow auto-assigns ball |
| Clear down to 2 players | Keep-2 / teaching preset |

---

## 3. Match Stats

**Route:** Home **Match Stats** → `/flowstats`  
Surface: `StatsModeSurface` inside `TacticalPadLiteClean` (`initialMode="stats"`). No OrientationGate.

### First screen

Live stadium pitch + scoreboard immediately. State **PRE**. Clock **00:00**. CTA **START**. Defaults: Team A / Team B, Venue blank, attack direction editable, sport via **⋮**. Squads default blank #1–#30. **Nothing required before START.**

Home copy says “pitch-first”; actual flow is **arm outcome → (players) → tap pitch**.

### Every major action

| Surface | Actions |
|---------|---------|
| Scoreboard / clock | Edit names (PRE) · For/Opp · START → HT → 2H → FT → ACTIONS · CONTINUE when paused |
| PV logo event keyboard | GOAL/POINT/2PT/SHOT/WIDE ▼ · TURNOVER± · KICKOUT/PUCKOUT± · FREE± · Show All · Voice Notes · Review · HT Notes/FT Summary · Undo last · Cts |
| 👤 Players | Squad edit (PRE) · pick player · Subs |
| ⋮ Utility | Home · Sport · Match Targets · Notes · Save/Load Match · Restart Match |
| Review strip | Half/team/event filters · ZONES · HT/FT Snapshot · Intelligence Pack · Export PDF · Edit/Delete events |
| FT panel | Save Match · Intelligence Pack · Share Summary PNG · Resume · Reset |

### Minimum sequences

**Goal + kickout**  
START → PV logo → GOAL ▼ → Play → (player) → tap pitch → KICKOUT+ ▼ → Clean → tap pitch.

**HT report**  
HT → PV logo → HT Notes and/or Review → HT Snapshot → 2H.

**FT + PDF**  
FT → optional Save → Review → Export PDF.

**Resume**  
⋮ → Load Match → Load, or recovery banner Resume/Discard.

### Confusing UI

- “Pitch-first” vs Event Stats “outcome-first” — both choose outcome before placement; Event Stats is more honest about the steps.
- No setup gate → easy to live-tag as Team A v Team B with blank numbers.
- Default armed kind is **POINT** — first careless pitch tap can log a point.
- Same ▼ chrome means “source” for scores and “detail tag” for KO/TO/SHOT.
- Opp keyboard hides FREE± and TO±.
- HT does not auto-open notes; PDF lives in Review, not on FT ACTIONS.
- PV logo looks like branding, not the event menu; **Cts** is cryptic.

### Best onboarding pause points

1. Before START — names, attack, sport, 15 starters.  
2. After START — For/Opp + “arm → tap pitch”.  
3. First GOAL Play.  
4. First kickout + follow-up tag.  
5. HT Notes / HT Snapshot.  
6. FT Save → Export PDF.

### Buttons to highlight

**START / HT / 2H / FT** · **PV logo (Events)** · **For / Opp** · **👤** · **HT Notes** · **Review → HT Snapshot / Export PDF** · **⋮ Save/Load** · **Undo last** · recovery **Resume**.

### Where coaches get stuck

- Tagging before START or during HT (logging off).
- Accidental POINT.
- Cannot find HT report or full PDF.
- Exit only via ⋮ Home (no bottom nav on this route).
- Mid-half load needs CONTINUE.

### Tap reduction

- One-tap default “Play” for scores (skip ▼).
- Don’t force Players panel on every arm.
- Auto-open HT Notes (or snapshot) on HT.
- Put Export PDF on FT ACTIONS.
- Neutral “no kind” until chosen (kill default POINT).
- Rename Cts → Counts; label PV bubble “Events”.

---

## 4. Event Stats

**Route:** Home **Event Stats** → `/pro-tagger`  
Phases: home → setup → squads → live · saved-matches · review.

### First screen

**Event Stats** header · **Resume in-progress match** (if any) · **New Match** · **Saved Matches**. Clearer entry than Match Stats.

### Every major action

| Phase | Actions |
|-------|---------|
| Setup | Sport · Home/Away · Venue · League/Championship/Friendly/Training · Half Duration · Match Targets · **Continue → Squads** |
| Squads | Load/Save Team · colours · #N players · **1H Attacking Direction** · **Go To Game** |
| Live | ▶ Start · family tiles (Goal/Point/Wide/2PT/Shot/Kickout/Turnover/Free ±) · player picker · pitch place · HT/FT · Subs · CTS · Actions · Voice Notes |
| Breaks | HALF TIME (Event Map · Actions · START SECOND HALF) · MATCH COMPLETE (Save & Finish · Event Map) · MATCH REOPENED (RESUME MATCH) |
| Actions | Home · Save · Event Map · Share PNG · HT/FT/Full PDFs · Resume · Reset |
| Review | Event Map filters · Intelligence Pack · JSON export/import · Full/HT/FT PDFs · Edit/Delete |
| Saved | Card tap = resume live · Review · Repair locations · Delete |

### Minimum sequences

**Goal**  
New Match → Continue → Go To Game → ▶ Start → Goal → Play → player/NULL → tap pitch. (~8 taps if skipping names.)

**HT**  
HT → End Half → Event Map or Actions → HT Snapshot PDF → START SECOND HALF.

**FT + PDF**  
FT → Finish Match → Actions/Event Map → FT Snapshot or Full Review PDF → Save & Finish.

**Reopen**  
Saved Matches → card (live) or Review; mid-half needs RESUME MATCH.

### Confusing UI

- Mental clash with Match Stats (tile-first vs keyboard-on-pitch).
- Pitch appears only at step 3 of each event.
- Setup has **no Back** to Event Stats home.
- Two **Go To Game** buttons.
- Saved card tap resumes tagging, not Review.
- Tiles look live before Start but taps no-op.
- Wrong-half pitch tap silently fails until second tap (“Wrong way?”).
- Kickout OUR/THEIR K/O vs FOR/OPP naming mix.
- “Repair locations” scares first-timers.

### Best onboarding pause points

1. Event Stats home — New vs Saved; one sentence on outcome → player → pitch.  
2. Squads — attacking direction before pitch.  
3. PRE before Start — dry-run Goal→Play→NULL→pitch.  
4. First pitch tap — wrong-half rule.  
5. HT break — Event Map / HT Snapshot (value spike).  
6. FT — Save & Finish + PDF.

### Buttons to highlight

**New Match** · **Continue → Squads** · **Go To Game** · **▶ Start** · **Goal → Play** · **NULL — No player** · pitch · **HT / Event Map** · **Actions → PDF / Save** · **Save & Finish** · **Saved Matches**.

### Where coaches get stuck

- Tagging before Start.
- Reopened match without Resume.
- Wrong-way pitch.
- Long scroll to find Shot/Kickout under pressure.
- Mandatory player step even when names unknown.
- Setup dead-end without system back.
- PDF density paralysis on Review.

### Tap reduction

- Skip squads CTA from Setup.
- Sticky “Skip player” / long-press tile → pitch.
- Quick Goal (null + default zone).
- Grey tiles pre-Start with “Start first”.
- HT Snapshot primary on break screen; FT PDF beside Save & Finish.
- Explicit Continue tagging vs Review & PDF on saved cards.

---

## 5. Training Tracker (Vision Training)

**Route:** Home **Vision Training** / nav **Training** → `/vision-training`  
Tour name: **Training Tracker & Notes**. UI product name: **Vision Training**.

Two products on one hub:

1. **Training Hub** — log tonight’s session (attendance, notes, review, history).  
2. **Performance Tracker** — live player scoring / decisions / season table.

### First screen

H1 **Vision Training** · **Training Hub · Player Performance**.  
Cards: New Session · Squad Attendance · Player Notes · Session Review · History · **Open Tracker**.  
Without an active session, Attendance / Notes / Review are disabled (“Start a session first”).

### Every major action

| Area | Actions |
|------|---------|
| New Session | Title · Date · Focus · pick PPT squad **or** Create Quick Squad / Fill 15 / Save Training Squad · **Start Session** |
| Attendance | Present / Late / Injured / Absent · Session Review → · Back to Hub |
| Player Notes | Per-player observations · Save Note · Session Review → |
| Session Review | Standout / Concerns / Actions / Next Focus / General Note · **Finish Session** |
| History | Completed cards · Delete · Session Summary (read-only) |
| Performance Tracker | Setup squad · Start Session · timer PRE/1H/2H/ET · event→who taps · Ratings · Save Session to Season · Season Table |

### Minimum sequences

**Full night log**  
Vision Training → New Session → Start Session → Attendance → Back to Hub → Player Notes → Session Review → Finish Session → History.

**Shorter night**  
Start Session → Attendance → Session Review → → Finish Session. (Notes skipped.)

**Open Tracker**  
Open Tracker → Start Session → log events → optional Save Session to Season.

### Confusing UI

- Tour “Training Tracker” ≠ tile “Vision Training” ≠ nav “Training”.
- Two “Start Session” buttons (Hub vs Tracker) with separate storage.
- Two squad systems (PPT squads vs Hub training squads) — save in one does not fill the other.
- Player Notes vs app Notes vs Coach Notes naming pile-up.
- Auto path Start → Attendance → Review **skips Notes**; Notes need a hub round-trip.
- Review back goes to Attendance, not Hub.
- Tracker has no “Back to Vision Training” — only Back to Squad.
- Draft sessions invisible in History until Finish; new session orphans prior draft.
- Bottom nav Training absent on these full-page screens.

### Best onboarding pause points

1. Hub — name the two products; align with “Training Tracker” language.  
2. After Start Session lands on Attendance — defaults Present; Finish = History.  
3. First Tracker open — separate tool, separate squads/season, how to leave.  
4. After Finish Session → History — where the night lives.

### Buttons to highlight

**New Session** · **Start Session** · Attendance **Absent** · **Player Notes** (if teaching full loop) · **Finish Session** · **Open Tracker** · Tracker **Start Session** · **Save Session to Season**.

### Where coaches get stuck

- Grey cards with no pointer to New Session.
- “Where are Player Notes?” on the linear night path.
- “Where did my session go?” (not Finished).
- Squad saved in Hub but New Session still wants PPT/quick squad.
- Lost inside Tracker with no hub exit.
- Hunting bottom-nav Training while on a remounted shell.

### Tap reduction

- Linear night wizard: New → Attendance → Notes → Review → Finish.
- Continue-night CTA instead of hub round-trip for Notes.
- One shared squad store (or import between Hub and Tracker).
- Hub “Continue: {title}” when an active session exists.
- Tracker header **← Training Hub**.

---

## Cross-mode findings (onboarding design)

### Mental models that collide

| Pair | Clash |
|------|-------|
| Match Stats vs Event Stats | Both capture matches; pitch-keyboard vs tile→player→pitch; different HT/FT rituals |
| Tactical Slate vs Tactical Play | Both under Vision Tactics; Slate = static/draw; Play = animate — long-press only in Play |
| Vision Training Hub vs Performance Tracker | Same brand umbrella; unrelated sessions and squads |
| Board nav vs Vision Tactics → Slate | Two doors to the same slate |

### Highest-value first successes (recommend teaching order)

1. **Tactical Slate:** Fill 15 → drag → Save.  
2. **Tactical Play:** Setup Demo → Play (then long-press authoring).  
3. **Match Stats:** START → one GOAL → HT Snapshot.  
4. **Event Stats:** New Match → Start → Goal/Play → HT Event Map.  
5. **Training:** New Session → Attendance → Finish Session (then mention Tracker separately).

### Global pause points (good tour chapter ends)

| After… | Coach can stop and still feel successful |
|--------|------------------------------------------|
| Home Tools overview | Knows which door for which job |
| Slate Fill 15 + Save | Can teach tonight |
| Play Demo + Play button | Saw movement |
| Match Stats first GOAL | Can tag live |
| Event Stats HT Snapshot | Saw the report payoff |
| Training Finish → History | Knows the night is stored |

### Global stuck hotspots

1. Naming drift (Board / Slate / Tracker / Pro Tagger).  
2. Save discovery (always nested: ⋯ / Share / ⋮ / Actions).  
3. Gestures never labelled (Slate route draw; Play long-press; Match Stats arm-then-tap).  
4. Pre-start / mid-break logging gates (Stats modes).  
5. Exit paths (full-page modes drop bottom nav).

### Global tap reductions worth prioritising

1. Top-level **Save** affordance in every mode.  
2. Honest labels: Events (not logo), Counts (not Cts), Share & Save (not Share alone).  
3. Mode-specific first-run coachmarks at the pause points above — not another six-card modal.  
4. Unify “Training Tracker” copy with **Vision Training**.  
5. One shared explanation of Match Stats vs Event Stats at home (pitch keyboard vs outcome tiles).

---

## Appendix — Entry map

```
/board                      Home (Tools + GuidedTour)
/vision-tactics             Vision Tactics hub
/vision-tactics/slate       Tactical Slate (= PáircVision Board)
/vision-board               Same slate surface
/vision-tactics/play        Tactical Play
/flowstats                  Match Stats
/pro-tagger                 Event Stats
/vision-training            Vision Training / Training Tracker hub
/vision-training/performance  Performance Tracker
/notes                      Notes
/settings                   Settings
```

## Appendix — Evidence anchors

| Mode | Primary surfaces |
|------|------------------|
| Home / tour | `src/pages/PitchFlowCoachShell.tsx`, `src/components/GuidedTour.tsx` |
| Slate | `src/pages/TacticalPadLiteClean.tsx`, `src/features/vision-tactics/VisionTacticsHub.tsx` |
| Play | `src/features/vision-tactics/TacticalPlaySurface.tsx`, `PlayerActionSheet.tsx` |
| Match Stats | `src/StatsModeSurface.tsx`, `src/main.tsx` (`/flowstats`) |
| Event Stats | `src/pro-tagger/ProTaggerPage.tsx`, Setup/Squads/Live/Review/Saved screens |
| Training | `src/vision-training/*`, `src/pages/PlayerPerformanceTracker.tsx` |

---

*End of audit. Analysis only — no onboarding implementation in this document.*
