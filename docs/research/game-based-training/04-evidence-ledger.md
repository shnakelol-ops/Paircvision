# 04 — Evidence Ledger

**Purpose.** One entry per source that supports a relationship in [`03-manipulation-behaviour-matrix.md`](./03-manipulation-behaviour-matrix.md). Each entry records the exact experimental conditions that could be verified, the comparator, what was measured, whether the effect is acute or longitudinal, and any confounds.

**Companion files.**
- [`03-manipulation-behaviour-matrix.md`](./03-manipulation-behaviour-matrix.md)
- [`05-conflicts-gaps-and-unknowns.md`](./05-conflicts-gaps-and-unknowns.md)
- [`06-research-implications.md`](./06-research-implications.md)

---

## 0. Access status — read this first

This audit ran in a cloud environment whose network policy **blocked every full-text host tried**: publishers, PubMed, PMC, Europe PMC, Crossref, OpenAlex, Semantic Scholar, CORE, ResearchGate, university repositories and TU Dublin Arrow. The only discovery channel was a web-search index that returns titles, URLs and abstract-level summaries.

**No full text was inspected for any entry.** Every entry carries one of these access codes:

| Code | Meaning |
|---|---|
| **AO** | **ABSTRACT ONLY.** Design and results come from the abstract or an abstract-equivalent index summary. Methods detail beyond the abstract has **not** been verified. |
| **MO** | **METADATA / DESIGN ONLY.** Design was visible, but results were not. The source is listed so it can be retrieved, but it is **not** used as evidence for direction of effect. |
| **SS** | **SECONDARY SUMMARY.** The finding is known only through another paper's or review's description. It is not traced to the original. |

Rules applied throughout:

- **Participants, dimensions and durations** are recorded only when they appeared in the abstract or summary. Blank means *not verified*, not *not reported*.
- **Area per player (APP)** is calculated where dimensions and player numbers were both visible. It is total area ÷ all players on the pitch (goalkeepers included if stated), and is labelled as my calculation.
- **Acute vs longitudinal.** *Acute* = behaviour during the game itself. *Longitudinal* = change after repeated practice, measured in a test or match. Almost everything here is acute.

**To upgrade this ledger**, re-run in an environment with full-text access (see 06 §5) and change AO → FT entry by entry.

---

## A. Gaelic games (Gaelic football and hurling)

> **Rule-era flag.** Every Gaelic entry below was collected under **pre-2025 playing rules**. SSG studies use their own tailored rules, so the SSG behaviour itself is not invalidated. What may no longer transfer is its **match relevance**: kick/hand-pass balance, kickouts, and scoring value from distance. The 2025 Football Review Committee changes include:
> - a 40 m two-point arc;
> - kickouts that must travel beyond the arc;
> - at least 3 outfield players kept in each half;
> - "solo and go" after a foul;
> - a back-pass restriction.
>
> Source: [GAA FRC explainer](https://www.gaa.ie/article/football-review-committee-rule-enhancements-explainer).

### GA1 — Malone, Solan & Collins (2016) · MO
- **Citation.** *The influence of pitch size on running performance during Gaelic football small sided games.* IJPAS 16(1):111–121.
- **Links.** [T&F](https://www.tandfonline.com/doi/abs/10.1080/24748668.2016.11868874); [ResearchGate](https://www.researchgate.net/publication/299437604_The_Influence_of_pitch_size_on_running_performance_during_Gaelic_football_small_sided_games).
- **Condition.** 80×20, 60×20 and 40×20 m. Running variables: TD, HSR ≥17 km/h, sprint ≥22 km/h, accelerations. RPE, %HRmax and iTRIMP were also collected.
- **Results.** Not verified. One index summary said the large pitch had greater running and physiological demands, but it could not be attributed with confidence to this paper rather than to GA2.
- **Use.** Retrieval target only.

### GA2 — Mangan, Collins, Burns & O'Neill (2019) · AO
- **Citation.** *An investigation into the physical, physiological and technical demands of small sided games using varying pitch dimensions in Gaelic football.* IJPAS 19(6):971–984.
- **Link.** [T&F](https://www.tandfonline.com/doi/full/10.1080/24748668.2019.1689003).
- **Participants.** 34 sub-elite adult male players; 312 player observations; 2018 season.
- **Format.** 4v4 on 40×20, 60×20 and 80×20 m. **APP (calc., 8 players): 100 / 150 / 200 m².** Goalkeeper inclusion not verified.
- **Results.**
  - The **60×20 m** pitch gave more HSR (>17 km/h) and sprinting (>22 km/h) than **both** 40×20 and 80×20.
  - Effects on mean and peak HR were **trivial**.
  - Technical outcomes were measured, but **the values were not visible**.
- **Timing.** Acute.
- **Confound.** Width was fixed, so **length, total area, APP and aspect ratio (2:1 → 3:1 → 4:1) all changed together**. The effect cannot be attributed to length alone.

### GA3 — Gaelic football SSG study of inter-county minors · AO
- **Citation.** *The Physical and Technical Demands of Gaelic Football Small-Sided Games.* Authors and venue could not be confirmed from accessible metadata; it may be a conference abstract.
- **Link.** [ResearchGate 332112580](https://www.researchgate.net/publication/332112580_The_Physical_and_Technical_Demands_of_Gaelic_Football_Small-Sided_Games).
- **Participants.** 16 elite adolescent players from an inter-county minor squad (16.5 ± 0.3 y).
- **Format.** 3 × 4-min SSG with 4-min active recovery.
  - Small 22×37 m (814 m²), medium 30×48 m (1,440 m²), large 35×58 m (2,030 m²).
  - **Players per side not verified**, so APP is not calculable.
  - Both length and width changed, with a similar aspect ratio (~1.6–1.7).
- **Results.**
  - **Small pitch:** more possessions, **hand passes, tackles and points**, and most accelerations.
  - **Large pitch:** most **kick passes**, higher **goal conversion**, and most total distance and HSR.
- **Timing.** Acute only. These are counts: **frequency, not quality**. There was no decision measure.
- **Confound.** Total area changed along with both dimensions.

### GA4 — Kinnerk, Kearney, Harvey et al. (2025) · AO
- **Citation.** *Gaelic Football Coaches' Use of a Game-Based Approach Impacts Game Performance, Session Characteristics, and Player Perceptions.* RQES 96(4).
- **Links.** [T&F](https://www.tandfonline.com/doi/full/10.1080/02701367.2025.2496263); [SHAPE summary PDF](https://convention.shapeamerica.org/Common/Uploaded%20files/document_manager/events/best-of/Gaelic-Football-Coaches-Use-of-a-Game-Based-Approach-Impacts-Game-Performance.pdf).
- **Participants.** U14 and U15 academy squads.
- **Design.** Mixed-methods multiple-baseline design framed by Complex Learning Theory.
  - The intervention used conditioned games, a tactical curriculum and player huddles.
  - Assessment games were coded with an in-possession observation instrument (Game Play Observational Instrument, per index summary).
- **Results.**
  - **Decision-making improved on all variables in both squads.**
  - Skill execution improved **at U14 only**.
  - Sessions shifted toward playing form and non-linear sequencing.
  - Players valued the conditioned games, but **huddles were poorly received**.
- **Timing.** **Longitudinal.** This is the only Gaelic learning-outcome study found.
- **Limitation.** The specific manipulations inside the conditioned games are **not visible**. The study tests the GBA *package*, not any single manipulation.

### GA5 — GBA intervention and physical activity in youth Gaelic football (2024 preprint) · AO
- **Citation.** Research Square preprint, **not peer-reviewed at time of indexing**.
- **Link.** [Research Square](https://www.researchsquare.com/article/rs-4533694/v1).
- **Participants.** U17 boys and U16 girls.
- **Results.** Time in playing form increased (+63.4% for U17 boys; +42.9% for U16 girls), and session and daily physical activity increased.
- **Timing.** Longitudinal, but for session characteristics and PA only. There were no behaviour outcomes.

### GA6 — Kinnerk et al. (2019) · AO
- **Citation.** *Self-reported practice activities and session sequencing of inter-county Gaelic football coaches.* ISCJ 6(2).
- **Link.** [ISCJ](https://journals.humankinetics.com/view/journals/iscj/6/2/article-p211.xml).
- **Participants.** 150 coaches.
- **Results.** Training-form activities dominate pre-season. Playing form dominates only at peak season. Sessions usually run drills first, then games.
- **Use.** Context on what coaches do. **Not** a manipulation study.

### GA7 — Youth Gaelic games coaching practices (2025) · AO
- **Citation.** ISCJ 13(2).
- **Link.** [ISCJ](https://journals.humankinetics.com/view/journals/iscj/13/2/article-p290.xml).
- **Participants.** 432 coaches.
- **Results.** Training form dominates early in the season. Most coaches use a linear session structure.
- **Use.** Context only.

### GA8 — Malone et al. (2017), hurling · AO
- **Citation.** *Effect of game design, goal type, and player numbers on the physiological and physical demands of hurling-specific small-sided games.* JSCR 31(6).
- **Links.** [JSCR](https://journals.lww.com/nsca-jscr/Fulltext/2017/06000/Effect_of_Game_Design,_Goal_Type,_and_Player.5.aspx); [TU Dublin](https://arrow.tudublin.ie/ittsciart/118/).
- **Participants.** 48 hurlers.
- **Conditions.** Possession, normal play, regular goals and small goals × 4-, 5- and 6-a-side.
- **Results.**
  - **Small goals** gave the highest total distance in all formats.
  - **4-a-side** gave the highest %HRmax (~94%) regardless of design.
  - Goal designs were **not** less intense than possession, which the authors say contrasts with earlier soccer literature.
- **Timing.** Acute. Physical outcomes only; **no technical or tactical measures** visible.

### GA9 — Malone & Collins (2017), hurling pitch size · AO
- **Link.** [ResearchGate](https://www.researchgate.net/publication/308275235_The_Influence_of_Pitch_Size_on_Running_Performance_and_Physiological_Responses_During_Hurling-Specific_Small-Sided_Games).
- **Participants.** 24 club hurlers. 4-min SSGs.
- **Results.** Larger pitches gave higher %HRmax, iTRIMP and RPE than medium and small.
- **Timing.** Acute, physical only.

### GA10 — Winning vs losing in hurling SSGs (2016) · AO
- **Citation.** *The physical and physiological demands of small-sided games: How important is winning or losing?* IJPAS 16(2).
- **Link.** [T&F](https://www.tandfonline.com/doi/abs/10.1080/24748668.2016.11868898).
- **Participants.** 26 hurlers.
- **Results.** Winning teams covered more total and high-speed distance.
- **Timing.** Acute, physical only. **Outcome status** is a confound in any SSG comparison.

### GA11 — Mangan, Collins, Burns & O'Neill (2022) · AO
- **Citation.** Tactical periodisation model for Gaelic football. IJSSC.
- **Link.** [IJSSC](https://journals.sagepub.com/doi/full/10.1177/17479541211016269).
- **Use.** A **conceptual model** built on game moments. No experimental data. Grade D if used.

### GA12 — Coaching research in Gaelic games: scoping review (2024) · AO
- **Citation.** Sports Coaching Review.
- **Link.** [T&F](https://www.tandfonline.com/doi/abs/10.1080/21640629.2024.2387838).
- **Findings.** 38 studies. Only **four** studied the technical demands of Gaelic-specific SSGs. Coaches often conflate GBA with SSGs and "set up a game and step back".
- **Use.** Confirms how thin the direct Gaelic base is.

### GA13 — Collins, Doran & Reilly (2013) · SS
- Proceedings of the 7th World Congress on Science and Football.
- An 8-week SSG intervention (six 4v4 × 4-min games, 80×20 m), described in a secondary summary.
- **Outcomes not verified. Not used.**

---

## B. Soccer, including futsal

### Player numbers and area

**S1 — Hill-Haas et al. (2011), systematic review · AO**
- *Physiology of small-sided games training in football.* Sports Med 41(3):199–220. [Springer](https://link.springer.com/article/10.2165/11539740-000000000-00000).
- Intensity rises when player number falls **and** relative area rises. Smaller formats have lower variability. Coach encouragement raises intensity.
- Physiological focus.

**S2 — Rampinini et al. (2007) · AO**
- *Factors influencing physiological responses to small-sided soccer games.* J Sports Sci 25(6):659–666. [T&F](https://www.tandfonline.com/doi/abs/10.1080/02640410600811858).
- 20 amateur adults (24.5 y).
- Player numbers, field size and **coach encouragement** were all manipulated.
- Larger pitches gave higher HR and lactate. Encouragement gave higher HR (~91% HRmax) and lactate (6.5 mmol/L).
- Specific formats and dimensions not verified. Physiological only.

**S3 — Owen, Wong, McKenna & Dellal (2011) · MO**
- JSCR 25(8):2104–2110. [ResearchGate](https://www.researchgate.net/publication/51193095_Heart_Rate_Responses_and_Technical_Comparison_Between_Small-_vs_Large-Sided_Games_in_Elite_Professional_Soccer).
- 15 Scottish Premier League players. 3v3+GK vs 9v9+GK, 3 × 5 min with 4-min rest.
- **Technical results not visible.**
- **Confound:** player number and pitch area changed together.

**S4 — Abrantes et al. (2012) · AO**
- JSCR. [PubMed record](https://pubmed.ncbi.nlm.nih.gov/22446670/).
- 16 high-level youth players (15.75 y). 3v3 vs 4v4 × offence-only, defence-only and full game.
- Adding a player interacted with game type. Only the full game gave "adequate intensity".

**S5 — Castellano, Puente, Echeazarra, Usabiaga & Casamichana (2016) · AO**
- *Number of players and relative pitch area per player…* PLOS ONE. [PLOS](https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0127505).
- U12/U13. **7, 9 and 11 players (per side) × RPA of 100, 200 and 300 m², fully crossed.** 2 × 12 min.
- **Pitch dimensions affected locomotor activity more than player number did.** The hypothesis that player number has the larger effect on HR was **refuted**.
- **This is the key de-confounded soccer study for numbers vs area.** Physical outcomes only.

**S6 — Casamichana & Castellano (2010) · AO**
- J Sports Sci 28:1615–1623. [T&F](https://www.tandfonline.com/doi/abs/10.1080/02640414.2010.521168).
- 10 youth males. 5v5+GK with **number fixed**, individual area ~275, ~175 and ~75 m². 8-min bouts, 5-min rest.
- Physiological, physical, RPE and "motor behaviour" measured. **Technical results not visible.**

**S7 — Clemente et al. (2023), meta-analysis · AO**
- *Effects of pitch size on… responses during SSGs.* Biol Sport. [PMC](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9806761/).
- 41 articles.
- Larger pitches gave **higher HR, RPE, TD, HSR, stretch index and surface area**.
- There was **no significant difference in passes, dribbles, accelerations or centroid position**, "independent of format and age group".

**S8 — Frencken, van der Plaats, Visscher & Lemmink (2013) · AO**
- *Size matters: pitch dimensions constrain interactive team behaviour in soccer.* J Syst Sci Complex 26:85–93. [Springer](https://link.springer.com/article/10.1007/s11424-013-2284-1).
- 4v4 in four conditions:
  - reference 30×20 m (APP calc. 75 m²);
  - shorter 24×20 m (60 m²);
  - narrower 30×16 m (60 m²);
  - both 24×16 m (48 m²).
- A shorter pitch reduced longitudinal inter-team distance. A narrower pitch reduced lateral inter-team distance. A smaller area reduced surface area.
- **There was a crossover effect: length manipulation also changed lateral measures, and width manipulation also changed longitudinal ones.**
- This is the only located study that **separately** manipulated width and length.

**S9 — Silva, Duarte, Sampaio et al. (2014) · AO**
- *Field dimension and skill level constrain team tactical behaviours in SSCGs.* J Sports Sci 32(20):1888–1896. [T&F](https://www.tandfonline.com/doi/abs/10.1080/02640414.2014.961950).
- Two skill levels, three field sizes.
- Effective playing space and team separateness rose with pitch size at both levels.
- Length:width ratio rose with pitch size for **non-league** players but stayed constant for **recreational** players.
- **Skill level moderates** the response to pitch size.

**S10 — Silva, Esteves, Correia, Davids, Araújo & Garganta (2015) · AO**
- *Effects of manipulations of player numbers vs. field dimensions on inter-individual coordination.* IJPAS 15(2):641–659. [SHURA](https://shura.shu.ac.uk/17435/).
- 24 U15 players. Relative space per player of 118, 133 and 152 m², reached either by changing numbers or by changing dimensions.
- **Changing numbers** gave more free space near each player.
- **Changing dimensions** gave more advantageous local numerical relations and broader spatial distribution.
- **The same APP produced different behaviour depending on *how* it was reached.**

**S11 — Silva et al. (2016) · AO**
- *Sports teams as complex adaptive systems: manipulating player numbers…* SpringerPlus. [Springer](https://link.springer.com/article/10.1186/s40064-016-1813-5).
- 10 U15 players. 3v3, 4v4 and 5v5.
- Dispersion rose with numbers, but **team separateness stayed the same** across formats.

**S12 — Olthof, Frencken & Lemmink (2019) · AO**
- *A match-derived relative pitch area facilitates the tactical representativeness of SSGs.* JSCR 33(2):523–530. [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC6358197/).
- Elite youth U13–U19. 4v4, 6v6 and 8v8 compared with official matches.
- Typical SSG RPA is <150 m², against ~320 m² in the match. **A match-derived RPA (~320 m²) facilitated tactical representativeness** (interpersonal distances, length, width, surface area).

**S13 — González-Rodenas, Aranda-Malavés, Tudela-Desantes, de Matías-Cid & Aranda (2021) · AO**
- IJERPH 18:10500. [PMC](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8507751/).
- 22 youth players. 7v7 + 1 floater (goalkeepers included).
- Standard 53×38 m (2,014 m²), **Long 63×32 (2,016 m²)**, **Wide 43×47 (2,021 m²)**. **Area was held constant.** APP calc. ≈134 m² across 15 players.
- Long and Wide both gave **more counter-attacks, deeper penetration and more scoring opportunities** than Standard. Wide gave **more cross assists**.
- **This is the cleanest aspect-ratio manipulation located.**

**S14 — Nieto, Castellano, Echeazarra & Fernández (2023) · MO**
- IJSSC 18(4):1229–1239. [DOI](https://doi.org/10.1177/17479541221101603).
- U15 elite. 11v11 on pitch lengths of 100, 75 and 50 m with width fixed at 60 m. Collective and physical variables measured.
- **Results not visible.**

**S15 — JSSM (2025), field size × scoring method · AO**
- *Higher heart rate intensity can negatively impact tactical decision-making and technical accuracy in SSGs.* J Sports Sci Med 24:522–531. [JSSM](https://www.jssm.org/researchjssm-24-522.xml.xml).
- 36 regional male youth (16.5 y). 3v3 at **75, 100 and 125 m² per player** × **possession vs small goals**. Four weeks, non-controlled, repeated measures.
- Possession and larger fields gave higher intensity and higher **passing success**. Smaller fields and small goals gave more **dribbling**.
- Higher physiological strain was **moderately correlated** with poorer shooting effectiveness and decision quality. The authors say this is not generalisable.

### Targets and scoring

**S16 — Travassos, Gonçalves, Marcelino, Monteiro & Sampaio (2014) · AO**
- *How perceiving additional targets modifies teams' tactical behavior during football SSGs.* Hum Mov Sci 38:241–250. [ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S0167945714001821).
- 2 vs 6 scoring targets.
- With 6 targets: **greater distance between teams, less space occupied, more time in lateral corridors and defensive sectors**. The authors interpret this as more *conservative* coordination.

**S17 — Castellano, Silva, Usabiaga & Barreira (2016) · AO**
- *Influence of scoring targets and outer-floaters on dispersion, shape and creation of space.* J Hum Kinet. [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC5260558/).
- 24 players: 4 teams of 5 + 2 GK + 2 floaters. 6 × 6-min bouts. Small goals vs goalkeepers × outer floaters.
- Target type and floaters changed dispersion, shape and space. **Direction of each effect not verified.**

**S18 — Goal format with prepubescent players (2016) · AO**
- Sports 4(4):53. [PMC](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5968898/).
- The number and positioning of goals was associated with turns, dribbles, shots, goals and overlaps. **More shots with multiple goals.**

**S19 — Number of small goals, national-level female players (2025) · AO**
- Sensors. [PMC](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12251661/).
- 16 national female players (22.3 y). 8v8 without goalkeeper on 45×40 m (APP calc. 112.5 m²), with **1, 2 or 3 small goals** (1.2×0.8 m).
- **No significant technical–tactical effects.** A non-significant trend to better decision-making with 1 goal, and longer possession than with 3 goals.
- Physical differences were present.

**S20 — Mallo & Navarro (2008) · SS**
- J Sports Med Phys Fitness. [ResearchGate](https://www.researchgate.net/publication/5426267_Physical_load_imposed_on_soccer_players_during_small-sided_games).
- 3v3 / 4v4. Possession games were more demanding than the same game with goals and goalkeepers. Goalkeepers lowered HR.

**S21 — Stop-ball (end-zone) vs small goals (2014) · AO**
- J Sports Sci 32(15). [T&F](https://www.tandfonline.com/doi/full/10.1080/02640414.2014.899707); related [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC5424456/).
- 18 youth (13.5 y). 2v2, 3v3 and 4v4 on a **fixed 20×25 m** pitch (APP calc. 125 / 83 / 62.5 m²). 4 × 4 min.
- Stop-ball meant stopping the ball in a 15×1 m zone behind the end line. Small goals were 1×0.5 m.
- **Stop-ball gave higher HR** in all formats.
- Physiological only. **Confound:** player number and APP moved together.

### Numerical balance, floaters and temporary imbalances

**S22 — Silva, Travassos, Vilar et al. (2014) · AO**
- *Numerical relations and skill level constrain co-adaptive behaviours…* PLOS ONE 9(9):e107112. [PLOS](https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0107112).
- National and regional players. 5v5, 5v4 and 5v3.
- Asymmetry changed individual dominant regions, **the underloaded team's compactness**, relative team position and inter-sector distances.

**S23 — Numerical unbalance in possession SSGs (2020) · AO**
- Front Psychol. [Frontiers](https://www.frontiersin.org/journals/psychology/articles/10.3389/fpsyg.2020.01464/full).
- Inferior teams covered more high-intensity distance and perceived the games as harder. Superior teams walked more.
- The authors suggest high inferiority (e.g., 4v2, 4v6) for physical load and low superiority for tactical individual actions.

**S24 — Numerical superiority/inferiority, systematic review (2026) · AO**
- Front Sports Act Living. [Frontiers](https://www.frontiersin.org/journals/sports-and-active-living/articles/10.3389/fspor.2026.1813770/full).
- Superiority "consistently reduces" HR and high-intensity load while raising passes and actions.

**S25 — Torrents et al. (2016) · AO**
- PLOS ONE. [PLOS](https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0168866).
- 22 professional and 22 amateur males. **4v3, 4v5 and 4v7** (attacking four fixed).
- More opponents meant **more ball controls**. The number of teammates strongly affected **exploratory behaviour**, regardless of level.

**S26 — Canton, Torrents, Ric, Gonçalves, Sampaio & Hristovski (2019) · AO**
- *Effects of temporary numerical imbalances on collective exploratory behavior.* Front Psychol. [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC6718725).
- U15 and U23. GK+4v4+GK balanced vs **temporary imbalance, with teammates and opponents changing every minute**. 6 × 5-min games.
- U23: long-term exploratory breadth increased. U15: likely increase. Short-term effects unclear.
- **This is the closest study to "fading/temporary overload" found. It rotates overloads by the minute. It does not use recovering defenders.**

**S27 — Sampaio, Lago, Gonçalves, Maçãs & Leite (2014) · AO**
- JSAMS 17:229–233. [ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S1440244013000923).
- 24 players. 5-a-side, 7 × 5 min. Pace, score status (winning/losing) and superiority/inferiority manipulated.
- All three "significantly influenced emergent behavioural dynamics".

**S28 — Praça, Moreira, Rochael, Barbosa & Travassos (2022) · AO**
- IJSSC. [DOI](https://doi.org/10.1177/17479541211017448).
- 48 players (U13, U14). 3v3 vs 1 floater (plays for both teams) vs 2 floaters (one per team, alternating).
- The 2-floater version reduced team length. Both floater versions increased width. The 1-floater version had the lowest stretch index.

**S29 — Inside floater (2020) · AO**
- [ResearchGate](https://www.researchgate.net/publication/339003554_Effect_of_an_Inside_Floater_on_Soccer_Players_Tactical_Behaviour_in_Small_Sided_and_Conditioned_Games).
- An inside floater gave **lower "penetration"** principle scores and **higher "defensive unity"** scores.

**S30 — Pizarro, Práxedes, Travassos, Gonçalves & Moreno (2021), futsal · MO**
- Percept Mot Skills 128(4). [DOI](https://doi.org/10.1177/00315125211016350).
- 30 U19 players. 3v3 with no floaters, end-line floaters, lateral floaters on own-half sideline, or lateral floaters on full sideline. The outcome was the **informational basis of passing, dribbling and shooting decisions**.
- **Results not visible.** Retrieval target.

**S31 — Floater number and position in futsal (2021) · MO**
- IJERPH. [PMC](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8304258/).
- Results not verified beyond the title.

### Rule conditions

**S32 — Rumpf, Jäger, Altmann & Lochmann (2025), systematic review · AO**
- *Touch restriction during SSGs.* Front Sports Act Living. [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC12558969/).
- 1- and 2-touch rules increased passes, **both successful and unsuccessful**, and increased intensity and RPE in adults.
- Tactical evidence was **very scarce and inconsistent**.

**S33 — Dellal et al. (2011) · AO**
- EJSS 11(5). [Wiley](https://onlinelibrary.wiley.com/doi/10.1080/17461391.2010.521584).
- 2v2, 3v3 and 4v4 **possession** games with 4 perimeter support players, each played 1-touch, 2-touch or free.
- **1-touch gave a lower % of successful passes and fewer duels.**

**S34 — Ric, Torrents, Gonçalves, Torres-Ronda, Sampaio & Hristovski (2017) · AO**
- *Dynamics of tactical behaviour when manipulating players' space of interaction.* PLOS ONE. [PLOS](https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0180773).
- 19 professional males, 10 vs 9.
- Three conditions: players locked to zones (ball carrier exempt); allowed into the adjacent zone; free.
- Zone restriction **reduced long-term exploration and increased short-term exploration**. Relaxing it **increased ball-flow speed**. Adjacent-zone freedom increased full-back involvement in build-up.

**S35 — Rumpf et al. (2026), review of man-marking, pressure on the ball and offside · AO**
- Front Sports Act Living. [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC12894284/).
- **Man-marking:** higher HR, RPE, TD, HSR and sprinting.
- **Pressure on the ball:** higher intensity and **more ball recoveries**, but **lower decision-making, lower execution and a lower spatial exploration index**.
- **Offside:** changed depth positioning and length:width ratio, reduced TD, and did not change physiological load.

**S36 — Time pressure × numerical unbalance (2024/25) · AO**
- IJPAS 25(2). [T&F](https://www.tandfonline.com/doi/full/10.1080/24748668.2024.2408975).
- 40 U17 players. Time pressure and superiority changed in-phase coordination on specific axes. Entropy was higher in the no-pressure, equal-numbers condition.
- Coordination measures only.

**S37 — Rochael & Praça (2024) · MO**
- *Designing SSGs for counter-attack training in youth soccer.* IJSSC. [DOI](https://journals.sagepub.com/doi/10.1177/17479541231170830).
- 40 U17 players. GK+4v4+GK vs GK+5v4+GK, each with and without time pressure (a limit on attack duration).
- **Tactical results not visible.**

**S38 — Rochael & Praça (2025) · AO**
- External load in counter-attack drills. [DOI](https://journals.sagepub.com/doi/abs/10.1177/17543371231168173).
- Time pressure **did not change** distances or accelerations. **Balanced numbers gave greater physical responses** than superiority.

**S39 — Asian-Clemente et al. (2023) · AO**
- *Different pitch configurations constrain loads during transition games.* Biol Sport. [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC10588570/).
- 18 young professionals (16.1 y). **3v2 transition game** on 40×30, 40×50 and 40×70 m. APP calc. 240 / 400 / 560 m². Length fixed, width varied.
- A larger pitch gave more distance, HSR, sprinting and RPE. The smallest pitch gave more accelerations.
- Physical only. **No tactical data on transition behaviour.**

### Duration, framing and coach behaviour

**S40 — Fanchini et al. (2011) · AO**
- JSCR. [IRIS PDF record](https://iris.univr.it/retrieve/afcbc5e2-be60-4f1f-aa73-6de0e9331bb4/Fanchini_EFFECT%20OF%20BOUT%20DURATION%20ON%20EXERCISE%20INTENSITY%20AND%20TECHNICAL%20PERFORMANCE%20OF%20SMALL-SIDED%20GAMES%20IIN%20SOCCER_JSCR2010.pdf).
- 19 adults. 3v3 bouts of 2, 4 and 6 min.
- **Duration did not change technical actions or proficiency.** HR was lower at 6 min than at 4 min.

**S41 — Bout duration × sex, enjoyment (2024) · AO**
- BMC SSMR. [Springer](https://link.springer.com/article/10.1186/s13102-023-00794-1).
- 16 female and 16 male players (≈20 y). 4v4 as continuous, medium-intermittent or short-intermittent bouts.
- **Enjoyment differed by sex × bout structure.** The authors recommend intermittent bouts for females and continuous bouts for males.

**S42 — Knowledge of task duration (2020) · AO**
- IJERPH 17:3843. [MDPI](https://www.mdpi.com/1660-4601/17/11/3843).
- 20 professionals. Duration unknown, partially known, or known.
- Unknown and short durations gave more aggressive early pacing. Known duration gave **greater spread and more positional behaviour**, with a lower pace.

**S43 — Instruction × game design (2024) · AO**
- RQES. [T&F](https://www.tandfonline.com/doi/full/10.1080/02701367.2024.2368597).
- 20 males aged 12–15, over 4 weeks. Free play, goal exaggeration, prescriptive instruction, or instruction combined with exaggeration.
- **Most dribbling in free play and goal exaggeration.** **Most goals with goal exaggeration and the combination.** **Best-connected passing networks with instruction**, especially the combination.

**S44 — Implicit vs explicit instructions, U20 (2024) · AO**
- Front Sports Act Living. [PMC](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11438476/).
- 32 U20 players. 4v4. Explicit high-press rule vs implicit rule vs both vs free.
- Explicit gave higher spatial exploration, length, width and in-phase coordination. **Combining both rules hindered performance.**

**S45 — Scanning in SSGs vs full-sized games (IJPEFS) · AO**
- [IJPEFS](https://www.ijpefs.org/index.php/ijpefs/article/view/618).
- 60 U12 academy players. 7v7, 9v9 and 11v11.
- **Scanning frequency rose as format and pitch shrank.** The authors say SSGs "may not replicate" match scanning situations.
- **This is the only located study with a direct perceptual (scanning) measure across formats.**

### Learning / longitudinal (soccer)

**S46 — Práxedes, Del Villar, Pizarro & Moreno (2018) · AO**
- PLOS ONE 13(1):e0190157. [PLOS](https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0190157).
- 19 U12 players, average vs low skill. Intervention 1 used modified games with **numerical superiority in attack**. Intervention 2 used **numerical equality**.
- The average-skill group improved pass decision-making and execution **after the superiority phase only**.
- Order is confounded: superiority always came first.

**S47 — NLP intervention (PESP 2019) · AO**
- [SHURA](https://shura.shu.ac.uk/24107/).
- 19 U12 players, 14 sessions. SSCGs with a retention phase. GPET coding of 3,208 passes.
- **Pass decision-making and execution improved and were retained.**
- **No control group** visible.

**S48 — Clemente et al. (2021), SSG interventions meta-analysis · AO**
- Front Psychol. [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC8138063/).
- Beneficial effect on **technical execution**: ES 0.68 with >17 sessions, 0.44 with <17.
- **Tactical outcomes too scarce to pool.**

**S49 — Linear vs nonlinear pedagogy, systematic review (2025) · AO**
- Sports Med Open. [Springer](https://link.springer.com/article/10.1186/s40798-025-00893-y).
- 9 studies. NLP favoured in 34% of technical outcomes (mostly no difference) and **66% of tactical outcomes** (4 studies).
- The representativeness of the assessment instruments is questioned.

**S50 — Serra-Olivares et al. (2015) · AO**
- J Hum Kinet 46. [PMC](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC4519216/).
- 21 U10 players. 3v3 modified by *representation* vs by *exaggeration* of penetration.
- **No differences** in decision units or execution.

**S51 — Enjoyment of SSGs, narrative review (2025) · AO**
- Hum Mov. [Link](https://hummov.awf.wroc.pl/The-enjoyment-of-small-sided-games-a-narrative-review,197230,0,2.html).
- SSGs are more enjoyable than analytical drills. **Verbal encouragement raises enjoyment.** The evidence is scarce and heterogeneous.

---

## C. Basketball

**B1 — Klusemann, Pyne, Foster & Drinkwater (2012) · AO**
- J Sports Sci 30(14):1463–1471. [DOI](https://doi.org/10.1080/02640414.2012.712714).
- 16 elite juniors (15–19 y, male and female). 2v2 vs 4v4 × half vs full court × 4×2.5 vs 2×5 min.
- Format changed load and technical involvement. Exact technical results were not verified.

**B2 — Li et al. (2025), meta-analysis · AO**
- Biol Sport. [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC12244406/).
- 1v1 to 5v5. Extreme formats (1v1, 2v2) gave higher mean and peak HR than 3v3 or 4v4.

**B3 — Figueiredo de Souza et al. (2024), systematic review of tactical/technical outcomes · SS/AO**
- Retos. [Link](https://revistaretos.org/index.php/retos/article/view/104564).
- Reported pattern: **2v2 gave about 60% more technical actions than 4v4**, plus more assists, rebounds and passes than 4v4 or 5v5. 3v3 half court gave more offensive volume than 5v5 full court.
- These are **the review's summaries of original studies, not traced to the originals**.

**B4 — de Souza, Clemente et al. (2024/25), novices · AO**
- J Hum Kinet. [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC12127940/).
- 16 novice males aged 11–15. Nine formats on full and half court, including overload formats.
- Pass efficacy was higher in 5v4 and 4v3 full court. **Dribble, reception and rebound efficacy were higher in 2v1 half court.** Shot efficacy was higher in 3v3 full court.
- Efficacy is a **quality** measure; this is rare in the set.

**B5 — Bredt et al. (2020) · AO**
- Biol Sport. [Termedia](https://www.termedia.pl/Physical-and-physiological-demands-of-basketball-small-sided-games-the-influence-of-defensive-and-time-pressures,78,39890,0,1.html).
- 12 U17 males. 3v3 half court; 3v3 with full-court defence; 3v3 with **reduced shot clock**.
- Defensive and time pressure increased physical demand. Full-court defence gave **more fakes**. The reduced shot clock gave **more jumps**. HR did not differ (~90% HRmax in all).

**B6 — Bredt et al. (2022) · AO**
- IJSSC 17(5):1079–1088. [DOI](https://journals.sagepub.com/doi/10.1177/17479541211053638).
- 3v3 on full and half court vs formats with **additional players**.
- Additional players and half-court areas **enhanced group tactical-technical behaviour** and **reduced physical and physiological load**. A 4v3 with the extra player allowed to score gave **more space creation without the ball**.

**B7 — Bredt et al. (2023) · AO**
- IJSSC 18(5):1501–1512. [DOI](https://journals.sagepub.com/doi/abs/10.1177/17479541221112076).
- 51 U14–U15 males. Half-court 3v3 in four versions: regular; defensive pressure; close-shot rule; 4v3.
- **4v3 gave greater offensive performance** and more passing than 3v3 with defensive pressure.

**B8 — Offensive-reward rules (2024) · AO**
- PLOS ONE. [PLOS](https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0313656).
- 18 youth males (13.3 y). 3x3: regular vs **point-possession** (scorers keep the ball) vs **passes-based scoring**.
- Point-possession gave more distance, pace and accelerations/decelerations, and **higher enjoyment**. Passes-based scoring gave the highest RPE.
- **No technical or tactical outcomes visible.**

**B9 — Dribbling restrictions (Frontiers in Physiology 2025) · AO**
- [Frontiers](https://www.frontiersin.org/journals/physiology/articles/10.3389/fphys.2025.1550580/full).
- Limiting dribbling in 3v3 gave **more passes and more turnovers** and more time at higher intensity. This study was a longitudinal fitness intervention; the behavioural statements are acute summaries.

**B10 — Conte et al. (2015), no-dribble game · MO**
- JSCR 29(12). [ResearchGate](https://www.researchgate.net/publication/276279079_Physiological_and_Technical_Demands_of_No_Dribble_Game_Drill_in_Young_Basketball_Players).
- Results are known only via secondary summaries.

**B11 — Conte et al. (2016) · MO**
- J Sports Sci 34(8):780–786. 2v2 vs 4v4 × regimes.
- Results not visible.

**B12 — Defensive style × court size (2025) · AO**
- J Hum Kinet. [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC12121894/).
- 10 semi-professional males. 5v5 half vs full court × man-to-man vs 2–3 zone.
- Full court gave more physical load. Defensive style affected only distance and low-intensity accelerations. **Neither variable changed RPE or technical demands.**

**B13 — Sansone et al. (2020) · AO**
- Biol Sport. [Termedia](https://www.termedia.pl/Technical-tactical-profile-perceived-exertion-mental-demands-and-enjoyment-of-different-tactical-tasks-and-training-regimes-in-basketball-small-sided-games,78,38663,0,1.html).
- 12 semi-professional males. Half-court 3v3 × offensive vs defensive task × long vs short intermittent.
- **Short-intermittent regimes gave more possessions, dribbles and shots.** The offensive task gave **higher mental effort**. **Enjoyment did not differ.**

**B14 — Coach verbal encouragement, adolescents (2024) · AO**
- [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC11133689/). Related 2025 study: [PMC](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC11893984/).
- Encouragement gave higher HR, RPE and **enjoyment**, and **more successful passes and shots**, alongside more fatigue.
- Which of these results belongs to which of the two studies is not separated in the summaries.

**B15 — Sánchez-Sánchez et al. (2018), young females · AO**
- RICYDE. [Redalyc](https://www.redalyc.org/journal/710/71055516006/html/).
- 3v3 with or without coach encouragement and with or without dribbling. Encouragement raised HR and RPE. The authors suggest no-dribble games for collective behaviour.

**B16 — Gorman & Maloney (2016) · AO**
- PSE. [ScienceDirect](https://www.sciencedirect.com/science/article/abs/pii/S1469029216300942).
- Unopposed vs defended jump shots. A defender gave **faster ball release and longer jump time**. Defender features (hand up, closeout intensity) had non-significant importance for outcome.
- Replicated and extended in 2025 ([PSE](https://www.sciencedirect.com/science/article/pii/S1469029225000275)).

**B17 — Baskets vs possession SSGs, RCT (JSSM 2024) · AO**
- [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC11366856/).
- Longitudinal. Basket games improved neuromuscular force parameters more than possession games.
- **Physical outcome only.**

---

## D. Field hockey

**H1 — Timmerman, Farrow & Savelsbergh (2017) · AO**
- IJSSC. [ResearchGate](https://www.researchgate.net/publication/319214746_The_effect_of_manipulating_task_constraints_on_game_performance_in_youth_field_hockey); [HvA](https://research.hva.nl/en/publications/the-effect-of-manipulating-task-constraints-and-player-numbers-in/).
- 25 players aged 10.6–14.6. **Fully crossed:** 11 vs 8 per side × APP of 228 vs 158 m². 4 × 25-min games.
- **Fewer players:** +2.68 successful passes, +3.73 skilled actions and +3.77 successful actions per player. Authors: a "more advantageous environment to enhance decision making".
- **Higher density:** −0.59 unsuccessful dribbles, +38 m high-intensity running, +21.2 m sprinting.
- **De-confounded design.**

**H2 — Timmerman, Savelsbergh & Farrow (2019) · AO**
- RQES 90(2). [ERIC](https://eric.ed.gov/?id=EJ1216413).
- 13 U14 players. 3 vs 6 per side × normal, cage, possession and two-goals games. 2 × 7.5 min.
- **Fewer players:** more technical actions per player and higher physical demand.
- **Possession game:** +4.82 passes, −1.48 dribbles, −0.69 tackles.
- **Two goals:** +0.61 goals.
- **Cage:** +1.46 passes, +7.32 m/min.

**H3 — Duthie, Thomas, Bahnisch, Thornton & Ball (2022) · AO**
- JSCR 36(2):498–502. [PubMed record](https://pubmed.ncbi.nlm.nih.gov/31800473).
- 10 elite males. 2v2 on 30×20, 3v3 on 35×25, 4v4 on 40×30. **APP held at ~150 m².** 5-min SSGs.
- **Non-substantial differences** in speed and acceleration between formats. SSG peaks stayed below competition.

**H4 — Elite female small vs large SSGs (JSCR 2024) · AO**
- [JSCR](https://journals.lww.com/nsca-jscr/fulltext/2024/02000/different_aspects_of_physical_load_in_small_sided.28.aspx).
- 16 elite females. 5v5 at ~100 m² per player vs 9v9 at ~200 m².
- The large game gave more distance at all speeds except sprinting. The small game gave more acceleration/deceleration and **more time in demanding stick-to-ground postures**, which the authors attribute to more ball involvement.
- **Confound:** number and APP changed together.

**H5 — Slade (2015) · AO**
- IJSSC 10:655–668. [ResearchGate](https://www.researchgate.net/publication/283165291_Do_the_Structures_Used_by_International_Hockey_Coaches_for_Practising_Field-Goal_Shooting_Reflect_Game_Centred_Learning_within_a_Representative_Learning_Design).
- Six of seven international coaches at the 2011 Champions Trophy practised field-goal shooting in small-sided, game-centred, representative formats.
- **Descriptive only.** It shows elite convention, not an effect.

**H6 — U12 SSG vs traditional training (2023) · AO**
- [PPCS](https://sportpedagogy.org.ua/index.php/ppcs/article/view/1930).
- 36 boys under 12. 3v3 SSG vs 4v4 SSG vs traditional training, over 8 weeks.
- SSGs improved **fitness** more. **Skill tests showed no difference.**

---

## E. Cross-sport and analogue sources (not used as Gaelic evidence)

| ID | Source | Access | Key content |
|---|---|---|---|
| X1 | Manninen et al. (2025), EPER, GBA meta-analysis — [SAGE](https://journals.sagepub.com/doi/10.1177/1356336X241245305) | AO | Positive, heterogeneous effect on in-game decision-making (ES 11.41%). Motor skill g = 0.36. |
| X2 | *Effects of Teaching Games…* (2020), IJERPH — [PMC](https://pmc.ncbi.nlm.nih.gov/articles/PMC7013807/) | AO | Decision-making ES 0.89. Skill execution not significant. **GRADE low.** |
| X3 | Ometto et al. (2018), IJSSC — [SAGE](https://journals.sagepub.com/doi/10.1177/1747954118769183) | AO | Catalogues manipulated constraints and tactical outcomes in soccer SSCGs. |
| X4 | Browne et al. (2020), PLOS ONE, Australian football — [PLOS](https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0242336) | AO | Match simulations were more representative than SSGs for pressure × time in possession. Disposals were more effective in SSGs. |
| X5 | *Match simulation may not represent competitive match play* (2022), J Sports Sci, Australian football — [T&F](https://www.tandfonline.com/doi/abs/10.1080/02640414.2021.1995245) | AO | Simulations had more goals, fewer passes, turnovers and tackles, and more centralised passing networks. |
| X6 | Team numerical advantage (2021), PLOS ONE, Australian football matches — [PLOS](https://journals.plos.org/plosone/article?id=10.1371%2Fjournal.pone.0254591) | AO | Numerical advantage entering the forward 50 raised scoring odds (OR 1.93). Crowding lowered them. **Match data, not training.** |
| X7 | Kinnerk et al. (2018), *Quest* — [T&F](https://www.tandfonline.com/doi/abs/10.1080/00336297.2018.1439390) | AO | GBAs mainly support cognitive and affective outcomes. Coaches struggle with design. |
| X8 | *Game is the teacher?* (2026), PESP — [T&F](https://www.tandfonline.com/doi/full/10.1080/17408989.2026.2657291) | AO | GBA is often misunderstood as "set up an SSG and step back". |

---

## F. Governing-body and coaching guidance (never used as experimental evidence)

These sources are grade D wherever they appear.

- GAA Learning — [Games Based Approach](https://learning.gaa.ie/GamesBasedApproach), [Why small sided games work](https://learning.gaa.ie/node/269023), [Go Games](https://learning.gaa.ie/GoGames).
- US Soccer — [Play-Practice-Play](https://www.ussoccer.com/stories/2018/02/five-things-to-know-about-playpracticeplay).
- FA — [England DNA](https://www.thefa.com/bootroom/resources/coaching/how-to-use-the-england-dna-in-your-coaching-session).
- USA Basketball — [Player Development](https://www.usab.com/news/2025/10/usa-basketball-coaching-guidebook-player-development-curriculum).
- KNHB — [youth game forms](https://www.knhb.nl/kenniscentrum/artikel/hockey-for-dummies/).
- Practitioner end-zone and transition game descriptions (for example [Soccer Coach Weekly](https://www.soccercoachweekly.net/drills-and-games/small-sided-games/the-end-zone-game)). These are *existence proofs* of convention only.
