# PáircVision — PDF Architecture Audit & Redesign Plan

**Status:** Audit only. No code changes. No implementation.  
**Scope:** Half-Time Snapshot · Full-Time Snapshot · Analyst Review PDF · Outcome Report Cards · Universal Outcome Engine

---

## Deliverable 1 — Current Architecture Audit

### The Three Reports

---

#### A. Half-Time Snapshot — 6 pages

**Purpose:** Sideline coaching intervention. Coach-readable in under 90 seconds.  
**Intended user:** Manager and coaching staff at half-time.  
**Data scope:** First-half events only.

| Page | Title | Type |
|------|-------|------|
| 1 | Our Shot Profile — "Where are we getting joy?" | Pitch map + annotations |
| 2 | Opposition Shot Profile — "Where are they hurting us?" | Pitch map + annotations |
| 3 | Restart Battle — comparative kickout possession | Dual pitch map |
| 4 | Turnover & Territory — territorial pressure | Pitch map + threat zones |
| 5 | Chain Pressure — ranked tactical patterns | Statistical panel |
| 6 | Tactical Match Summary — 2×2 coaching panel (Working / Danger / Swing / Watch) | Coaching card |

**Strengths:**
- Exceptional focus. One question per page.
- Vision-first design is correct: spatial before statistical.
- Chain Pressure is genuinely differentiated — not available anywhere else at half-time.
- The 2×2 Tactical Match Summary is the strongest coaching communication tool in the entire PDF ecosystem.
- The architecture is locked and stable. It works.

**Weaknesses:**
- Pages 1–4 are all pitch maps. In isolation, four consecutive pitch maps can feel visually monotonous. The callout strips and threat annotations compensate well, but this remains a risk at lower event counts (thin data makes pitch maps sparse).
- There is no score context visible on the individual pitch pages (scoreline must be known in advance or recalled from memory).

**Pages that add genuine coaching value:** All 6.  
**Pages that feel like developer/database exports:** None.  
**Duplicate content with other reports:** The HT Snapshot architecture is intentionally replicated in the FT Snapshot coaching layer (p.1–6). This is structural, not wasteful.

**Verdict:** Largely successful. No significant changes recommended.

---

#### B. Full-Time Snapshot — 12 pages

**Purpose:** Comprehensive post-match debrief combining coaching communication and analytical depth.  
**Intended user:** Manager + coaching staff, post-match.  
**Data scope:** Full-match events.

**Part 1 — Coaching Layer (p.1–6):** Identical page architecture to HT Snapshot, full-match data.

| Page | Title | Type |
|------|-------|------|
| 1 | Our Shot Profile | Pitch map |
| 2 | Opposition Shot Profile | Pitch map |
| 3 | Restart Battle | Dual pitch map |
| 4 | Turnover & Territory | Pitch map |
| 5 | Chain Pressure (FT-calibrated) | Statistical panel |
| 6 | Tactical Match Summary | Coaching card |

**Part 2 — Analytical Depth (p.7–12):**

| Page | Title | Type |
|------|-------|------|
| 7 | Turnover Punishment | Analytical panel |
| 8 | Shot Efficiency | Statistical panel |
| 9 | Attack Corridors | Channel-based pitch map |
| 10 | Restart Escape Routes | Kickout zone outcome map |
| 11 | Opposition Snapshot | Card-based profile |
| 12 | Tactical Match Story | Narrative arc |

**Strengths:**
- Part 1 is excellent and consistent with the HT Snapshot architecture.
- Tactical Match Story (p.12) is uniquely valuable — the narrative arc of the match told through segment control, momentum shifts, and key events.
- Attack Corridors (p.9) and Restart Escape Routes (p.10) provide spatial depth not available in the HT Snapshot.
- The 6+6 structure has a clear design intent: coach layer first, analysis second.

**Weaknesses:**
- **Split-audience problem.** Pages 1–6 are designed for managers (fast, spatial, coaching-message-led). Pages 7–12 are designed for analysts (statistical, comparative, data-dense). The transition at page 7 is abrupt. The FT Snapshot is trying to serve two audiences in one report.
- **Three pages are identically duplicated in the Analyst Review:** Turnover Punishment (p.7), Shot Efficiency (p.8), and Opposition Snapshot (p.11) use exactly the same page builder functions as the corresponding pages in the Analyst Review. Any coaching staff member who accesses both reports will encounter these pages twice.
- Attack Corridors (p.9) and Restart Escape Routes (p.10) belong thematically in the Analyst Review's spatial analysis chapter. Their presence in the FT Snapshot extends Part 2 beyond its coaching purpose.

**Pages that add genuine coaching value:** p.1–6, p.12 (Tactical Match Story).  
**Pages that feel analytically misplaced in a snapshot:** p.7 (Turnover Punishment), p.8 (Shot Efficiency), p.11 (Opposition Snapshot) — these are analyst-facing pages.  
**Duplicate content:**

| FT Snapshot page | Analyst Review equivalent | Status |
|---|---|---|
| p.7 Turnover Punishment | Last−8 Turnover Punishment | **IDENTICAL** — same function |
| p.8 Shot Efficiency | Last Shot & Scoring Efficiency | **IDENTICAL** — same function |
| p.11 Opposition Snapshot | Last−3 Opposition Snapshot | **IDENTICAL** — same function |

**Verdict:** Part 1 is successful. Part 2 has purpose but contains duplication and split-audience tension. Recommend tightening FT Snapshot to 8 pages: Part 1 coaching layer + Attack Corridors + Restart Escape Routes + Tactical Match Story. Remove the three analyst-only pages.

---

#### C. Analyst Review PDF — 36–50+ pages (dynamic)

**Purpose:** Full post-match analytical archive.  
**Intended user:** County analyst.  
**Data scope:** Full match, all segments, all players.

**Page structure:**

| Pages | Section | Content |
|-------|---------|---------|
| p.1 | Match Summary | Full 5-section stats table (SCORING / SHOT DETAIL / KICKOUTS / TURNOVERS / FREES) |
| p.2 | Segment Overview | Compact table — same 5 sections, condensed per-segment |
| p.3–8 | Segment Detail (×6) | One full stats table per segment (1H Early/Mid/Late, 2H Early/Mid/Late) |
| p.9+N | Player Breakdown | Per-player stats table, paginated |
| 20 pages | Tactical Pitch Maps | 1H and 2H × FOR/OPP × 5 categories (ALL, SCORES, SHOTS, KICKOUTS, TURNOVERS, FREES) |
| Last−9 | Kickout Chain Analysis | Chain-based kickout outcome analysis |
| Last−8 | Turnover Punishment Analysis | Chain-based turnover outcome analysis |
| Last−7 | Momentum & Scoring Runs | Scoring run and momentum analysis |
| Last−6 | Tactical Chain Analysis Summary | Chain rule match counts and patterns |
| Last−5 | Tactical Intelligence Summary | Card-based intelligence layer |
| Last−4 | Tactical Review Guide | Rule-based review prompts |
| Last−3 | Opposition Snapshot | Opposition profile cards |
| Last−2 | Zone Analysis | 9-zone pitch distribution |
| Last−1 | Match Swing Timeline | Temporal swing and game narrative |
| Last | Shot & Scoring Efficiency | Shot source and conversion analysis |

**Strengths:**
- The chain analysis pages (Kickout Chain Analysis, Turnover Punishment, Momentum & Scoring Runs, Tactical Chain Analysis Summary) are analytically the strongest section of any report in the ecosystem.
- Tactical Intelligence Summary distils the chain data into an executive-readable card format — strong design.
- Zone Analysis and Match Swing Timeline are genuinely differentiated from the Snapshots.
- Attack Corridors provides unique spatial insight not replicable from raw pitch maps.
- The Chain Analysis engine (`selectChainAnalysis`) is computed once and shared correctly — no redundant computation.

**Weaknesses:**

**1. Structural inversion.** The most analytically valuable pages are at the back. An analyst reading the document encounters the most database-like content first (8 pages of the same stats table, 20 raw pitch maps) before reaching the chain analysis, momentum, and intelligence pages. The document is architecturally inverted.

**2. The stats table section (p.1–8) is a database export, not an analyst document.**
- Pages 1–8 are all variations of the same 5-section stats table, filtered to progressively narrower time slices.
- The Match Summary (p.1) and Segment Overview (p.2) contain overlapping information.
- Pages 3–8 present the same table six times with no comparative context between segments, no editorial narrative, and no signal about which segments were decisive. An analyst reading them in sequence cannot immediately tell if 1H Mid was the turning point of the match.
- These pages account for ~8 pages (~20% of the document) but deliver the least analytical insight per page.

**3. The 20 tactical pitch maps are archive-quality, not workbook-quality.**
- The 20 maps are comprehensive and correctly constructed, but each is an isolated, unannotated raw event display.
- There is no relationship shown between maps. "1H Shots For" and "1H Shots Against" appear on separate pages with no comparative overlay or narrative connection.
- The Snapshot reports produce more sophisticated pitch pages (annotated with callout strips, threat analysis, contextual facts) from the same data. The raw tactical maps feel inferior to their Snapshot equivalents.
- 20 pages devoted to raw pitch maps is disproportionate: they add spatial archive value but no analytical narrative. An analyst can locate every event spatially, but cannot extract a story.

**4. Three pages duplicated with the FT Snapshot** (Turnover Punishment, Shot Efficiency, Opposition Snapshot — see table above).

**5. No chapter structure.** The document presents data in sequential blocks without structural signposting. An analyst encountering the document for the first time has no roadmap. Sections transition without explanation: stats tables → player table → pitch maps → chain pages. There is no section header, chapter marker, or navigation guidance.

**6. The Player Breakdown is a dense list, not an analyst contribution.** The player stats table (goals, points, shots, wides, turnovers, kickouts, frees per player) is accurate and complete, but the format is a registration sheet. It does not reveal player roles, comparative standing, or tactical significance. It occupies variable pages (1–5+ depending on squad size) but rarely communicates more than the Match Summary already implies.

**7. Tactical Review Guide** is a useful coaching-bridge tool but risks formulaic output if the review prompts are not sufficiently contextualised to the specific match.

**Pages that add genuine coaching/analyst value:** Chain pages (Last−9 through Last−5), Zone Analysis, Match Swing Timeline, Shot & Scoring Efficiency, Tactical Review Guide.  
**Pages that feel like developer/database exports:** Stats table pages (p.1–8), 20 raw pitch maps (partially — they have archive value but no narrative).  
**Pages that could be merged into larger sections:** The 6 segment detail pages (p.3–8) could be one comparative page. The 20 pitch maps could be 5 chapter-level quad-maps.

---

## Deliverable 2 — Problems Identified

### Critical

**P1 — Structural inversion in the Analyst Review.** The analytical backbone (chain pages, momentum, intelligence) is buried at page 30+ after 8 stats table pages and 20 pitch maps. An analyst who reads sequentially reaches the most important content last. This is the single largest structural problem in the current ecosystem.

**P2 — Three identical pages duplicated between FT Snapshot and Analyst Review.** Turnover Punishment, Shot Efficiency, and Opposition Snapshot appear twice for any user who accesses both reports. This undermines the sense that each report has a unique purpose.

**P3 — 8 pages of the same stats table (p.1–8).** The Match Summary → Segment Overview → 6 Segment Detail pages sequence presents the same 5-section table eight times with decreasing event counts. This reads as a database export, not an analyst workbook.

### Significant

**P4 — 20 raw pitch maps lack narrative.** The maps are correctly produced but add no analytical story. Each stands alone. They represent the largest page block in the document (~50% of fixed pages) but carry the lowest analytical insight per page.

**P5 — No chapter structure.** The Analyst Review has no navigational architecture. There are no section dividers, chapter headers, or table of contents. For a 36–50 page document aimed at a county analyst, this is a meaningful usability gap.

**P6 — FT Snapshot split-audience problem.** Pages 7–12 of the FT Snapshot blend analyst-facing statistics into a coaching snapshot. The report tries to serve two audiences and fully satisfies neither.

**P7 — Free outcome coverage is incomplete.** The chain engine currently tracks only FREE_WON → GOAL conversion. It does not track FREE_WON → POINT, FREE_WON → WIDE/MISSED, or FREE_CONCEDED outcomes. Frees are the most frequent structured possession event in GAA. A Free Outcomes card cannot be delivered at full quality without expanding chain rules.

### Minor

**P8 — Player Breakdown is a list, not an analysis.** The player stats table has value as an archive but adds little coaching or analytical insight in its current form.

**P9 — Kickout Restart Battle (Snapshot p.3) and raw Kickout pitch maps (Analyst Review) are covering the same territory at different quality levels.** The Snapshot version is superior. The raw maps add archive value only.

---

## Deliverable 3 — Recommended PDF Ecosystem

The ecosystem should consist of four distinct products with non-overlapping purposes:

| Product | Pages | Audience | Purpose |
|---------|-------|----------|---------|
| Half-Time Snapshot | 6 | Manager + coach | Sideline intervention in 90 seconds |
| Full-Time Snapshot | 8 | Manager + coach | Post-match coaching debrief |
| Outcome Report Cards | 3–4 standalone cards | Coaching staff | Premium single-question possession cards |
| Analyst Review | ~24–28 | County analyst | Full structured analytical workbook |

**Half-Time Snapshot** — unchanged from current architecture.

**Full-Time Snapshot** — tighten to 8 pages:
- Retain Part 1 coaching layer (p.1–6): Our Shot Profile, Opposition Shot Profile, Restart Battle, Turnover & Territory, Chain Pressure, Tactical Match Summary.
- Add from Part 2: Attack Corridors (p.7), Tactical Match Story (p.8).
- Remove: Turnover Punishment, Shot Efficiency, Opposition Snapshot (these are analyst-only pages and duplicate the Analyst Review).
- Optionally retain Restart Escape Routes as p.8 if Attack Corridors is folded into another page.

**Outcome Report Cards** — new premium product: see Deliverable 4.

**Analyst Review** — restructured into chapters: see Deliverable 5.

---

## Deliverable 4 — Outcome Report Card Architecture

### Philosophy

Each card answers one question: *What happened after an important possession event?*

Every tracked possession event resolves to one of four outcomes:

| Symbol | Outcome | Definition |
|--------|---------|------------|
| 🟢 | Score | A score (goal or point) followed within the possession window |
| 🟡 | Shot / Wide | A shot attempt followed but no score |
| 🔴 | Turnover | Possession was lost before reaching a scoring attempt |
| 🔵 | Retained | Possession was maintained within the window; no terminal outcome |

### Universal Outcome Engine — Data Model Assessment

**Kickout Outcomes** — Engine support: STRONG

The current data model directly supports this card. `KickoutChainDataset` already stores `KickoutOutcome` objects with `nextScore`, `nextShotOrScore`, and `secondsToScore` per kickout event. The four outcomes can be derived:

- 🟢 Score: `nextScore != null`
- 🟡 Shot / Wide: `nextShotOrScore != null && nextScore == null`
- 🔴 Turnover: KICKOUT_WON followed by TURNOVER_LOST within window — derivable from temporal sequence; not currently in `KickoutOutcome` struct, but inferrable from the event stream without new data entry.
- 🔵 Retained: no score, no shot, no turnover within window — inferred (absence of terminal outcome).

The 🔴 and 🔵 outcomes require one addition to the `KickoutOutcome` type: a `nextTurnover` field mirroring `nextScore`. No new live data entry is required.

**Turnover Outcomes** — Engine support: STRONG

`TurnoverChainDataset` stores `TurnoverOutcome` objects with `resultedInScore`, `resultedInShot`, and `direction`. The four outcomes can be derived:

- 🟢 Score: `resultedInScore`
- 🟡 Shot / Wide: `resultedInShot && !resultedInScore`
- 🔴 Rapid re-turnover: TURNOVER_WON followed by TURNOVER_LOST within a short window — currently a noted Phase 2 chain rule (`KICKOUT_TO_TURNOVER_LOST` / `TURNOVER_TO_TURNOVER`). Derivable without new data entry.
- 🔵 Retained: none of the above.

No new live data entry is required.

**Free Outcomes** — Engine support: MODERATE

The event model tracks FREE_WON, FREE_CONCEDED, FREE_SCORED, FREE_MISSED as distinct kinds. The four outcomes map as:

- 🟢 Score: FREE_SCORED following FREE_WON — already tracked.
- 🟡 Shot / Wide: FREE_MISSED following FREE_WON — already tracked.
- 🔴 Turnover (free taken but lost possession, or free conceded): derivable, but the chain engine currently only captures FREE_WON → GOAL. The chain rules need expansion to cover FREE_WON → FREE_SCORED (point), FREE_WON → FREE_MISSED. These are simple additions to `chain-rules.ts`.
- 🔵 Retained: free won, not yet taken or leading to open play — weak inference only.

**Two new chain rules are needed to fully power the Free Outcomes card.** No new live data entry is required.

**Possession Outcomes** — Engine support: WEAK

There is no explicit "possession sequence" concept in the event model. Possession sequences are not tracked as entities — there is no POSSESSION_START or POSSESSION_END event kind. All four outcomes would need to be inferred entirely from gaps and clusters in the temporal event stream.

This is a fundamentally different data problem from the three cards above, which all have an explicit anchor event (KICKOUT_WON, TURNOVER_WON, FREE_WON). Possession Outcomes has no anchor.

**Recommendation: Defer Possession Outcomes to Phase 2 or later.** A three-card V1 set (Kickout + Turnover + Free) is a complete and coherent product without it.

### V1 Card Set

**Card 1 — Kickout Outcomes**  
Question: *After a kickout, what happened next?*  
Layout: Dual-side (Our Kickouts / Their Kickouts), 4-outcome distribution, key callout stat, pitch zone of first possession.

**Card 2 — Turnover Outcomes**  
Question: *When we win a turnover, what do we do with it?*  
Layout: Dual-side (Our Turnovers Won / Their Turnovers Won), 4-outcome distribution, key callout stat, spatial heat of turnover locations.

**Card 3 — Free Outcomes**  
Question: *What happens after a free is awarded?*  
Layout: Dual-side (Our Frees / Their Frees), 4-outcome distribution, conversion rates, spatial distribution of free locations.

### Design Principles

- One card = one question. No multi-purpose pages.
- 4-outcome distribution is the primary visual. Must be readable in 15 seconds.
- Coach vocabulary, not analyst vocabulary. "We converted 8 of 11 kickouts into scores" not "KICKOUT_TO_SCORE: 72.7%".
- Pitch context: event origin zones shown spatially on a small pitch insert.
- For / Against comparison on the same card — coach needs both sides simultaneously.
- A4 landscape, consistent with the Snapshot visual language (dark background, gradient accent).

---

## Deliverable 5 — Analyst Report Chapter Structure

The Analyst Review should be restructured from a sequential data dump into a chapter-based workbook. The goal is to allow an analyst to navigate directly to the chapter relevant to their question.

### Recommended Chapter Structure

**Chapter 1 — Match Overview** (~2 pages)

- Match Summary: scoreline, aggregate stats table. (Currently p.1 — keep.)
- Match Swing Timeline: temporal narrative of the match — who led, when the game turned, decisive segments. (Currently Last−1; this page should open the document, not close it. It sets the analytical context for everything that follows.)

**Chapter 2 — Segment Control** (~2 pages)

- Segment Overview: compact multi-segment table. (Currently p.2 — keep but rename "Segment Control".)
- Collapse the 6 Segment Detail pages (p.3–8) into a single "Segment Comparison" page showing all 6 segments side-by-side in a condensed comparative format. The 6-page version repeats the same table structure six times with no comparative context; one comparative page delivers the same information more usefully. Net saving: 5 pages.

**Chapter 3 — Kickout Analysis** (~2 pages)

- Kickout Map: 4-quadrant view — 1H Our / 1H Their / 2H Our / 2H Their. Consolidates 4 raw pitch maps into 1 structured page. (Replaces 4 of the 20 current raw maps.)
- Kickout Chain Analysis: won/lost breakdown, outcome chains, possession bar. (Currently Last−9 — move here. This is the strongest kickout analytical page; it belongs alongside the kickout maps.)

**Chapter 4 — Turnover Analysis** (~2 pages)

- Turnover Map: 4-quadrant view — 1H For / 1H Against / 2H For / 2H Against. (Consolidates 4 raw maps.)
- Turnover Punishment Analysis: outcome chains, tag breakdown, comparative. (Currently Last−8 — move here.)

**Chapter 5 — Shot Analysis** (~2 pages)

- Shot Map: 4-quadrant view — 1H For / 1H Against / 2H For / 2H Against. (Consolidates 4 raw maps.)
- Shot & Scoring Efficiency: conversion by source, 2-point profile, free conversion. (Currently Last — move here.)

**Chapter 6 — Free Kick Analysis** (~2 pages)

- Free Map: 4-quadrant view — 1H For / 1H Against / 2H For / 2H Against. (Consolidates 4 raw maps.)
- Free Outcome Summary: expanded once chain rules are updated. (Phase 2 expansion.)

**Chapter 7 — Possession Chains & Momentum** (~3 pages)

- Tactical Chain Analysis Summary: chain rule matches, for/opp comparison. (Currently Last−6 — move here.)
- Momentum & Scoring Runs: scoring run timeline, half-by-half momentum, segment control. (Currently Last−7 — move here.)
- Tactical Intelligence Summary: card-based distillation of chain and momentum data into coaching-readable intelligence. (Currently Last−5 — move here as chapter closer.)

**Chapter 8 — Spatial Analysis** (~2 pages)

- Zone Analysis: 9-zone distribution for shots, turnovers, kickouts. (Currently Last−2 — move here.)
- Attack Corridors: channel-based attack shape (left/centre/right). (Currently in FT Snapshot p.9 only — include here. This is the right home for it.)

**Chapter 9 — Player Analysis** (variable pages)

- Player Breakdown: retain current data, consider redesigning toward player cards rather than a dense stats table. The statistics are correct; the layout needs work.

**Chapter 10 — Opposition Profile** (~2 pages)

- Opposition Snapshot: card-based opposition intelligence. (Currently Last−3 — move here.)
- Opposition Pitch Maps: 1H All Events / 2H All Events for the opposition perspective. (2 of the current 20 raw maps — these two have the most archive value when placed in opposition context.)

**Chapter 11 — Tactical Reference** (~1 page)

- Tactical Review Guide: review prompts by category. Keep at the back as a reference tool.

### Page Count Summary

| Current | Proposed |
|---------|---------|
| p.1–2: Match Summary + Segment Overview | Match Overview chapter: 2 pages |
| p.3–8: 6 Segment Detail pages | Segment Control chapter: 2 pages (−4 pages) |
| p.9+N: Player Breakdown | Player Analysis chapter: N pages (unchanged) |
| 20 Tactical Pitch Maps | 5 chapter quad-map pages (−15 pages) |
| Last−9 to Last: 10 analytical pages | Distributed across chapters 3–8: same pages, better position |
| **Total: 36–50+ pages** | **Total: ~24–28 pages + variable player pages** |

**Estimated reduction: 10–20 pages. Analytical depth preserved entirely.**

---

## Deliverable 6 — Prioritised Implementation Roadmap

Ordered by impact and reversibility. Each phase is self-contained.

---

### Phase 1 — Remove Duplication (High impact, low risk)

**1a.** Remove Turnover Punishment, Shot Efficiency, and Opposition Snapshot from the FT Snapshot export function. These three pages serve the Analyst Review, not a coaching snapshot. The FT Snapshot tightens to 8 pages:  
p.1–6 Coaching Layer + p.7 Attack Corridors + p.8 Tactical Match Story.

**1b.** Move the Match Swing Timeline from the final position of the Analyst Review to p.2 (immediately after Match Summary). This single repositioning makes the document's narrative logic visible from the first page.

**1c.** Add a chapter header strip (even a single-line top banner on the first page of each section) to give the Analyst Review basic navigational structure. Does not require a new page — can be a banner on the first page of each chapter.

---

### Phase 2 — Consolidate the Stats Table Section

**2a.** Collapse the 6 Segment Detail pages (p.3–8) into a single Segment Comparison page. Design a layout that shows all 6 segments in a condensed side-by-side table with the current score differential visible for each segment. Net saving: 5 pages. The raw per-segment data remains accessible but the presentation gains comparative context.

**2b.** Evaluate whether the Segment Overview (currently p.2) remains necessary once the Segment Comparison page exists. If the Match Summary already provides the aggregate totals and the Segment Comparison shows per-segment data, the Segment Overview may be redundant.

---

### Phase 3 — Consolidate Tactical Pitch Maps

**3a.** Redesign the 20 raw tactical pitch maps into 5 chapter-level quad-map pages (2×2 layout per page):
- Kickout Maps (1H Our / 1H Their / 2H Our / 2H Their)
- Turnover Maps (1H For / 1H Against / 2H For / 2H Against)
- Shot Maps (1H For / 1H Against / 2H For / 2H Against)
- Free Maps (1H For / 1H Against / 2H For / 2H Against)
- All Events / Scores (1H All / 1H Scores / 2H All / 2H Scores)

Each quad-map page shows four related maps simultaneously, enabling the analyst to see pattern and comparison without page-turning. Net saving: 15 pages.

**3b.** Reorder the Analyst Review to place the new chapter-level maps immediately before their paired analytical page (kickout maps before Kickout Chain Analysis, turnover maps before Turnover Punishment, etc.).

---

### Phase 4 — Build Outcome Report Cards (new product)

**4a.** Expand the chain engine to support the Free Outcomes card. Add two rules to `chain-rules.ts`:
- FREE_WON → FREE_SCORED (point conversion)
- FREE_WON → FREE_MISSED (wide/missed)

These are pure data additions to the rules array — no engine changes needed.

**4b.** Add `nextTurnover` field to `KickoutOutcome` type and update the engine to populate it. This enables the 🔴 Turnover outcome on the Kickout Outcomes card.

**4c.** Build the three V1 Outcome Report Cards as a standalone export function (`exportOutcomeCards()`). Each card is a single A4 landscape page following the Snapshot visual language. The export produces a 3-page PDF.

---

### Phase 5 — Player Analysis Redesign

**5a.** Redesign the Player Breakdown from a dense tabular list to a player card layout. Each card shows 4–6 key metrics for one player in a visually scannable format. Group cards by FOR / OPP. This is a purely presentational change — the underlying data is unchanged.

---

### Phase 6 — Possession Outcomes (deferred)

**6a.** Evaluate whether a possession-sequence tracking concept (POSSESSION_START / POSSESSION_END or equivalent) can be added to the live data entry model without creating recorder burden. This is a data model question, not a PDF question.

**6b.** If feasible, add Card 4 (Possession Outcomes) to the Outcome Report Cards export.

---

## Summary

The PáircVision PDF statistical engine is strong. The event model is correctly structured, the chain analysis architecture is sound, and the visual language of the Snapshot reports is clear and coach-appropriate.

The architectural problems are structural, not statistical:

1. The Analyst Review is inverted — most valuable content is at the back.
2. Duplication between the FT Snapshot and Analyst Review dilutes both products.
3. 28 of the Analyst Review's pages (stats tables + raw pitch maps) are archive-quality, not workbook-quality.
4. There is no chapter structure to guide an analyst through the document.

The Outcome Report Cards are a coherent new product concept. The event model already supports three of the four cards without new data entry. The fourth (Possession Outcomes) requires a data model extension and should be deferred.

The recommended end state is a four-product ecosystem where each report has a single, non-overlapping purpose: coaching intervention (HT Snapshot), coaching debrief (FT Snapshot), possession event deep-dives (Outcome Report Cards), and full analytical archive (restructured Analyst Review).
