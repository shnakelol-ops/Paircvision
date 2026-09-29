# PáircVision — Phase 2 — Player Behaviour Audit 02
## Own Kickout Contest & Breaking Ball (U14+ / adult)

**Type:** Research only. No sessions, drills, UI, product design, Tactical Slate or production code.

**Read first:**
- [Current-Rules Game Structure Audit](./phase2-current-game-structure-audit.md)
- [Age × Rules Map](./phase2-age-rules-map.md)
- [Player Behaviour Audit 01 (P5)](./phase2-player-behaviour-01-regain-unsettled-defence.md)
- [Phase 1 Final Synthesis](./phase1-final-synthesis.md)

**Status:**
- This is the second Player Behaviour audit, September 2026.
- It stress-tests the structure that emerged from P5. It is **not assumed to survive**.
- It covers P1 (own kickout) and P3 (breaking ball) from the game structure audit, both unchanged.
- Phase 1 is **not reopened**.

> ### ⚠️ ACCESS AND EVIDENCE CAVEAT
>
> 1. **No full text was read.** Every source is an abstract or a search-index summary (AO / SIO).
> 2. **Rules are TRIANGULATED, not verified.** The official 2026 rule texts remain inaccessible; the game structure audit §1 still governs. This audit found **one correction** (§1.2): the kickout-mark 50 m penalty was scrapped in June 2025.
> 3. **Current Gaelic kickout evidence is almost entirely one source.** It is the GAA Games Intelligence Unit (GIU): 2025 league Rounds 1–3, as reported by media. **Kickout retention, break-ball outcomes and post-kickout outcomes under the new rules were not found.**
> 4. **Pre-2025 kickout research describes a restart that no longer exists** in the men's game (short kickouts inside the arc). It is used only where its logic is rule-independent (§10).
> 5. **The reliability mini-test (§13) could not be run.** Match footage was inaccessible (YouTube blocked; GAA+ paywalled). It is **not simulated**.

**Evidence labels (as requested):**
- **CURRENT-GAELIC** — post-2025 measured.
- **PRE-2025-GAELIC**
- **CROSS-SPORT**
- **PRACTITIONER**
- **PV-SYNTHESIS** — PáircVision reasoning.
- **UNKNOWN**

---

## 0. Headline findings

1. **The current game makes the contested kickout the norm.**
   - 79–80 % of kickouts now go beyond the 45 m line.
   - 61–68 % are contested (2025 league R1–3), against 26–36 % in 2023–24.
   - This is CURRENT-GAELIC, single source.
   - **Who wins them, and what follows, is UNKNOWN** under current rules.
2. **"Win the kickout" conceals a chain of at least five sub-problems.** Each stage has its own picture, information and decisions:
   1. set up a contest on favourable terms;
   2. first contact;
   3. break;
   4. second possession;
   5. use or defend.

   The chain **exits into other recurring problems**:
   - P5 when the opposition is unsettled;
   - P4 when our side is under press;
   - P10 when the ball is lost.
3. **"Won / lost kickout" is a weak outcome measure.** Pre-2025, the most common outcome after a *won* kickout was a turnover (sub-elite). AFL analysts moved from raw hitouts to "hitouts to advantage" for the same reason. An **outcome ladder** is more informative (§5): first touch → clean possession or break → second possession → secure possession → attacking advantage.
4. **Planned vs emergent is the key contrast with P5.**
   - Before the kick, positions, numbers, roles and cover can legitimately be planned.
   - After the ball leaves the kicker's foot, landing, contest outcome and **break direction** can only be adapted to.
   - **Structure plausibly stops at the point of contact.** From there on, the problem is emergent.
   - This does not show that more autonomy is better. It shows that some decisions *cannot* be pre-made.
5. **"Read the break" can be partly unpacked into observables:**
   - starting position relative to the contest (front / side / behind; distance);
   - movement during flight;
   - timing of the first step after contact;
   - numbers within a few metres of the landing area.

   The anticipation itself is **not observable**.
6. **Architecture: SURVIVES WITH MODIFICATION.** It needs:
   - a **planned-structure layer** before the picture;
   - a **temporal sequence of pictures** (pre-kick → flight → contact → break → second possession) instead of a single picture;
   - an **outcome ladder** instead of won/lost;
   - explicit **exit links** to other problems.

   The P5 amendments (picture layer, coupled decisions, picture change, execution layer) all carry over.
7. **Coach test: PARTLY.**
8. **Next: A**, a third radically different problem. The recommended candidate is **P7, progressing against a settled defence**. It has **no event anchor**, so it tests whether the architecture depends on discrete trigger moments. An observation-reliability pilot on real footage is flagged as a **prerequisite before any synthesis**.

---

## 1. What current evidence says happens on contested kickouts

### 1.1 Measured (CURRENT-GAELIC, GIU, single source)

| Metric | 2023 | 2024 | 2025 (league R1–3, 47 games) |
|---|---|---|---|
| Short kickouts | 51 % | 51 % | **21 %** |
| Kickouts beyond the 45 m | 59 % | — | **~80 %** (79 % "long") |
| Contested kickouts | 36 % | 26 % (championship) | **61 % → 68 %** (rising each round; ~64–67 % reported) |
| Ball in play | — | ~62 % (championship) | ~57 % |

**Not found for the post-2025 game:**
- kickout retention by the kicking team;
- break-ball win rates;
- clean-catch rates;
- kickout-mark frequency;
- outcomes after kickouts.

One aggregator reports "~18 break balls per game". Its provenance is unknown and it is **not used**.

### 1.2 Rule state relevant to the kickout (TRIANGULATED; see the game structure audit §1)

- Kicked from the 20 m line.
- The ball must cross the 40 m arc before the kicking team plays it.
- The kicking team's direct receivers must start outside the arc.
- All players must be 13 m from the ball.
- The opposition may intercept inside the arc.
- The kickout may not be passed straight back to the goalkeeper.
- 4v3 applies: at most 11 pressers in that half, and the kicking team has at most 11 outfield players in its own half.
- **Kickout mark:** a clean catch past the 45 m line gives a 4 m play-on.

> **Correction to the game structure audit:** the **50 m advance for fouling a kickout-mark catcher was scrapped in June 2025** (Central Council, 38–1). It was replaced by a free from where the offence occurred; the fouled player may instead take the free from the mark or a solo-and-go.
>
> The 2025 kickout data therefore span **two mark regimes**. The 2026 permanent text is assumed to carry the June 2025 version, but this is **not verified**. A correction note has been added to the game structure audit.

---

## 2. The actual recurring problem

**Is it "win the kickout"? No. That label conceals a chain** (PV-SYNTHESIS, consistent with CROSS-SPORT restart and second-ball literature):

| Stage | Sub-problem | Status of evidence |
|---|---|---|
| K0 · pre-kick | **Create a contest on favourable terms**, or a delivery that avoids one (the 40–45 m band; a wide target; a quick kickout) | Rule logic; LGFA strategy classes (PRE-2025, other code) |
| K1 · flight / first contact | **Win first possession** (clean catch or mark) **or influence the contact** (tap, break, spoil) | Contest rate CURRENT-GAELIC; outcome UNKNOWN |
| K2 · break | **React to an unpredictable loose ball; be first to it** | CROSS-SPORT (soccer second balls; AFL crumbing); Gaelic UNKNOWN |
| K3 · second possession | **Secure the ball under a press that is still set** (no goalkeeper recycle) | Rule logic; P4 overlap |
| K4 · exit | **Use it** (P5 if the opposition is unsettled; progress if not) **or defend immediately** if lost (P10) | Links to other problems |

**Not forced:**
- "influence where the break goes" is plausibly part of K1 (tapping or directing the ball) rather than a separate problem;
- "exploit if won" is P5 or another problem, not a kickout problem.

**Finding:** the kickout is a **multi-stage problem whose later stages are other recurring problems**. The P1–P16 inventory is therefore better read as a **graph of linked problems** than as a flat list (PV-SYNTHESIS).

---

## 3. Picture / state before the kick

| Element | What it is | Observable? |
|---|---|---|
| Player locations (both teams) | Starting positions relative to the arc, the 45 m, the sidelines and each other | **DIRECTLY OBSERVABLE** (wide-angle video) |
| Numbers around likely landing areas | Counts in the zones the kicker can reach | Directly observable **once zones are defined**. Zone choice **REQUIRES JUDGMENT**. |
| Space | Unoccupied areas beyond the arc | Requires judgment |
| Match-ups | Who is on whom; height or aerial strength | Pairings: requires judgment. Aerial ability: **not observable from one clip**. |
| Goalkeeper / kicker options | Kick range, accuracy, quick-kick possibility | Range and accuracy **not observable from one clip** (needs history) |
| Opposition structure | Press size (≤11), zonal vs player-to-player, who is left spare | Size: directly observable. Zonal vs man: **REQUIRES JUDGMENT** (LGFA research built a reliable system for this, so it is feasible). |
| First contestant position | Where the primary target starts and moves | Directly observable |
| Supporting / second players | Positions around, in front of and behind the target | Directly observable |

**Rule-created features of the picture** (TRIANGULATED): receivers outside the arc; 13 m exclusion; a cap of 11 pressers; no return to the keeper.

---

## 4. Information during ball flight — and after contact

| Information | Available before the kick? | Emerges during flight? | Emerges only at / after contact? | Evidence |
|---|---|---|---|---|
| Trajectory / hang time | Partly (kicker's habit or signal) | **Yes** | — | CROSS-SPORT (fly-ball research) |
| Landing area | Planned target, if pre-agreed | **Refined during flight** | — | CROSS-SPORT |
| Opponent movement toward the ball | Starting positions only | **Yes** | — | PV-SYNTHESIS |
| Teammate movement | Plan | **Yes** | — | — |
| Likely contest winner | Match-up guess | Partly (who arrives first or higher) | **Decided at contact** | UNKNOWN (no Gaelic data) |
| **Break direction** | — | — | **Only at contact** | CROSS-SPORT / practitioner (AFL "front and square" crumbing positions reflect probable break zones) |
| Emerging free space | Partly | Yes | Yes | — |

**Cross-sport note (fly-ball catching):**
- Laboratory evidence suggests catchers **continuously control their movement from the ball's optical motion**, cancelling optical acceleration, rather than predicting the landing point at launch.
- If this transfers, "judging the flight" is a **continuous coupling** that unfolds during flight, not a one-off prediction.
- It is **imported** (baseball and softball, often in VR), and uncontested catches only. Transfer to a contested Gaelic aerial duel is **UNKNOWN**.

**Key contrast with P5:**
- In P5, the decisive information exists **at the regain** and **decays** as the defence recovers.
- In the kickout, the decisive information **does not yet exist before the kick**. It **accumulates** during flight (~2–3 s, UNKNOWN precisely), and the break direction is only **revealed** at contact.
- The **information timeline is inverted**.

---

## 5. Decisions — who, and when

| Role | Decisions that can be prescribed before the kick | Decisions that require adaptation after the ball is kicked |
|---|---|---|
| **Goalkeeper / kicker** | Target zone or signal; length (40–45 m band vs long); quick vs set; which match-up to target | Whether to switch target in response to late press movement (within the pre-kick window); execution adjustments |
| **Primary contestant** | Starting spot and run line; catch vs tap intent (as a default) | Jump timing; catch vs tap vs spoil in the moment; body position in the duel |
| **Nearest support** (break players) | Start positions relative to the target (front / side / behind); responsibility zones | Movement during flight; first step after contact; attack the break vs hold |
| **Players around the contest** | Screening / blocking-off roles (within the rules); numbers committed | Whether to join the break or hold width |
| **Players beyond / behind** | Cover role (in case the break goes long, or the opposition wins); rest-defence obligations (4v3) | Recover vs push up, depending on the contest outcome |

**Decision Allocation (connected, not reopened):**
- The kickout is a clear case where **structural decisions** can legitimately be taken by the coach or team plan: numbers, positions, target options.
- **Within-flight and post-contact decisions cannot be** taken that way. There is no time for anyone but the player.
- DA-1 to DA-3 already say legitimacy is conditional on the objective. The kickout is an illustration: **the allocation boundary is set by when the information exists.**

---

## 6. First ball vs breaking ball

**Is "winning the kickout" the wrong outcome measure? Largely yes.**

| Outcome level | Meaning | Evidence that it matters |
|---|---|---|
| First touch | Who touches the ball first | AFL: raw hitouts are a weak indicator; "hitouts to advantage" were introduced because first touch ≠ possession (CROSS-SPORT, analyst practice) |
| Clean possession / mark | A caught ball (mark if past the 45 m) | Rule reward (4 m play-on) |
| Break | Ball loose after contact | — |
| Second possession | Who gains control after the break | Soccer: second balls won were associated with more shots and offensive actions (World Cup data, CROSS-SPORT, association) |
| Secure possession | Control maintained (e.g. through the next actions) | PRE-2025-GAELIC: the most common outcome after a *won* kickout was a turnover (sub-elite, 2020–21) |
| Attacking advantage | Possession *and* a favourable picture (e.g. opposition press bypassed) | Rugby: a won contestable restart can yield "free" phases vs a disorganised defence (PRACTITIONER / analysis) |

**Finding (PV-SYNTHESIS, consistent with cross-sport measurement practice):**
- Kickout performance should be read as **where on this ladder the sequence ended**, not "won/lost".
- LGFA research modelled **"successful possession from the kickout"** rather than first touch, which is a Gaelic precedent (other code, pre-2025).
- **Which ladder levels predict scoring under the current rules is UNKNOWN.**

---

## 7. Breaking ball — what can defensibly be said

| Phrase | Unpacked into | Observable? | Evidence |
|---|---|---|---|
| "Anticipate the break" | Starting position on likely break lines before contact | Position: **DIRECTLY OBSERVABLE**. "Anticipation": **PLAYER-INTERNAL**. | PRACTITIONER (AFL "front and square") |
| "Positioning" | Distance and angle to the contest: in front / side / behind; not so close that you end up in the same duel, not so far that you arrive late | Distance: requires judgment (estimated). Angle: observable. | PRACTITIONER; optimal distances **UNKNOWN** |
| "React" | Latency from contact to first purposeful step toward the ball | **REQUIRES JUDGMENT** (frame counting) | CROSS-SPORT (reaction/anticipation research generally); Gaelic UNKNOWN |
| "Attack the break" | Moving at pace toward the ball's path, not waiting | Observable (running vs static at contact) | PRACTITIONER |
| "Cover behind" | At least one player deeper than the contest, able to reach long breaks or delay an opposition win | Directly observable | PRACTITIONER; CROSS-SPORT (rest defence) |
| "Numbers around the landing area" | Count of each team within a set radius at contact | Directly observable **given a radius**. The radius is a judgement (soccer analysts use 10–15 m "drop zones"). | CROSS-SPORT (analyst convention) |
| "Movement while the ball is airborne" | Adjusting position to the refined landing area | Directly observable | CROSS-SPORT (fly-ball continuous control) |

**Not defensible from evidence:**
- **any claim about where breaks usually go** in Gaelic football;
- **any claim about optimal support distances.**

Both are UNKNOWN.

---

## 8. Planned vs emergent

| Can be planned before the kick | Cannot be known until the ball / opponents move |
|---|---|
| Numbers committed; starting positions; roles (contest, break front/back/side, screen, cover); target options and signals; quick-kick policy; cover and rest-defence shape (4v3) | Exact flight and landing; who wins the contact; **break direction**; who gets to the loose ball first; the picture at second possession (is the press still set? is the opposition unsettled?) |

**Where tactical structure stops and adaptation begins** (PV-SYNTHESIS):
- **Plausibly at contact.** Before contact, structure sets the *distribution* of players against *likely* outcomes. After contact, players act on the *actual* outcome.
- A secondary boundary sits in the **pre-kick window**. The goalkeeper and team can adapt the plan to the press they see (e.g. change the target), which is itself an emergent decision.

**Not assumed:** that more autonomy is better.
- The kickout is where planned structure is **most defensible** of any P1–P16 problem.
- Over-planning post-contact behaviour (fixed break routes) would conflict with the physics of the break. That is inference; no Gaelic study tests it.

**Contrast with P5:** P5 is almost wholly emergent (a regain is unplanned). The kickout is **planned → emergent**. The architecture must represent both.

---

## 9. Execution vs decision

| Observed | What a coach can infer | What they cannot |
|---|---|---|
| Correct starting position, **lost the aerial duel** | The positioning decision was sound (by plan); the duel was lost (execution or opponent quality) | Whether a different match-up would have won |
| Correct decision to catch, **mistimed jump** | Execution error (visible timing) | Why (perception of flight vs physical) |
| **Poor starting position, lucky break** | Outcome good, process poor | — |
| Good break-ball movement, **fumbled pickup / poor pass** | Decision/positioning good; execution failed | — |
| Break won, **carried into the press** | The decision after second possession is questionable (P4/P5 territory) | What the player saw |
| Player static at contact | Observable non-movement | Whether they misjudged or were following a role instruction |

**Rule** (as in P5, following the GPOI separation): an **outcome** does not identify a **decision**. The **plan** must be known to judge whether a position was "correct".

**Implication:** a coach judging kickout behaviour needs to know **the intended structure**. Observation without the plan is ambiguous.

---

## 10. How the picture changed (not just WON/LOST)

| Question | Observable indicator (candidate) |
|---|---|
| Improved the chance of possession? | Our numbers vs theirs near the landing point at contact; our player first to the break |
| Created favourable second-ball numbers? | Count within radius at contact |
| Protected against losing the contest? | Cover player(s) deeper than the contest; 4v3 compliance |
| Created an attacking opportunity? | Possession secured with the opposition press bypassed or unsettled (P5 conditions, §2 of Audit 01) |
| Left the team exposed if lost? | No cover; numbers committed forward; opponents free beyond the contest |

---

## 11. Evidence by category

| Category | Content |
|---|---|
| **CURRENT-GAELIC** | Short 21 %; beyond the 45 m ~80 %; contested 61–68 % (league R1–3, 2025, GIU). Ball in play ~57 %. Kickout-mark penalty changed June 2025 (a rule change, not behaviour). **Retention and outcomes: UNKNOWN.** |
| **PRE-2025-GAELIC** (reclassified) | The kicking team won ~65 % (sub-elite 2020–21): **STRUCTURALLY OBSOLETE** benchmark. Short kickouts inside the 45 most successful: **OBSOLETE** (except the 40–45 m band). Quick kickouts (0–10 s) did better: **NEEDS RE-TESTING**. The most common outcome after a won kickout was a turnover: **LIKELY STILL RELEVANT as a warning** that "won" ≠ secure (logic, not value). Opposition numbers inside the 65 affected win %: **NEEDS RE-TESTING** (4v3 caps). |
| **LGFA (other code)** | 2,172 kickouts (2019–23). Four offensive and three defensive strategies; numbers committed and strategy influenced outcome; zonal press with 11+ and "Flat 4" most effective; **a valid and reliable analysis system was developed**, a precedent for §12–13. Successful teams won ~80 % own / ~29 % opposition. **Different rules; transfer UNKNOWN.** |
| **CROSS-SPORT** | Soccer second balls (World Cup 2018/2022) associated with offensive output. Soccer analyst "drop zone" convention (10–15 m, ≤3 s). AFL hitouts-to-advantage and crumbing ("front and square"; "the ruck starts it, the midfield decides it"). Rugby restart analysis (best teams regain ~40 % of their own restarts; contestable restarts can win possession against an unset defence). Fly-ball catching (continuous optical control). |
| **PRACTITIONER** | Emphasis on physical midfielders and break-ball positioning (media); "read the break" |
| **PV-SYNTHESIS** | Stage chain K0–K4; outcome ladder; the contact boundary for structure; exit links |
| **UNKNOWN** | Break-direction distributions; optimal support distances; which ladder level predicts scores; U14 kick ranges |

---

## 12. U14+ variants (no national U14 structure claimed)

| Parameter | Variation found (age × rules map) | Consequence for this problem |
|---|---|---|
| **Kickout method** | "U13/U14 kickouts from the hand from the 20 m line" (unattributed county source) vs adult FRC kickout | Trajectory and hang time may differ. Contest geometry UNKNOWN. |
| **FRC kickout rules at U14** | National statement ("down to U14"; mandatory status UNKNOWN). Dublin: all FRC at U13–U16. Laois U13: FRC kickout **not listed**. | Whether U14 players face the arc-minimum kickout **depends on county** |
| **Arc size** | "Much smaller" at U13 (FRC); U14 standard (statement) | **If the arc is also the kickout minimum, U13 kickouts may be shorter by rule.** UNKNOWN (kickout use of the U13 arc not found). |
| **Kick range** | Physical capacity of U14 keepers vs a 40 m minimum is UNKNOWN (not a rule question) | If many keepers barely clear 40 m, landing areas cluster in a narrow band. The problem differs from the adult one in practice. |
| **Kickout mark** | Present where all FRC rules apply; absent where not listed | Catch reward differs |
| **Numbers** | 15-a-side mostly; U17 academy mainly 13-a-side (Laois) | Press caps and spare-player counts differ |
| **Limerick** | **UNKNOWN** (no 2026 rules found) | Must be established before any Limerick testing |

**Finding:** the kickout problem at U14 is **county-parameterised**. Its structure (chain K0–K4) plausibly survives. Its **geometry** (arc, kick range, method) varies.

---

## 13. Observability test

| Proposed observation | Could two coaches identify it from the same clip? |
|---|---|
| Starting positions of all players | **DIRECTLY OBSERVABLE** (wide-angle footage; TV often cuts away, see §14) |
| Numbers committed to the press / to the landing zone | **DIRECTLY OBSERVABLE** (count), given a defined zone |
| Kick length band (short / 40–45 m / beyond the 45 m) | **DIRECTLY OBSERVABLE** |
| Contested vs uncontested | **REQUIRES JUDGMENT** (GIU uses a definition we could not access) |
| Clean catch / mark | **DIRECTLY OBSERVABLE** (the referee's signal helps) |
| Who touched first | **DIRECTLY OBSERVABLE** (usually) |
| Break direction | **DIRECTLY OBSERVABLE** |
| Our/their numbers within X m at contact | **REQUIRES JUDGMENT** (distance estimation) |
| Player position relative to the contest (front / side / behind) | **REQUIRES JUDGMENT** (moderate) |
| Movement during flight (moving vs static) | **DIRECTLY OBSERVABLE** |
| Reaction latency after contact | **REQUIRES JUDGMENT** (frame-level) |
| Cover player present deeper than the contest | **DIRECTLY OBSERVABLE** |
| Second possession won by | **DIRECTLY OBSERVABLE** |
| Possession secure at +N actions / seconds | **DIRECTLY OBSERVABLE** (given a definition) |
| Press zonal vs player-to-player | **REQUIRES JUDGMENT** (a reliable system exists in LGFA research) |
| Position "correct" | **REQUIRES JUDGMENT + knowledge of the plan** |
| Player "anticipated" / "read" the break | **PLAYER-INTERNAL / NOT OBSERVABLE** |
| What the kicker or contestant noticed | **PLAYER-INTERNAL / NOT OBSERVABLE** |
| Duel lost through execution vs opponent quality | **REQUIRES JUDGMENT** (often indeterminate) |

### 13.1 Reliability mini-test — **not performed**

- Public current Gaelic footage could not be accessed from this environment: YouTube is blocked by the network proxy, and GAA+ is paywalled.
- **No test was simulated.**

**A priori prediction** (to be checked by a real test, and **not a result**): the categories most likely to fail agreement are:
1. "contested" (without an operational definition);
2. numbers-within-radius (distance estimation on broadcast angles);
3. front/side/behind position;
4. reaction latency.

**Practical footage constraint** (PV-SYNTHESIS): broadcast coverage often frames the ball, not the pre-kick structure. Pre-kick picture categories may need **wide-angle club or analyst footage**, not TV.

---

## 14. Architecture stress test

**Structure under test:**
RECURRING PROBLEM → PICTURE / STATE → INFORMATION → DECISIONS → POSSIBLE SOLUTIONS → EXECUTION → PICTURE CHANGE

| Element | P5 (regain) | Kickout contest | Verdict |
|---|---|---|---|
| Recurring problem | Single problem | **A chain of sub-problems** (K0–K4) exiting into other problems | Needs **stages and exit links** |
| Picture / state | One picture at the regain | **A sequence of pictures** (pre-kick, flight, contact, break, second possession) | Needs a **temporal sequence** |
| Information | Present at the regain; decays | **Accumulates during flight; revealed at contact** | Survives, with **timing of information** made explicit |
| Decisions | Coupled on/off-ball, emergent | **Planned (pre-kick) + emergent (post-contact)** | Needs a **planned-structure layer** (links to DA) |
| Possible solutions | Families (progress / manipulate / secure) | Role-specific (contest / break / cover / screen) | Survives |
| Execution | Separate layer | Separate layer (aerial duels make it prominent) | Survives |
| Picture change | Relative to the defence | **Outcome ladder** (first touch → attacking advantage) | Survives, generalised as "where the sequence ended" |

### **Verdict: SURVIVES WITH MODIFICATION.**

**Revised candidate (not frozen):**

```
RECURRING PROBLEM
  → [PLANNED STRUCTURE — where the problem allows it]
  → PICTUREₜ → INFORMATIONₜ → COUPLED DECISIONSₜ → BEHAVIOURS → EXECUTION
  → PICTUREₜ₊₁  … (repeat per stage)
  → EXIT STATE (outcome ladder) → linked recurring problem (e.g. P5, P4, P10)
```

- P5 is the **one-stage, no-plan** case of this structure. The kickout is the **multi-stage, planned-then-emergent** case.
- The structure has **not failed**. But it has now been modified twice: after P5, and here. That is a reason for **one more test before synthesis** (§16), not a reason to stop.

---

## 15. Coach test

**Can this research help an ordinary U14+ coach understand contested kickouts better without giving them a rigid kickout pattern?**

### **PARTLY.**

**What we can teach (defensible):**
- The kickout is several problems in a row: setting up the contest, the contact, the break, the second possession, then using or defending it.
- "Did we win it?" is less useful than **"where did the sequence end up?"**
- The **plan** can legitimately set who is where, how many commit and who covers. **After the ball is contested, players have to adapt.** No plan can say where the break goes.
- Useful break-ball behaviour is **observable**: players around the landing area, moving during flight, first to the loose ball, someone covering behind.
- A lost duel after correct positioning is **not** a positioning error.
- Current rules make contested kickouts the norm (CURRENT-GAELIC).

**What remains unknown:**
- which outcome levels matter most under current rules;
- where breaks tend to go;
- optimal support distances;
- which structures work in men's football post-2025;
- how U14 rules and kick ranges change the problem in a given county (including Limerick).

**Why not YES:** almost nothing about *effective* behaviour is measured in the current men's game.

**Why not NO:** the problem decomposition, the outcome ladder, the planned/emergent boundary and the observable break-ball behaviours are coherent and avoid a rigid pattern.

---

## 16. Next decision (recommended, not performed)

### **A — Test a third, radically different recurring problem: P7 (progress against a settled defence).**

**Why:**
- P5 and the kickout are both **event-anchored**: a regain or a kick starts the clock and defines the first picture.
- The architecture's picture layer has never been tested on a **continuous, low-event phase** where no trigger moment defines "the picture". Settled attack against an organised ≤11 + keeper defence is the obvious case: long duration, repeated micro-decisions, an arc decision, 4v3 obligations.
- If the architecture survives P7 without a new structural modification, **B (synthesis)** becomes defensible. If it needs a third modification, the architecture itself needs revision (F).

**Why not the others:**
- **B:** two problems and two modifications is not yet generalisability.
- **C (go deeper on kickouts):** the missing evidence is **current measurement**, which desk research cannot supply.
- **D (Coach Intervention):** premature.
- **E (Phase 1 translation):** premature, for the same reason.
- **F:** not warranted. The structure survived both tests.

**Prerequisite flag (not a recommendation to do now):** before any synthesis, an **observation-reliability pilot on real wide-angle footage** is needed. Both audits rest on observability claims that have never been tested (§13.1; Audit 01 §23).

---

## Evidence ledger

| # | Claim | Source | Category | Access | Conf. | Independence |
|---|---|---|---|---|---|---|
| 1 | Short 21 %; contested 61–68 %; beyond the 45 m ~80 %; ball in play 57 % | [GIU R1–3 report](https://www.gaa.ie/api/images/image/upload/prd/nmh7spo3cmg0okwyfntj.pdf) · [RTÉ](https://www.rte.ie/sport/football/2025/0222/1498294-early-data-shows-kickout-shift-but-handpassing-static/) · [Irish Examiner](https://www.irishexaminer.com/sport/gaa/arid-41579956.html) | CURRENT-GAELIC | SIO | M | **GIU single source** |
| 2 | Kickout-mark 50 m penalty scrapped (June 2025) | [RTÉ](https://www.rte.ie/sport/football/2025/0617/1518974-kick-out-mark-50m-penalty-scrapped-in-favour-of-free/) · [Irish Times](https://www.irishtimes.com/sport/gaelic-games/2025/06/17/kickout-mark-rule-changed-after-central-council-vote/) · [Irish Examiner](https://www.irishexaminer.com/sport/gaa/arid-41653247.html) · [The42](https://www.the42.ie/kickout-mark-penalty-change-6735719-Jun2025/) | Rule (official decision via media) | SIO | M–H | Same origin |
| 3 | Current kickout rules | [Game structure audit §1](./phase2-current-game-structure-audit.md) | TRIANGULATED | — | M | — |
| 4 | "~18 break balls per game" (**not used**) | [Sports News Ireland](https://www.sportsnewsireland.com/gaa/the-effects-of-new-gaelic-football-rules-on-the-2025-season) | Aggregator | SIO | L | Unknown provenance |
| 5 | Sub-elite kickouts: 65 % won; short most successful; turnover most common after a won kickout | [Kickouts in sub-elite Gaelic football (2022)](https://www.tandfonline.com/doi/full/10.1080/24748668.2022.2086515) | PRE-2025-GAELIC | AO / SIO | M | — |
| 6 | LGFA kickout strategies; reliable system; 11+ zonal press and Flat 4; 80 % / 29 % | [McColgan et al. 2026](https://www.mdpi.com/2076-3417/16/7/3277) · [Kickout performance LGF (2025)](https://www.tandfonline.com/doi/abs/10.1080/24748668.2024.2416738) | LGFA (other code), PRE-2025 | AO / SIO | M | Same group |
| 7 | Soccer second balls associated with offensive output | [Sunjic et al. 2025, IJPAS](https://www.tandfonline.com/doi/full/10.1080/24748668.2025.2462399) | CROSS-SPORT | AO | M | — |
| 8 | Second-ball "drop zone" convention | [Lamberts, Expected Second Ball Retention](https://marclamberts.medium.com/introducing-expected-second-ball-retention-adding-value-to-second-balls-1988aa309d9f) | CROSS-SPORT (analyst) | SIO | L | — |
| 9 | AFL hitouts to advantage; crumbing; the ruck starts, the midfield decides | [AFL.com.au, ruck evolution](https://www.afl.com.au/news/1110155/the-subtle-change-which-is-leading-to-ruck-evolution) · [AFLW definitions](https://www.afl.com.au/aflw/about-aflw/definitions) · [ESPN Champion Data](https://www.espn.com/afl/story/_/id/33846910/afl-2022-champion-data-deep-dive-ruckman-valuable-overrated-best-rucks-afl-revealed) | CROSS-SPORT (analyst / media) | SIO | L–M | — |
| 10 | Rugby restarts: ~40 % retention for the best teams; contestable restarts vs an unset defence | [RugbyPass analysis](https://www.rugbypass.com/news/analysis-restart-as-you-mean-to-go-on-how-kickoff-strategies-can-create-game-changing-momentum/) · [The Rugby Site](https://www.therugbysite.com/blog/kicking/restarts) · [World Rugby (sevens)](https://www.world.rugby/news/613994/how-kick-off-used-in-rugby-sevens) | CROSS-SPORT (analysis / practitioner) | SIO | L | — |
| 11 | Fly-ball catching: continuous optical control (OAC) | [McBeath et al. 1995, Science](https://www.science.org/doi/10.1126/science.7725104) · [Fink et al. (VR)](https://jov.arvojournals.org/article.aspx?articleid=2193327) · [Catchability judgments](https://pubmed.ncbi.nlm.nih.gov/28439251/) | CROSS-SPORT (lab) | AO | M (for uncontested catches) | — |
| 12 | U13/U14 kickout variants; county variation | [Age × rules map](./phase2-age-rules-map.md) | County / national (SIO) | — | L–M | — |
| 13 | GPOI decision/execution separation | [Kinnerk et al. 2025](https://pubmed.ncbi.nlm.nih.gov/40388689/) | EXPERIMENTAL (Gaelic) | AO | M | — |

**Independence:**
- All current Gaelic behavioural data (#1) come from **one source**.
- The cross-sport sources are independent of each other, but mostly **analyst or practitioner** grade (#8–#10).
- The strongest cross-sport items are #7 (peer-reviewed association) and #11 (lab, but uncontested catches).
