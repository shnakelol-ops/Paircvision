# PáircVision — Phase 2 — Current-Rules Game Structure Audit

**Type:** Research only. This document contains no production code, UI, sessions, drills, Tactical Slate work or Game Understanding framework. It creates no PáircVision principles of play.

**Read first:** [Phase 2 Game Understanding Landscape Audit](./phase2-game-understanding-landscape.md) · [Phase 1 Final Synthesis](./phase1-final-synthesis.md).

**Status:** Phase 2, second document, September 2026.
- Question: *what game are we actually trying to help coaches coach in 2026?*
- Scope: men's Gaelic football (GAA) under the rules in force from 1 January 2026.
- LGFA and underage variants are noted where they differ (§1.4). They are not mapped here.
- Phase 1 is **not reopened**.

> ### ⚠️ ACCESS AND EVIDENCE CAVEAT
>
> 1. **The official current rule texts could not be opened.** The network proxy blocked every gaa.ie and learning.gaa.ie URL, including:
>    - the GAA Rule Book (April 2026);
>    - the March 2026 *Guidance on the Application of Football Rules*;
>    - the July 2026 *Rules Questions* document;
>    - the FRC FAQ;
>    - every Games Intelligence Unit (GIU) PDF.
>
>    Every rule below is **triangulated from search-index renderings of official GAA documents plus independent reports**. Where the renderings agree, the rule is marked **TRIANGULATED**. Where they conflict, it is marked **UNRESOLVED**. **Nothing is marked VERIFIED**, because no official text was read in full.
> 2. **Almost all evidence of what the new rules did comes from one source family:** the GAA's own **Games Intelligence Unit**, which works for the Football Review Committee (FRC), and the FRC's own reports.
>    - Newspaper reports repeating GIU figures are **not independent confirmation**.
>    - The GIU is also the body evaluating its own committee's rules.
> 3. **No peer-reviewed study of the post-2025 men's game was found.**
> 4. Several reported statistics **conflict with each other**. The conflicts are shown, not resolved.
> 5. **Nothing in this document is causal.** Rule logic is labelled **RULE LOGIC**, not evidence.

**Labels used:**
- **SUPPORTED:** a current (2025–26) measurement exists, even if it is single-source.
- **PLAUSIBLE:** follows from verified rule logic plus older evidence or credible analysis, but not measured under current rules.
- **UNKNOWN**
- Evidence-type tags: **RULE EFFECT OBSERVED** / **TACTICAL INTERPRETATION** / **COACH/PUNDIT OPINION** / **RULE LOGIC**.

---

## 0. Headline findings

1. **The 2026 game is a different game from the one most Gaelic research describes.** Two rule-created structures reshape nearly every moment:
   - the **4v3 half-structure**: at least 3 outfield players must stay in the opposition half, and at least 4 players (which may include the goalkeeper) in the own half;
   - the **40 m arc**, which sets both the kickout minimum and the two-point boundary.
2. **The largest measured change is at the kickout** (GIU, 2025 league):
   - short kickouts fell from ~51 % to ~21 %;
   - contested kickouts rose from ~26–36 % to ~61–68 %.

   "Contest for possession" was proposed by Mangan et al. as a fifth moment when it was a minority event. It is now the **majority kickout outcome**. This is SUPPORTED, but from a single source.
3. **Handpassing did not fall as intended**, at least early in 2025 (the handpass:kickpass ratio stayed at ~3.2–3.4). The FRC itself suggests solo-and-go may be one reason. Later figures conflict.
4. **Scorelines rose sharply** (reported ~34 → ~46 points per championship game). Shot and score *counts* also rose in the 2025 championship, but not in early league data. The sources conflict on when and how much.
5. **The goalkeeper-as-extra-attacker was curtailed mid-2025.** Passes to goalkeepers fell from ~20–26 per game to ~1.4 after the 4v3 amendment (GIU, league). **The goalkeeper pass-back rule is TRIANGULATED, not verified:** a goalkeeper may receive from a teammate only if both are inside the large rectangle, or if the goalkeeper is in the opposition half. One discordant rendering remains.
6. **The rules now create the pitch geography.** Halfway, the 13 m / 20 m / 45 m lines, the 40 m arc and the large rectangle each switch specific rules on or off. Field zones for Game Understanding need not be invented; the rulebook already defines the meaningful ones.
7. **Underage players may play a different game.**
   - Go Games (U12 and younger) are not required to use the new rules.
   - At least one county applies only *some* FRC rules at U13 (solo-and-go, the new throw-in, two points outside the arc excluding 45s).

   **The "reference game" and the game a PáircVision coach's players actually play may differ by age and county.**
8. **Recurring problems are better described by game state plus rule-created relationships than by single principles.**
   - The same word ("support") names different player problems after a kickout, a turnover, own-half pressure, settled attack and scoring-zone possession (§26).
   - This is a hypothesis about structure, not a verdict about learning (§21).
9. **The evidence base is being made obsolete faster than researchers can replace it.**
   - Every peer-reviewed kickout finding describes a restart that no longer exists in the men's game.
   - Most possession-origin findings need re-testing.

---

## 1. Current rulebook — verification

### 1.1 Method

- **Official primary texts** were identified, but none could be opened:
  - Rule Book April 2026;
  - Guidance Document March 2026;
  - Rules Questions July 2026;
  - FRC FAQ.
- **Triangulation:** search-index renderings of those official texts, plus official GAA articles, plus county-board summaries (Laois, Leitrim, Dublin), plus national media (RTÉ, Irish Times, Irish Examiner, Irish News).
- Media sources were **not treated as independent of the GAA**, since they report GAA/FRC material. They were used to detect **disagreements between renderings**.

### 1.2 Rule table

| Rule | Current meaning (triangulated) | Source(s) | Access | Tactical possibility changed (interpretation, separated) |
|---|---|---|---|---|
| **Half-structure ("3v3" → "4v3")** | At least **3 outfield players in the opposition half** at all times. At least **4 players in the own half, which may include the goalkeeper**. If the goalkeeper goes into the opposition half, four teammates must stay back. Teams reduced in numbers must still keep 3 in the opposition half. Marginal or accidental breaches are eased. Penalty: a free, reported as from the offending team's 20 m line. **Ambiguity:** one rendering applies the four-back requirement to "the team in possession". | GAA/FRC via RTÉ (Mar 2025); Irish Times (Mar 2025); club/county summaries; Special Congress (Oct 2025) adopted the rules "as amended by Central Council on 13 March" | SIO — **TRIANGULATED** (possession-only wording **UNRESOLVED**) | *Rule logic:* at most **11 players in the opposition half**; at most **11 outfield + goalkeeper (12) in the own half**. Low blocks of 14–15 are illegal. A counter-attack always has ≥3 forward targets, facing ≥3 outfield defenders + goalkeeper. |
| **Kickout** | Taken from the **20 m line**. Must travel **beyond the 40 m arc**; playing it inside the arc is a free to the opposition. This applies even if wind brings it back inside (Rules Questions 2026). All players **13 m** from the ball. Players need not be outside the 20 m line. Kicking-team players who want to receive it directly must be **outside the arc** when it is kicked. The 20-second time limit was dropped in March 2025 for referee discretion; one report instead says it was changed to 30 s (**UNRESOLVED**). | GAA explainer; Leitrim, Laois and Dublin summaries; Rules Questions 2026 (SIO); RTÉ (Mar 2025) | SIO — **TRIANGULATED** (time limit UNRESOLVED) | The short kickout inside the arc is removed. A **legal band of ~40–45 m** remains between the arc and the kickout-mark line. Quick kickouts remain possible. The opposition may be inside the arc (13 m rule only). |
| **Kickout mark** | A clean catch of a kickout that has travelled **past the 45 m line**. The catcher may **play on immediately** and cannot be challenged within **4 m**. An illegal challenge → free advanced **50 m** (up to the opponents' 13 m line). The mark may be brought back for a **two-point free** attempt outside the arc (March 2025 amendment). | FRC amendments (Mar 2025) via Donegal Live / Irish Examiner / Leinster Leader | SIO — **TRIANGULATED** | Rewards clean fielding at 45 m+. Creates a protected play-on moment after a catch. |
| **Two-point score** | Over the bar from **play or a free** by a player with **at least one foot on or outside the 40 m arc**. "Directly" was removed (March 2025), so the ball may bounce. 2026: counts "provided no other player **from that player's team** has touched the ball", so a goalkeeper's or defender's touch no longer cancels it. Red flag. Goal = 3, point = 1; **the four-point goal was not adopted**. Whether a **45** can score two in adult football: **UNKNOWN** (the Laois U13 regulations exclude 45s). | Irish Examiner; RTÉ (Sep 2025); Balls.ie (2026 amendment); Laois 2026 | SIO — **TRIANGULATED** (45s UNKNOWN) | Space outside the arc gains scoring value. Defending teams face a two-zone scoring threat. |
| **Solo and go** | The fouled team may restart immediately with a toe-tap (solo) within **4 m** of the foul. **Any player** may take it. The ball must go **forward or lateral**, not back. **Not permitted inside the opposing 20 m line.** No challenge within 4 m; a challenge → **50 m advance**. | Dublin CCC2 summary; Irish Times (Jan 2025); club summaries | SIO — **TRIANGULATED** | Creates quick-restart moments against a disorganised defence. Stopping it illegally is heavily penalised. |
| **Advanced mark** | A clean catch **on or inside the opposition 20 m line** from a kick in play (or from a kickout mark) delivered **from on or outside the 45 m line**. The catcher may take the free (signal within ~15 s) or **play on** (can be tackled immediately); if no advantage, the free comes back. **Discordant rendering:** one summary of the July 2026 Rules Questions says "from inside the 45 m", and says an attacker **or defender** can claim it. | GAA explainer; Irish Times; Laois 2026 (SIO); Rules Questions (SIO, discordant) | SIO — **TRIANGULATED (delivery distance)**; defender-eligibility **UNRESOLVED** | Rewards long direct delivery into the scoring area. |
| **Goalkeeper pass-back** | A player may pass to their own goalkeeper **only if both are inside the large rectangle**, or if the goalkeeper is **in the opposition half**. A breaking ball *gathered* inside the rectangle may be passed to the goalkeeper. Gathered outside and carried back in, it is an infraction. A club summary adds that a kickout may not be passed straight back to the goalkeeper who took it. **Discordant rendering:** "beyond their own 65"; one 2025 description says "own half" without the rectangle exception. | Rules Questions / Guidance (SIO); Wikipedia; club summary (Carryduff); Irish Examiner (2024 dossier) | SIO — **TRIANGULATED (core rule)**; "65" variant **UNRESOLVED** | *Rule logic:* the goalkeeper cannot be used as a recycling outlet in the own half outside the rectangle. The escape-pressure problem loses a pre-2025 solution. |
| **Halfway line** | Defines the halves for the 4v3 structure and the goalkeeper pass rule. | As above | SIO | The halfway line becomes a rule-active line (previously it mattered only at the throw-in). |
| **Throw-in** | Throw-ins are 1v1; the other midfielders are positioned on the sideline. Encroaching inside the 45 m, or a sideline player entering early → free on the halfway line (2026). | RTÉ; Irish Times; GAA (Oct 2025) | SIO — **TRIANGULATED** | Changes the start-of-half contest (minor for GU). |
| **Dissent / disruptive conduct** | Frees advanced **50 m** for dissent (2025). 2026 adds "disruptive conduct"; team-official misconduct → **13 m** free (moved from 20 m). | GAA (Oct 2025) via RTÉ / Irish Times | SIO — **TRIANGULATED** | Minor for GU; affects defensive recovery after fouls (risk of a 50 m advance). |
| **Hooter (2026)** | The hooter **ends the game immediately**, except for an already-awarded penalty, free, 45 or sideline taken as a **direct, uncontested shot** (no teammate may touch it). A ball in flight when the hooter sounds counts if no other attacker touches it. | Central Council (Dec 2025) via RTÉ / HoganStand / SportsJOE | SIO — **TRIANGULATED** | Changes late-game possession value; "run the clock then shoot" becomes a timing problem. |
| **Black card / sin-bin** | Updates referenced but not detailed in accessible sources | — | **UNKNOWN** | Numbers-down situations interact with 4v3 (reduced teams still keep 3 forward). |
| **Not current (trials only)** | Ryan Cup 2026 (Expert Advisory Group): fisted-points ban, backcourt rule, three-consecutive-handpass limit. FRC suggested a youth handpass trial. The four-point goal was deferred. | RTÉ Brainstorm (2026); Irish Times (Sep 2025) | SIO | **Excluded from the reference game.** Watch. |

> **Later correction (Player Behaviour Audit 02):** the kickout-mark row above describes the March 2025 version.
>
> - In **June 2025**, Central Council voted 38–1 to **scrap the 50 m advance** for fouling a kickout-mark catcher. It was replaced by a free from where the offence occurred; the fouled player may instead take the free from the mark or a solo-and-go.
> - The 2026 permanent text is assumed to carry the June 2025 version, but this is **not verified**.
> - 2025 kickout data therefore span two mark regimes.
>
> The original row and its evidence status are otherwise preserved. See [Audit 02 §1.2](./phase2-player-behaviour-02-kickout-contest-breaking-ball.md).

### 1.3 Rule vs interpretation

The right-hand column above is **RULE LOGIC** unless a later section cites measurement. Rules make things *possible or impossible*; they do not show what teams *do*. §3 separates the two.

### 1.4 Other rule contexts (flag, not mapped)

| Context | Status | Why it matters |
|---|---|---|
| **LGFA** | Its own playing rules, approved at an LGFA Special Congress (15 April 2026), after a 12-rule trial | LGFA evidence (e.g. kickout strategy research) is not transferable without a rule check |
| **Go Games (≤U12)** | Separate formats. Adopting FRC rules at U12 is **not required**; some advocate introducing "basic and manageable" elements | A U12 coach's game may have **no 40 m arc kickout, no two-pointer, no 4v3** |
| **U13–U17 (county-dependent)** | Example (Laois 2026): U13 uses solo-and-go, the new throw-in, and two points outside the arc excluding 45s. Other FRC rules are not listed. U17 academy leagues are mainly 13-a-side. | Juvenile players may play a **hybrid** of old and new rules |
| **Club adult** | FRC rules apply (clocks and hooters required at club grounds) | Closest to the reference game |

**Finding:** "current Gaelic football" is **plural by age and county**. Any Game Understanding content must state which ruleset it assumes.

---

## 2. 2025 vs 2026 — rule timeline

| Stage | Date | What changed | Evidence era implication |
|---|---|---|---|
| FRC proposals, sandbox games | Autumn 2024 | Seven "core enhancements" trialled; solo-and-go reported as the best received | — |
| Special Congress (trial rules) | Nov 2024 | Rules adopted on a trial basis for 2025. Original **3v3**: a goalkeeper could join the attack while 3 outfield players stayed back → 12v11 | Interprovincials / early league = **original 3v3** |
| League Rounds 1–5 | Jan–Mar 2025 | Original rules | Goalkeeper-overload era (passes to goalkeeper ~19.9–25.7 per game) |
| **Central Council amendments** | 10–13 Mar 2025 | Six amendments:<br>1. **4v3** (four in the own half, may include the goalkeeper);<br>2. easing of marginal breaches;<br>3. reduced teams keep 3 forward;<br>4. kickout-mark play-on / 50 m advance / two-point free option;<br>5. advanced-mark advantage;<br>6. "directly" removed from the two-point definition.<br>The kickout time limit was also changed (30 s *or* referee discretion, **UNRESOLVED**). | Data from **Round 6 on** reflects the amended rules |
| Championship | Apr–Jul 2025 | Amended rules | GIU championship data |
| Final FRC report | Sep 2025 | Recommended making the rules permanent. Four-point goal deferred. Youth handpass trial suggested. Hooter change proposed. | — |
| **Special Congress** | 4 Oct 2025 | All 62 motions passed, permanent from **1 Jan 2026** (as amended in March). Two-point change: only a touch by the kicker's own team cancels it. Throw-in encroachment penalty. Team-official misconduct → 13 m. | 2026 = permanent ruleset |
| Central Council | Dec 2025 | **Hooter ends the game immediately** (2026) | 2025 late-game data is **not** 2026 late-game data |
| Official Guide / Rule Book | Mar–Apr 2026 | Consolidated text; guidance document | Reference text (inaccessible) |
| Rules Questions | Jul 2026 | Clarifications (kickout arc, advanced mark) | — |
| Ryan Cup trials | 2026 | Handpass limit, backcourt, fisted points | **Not current** |

**Consequence:** "2025 data" covers at least **three rulesets**:
1. original 3v3 (league Rounds 1–5);
2. amended 4v3 (Round 6 onward and the championship);
3. the 2026 permanent ruleset, which adds the hooter and the two-point touch change.

Early-2025 league figures (e.g. goalkeeper involvement) describe a ruleset that lasted five rounds.

---

## 3. What did the new rules actually change?

**Source independence warning:** unless stated otherwise, the figures come from the **GIU (the FRC's own analysis unit, led by J. Bradley)**. Media reports repeat them. **Single-source** throughout.

| Area | Finding | Era / sample | Type | Confidence |
|---|---|---|---|---|
| **Kickout length** | Short kickouts 51 % (2023–24) → **21 %** (2025 league R1–3). **~80 %** beyond the 45 m (vs 59 % in 2023). | League R1–3, 47 games | RULE EFFECT OBSERVED | M (single source) |
| **Contested kickouts** | 36 % (2023), 26 % (2024 championship) → **61 % → 68 %** across R1–3 (avg ~64 %; one report says 67 %) | League R1–3 | RULE EFFECT OBSERVED | M |
| **Kickout retention** | **Not found** for 2025–26 | — | UNKNOWN | — |
| **Handpass:kickpass ratio** | ~3.2–3.4 in early 2025, unchanged from 2023–24. Total passes (kick and hand) fell. Final FRC report (as rendered): ratio "went from 3:4 to 4:4", a **garbled / conflicting** rendering. | League R1–3; season | RULE EFFECT OBSERVED (early); **UNRESOLVED** (season) | L–M |
| **Shots and scores (counts)** | Early league: shots and scoring events roughly flat vs 2023–24 (~54–56 shots; ~30–31 scores). **2025 championship: 59.9 shots and 35.8 scores per game, vs 49.9 / 30.7 in 2024.** | League R1–3 vs championship weeks 9–13 | RULE EFFECT OBSERVED — **conflicting between phases** | M |
| **Points per game** | ~34 (2024) → ~46 (2025) and held in 2026 | Championship | Reported (RTÉ Brainstorm, 2026) | M |
| **Two-point attempts** | 209 of 214 league and championship games in 2025 had ≥1 two-pointer. ~18 % of championship shots were two-point attempts. Conversion reported as ~38 % across league divisions (Div 2 57 %, Div 3 9 %) **and** "half going over". **Conflicting; source quality low** (aggregator site). | 2025 | RULE EFFECT OBSERVED (weak) | L |
| **Two-point shot quality** | An expected-points model built on 4,000+ inter-county shots is used to compare teams' two-point efficiency | 2025 championship | TACTICAL INTERPRETATION (academic author, media outlet) | L–M |
| **Goalkeeper involvement** | Passes to goalkeepers averaged 19.9 per game (R1–4) and 25.7 (R5) → **1.4 (R6)** after the 4v3 amendment. The most proficient advanced keepers continued to go forward. The FRC says the roving keeper is prominent in Divisions 1–2 and less so in 3–4. | League 2025 | RULE EFFECT OBSERVED | M |
| **Ball in play** | ~57 % in early 2025 vs ~62 % in the 2024 championship | League R1–3 | RULE EFFECT OBSERVED | L–M |
| **Late game** | 7 scores after the final hooter and 14 after the half-time hooter across 23 All-Ireland series matches (2025). This motivated the 2026 hooter rule. | 2025 championship | Observed (FRC notes) | M |
| **Pressing / turnovers / transition** | The GIU reports turnovers as a % of possessions, but **values were not recoverable**. No measured change in pressing height, turnover location or counter-attacks was found. | — | **UNKNOWN** | — |
| **Attacking / defensive numbers** | Only rule logic (≤11 per half). The FRC states its intent (end low blocks; create counter-attack targets). **No measurement found.** | — | RULE LOGIC | — |
| **Shot location / field position** | No post-2025 shot-location study found beyond the arc/non-arc split | — | UNKNOWN | — |
| **Long kicking (open play)** | Kick passes fell in absolute number; the ratio was unchanged early. The FRC suggests solo-and-go "possibly meant" kick-passing did not rise as expected. | 2025 | RULE EFFECT OBSERVED + **FRC INTERPRETATION** | L–M |
| **Speed of restarts** | No frequency data for solo-and-go or quick kickouts found | — | UNKNOWN | — |
| **Styles** | "Genuinely different styles" succeed: aggressive running (Armagh, Donegal), through the lines (Kerry), physicality/primary possession (Galway) | 2025–26 | **COACH/PUNDIT OPINION** (RTÉ Brainstorm) | L |
| **Two-point adoption by team** | Dublin kicked 25 two-pointers in 14 games (2025) and fell behind in 2026. Mayo led the 2026 All-Ireland series in two-point scores and won the title. | 2025–26 | Observed counts + **PUNDIT INTERPRETATION** ("failure to adapt") | L |
| **"One-point shots a waste of time"** | Pundit claim (2026) | — | **COACH/PUNDIT OPINION** | L |

**Finding:** measured, current, rule-attributable changes exist for:
- kickout length and contest;
- goalkeeper passes;
- totals (shots, scores, points);
- ball-in-play;
- hooter-period scores.

**Nothing current is measured** for pressing, turnovers, transition, team shape, open-play shot location or restart speed. Those are where Game Understanding most needs evidence.

---

## 4. Game divisions — tested, not assumed

**Test:** does the division change what players must *notice*, *decide* or *do* — because of rules, ball status, opponent organisation or numbers? Or is it only an analyst's label?

| Candidate division | Genuinely different problem? | Why | Status |
|---|---|---|---|
| **Own possession vs opposition possession** | **Yes (basic)** | Every rule and objective flips | SUPPORTED (structural) |
| **Regain** (turnover won) | **Yes** | Opponents are mid-reorganisation; 4v3 guarantees 3 forward targets; pre-2025 association with scoring | PLAUSIBLE (current), SUPPORTED (pre-2025) |
| **Loss** (turnover conceded) | **Yes** | The reciprocal problem; rest-defence is guaranteed ≥3 outfield + goalkeeper (or 4 outfield) | PLAUSIBLE |
| **Own kickout** | **Yes, strongly** | Unique legal structure (arc, 13 m, receivers outside the arc, no return to the keeper); now mostly contested | SUPPORTED |
| **Opposition kickout** | **Yes, strongly** | The pressing team is capped at 11 in that half; interception inside the arc is permitted | SUPPORTED (contest rate); press UNKNOWN |
| **Other restarts** (frees, solo-and-go, marks, 45s, sidelines, throw-ins) | **Partly** | Solo-and-go and marks create *protected* first actions; other frees are set shots or set pieces; throw-ins are rare | PLAUSIBLE; heterogeneous |
| **Contest for possession** | **Partly — a family, not one problem** (§16) | A planned kickout contest ≠ an unplanned spill | PLAUSIBLE |
| **Loose ball / breaking ball** | **Yes** as a state: nobody controls the ball | The "first to ball / position for the break" problem is shared across origins | PLAUSIBLE |
| **Settled vs unsettled attack** | **Probably yes**, but **undefined** | Whether the defence is organised changes the options available. Gaelic sources never define it. | UNKNOWN (definition) |
| **Settled vs unsettled defence** | **Probably yes** (mirror) | Same | UNKNOWN |

**Finding:** the most defensible divisions are:
1. **ball status** — controlled by us, controlled by them, or contested / loose;
2. **possession origin** — own kickout, opposition kickout, regain, restart, loose ball;
3. **opponent organisation** — settled / unsettled.

These are **three different axes**. Collapsing them into one list of "moments" (as TP-style lists do) hides that, for example, "regain" can lead straight to "settled attack".

---

## 5. Moment vs phase vs event vs problem

Working definitions. **Not frozen.**

| Term | Working definition | Gaelic example |
|---|---|---|
| **Event** | A discrete occurrence that changes the game state | Kickout taken; turnover; foul; score; wide; mark; hooter |
| **Game state** | The combination of *ball status* × *possession origin* × *opponent organisation* × *location* × *score/time context* | "We have just won a breaking ball from our own kickout, 50 m out, opponents' press still high, one point down, 5 minutes left" |
| **Phase** | A continuous stretch of one ball status between events | Our possession from regain to loss or score |
| **Moment** | A coach-facing label for a class of game states chosen for practice. (Phase 1's GAME MOMENT is the practice-design use of this.) | "Our kickout", "just after we lose it" |
| **Recurring problem** | What a player or team must solve in a class of game states, given rule-created and opponent-created constraints | "Get out of our half when their press has men on our receivers and the keeper isn't available" |
| **Player relationships** | The positional/temporal relations among ball, teammates, opponents and rule lines that define options | Ball carrier's distance to the nearest presser; free teammate beyond the press; position relative to the arc |
| **Solutions** | Actions that could solve the problem | Kick long, carry, handpass to a runner, recycle wide |

**Candidate hierarchies (none chosen):**

| | Hierarchy | Strength | Weakness |
|---|---|---|---|
| H1 | GAME STATE / MOMENT → RECURRING PROBLEM → PLAYER RELATIONSHIPS → POSSIBLE SOLUTIONS | Problems are state-specific; relationships are the observable layer | "Game state" is multi-axis; coaches need a simpler entry point |
| H2 | EVENT (origin) → PROBLEM → RELATIONSHIPS → SOLUTIONS | Easiest to observe (the event is unambiguous); matches the performance-analysis tradition | Misses problems that arise mid-phase (e.g. settled attack stalling) |
| H3 | BALL STATUS (ours / theirs / loose) → ORIGIN / ORGANISATION → PROBLEM → … | Clean axes | Deeper; harder to explain |
| H4 | RULE-CREATED STRUCTURE (4v3, arc, restart rules) → PROBLEMS IT CREATES → … | Directly rule-current | Rules are constraints, not the game; risks building around the rulebook |

**Finding:** "attack" and "defence" are **too broad to be player problems**, confirming the brief. "Kickout" is an **event**, not a problem. The **recurring problem** level is where player decisions differ.

---

## 6. Own kickout (deep)

### 6.1 Legal structure (TRIANGULATED)

- **Kicker:** the goalkeeper (normally), from the 20 m line. The ball **must cross the 40 m arc** before the kicking team can play it.
- **Kicking team's receivers:** must be **outside the arc** at the moment of the kick to receive directly. They may then move in.
- **Opponents:** 13 m from the ball. They **may** be inside the arc and may intercept there.
- **The kicking goalkeeper cannot be given the ball back** (club summary; the core pass-back rule points the same way).
- **Numbers (4v3):**
  - The kicking team may have at most **11 outfield players in its own half** (3 must stay forward), plus the goalkeeper.
  - The pressing team may have at most **11 players** in that half (it must keep 4 in its own half, which may include its goalkeeper).
- **Kickout mark:** a clean catch past the 45 m line → play on with 4 m protection, or take the free (a two-point free option if outside the arc).

### 6.2 What kinds of kickout are legally possible

| Type | Legal? | Notes |
|---|---|---|
| Short (inside the arc) | **No** | Structurally obsolete |
| **Medium, ~40–45 m** (beyond the arc, before the mark line) | Yes | **No kickout mark available**; the receiver can be contested at once. A small band. |
| Medium-long, 45 m+ to around midfield | Yes | Mark available on a clean catch |
| Long / contested (midfield and beyond) | Yes | Contest and breaking ball |
| Quick (before the opposition sets) | Yes | Players need not clear the 20 m; referee discretion on delay |

### 6.3 Recurring problems (candidates, not solutions)

| Phase of the restart | Problem | Evidence |
|---|---|---|
| Before the kick | Create a receiving option beyond the arc against a press of up to 11 | RULE LOGIC; contest rate SUPPORTED |
| At the kick | Choose clean vs contested delivery; win the catch or the break | Contest rate 61–68 % SUPPORTED |
| Breaking ball | Be first to a ball nobody controls; position for the break | UNKNOWN (no break data) |
| Clean possession won | Use the 4 m play-on (if a mark) or secure against an immediate tackle (if not a mark) | RULE LOGIC |
| Immediately after securing | Progress or secure against a press still set high; **no goalkeeper recycle** | RULE LOGIC; UNKNOWN |
| Lost / contested and lost | Immediate defensive transition high up the pitch | UNKNOWN |

### 6.4 Pre-2025 kickout findings — applicability

| Finding (source era) | Classification | Why |
|---|---|---|
| The kicking team won ~65 % of kickouts (sub-elite, 2020–21) | **STRUCTURALLY OBSOLETE** (as a benchmark) | It relied mostly on short kickouts |
| Short kickouts inside the 45 m most successful (sub-elite, 2020–21) | **STRUCTURALLY OBSOLETE** (inside the arc); **PARTLY** (40–45 m band) | Only the 40–45 m band remains |
| Quick kickouts (0–10 s) retained better (sub-elite) | **NEEDS RE-TESTING** | Quick kickouts are still legal, but the delivery distance changed |
| Opposition numbers inside the 65 related non-linearly to kickout success | **NEEDS RE-TESTING** | 4v3 caps pressers at 11 |
| The most common outcome after a won kickout was a turnover (sub-elite) | **UNKNOWN** | Contest dynamics changed |
| Kickouts to the wings → scoring opportunities 31 % (elite, pre-2025) | **NEEDS RE-TESTING** | — |
| Own kickout = 45 % of score origins; kickouts ≈ 49 % of possession starts (elite, 2016 / 2021–22) | **NEEDS RE-TESTING** | The possession-source mix may have shifted |
| Winners take fewer kickouts (2014–15) | **RULE-INDEPENDENT** (logic: fewer conceded scores) | A confound, not tactics |
| LGFA: successful teams won ~80 % own / ~29 % opposition; strategy classes (e.g. zonal press 11+, "Flat 4") | **PARTLY APPLICABLE** (the classification idea); **UNKNOWN** (the values) | Different rules. Note: an 11+ press equals the men's legal cap in one half. |
| 44 kickouts per game; kickouts originate 29–33 % of possessions (TP presentation) | **NEEDS RE-TESTING** | Ball-in-play time fell; restart counts unknown |

---

## 7. Opposition kickout

**Candidate recurring problems (no press prescribed):**

| Problem | Rule-created features | Evidence |
|---|---|---|
| Decide how many to commit to the press (≤11 in that half) and where | 4v3 cap; 4 must stay in own half | RULE LOGIC |
| Deny the receiving space beyond the arc; intercept inside the arc (legal) | Arc; 13 m | RULE LOGIC |
| Contest the delivery (catch, or disrupt the catch to prevent a mark) | Kickout mark past 45 m | Contest 61–68 % SUPPORTED |
| Win the breaking ball | — | UNKNOWN |
| Prevent progression after the opponent receives, especially after a mark (no challenge within 4 m) | Mark protection | RULE LOGIC |
| Transition to attack if won high: opponents' 4-back rest defence vs our 3+ forward | 4v3 | PLAUSIBLE |
| Transition to defence if the opponent secures it, with our press committed high | 4v3 guarantees our ≥4 back (incl. goalkeeper) | PLAUSIBLE |

**Evidence gap:** press shape, press success and post-press outcomes under the men's current rules are **UNKNOWN**.

---

## 8. Possession won in open play (regain)

| Candidate problem | Evidence | Status |
|---|---|---|
| Secure the ball in contact / escape the counter-press | Pre-2025: turnovers won in contact associated with scoring (sub-elite 2023–24) | NEEDS RE-TESTING |
| Exploit the unset opposition | Pre-2025 counter-attack data: successful counter-attacks were 26–35 s long with *longer* pass sequences (2007–08) — **not** "fastest is best" | NEEDS RE-TESTING |
| Find a forward option: 4v3 guarantees ≥3 of our outfield players in the opposition half | RULE LOGIC; FRC intent | PLAUSIBLE |
| Support the ball carrier | Descriptive only (2011) | UNKNOWN |
| Decide direct vs retain / change the picture | Contradictory pre-2025 associations | UNKNOWN |
| Reorganise shape (4v3 compliance while attacking) | Rule | RULE LOGIC |

**Do not treat these as principles.** Their current-rule evidence is nil. Their pre-2025 evidence is associational and partly contradictory.

---

## 9. Possession lost

| Candidate problem | Rule-created feature | Evidence |
|---|---|---|
| Immediate pressure on the new carrier vs retreat | Dissent / foul penalties (50 m advance) raise the cost of fouling | UNKNOWN |
| Protect the scoring area — now **two zones** (inside the arc for goals/points; the arc edge for two-pointers) | Arc | RULE LOGIC |
| Delay / recover | — | Official principle (landscape audit); no current evidence |
| Track runners into our half: up to 11 opponents may attack | 4v3 | RULE LOGIC |
| Restore numbers (≤11 outfield + goalkeeper in own half; 3 must stay forward) | 4v3 | RULE LOGIC |
| Deny a solo-and-go if we foul (any player may take it immediately) | Solo-and-go | RULE LOGIC |

---

## 10. Settled possession

| Candidate problem | What the current rules add | Evidence |
|---|---|---|
| Advance against an organised defence (max 11 outfield + goalkeeper defending) | Low blocks capped | RULE LOGIC; FRC intent |
| Create useful space | The defence must also guard the arc edge (two-zone threat) | RULE LOGIC; FRC intent ("choose between defending the arc and sacrificing space closer to goal") |
| Support around the ball | Handpass ratio unchanged early 2025 | SUPPORTED (ratio only) |
| Maintain ≥4 in own half (incl. goalkeeper) while attacking | Rule | RULE LOGIC |
| Create a numerical advantage despite 4v3 (goalkeeper forward only if a 4th stays back) | Goalkeeper passes fell ~94 % after the amendment; elite keepers still advance | SUPPORTED (single source) |
| Change the point of attack | — | UNKNOWN |
| Create shooting opportunities | Shots up in the 2025 championship (conflicts with early league) | SUPPORTED (conflicting) |
| Two-point decision (shoot for 2 vs work closer) | ~18 % of shots were two-point attempts; conversion figures conflict | Weak |
| Balance security vs progression; late-game timing (2026 hooter) | Hooter | RULE LOGIC |

**Do not assume patient possession or direct attack is better.** Current evidence cannot compare them, and commentary says several styles succeed.

---

## 11. Settled defence

| Candidate problem | Current-rule feature | Evidence |
|---|---|---|
| Pressure the ball | — | UNKNOWN (current) |
| Protect high-value space: **inside the arc near goal *and* the arc edge** | Arc | RULE LOGIC |
| Cover and track movement with ≤11 outfield + goalkeeper | 4v3 | RULE LOGIC |
| Keep 3 outfield in the opposition half while defending | 4v3 | RULE LOGIC |
| Defend the two-point threat without conceding closer space | Arc | FRC-stated dilemma (**INTERPRETATION**) |
| Defend runners and deliveries into the 20 m (advanced-mark threat) | Advanced mark | RULE LOGIC |
| Regain possession without fouling (solo-and-go and 50 m advance penalties) | Solo-and-go; dissent | RULE LOGIC |
| Prepare for transition: our 3 forwards vs their ≥3 outfield + goalkeeper | 4v3 | PLAUSIBLE |

---

## 12. The 4v3 half-structure as a structural constraint

**What relationships exist now that did not exist in the same form before (RULE LOGIC):**

| Relationship | Before 2025 | Now |
|---|---|---|
| Maximum in one half (per team) | 15 | **11 in the opposition half; 12 (11 + goalkeeper) in the own half** |
| Forward outlets when defending | 0 required | **≥3 outfield always in the opposition half** |
| Rest defence when attacking | 0 required | **≥4 in own half (goalkeeper may be one)** |
| Counter-attack numbers at the moment of regain | Variable (often few forward) | **Our ≥3 vs their ≥3 outfield + goalkeeper (or 4 outfield)**: a guaranteed small-sided transition in the far half |
| Goalkeeper as an extra attacker | Legal and used heavily (early 2025: ~20–26 passes per game) | Only if a 4th stays back (passes fell to ~1.4 per game) |
| Press on a kickout | Up to 15 | **≤11** pressers in that half |
| Space behind the press | Depended on commitment | The pressing team always leaves ≥4 back, so there is some depth behind any press |

**Evidence vs logic:**
- **Measured:** only goalkeeper involvement (SUPPORTED, single source).
- **Not measured:** attacking/defensive numbers per half in practice, counter-attack frequency or success, press success, "spare player" usage.
- **Not inferable from logic alone:** whether teams actually leave exactly the minimum forward, or more. That is a choice.

**Finding:** 4v3 is the **single most important rule for Game Understanding**. It creates **permanent small-sided relationships** in the far half (roughly 3v3/3v4) and caps overloads near the ball. It is almost entirely **unmeasured** outside goalkeeper passes.

---

## 13. Two-point arc

| Question | Rule change | Behaviour evidence |
|---|---|---|
| Value of space | The arc edge becomes a scoring zone worth 2 | 209/214 games had ≥1 two-pointer (2025) — SUPPORTED (weak source) |
| Defensive pressure | Defences must guard two zones (FRC-stated dilemma) | UNKNOWN (no pressure data) |
| Shooting decisions | Shoot for 2 vs work closer for a 1 or a goal | ~18 % of shots were 2-point attempts; conversion 38 %–~50 % (**conflicting**). An xP model exists (media). |
| Support | Supporting players may shape to create shots at the arc | UNKNOWN |
| Late game | 2-point swings; 2026 hooter; one anecdote of running the clock then a two-pointer | Anecdote (PUNDIT) |
| Player positioning | Specialist long-range shooters valued ("supersharpshooters") | INTERPRETATION |
| Team differences | Dublin (few) vs Mayo (many) narrative, 2026 | Counts + PUNDIT |
| Scoring totals | Points per game up ~35 % | SUPPORTED |

**Distinction held:**
- The arc **changes scoring value** — rule.
- Teams **attempt two-pointers routinely** — observed, weakly.
- *How* positioning, pressure and support changed because of it is **UNKNOWN**.

---

## 14. Solo-and-go / quick restarts

| Candidate problem | Rule feature | Evidence |
|---|---|---|
| Attackers recognise a disorganised defence and go (any player may take it) | Immediate; 4 m protected; forward/lateral only; not inside the opposition 20 m | UNKNOWN (no usage data) |
| Immediate support for the restarter | — | UNKNOWN |
| Defence: retreat and recover without challenging within 4 m (a challenge → 50 m) | 50 m penalty | RULE LOGIC |
| Communication to reorganise | — | UNKNOWN |
| Stop quick progression legally | — | UNKNOWN |

**Evidence:**
- Solo-and-go was the "best received" rule in the sandbox (FRC; opinion).
- The FRC suggests it "possibly" kept kick-passing from rising (**FRC INTERPRETATION**, unmeasured).

**Do not assume quick = better.** No outcome data exist.

**Is it a distinct recurring problem?** Plausibly for defences: it is a recurring, rule-created **transition-after-foul** state. For attackers it is an option inside regain/restart problems. **PLAUSIBLE; frequency UNKNOWN.**

---

## 15. Advanced mark

- **Rule:** a clean catch on or inside the opposition 20 m, from a delivery from on or outside the 45 m (triangulated). Play-on and advantage options.
- **Tactical relevance:**
  - it rewards long delivery into the scoring area;
  - it creates a scoring-area aerial contest;
  - it interacts with solo-and-go being barred inside the 20 m.
- **Evidence of use:** **none found** (no frequency data).
- **Judgement:** **not a top-level recurring problem** on current evidence. It is best treated as a **rule-created option within "enter the scoring area"** and "defend deliveries into the 20 m". **Include only if frequency data show it is common.** Frequency is UNKNOWN.

---

## 16. Contest for possession — Mangan's fifth moment, stress-tested

| Event type | Frequency (current) | Predictable in advance? | Shared player problems? |
|---|---|---|---|
| Contested kickout | **High** (~61–68 % of kickouts, league 2025) | **Yes** (planned restart) | Positioning for catch and break; numbers; press |
| Breaking ball after a kickout | High (follows from the above) | Semi | First to the ball; support angles for the break |
| Contested high ball in open play (incl. advanced-mark deliveries) | UNKNOWN | Semi | Aerial contest; break |
| Loose ball after a tackle spill | UNKNOWN | **No** | First to the ball; immediate transition either way |
| Rebound off the post/bar or a keeper save | UNKNOWN (hooter-era rule on the ball in flight) | No | Reaction; numbers near goal |
| Blocked shot | UNKNOWN | No | Reaction; transition |
| Throw-in (1v1 now) | Low | Yes | 1v1 contest; structured positioning |

**Assessment:**
- **Mangan was right that restart contests are distinctive, and the rules have made them more so.** A majority of kickouts are now contested (SUPPORTED, single source), and the fifth moment matters more in 2026 than when it was proposed.
- **But "contest for possession" describes several events that differ in predictability.** A **planned contest** (kickout, throw-in) involves pre-organised positions and numbers. An **unplanned loose ball** (spill, rebound, block) is a reaction problem inside another phase.
- **They share one state:** the ball is controlled by neither team, and the next action decides possession and transition direction.

**Verdict:** a **genuine state ("ball contested / loose")** containing at least **two distinct problem families**:
- (a) **the planned restart contest**;
- (b) **the unplanned loose ball**.

This is PLAUSIBLE. Mangan is **neither accepted nor rejected**: the moment is real, but not unitary.

---

## 17. Goalkeeper

| Role | Rule possibility (triangulated) | Common practice (evidence) |
|---|---|---|
| Kickouts | From the 20 m; beyond the arc; quick allowed; cannot receive the kickout back | Mostly long/contested (league 2025) |
| Possession / recycling | Receives from a teammate only if both are in the large rectangle, or the keeper is in the opposition half | Recycling to the keeper in the own half largely removed (RULE LOGIC) |
| Overloads | May join the attack only if a 4th player stays in the own half | Passes to the keeper fell ~20–26 → ~1.4 per game after the amendment; elite advanced keepers continue; more common in Divisions 1–2 |
| Escape from pressure | **Not an outlet** outside the rectangle in the own half | RULE LOGIC |
| Defensive transition | Counts toward the own-half four | UNKNOWN |
| Attacking support | Legal in the opposition half (can receive there) | Specialist keepers only (INTERPRETATION) |

The FRC considered restricting an advanced goalkeeper to kicking only. Status **UNKNOWN**; not found in the 2026 rule summaries.

---

## 18. Field geography

**Finding:** the current rules create **rule-active lines**. Zones need not be invented.

| Line / area | Rules it switches on/off | GU relevance |
|---|---|---|
| **Halfway** | 4v3 structure; goalkeeper pass permission (opposition half) | Numbers; the keeper's availability |
| **40 m arc** (each end) | Kickout minimum; two-point boundary | Restart geometry; shot value; defensive zones |
| **45 m line** | Kickout-mark threshold; advanced-mark delivery origin | Aerial contests; delivery decisions |
| **20 m line** | Kickout spot; solo-and-go barred inside the opposition 20; advanced-mark catch zone | Scoring-area entry |
| **13 m line** | Kickout exclusion distance; maximum advancement of penalty frees | Restart spacing |
| **Large rectangle** | Goalkeeper pass-back exception | Escape under pressure (narrow) |
| Central vs wide | No rule | Pre-2025: shot efficiency peaked centrally within ~32 m / 60° (NEEDS RE-TESTING against the arc) |
| Thirds | No rule | Analyst convention only |

**Evidence that problems differ by location:**
- Pre-2025: possession-start area was associated with possession outcome (elite 2016); shot efficiency depended on location (2019).
- Both are PLAUSIBLY still directional truths. **Values NEED RE-TESTING.**

---

## 19. Score and time context

| Context | Current-rule change | Evidence |
|---|---|---|
| Leading/trailing margin | Scores are worth 1/2/3, so "one-score game" is ambiguous. A 3-point lead can be erased by a goal *or* two-pointer + point. | RULE LOGIC |
| Late game | **Hooter ends the game immediately (2026)**; only an already-awarded direct, uncontested placed shot survives | Rule; 2025 hooter data motivated it |
| Two-point availability | A deficit can be closed faster; shooting from the arc late may change value | PUNDIT / anecdote |
| Possession value | Late possession + hooter + two-pointer interact | UNKNOWN |
| Player use of context | Players already report using score and time when deciding (Frontiers 2023, pre-rules) | Qualitative |

**Judgement:** score/time is **context on a game state** (§5), not a principle. It likely changes *which solution is best*, not *what the problem is*. That is PLAUSIBLE.

---

## 20. Recurring problem inventory (candidates)

No solutions are specified. "Evidence" means evidence the problem *occurs and matters*, not evidence for any solution.

| # | Problem | When it occurs | What creates it | Evidence | Current-rule relevance | Confidence |
|---|---|---|---|---|---|---|
| P1 | Win or secure possession from our own kickout | Every own kickout | Arc minimum; press ≤11; mark rules | Contest 61–68 %; short 21 % (GIU 2025) | **High** (rule-created) | **SUPPORTED** (single source) |
| P2 | Contest / deny the opposition kickout | Every opposition kickout | Same rules, reversed | As P1 | High | SUPPORTED |
| P3 | Win the breaking / loose ball | After contested kickouts; spills; rebounds | Contest frequency | Contest rate only | High | PLAUSIBLE |
| P4 | Escape pressure in our own half | After securing a restart or a regain deep | Press; **no keeper recycling**; ≤11 v ≤11 | Rule logic; landscape stress test | High | PLAUSIBLE |
| P5 | Exploit an unsettled defence after a regain | Turnover won | Opponents unset; ≥3 of ours forward | Pre-2025 turnover/score associations | High | PLAUSIBLE |
| P6 | Support a ball carrier under pressure | Many states (§26) | Contact, press, handpass range | Descriptive only | High | PLAUSIBLE |
| P7 | Progress against a settled defence (≤11 outfield + keeper) | Settled attack | Organised defence; arc threat | Rule logic; FRC intent | High | PLAUSIBLE |
| P8 | Create a shot / choose shot value (1 vs 2 vs goal) | Scoring area and arc edge | Arc; hooter | Two-point frequency (weak); points ↑ | **High** (new) | SUPPORTED (weak) |
| P9 | Enter the scoring area (incl. deliveries into the 20 m) | Settled or unsettled attack | Advanced mark; solo-and-go barred inside the 20 | Rule only | Medium | UNKNOWN (frequency) |
| P10 | React to possession loss (press vs retreat) | Turnover conceded | Rest-defence ≥4; opponents' ≥3 forward | Rule logic | High | PLAUSIBLE |
| P11 | Regain defensive shape / numbers | After a loss or a quick restart | 4v3; solo-and-go | Rule logic | High | PLAUSIBLE |
| P12 | Defend the two-point threat without conceding closer space | Settled defence | Arc | FRC-stated dilemma | High (new) | PLAUSIBLE |
| P13 | Defend a quick restart (solo-and-go) | After our foul | Rule | No usage data | Medium | UNKNOWN |
| P14 | Keep the 4v3 structure while attacking or pressing | Continuous | Rule | Rule; goalkeeper data | High (new) | SUPPORTED (the rule itself); behaviour UNKNOWN |
| P15 | Manage late game under the hooter | Final minutes | Hooter; two-pointer | FRC hooter data (2025) | Medium (2026-new) | PLAUSIBLE |
| P16 | Transition after winning the ball high (press success) | Won kickout or regain high | ≥4 opposition back | Rule logic | Medium | UNKNOWN |

---

## 21. Multi-principle problems — hypothesis test

**Hypothesis:** Game Understanding should be organised around **recurring game problems**, with support, width, depth and so on appearing as **possible solution features**, rather than around isolated concepts.

| For | Against / untested |
|---|---|
| Every inventory problem (P1–P16) draws on several traditional principles *plus* rule-created relationships (4v3, arc, restart rules) that no principle names | **No evidence that coaches or players learn better either way.** That is a learning claim; none exists for Gaelic football. |
| The same concept (support) is a different player problem in different states (§26) | Problems can proliferate; concepts give a compact shared vocabulary |
| Problems carry the rule context; concepts are rule-blind (Wade's list predates the rules by 58 years) | Coaches already use concept words; a problem-first structure may feel unfamiliar |
| Problems map onto events coaches can see (the kickout, the turnover) | Some concepts (e.g. "balance") recur across many problems and may be better taught once |

**Status: HYPOTHESIS — PLAUSIBLE on structural grounds, UNTESTED on learning grounds.**
- A **hybrid** is also plausible: problems as the top level, with concepts as a **cross-referenced vocabulary**.
- **Not adopted.**

---

## 22. Connection to Phase 1 (not reopened)

- Phase 1's GAME MOMENT (as clarified by Candidate 10) asks the coach **which situation the practice contains**, including follow-up moments and how they arise.
- Phase 1 deliberately left open **what the candidate situations are**.

**Test:** do current-game problems supply that missing input? **Yes, carefully.**
- The inventory (§20) and the state axes (§4) are a **candidate menu** for "which moment/problem is this practice for?".
- They do **not** change any Phase 1 lever, principle or gate.

**The joints:**

| Game-structure output | Phase 1 consumer |
|---|---|
| Recurring problem + game state | GAME MOMENT (which situation) |
| Rule-created relationships (4v3, arc, restart rules) | NUMBERS, SPACE, DIRECTION/TARGET, SCORING as the **reference game** the practice departs from |
| What players must notice in that state | GI-1 / GI-2 / INFORMATION CHECK |
| Which decisions exist in that problem | Decision Allocation |
| Follow-up states (e.g. kickout → break → escape) | GAME MOMENT follow-ups (Candidate 10 clarification) |

**Possible future chain (not frozen):**

```
CURRENT GAME → RECURRING PROBLEM → PLAYER INFORMATION / DECISION → POSSIBLE BEHAVIOURS → PRACTICE DESIGN (Phase 1)
```

**Caution:** Phase 1's GI-2 says keep the information the decision depends on. §23 of the landscape audit and §12 here show that some of that information is **rule-created**: the arc, 4v3 numbers, keeper unavailability. A practice without those rules may remove it.

**This is an input to Phase 1, not a change to it.** Practices may legitimately use other rules; Phase 1 already covers that.

---

## 23. Pre-2025 evidence audit

| Finding (era) | Classification | Reason |
|---|---|---|
| Possessions ≈ half turnovers, half kickouts (2016) | **NEEDS RE-TESTING** | Kickout contest and ball-in-play changed |
| Score origins: own kickout 45 %, turnovers 40 % (2021–22) | **NEEDS RE-TESTING** | As above |
| Possession start area associated with outcome (2016) | **LIKELY STILL RELEVANT** (direction); values need re-testing | Geography logic persists |
| Possession duration associated with outcome (several) | **NEEDS RE-TESTING** | Hooter, ball-in-play and style changes |
| Counter-attacks 26–35 s with longer sequences most successful (2007–08) | **NEEDS RE-TESTING** (and old) | 4v3 changes counter-attack numbers |
| Contact turnovers → more scoring (sub-elite 2023–24) | **LIKELY STILL RELEVANT** (mechanism: the opponent is unset) | Not rule-dependent in its logic |
| Winners: more turnovers won, fewer failed handpasses (2014–15) | **LIKELY STILL RELEVANT** (general) | Retention and regain logic |
| Winners take fewer kickouts | **RULE-INDEPENDENT** | Arithmetic confound |
| Scoring zone within 32 m / 60° (2019) | **NEEDS RE-TESTING** | The arc changed shot value; efficiency by distance is probably stable, value is not |
| Shot success peaks ~20 m | **LIKELY STILL RELEVANT** (efficiency) | Kicking physics unchanged |
| Kickout findings (§6.4) | **STRUCTURALLY OBSOLETE / NEEDS RE-TESTING** | See §6.4 |
| Frontiers 2023: players use positioning, space, score/time | **RULE-INDEPENDENT** (information categories) | Cognitive, not rule-bound |
| Kinnerk 2025 GBA → U14/U15 decisions | **RULE-INDEPENDENT** (pedagogy) | Not about game structure |
| Handpass-heavy game | **SUPPORTED as still true** (early 2025 ratio unchanged) | Current measure |
| Mangan's five moments (2022) | **PARTLY** — contest more important; not unitary (§16) | Current contest data |

---

## 24. What we now don't know

The new rules have outrun the evidence. Current men's-game unknowns:

1. **Kickout retention rates** by kickout type (medium 40–45 m, long, contested) and by press size.
2. **Breaking-ball outcomes** — who wins them and why.
3. **Possession-source mix** — what share of possessions and scores now come from kickouts vs turnovers.
4. **Turnover rates and locations** (the GIU measures them, but values were not accessible).
5. **Press frequency, height and success** under the ≤11 cap.
6. **How many players teams actually leave forward or back** beyond the legal minimum.
7. **Counter-attack frequency and success** using the guaranteed 3 forward.
8. **Two-point attempt rates and conversion** (reported figures conflict), and how defences respond.
9. **Open-play shot location** relative to the arc.
10. **Solo-and-go and quick-restart frequency and outcomes.**
11. **Advanced-mark and kickout-mark frequency.**
12. **Late-game behaviour under the 2026 hooter.**
13. **Club, sub-elite and underage effects.** All current data are inter-county.
14. **Whether 2025 findings hold in 2026** (hooter and two-point touch changes).
15. **What any of this means at U12**, where the rules may not apply.
16. **Peer-reviewed confirmation of anything.** Current evidence is one internal GAA unit plus media.

**Finding (potentially important for PáircVision):**
- **The published Gaelic football evidence base describes a game that no longer exists at senior level.** The only current measurement comes from the rule-makers' own unit.
- This is a structural gap, not a temporary one. Peer-review cycles (2–3 years) mean the 2026 game may change again before it is described.
- **Any Game Understanding content built now would rest largely on rule logic, early single-source data and older evidence of uncertain transfer, and must say so.**

---

## 25. Current game map (smallest defensible)

**Not principles. Not a curriculum.** States, recurring problems and rule-created relationships.

```
BALL STATUS ─┬─ OURS ────────┬─ from OWN KICKOUT ........ P1, then P3/P4      [SUPPORTED: contest-heavy]
             │               ├─ from REGAIN ............. P5, P4, P6          [PLAUSIBLE]
             │               ├─ from QUICK RESTART ...... (solo-and-go, marks) [UNKNOWN frequency]
             │               └─ SETTLED ................. P7, P8, P9, P14     [PLAUSIBLE]
             ├─ THEIRS ──────┬─ their KICKOUT ........... P2, then P3/P16     [SUPPORTED: contest-heavy]
             │               ├─ just LOST it ............ P10, P11, P13       [PLAUSIBLE]
             │               └─ SETTLED ................. P12, P11, P14       [PLAUSIBLE]
             └─ CONTESTED ───┬─ planned (kickout/throw-in) .. P1/P2/P3        [SUPPORTED]
                             └─ unplanned (spill/rebound/block) .. P3         [PLAUSIBLE]

CONTEXT on every state: location (rule-active lines, §18) · score/time/hooter (§19)

RULE-CREATED RELATIONSHIPS (always on):
  • ≤11 per team in the opposition half; ≤11 outfield + keeper in own half   [TRIANGULATED rule]
  • ≥3 outfield forward (outlets / counter targets); ≥4 back incl. keeper   [TRIANGULATED rule]
  • Keeper not a recycling outlet in own half outside the rectangle         [TRIANGULATED core; UNRESOLVED detail]
  • Two scoring zones: inside the arc (1 / 3) and arc edge (2)              [TRIANGULATED rule]
  • Restarts: kickout beyond the arc; marks with 4 m protection;
    solo-and-go (not inside the opp 20)                                     [TRIANGULATED rule]
  • Hooter ends the game (2026)                                             [TRIANGULATED rule]
```

| Map element | Status |
|---|---|
| Three ball-status branches | SUPPORTED (structural) |
| Kickouts as contest-heavy restarts | SUPPORTED (single source, 2025 league) |
| Regain / loss as distinct problems | PLAUSIBLE (pre-2025 evidence plus rule logic) |
| Settled / unsettled | PLAUSIBLE, **undefined** |
| Contested state as two families | PLAUSIBLE |
| Rule-created relationships | TRIANGULATED rules; **their behavioural effects mostly UNKNOWN** |
| Age/county variants | **Outside this map** (§1.4) |

---

## 26. Support stress test (after the map)

| Where | What "support" must solve | Rule-created features | Distinct problem? |
|---|---|---|---|
| **After kickout receipt / breaking ball** | Be available for a catcher under contest; position for the break; exploit the 4 m mark protection | Mark; contest; ≤11 v ≤11 | **Yes:** timing around a contested aerial ball |
| **After a turnover (regain)** | Give the regainer a secure outlet under counter-press; *or* get forward to exploit the unset defence; ≥3 teammates already forward | 4v3 forward outlets | **Yes:** secure-vs-exploit tension; forward targets pre-placed by rule |
| **Under pressure in own half** | Give an escape option when the keeper is not available and the press is ≤11 | Keeper restriction; 4v3 | **Yes:** escape geometry without a recycling outlet |
| **Settled attack** | Create and keep options against an organised ≤11 + keeper defence while keeping ≥4 back | 4v3; arc (shooting options at the edge) | **Yes:** option creation, not rescue |
| **Scoring-zone possession** | Create a shooting angle or a goal chance; decide 1 vs 2 vs goal; deliveries into the 20 m | Arc; advanced mark; solo-and-go barred inside the 20 | **Yes:** support for a shot, not for retention |

**Finding:**
- Support is **not one universal thing** in the current game.
- The *purpose* — the ball carrier has options — is shared. The **player problem differs by state**: what to notice, when to move, and what the support is *for* (retention, escape, exploitation, shot creation).
- This is **PLAUSIBLE** (structural plus rule logic). **None of it is measured.**
- It supports treating support as a **feature within recurring problems** (§21) rather than as a single module.

Support is **not operationalised here**, by design.

---

## 27. Next step (recommended, not performed)

**Recommendation: take one recurring problem and operationalise what good player behaviour looks like.** The findings select which problem.

**Criteria from this audit:**
- the problem is frequent;
- the rules changed it most;
- current evidence exists for it;
- pre-2025 evidence misleads most there;
- it is relevant across the ages PáircVision coaches serve.

| Candidate | Frequency | Rule change | Current evidence | Old evidence misleads? | Cross-age relevance |
|---|---|---|---|---|---|
| **P1/P3: own kickout contest + breaking ball** | High | **Largest** | **Best available** (GIU) | **Most** | **Low at U12** (no arc kickout in Go Games) |
| P4: escape pressure in own half | High | Large (keeper, 4v3) | Rule logic only | Yes | Medium (applies wherever there is a press) |
| P5: exploit an unsettled defence after regain | High | Large (4v3 outlets) | None current | Partly | **High** (turnovers exist at every age) |

**Recommended sequence:**
1. **A short gate first: age-grade ruleset mapping.** Establish which rules actually apply at U8–U12 (Go Games), U13–U17 (county variants) and club adult. §1.4 shows the reference game may not be the played game for many PáircVision coaches. The choice of first problem depends on it. It is small and factual.
2. **Then operationalise one problem.**
   - If the mapping confirms the FRC kickout rules apply at the target ages: **P1/P3 (own kickout contest and breaking ball)**. It has the only current measurement and is where old evidence is most obsolete.
   - If not: **P5 (regain → exploit an unsettled defence)**. It is age-portable, frequent and rule-affected by 4v3 where 4v3 applies.
   - In either case, **support appears as a feature of the chosen problem**, not as the module.

**Not recommended yet:**
- a SUPPORT module on its own (§26);
- ATTACK or DEFENCE audits (too broad, §5);
- adopting Mangan's five moments (§16).

---

## Evidence ledger

| # | Claim | Source | Type | Access | Supports | Conf. | Independence |
|---|---|---|---|---|---|---|---|
| 1 | Official rule texts (2026) | [GAA Rule Book April 2026](https://learning.gaa.ie/sites/default/files/2026-04/GAA%20Rule%20Book%20April%202026.pdf) · [Guidance Document March 2026](https://learning.gaa.ie/sites/default/files/2026-04/Guidance%20Document%20Football%20Rules%20March%2026.pdf) · [Rules Questions July 2026](https://learning.gaa.ie/sites/default/files/2026-07/Rules%20Questions%206.7.26.pdf) · [FRC FAQ](https://learning.gaa.ie/FRCFAQ) | Official primary | **UNRESOLVED (blocked); SIO renderings only** | Rule wording | — | Primary |
| 2 | Goalkeeper pass-back core rule; breaking-ball clarification | Renderings of #1; [Irish Examiner players' guide (2024)](https://www.irishexaminer.com/sport/gaa/arid-41498591.html); [Goalkeeper (Gaelic games), Wikipedia](https://en.wikipedia.org/wiki/Goalkeeper_(Gaelic_games)); [Carryduff GAC summary](https://carryduffgac.com/introducing-the-2025-football-rule-updates/) | Official (SIO) + secondary | SIO | Core rule triangulated; "65" variant unresolved | M | Media/club derive from GAA |
| 3 | 3v3 → 4v3; six March 2025 amendments | [RTÉ, FRC tweaks (Mar 2025)](https://www.rte.ie/sport/football/2025/0307/1500753-frc-make-tweaks-as-3v3-rule-altered/) · [RTÉ, GAA approves (Mar 2025)](https://www.rte.ie/sport/football/2025/0311/1501368-gaa-approves-all-frc-changes-including-to-3v3-rule/) · [Irish Examiner, six amendments](https://www.irishexaminer.com/sport/gaa/arid-41588614.html) · [Irish Times, goalkeeper loophole](https://www.irishtimes.com/sport/gaelic-games/2025/03/11/all-six-gaelic-football-rule-amendments-accepted-by-central-council/) · [Donegal Live](https://www.donegallive.ie/news/gaa/1747509/frc-proposes-six-key-amendments-to-experimental-gaa-rules.html) | Media reporting official decisions | SIO | Timeline; amendment content | M | One origin (FRC) |
| 4 | Kickout time limit (30 s vs discretion) | [Irish Examiner, 20 s → 30 s](https://www.irishexaminer.com/sport/gaa/arid-41590780.html) · [RTÉ, 20-second rule no longer applies](https://www.rte.ie/sport/football/2025/0315/1502248-20-second-rule-no-longer-applies-for-kickouts-frees/) | Media | SIO | **Conflict** | L | — |
| 5 | Special Congress Oct 2025: 62 motions permanent from 1 Jan 2026 | [GAA, all 62 motions passed](https://www.gaa.ie/article/all-62-motions-passed-at-gaa-special-congress) · [RTÉ](https://www.rte.ie/sport/football/2025/1004/1536804-football-changes-sail-into-gaa-rule-book/) · [Irish Times explainer](https://www.irishtimes.com/sport/gaelic-games/2025/10/03/gaa-special-congress-explainer-football-changes-expected-to-sail-into-the-rule-book/) | Official + media | SIO | Permanence; two-point touch; throw-in; officials' 13 m | M | Same origin |
| 6 | Hooter (2026) | [RTÉ, hooter change](https://www.rte.ie/sport/football/2025/1202/1546861-hooter-change-ahead-of-2026-lgfa-set-to-trial-12-rules/) · [HoganStand](https://hoganstand.com/article/index/338696) · [RTÉ, FRC proposes hooter change](https://www.rte.ie/sport/football/2025/0904/1531877-frc-proposes-hooter-change-but-four-point-goal-can-wait/) | Media (official decision) | SIO | Rule; 2025 hooter-period scores | M | Same origin |
| 7 | Two-point touch amendment | [Balls.ie](https://www.balls.ie/gaa/gaa-gaelic-football-two-point-rule-2026-641428) | Media | SIO | 2026 change | M | Same origin |
| 8 | Solo-and-go details | [Dublin GAA CCC2 summary](https://uploads.dublingaa.ie/files/21/summary_of_new_ccc2_gaa_football_rules_for_2025_as_of_170225.pdf) · [Irish Times Q&A](https://www.irishtimes.com/sport/gaelic-games/2025/01/25/gaelic-football-rule-changes-everything-you-wanted-to-know-but-were-afraid-to-ask/) | County / media | SIO | Rule details | M | Semi-independent (county) |
| 9 | Advanced mark and kickout mark | [GAA FRC explainer](https://www.gaa.ie/article/football-review-committee-rule-enhancements-explainer) · [Laois GAA 2026](https://laoisgaa.ie/gaa-rule-changes-2026-explained/) · [RTÉ, advanced mark explained](https://www.rte.ie/sport/football/2024/1008/1474340-proposed-football-rules-explained-advanced-mark/) | Official / county / media | SIO | Rule (one discordant rendering) | M | — |
| 10 | Kickout rule details | [Leitrim GAA](https://www.leitrimgaa.ie/2025/01/new-rules-an-overview-of-the-key-football-rule-enhancements/) · [Laois GAA](https://laoisgaa.ie/new-gaelic-football-rule-changes-explained/) · Rules Questions (#1) | County / official | SIO | Rule | M | — |
| 11 | GIU league R1–3: kickouts short 21 %, contested 61–68 %, handpass ratio, shots/scores, ball in play | [GIU Rounds 1–3 report](https://www.gaa.ie/api/images/image/upload/prd/nmh7spo3cmg0okwyfntj.pdf) · [RTÉ, early data](https://www.rte.ie/sport/football/2025/0222/1498294-early-data-shows-kickout-shift-but-handpassing-static/) · [Irish Examiner, early data](https://www.irishexaminer.com/sport/gaa/arid-41579956.html) | **Official analysis unit** + media | SIO | Rule effects (kickouts) | M | **Single source (GIU)** |
| 12 | GIU championship: 59.9 shots / 35.8 scores vs 49.9 / 30.7 | [GIU weeks 9–13 report](https://www.gaa.ie/api/images/image/upload/prd/lmlerfry2mq1kwroymvd.pdf) · [GAA article](https://www.gaa.ie/article/gaa-games-intelligence-unit-report-weeks-9-13) | Official analysis | SIO | Totals | M | GIU |
| 13 | Other GIU league reports (R4, R6, weeks 5–8) | [R4](https://www.gaa.ie/api/images/image/upload/prd/jjk5ozfyojrci67wusne.pdf) · [R6](https://www.gaa.ie/api/images/image/upload/prd/gzjablz9280tz38j5pyw.pdf) · [Weeks 5–8](https://www.gaa.ie/article/games-intelligence-unit-report-weeks-5-8) | Official analysis | **UNRESOLVED** (not read) | Turnover metrics exist | — | GIU |
| 14 | Goalkeeper passes 19.9 / 25.7 → 1.4 | [Irish Times (Mar 2025)](https://www.irishtimes.com/sport/gaelic-games/2025/03/21/frcs-rule-adjustment-results-in-less-goalkeeper-involvement-in-advanced-areas/) | Media reporting GIU | SIO | Rule effect | M | GIU |
| 15 | FRC review; roving keeper by division; solo-and-go and kick-passing | [FRC Review of New Rule Enhancements](https://www.gaa.ie/api/images/image/upload/prd/rremqfzkehvuononuugj.pdf) · [RTÉ, rule changes after FRC meeting](https://www.rte.ie/sport/football/2025/0227/1499248-rule-changes-could-come-about-after-frc-meeting/) · [Irish News](https://www.irishnews.com/gaa/gaelic-football/kickouts-keepers-and-cards-on-frcs-agenda-ahead-of-big-weekend-W42OZN3MB5CDXBIOOYOFKDSKBI/) | Official + media | SIO | FRC interpretation | L–M | FRC |
| 16 | Final FRC report (Sep 2025): handpass ratio, four-point goal, youth handpass | [Irish Times](https://www.irishtimes.com/sport/gaelic-games/2025/09/04/final-frc-report-proposes-review-of-four-point-goals-and-suggests-handpass-limits-trialled-among-youths/) | Media reporting FRC | SIO | Garbled ratio (**conflict**) | L | FRC |
| 17 | Points per game 34 → 46; styles; Ryan Cup trials | [RTÉ Brainstorm (2026)](https://www.rte.ie/brainstorm/2026/0915/1590930-coaching-science-gaelic-football-rule-changes-outcome/) | Academic-authored commentary | SIO | Totals; opinion | M / L | Independent author |
| 18 | Two-point analysis; xP model | [RTÉ Brainstorm (2025)](https://www.rte.ie/brainstorm/2025/0710/1522747-gaelic-football-championship-two-point-scores-analysis/) | Academic-authored commentary | SIO | Two-point efficiency | L–M | Independent |
| 19 | Two-point frequency / conversion | [Sports News Ireland](https://www.sportsnewsireland.com/gaa/two-point-revolution-11-8-attempts-per-game-51-success-rate-how-gaa-2025-was-redefined-by-rule-changes) · [The42 (Feb 2026)](https://www.the42.ie/two-pointers-gaelic-football-6959659-Feb2026/) · [Gaelic Life](https://www.gaeliclife.com/news/twice-as-nice-a-year-of-two-pointers/) | Aggregator / media | SIO | **Conflicting** figures | L | Unknown derivation |
| 20 | Dublin two-point narrative; Mayo 2026 | [Irish Times (May 2026)](https://www.irishtimes.com/sport/gaelic-games/2026/05/29/dublins-high-percentage-shooting-philosophy-is-haunting-them-in-two-point-era/) · [2026 All-Ireland SFC, Wikipedia](https://en.wikipedia.org/wiki/2026_All-Ireland_Senior_Football_Championship) · [RTÉ, O'Donoghue opinion](https://www.rte.ie/sport/football/2026/0806/1586718-odonoghue-one-point-shots-are-becoming-a-waste-of-time/) | Media / pundit | SIO | Opinion + counts | L | Independent |
| 21 | Underage: Laois U13 FRC subset; U12 not required | [Laois Coiste na nÓg 2026](https://laoisgaa.ie/laois-coiste-na-nog-regulations-2026/) · [Carryduff GAC](https://carryduffgac.com/introducing-the-2025-football-rule-updates/) · [Go Games U12 rules](https://gaa-pathway-resources.com/rules-regulations/football/under-12s-rules) | County / club | SIO | Age variants | M | Independent (county) |
| 22 | LGFA rules 2026 | [LGFA Special Congress motions (Apr 2026)](https://ladiesgaelic.ie/wp-content/uploads/2026/04/LGFA-Playing-Rules-Approved-at-Special-Congress.pdf) · [LGFA enhancements summary](https://ladiesgaelic.ie/wp-content/uploads/2026/04/LGFA-New-Playing-Rules-Enhancements-Summary.pdf) | Official (LGFA) | SIO | Different ruleset | M | Independent body |
| 23 | GIU purpose / lead | [Irish Examiner, GIU operational](https://www.irishexaminer.com/sport/gaa/arid-41799023.html) · [GAA Performance Analysis Day 2025](https://www.gaa.ie/article/2025-gaelic-games-performance-analysis-day-a-huge-success) | Media / official | SIO | Source provenance | M | — |
| 24 | FRC could not access team GPS data | [Irish Examiner](https://www.irishexaminer.com/sport/gaa/arid-41586337.html) | Media | SIO | Limits on the physical/positional evidence | L–M | — |
| 25 | Pre-2025 Gaelic findings | See the [landscape audit ledger](./phase2-game-understanding-landscape.md#evidence-ledger) (#11–#22) | Peer-reviewed | AO / SIO | §6.4, §23 classifications | M | Low independence (see there) |

**Independence summary:**
- **Rule wording:** every rendering ultimately derives from the GAA. Agreement shows consistent reporting, not independent verification.
- **Rule effects:** #11–#16 are **one source family** (GIU/FRC). #17–#18 are independent commentary. #19 is of low and unknown provenance.
- **No peer-reviewed post-2025 study was found.**

---

## Sources

All sources are listed in the evidence ledger above.

Phase 1 and Phase 2 documents are cited by relative link. No Phase 1 gate, lever or principle is modified by this document.
