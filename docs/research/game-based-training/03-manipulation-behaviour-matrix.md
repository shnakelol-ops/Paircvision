# 03 — Manipulation → Behaviour Matrix

**Question.** When a coach deliberately changes **one** feature of a representative training game, what player or team behaviours reliably change?

**Scope and discipline**
- **Evidence sources.** Every cell is traced to [`04-evidence-ledger.md`](./04-evidence-ledger.md) by ID (GA = Gaelic/hurling, S = soccer/futsal, B = basketball, H = field hockey, X = cross-sport/analogue).
- **Access.** Every source is **ABSTRACT ONLY or weaker** because of network restrictions (ledger §0). Nothing here has been checked against full methods or results.
- **Rating unit.** Evidence is rated **per relationship**, not per game. No games are ranked and no Gaelic adaptations are proposed.
- **Physical outcomes.** These are reported only where they change coaching usefulness.
- **Rule era.** All Gaelic evidence is from **pre-2025 rules** (ledger §A flag).

---

## 1. Keys

### Evidence grade for a relationship

| Grade | Meaning |
|---|---|
| **A** | Direct Gaelic football or hurling evidence for this relationship. |
| **B** | Strong, repeated invasion-sport evidence (≥2 sports, or several independent studies in one sport with consistent direction), with plausible Gaelic transfer. |
| **C** | Limited or single-sport evidence. |
| **D** | Coaching convention or theory only. |
| **E** | Hypothesis, or currently unknown. |

### Confidence
- **High**: consistent across studies and not seriously confounded.
- **Moderate**: consistent, but with confounds, few studies or abstract-only detail.
- **Low**: single study, mixed results, or heavily confounded.
- **Very low**: inference only.

### Cell symbols
| Symbol | Meaning |
|---|---|
| ✓ | Effect reported in the stated direction (acute, in-game). |
| ~ | Mixed, partial, or moderated. |
| ✗ | Tested; no effect found. |
| ? | Not found in this search. |
| (phys) | Only physical or physiological outcomes exist. |
| L | A longitudinal learning outcome exists. |

### Two rules applied to every row
1. **Acute ≠ learning.** Unless a row carries an **L**, every ✓ describes behaviour *during the manipulated game*. It says nothing about retained learning or transfer to competition.
2. **Frequency ≠ quality.** Most studies count actions (passes, dribbles, shots). Only a few measure efficacy, decision quality or success rate (B4, S15, S33, S35, S46, S47, GA4). Counts are not treated as quality.

---

## 2. Central matrix

Each row gives the headline relationship. §3 lists the separate relationships inside each row with their own grades.

| # | Manipulation | Gaelic football | Soccer | Basketball | Field hockey | Cross-sport consistency | Conflicting findings | Unknown / insufficient | Likely mechanism | Grade · Confidence |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | **Fewer players per side** (area per player held constant or de-confounded) | (phys) GA8 hurling: 4-a-side highest %HR. No de-confounded GF technical data. | ✓ more involvement (S3, S4). Numbers vs area de-confounded for **physical** outcomes only (S5, S10). S11: dispersion changes, team separateness does not. | ✓ 2v2 ≈ 60% more technical actions than 4v4 (B3 via review). Extreme formats highest HR (B2). | ✓ **de-confounded** (H1): +2.7 successful passes and +3.7 skilled actions per player. H2 agrees. H3: with APP fixed, physical outputs unchanged. | **Strong for individual involvement frequency** in 3 sports | Physical intensity changes are mostly caused by the area change that usually comes with fewer players (S5, H3). | Effect on decision **quality**; learning after repeated exposure; GF-specific de-confounded data | Fewer teammates to share the ball, so each player receives it more often and meets opponents sooner. | **B** · High for *frequency of involvement*; Low for quality |
| 2 | **Area per player** (larger vs smaller, number fixed) | ~ GA2: 60×20 m (150 m²) had the most HSR, not 80×20 m. GA3: small pitch gave more hand passes, tackles and points; large gave more kick passes and goal conversion (APP n/c; area confounded with both dimensions). | ✓ larger area → more dispersion, stretch index and surface area (S7 meta-analysis, S9, S12). ✗ passes and dribbles unchanged (S7). ~ passing success higher on larger area (S15). | ~ full court → more physical load; ✗ technical demands unchanged (B12). | ~ H1: higher density → fewer unsuccessful dribbles and **more** HIR. | **Strong for tactical spacing** (team dispersion). **Weak and inconsistent for technical counts.** | S7 meta finds no pass/dribble change; GA3 finds pass-*type* change in GF. H1's density result runs opposite to soccer load findings. | Whether kick-vs-hand-pass shifts persist or transfer (GA3 is acute, counts only) | Space sets the distance to the nearest safe option and to pressure, which sets which disposal (short hand pass or longer kick) is afforded. | Spacing: **B** · High. Disposal-type shift: **A** (single GF study) · Low |
| 3 | **Pitch width only** | ? | ✓ narrower → smaller lateral inter-team distance, but **crossover** into longitudinal measures (S8). Wide config → more crosses (S13). | ? | ? | Insufficient | Crossover effects mean width is not an isolated lever (S8). | Almost everything, especially width effects on switching play and overload recognition | Width sets the lateral gaps the defence must cover. | **C** · Low |
| 4 | **Pitch length only** | ~ GA2 varied length at fixed width, but area and aspect ratio changed too. | ✓ shorter → smaller longitudinal inter-team distance, with crossover (S8). S14 (11v11 length) results not seen. | ? | ? | Insufficient | GA2's HSR peak at the middle length is non-linear. | Length effects on direct play, runs in behind and transition | Length sets the depth available behind the defence and the running distance to recover. | **C** · Low |
| 5 | **Aspect ratio / pitch shape** (area held constant) | ? | ✓ **S13 (area held constant):** long and wide both beat standard for counter-attacks, penetration and scoring chances; wide gave more crosses. S9: skill level changes the length:width response. | ? | ? | Single clean study | — | Replication; other sports; learning | Shape redistributes where space is available (behind vs beside the defence) without changing total space. | **C** · Moderate (clean design, n = 22, one study) |
| 6 | **Multiple goals / targets** | ? | ~ **6 vs 2 targets:** teams further apart, more time in lateral corridors, *more conservative* coordination (S16). More shots with multiple goals (S18). ✗ 1/2/3 small goals: no technical–tactical effect in national-level women (S19). | ? | ✓ two-goals game → +0.61 goals (H2). | Mixed | S16 and S18 vs S19 | Whether multiple targets teach *switching* decisions; learning | More targets widen the defence's attention and invite the attack to switch. With many targets the defence may simply retreat. | **C** · Low |
| 7 | **Target type** (small goals vs regular goal + GK vs no goal) | (phys) GA8 hurling: small goals → highest running distance. | ✓ small goals → more dribbling (S15). Goalkeepers → lower HR (S20). Target type changes team shape (S17; direction not verified). | (phys) baskets vs possession, longitudinal neuromuscular only (B17). | ✓ see #6 | Mixed; mostly physical | GA8 goal games ≥ possession intensity; S20 possession > goals | Tactical and decision effects of target type in GF | Target type sets where and how scoring happens, which sets defensive depth and shooting distance. | **C** · Low |
| 8 | **End zones / scoring zones** (stop-ball or line-crossing) | ? | (phys) stop-ball zone → higher HR than small goals (S21; number/APP confounded). | ? | ? | Physical only | — | **All technical, tactical and decision effects** | Scoring by carrying or receiving over a line rewards penetration and running in behind (convention). | **D** for tactical claims · **C** for physical |
| 9 | **Fixed numerical superiority / inferiority** | ? | ✓ **Underloaded team compacts** and team positions shift (S22, S27). ✓ superiority → more passes and actions, **lower intensity** (S23, S24). ✓ more opponents → more ball controls (S25). **L:** superiority-phase games improved pass decision-making and execution (S46; order confounded). | ✓ 4v3 → greater offensive performance, more passing, more **space creation off the ball** (B6, B7). ✓ novices: pass efficacy higher in 5v4 and 4v3 (B4). ✓ extra players → lower physical load (B6). | ? | **Strong** (2 sports, several independent groups) | None on direction. Magnitude depends on skill (S22, S46). | Hockey and GF entirely; retention and transfer beyond S46 | A guaranteed free player lowers pressure on the attack and forces the defence to compact and prioritise. | **B** · Moderate–High (acute). Learning: **C** · Low |
| 10 | **Temporary / fading overloads; recovering defenders** | ? | ~ overloads rotating each minute → more long-term **exploratory breadth** (S26). Recovering-defender designs: **not found**. | ? | ? | Single study, different design | — | **Recognition of a temporary numerical advantage** — no study found. Recovering-defender timing effects — none found. | Theory: a shrinking window forces earlier detection and faster exploitation of the overload. | **E** for recovering defenders / recognition · **C** · Low for rotating imbalances |
| 11 | **Neutral / floater players** | ? | ✓ floaters → more passes and actions, **lower intensity** (S24). ✓ width ↑ with floaters, length ↓ with 2 floaters (S28). ✓ inside floater → **less penetration, more defensive unity** (S29). Floater position changes decision information in futsal (S30; results not seen). | ~ extra scoring player → more space creation (B6); overlaps with #9 | ? | Consistent for "more passing, less intensity" | — | Whether floaters help or hinder learning to attack under **equal** numbers | A floater is a permanent free option, so possession is easier and penetration is less necessary. | **B** · Moderate |
| 12 | **Direction reversal** (attack direction switches on a signal) | ? | ? | ? | ? | — | — | **No experimental study found** | — | **E** |
| 13 | **Transition games** (e.g., 3v2 waves, counter-attack rules) | ? | (phys) 3v2 transition: larger pitch → more distance, HSR, RPE (S39). Counter-attack SSG × time pressure, tactical results not visible (S37); time pressure did not change load (S38). | ? | ? | Physical only | — | **Transition behaviour itself** (reaction time after turnover, defensive recovery, exploitation) is essentially unmeasured | — | **D** for behaviour · **C** for physical |
| 14 | **Possession-only objective** (no goals) | ? (hurling possession designs are physical only: GA8) | ✓ possession + larger area → more passing success and intensity (S15). ~ possession more intense than goals (S20). | ~ possession vs baskets: physical only (B17) | ✓ possession game: **+4.82 passes, −1.48 dribbles, −0.69 tackles** (H2) | Consistent for **more passing, less dribbling and tackling** (2 sports) | GA8 vs S20 on intensity | Whether possession games transfer to *directional* passing decisions | Removing goals removes the reason to penetrate; the only goal left is ball retention. | **B** · Moderate |
| 15 | **Reward / bonus scoring** | ? | ~ goal exaggeration → most goals and most dribbling; the combination with instruction gave the best passing networks (S43) | ✓ point-possession (scorers keep ball) → faster pace, more accelerations, **higher enjoyment** (B8). ~ passes-based scoring → highest RPE (B8). | ? | Single-sport per rule type | S50: an "exaggeration" modification showed **no** behavioural difference | Technical and tactical effects of reward rules (B8 measured none) | Rewards change what is worth doing without removing options. | **C** · Low |
| 16 | **Time pressure** (shot clock or attack time limit) | ? | ~ changes coordination on some axes (S36). ✗ no load change (S38). Tactical results not visible (S37). | ✓ reduced shot clock → more jumps, more physical demand; ✗ HR unchanged (B5) | ? | Weak | — | Effects on decision speed and quality | Less time means earlier commitment and fewer options explored. | **C** · Low |
| 17 | **Touch restrictions** (1–2 touch) | ? | ✓ more passes **and more unsuccessful passes**, higher intensity (S32 review). ✓ 1-touch → **lower pass success, fewer duels** (S33). Tactical evidence scarce and inconsistent. | n/a | ? | Consistent within soccer | — | Tactical and decision effects; learning | Forces quicker release, so passing volume rises but receiving and orientation options shrink. | **B (within soccer) → C for Gaelic** · Moderate |
| 18 | **Dribble / carry restrictions** | ? (no GF solo or hop restriction studies) | ? | ✓ no-dribble → **more passes and more turnovers**, higher intensity (B9, B15). Allowing dribbles → more converted shots (B3 via review). | ? | Single sport | — | Every GF equivalent (solo, bounce, hand-pass limits) | Removing carrying means the ball must travel by pass, so off-ball support movement becomes necessary. | **C** · Low–Moderate |
| 19 | **Mandatory-pass rules** (e.g., N passes before scoring) | ? | ? (a trial is registered; no results located) | ~ passes-based scoring → highest RPE; no technical data (B8) | ? | — | — | Almost everything | — | **D/E** |
| 20 | **Zones / channels** (positional restriction) | ? | ✓ zone restriction → **less long-term, more short-term exploration**; relaxing zones → faster ball flow (S34) | ? | ? | Single study | — | Learning; any other sport | Locking players to zones cuts the combinations available. | **C** · Low |
| 21 | **Restart type / location** | ? | ? | ? | ? | — | — | **No experimental study of restart type found in any sport** (including kickouts or coach-fed starts) | — | **E** |
| 22 | **Defender / pressure level** (opposed vs unopposed; man-marking; pressure on ball) | ? | ✓ pressure on the ball → more recoveries but **lower decision-making and execution**, lower exploration; man-marking → higher load (S35 review) | ✓ a defender changes shot kinematics: faster release, longer jump (B16). ✓ full-court defence → more fakes (B5). ✗ man vs zone → no technical change (B12). | ? | **Strong that opposition changes the movement/decision itself** (2 sports) | Man vs zone null (B12) | Hockey and GF | Opponent proximity is the information that specifies when and how to act; removing it changes the task. | **B** · Moderate–High |
| 23 | **Bout duration / work:rest regime** | ? | ✗ 2/4/6-min bouts: **no technical change** (S40). ~ enjoyment depends on sex × bout structure (S41). | ✓ short-intermittent → more possessions, dribbles and shots (B13) | ? | Mixed | S40 null vs B13 positive | Decision quality under fatigue | Shorter bouts preserve freshness and restart density. | **C** · Low |
| 24 | **Coach verbal encouragement** | ? | ✓ higher HR and lactate (S2) | ✓ higher HR, RPE, **enjoyment**, more successful passes and shots (B14, B15) | ? | Consistent for intensity; limited for skill | — | Effects on decisions; any negative effects (e.g., on attention) | Motivational arousal | Intensity: **B** · Moderate. Technical/enjoyment: **C** · Low |
| 25 | **Coach instruction** (explicit vs implicit vs none) | ~ GA4: huddles (questioning) disliked; package improved decisions | ✓ explicit rule → more stretched occupation and coordination (S44); instruction → better-connected passing networks, free play → more dribbling (S43); combining rules hurt performance (S44) | ? | ? | Limited | — | Longitudinal effect of instruction *within* games | Instruction channels attention and coordination toward a shared solution; it may suppress exploration. | **C** · Low |

### Additional manipulations found repeatedly in the literature

| # | Manipulation | Evidence summary | Grade · Confidence |
|---|---|---|---|
| 26 | **Goalkeeper presence** | GKs lower HR (S20). Target type changes team shape (S17). | C · Low |
| 27 | **Offside rule** | Changes depth positioning and length:width ratio; reduces TD (S35). GF has no offside, so relevance is conceptual only. | C · Low |
| 28 | **Defensive system** (man vs zone) | No technical or RPE change in basketball 5v5 (B12). | C · Low (null) |
| 29 | **Competitive framing** (score status, known/unknown duration, winning/losing) | Score status changes behavioural dynamics (S27). Known duration → more spread, lower pace (S42). Winners run more in hurling (GA10, physical). | C · Low. **This is also a major uncontrolled confound in other studies.** |
| 30 | **Role-restricted tasks** (attack-only or defend-only) | Offensive task → higher mental effort (B13). Only the full game reached adequate intensity (S4). | C · Low |
| 31 | **Skill level of players and opponents** | Moderates the response to pitch size (S9), numerical relations (S22) and interventions (S46). | B as a *moderator* · Moderate |

---

## 3. Relationship register

This is the smallest defensible set of stated relationships, each graded separately.

| ID | Relationship | Sports | Acute or learning | Frequency or quality | Grade | Confidence |
|---|---|---|---|---|---|---|
| R1 | Fewer players → more individual technical involvements per player | Soccer, basketball, hockey (de-confounded in H1) | Acute | Frequency | **B** | High |
| R2 | Fewer players → higher physical intensity **independent of area** | H3 (null when APP fixed); S5 (area matters more for locomotion) | Acute | — | **C** | Low. The popular claim is largely an area effect. |
| R3 | Larger area per player → greater team dispersion and surface area | Soccer (meta-analysis + several originals) | Acute | Tactical spacing | **B** (single sport, many studies) | High within soccer |
| R4 | Larger area per player → change in pass, dribble or shot *counts* | Soccer meta-analysis says no (S7) | Acute | Frequency | **C** (null) | Moderate |
| R5 | Smaller GF pitch → more hand passes and tackles; larger → more kick passes and goal conversion | GF only (GA3) | Acute | Frequency | **A** | Low (one study, n = 16, area and both dimensions changed, abstract only, pre-2025) |
| R6 | Aspect ratio (area fixed) → long or wide shapes increase counter-attacks and penetration | Soccer (S13) | Acute | Frequency of tactical events | **C** | Moderate |
| R7 | Width and length manipulations are **not independent** (crossover effects) | Soccer (S8) | Acute | Tactical spacing | **C** | Moderate |
| R8 | Numerical superiority → more attacking actions and passing; underloaded defence compacts | Soccer, basketball | Acute | Frequency (+ efficacy in B4) | **B** | Moderate–High |
| R9 | Numerical superiority → lower physical intensity for the superior team | Soccer, basketball | Acute | — | **B** | High |
| R10 | Superiority-based modified games → improved pass decision-making and execution over weeks | Soccer (S46, S47) | **Learning** (retention in S47) | Quality | **C** | Low (small n, no or confounded control) |
| R11 | Recovering defender / fading overload → better recognition of temporary numerical advantage | — | — | — | **E** | Unknown |
| R12 | Rotating temporary imbalances → broader collective exploration | Soccer (S26) | Acute | Exploration metric | **C** | Low |
| R13 | Floaters → more passes, lower intensity, less penetration | Soccer, futsal | Acute | Frequency | **B** (within soccer/futsal) | Moderate |
| R14 | Possession-only objective → more passes, fewer dribbles and tackles | Hockey (H2), soccer (S15) | Acute | Frequency | **B** | Moderate |
| R15 | Touch restriction → more passes **and** more errors | Soccer (review + originals) | Acute | Frequency and success rate | **B** within soccer; **C** for Gaelic transfer | Moderate |
| R16 | Carry restriction → more passes and more turnovers | Basketball | Acute | Frequency | **C** | Low–Moderate |
| R17 | Adding or increasing opposition pressure → lower decision and execution quality, and a changed movement pattern | Soccer (S35), basketball (B16) | Acute | **Quality** | **B** | Moderate |
| R18 | Multiple targets → wider or more conservative team organisation | Soccer (S16); partial null (S19) | Acute | Tactical spacing | **C** | Low |
| R19 | Point-possession reward → higher pace and enjoyment | Basketball | Acute | Physical + affect | **C** | Low |
| R20 | Coach encouragement → higher intensity (+ enjoyment in basketball) | Soccer, basketball | Acute | — | **B** for intensity; **C** for enjoyment | Moderate / Low |
| R21 | Zone restriction → less long-term exploration and slower ball flow | Soccer | Acute | Exploration metric | **C** | Low |
| R22 | Bout duration (2–6 min) → no change in technical actions | Soccer | Acute | Frequency | **C** (null) | Low |
| R23 | Smaller formats → more scanning (but not match-like scanning situations) | Soccer (S45) | Acute | **Perceptual frequency** | **C** | Low |
| R24 | Direction reversal; restart type; mandatory passes; end-zone tactical effects; transition-game behaviour | — | — | — | **E / D** | Unknown |
| R25 | GBA package (conditioned games + curriculum + questioning) → better decision-making in GF youth | GF (GA4) | **Learning** | Quality | **A** | Moderate (single study, multiple-baseline design, abstract only). **It cannot be attributed to any single manipulation.** |

---

## 4. Manipulation cards: behaviour domains, confounds and sacrifices

Each card uses the same fields:
- **Tech** = technical
- **Tact** = tactical
- **Perc/Dec** = perceptual and decision
- **Phys** = physical (secondary)
- **Psych** = psychological/engagement
- **Acute vs learning**
- **Confounds**
- **Distorts / sacrifices**

"Not measured" means no located study measured that domain for that manipulation.

### 4.1 Fewer players per side
- **Tech.** More involvements per player: H1 (+2.68 successful passes/player), H2, B3 (~60% more technical actions in 2v2 than 4v4), S3/S4. More time in stick-to-ground postures in hockey (H4).
- **Tact.** Dispersion changes but team separateness stays constant (S11). Changing numbers vs changing dimensions to the same APP gives *different* local numerical relations (S10).
- **Perc/Dec.** H1 authors describe a "more advantageous environment" for decision-making. S45: smaller formats → more scanning. No decision-quality measures.
- **Phys.** In soccer, locomotion is driven more by area than by number (S5). Hockey with fixed APP showed no substantial change (H3). Extreme basketball formats have the highest HR (B2).
- **Psych.** Not measured.
- **Acute vs learning.** Acute only.
- **Confounds.** Most studies change APP together with numbers (S3, S21, H4). **Only H1, H3, S5 and S10 separate them.**
- **Distorts / sacrifices.** Removes structural cues that only exist with more players: support depth, cover, positional roles, and GF-specific structures such as the 3-in-each-half rule and kickout shapes. S45 warns that scanning situations are not match-like.

### 4.2 Area per player (number fixed)
- **Tech.**
  - Soccer meta-analysis: **no significant change** in passes or dribbles (S7).
  - S15: passing *success* higher on larger areas.
  - GF (GA3): small pitch → more hand passes and tackles; large → more kick passes and higher goal conversion.
  - Basketball court size: no technical change (B12).
- **Tact.** Larger area → higher stretch index and surface area (S7), more effective space (S9). A match-derived APP (~320 m²) gives more match-like interpersonal distances (S12).
- **Perc/Dec.** S15: higher physiological strain correlates moderately with poorer decisions and shooting. This is correlational, not causal.
- **Phys.** Larger area → more HR, TD and HSR (S7). But GF 4v4 showed an HSR **peak at the middle length** (GA2).
- **Psych.** Not measured.
- **Acute vs learning.** Acute only.
- **Confounds.** GA2 changed length, area and aspect ratio together. GA3 changed both dimensions. Skill level moderates responses (S9).
- **Distorts / sacrifices.**
  - Typical SSG APP (<150 m²) is **far below** the 11v11 match APP (~320 m²; S12). Small areas give non-match spacing and pressure.
  - Large areas lose repetitions and increase fatigue, which may degrade decision quality (S15).

### 4.3 Width only / 4.4 Length only
- **Tact.** S8: shorter → less longitudinal inter-team distance; narrower → less lateral distance; **each also changes the other axis**. S13's wide configuration → more crosses. S39's width increase in a 3v2 transition game → more running (no tactical data).
- **All other domains.** Not measured.
- **Acute vs learning.** Acute only.
- **Distorts / sacrifices.** Unknown. Because of the crossover, a coach cannot assume that narrowing affects only lateral play.

### 4.5 Aspect ratio (area constant)
- **Tact.** Long and wide shapes gave more counter-attacks, penetration and scoring opportunities than standard. Wide shapes gave more crosses (S13). Skill level changes the length:width response (S9).
- **All other domains.** Not measured.
- **Acute vs learning.** Acute only.
- **Distorts / sacrifices.** The *standard* shape may itself be the less representative option for transition-rich play. Unknown for GF.

### 4.6 Multiple targets / 4.7 Target type
- **Tech.** More shots with multiple goals (S18). Small goals → more dribbling (S15). No technical change with 1–3 small goals in elite women (S19).
- **Tact.** Six targets → greater inter-team distance, more lateral-corridor time, *more conservative* coordination (S16). Target type and floaters change dispersion and shape (S17).
- **Perc/Dec.** Non-significant trend to better decisions with one goal (S19).
- **Phys.** Small goals → most running in hurling (GA8). GKs → lower HR (S20). Stop-ball zone → higher HR (S21).
- **Psych.** Not measured.
- **Acute vs learning.** Acute only.
- **Distorts / sacrifices.**
  - Small goals without GKs remove goalkeeping and shot-from-distance decisions.
  - Many targets may teach retreating rather than switching (S16).
  - Stop-ball/end zones replace shooting with carrying or receiving over a line. For GF that removes the kick-to-score action entirely.

### 4.8 End zones
- **Evidence.** Physical only (S21). Tactical claims (running in behind, penetration) are **convention** (ledger §F).
- **Distorts / sacrifices.** In GF, no score is made by crossing a line.

### 4.9 Fixed numerical superiority / inferiority
- **Tech.** Superior team: more passes and actions (S24). Higher pass efficacy in 5v4 and 4v3 for novices (B4). More ball controls when facing more opponents (S25).
- **Tact.**
  - Underloaded team compacts; dominant regions and sector distances shift (S22).
  - Superiority → greater offensive performance (B7) and more space creation without the ball (B6).
  - Pace, score status and imbalance all shift dynamics (S27).
- **Perc/Dec.** **L:** pass decision-making and execution improved after a superiority-based programme (S46), with retention (S47). Neither design isolates superiority as the cause.
- **Phys.** Superior team walks more and has lower intensity (S23, S24). Balanced games give greater physical load (S38, B6).
- **Psych.** Inferior team perceives higher effort (S23).
- **Acute vs learning.** Mostly acute; S46/S47 are learning studies with weak designs.
- **Confounds.** S46 always ran the superiority phase first. Skill moderates effects.
- **Distorts / sacrifices.**
  - The attack meets **less pressure** than in matches.
  - The defence practises being outnumbered for the whole game, which is rarer and briefer in matches.
  - Physical intensity drops for the superior side.
  - The defensive learning value is unknown.

### 4.10 Temporary / fading overloads and recovering defenders
- **Evidence.** Only S26 (overloads rotating each minute → broader exploration). **No study was found in any of the four sports on recovering defenders, delayed defender entry, or recognition of a temporary advantage.**
- **Acute vs learning.** Neither exists for this design.
- **Distorts / sacrifices.** Unknown.
- **Grade.** **E.** Plausible (it matches how match overloads actually occur) but untested.

### 4.11 Floaters
- **Tech.** More passes and actions (S24).
- **Tact.** Floaters widen the team; two floaters shorten it (S28). An inside floater reduces penetration and increases defensive unity (S29). Floater position alters the information supporting passing, dribbling and shooting decisions in futsal (S30; results not verified).
- **Phys.** Lower intensity (S24).
- **Psych.** Not measured.
- **Acute vs learning.** Acute only.
- **Distorts / sacrifices.** Floaters never defend, so the defence always faces superiority. Attacking penetration is reduced. The possession-over-penetration bias may run *against* GF scoring intent.

### 4.12 Direction reversal
- No experimental evidence found. **E.**

### 4.13 Transition games
- **Evidence.** Physical (S39, S38). Counter-attack design study with tactical results not seen (S37). Convention only for behaviour (ledger §F).
- **Distorts / sacrifices.** Unknown. Scripted waves may remove the *recognition* of the moment the ball is won, which is the real transition problem.

### 4.14 Possession-only objective
- **Tech.** More passes, fewer dribbles and tackles (H2). Higher passing success with larger area (S15).
- **Tact.** No directional or penetration demand (by design).
- **Phys.** Mixed: possession more intense in S20, not in GA8.
- **Acute vs learning.** Acute only.
- **Distorts / sacrifices.**
  - **Suppresses dribbling and tackling (H2).**
  - Removes the scoring decision and goal-side defending.
  - For GF specifically, it rewards retention, which is the pre-2025 trend the rule changes aimed to reduce (report 01 §7.1).

### 4.15 Reward / bonus scoring
- **Phys and psych.** Point-possession → higher pace and enjoyment. Passes-based scoring → higher RPE (B8).
- **Tech/Tact.** Goal exaggeration → more goals and dribbling (S43). A U10 exaggeration showed no behavioural change (S50).
- **Acute vs learning.** Acute only.
- **Distorts / sacrifices.** Passes-based rewards may promote pass *counting* over purposeful passing (inference). Reward effects are unpredictable (S50).

### 4.16 Time pressure
- **Tech.** Basketball: more jumps (B5).
- **Tact.** Soccer coordination changes on some axes (S36).
- **Phys.** No load change in soccer (S38). More physical demand in basketball (B5).
- **Perc/Dec.** Not measured.
- **Acute vs learning.** Acute only.
- **Distorts / sacrifices.** Unknown. It may encourage rushed shots.

### 4.17 Touch restrictions
- **Tech.** More passes, **lower pass success and fewer duels** with 1-touch (S33). More unsuccessful passes (S32).
- **Tact.** Scarce and inconsistent (S32).
- **Phys.** Higher intensity and RPE.
- **Acute vs learning.** Acute only. A longitudinal RCT found fitness outcomes only (ledger S32 context).
- **Distorts / sacrifices.** Removes receiving-and-carrying options and duels (S33). **For GF, touch limits have no direct analogue.** The nearest (solo or bounce limits) is untested.

### 4.18 Dribble / carry restrictions
- **Tech.** More passes, **more turnovers** (B9). Fewer converted shots than when dribbling is allowed (B3).
- **Tact.** Authors suggest better collective behaviour (B15). Not measured directly.
- **Acute vs learning.** Acute only.
- **Distorts / sacrifices.** Removes 1v1 and carry decisions. It raises turnovers, which may reflect errors rather than learning.

### 4.19 Mandatory passes / 4.20 Zones
- **Zones.** Less long-term, more short-term exploration; relaxing zones speeds ball flow (S34).
- **Mandatory passes.** No results located.
- **Distorts / sacrifices.** Zones remove interchange and roaming that GF relies on. The effect of mandatory passes is unknown.

### 4.21 Restart type / location
- **Nothing found in any sport. E.**
- This matters most for GF, where kickouts are a defining contest and the 2025 rules changed them.

### 4.22 Defender / pressure level
- **Tech.** A defender changes shot kinematics (B16). Pressure on the ball → **lower execution** (S35).
- **Tact.** Full-court defence → more fakes (B5). Man vs zone → no technical change (B12). Man-marking → higher load (S35). Offside changes depth (S35).
- **Perc/Dec.** Pressure on the ball → **lower decision-making**, lower spatial exploration (S35).
- **Acute vs learning.** Acute only.
- **Distorts / sacrifices.** *Removing* pressure distorts the skill itself (B16). *Adding* pressure lowers success rates, which may reduce useful repetitions for novices.

### 4.23 Bout duration / regime
- **Tech.** No change for 2–6 min (S40). Short-intermittent → more possessions, dribbles and shots (B13).
- **Psych.** Enjoyment depends on sex × bout type (S41). No enjoyment difference by regime in B13.
- **Distorts / sacrifices.** Long continuous bouts may lower intensity (S40, HR at 6 min).

### 4.24 Coach encouragement / 4.25 Instruction
- **Encouragement.** Higher intensity (S2, B14). Higher enjoyment and more successful passes and shots in basketball (B14).
- **Instruction.** Explicit rules stretch occupation (S44). Instruction → connected passing networks, free play → dribbling (S43). Combining rules hurts (S44). GF huddles disliked (GA4).
- **Distorts / sacrifices.** Instruction may trade individual exploration for coordinated but coach-directed solutions (S43). Stacking multiple constraints can degrade performance (S44).

---

## 5. What this matrix does **not** show

- **No manipulation has a direct, isolated, longitudinal learning result in Gaelic football.** GA4 shows that a *package* works.
- **Almost no study links an in-game behaviour change to transfer into competition.** S12 and the Australian football studies X4/X5 compare training with match behaviour, but they do not test learning.
- **Hockey and basketball evidence is thin** outside player numbers, possession, pressure and a few rules.
- **Every entry is abstract-derived.** Grades could move up or down after full-text review.
