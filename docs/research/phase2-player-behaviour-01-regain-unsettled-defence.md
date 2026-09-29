# PáircVision — Phase 2 — Player Behaviour Audit 01
## P5: Exploiting an Unsettled Defence After a Regain

**Type:** Research only. No session design, drills, UI, Tactical Slate work or production code.

**Read first:**
- [Landscape Audit](./phase2-game-understanding-landscape.md)
- [Current-Rules Game Structure Audit](./phase2-current-game-structure-audit.md)
- [Age × Rules Map](./phase2-age-rules-map.md)
- [Phase 1 Final Synthesis](./phase1-final-synthesis.md)

**Status:** first Player Behaviour audit, September 2026. P5 is taken unchanged from the game structure audit. Phase 1 is **not reopened**.

**The question audited:** what does a player or team need to **perceive, decide and do** after regaining possession while the opposition is not yet defensively organised — and **when is immediate exploitation appropriate, and when is securing possession the better response?**

> ### ⚠️ ACCESS AND EVIDENCE CAVEAT
>
> 1. **No full text was read.** Every source is an abstract or a search-index summary (AO/SIO). That includes:
>    - Tenga et al.;
>    - González-Rodenas et al.;
>    - the Gaelic turnover and counter-attack papers;
>    - the GAA transition webinar;
>    - the LGFA "Develop Quick Attack from Defence" card.
> 2. **The Gaelic evidence for P5 is thin, associational and pre-2025.** The 4v3 rule changes the numbers at a regain (§15), and no study of post-2025 regains exists.
> 3. **Most operational detail here is imported from soccer**, the only sport with a published, repeated operational definition of an "imbalanced defence". Every import is marked (§14).
> 4. **Several Gaelic authors overlap.** The TU Dublin group (Mangan / Collins) wrote the 2023 elite and 2026 sub-elite turnover papers. They are not independent confirmation.
> 5. **Nothing here says what players perceived.** Observers see behaviour, not perception (§17).
> 6. **No causal claims.** "Counter-attacks were more effective against imbalanced defences" is an association in match data.

**Labels:**
- Evidence type: **MEASURED-GAELIC** · **CROSS-SPORT** · **OFFICIAL** · **PRACTITIONER** · **PV-SYNTHESIS** (PáircVision reasoning) · **UNKNOWN**.
- Relationship status (§18): **SUPPORTED** · **PLAUSIBLE** · **PRACTITIONER** · **UNKNOWN**.

---

## 0. Headline findings

1. **Unsettled vs settled defence can be made more observable than coaching language suggests.**
   - Soccer research rates an "imbalanced defence" by **loose pressure on the ball, lack of back-up (cover) and lack of balance**, i.e. too few defenders correctly placed between ball and goal (Tenga et al.; CROSS-SPORT).
   - Several features are observable from a sideline: pressure on the new carrier; how many defenders are goal-side of the ball; whether the regain happened behind opposition players; runners already ahead.
   - Others are not: communication, and what defenders intend.
2. **The best evidence says immediate exploitation pays only when the defence really is imbalanced.**
   - Soccer: counter-attacks beat elaborate attacks against imbalanced defences (odds ratio ~2.7) but **not** against balanced ones (~1.1, not significant).
   - A vertical action in the first ~3 s was associated with chances **only when the defence was unbalanced** (CROSS-SPORT, association).
   - **Transition is a decision problem, not a command to go fast.** That is SUPPORTED as an association.
3. **The Gaelic data contradict "fewest passes / fastest is best".**
   - Successful counter-attacks (2007–08) used **longer** passing sequences and lasted ~26–35 s.
   - Sub-elite post-turnover possessions (2023–24) scored more at 31–90 s. Regression favoured 1–10 passes.
   - Contact turnovers were associated with scoring, and the first action after a turnover predicted success. **Which first action is UNKNOWN** (not recoverable).
4. **No evidence supports a fixed transition window** ("you have 6 seconds").
   - Two thirds of goals from offensive transitions in top soccer leagues took **≥9 s**.
   - The defensible statement is that **the opportunity lasts while the defensive relationships stay unfavourable** (PV-SYNTHESIS, PLAUSIBLE).
5. **The first decision is richer than EXPLOIT NOW / SECURE FIRST.** At least three families:
   - **progress now**;
   - **progress by manipulating the picture** (carry to draw, play lateral to open a lane, switch);
   - **secure**.

   And the decision is **distributed**: off-ball players make options exist or not *before* the carrier chooses.
6. **Support inside P5 splits into distinct jobs** (security, forward option, width/stretch, occupying a recovering defender). The **closest supporter is not necessarily the best support**, and support can be given **without receiving the ball**. This is CROSS-SPORT / PRACTITIONER / PV-SYNTHESIS, **unmeasured in Gaelic football**. The SUPPORT stress test finds support to be a *set of jobs defined by the picture*, not one behaviour.
7. **Good-behaviour test: PARTLY** (§19). **Architecture stress test: survives, with four amendments** (§22).
8. **Next step: A** — test the architecture on a structurally different problem: **P1/P3, own-kickout contest and breaking ball** (U14+ variant) (§23).

---

## 1. Definitions

| Term | Working definition used here | Where the literature is inconsistent |
|---|---|---|
| **Possession won** | Any start of a team possession: own/opposition kickout, turnover, throw-in, free, mark | Gaelic PA papers class kickouts and throw-ins separately from "turnovers"; some practitioner sources fold everything into "turnover ball" |
| **Turnover (won) / regain** | Possession gained **in open play** from the opponent (tackle, interception, block, error, loose ball after a contest). "Regain" = the gaining team's view. | Whether blocks, won breaking balls and frees-for-fouls count varies by study. The 2026 sub-elite paper separates contact from non-contact turnovers (MEASURED-GAELIC). |
| **Unsettled / imbalanced defence** | At the moment of the regain, the losing team's defensive relationships are incomplete: **loose or no pressure on the new carrier, insufficient cover, and/or too few defenders correctly placed goal-side** relative to attackers and space | Soccer defines it by **observer rating** (Tenga et al.: loose pressure, lack of back-up and cover). Gaelic studies do not define it. "Unset", "unsettled", "broken" and "imbalanced" are used interchangeably in practice. |
| **Settled / balanced defence** | Pressure on the ball, cover behind it, balance across the width, enough defenders goal-side | Same observer-rating issue; a continuum, not a binary |
| **Counter-attack** | A possession that starts with a regain and **progresses quickly toward goal to exploit imbalance** | **Circular in soccer research.** Counter-attacks are usually *defined* as fast/direct, so studies cannot then show that speed caused success. The Gaelic 2011 definition is UNKNOWN. |
| **Transition** | The period after a change of possession until the defence is organised or the attack is settled. Also used for a *style*. | A 2024 narrative review calls for separating transition as a **moment** from transition as a **style of play** |
| **Exploitation** (PV-SYNTHESIS) | Any action that **improves the attacking situation before the defensive relationships are restored**: ball or players past defenders, a numerical advantage kept or created near goal, space gained that stays usable | No source defines it. PáircVision must avoid equating it with "forward/fast". |
| **Secure possession** (PV-SYNTHESIS) | An action whose main effect is to **reduce the immediate risk of losing the ball** (move it away from pressure, to a supported teammate) while keeping the chance to attack | No source defines it. "Recycle", "settle" and "keep it" are used loosely. |

**Observable-ness finding:**
- "Unsettled" **can** be operationalised as a small set of observable relations at a moment (§2).
- It **cannot** be a permanent label for a possession. It changes second by second.

---

## 2. What makes a defence unsettled? (hypotheses tested for observability)

| Candidate feature | Evidence | Observable from a sideline? | Status |
|---|---|---|---|
| **Pressure on the new ball carrier** (none / loose / tight) | CROSS-SPORT: a core rating in Tenga's balance definition. Soccer counters facing immediate pressure were less successful (González-Rodenas, MLS). | **Yes** (distance of the nearest opponent; closing or not) | SUPPORTED (cross-sport) |
| **Defenders goal-side of the ball vs attackers ahead of it** | CROSS-SPORT: "back-up", balance. Soccer rest-defence research counts rest defenders vs counter-attackers. | **Yes, approximately** (count players between the ball and the goal) | SUPPORTED (cross-sport) |
| **Ball won behind opposition players** (e.g. behind their midfield) | CROSS-SPORT: counters from the pre-offensive zone with initial penetration were more effective (MLS). MEASURED-GAELIC: possession start area was associated with outcome (2016, pre-rules). | **Yes** | PLAUSIBLE → SUPPORTED (association) |
| **Local numerical imbalance near the ball** | CROSS-SPORT: local numerical dominance near the ball is related to attacking space behind a line (Vilar et al., soccer/futsal) | **Partly** (the zone boundary is a judgement) | PLAUSIBLE |
| **Runners already ahead of the ball** | PRACTITIONER (Gaelic; GAA/Connacht "movement in front or behind the ball"). The 4v3 rule guarantees ≥3 forward (adult). | **Yes** | PLAUSIBLE |
| **Defenders running toward their own goal (recovering)** | CROSS-SPORT: futsal goal-scoring situations showed the attacker level with a defender at similar velocity (Vilar) | **Yes** (body orientation / running direction) | PLAUSIBLE |
| **Poor defensive spacing; open central space** | CROSS-SPORT (balance) | **Partly** (judgement) | PLAUSIBLE |
| **Unprotected width** | PRACTITIONER | Partly | PLAUSIBLE |
| **Goalkeeper position** | PRACTITIONER. Relevant to long-range shots and two-pointers (adult). | Yes | UNKNOWN (effect) |
| **Temporary local overload** | As local numbers | Partly | PLAUSIBLE |
| **Defensive communication / recovery incomplete** | — | **No** (audio and intent not observable) | UNKNOWN |

**Finding:** an observer can rate a defence's state at the moment of regain from about **four relatively observable relations**:
1. pressure on the ball;
2. cover / defenders goal-side;
3. regain location relative to opposition players;
4. runners ahead.

That matches the soccer instrument closely. **It is imported, not Gaelic-validated.**

---

## 3. What information must the player notice?

**CUE → EVIDENCE → DECISION IT MAY INFORM → CONFIDENCE**

| Cue | Evidence | Decision it may inform | Confidence |
|---|---|---|---|
| **Pressure on the ball** (am I about to be tackled?) | CROSS-SPORT (Tenga; MLS pressing); MEASURED-GAELIC indirectly (contact turnovers) | Secure first vs act now; carry vs release | M |
| **Defenders between ball and goal** vs our players ahead | CROSS-SPORT (balance / back-up) | Is there an advantage to use at all? | M |
| **Location of the regain** | MEASURED-GAELIC (area associated with outcome, 2016); CROSS-SPORT (pre-offensive zone) | How far to progress; how much risk is acceptable (near own goal vs far) | M |
| **Defender orientation / movement** (recovering toward goal?) | CROSS-SPORT (futsal dyads) | Whether the space ahead will close quickly | L–M |
| **Teammate positions** (ahead / wide / behind) | PRACTITIONER; PV-SYNTHESIS | Which option exists: forward, switch, security | M (logic) |
| **Available forward space** (usable, not just empty) | CROSS-SPORT (space-control models); PV-SYNTHESIS | Carry vs pass vs kick | L–M |
| **Width / depth of our shape** | PRACTITIONER | Switch vs central progression | L |
| **Local numerical relationship** | CROSS-SPORT (Vilar) | Attack the overload vs wait for support | M |
| **Distance to goal** (and the arc, adult) | MEASURED-GAELIC (shot efficiency by distance, pre-arc) | Shoot early vs keep progressing (adult: 2-pt option) | M |
| **Technical opportunity** (can I execute this kick or hand pass under this pressure?) | MEASURED-GAELIC indirectly (failed handpasses discriminated losers, 2014–15); GPOI separates execution from decision (Kinnerk 2025) | Choose an option within one's technical range | M (as a principle); UNKNOWN (thresholds) |
| **Score / time** | MEASURED-GAELIC (qualitative: players report using it, Frontiers 2023) | Risk appetite | M |
| **Current rules / 4v3 structure** (adult) | RULE LOGIC | Forward outlets always exist; our own 4-back obligation | M (rule), UNKNOWN (effect) |

**Connection to Phase 1 GI-2 (not reopened):** the cues that are rule-created or defence-state-created are exactly the information a practice can **remove by accident**:
- pressure on the ball;
- defenders goal-side;
- recovering defenders;
- forward outlets.

§21 returns to this.

---

## 4. The first decision

**Test:** can the first meaningful decision be represented as EXPLOIT NOW / SECURE FIRST?

**Finding: the binary is too coarse, and the decision is not only the carrier's.**

| Family | Examples | Evidence |
|---|---|---|
| **A. Progress now** | Immediate kick pass to a player ahead; carry into free space; short forward pass | CROSS-SPORT: vertical actions in the first ~3 s were associated with chances **only vs unbalanced defences** |
| **B. Progress by manipulating the picture** | Carry to draw a defender, then release; lateral pass to open a forward lane; switch to the unprotected side; hold briefly for a runner | CROSS-SPORT / PRACTITIONER (common coaching content; not measured). MEASURED-GAELIC (indirect): longer successful counter sequences (2007–08) |
| **C. Secure** | Pass away from pressure to a supported teammate; play back to reset; protect the ball in contact | MEASURED-GAELIC (indirect): winners had lower turnover rates and fewer failed hand passes (2014–15) |
| (Hold / delay) | Shield, wait for support | PRACTITIONER |

**Two structural observations (PV-SYNTHESIS):**
1. **Families B and C blur.** A lateral pass can be "securing" or "manipulating". What matters is **how the picture changes** after it (§18).
2. **The decision is distributed.** The carrier chooses among options that off-ball players **have or have not created**. A 2026 paper frames player transitions through **distributed situation awareness** (CROSS-SPORT, SIO), which supports a team-level framing.

So "the first decision" is at least two coupled decisions:
- **off-ball:** where to go to create or close options;
- **on-ball:** which option to take.

**Not proposed:** a decision tree.

---

## 5. What "exploit" actually means (observable behaviours)

"Exploit" ≠ first pass forward, sprint, long kick, minimum passes, or shot within X seconds.

| Behaviour that can improve the situation before the defence reorganises | Context where it plausibly helps | Evidence |
|---|---|---|
| **Carry into free space** | Space ahead, no immediate pressure, defenders recovering | PRACTITIONER; the Gaelic 2011 summary notes the need to "carry the ball, break the tackle" |
| **Find a player ahead of the ball** | Players ahead, a passing lane open | CROSS-SPORT (penetration within the first seconds) |
| **Attack a numerical advantage** | Local overload near the ball | CROSS-SPORT (Vilar) |
| **Move a defender before releasing** (commit, then pass) | 2v1 / 3v2 | CROSS-SPORT dyad research (rugby / futsal); PRACTITIONER |
| **Support beyond or around the ball** | Carrier under partial pressure | PRACTITIONER |
| **Stretch recovering defenders** (width, depth) | Defenders funnelling centrally | PRACTITIONER (width principle) |
| **Occupy a defender** (runs that hold a defender away from the ball) | Recovering defender could cover the carrier | CROSS-SPORT (basketball spacing; rugby decoys); PRACTITIONER (GAA: "runs create space for themselves or others") |
| **Third-player movement** | Pass-and-move sequences against recovering lines | PRACTITIONER (soccer) |
| **Switch into unprotected space** | Defence shifted ball-side | PRACTITIONER |

**Finding:**
- None of these has Gaelic measurement.
- **Every one is context-dependent.** Each helps in some pictures and is a failure mode in others (§12).
- A usable definition of "exploit" is therefore **outcome-relative**: *did the action leave us better placed relative to the defenders than before?* It cannot be a list of actions.

---

## 6. Support inside P5 — the SUPPORT stress test

| Support job | What it gives the carrier / team | Evidence |
|---|---|---|
| **Security** (behind or lateral, available under pressure) | A safe release if the carrier is pressed | PRACTITIONER; MEASURED-GAELIC indirect (turnover-rate findings) |
| **Forward option** (ahead, in a lane) | Progression | CROSS-SPORT; PRACTITIONER |
| **Width / stretch** | Pulls recovering defenders apart; opens central lanes | PRACTITIONER (width principle, imported) |
| **Depth** (beyond the last defender) | Threat that pins defenders back | PRACTITIONER |
| **Off-shoulder / close** | A hand-pass option in contact (a Gaelic-specific range) | PRACTITIONER |
| **Third-player run** | Option after the next pass | PRACTITIONER |
| **Decoy / occupy a recovering defender** | Removes a defender from the carrier's picture without receiving | CROSS-SPORT (basketball spacing; rugby decoys); PRACTITIONER (GAA) |

**The three questions:**

1. **Is the closest supporter necessarily the best support? — No, not necessarily.**
   - A close supporter can bring their defender toward the ball and crowd the carrier's space ("support crowding the ball", §12). This is PRACTITIONER / PV-SYNTHESIS.
   - **Tension with evidence:** soccer shows local numerical dominance near the ball matters (Vilar). Proximity can help *if* it creates a usable local overload.
   - So: **closeness is neither good nor bad; what matters is whether it creates or removes a usable option.** PLAUSIBLE; unmeasured in Gaelic football.
2. **Can a player support the attack without receiving? — Yes (PLAUSIBLE).** Occupying or dragging a recovering defender, and holding width, both change the carrier's options.
   - Basketball "spacing" and rugby decoy running are the cross-sport precedents.
   - GAA practitioner material says runs "create space for either themselves or others".
   - Measured in Gaelic football: **no.**
3. **Can moving away from the ball be useful support? — Yes, plausibly.** Moving away can open a lane or drag cover. The same logic and evidence status apply.

**Stress-test result:**
- Support in P5 is **a set of jobs whose value depends on the picture** (pressure, defenders goal-side, space).
- This reinforces the game structure audit's finding (§26 there) that support is not one thing.
- **Observable?** Partly. An observer can see *where* supporters went and whether an option existed. They cannot see *why*.

---

## 7. Ball carrier vs off-ball players

| Role | Must perceive (candidate) | Decisions | Plausible behaviours | Evidence |
|---|---|---|---|---|
| **Ball carrier** | Pressure; defenders goal-side; teammates' positions; space; own technical range; score/time | Progress now / manipulate / secure; carry vs pass vs kick; shoot (adult: 1 vs 2) | Carry into space; pass ahead; commit-and-release; secure away from pressure | CROSS-SPORT + MEASURED-GAELIC (indirect) |
| **Nearest support** | Pressure on the carrier; own defender's position | Offer security vs move to open space vs clear out | Show for a hand pass; move off to create space; overlap | PRACTITIONER |
| **Players ahead** | Recovering defenders; space behind them; carrier's view of them | Hold depth vs come short vs run in behind; occupy a defender | Stretch; run into a lane; decoy | PRACTITIONER; CROSS-SPORT (spacing) |
| **Players behind** | Risk of losing the ball; own-half cover (adult: 4-back obligation) | Join vs stay as security / rest defence | Offer a back pass; hold position | CROSS-SPORT (rest defence); RULE LOGIC (4v3) |
| **Goalkeeper** | Ball location; whether they can legally receive (adult: only inside the large rectangle with the passer, or in the opposition half) | Offer an outlet (rarely legal in own half) vs stay | Mostly positional; restart readiness | RULE (TRIANGULATED); UNKNOWN (U12) |

**Finding:** the traditional "support the ball" instruction conflates at least **four different off-ball problems**:
- security;
- ahead;
- behind / rest-defence;
- space-creating.

Each has different cues and different failure modes. **This is where "support" becomes too broad** (PV-SYNTHESIS, consistent with CROSS-SPORT role literature).

---

## 8. Local numbers

| Relationship | What evidence says | Status |
|---|---|---|
| 2v1, 3v2 | Cross-sport dyad/triad research: attackers exploit an advantage by altering the defender's distance and angle before the pass (futsal, rugby) | CROSS-SPORT |
| Equality | Soccer: counters vs balanced defences show no advantage over elaborate attacks | CROSS-SPORT |
| Underload | — | UNKNOWN (Gaelic) |
| **Global vs local** | Local dominance near the ball is related to success (Vilar). Global numbers are rule-fixed at 15v15 (adult). | CROSS-SPORT |

**Numerical superiority ≠ usable superiority** (PV-SYNTHESIS drawing on cross-sport research). An overload is exploitable only if:
- (a) the carrier is not under pressure that prevents releasing;
- (b) the extra attacker is **in a position the ball can legally and technically reach** (hand-pass range vs kick range);
- (c) the defender(s) can be **committed** before the release;
- (d) the space beyond is not already covered by recovering defenders.

**Gaelic-specific:** the hand pass has short range, so a Gaelic "2v1" behaves differently from a soccer 2v1 (PV-SYNTHESIS).

**Phase 1 connection:** NUMBERS already treats "the numbers are not the problem; the usable relationships are". Not reopened.

---

## 9. Space

| Space | Useful when (PV-SYNTHESIS, with evidence where available) |
|---|---|
| **Ahead of the ball** | It can be reached before recovering defenders close it (defender orientation cue) |
| **Behind recovering defenders** | A kick can land it, and a runner is arriving. Pre-2025 Gaelic: counter outcome was associated with the destination area (central, in front of goal). |
| **Outside the defensive block** | For a switch — if the switch is faster than the defence's shift |
| **Central** | Associated with counter success (Gaelic 2011) and shot efficiency (pre-arc) |
| **Wide** | For progression and stretch; less direct scoring value |
| **Between defenders** | For carry / hand-pass penetration |
| **Created by teammate movement** | Via decoys / occupation (§6) |

**Open space ≠ useful space.** Space is useful if using it **improves the attacking relationship** (closer to goal with an advantage, or keeping possession with the advantage intact). Empty grass far from goal, or grass that recovering defenders will reach first, is not useful. This is PLAUSIBLE; cross-sport space-control models formalise it (soccer transition space evaluation, arXiv 2025; SIO).

---

## 10. Time

| Claim | Evidence | Status |
|---|---|---|
| Fixed window (e.g. "6 seconds") | **None found** in the peer-reviewed sources audited | **Not supported** |
| "Vertical action within ~3 s" is associated with chances | One MLS study, **only vs unbalanced defences** | CROSS-SPORT, conditional |
| Goals from offensive transitions often take longer | Top leagues: 69 % of transition goals took **≥9 s** | CROSS-SPORT |
| Gaelic successful counters took 26–35 s (2007–08); scoring possessions after turnovers 31–90 s (2023–24) | MEASURED-GAELIC (pre-2025) | Contradicts short windows |

**Finding:** the defensible statement is:

> **The opportunity exists while the defensive relationships remain unfavourable; it ends when they are restored, whether that takes 3 s or 15 s.**

This is PV-SYNTHESIS, consistent with all the evidence above. It is PLAUSIBLE, not directly tested. **Time is a proxy for defensive recovery, not the variable itself.**

---

## 11. GO vs SECURE — when is immediate forward attack unsuccessful or inappropriate?

| Reason | Evidence | Status |
|---|---|---|
| **Defence already balanced** | Counters vs balanced defences: no advantage (OR ~1.1, n.s.). Vertical first actions helped only vs unbalanced defences. | **SUPPORTED** (cross-sport association) |
| **Immediate pressure on the carrier** | Soccer counters facing immediate pressure were less successful | SUPPORTED (cross-sport) |
| **No viable forward option** | PV-SYNTHESIS (logic) | PLAUSIBLE |
| **Numerical disadvantage near the ball** | Local-numbers research | PLAUSIBLE |
| **Technical execution risk** (long kick under pressure; hand pass in traffic) | MEASURED-GAELIC indirect (failed hand passes discriminate losers) | PLAUSIBLE |
| **Regain near own goal** | Area associated with outcome (Gaelic 2016; MLS defensive-zone counters less effective) | PLAUSIBLE |
| **Teammates disconnected** (no support within range) | PRACTITIONER | PLAUSIBLE |
| **Score/time context** (protecting a lead late) | Players report using score/time (Frontiers 2023); transitions cluster late in soccer games | PLAUSIBLE |
| **Adult 4v3: must keep 4 in own half while attacking** | RULE LOGIC (limits how many can join) | PLAUSIBLE |

**Counter-balance (avoid a conservative doctrine):**
- Against imbalanced defences, immediate progression was **substantially** more effective (OR ~2.7).
- Contact turnovers (plausibly a more disorganised opponent) were associated with scoring in Gaelic football.
- **Declining the opportunity has a cost too.** "Slowing when an advantage exists" is a failure mode (§12).

**Finding:** transition is **a decision problem** whose correct answer depends on the picture. This is SUPPORTED as an association, and it is the central claim this audit can make with some confidence.

---

## 12. Failure modes

| Failure (observable) | Usually attributable to | Why |
|---|---|---|
| **Forced forward pass** into a covered lane | **BAD DECISION** if a better option was visible; otherwise UNKNOWN | Depends on what the carrier could see |
| **Carrying into pressure** | Decision **or** execution (lost the ball in the tackle) | Visible outcome, ambiguous cause |
| **Everyone runs ahead** (no security behind) | **Off-ball decision** (team-level) | Observable shape |
| **Nobody gives security** | Off-ball decision | Observable |
| **Support crowding the ball** | Off-ball decision | Observable |
| **Slowing when an advantage exists** | Decision **or** perception (did not see it) | **UNKNOWN from observation** which one |
| **Passing sideways while the defence recovers** | Decision, **unless** it was manipulating the picture and the follow-up failed | Needs the next action to judge |
| **Technical error** (dropped hand pass, overhit kick) | **GOOD DECISION / POOR EXECUTION** possible | Separate execution from choice (GPOI principle) |
| **Correct decision, failed execution** | Execution | — |
| **Correct execution of a poor option** | Decision | Only judgeable if alternatives were visible |

**Attribution rules** (PV-SYNTHESIS, following the landscape audit §16 and Kinnerk's GPOI separation):
- An observer can usually tell **execution failure** (the action as attempted did not come off).
- An observer can sometimes tell **decision quality**, *if* a clearly better option was visible from the observer's position.
- **Perception failure** cannot be separated from decision failure by observation alone. It is **UNKNOWN from observation** unless the player is asked (e.g. video recall, as in the Frontiers 2023 method).

---

## 13. Gaelic evidence

| Source | Finding (summary) | Relevance to P5 | Era / type | Independence |
|---|---|---|---|---|
| *Counterattacks in elite Gaelic football* (2011) | 15 championship matches (2007–08). Counters of 26–35 s most successful. **Longer passing sequences more successful**; shorter sequences had higher turnover rates. Outcome associated with destination (central). Success described as maintaining possession, letting off-ball players get support positions, exploiting disorganisation; needs carrying, breaking tackles, support. | Directly relevant; **contradicts "fewest passes"** | MEASURED-GAELIC, pre-2025, broadcast video | — |
| Gamble et al. (2019) / PhD | Winners gained more turnovers; fewer failed hand passes. A "defensive counterattacking" component discriminated winners. | Regain + transition matter | MEASURED-GAELIC, 2014–15 | DCU |
| *Determinants of successful possession* (2020) | Area of possession start and duration associated with outcome | Location cue | MEASURED-GAELIC, 2016 | TU Dublin (likely) |
| *Origin of scores* (2023) | Turnovers ≈ 40 % of score origins; winners scored more from turnovers | Frequency / value | MEASURED-GAELIC, 2021–22 | — |
| *A transition game?* (2023) | Winners retained possession better; duration and phases predicted outcome (summary ambiguous, flagged) | Go vs secure (unclear) | MEASURED-GAELIC, 2020–21 | TU Dublin |
| **Mangan (2026), sub-elite turnovers and throw-ups** | 1,735 possessions. **Contact turnovers ↑ score likelihood.** 31–90 s durations ↑ scoring. Regression favoured 1–10 passes. **The first action after a turnover predicted success** (which action: UNKNOWN). | Most relevant recent study; first-action detail inaccessible | MEASURED-GAELIC, 2023–24 (pre-rules) | TU Dublin (same group as above) |
| GAA national trends study (2011–23), reported by RTÉ | Hand passing ↑ (2:1 → 3.2:1), backward passes ↑, **turnovers and contests ↓**, goalkeeper passes 11.1 → 23.1 per game | Context: the pre-rules game had fewer regains | OFFICIAL analysis (GAA NCGC) | GAA |
| GAA webinar: *Transition from Defence to Attack* (O'Connor, 2020) | Content not recoverable | — | OFFICIAL (SIO) | — |
| LGFA *Develop Quick Attack from Defence* ("Fast Break" game) | Game card exists; content not recoverable | Practitioner framing ("quick attack") | OFFICIAL (LGFA) | — |
| Practitioner blog: "over 60 % of scores come from turnovers"; "the quicker you transition the better" | **Conflicts with the measured ~40 %.** The speed claim is **contradicted** by the associations above. | Example of practitioner overstatement | PRACTITIONER | — |
| Kinnerk et al. (2025) | GPOI separates control, decision and execution; the GBA improved decision variables (U14/U15) | Measurement principle (§12, §17) | EXPERIMENTAL (package) | — |

**Warning preserved:** every measured Gaelic finding predates the 2025–26 rules. The 4v3 rule changes the numbers at a regain (§15).

---

## 14. Cross-sport translation

| Original sport | Concept | Why it may transfer | What is different in Gaelic football | Confidence |
|---|---|---|---|---|
| Soccer (Tenga et al.; González-Rodenas et al.) | **Imbalanced vs balanced defence** (pressure, back-up/cover, balance) | Invasion-game structure: defenders must pressure, cover and balance | No offside (defenders can be bypassed by runners anywhere); hand pass; solo; contact tackle; 4v3 rule | **M** |
| Soccer | **Counter-attack effectiveness is conditional on imbalance** | Same structural logic | Gaelic possession has more options (Mangan: hand, kick, carry), so "secure" is easier and transitions may be slower | M |
| Soccer (rest defence, Bundesliga tracking) | **Rest defence:** deepest players positioned to stop counters; a ~1.7 numerical superiority on average | Reciprocal of P5; the adult 4v3 rule legislates a minimum rest defence | Rule-mandated in Gaelic (≥4 incl. goalkeeper); goalkeeper counts | M |
| Soccer / futsal (Vilar et al.) | **Local numerical dominance near the ball** | General invasion-game dynamics | Hand-pass range makes "near" smaller | L–M |
| Basketball | **Transition possessions after turnovers more efficient than after rebounds; fast-break numerical advantages (2v1, 3v2)** | Regain-type matters; unsettled defence exploitable | Small court; no contact tackle; shot clock | L–M |
| Basketball | **Spacing** (occupying defenders) | Support without receiving | Much larger pitch | L–M |
| Rugby union | **Turnover / unstructured ball more productive; decoy runners** | Turnovers catch defences disorganised | No forward passing in rugby; Gaelic can kick forward to runners | L–M |
| AFL | **Scores from turnover differential** associated with premiership success (Champion Data, media) | Closest structural cousin (kicking, marking, contested ball) | Marks, 18-a-side, no hand-pass-to-score; data are media-reported | L |
| Soccer (2024 narrative review) | **Transition moment ≠ transition style** | Avoids treating P5 as a style | — | M |

**Every concept above is imported.** None is Gaelic-validated.

---

## 15. Current-rule variant (adult / U14+)

**RULE LOGIC** (4v3: at least 3 outfield in the opposition half; at least 4 incl. goalkeeper in the own half):

| Question | Logical consequence | Measured? |
|---|---|---|
| Does 4v3 guarantee players ahead? | **Yes.** At a regain, the regaining team has ≥3 outfield players in the opposition half. | No |
| Different overload possibilities? | The far half starts at a minimum of **3 v 3 outfield + goalkeeper** (or 3 v 4 outfield). **The rule creates no overload by itself.** Overloads come from runners arriving before recovering defenders. Near the ball, up to 11 v 11 in one half. | No |
| Does it change defensive recovery? | The team that lost the ball already has ≥3 outfield + goalkeeper back (rest defence by rule). Recovery starts from a higher floor than a pre-2025 all-out attack. | No |
| Goalkeeper involvement? | The regaining goalkeeper **cannot** be used as a secure outlet in the own half (outside the large rectangle), removing a pre-2025 "secure" option. The losing team's goalkeeper, if advanced, left a 4th outfielder back. | Partly: goalkeeper passes fell ~94 % after the 4v3 amendment (league 2025) |
| Does "secure" change? | Fewer backward outlets (goalkeeper restricted). Securing relies on outfield support. | No |

**Finding:** under current adult rules, P5 has a **rule-created forward structure** (guaranteed outlets and a guaranteed rest defence against them). Whether that makes exploitation easier or harder is **UNKNOWN**. There are no measurements.

---

## 16. U12 variant

U12 rules/formats (age × rules map; SIO, partly unknown ownership):
- up to **13-a-side** on a **reduced pitch** (20 m line to 20 m line);
- **two skills per possession** (one hop + one solo, or two solos);
- no marks;
- no 4v3 found;
- no two-point arc found;
- goalkeeper pass-back rule **UNKNOWN**.

| Element | Core (survives) | Age/rule-specific condition |
|---|---|---|
| Recognising an unsettled defence | **Core** | Shorter distances and fewer players change how fast defences recover (UNKNOWN direction) |
| Go / manipulate / secure decision | **Core** | — |
| Carrying to draw / exploit space | Core | **Constrained by the two-skills limit:** a carrier cannot carry far, so the release decision arrives sooner |
| Support jobs (security, ahead, width, occupy) | Core | **Support timing matters more** because the carrier's carry is capped (PV-SYNTHESIS; unmeasured) |
| Guaranteed forward outlets (4v3) | — | **Absent:** do not teach the adult 4v3 structure as U12 structure |
| Shot value / arc | — | Absent |
| Goalkeeper as an outlet | — | UNKNOWN (rule not found) |

**No developmental claims are made** (e.g. "U12s can't read defensive balance"). No Gaelic evidence exists either way.

---

## 17. Observation model (candidate, not frozen)

**Can a coach observe P5 without reading minds?** **Partly, yes**, if observation is anchored to **moments and relations**, not to judgements of "good transition".

| Moment | Candidate observable questions | Observable? |
|---|---|---|
| **At the regain** | Where was it won (relative to opposition players)? Was the carrier pressured (none/loose/tight)? How many defenders goal-side vs our players ahead? | **Yes** (approximate) |
| **Off-ball, first seconds** | Did players go ahead / wide / stay as security / occupy a defender? Did anyone crowd the carrier? | **Yes** |
| **First on-ball action** | Type (carry / hand pass / kick / shot) and direction; to whom | **Yes** |
| **Was an advantage available?** | Was there a visible free teammate ahead, or space the carrier could reach before defenders? | **Partly** (observer's view ≠ player's view) |
| **Was the chosen action appropriate to the picture?** | Did it improve, keep or worsen the relationship vs defenders? | **Partly** (needs the next second of play) |
| **How did the picture change?** | Ball/players past defenders? Possession kept? Defence restored? | **Yes** (outcome) |
| **Failure attribution** | Execution (visible), decision (sometimes), perception (**not observable**) | Partly |

**Limits:**
- the sideline angle differs from the player's view;
- the observer knows the outcome (hindsight bias);
- "appropriate" requires a judgement about alternatives;
- perception is never observable.

**This model describes what can be seen, not what players thought.**

---

## 18. Player behaviour map (not a decision tree)

```
GAME PROBLEM: we have just regained in open play
  │
  ▼
INFORMATION AVAILABLE (the picture)
  • pressure on the new carrier ............................. SUPPORTED (cross-sport)
  • defenders goal-side vs our players ahead ................ SUPPORTED (cross-sport)
  • regain location relative to opposition players .......... SUPPORTED (association; Gaelic pre-2025 + soccer)
  • defenders' movement/orientation ......................... PLAUSIBLE
  • teammates' positions / local numbers .................... PLAUSIBLE
  • own technical range under this pressure ................. PLAUSIBLE
  • score/time; rule structure (adult 4v3) .................. PLAUSIBLE
  │
  ▼
DECISIONS (coupled, distributed)
  • off-ball: create/close options (security / ahead / width / occupy) ... PRACTITIONER + cross-sport
  • on-ball: progress now │ manipulate the picture │ secure .............. SUPPORTED that the best choice
                                                                          depends on imbalance (cross-sport);
                                                                          family boundaries PLAUSIBLE
  │
  ▼
POSSIBLE BEHAVIOURS
  • carry into space · pass ahead · commit-and-release · switch ......... PRACTITIONER
  • lateral to open a lane · secure away from pressure · hold ........... PRACTITIONER
  • runs ahead / wide / decoy · stay as security ......................... PRACTITIONER + cross-sport
  │
  ▼
HOW THE PICTURE CHANGES
  • advantage used (ball/players past defenders, closer with an advantage) ... observable
  • advantage kept (possession kept, relationships still favourable) ....... observable
  • advantage lost (defence restored) / possession lost ................... observable
  • attribution: execution (often observable) / decision (sometimes) /
    perception (UNKNOWN) .................................................. see §12
```

**Status summary:**
- **SUPPORTED:** that the right choice depends on defensive imbalance; that pressure and location matter. Both cross-sport associations, plus pre-2025 Gaelic associations.
- **PLAUSIBLE / PRACTITIONER:** almost every specific behaviour.
- **UNKNOWN:** anything measured in the current Gaelic game.

---

## 19. "Good behaviour" test

**Can we now say what good player behaviour looks like in P5 without prescribing one solution?**

### **PARTLY.**

**What we can say (defensible):**
- **Good behaviour is picture-appropriate behaviour.** Against an imbalanced defence, actions that use the advantage before relationships are restored. Against a balanced defence or under tight pressure, actions that keep possession *and* the chance to attack. Evidence: cross-sport association, consistent with Gaelic pre-2025 data.
- Good off-ball behaviour **creates usable options or removes defenders from the carrier's picture**. It does not simply move closer to the ball.
- A failed action is not automatically a bad decision.

**What we cannot yet say:**
- what the specific **Gaelic** relationships look like (hand-pass support distances; how fast Gaelic defences recover; how 4v3 changes the far-half picture);
- which first actions Gaelic data favour (the 2026 finding is inaccessible);
- any measured threshold (distance, numbers, time).

**Why not YES:** the behaviours are real, but their Gaelic operational detail is imported or unmeasured.

**Why not NO:** unlike generic "support" (landscape audit: PARTLY toward NO), P5 has a **conditional structure backed by evidence** — go when imbalanced, not otherwise. That lets "good" be defined relative to the picture rather than as a pattern.

---

## 20. 30-second U12 coach test — audit of the draft wording

Draft (not accepted as true):

> "When we win it back, first look at the picture. If they're open, can we use the space before they recover? The player on the ball needs options; players off it can help by getting ahead, giving width, offering security or moving defenders. Going forward isn't automatically the right answer."

| Proposition | Verdict | Why |
|---|---|---|
| "When we win it back, first look at the picture." | **DEFENSIBLE COACHING HEURISTIC** — with a caution: "first" may be read as *pause*, which is **TOO STRONG** | Picture-dependence is supported. Pausing to look is not; players plausibly need to read the picture *while* acting (and before the regain). |
| "If they're open, can we use the space before they recover?" | **SUPPORTED** (as an association) / **DEFENSIBLE HEURISTIC** (as advice) | Counter-attacks were more effective vs imbalanced defences. "Before they recover" matches the relationship-based view of time (§10). "Open" needs unpacking (pressure, cover, numbers). |
| "The player on the ball needs options." | **DEFENSIBLE COACHING HEURISTIC** | Universal purpose; no Gaelic measurement |
| "Players off it can help by getting ahead, giving width, offering security or moving defenders." | **DEFENSIBLE COACHING HEURISTIC**; "moving defenders" = PRACTITIONER / cross-sport | Matches the support jobs in §6; unmeasured in Gaelic football. Omits "don't crowd the ball". |
| "Going forward isn't automatically the right answer." | **SUPPORTED** (as an association) | No counter-attack advantage vs balanced defences; vertical actions helped only vs unbalanced ones; Gaelic longer successful sequences |
| *Missing* | — | Execution (a good idea can fail); the U12 two-skills limit (the carrier must release sooner). Not errors, but gaps. |

**Result:** the draft is **broadly defensible** once "first look" is softened. No proposition is **WRONG**. One is **TOO STRONG** as literally read. Three are **heuristics, not evidence**. *(This audits the propositions; it is not product copy.)*

---

## 21. Phase 1 connection (not reopened; no practice designed)

**BEHAVIOUR WE WANT PLAYERS TO ENCOUNTER → PRACTICE PROPERTY THAT COULD ALTER THE OPPORTUNITY**

| Behaviour to encounter | Phase 1 lever | Practice property that could alter the opportunity |
|---|---|---|
| Reading an imbalanced vs balanced defence | **GAME MOMENT** (regain as a follow-up moment; *how it arises*) | Whether the regain arises from **live play** (defence genuinely unset) or a **coach feed after a stop** (the defence resets). **A feed can remove the very information P5 depends on (GI-2).** |
| Using or declining an advantage | **NUMBERS** | Relative numbers at the moment of regain (local overload / equality / underload) |
| Recovery distances; usable vs empty space | **SPACE** | Area dimensions and shape (length changes recovery distance) |
| Going toward a target | **DIRECTION / TARGET STRUCTURE** | Whether a goal direction exists (possession grids have none, so there is no "forward" to exploit) |
| Picture-dependence of timing | **TIME** | Any imposed limit may *manufacture* urgency that the picture does not justify. It changes the problem. |
| Valuing exploitation vs security | **SCORING** (incl. event-contingent) | Rewards for scoring from a regain, or for retaining after one, **shift the go/secure balance**. They change what players optimise. |
| Carrier options | **ACTIONS** | Skill limits (cf. the U12 two-skills rule) change release timing |
| Who decides | **Decision Allocation** | Whether the coach calls "go/secure" or players read the picture |

**Preserved:**
- practice behaviour ≠ learning;
- a practice that produces more counter-attacks shows that counter-attacks were produced, not that the P5 decision was learned (CF-1 v2).

---

## 22. Framework stress test

**Architecture tested:**
RECURRING GAME PROBLEM → WHAT PLAYERS MUST NOTICE → DECISIONS → POSSIBLE SOLUTIONS → WHAT THE COACH CAN OBSERVE

**Result: it survives P5, with four amendments** (PV-SYNTHESIS):

1. **A "picture" layer is needed between the problem and the decisions.** P5's decisions depend on the state of defensive relationships at a moment. That state must be described observably (§2) before cues mean anything.
2. **Decisions are distributed and coupled.** Off-ball and on-ball decisions must be represented together. "The decision" as a single carrier choice misrepresents the problem.
3. **Outcomes should be "how the picture changed"**, not success/failure. That is what lets behaviour be judged relative to the situation rather than to a preferred solution.
4. **Execution must be a separate layer** (technical range, execution success). Otherwise every failure is misread as misunderstanding.

**Revised candidate (not frozen):**

```
RECURRING PROBLEM → PICTURE (observable relationships) → WHAT PLAYERS MUST NOTICE
  → COUPLED DECISIONS (on-ball / off-ball) → POSSIBLE BEHAVIOURS (+ technical range)
  → HOW THE PICTURE CHANGES → WHAT THE COACH CAN OBSERVE (with attribution limits)
```

**Would it fail?**
- It would fail if P5 were the only problem it fits.
- P5 is a **reactive, open-play** problem. The architecture is untested on a **planned, rule-created** problem, such as a restart.

That is the test that decides generalisability (§23).

---

## 23. Next step (recommended, not performed)

### **A — Research a second recurring problem to test generalisability: P1/P3, own-kickout contest and breaking ball (U14+/adult variant).**

**Why A, and why this problem:**
- **Strongest test.** P1/P3 differs from P5 on every axis that could break the architecture:
  - it is **planned** rather than reactive;
  - it is **rule-created** (arc, 13 m, marks, 4v3 caps);
  - it involves an **aerial contest and a loose ball** rather than a controlled regain.

  A second open-play problem (e.g. P10, react to loss) would largely mirror P5's picture and prove little.
- **Evidence.** It has the only **current** (2025) measured Gaelic data (GIU kickout length and contest rates).
- **Scope honesty.** The age map shows the adult kickout does not exist at U12. The audit would test the architecture for the **U14+ variant**, and would itself test whether "core problem + age variants" holds when a problem is rule-created.

**Why not the others:**
- **B (go deeper on P5):** further desk research cannot supply what is missing. That is **Gaelic, rule-current measurement**, which needs observation or video coding, not literature.
- **C (Coach Intervention for P5):** premature until the architecture generalises.
- **D (practice translation):** §21 already maps the levers. Translating further before a second problem risks building on an architecture fitted to one case.
- **E:** not warranted. The architecture survived with amendments.

**Parallel option (F, noted, not recommended as next):** a small **observation-reliability check of the §17 model** on club video (can two observers agree on pressure / cover / advantage-available ratings?). It would test observability directly. It is research, not product, but it is a field task rather than a literature audit.

---

## Evidence ledger

| # | Claim | Source | Type | Access | Conf. | Independence |
|---|---|---|---|---|---|---|
| 1 | Counter-attacks > elaborate attacks vs imbalanced defence (OR 2.69) but not vs balanced (OR 1.14); score-box possessions 28.5 % vs 6.5 % | [Tenga et al. 2010, J Sports Sci (score-box)](https://pubmed.ncbi.nlm.nih.gov/20391096/) · [Tenga et al. 2010, goal scoring](https://www.tandfonline.com/doi/abs/10.1080/02640410903502774) · [Measuring offensive effectiveness (EJSS 2010)](https://onlinelibrary.wiley.com/doi/10.1080/17461390903515170) | CROSS-SPORT (soccer) | AO / SIO | M–H | Tenga group (3 papers, one dataset family) |
| 2 | Imbalanced defence = loose pressure, lack of back-up and cover | As #1 (via secondary citation) | CROSS-SPORT | SIO | M | — |
| 3 | MLS counters: vertical action in the first ~3 s effective only vs unbalanced defence; immediate pressure → less success; pre-offensive-zone starts + penetration more effective; passes 3 vs 4–6 | [González-Rodenas et al., MLS counter-attacks](https://www.researchgate.net/publication/305731209_Association_between_playing_tactics_and_creating_scoring_opportunities_in_counter-attacks_from_United_States_Major_League_Soccer_games) · [MLS playing tactics](https://www.researchgate.net/publication/284367300_The_effects_of_playing_tactics_on_creating_scoring_opportunities_in_random_matches_from_US_Major_League_Soccer) · [EPL multilevel (PLOS One)](https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0226978) | CROSS-SPORT | AO / SIO | M | Same group; uses a Tenga-type instrument |
| 4 | Transition moment vs style; counter-attacks as a transition outcome | [Transitions narrative review 2024](https://link.springer.com/article/10.1007/s12662-024-00951-9) | CROSS-SPORT (review) | AO | M | — |
| 5 | 69 % of top-league transition goals took ≥9 s; transition goals cluster late | [Duration, score and timing (Frontiers 2024)](https://www.frontiersin.org/journals/sports-and-active-living/articles/10.3389/fspor.2024.1462932/full) | CROSS-SPORT | AO / SIO | M | — |
| 6 | Rest defence: definition; ~1.69 numerical superiority; quick regain the key success factor | [Rest defence (JSSM 2023)](https://pmc.ncbi.nlm.nih.gov/articles/PMC10690503/) | CROSS-SPORT (tracking) | SIO | M | — |
| 7 | Local numerical dominance near the ball; futsal dyad relationships at goals | [Vilar et al. (futsal)](https://onlinelibrary.wiley.com/doi/10.1080/17461391.2012.725103) · [Science of winning soccer](https://link.springer.com/article/10.1007/s11424-013-2286-z) | CROSS-SPORT | AO | L–M | — |
| 8 | Distributed situation awareness in player transitions | [Science & Medicine in Football 2026](https://www.tandfonline.com/doi/full/10.1080/24733938.2026.2634326) | CROSS-SPORT | SIO | L | — |
| 9 | Space evaluation at transition start | [Pitch-wide space evaluation (arXiv 2025)](https://arxiv.org/html/2505.14711v1) | CROSS-SPORT (preprint) | SIO | L | — |
| 10 | Basketball: turnover possessions more efficient than rebound possessions; fast-break PPP | [inpredictable, possession types](https://www.inpredictable.com/2015/03/team-pace-and-efficiency-by-possession.html) · [Analysis of fast breaks](https://www.researchgate.net/publication/233526016_Analysis_of_fast_breaks_in_basketball) | CROSS-SPORT (analytics blog + paper) | SIO | L–M | — |
| 11 | Rugby: turnover / unstructured ball productive; unstructured possession common | [Unstructured play (rugby)](https://www.researchgate.net/publication/327471549_Practicing_Unstructured_Play_in_Team_Ball_Sports_A_Rugby_Union_Example) · [Turnover-play structure](https://www.taylorfrancis.com/chapters/edit/10.4324/9780203412992-93/defence-performance-analysis-rugby-union-turnover-play-structure) | CROSS-SPORT | SIO | L–M | — |
| 12 | AFL: scores-from-turnover differential and premiers | [AFL.com.au](https://www.afl.com.au/news/1105578/carlton-blues-geelong-cats-defy-poor-clearance-to-prove-turnover-game-is-key) | CROSS-SPORT (media, Champion Data) | SIO | L | — |
| 13 | Gaelic counter-attacks (2007–08) | [Counterattacks in elite Gaelic football (2011)](https://www.tandfonline.com/doi/abs/10.1080/24748668.2011.11868537) | MEASURED-GAELIC | AO / SIO | M | — |
| 14 | Sub-elite turnovers: contact, duration, passes, first action | [Mangan 2026, IJPAS](https://www.tandfonline.com/doi/abs/10.1080/24748668.2026.2621589) · [TU Dublin record](https://arrow.tudublin.ie/scschbioth/7/) | MEASURED-GAELIC | AO / SIO | M | TU Dublin |
| 15 | Elite post-turnover possessions | [A transition game? (2023)](https://www.tandfonline.com/doi/full/10.1080/24748668.2023.2250972) | MEASURED-GAELIC | SIO | L–M | TU Dublin |
| 16 | Winners gain more turnovers; defensive counterattacking component | [Gamble et al. 2019](https://doras.dcu.ie/25444/) | MEASURED-GAELIC | SIO | M | DCU |
| 17 | Possession area / duration predict outcome | [Determinants of successful possession (2020)](https://www.tandfonline.com/doi/abs/10.1080/24748668.2020.1758433) | MEASURED-GAELIC | AO | M | — |
| 18 | Score origins (turnovers ~40 %) | [Origin of scores (2023)](https://www.researchgate.net/publication/371303519_Investigating_the_origin_of_scores_for_winning_and_losing_teams_in_elite_Gaelic_Football) | MEASURED-GAELIC | SIO | M | — |
| 19 | 2011–23 trends: fewer turnovers and contests; more hand/back/goalkeeper passes | [RTÉ, GAA study (2023)](https://www.rte.ie/sport/football/2023/0928/1407954-new-study-outlines-stark-extent-of-possession-football/) | OFFICIAL analysis | SIO | M | GAA |
| 20 | GAA transition webinar; LGFA quick-attack card | [GAA webinar PDF](https://learning.gaa.ie/sites/default/files/GAA%20Coach%20Webinar_Gerard%20OConnor_Transition.pdf) · [LGFA card](https://ladiesgaelic.ie/wp-content/uploads/2018/02/Develop-Attack-from-Defence.pdf) | OFFICIAL | Content UNRESOLVED | — | — |
| 21 | Practitioner claims (60 % from turnovers; faster is better) | [Skilled Athleticism blog](https://www.skilledathleticism.com/post/introduction-to-coaching-gaelic-games) · [RTÉ 2022 transition feature](https://www.rte.ie/sport/gaa/2022/0225/1282986-transition-time-turning-15-man-defence-into-attack/) | PRACTITIONER | SIO | L | — |
| 22 | Decision information (score/time, positioning, space) | [Frontiers 2023](https://pubmed.ncbi.nlm.nih.gov/37359881/) | MEASURED-GAELIC (qualitative) | AO | M | — |
| 23 | GPOI: control / decision / execution separated | [Kinnerk et al. 2025](https://pubmed.ncbi.nlm.nih.gov/40388689/) | EXPERIMENTAL (Gaelic) | AO | M | — |
| 24 | Current rules (4v3, goalkeeper), goalkeeper-pass data; U12 rules | [Game structure audit](./phase2-current-game-structure-audit.md) · [Age × rules map](./phase2-age-rules-map.md) | Prior PáircVision audits | — | M | — |

**Independence summary:**
- The soccer evidence (#1–#3) comes largely from **one instrument lineage** (Tenga → González-Rodenas).
- The Gaelic turnover evidence (#14–#15, likely #17) comes largely from **one research group** (TU Dublin).
- Cross-sport convergence (soccer, basketball, rugby, AFL) on "turnover possessions are valuable" is **independent but associational**.
- **The conditional claim — go only when imbalanced — rests mainly on the soccer lineage.**
