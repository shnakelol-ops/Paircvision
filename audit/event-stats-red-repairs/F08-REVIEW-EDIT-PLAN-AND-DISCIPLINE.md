# F-08 Review Edit — minimal correction plan, and Discipline rules findings

Read-only plan. No production code has been changed.

## Part 1 — F-08 Review Edit

### What happens today (main `a8fe232`)

- `saveProEdit` replaces `kind` and `type` with any of the 23 `MATCH_EVENT_KINDS` and resolves the player from the number entered.
- It keeps `teamSide`, `tags`, `restartOwner` and `squadId` unchanged.
- The Type `<select>` lists all 23 kinds in every sport, including:
  - `FREE_SCORED`, `FREE_MISSED`, `POSSESSION_WON` and `POSSESSION_LOST`, which Event Stats never captures;
  - `TWO_POINTER` and `FORTY_FIVE_TWO_POINT` in hurling and camogie;
  - `SIN_BIN` where the sport has no sin bin in capture.
- Evidence from the 636-event run (match B): a `SHOT` edited to `POINT` kept the tag `BLOCK/SAVE`, so the score's source reads as unknown.
- Because the team cannot be edited, a cross-family change keeps a `teamSide` that may mean the owner or the conceding side. For example, `TURNOVER_LOST` (stored `teamSide` FOR) changed to `POINT` silently credits our team.

### Principle

Keep the existing interface: the Type select, the Player # and Player name fields, and Save / Cancel. Add no team, ownership or source controls. **Offer only changes that are fully determined by the information already stored.** Anything else is rejected with a one-line reason in the existing edit sheet.

### Allowed changes ("edit groups")

A change is offered only within the event's own group. The `teamSide` meaning stays identical inside a group, which is why each change is safe.

| Group | Kinds (offered only if valid for the sport) | `teamSide` meaning | Tag handling | Player rule |
|---|---|---|---|---|
| Attempts | GOAL, POINT, WIDE, SHOT, TWO_POINTER\*, FORTY_FIVE_TWO_POINT\* | the shooting team | Keep source tags valid for the new kind (PLAY, FREE, PENALTY, MARK, 45 or 65). Drop tags that are invalid for it (e.g. SHOT outcome tags SHORT, BLOCK/SAVE, POST on a score). TWO_POINTER with tag 45 is stored as FORTY_FIVE_TWO_POINT, and the reverse. | Unchanged (same team) |
| Kickout / Puckout | KICKOUT_WON ↔ KICKOUT_CONCEDED | the restart owner | Keep CLEAN, BREAK, FOUL. Keep `restartOwner`. | Flipping won/lost changes which team won the ball. **Reject if a player is still attached** whose squad (`squadId`) is not the new winner's. The coach can clear Player # and name in the same edit and save. |
| Turnover | TURNOVER_WON ↔ TURNOVER_LOST | always FOR | Keep. The tags read correctly on both rows (e.g. HP ERROR). | Unchanged (always our player) |
| Free | FREE_WON ↔ FREE_CONCEDED | always FOR | Rewrite the tag to match the kind: WON or CONCEDED. | Unchanged (our player) |
| Discipline | YELLOW_CARD, SIN_BIN†, RED_CARD | the sanctioned team | Rewrite the tag to match the kind: YELLOW, SIN BIN or RED. | Unchanged (same player) |
| 45/65, Sideline | none: only player edits | the winner | — | — |

\* Gaelic and ladies football only.
† Only where `getDisciplineOptions(sport)` includes SIN_BIN.

**Not offered (rejected):**
- Any change across groups, e.g. turnover → score, kickout → point, card → anything. That would require choosing a team, owner or source the record does not hold.
- Any kind Event Stats never captures (FREE_SCORED, FREE_MISSED, POSSESSION_WON, POSSESSION_LOST).
- Any kind invalid for the match's sport.
- For 45/65 and Sideline, outcome flips. Capture only ever stores the `*_WON` form with `teamSide` = winner, so changing the winner would require changing the team.

**Legacy or imported events** whose kind is outside every group: the select shows only the current kind, so player edits remain possible.

**SHOT ↔ score is a decision point.** With this plan, a "shot that was really a point" becomes a POINT with **no source tag**, which shows as source unknown. That is honest, and nothing is invented. The alternative is to reject SHOT ↔ score entirely. Recommendation: allow it, because coaches need this correction and no attribution is fabricated.

### Implementation shape (for the R2 PR, after approval)

1. A new pure module, `src/pro-tagger/pro-tagger-review-edit.ts`, with:
   - `editableKindsFor(event, sport): MatchEventKind[]`, which feeds the existing `<select>` (a shorter list; no new control);
   - `applyReviewEdit(match, event, { kind, playerNumber, playerName }, sport): { ok: true; event } | { ok: false; reason }`.
2. `ProTaggerReviewScreen.saveProEdit` calls `applyReviewEdit`.
   - On `ok:false`, it shows `reason` in the existing edit sheet and keeps it open, with nothing saved.
   - Player id resolution keeps the existing `resolveRosterPlayerId` (squadId first).
3. No schema change. Stored events keep every existing field, and no historical event is rewritten unless the coach saves an edit.

### Regression tests

| ID | Test |
|---|---|
| E1 | Per sport, `editableKindsFor` returns exactly the group above. Hurling has no TWO_POINTER or FORTY_FIVE_TWO_POINT. Camogie and hurling have no SIN_BIN while capture omits it. The never-captured kinds appear nowhere. |
| E2 | SHOT(BLOCK/SAVE) → POINT stores POINT with no BLOCK/SAVE tag and the same `teamSide`. Its score source is "unknown". Blocked/saved counts drop by 1. |
| E3 | POINT(PLAY) → WIDE keeps PLAY. POINT(45) → TWO_POINTER stores FORTY_FIVE_TWO_POINT. |
| E4 | KICKOUT_WON (player from the owner's squad) → KICKOUT_CONCEDED is rejected while the player is attached. It succeeds when the player is cleared, keeping `restartOwner`, `teamSide` and the tags. |
| E5 | TURNOVER_WON ↔ LOST and FREE_WON ↔ CONCEDED round-trip, with the free tag rewritten. |
| E6 | YELLOW → RED rewrites the tag. The discipline status map shows RED for that player. |
| E7 | A cross-group change (e.g. TURNOVER_LOST → POINT) is never offered, and `applyReviewEdit` rejects it if called. The stored match is unchanged. |
| E8 | Existing `ProTaggerReviewScreen.playerCorrection` tests and the 636-event Review Edit e2e (match B, 4 edits) pass with identical stored output for the 4 allowed edits. |

## Part 2 — Discipline rules (official sources)

The official rule PDFs could not be downloaded from this environment, because the network policy blocks the governing bodies' hosts. The findings below come from official-site search excerpts, and the owner should confirm them against the full current Official Guides before any change.

| Code | Sanctions in the official rules | App today (`getDisciplineOptions`) | Finding |
|---|---|---|---|
| **Gaelic football (GAA)** | Yellow (caution); **Black card = Sin Bin, 10 minutes**, for Cynical Behaviour infractions, running across normal and extra time; Red. 2026 changes (effective 1 Jan 2026) add black-card fouls. Under-18 dissent is a black card and sin bin. | Yellow, Sin Bin, Red | **Matches.** "Sin Bin" is the black card. |
| **Hurling (GAA)** | Yellow, Red, **and Black card + Sin Bin (10 min)** under Playing Rule 5.45: a pull-down or trip denying a goal-scoring chance. A penalty is also awarded. Introduced 2021, first scoped to inter-county senior, U20 and minor. A further U18-and-younger **dissent** sin bin is listed as effective 28 March 2026. | Yellow, Red only | **Gap (likely).** A referee in hurling can issue a sin bin that the app cannot record. A second caution or red-card offence still means dismissal. |
| **Camogie (Camogie Association)** | Yellow (warning), second yellow then Red, straight Red. **No sin bin or black card found** in the Official Playing Rules 2024–2027. | Yellow, Red | **Matches.** |
| *Ladies football (LGFA), for information* | The sin bin **follows a yellow card** (10 min; shorter in shorter games; U14 and up). A second caution means Red. No black card. | Yellow, Sin Bin, Red (600 s) | Owner check: in LGFA a Yellow *is* the sin bin, so "Yellow" alone does not mark the player as sin-binned in the picker. Sin-bin length depends on game length. |

**Recommendation (no change until confirmed):**
- If the owner confirms Rule 5.45 and the U18 dissent rule, offer **Sin Bin for hurling**. That is a one-line change in `getDisciplineOptions`, with tests.
- Keep camogie as Yellow and Red.
- Treat the LGFA yellow-equals-sin-bin interpretation as a separate owner decision.
- Out of scope for any change: the app records the sanction the referee gave and does not adjudicate (`pro-tagger-discipline.ts` header).

### Sources

- GAA Official Guide Part 2 (gaa.ie): https://www.gaa.ie/api/images/image/upload/prd/est44tcdvv2ydzmojtjs.pdf
- GAA Official Guide Part 2, 2026, via US GAA: https://usgaa.org/wp-content/uploads/2026/04/Official-Guide-Part-2-03-27-2026.pdf
- GAA, "New hurling dissent rules explained": https://www.gaa.ie/article/new-hurling-dissent-rules-explained
- GAA, "No black card for hurling" (2020 motion defeated; Rule 5.45 followed in 2021): https://www.gaa.ie/hurling/news/no-black-card-for-hurling
- GAA Official Guide Part 2 (Rule 5.45 text): https://www.gaa.ie/api/pdfs/image/upload/ltu1qndvu0gwvke5qbmc.pdf
- Camogie Association, Official Playing Rules 2024–2027: https://camogie.ie/wp-content/uploads/2024/09/Part-2-Official-Rules-30-09-24-A4-web.pdf
- LGFA Playing Rules 2026: https://ladiesgaelic.ie/wp-content/uploads/2018/03/Playing-Rules-2026.pdf
