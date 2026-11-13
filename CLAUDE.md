# PáircVision — Project Standards for Claude Code

## UX Writing Rule: Coaching Insight Attribution (LOCKED)

**Every coaching insight, callout fact, and intelligence sentence must explicitly
name the team responsible. This is a permanent standard, not a page-specific fix.**

### The Rule

Never use standalone action words — Won, Lost, Retained, Converted, Scored,
Conceded, Forced, Recovered, Controlled — without naming which team performed
that action. Every sentence must make complete sense if a coach reads only that
one line, with no surrounding context, on a phone screen in low light.

**Wrong:**
- "Won 62% of kickouts and converted 45% to scores."
- "Kickout win rate was 62%."
- "3 segments conceded."
- "Clinical turnover conversion — 40% of won turnovers became scores."
- "Tactical chain dominance — 70% of sequences resolved FOR."

**Right:**
- "Ballyboden won 62% of kickouts and converted 45% to scores."
- "Ballyboden won 62% of kickouts (13 of 21)."
- "Na Fianna controlled 3 segments."
- "Ballyboden converted 40% of won turnovers directly to scores."
- "Ballyboden won 70% of all tactical sequences (14 of 20)."

### Implementation Locations

All coaching insight strings live in exactly two files:

1. `src/stats/chains/review-prompts.ts` — `deriveReviewPrompts()`  
   The primary insight engine. Uses `home` (= homeTeam.slice(0,18)) and `away`
   as team name variables. Every push() call must begin with or contain a team name.

2. `src/stats/reviewPdfExport.ts` — Match Intelligence card (lines ~3525–3565)
   and all `facts.push(...)` callout strip calls throughout the file.
   Uses `homeTeam` and `awayTeam`. Slice to `.slice(0, 14)` for compact strips.

### Pronouns Policy

"Our" and "Their" are acceptable shorthand ONLY inside pages whose header already
names the team (e.g., the "Our Shot Profile" page). In all other contexts —
intelligence panels, callout strips, standalone insights — use the team name.

### Future Coaching Insights

Any new insight string, callout fact, or intelligence sentence added anywhere in
the codebase must follow this rule before merging. When in doubt: name the team.

---

## Visual Language (LOCKED)

Shot outcome colours — apply identically to PDF, HT/FT snapshots, live canvas:

| Outcome         | Colour         | Hex       |
|-----------------|----------------|-----------|
| Goal            | Dark green      | `#16a34a` |
| Point           | Light green     | `#4ade80` |
| Two Pointer     | Gold            | `#fbbf24` |
| Wide / miss     | Red X           | `#ef4444` |
| Blocked / saved | Grey            | `#94a3b8` |
| Free Scored     | Light green     | `#4ade80` |
| Free Missed     | Red             | `#ef4444` |

Zone overlays: Green = our scoring hotspot · Red = opposition danger · Amber = watch.

Event families: Restart Won = cyan `#22d3ee` · Restart Lost = pink `#fb7185`
· Turnover Won = purple `#a78bfa` · Turnover Lost = orange `#f97316`.

These colours are canonical. Do not introduce page-specific overrides.

### Approved exception — Event Stats Scoring Map markers (LOCKED)

The Match Analysis **Scoring Map** (pitch, legend, Scoring Shots / Missed
panels and its exported PNG — `src/pro-tagger/dashboard/matchMapRenderer.ts`)
uses its own approved marker set. It applies to the Scoring Map only; PDFs,
HT/FT snapshots, the live canvas and all other surfaces keep the table above.

| Outcome         | Scoring Map marker                                    |
|-----------------|-------------------------------------------------------|
| Goal            | Orange `#F28C28` regular hexagon (vertices top/bottom), same footprint as a Point |
| Point           | Light green `#4ade80` circle                          |
| Two Pointer     | Bright yellow `#FFDF00` circle                        |
| Wide            | Red `#ef4444` X                                       |
| Dropped short   | Wine `#641E39` circle with a white downward arrow     |
| Hit the post    | Grey `#94a3b8` ring with a centre dot                 |
| Blocked / saved | Grey `#94a3b8` filled circle                          |

Shot markers use `SHOT_MARKER_R` with the thin dark outline `#0b1428`.
Do not change these without explicit design approval.

---

## Terminology (LOCKED)

| Use this           | Not this              |
|--------------------|-----------------------|
| Placed Scored      | Free Scored           |
| Placed Missed      | Free Missed           |
| Placed Balls       | Attempts (for frees)  |
| Possession frees   | Frees won (for stats) |
| Kickouts / Puckouts | Restarts (in code, not display) |
