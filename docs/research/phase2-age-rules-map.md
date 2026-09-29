# PáircVision — Phase 2 — Age × Current Rules Map

**Type:** Short boundary audit. Research only. No production code, sessions, drills or framework creation.

**Read first:** [Game Understanding Landscape](./phase2-game-understanding-landscape.md) · [Current-Rules Game Structure Audit](./phase2-current-game-structure-audit.md).

**Scope:** GAA men's / boys' Gaelic football, Republic of Ireland, 2026.
- LGFA rules are a separate code and are excluded, except where they are noted for contrast.
- P1–P16 are taken **unchanged** from the game structure audit. They are classified here, not altered.

> ### ⚠️ ACCESS CAVEAT
>
> - **Every official regulation document was blocked.** Blocked sources include:
>   - the GAA *Go Games FAQ* (8 May 2026);
>   - the GAA U8, U10 and U12 rules pages;
>   - the Dublin CCC2 2026 regulations;
>   - the Down juvenile FRC recommendation;
>   - the Laois, Limerick, Cork (Rebel Óg), Kerry and Mayo sites.
> - Everything below is from **search-index renderings (SIO)**.
> - **Limerick's 2026 underage football rules could not be found at all** (§3). This matters, because PáircVision's practical testing is planned there.
> - Missing age rules are marked **UNKNOWN**. They are **not inferred from adult rules**.

**Source-level labels** (per the brief): **NATIONAL MANDATORY** · **NATIONAL RECOMMENDATION** · **PROVINCIAL** · **COUNTY-SPECIFIC** · **COMPETITION-SPECIFIC** · **UNKNOWN**.

---

## 0. Answer

**Verdict: B.** The core recurring problems survive across U12 to Adult. But several important problems and relationships need **age/rules variants**. A few adult problems do not exist at all below U13/U14.

**Current-rules breakpoint:** there is **no single national breakpoint**, but the evidence points to a **transition zone at U13–U14**:
- **U12 and below (Go Games / U12 leagues):** a different ruleset.
  - Up to 13-a-side on reduced pitches.
  - No marks, a restricted number of skills per possession, and different kickouts.
  - Solo-and-go is added nationally. A two-point arc and the 4v3 structure are **not found**.
- **U13:** county-dependent.
  - Dublin applies **all** FRC rules at U13–U16.
  - Laois applies a **subset** at U13 (solo-and-go, the throw-in, two points outside the arc excluding 45s) with juvenile modifications.
  - The FRC said the U13 arc would be **much smaller**.
- **U14 and above:** an FRC statement says all rule enhancements apply "for club and county underage games **down to U14**". It is **NATIONAL**, but whether it is **mandatory or a recommendation is UNKNOWN**. From U14, players generally play something structurally close to the adult game. Pitch, numbers (e.g. 13-a-side U17 academy leagues) and duration vary by county.

**Next Player Behaviour audit:** **P5 — exploit an unsettled defence after a regain** (§8). The own-kickout contest (P1/P3) is rejected as the first audit, because U12 kickouts are structurally different.

---

## 1. National framework (what applies everywhere)

| Rule / policy | Content (SIO) | Level | Source |
|---|---|---|---|
| Go Games model for **U11 and younger** | Every child plays the full game; no leagues or championships up to U11; no trophies up to U11 | **NATIONAL MANDATORY** (Central Council policy) | GAA Go Games; Go Games FAQ 2026 |
| **U12 and U13 on a league basis** | U12: league and blitz, **no knockouts**, **no scores published** (win/loss only where trophies are allowed) | **NATIONAL MANDATORY** | Go Games FAQ 2026 |
| Go Games numbers | Teams "endeavour to play the minimum numbers recommended": U7 4v4, U8 5v5, U9 5v5, U10 6v6, U11 6v6 | **NATIONAL RECOMMENDATION** | GAA Go Games |
| **Solo-and-go in Go Games** | "Solo and Go will be added to the Go Games (U12 down) list of rules" | **NATIONAL** (FRC statement; how it is implemented varies, see Down, §2) | FRC next-steps article (Jan 2025) |
| **FRC rules at U14 and above** | "All the new rule enhancements will be in place… for club and county underage games down to U14" | **NATIONAL** — mandatory vs recommendation **UNKNOWN**. The article dates from Jan 2025, so "next year" is **ambiguous** (2025 or 2026). | FRC next-steps article |
| **U13 arc** | "At U13 the new arc will be much smaller so it will be easier to kick two-points" | **NATIONAL** (FRC statement). **Distance UNKNOWN.** | Same |
| Adult rules | Full 2026 ruleset | **NATIONAL MANDATORY** | See the game structure audit, §1 |

---

## 2. Age × rules table

"—" means no source was found. **Do not read "—" as "same as adult".**

| Rule | U8 | U10 | U12 | U13 | U14 | U15 / U16 | Minor (U17) | Adult |
|---|---|---|---|---|---|---|---|---|
| **Numbers** | 5v5 (NAT REC) | 6v6 (NAT REC) | Up to **13-a-side**; 11–13 on a reduced pitch, ≤10 on a 7-a-side pitch (source of unknown ownership) | Laois: 15-a-side where possible, min 11 (COUNTY) | UNKNOWN (likely 15; not verified) | Laois U15: 15-a-side (COUNTY) | Laois U17 academy: mainly **13-a-side** (COUNTY/COMPETITION); inter-county minor 15 | 15 |
| **Pitch** | ~45 × 30 m (NAT REC) | Medium (NAT REC; dimensions UNKNOWN) | Reduced: **20 m line to 20 m line** (source of unknown ownership) | UNKNOWN | UNKNOWN | UNKNOWN | Full (inter-county) | Full |
| **Goal size** | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | Standard | Standard |
| **Ball** | Size 3 / Go Games ball (practice; NAT REC implied) | UNKNOWN | UNKNOWN | **Size 4** (Laois, COUNTY) | UNKNOWN | UNKNOWN | UNKNOWN | Size 5 |
| **Scoring** | Scores not published | Not published | Goal 3 / point 1; no scores published | **Two points outside a (smaller) arc, excluding 45s** (Laois COUNTY; FRC NAT) | FRC arc (NAT statement) | Dublin: all FRC (COUNTY) | UNKNOWN (likely FRC) | 1 / 2 / 3 |
| **4v3 half requirement** | **Arithmetically impossible** (it needs ≥7 players) | **Arithmetically impossible** | **Not found** (UNKNOWN) | Dublin: yes (all FRC, COUNTY). Laois: **not listed** (UNKNOWN). | NAT statement (all enhancements) | Dublin: yes | UNKNOWN (likely) | Yes |
| **Two-point arc** | — | — | **Not found** (UNKNOWN) | **Smaller arc** (NAT); Laois yes; Dublin yes | Yes (NAT statement) | Dublin: yes | UNKNOWN (likely) | 40 m |
| **Kickout** | UNKNOWN | UNKNOWN | Keeper may **advance 10 m**; from ground or hand (unknown-owner source). Down: from the **21 m line**, ground or hand (COUNTY, 2025). No arc found. | From the **hand** (Laois). "U13/U14 kickouts from the hand from the 20 m line" (unattributed county source). Dublin: FRC kickout (COUNTY). | From the hand, 20 m (unattributed); FRC arc if all enhancements apply | Dublin: FRC | UNKNOWN | FRC arc kickout |
| **Solo-and-go** | Added to Go Games (NAT) | Added to Go Games (NAT) | Yes (NAT). Down: **only the fouled player, only after a physical foul** (COUNTY). | Yes (Laois, Dublin) | Yes | Yes (Dublin) | UNKNOWN (likely) | Yes |
| **Advanced mark / kickout mark** | — | — | **No marks** (unknown-owner source) | Not listed in the Laois subset (UNKNOWN); Dublin all FRC | NAT statement | Dublin: yes | UNKNOWN | Yes |
| **Goalkeeper pass-back** | — | — | UNKNOWN | UNKNOWN (Dublin: all FRC) | NAT statement | Dublin: yes | UNKNOWN | Yes |
| **Contact / tackle** | No shoulder charge; tackle the ball only (REGIONAL source) | Shoulder permitted from U9 (same regional source) | UNKNOWN | UNKNOWN | UNKNOWN | UNKNOWN | Adult rules (assumed; not verified) | Adult |
| **Possession skills** | UNKNOWN | UNKNOWN | **Two skills per possession** (one hop + one solo, or two solos) | Laois: "two plays while in possession" | UNKNOWN | UNKNOWN | UNKNOWN | Unlimited (bounce/solo alternation) |
| **Duration** | UNKNOWN | UNKNOWN | UNKNOWN | Laois: **25 min halves**; 7 min extra-time periods | UNKNOWN | Laois U15: 10 min extra-time periods | Laois U17: 10 min extra-time periods | 35 min halves (inter-county) |
| **Other material rules** | No competitions | No competitions | No penalties, no square ball; toe-lift; 45s from 40 m | No square ball (Laois) | — | — | — | Hooter (2026) |

**Age-grade structure also varies:**
- Laois runs **odd** grades (U13, U15, U17).
- Dublin, Kerry and others run **even** grades (U14, U16) as well as odd ones.
- A national "U14" statement may therefore map onto different county competitions.

---

## 3. County sample and variation

| County | What was found (SIO) | Level | Access |
|---|---|---|---|
| **Limerick** | Only that Bord na nÓg runs underage competitions for 12,000+ children. **No 2026 playing-rule document found.** limerickgaa.ie was blocked. | **UNKNOWN** | Blocked |
| **Dublin** (Leinster) | CCC2 (**U13–U16**) "will implement **all** the new Football rules as per the FRC" in 2026 | COUNTY-SPECIFIC | SIO |
| **Laois** (Leinster) | U13: a **subset** of FRC rules (solo-and-go, throw-in, two points outside the arc excluding 45s) plus juvenile modifications (kickout from the hand, two plays in possession, no square ball, 25 min halves, size 4). U17 academy mainly 13-a-side. | COUNTY-SPECIFIC | SIO |
| **Down** (Ulster; Northern Ireland, outside scope, contrast only) | 2025: at U12, solo-and-go restricted to the fouled player after a physical foul; kickouts from the 21 m line. "Not officially required that rules be introduced at U12." | COUNTY-SPECIFIC | SIO |
| **Kerry / Cork / Mayo / Galway** | Competition structures found; **no 2026 rule details** | UNKNOWN | SIO / blocked |
| Unattributed county source | "U13/U14 kickouts are from the hand from the 20-metre line" | COUNTY (unknown which) | SIO |

**Extent of variation:** **substantial at U12–U13**, less at U14+.
- Within one province, Dublin (all FRC rules at U13) and Laois (a subset at U13) differ in whether U13 players meet 4v3, FRC kickouts and marks.
- Counties also modify skills per possession, kickout method and duration.
- **Do not assume Limerick matches either Dublin or Laois.**

**Limerick action (research, not product):** before any practical testing, obtain Limerick Bord na nÓg's 2026 football playing rules for U12–U16 directly from the county or the club underage coordinator. This one missing fact determines which variant of several problems Limerick players meet.

---

## 4. Structural consequences (no prescriptions)

| Age / rule difference | Structural consequence |
|---|---|
| **U8–U10: 5v5 / 6v6** | 4v3 is arithmetically impossible. Adult numerical relationships (≥3 forward, ≥4 back, ≤11 per half) **do not exist** as game structure. |
| **U8–U11: no competitions, no published scores** | Score/time context (P15, parts of P8) is not a structural feature of the game |
| **U12: up to 13-a-side on a reduced (20 m–20 m) pitch** | Distances, space and the number of defenders differ. Adult spatial relationships should not be assumed at scale. |
| **U12: no two-point arc found** | Shot-value choice (1 vs 2) and defending the arc edge **do not exist** at U12 (unless a county adds them; none found) |
| **U12: no marks** | Kickout-mark and advanced-mark options **do not exist** |
| **U12: keeper may advance 10 m; kickouts from ground or hand (or from the 21 m in Down); no arc** | **Adult own-kickout problems (P1/P2) do not transfer directly.** Short kickouts are possible, so the restart is a different problem. |
| **U12–U13: two skills per possession** | The carrier's options are restricted. The support problem (P6) is structurally more demanding (the carrier must release sooner). |
| **U13: smaller arc (FRC); county-varying FRC subset** | Two-point decisions exist but with **different geometry**. Whether 4v3 and FRC kickouts apply depends on the county. |
| **U13–U14: kickouts from the hand** | Kickout length and trajectory differ from adult kickouts. Contest and break patterns may differ (UNKNOWN). |
| **U14+: all FRC enhancements (national statement)** | The adult rule-created relationships **begin to apply**. Physical capacity (kick distance vs a 40 m arc) may still limit them in practice (UNKNOWN; not rule). |
| **U17 academy 13-a-side (Laois)** | 4v3 applies (if it does) to 13 players. The spare-player arithmetic differs from 15-a-side. |

---

## 5. P1–P16 across ages

Classification: **LIKELY UNIVERSAL ACROSS AGES** · **PRESENT BUT MODIFIED** · **ADULT/CURRENT-RULE DEPENDENT** · **UNKNOWN**.

Each row applies to U12–Adult. U8–U10 are noted where they differ.

| # | Problem (unchanged) | Classification | Reason |
|---|---|---|---|
| P1 | Win/secure possession from our own kickout | **PRESENT BUT MODIFIED** (adult form **CURRENT-RULE DEPENDENT**) | The kickout exists at all ages, but the arc, marks and contest-heavy form start at U13/U14 (county-dependent). U12 kickouts differ (10 m advance / 21 m, short possible). |
| P2 | Contest/deny the opposition kickout | **PRESENT BUT MODIFIED** | As P1 |
| P3 | Win the breaking/loose ball | **LIKELY UNIVERSAL** (loose ball); the kickout-contest share is rule-dependent | Spills, blocks and rebounds occur at every age |
| P4 | Escape pressure in own half | **PRESENT BUT MODIFIED** | Pressing exists. The goalkeeper restriction and ≤11 caps are UNKNOWN below U14. Smaller pitches change the geometry. |
| P5 | Exploit an unsettled defence after a regain | **LIKELY UNIVERSAL** | Turnovers and unset defences occur at every age. The 4v3 "guaranteed forward outlets" are a **variant layer** from U13/U14. |
| P6 | Support a ball carrier under pressure | **LIKELY UNIVERSAL** (purpose); **PRESENT BUT MODIFIED** (form) | The two-skills limit at U12–U13 changes the carrier's options |
| P7 | Progress against a settled defence | **PRESENT BUT MODIFIED** | Defensive organisation and numbers differ; the ≤11 cap applies only where 4v3 applies |
| P8 | Create a shot / choose shot value | **Create: LIKELY UNIVERSAL. Choose 1 vs 2: CURRENT-RULE DEPENDENT** (U13+ with a smaller arc; U14+ standard) | No arc found at U12 |
| P9 | Enter the scoring area (incl. advanced mark) | **PRESENT BUT MODIFIED** (mark part **CURRENT-RULE DEPENDENT**) | No marks at U12 |
| P10 | React to possession loss | **LIKELY UNIVERSAL** | — |
| P11 | Regain defensive shape/numbers | **PRESENT BUT MODIFIED** (4v3 part **CURRENT-RULE DEPENDENT**) | — |
| P12 | Defend the two-point threat | **CURRENT-RULE DEPENDENT** (U13+, county-dependent) | — |
| P13 | Defend a quick restart (solo-and-go) | **PRESENT BUT MODIFIED** | Solo-and-go is in Go Games nationally; Down restricts who may take it at U12 |
| P14 | Keep 4v3 while attacking/pressing | **CURRENT-RULE DEPENDENT** | Impossible at ≤6-a-side; not found at U12; county-dependent at U13 |
| P15 | Manage late game under the hooter | **CURRENT-RULE DEPENDENT / UNKNOWN** | No published scores at U12; hooter use at juvenile level UNKNOWN |
| P16 | Transition after winning the ball high | **PRESENT BUT MODIFIED** | Pressing and regain exist; press caps are rule-dependent |

**Count:**
- 4 likely universal (P3, P5, P6 purpose, P10);
- 8 present but modified;
- 4 current-rule dependent (P12, P14, P15, the shot-value part of P8);
- none wholly unknown.

---

## 6. Key question

**Can PáircVision reasonably have one core Game Understanding model from U12 to Adult, with contextual rule adaptations?**

### **B — Core recurring problems survive, but important problems/relationships require age/rules variants.**

**Why not A:**
- the adult kickout (P1/P2) is a different problem at U12;
- the 4v3 relationships (P14, parts of P5/P11) are absent at U12 and county-dependent at U13;
- the two-point decisions (P8/P12) do not exist at U12.

These are not "minor adaptations". They change what players must notice and decide.

**Why not C:**
- the ball-status structure (ours / theirs / loose) and the regain / loss / settled problems exist at every age;
- 12 of 16 problems are universal or present-but-modified.

A common core is defensible.

**Why not D:** the evidence is weak on details (Limerick, U12 arc/4v3, goal and ball sizes), but strong enough to separate universal from rule-dependent problems.

**Structural implication (observation, not design):**
- U8–U10 sit **outside** a U12–Adult model. Their numbers make the adult relationships arithmetically impossible.
- Any core model should make the **ruleset an explicit input** ("which game are these players playing?") rather than assume the adult game.

---

## 7. Current-rules breakpoint summary

| Rule feature | Earliest age found | Level | Confidence |
|---|---|---|---|
| Solo-and-go | Go Games (≤U12) | NATIONAL (FRC); county restrictions (Down) | M |
| Two-point arc | **U13 (smaller arc)** | NATIONAL statement + COUNTY (Laois, Dublin) | M |
| Standard 40 m arc | U14 | NATIONAL statement | L–M |
| 4v3 | **U13 in Dublin; U14 nationally (statement)** | COUNTY / NATIONAL | L–M |
| FRC kickout (beyond the arc) | U13 in Dublin; U14 nationally (statement) | COUNTY / NATIONAL | L–M |
| Goalkeeper pass-back restriction | U13 in Dublin; U14 nationally (statement) | COUNTY / NATIONAL | L |
| Marks | U13 in Dublin; U14 nationally (statement) | COUNTY / NATIONAL | L |
| Limerick | **UNKNOWN for all** | — | — |

---

## 8. Next-step decision

**Recommended first Player Behaviour audit: P5 — exploit an unsettled defence after a regain.**

| Criterion | P5 (regain → exploit) | P1/P3 (own kickout / break) | Other candidates considered |
|---|---|---|---|
| Occurs across target ages | **Yes, all ages** (universal) | **No:** a different restart at U12; county-dependent at U13 | P10 (react to loss) is also universal |
| Tactically meaningful | Yes. Pre-2025, turnovers were ~half of possessions and ~40 % of score origins. | Yes | P10 is meaningful |
| Tests the recurring-problem architecture | **Strongly:** it spans support, width, depth, direct-vs-retain, and the carrier-skill limits. It has a **rule variant layer** (4v3 outlets at U13/U14+), so it tests "core problem + age/rule variants" directly. | Tests the adult variant only | P6 (support) would test a concept, not a problem |
| Evidence / practitioner material | Pre-2025 counter-attack and turnover studies (need re-testing); GAA "Transition from Defence to Attack" webinar; LGFA "quick attack from defence" resources | Best current (GIU) evidence, but adult only | P10 has less material |
| Connects to Phase 1 | Naturally: a GAME MOMENT follow-up (regain as a follow-up moment); GI-2 (is the "unset defence" information preserved in practice?); Decision Allocation (go vs secure) | Yes | — |

**Why not the own-kickout contest first:**
- The kickout has the best *current* adult data.
- But its adult form does not exist at U12, and Limerick's U13 kickout rules are unknown.
- Operationalising it first would build the model on its **least transferable** problem.
- It remains the strongest candidate **for the adult/U14+ variant layer** later.

**Scope note for the future P5 audit** (not performed):
- It should separate what is universal about exploiting an unset defence from the **4v3 variant layer**.
- It should mark U12 constraints: the two-skills limit, 13-a-side, and the reduced pitch.
- It should treat P10 (react to loss) as the natural reciprocal problem.

---

## Evidence ledger

| # | Claim | Source | Level | Access | Conf. |
|---|---|---|---|---|---|
| 1 | U11 and younger on the Go Games model; U12/U13 league basis; U12 no knockouts, no published scores | [GAA Go Games FAQ, 8 May 2026](https://learning.gaa.ie/sites/default/files/2026-05/Go%20Games%20FAQ%20Final%2008.05.2026.pdf) · [GAA Go Games](https://www.gaa.ie/my-gaa/getting-involved/go-games) | NATIONAL MANDATORY | SIO (blocked) | M |
| 2 | Go Games numbers U7–U11; U8 pitch; no competitions ≤U11 | [GAA Go Games](https://www.gaa.ie/my-gaa/getting-involved/go-games) · [Go Games Policy 2023](https://ladiesgaelic.ie/wp-content/uploads/2023/03/Go-Games-Policy-Document-2023.pdf) · [Connacht Go Games rules](https://connachtgaa.ie/go-games-rules/) | NATIONAL REC / PROVINCIAL | SIO | M |
| 3 | FRC: all enhancements down to U14; smaller U13 arc; solo-and-go added to Go Games | [GAA, FRC next steps](https://www.gaa.ie/article/frc-outline-next-steps-in-implementation-of-rule-enhancements) · [Cork GAA repost](https://gaacork.ie/2025/01/07/frc-outline-next-steps-in-implementation-of-rule-enhancements/) | NATIONAL (status unclear; date ambiguous) | SIO | M |
| 4 | U12 rules: ≤13-a-side, reduced pitch, keeper 10 m advance, no marks, two skills, no penalties | [Under 12's Rules, pathway resources](https://gaa-pathway-resources.com/rules-regulations/football/under-12s-rules) · [U10](https://gaa-pathway-resources.com/rules-regulations/football/under-10s-rules) · [U8](https://gaa-pathway-resources.com/rules-regulations/football/under-8s-rules) | **UNKNOWN ownership** (possibly a county or provincial board) | SIO (blocked) | L–M |
| 5 | Down U12 solo-and-go restriction; 21 m kickouts; FRC rules not required at U12 | [Down GAA juvenile FRC recommendation (2025)](https://carryduffgac.com/wp-content/uploads/sites/28/2025/01/2025-FRC-Rules-Juvenile-Recommendation.pdf) · [Carryduff GAC summary](https://carryduffgac.com/introducing-the-2025-football-rule-updates/) | COUNTY (NI, contrast) | SIO | M |
| 6 | Dublin CCC2 U13–U16: all FRC rules in 2026 | [Dublin CCC2 regulations 2026](https://d1cnc2w242mbew.cloudfront.net/f/311724/x/a94d2ba008/ccc2-football-and-hurling-regulations-2026.pdf) · [Dublin Juvenile](https://www.dublingaa.ie/juvenile) | COUNTY | SIO (blocked) | M |
| 7 | Laois U13 FRC subset and modifications; U15/U17 formats | [Laois Coiste na nÓg 2026](https://laoisgaa.ie/laois-coiste-na-nog-regulations-2026/) | COUNTY | SIO | M |
| 8 | Limerick Bord na nÓg (no rules found) | [Limerick Leader](https://www.limerickleader.ie/news/limerick-sport/756265/limerick-gaa-confirm-bord-na-nog-title-sponsor-for-new-season-of-underage-games.html) · [Limerick GAA (blocked)](https://limerickgaa.ie/) | UNKNOWN | Blocked | — |
| 9 | Kerry / Cork / Mayo underage structures | [Kerry Coiste na nÓg 2026](https://www.kerrygaa.ie/2026/03/kerry-coiste-na-nog-u14-league-and-u15-feile-na-ngael) · [Rebel Óg regulations](https://rebelog.ie/regulations/) · [Mayo Bord na nÓg](https://mayogaa.com/bord-na-nog-rules-regulations/) | COUNTY | SIO | L |
| 10 | Minor = under 17 on 1 January | [2026 All-Ireland Minor FC](https://en.wikipedia.org/wiki/2026_All-Ireland_Minor_Football_Championship) | NATIONAL (competition) | SIO | M |
| 11 | Ball size 3 for Go Games (practice) | [Gaelic ball, Wikipedia](https://en.wikipedia.org/wiki/Gaelic_ball) | Secondary | SIO | L |
| 12 | LGFA separate rules (excluded) | [LGFA approve new playing rules](https://ladiesgaelic.ie/lgfa-approve-new-playing-rules/) | Other code | SIO | M |

**Independence:**
- #1–#3 are GAA national sources.
- #5–#7 are independent county decisions, and they **disagree**. That disagreement is the finding.
- #4's ownership is unknown and should not be treated as national.
