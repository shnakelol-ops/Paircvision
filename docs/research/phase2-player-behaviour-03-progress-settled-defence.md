# PáircVision — Phase 2 — Player Behaviour Audit 03
## P7: Progressing Against a Settled Defence

**Type:** Research only. No sessions, drills, UI, Tactical Slate or production code. No new PáircVision doctrine.

**Read first:**
- [Audit 01 (P5)](./phase2-player-behaviour-01-regain-unsettled-defence.md)
- [Audit 02 (kickout)](./phase2-player-behaviour-02-kickout-contest-breaking-ball.md)
- [Game structure audit](./phase2-current-game-structure-audit.md)
- [Phase 1 Final Synthesis](./phase1-final-synthesis.md)

**Status:** third Player Behaviour audit, September 2026. P7 is taken unchanged from the game structure audit. Phase 1 is not reopened.

**Purpose:** stress-test the architecture on a problem that has **no trigger**, involves **continuous possession** against an **organised** opponent, and has **several legitimate solutions**.

> ### ⚠️ ACCESS AND EVIDENCE CAVEAT
>
> 1. **No full text was read.** Every source is an abstract or search-index summary (AO/SIO).
> 2. **There is almost no Gaelic research on settled attack as such.** The Gaelic evidence below consists of possession-level associations (duration, passes, phases), a pre-rules national trend study, and **pundit** commentary on the 2025–26 game. **No post-2025 measurement of settled attack was found.**
> 3. **Most operational content is imported from soccer** (the tracking-data literature on passing effectiveness and defensive disruption), plus a little handball and basketball. Every translation is marked.
> 4. Rules are TRIANGULATED, not verified (game structure audit §1, with the Audit 02 correction).
> 5. **No causal claims.** "Disruptive passes are more common in successful attacks" is an association.
> 6. The observability claims (§12) have **not** been tested on footage (Audit 02 §13.1).

**Labels:**
- **MEASURED-GAELIC** (with era)
- **CROSS-SPORT**
- **PRACTITIONER / PUNDIT**
- **RULE LOGIC**
- **PV-SYNTHESIS** — PáircVision reasoning
- **UNKNOWN**

---

## 0. Headline findings

1. **"Progress" is not one construct.** Soccer research measures it in at least four ways, and they can disagree:
   - **territory** — the ball moves forward;
   - **opponents bypassed** — "packing" / defenders outplayed;
   - **defensive disruption** — how much a pass moves the defensive shape (D-Def);
   - **scoring value** — expected possession value (EPV).

   A pass can gain territory without disrupting anything, or disrupt without gaining territory.
2. **Can a sideways or backward action progress the attack? Plausibly yes, by the disruption and value constructs** (CROSS-SPORT):
   - In Dutch league data, **passes in successful attacks were more disruptive**, and the **penultimate pass** (the "hockey assist") differed most.
   - Value models explicitly treat *when* a backward pass is worth taking.
   - **Gaelic evidence: none direct.** GAA's own trend study linked *more* backward passes (2011–23) with a more conservative game.
   - **Result:** "use the ball and movement to improve the picture" **survives as a defensible coaching heuristic**, not as a scientific claim.
3. **P7 has no beginning event. It is a state.** It begins when the defence is **balanced** — pressure on the ball, cover behind, enough defenders goal-side.
   - It ends when an advantage appears (the state changes), when possession ends, or when the phase turns into another problem.
   - This reframes P5: **its core is the unsettled-defence state; a regain is only one way into it.** A line-break in settled attack can create the same state.
4. **What players try to change** (displace a defender, create an overload, isolate, switch, create time, access dangerous space) are **overlapping means toward one aim**: altering attacker–defender–space relations until a better-valued option exists.
   - They are distinct as *means* and overlapping as *ends*.
   - "Force defensive rotation" is practitioner language with no Gaelic measurement.
5. **Traditional principles appear inside P7, but not as one category:**
   - **width, depth, support, mobility and spacing** behave as **resources / relationships**;
   - **penetration** behaves as an **aim or outcome**;
   - **overload** behaves as a **state**.

   The hypothesis "principles are resources, not the top-level structure" **survives in modified form**, not as stated.
6. **The current rules reshape P7** (RULE LOGIC):
   - Under 4v3, a settled attack is **at best 11 v 11 outfield + goalkeeper** in that half, so **any advantage must be local, not global**.
   - The **goalkeeper recycling outlet** has been legislated away.
   - The **two-point arc** gives settled attack a new legitimate end-point: a shot *from* the arc, not only a way *through* the defence.
   - **Measured post-2025 settled-attack behaviour: none.** Pundits say it is "still too easy to control possession" and describe compromise defensive shapes.
7. **Architecture verdict: SURVIVES — no new layer was needed** (unlike Audits 01 and 02). Two clarifications of *content*, not structure:
   - (a) problems are **entered through states, not triggers**;
   - (b) "how the picture changed" needs an **explicit, problem-specific progress construct**, and P7's construct is contested.
8. **Linked problems:** supported, with a new wrinkle. **P6 (support) and P14 (keep 4v3) are not peers** of the other problems. They are **cross-cutting constraints or resources embedded inside others.**
9. **Coach test: PARTLY. Generalisation decision: A** — sufficiently general to synthesise, with explicit provisos (§16).

---

## 1. Definitions

| Term | Working definition | Source / status |
|---|---|---|
| **Settled / organised defence** | A defence that is **balanced**: pressure on the ball, cover (back-up) behind, balance across the width, enough defenders goal-side. Under 4v3, at most 11 outfield + goalkeeper in its own half. | CROSS-SPORT (Tenga et al. imbalanced/balanced rating, inverse). Gaelic: "set defence", "blanket", "low block" (PRACTITIONER); undefined. |
| **Defensive line / block** | The shape formed by defenders goal-side of the ball; a "low block" sits deep, near its own goal | PRACTITIONER. Soccer tracking measures lines by centroid, surface area and spread (CROSS-SPORT). |
| **Possession** | A team possession, from gain to loss or score | MEASURED-GAELIC (PA convention) |
| **Progression** | **Contested.** Four constructs: territory; opponents bypassed; defensive disruption; change in scoring value | CROSS-SPORT (§6) |
| **Penetration** | Bypassing defenders (ball or players ending goal-side of opponents) | CROSS-SPORT (packing / "defenders outplayed", Rein et al. 2017). Imported principle (Wade), undefined in Gaelic sources. |
| **Attacking advantage** | A relation the defence cannot currently cover: a free player within usable range, a local overload, an isolated 1v1 in a scoring position, an uncontested shot from a valuable location | PV-SYNTHESIS (extends Audit 01) |
| **Useful space** | Space whose use **improves the attacking relationship**, i.e. reachable before defenders close it, and nearer a scoring option or keeping the advantage | PV-SYNTHESIS (Audit 01 §9). Soccer "space control" models formalise it (CROSS-SPORT). |

**Test: can an action that moves the ball backwards or sideways still progress the attack?**
- **By territory: no, by definition.**
- **By bypassed opponents: rarely.**
- **By disruption or value: yes, plausibly.**
  - The disruption model measures defensive movement in the ~3 s after a pass, **regardless of its direction**.
  - Value models evaluate backward passes explicitly (CROSS-SPORT; direction-specific findings **not recovered**, SIO).
- **The answer depends on the construct chosen.** This is the central definitional finding of this audit.

---

## 2. Does P7 have a beginning?

**No single event.** P7 is best understood as a **state** that exists while the defence is balanced and we have the ball (PV-SYNTHESIS).

| Question | What could tell coach and player | Observable? |
|---|---|---|
| Is the defence settled now? | Pressure on the ball; defenders goal-side ≥ our players ahead; cover behind the pressuring defender; compact shape | Mostly **REQUIRES JUDGMENT**; the goal-side count is roughly **DIRECTLY OBSERVABLE** |
| Has an advantage appeared? | A defender displaced out of a lane; a free player within passing range; a local overload; an unpressured shot from a valuable location (incl. at the arc) | **REQUIRES JUDGMENT** |
| Has it disappeared? | A defender recovered; lane closed; pressure restored | REQUIRES JUDGMENT |
| Has the problem become another one? | Shot range reached (→ P8); entry to the 20 m (→ P9); possession lost (→ P10); defence broken (→ unsettled-defence state, P5-like); fouled (→ solo-and-go restart) | Mostly **DIRECTLY OBSERVABLE** (the event) |

**Consequence for P5 (PV-SYNTHESIS):**
- P5 was defined by its entry route (a regain).
- P7 shows the same **unsettled-defence state** can also arise *inside* a settled attack (after a line-break or a switch).
- **Problems are better defined by state than by trigger.** The trigger is one of several routes in.

This is recorded, not frozen. P1–P16 are unchanged.

---

## 3. The picture as a moving sequence

**Does P7 require PICTURE t1 → ACTION → PICTURE t2 → … permanently? Yes.** Settled attack is a continuous sequence of small changes. No single picture captures it (PV-SYNTHESIS). The same sequence Audit 02 introduced is the *normal* case here, not an extension.

| Change between pictures | Evidence it matters | Observable? |
|---|---|---|
| Pressure on the ball | CROSS-SPORT (Tenga; MLS) | DIRECTLY OBSERVABLE (approx.) |
| Defensive numbers goal-side | CROSS-SPORT (packing / outplayed) | DIRECTLY OBSERVABLE (count) |
| Defensive spacing / shape (compactness, lines) | CROSS-SPORT (D-Def: centroid, lines, surface area, spread) | REQUIRES JUDGMENT from the sideline; measurable from tracking |
| Defender orientation / movement | CROSS-SPORT (dyad research) | REQUIRES JUDGMENT |
| Width / depth of the attack | PRACTITIONER; CROSS-SPORT (team spread) | REQUIRES JUDGMENT |
| Local overload | CROSS-SPORT (Vilar; handball numerical relations) | REQUIRES JUDGMENT |
| Defender displaced from a zone or lane | CROSS-SPORT (disruption) | REQUIRES JUDGMENT |
| Line / space opened | CROSS-SPORT | REQUIRES JUDGMENT |
| Support relationship (options available to the carrier) | PRACTITIONER | REQUIRES JUDGMENT |
| Shooting opportunity (incl. arc) | MEASURED-GAELIC (shot location → efficiency, pre-arc); RULE (arc) | Location: DIRECTLY OBSERVABLE. "Opportunity": REQUIRES JUDGMENT. |

**No metrics are proposed.** Soccer metrics exist only with tracking data, which club coaches do not have.

---

## 4. What is the player trying to change?

| Candidate | Distinct means? | Evidence | Verdict |
|---|---|---|---|
| Move / displace a defender | Yes | CROSS-SPORT (disruption associated with successful attacks) | Supported as a construct (cross-sport) |
| Create / use a numerical advantage | Yes (local) | CROSS-SPORT (Vilar; handball organised-attack studies of numerical relations) | Supported (cross-sport) |
| Create / use a spatial advantage | Overlaps with displacement | CROSS-SPORT (space control) | Overlapping description |
| Create time for the ball carrier | Overlaps (less pressure = more time) | PRACTITIONER | Overlapping description |
| Access a more dangerous space | An **aim**, not a means | MEASURED-GAELIC (location → shot efficiency, pre-arc) | Aim |
| Create a shooting opportunity | An **aim** | Same | Aim (and exit to P8) |
| Force defensive rotation | A means (make defenders shift across) | PRACTITIONER only | **Unsupported coaching language** in Gaelic football; plausible via disruption |
| Isolate a defender (1v1) | Yes | CROSS-SPORT (handball; futsal dyads) | Plausible |
| Switch the point of attack | Yes (a means to exploit a compact ball-side shape) | PRACTITIONER; CROSS-SPORT (disruption, indirectly) | Plausible; no direct effectiveness study found |

**Finding (PV-SYNTHESIS):** these are **several means toward one aim**: changing attacker–defender–space relations until a better-valued option exists. Treating them as separate "principles" would multiply vocabulary without adding distinctions a coach can observe.

---

## 5. On-ball and off-ball (P5 correction kept)

| Role | What they can change | Can they improve the picture without receiving? | Evidence |
|---|---|---|---|
| **Ball carrier** | Carry to commit a defender; pass to change the point of attack; hold to let others move; shoot | — | CROSS-SPORT; PRACTITIONER |
| **Nearest support** | Offer a secure option; move away to create space for a carry | **Yes** (by clearing space) | PRACTITIONER |
| **Players ahead** | Hold depth to pin defenders; come short to drag a defender out of a line; run beyond | **Yes** (pinning / dragging) | PRACTITIONER; CROSS-SPORT (basketball spacing; handball second-line movement) |
| **Players away from the ball** | Hold width to stretch the block; prepare the switch | **Yes** (by stretching) | PRACTITIONER; CROSS-SPORT (team spread) |
| **Security players** | Offer a recycle option; provide rest defence (**4v3: ≥4 back incl. goalkeeper**) | Indirectly (they enable risk elsewhere) | RULE LOGIC; CROSS-SPORT (rest defence) |
| **Goalkeeper** | May join the attack only if a 4th player stays back; cannot be recycled to in the own half outside the large rectangle | Rarely | RULE (TRIANGULATED); goalkeeper passes fell ~94 % after the 4v3 amendment (GIU, league 2025) |

**Can an off-ball action improve the picture without the player receiving? Plausibly yes.**
- Evidence: soccer **team-level** disruption measures (which include off-ball effects on defensive shape); basketball spacing; handball second-line movement studies.
- **Transfer caution:** handball "curtains" and blocks, and basketball screens, **may be illegal obstruction in Gaelic football**. Only *movement-based* occupation transfers. Legality of specific screens is **UNKNOWN / not assumed**.
- **Measured in Gaelic football: no.**

---

## 6. Progress ≠ forward — stress test

| Action | Can it progress (by which construct)? | Evidence | Status |
|---|---|---|---|
| **Lateral circulation** | Disruption / value: yes *if* the defence shifts and a lane opens; otherwise no | CROSS-SPORT (D-Def direction-agnostic); GAA trend study (circulation linked to conservative play) | **Conditional** |
| **Switch** | Disruption: plausibly (it exploits ball-side compactness) | PRACTITIONER; no direct effectiveness study found | PLAUSIBLE |
| **Backward pass** | Value: sometimes (resets for a better angle); territory: no | CROSS-SPORT (EPV models evaluate it; findings not recovered). MEASURED-GAELIC trend: backward passes ↑ 2011–23 alongside a more conservative game. | **Conditional; often non-progressive** |
| **Carrying** | Territory / disruption: yes, if it commits defenders | PRACTITIONER; Gaelic 2011 counter-attack summary ("carry, break the tackle") | PLAUSIBLE |
| **Direct kick pass** | Territory / bypass: yes, if received | CROSS-SPORT (packing correlates with team strength); advanced-mark rule rewards it (adult) | PLAUSIBLE |
| **Changing point of attack** | = switch | — | PLAUSIBLE |
| **Drawing defenders** | Disruption: yes by construction | CROSS-SPORT | PLAUSIBLE |
| **Create then exploit** | The two-step "hockey assist" pattern: the penultimate pass was most distinctive in successful attacks | CROSS-SPORT (Eredivisie, d = 0.23, association) | **Most direct cross-sport support** |

**Gaelic counterpoint:**
- More backward, lateral and goalkeeper passing (2011–23) accompanied a game the GAA itself called conservative.
- Some 2025 pundits say possession is "still too easy to control".
- **Sideways or backward passing is not progressive in itself.** It is progressive only if it changes the picture.

**Verdict:** "use the ball and movement to improve the picture" **survives as a DEFENSIBLE COACHING HEURISTIC**. It must **not** become a scientific claim, and it must not license endless circulation. **"Improve" has to be observable** (§12). Otherwise the heuristic is unfalsifiable.

---

## 7. Traditional principles inside P7

| Principle | Where it appears in P7 | Category |
|---|---|---|
| Width | Stretching the block; preparing the switch | **Resource / relationship** |
| Depth | Pinning defenders; offering a recycle option | Resource / relationship |
| Support | Options for the carrier (security, forward, clearing space) | Resource, **cross-cutting** (appears in every problem) |
| Mobility | Movement that drags or displaces defenders | Resource (a means) |
| Spacing | Distances among attackers that keep defenders stretched | Resource / relationship |
| Penetration | Bypassing defenders | **Aim / outcome**, not a resource |
| Overload | Local numerical superiority | **State** (a picture feature) |

**Hypothesis test:** "Traditional principles are resources used to solve recurring problems rather than the top-level structure."
- **Survives in modified form** (PV-SYNTHESIS):
  - *most* principles (width, depth, support, mobility, spacing) behave as **resources/relationships**;
  - penetration behaves as an **aim**;
  - overload behaves as a **state**.
- **Rejected as stated:** "principles" are not a single category, so they cannot all sit at one level of the architecture.
- **Evidence status: conceptual, not empirical.** No study compares organising coaching by principles vs by problems.

---

## 8. Multiple legitimate solutions

**Same picture, several reasonable solutions.**

Example picture (illustrative, not a pattern):
- defence compact centrally at the adult 20–40 m band;
- pressure on the carrier loose;
- one free teammate wide;
- carrier at the arc edge.

Reasonable options:
- **switch wide**;
- **two-point attempt** (adult rules, if within the shooter's range);
- **carry to commit** the nearest defender;
- **recycle** to draw the block out.

**What makes a solution appropriate relative to the picture** (PV-SYNTHESIS, consistent with Audit 01):

| Criterion | Evidence |
|---|---|
| It uses an advantage that exists now, or creates one at acceptable risk | CROSS-SPORT (conditional effectiveness) |
| It is within the player's technical range under the current pressure | GPOI separation (Kinnerk); Gaelic failed-handpass association |
| It preserves security proportionate to the risk (4v3 rest defence) | RULE LOGIC; CROSS-SPORT (rest defence) |
| It fits the score/time context (incl. two-point value; hooter) | MEASURED-GAELIC qualitative (players use score/time) |

**Preserved:**
- **Outcome alone does not establish decision quality.** A scored two-pointer may have been the worse option. A recycled ball may have been the better one.
- Two coaches may legitimately prefer different solutions in the same picture. That is a **game-model difference**, not an error.

---

## 9. Execution

```
PICTURE / RELATIONSHIP → DECISION → EXECUTION → NEW PICTURE
```

| Observed | Attributable to |
|---|---|
| Switch kick overhit out of play | Execution (the decision may have been sound) |
| Carry into a covered defender, tackled | Decision *or* execution (did they misjudge the cover, or lose a winnable duel?) — often **indeterminate** |
| Lateral pass, defence does not shift, ball recycled again | Not a failure of execution. May be a picture-appropriate probe, or unproductive circulation; needs the next pictures to judge. |
| Two-point attempt wide | Execution, *or* a decision beyond range; needs the player's range history |
| Hand pass intercepted | Execution or decision (was the lane open?) |

**The same rule as Audits 01 and 02:** a failed kick, pass or carry is **not automatically** a failed decision.

---

## 10. Current Gaelic rules and P7

| Rule | Logical consequence (RULE LOGIC) | Measured post-2025? |
|---|---|---|
| **4v3** | A settled defence has at most 11 outfield + goalkeeper in its half. A settled attack has at most 11 there (the attacking team keeps ≥4 back incl. goalkeeper). **Globally, parity or a deficit (11 v 12).** Any advantage must be **local**. The 14–15-man blanket is illegal. | **No** (only goalkeeper passes: ~20–26 → ~1.4 per game) |
| **Goalkeeper restriction** | The goalkeeper cannot be a recycling outlet in the own half (outside the rectangle). The 2025 "12v11 keep-ball" solution was legislated away. | Partly (goalkeeper pass drop) |
| **Two-point arc** | Adds a legitimate **end-point at the arc edge**, not only inside. Defence must guard **two zones**. "Progress" may mean *getting a shooter an uncontested look at the arc*, not getting closer. | Two-point frequency data exist but are weak and conflicting (game structure audit §3) |
| **Scoring (1/2/3)** | Changes the value of options within a picture | UNKNOWN |
| **Hooter (2026)** | Late-game settled possession acquires time value | UNKNOWN |
| **Advanced mark** | Rewards a long delivery into the 20 m. A settled-attack option. | Frequency UNKNOWN |

**Post-2025 commentary (PUNDIT, not measurement):**
- "It's still too easy to control possession" (Irish Examiner, 2025 championship).
- Defensive shapes described as a "Goldilocks" compromise between man-on-man and a low block (Irish Examiner, Dec 2025).

**Older evidence:** possession-duration and pass-count associations and the 2011–23 conservative-trend data **NEED RE-TESTING** under 4v3 and the arc. Do not assume they describe the current settled game.

---

## 11. U12 variant

U12 (age × rules map; SIO):
- up to 13-a-side on a reduced pitch (20 m to 20 m);
- **two skills per possession**;
- no 4v3 found;
- no two-point arc found;
- no marks.

| Element of P7 | Survives at U12? |
|---|---|
| Progressing against an organised defence | **Core survives** (organised defences are possible at 13-a-side; how organised U12 defences actually are is UNKNOWN) |
| Progress ≠ forward; picture improvement | Survives |
| Off-ball occupation, width, depth | Survives (geometry smaller) |
| Carrying to commit | **Constrained** (skill limit), so passing and movement carry more of the load |
| Local vs global numbers | Survives, but the 4v3 structure is absent |
| Arc end-point / two-point decisions | **Absent** |
| Goalkeeper restriction | UNKNOWN |

**The Age × Rules verdict (B: core problem + contextual variants) is maintained.** P7 does not contradict it.

---

## 12. Observation — can the key terms be operationalised?

| Term / observation | Classification | Operationalisable for coaching? |
|---|---|---|
| Ball location, direction and type of each action | **DIRECTLY OBSERVABLE** | Yes |
| Count of defenders goal-side of the ball | **DIRECTLY OBSERVABLE** (approx.) | Yes |
| Pressure on the carrier (none / loose / tight) | **REQUIRES JUDGMENT** (moderate) | Yes, with anchors |
| **"Created space"** | **REQUIRES JUDGMENT** | Only if redefined as an observable change, e.g. *"a defender left the lane and a teammate became free within passing range"* |
| **"Moved the defence"** | **REQUIRES JUDGMENT** (measurable only with tracking) | Partly: "did the nearest defenders shift ≥ X after the pass?" needs a threshold that doesn't exist |
| **"Recognised overload"** | **PLAYER-INTERNAL** | No. Observable instead: *did an overload exist* (judgment) and *did the ball go there* (direct). |
| **"Good support"** | **REQUIRES JUDGMENT + role definition** | Only relative to the picture and the job (security / forward / clearing / stretch) |
| **"Progressed the attack"** | **Depends on the construct** | Territory: direct. Bypassed defenders: judgment. Disruption or value: tracking only. **A coach must choose a proxy, knowing proxies disagree.** |
| Shooting opportunity at the arc | Location direct; "opportunity" judgment | Partly |

**Finding:**
- The P7 vocabulary is **operationalisable only through proxies**, and those proxies are **not equivalent**.
- Sideline coaching could plausibly use: goal-side count, pressure, whether a teammate became free within range, and ball location.
- "Moved the defence" and "progressed" remain judgments unless tracking data exist.
- **Untested** for inter-observer agreement.

---

## 13. Architecture stress test

**Current candidate:**
OPTIONAL PLANNED STRUCTURE ↓ RECURRING PROBLEM ↓ PICTURE/STATE OVER TIME ↓ INFORMATION ↓ ON/OFF-BALL DECISIONS ↓ POSSIBLE SOLUTIONS ↓ EXECUTION ↓ HOW THE PICTURE CHANGED ↓ NEXT RECURRING PROBLEM

| Layer | P7 | Needed? |
|---|---|---|
| Optional planned structure | Team attacking shape / game model (positions, rotations) | **Yes** (a team's settled-attack structure is planned, as at kickouts) |
| Recurring problem | A **state**, not an event | Yes (clarification: state-entry) |
| Picture / state over time | Continuous sequence | **Yes, essential** |
| Information | Pressure, goal-side count, free players, shape, arc | Yes |
| On/off-ball decisions | Many coupled micro-decisions; off-ball critical | Yes |
| Possible solutions | Plural and legitimate (§8) | Yes |
| Execution | Separate | Yes |
| How the picture changed | Needs an explicit **progress construct** | **Yes, but the construct is contested** |
| Next recurring problem | P8, P9, P10, unsettled-defence state, restart | Yes |

### **Verdict: SURVIVES.**

- **No new layer was required.** Every layer was used, and none was redundant.
- Unlike Audits 01 and 02, P7 did not force a structural change.
- **Two clarifications of content** (not structure):
  1. **Problems are entered through states.** Triggers such as a regain or a kickout are entry routes, not definitions.
  2. **"How the picture changed" must name its progress construct** (territory / bypass / disruption / value / ladder). Different problems use different constructs, and for P7 the choice is contested.

---

## 14. Linked-problem hypothesis

**Plausible transitions out of P7** (PV-SYNTHESIS; not a full map):

| From P7 to | When |
|---|---|
| **P8** (create a shot / choose shot value) | Shooting range reached, incl. the arc |
| **P9** (enter the scoring area) | Entry to the 20 m; advanced-mark delivery |
| **Unsettled-defence state** (P5 core) | A line-break or switch destabilises the defence |
| **P10** (react to possession loss) | Turnover |
| Restart problems (solo-and-go) | Fouled in possession |
| **P15** (late game under the hooter) | Final minutes |
| **P4** (escape pressure) | The defence presses high and the settled attack is pushed back into its own half |

**Cross-cutting, not peers:**
- **P6 (support a ball carrier under pressure)** appears *inside* P4, P5, P7 and the kickout break.
- **P14 (keep 4v3)** is a *constraint* on every attacking and pressing problem.
- Treating them as peers of P7 would double-count.

**Finding:** the linked-graph hypothesis is **supported**, with a refinement. The inventory contains **three kinds of item**:
1. **states / problems** (P1–P5, P7–P13, P15–P16);
2. **cross-cutting resources** (P6);
3. **rule constraints** (P14).

**Not frozen.**

---

## 15. Coach test

**Can this research help an ordinary coach understand what "progress against a settled defence" means without prescribing an attacking system?**

### **PARTLY.**

**What can be said:**
- Against an organised defence, progress means **changing the picture**: a defender pulled out of place, a teammate freed within range, a better shooting look. It does not necessarily mean moving the ball forward.
- Sideways and backward passes can help **only if** something changes. Circulation that changes nothing is not progress.
- Players off the ball can progress the attack **without touching it**, by pinning, dragging or stretching defenders.
- The same picture can have several good answers. A failed kick or tackle-loss is not automatically a bad decision.
- Under current adult rules, the defence can't pack 14 behind the ball, the goalkeeper isn't a recycling outlet, and a shot from the arc is a legitimate end-point. **Any advantage must be local.**

**What is missing:**
- **Gaelic measurement of any kind** for settled attack under the current rules.
- An **agreed, observable progress proxy** for sideline use. The proxies disagree, and none is tested for agreement.
- **Gaelic legality boundaries** for off-ball screening (what transfers from handball and basketball).
- How organised **U12** defences actually are.

---

## 16. Generalisation decision

Three deliberately different cases:
- **P5:** reactive, open play, single stage.
- **Kickout:** planned then emergent, multi-stage, rule-created.
- **P7:** continuous, no trigger, organised opposition, plural solutions.

### **A — The architecture is sufficiently general to synthesise.**

**Why A:**
- Across the three cases the layers were **added in the first two tests** (picture layer, coupled decisions, picture change, execution; planned structure, temporal sequence, outcome ladder, exit links) and **held without addition in the third**.
- P7 is the case most likely to break it: no trigger, continuous, plural solutions. It required **clarifications of content, not new structure**.

**Provisos the synthesis must carry (not optional):**
1. **Evidence strength ≠ architecture strength.** The architecture is conceptually general. The **content** inside it is mostly imported or unmeasured for the current Gaelic game.
2. **Observability is untested.** The inter-observer reliability pilot flagged in Audits 01 and 02 remains a **prerequisite before any product or coaching use**. It is not a prerequisite for documenting the synthesis.
3. **Problem inventory structure:** the synthesis must handle **states vs triggers**, **cross-cutting resources (P6)** and **rule constraints (P14)**.
4. **Progress constructs** must be explicit per problem.
5. **Age / county rules** remain an input (Age × Rules verdict B).

**Recommended next:** the Game Understanding architecture synthesis. **Not performed here.**

---

## Evidence ledger

| # | Claim | Source | Category | Access | Conf. |
|---|---|---|---|---|---|
| 1 | Passing effectiveness via defenders outplayed / space control | [Rein, Raabe & Memmert 2017](https://www.sciencedirect.com/science/article/abs/pii/S0167945716302676) | CROSS-SPORT | AO | M |
| 2 | Defensive disruption (D-Def) higher in successful attacks; penultimate pass most distinctive (d = 0.23) | [“Hockey assist” D-Def validation (Entropy 2021)](https://www.mdpi.com/1099-4300/23/12/1607) · [Move it or lose it](https://www.researchgate.net/publication/334083926_Move_it_or_lose_it_Exploring_the_relation_of_defensive_disruptiveness_and_team_success) | CROSS-SPORT (tracking, association) | AO / SIO | M |
| 3 | EPV frameworks evaluate pass value incl. backward passes | [Fernández, Bornn & Cervone](https://arxiv.org/abs/2011.09426) · [Revisiting EPV (2025)](https://arxiv.org/abs/2502.02565) | CROSS-SPORT (modelling) | AO | L–M (direction findings not recovered) |
| 4 | Packing: opponents bypassed; correlates with team strength; limitations | [StatsBomb, Unpacking ball progression](https://statsbomb.com/articles/soccer/unpacking-ball-progression) · [Packing explained](https://the-footballanalyst.com/packing-rate-football-statistics-explained/) | CROSS-SPORT (analyst) | SIO | L–M |
| 5 | Balanced vs imbalanced defence; elaborate vs counter-attack effectiveness | [Tenga et al. 2010](https://pubmed.ncbi.nlm.nih.gov/20391096/) | CROSS-SPORT | AO | M–H |
| 6 | Handball organised attack: numerical relations; second-line movement | [Numerical relation, centre back (Frontiers 2019)](https://pmc.ncbi.nlm.nih.gov/articles/PMC6861297/) · [Wingers as second-line players](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11079937/) | CROSS-SPORT | AO / SIO | L–M |
| 7 | Space in football: scoping review | [Krampe et al. 2026](https://doi.org/10.1177/17479541261417207) | CROSS-SPORT (review) | SIO | L–M |
| 8 | GAA 2011–23 trends: more hand, back and goalkeeper passes; conservative game | [RTÉ (2023)](https://www.rte.ie/sport/football/2023/0928/1407954-new-study-outlines-stark-extent-of-possession-football/) | MEASURED-GAELIC (official analysis, pre-rules) | SIO | M |
| 9 | Gaelic possession associations (duration, phases, passes) | [A transition game? (2023)](https://www.tandfonline.com/doi/full/10.1080/24748668.2023.2250972) · [Determinants (2020)](https://www.tandfonline.com/doi/abs/10.1080/24748668.2020.1758433) | MEASURED-GAELIC (pre-rules) | SIO | L–M |
| 10 | "Still too easy to control possession"; 2025 observations | [Irish Examiner, Brosnan (2025)](https://www.irishexaminer.com/sport/gaa/arid-41631775.html) · [Brosnan, 2025 season observations](https://www.irishexaminer.com/sport/gaa/arid-41768996.html) | PUNDIT | SIO | L |
| 11 | "Goldilocks" defensive system | [Irish Examiner (Dec 2025)](https://www.irishexaminer.com/sport/gaa/arid-41754726.html) | PUNDIT | SIO | L |
| 12 | Current rules; goalkeeper pass drop; two-point data | [Game structure audit](./phase2-current-game-structure-audit.md) · [Audit 02 §1.2 correction](./phase2-player-behaviour-02-kickout-contest-breaking-ball.md) | TRIANGULATED / GIU | — | M |
| 13 | U12 rules | [Age × rules map](./phase2-age-rules-map.md) | County / national (SIO) | — | L–M |
| 14 | Decision / execution separation | [Kinnerk et al. 2025](https://pubmed.ncbi.nlm.nih.gov/40388689/) | EXPERIMENTAL (Gaelic) | AO | M |

**Independence:**
- The cross-sport soccer items (#1–#4) come from **different groups**, but all use elite tracking or event data that **club coaches cannot replicate**.
- The Gaelic items are **pre-rules** (#8–#9) or **pundit** grade (#10–#11).
- **No independent post-2025 Gaelic settled-attack evidence exists.**
