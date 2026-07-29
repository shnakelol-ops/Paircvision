# Shareable Report Cards — Audit Only

**Status:** Audit only. No production code, PDF behaviour, or page content was
changed to produce this document. No PR opened.

**Scope:** Determine whether exactly five existing report pages — **Match
Summary**, **Where the Points Went**, **Turnover & Territory**, **Restart
Battle**, **Shot Pitch Maps** — can be exposed as individually shareable PNG
cards through a strict allowlist, while every other report page (named-player
analysis, chain detail, tactical summaries) stays private inside the full PDF.

---

## 1. Executive summary

All five named pages exist today, live inside `src/stats/reviewPdfExport.ts`,
and are built by five distinct canvas-drawing functions — but **they are not
scattered evenly across one PDF variant**. This is the audit's central
finding, and it changes the shape of the recommended API:

| Card | Full Review PDF | HT Snapshot PDF | FT Snapshot PDF |
|---|---|---|---|
| Match Summary | ✅ p.1 | — | — |
| Where the Points Went | ✅ p.2 ("FULL") | ✅ p.7, but titled **"The Ledger So Far"** ("HT" variant) | ✅ p.1 ("FULL") |
| Turnover & Territory | — (Full Review has a *different* page, "Turnover Analysis") | ✅ p.4 | ✅ p.7 |
| Restart Battle | — (Full Review has a *different* page, "Restart Analysis") | ✅ p.3 (1st half only) | ✅ **two** pages, p.4 + p.5 (1st half, 2nd half) |
| Shot Pitch Maps | ✅ p.8+N | — | — |

No page currently produces an independent PNG/Blob — every one of the five is
an `HTMLCanvasElement` fed straight into `jsPDF.addImage()` via
`canvas.toDataURL("image/jpeg", 0.88)`. **Option A (reuse an existing
intermediate image) does not apply to any of the five cards.** All five are
**Option B** candidates: call the existing, unmodified canvas-builder
function, then add a new `canvas.toBlob("image/png")` step outside the PDF
pipeline. This requires adding the `export` keyword to four currently-private
functions (zero logic change) — nothing else about them needs to change.

One genuine privacy finding surfaced during this audit, not assumed:
**"Where the Points Went," in its half-time ("HT") variant only, renders a
named player's top-influence evidence line** (`src/stats/reviewPdfExport.ts:12409-12439`,
via `influenceEvidenceLine()` in `src/stats/players/influence.ts:427-441`,
which returns a string starting with the player's real name whenever the
coach has entered one). This is not present in the "FULL" variant used at
full-time. See §6.

**Verdict: GO**, with the HT-variant player-name issue named and mitigated
before shipping (§6), and with the API shaped around per-card input
requirements rather than a single flat `{cardId, report}` signature (§5).

---

## 2. Current report render architecture

### 2.1 Two export entry points, one shared page-builder library

- `exportReviewPdf(input: ReviewPdfExportInput): Promise<void>` — "Full
  Review PDF." 24+N pages (N = player-page count). `reviewPdfExport.ts:7254`.
- `exportSnapshotPdf(input: SnapshotPdfExportInput): Promise<void>` —
  the HT/FT "Snapshot PDF" (this is what the brief calls the "Analyst
  Review" — the file's own comment at `reviewPdfExport.ts:7133` refers to
  "the Analyst Review" using this same terminology). 7 pages at half-time,
  13 at full-time. `reviewPdfExport.ts:12490`. `SnapshotPdfExportInput`
  extends `ReviewPdfExportInput` and adds `snapshotMode`.
- Both call the **same page-builder functions** — nothing is duplicated
  between them. Both compute one canonical `MatchReport` via
  `buildMatchReport({ events, homeTeam, awayTeam, scope })` once per export
  and thread it into every builder that needs it (`reviewPdfExport.ts:7305`,
  `:12516`).
- Every page builder returns a plain `HTMLCanvasElement` at a fixed
  **1920×1080** (`CANVAS_W`/`CANVAS_H`, `reviewPdfExport.ts:195-196`) —
  16:9 landscape. Both PDF assemblers convert that canvas to a JPEG data URL
  at quality 0.88 and place it into an A4-landscape (297mm×210mm) PDF page
  via `pdf.addImage()` (`:7318-7319`, `:12534-12535`). There is no PNG, Blob,
  or File intermediate anywhere in this path today — the canvas goes
  straight from `toDataURL("image/jpeg")` into the PDF.
- No download/share logic exists for individual pages. `pdf.save(filename)`
  is the only output method for both exports (multi-page-document download,
  triggered from a browser "Save PDF" affordance — no `navigator.share`
  integration for the PDF itself).

### 2.2 A pre-existing, unrelated documentation-drift note

The JSDoc comment immediately above `exportReviewPdf` (`:7231-7253`) describes
a **36+N-page layout with different page names** ("Segment Overview,"
"Kickout Chain Analysis," etc.) that does not match the function's actual
current behaviour. The accurate, current page map is the second comment
block a few lines further down, *inside* the function body
(`:7269-7300`, "24 + N"), which the `TOTAL_PAGES` calculation on `:7302`
actually implements. This is stale documentation, unrelated to this audit's
scope — flagged only so nobody designing from the outer comment gets misled.
No fix proposed; it is out of scope (no PDF content changed).

---

## 3. Per-card render-path table

| Card | Builder function | File:line | Called from | Uses canonical `MatchReport`? | Player-name risk |
|---|---|---|---|---|---|
| **Match Summary** | `makeSummaryPage()` | `reviewPdfExport.ts:912` | `exportReviewPdf` only (p.1) | Yes — `drawSummaryStatsTable(ctx, report, ...)` (`:1005`) draws the two-block team stat table straight from `report` | None found — every row in `drawSummaryStatsTable` (`:740-899`) is a team-level aggregate (goals, shots, kickouts, turnovers, frees); no player fields referenced |
| **Where the Points Went** | `makePointsLedgerPage()` | `reviewPdfExport.ts:12257` | `exportReviewPdf` (p.2, `"FULL"`), `exportSnapshotPdf` HT (p.7, `"HT"` → titled **"The Ledger So Far"**) and FT (p.1, `"FULL"`) | Yes — `analysis = report.chain`; "all figures come from `buildScoreLedger()`" per its own docstring (`:12252`) | **Yes, in the `"HT"` variant only.** `:12410-12438` renders a "TOP INFLUENCE SO FAR" tile per team using `buildInfluenceAnalysis()` and `influenceEvidenceLine(top, team)`, which returns `` `${p.displayName}: ...` `` — a real player name when one was entered (`src/stats/players/influence.ts:427-441`, name resolution in `src/stats/player-display.ts:17-26`). The `"FULL"` variant used at full-time does not render this block (`if (isHT) {…}` gate). |
| **Turnover & Territory** | `makeTurnoverTerritoryPage()` | `reviewPdfExport.ts:11781` (**already `export`ed**) | `exportSnapshotPdf` only (HT p.4, FT p.7) — **not present in the Full Review PDF**, which has a differently-built "Turnover Analysis" page instead | Yes — takes `report: MatchReport`, reads `report.chain` | None found — `renderTurnoverTerritoryMarkers()` (`:11753-11779`) draws only won/lost outcome-coloured dots, no player fields |
| **Restart Battle** | `makeRestartBattlePage()` | `reviewPdfExport.ts:11546` | `exportSnapshotPdf` only — HT calls it once (1st half only, since HT has no 2nd-half data); FT calls it **twice**, once per half (p.4, p.5) — **not present in the Full Review PDF**, which has a differently-built "Restart Analysis" page instead | **No** — operates directly on the raw (pre-filtered-by-caller) `events` array; does not receive or use `report` at all | None found — pure team-level retained/lost markers and counts (`:11588-11726`) |
| **Shot Pitch Maps** | `makeQuadPitchMapPage()` with a specific 4-panel shot config | `reviewPdfExport.ts:7136` (generic renderer), called at `:7415-7425` with panels built via `selectPdfEvents(events, half, side, "SHOTS")` | `exportReviewPdf` only (p.8+N) — **not present in either Snapshot PDF** | **No** — takes raw `events` filtered by `selectPdfEvents()`, not `report` | None found — `renderEventMarkers()` (`:700-723`) draws outcome-coloured dots only |

**On "multiple variants of that card"**: two of the five have real variants
that matter for a share feature:
- *Where the Points Went* has a `"HT"` and a `"FULL"` rendering of the same
  function, with a different title and different content (the influence
  tile above). A share card literally titled "Where the Points Went" should
  probably always mean the `"FULL"` layout — see §9 for the recommendation.
- *Restart Battle* is **two separate canvases** at full-time (1st half, 2nd
  half) and **one** at half-time. There is no existing "combined both
  halves into one image" builder — that compositing does not exist today.

**On "is the layout readable as a standalone image"**: yes for all five —
each already renders its own full header (page title, team names, page
number), its own legend/colour key inline (e.g. green circle / red X on
Restart Battle, teal/red/amber zone colouring on Turnover & Territory), and
team names throughout. None of the five relies on surrounding PDF chrome,
a table of contents, or a preceding/following page to be understood.
PáircVision branding is *not* separately stamped on these specific pages
(no watermark/logo drawn by any of the five builders) — only the
page-header text and the app's own visual style. This differs from Phase 1's
Tactical Slate/stats-card exports, which do bake in a small "PáircVision"
watermark; recommend adding the same small corner watermark at the new
Blob-export step (§7), not inside the PDF builder.

**On dimensions**: all five are the same fixed 1920×1080 canvas (16:9). Note
this is *not* the same aspect ratio as the A4-landscape PDF page
(297:210 ≈ 1.414:1 vs 1920:1080 = 1.778:1) — inside the PDF, `addImage()`
stretches the 16:9 canvas to fit the narrower A4 rectangle. **A standalone
PNG exported at the canvas's native 1920×1080 will actually look *more*
correctly proportioned than the same page does embedded in the PDF** — a
positive side effect of this approach, not a regression, since the PDF's own
pixels are untouched either way.

---

## 4. Primary technical question — which option applies

**Option A does not apply to any of the five cards** — none has an existing
PNG/Blob/data-URL intermediate before PDF insertion; all five stop at
`HTMLCanvasElement`.

**Option B applies to all five.** Each builder can be called exactly as it
is today — same arguments, same math, same drawing calls — the only new
step is `canvas.toBlob("image/png")` on the returned canvas, performed
*outside* `reviewPdfExport.ts`'s PDF-assembly code. Four of the five
builders are currently module-private (no `export` keyword):
`makeSummaryPage`, `makePointsLedgerPage`, `makeRestartBattlePage`,
`makeQuadPitchMapPage` (the fifth, `makeTurnoverTerritoryPage`, is already
exported). Making them callable requires adding the `export` keyword only —
no parameter, calculation, or drawing-order change. `selectPdfEvents()` (the
event-selector `makeQuadPitchMapPage`'s Shot-Pitch-Maps config depends on)
is also currently private and needs the same treatment, so the "Shot Pitch
Maps" share card selects the *exact same* four event subsets as the PDF page
— re-deriving that selection independently would risk drift and is
explicitly what this audit recommends against.

**Option C (render the finished PDF page to PNG) is not needed** — since a
clean canvas already exists one step before the PDF, rendering the *assembled
PDF* back down to an image would be strictly worse: slower, lossier (a
second re-encode of an already-JPEG-compressed page), and it would require a
PDF-rendering dependency this app doesn't have. Not recommended.

**Option D (duplicate the page as a new social card) is not needed and not
recommended** — every one of the five already has a reusable, correct
builder function; duplicating any of them would immediately create the
exact "visual and calculation drift" risk the brief warns about, for zero
benefit over Option B.

**Per-card verdict:**

| Card | Option |
|---|---|
| Match Summary | B — add `export` to `makeSummaryPage` |
| Where the Points Went | B — add `export` to `makePointsLedgerPage`; **also** give it one new optional, default-preserving parameter to omit the HT influence tile for the share-card path only (§6) |
| Turnover & Territory | B — already exported, call as-is |
| Restart Battle | B — add `export` to `makeRestartBattlePage`; share-card caller decides 1 vs 2 images (§9) |
| Shot Pitch Maps | B — add `export` to `makeQuadPitchMapPage` and to `selectPdfEvents` |

---

## 5. Recommended architecture

The user's sketch (`{cardId, report}` only) is too narrow once the per-card
table above is taken into account — `makeRestartBattlePage` never receives
`report` at all, and several builders need `homeAttackingDirection`,
`sport`, and (for the Ledger) squad rosters. The refined shape:

```ts
// src/stats/shareableReportCards.ts

export type ShareableReportCardId =
  | "match-summary"
  | "where-points-went"
  | "turnover-territory"
  | "restart-battle"
  | "shot-pitch-maps";

export type RenderShareableReportCardInput = {
  cardId: ShareableReportCardId;
  events: readonly PdfExportEvent[];
  report: MatchReport<PdfExportEvent>;   // same object already built once for the PDF
  homeTeamName: string;
  awayTeamName: string;
  sport?: PitchSport;                     // defaults "gaelic", same as the PDF input
  homeAttackingDirection?: "LEFT" | "RIGHT";
  homeSquadPlayers?: readonly PdfSquadPlayer[];
  awaySquadPlayers?: readonly PdfSquadPlayer[];
  /** Selects the Ledger's "FULL" vs "HT" wording/content and whether Restart
   * Battle renders one half or both. Mirrors SnapshotPdfExportInput's
   * `snapshotMode`, but is not required to equal it — a coach can share a
   * "Match Summary" card at any point regardless of which PDF flavour is
   * currently open. */
  half?: "1H" | "2H" | "BOTH";             // Restart Battle only; ignored by other cards
};

async function renderShareableReportCard(
  input: RenderShareableReportCardInput,
): Promise<Blob>;
```

Internally, `renderShareableReportCard` is a `switch (input.cardId)` that
calls exactly one (or, for `"restart-battle"` with `half: "BOTH"`, two) of
the newly-`export`ed builder functions with the same arguments the PDF
pipeline already passes them, then:

1. Composites a solid background if needed (the builders already fill their
   own background — `fillDarkBg(ctx)` — so this step is likely a no-op,
   unlike Phase 1's Pixi-canvas adapters which needed one).
2. Optionally stamps the same small corner "PáircVision" watermark Phase 1's
   `pixiCanvasPngExport.ts` already established, for parity across every
   share surface in the app.
3. `canvas.toBlob("image/png")` → resolves the `Blob`. No `toDataURL`
   fallback path is invented here — reuse Phase 1's existing
   `exportPixiCanvasToPngBlob`-style `toBlob`/`toDataURL` resilience pattern
   if one is wanted, or the simpler direct `toBlob` Promise wrapper already
   used by `board-png-export.ts`.
4. Never recomputes any statistic — every number on every card comes from
   `report`/`events` exactly as passed in, computed once by the caller
   (mirroring how both PDF exporters already build `report` exactly once
   and thread it through).

**Enforcing the allowlist**: `ShareableReportCardId` is a closed string
union, not a `pageNumber`. There is no code path from an arbitrary string to
a canvas — the `switch` only has five cases, and TypeScript's exhaustiveness
checking (a `never`-typed `default` branch) makes it a compile error to add
a sixth case without updating this one file. No page-number, page-index, or
"nth page" concept exists anywhere in this API's surface.

### Where this lives, and how it connects to the unified Share Button

New file: `src/stats/shareableReportCards.ts`, next to `reviewPdfExport.ts`
(same directory, same import graph, no new module boundary). It becomes a
`capture` adapter for Phase 1's `ShareImageInput.getBlob` — exactly the
pattern Phase 1 established for every other surface
(`docs/unified-share-audit.md` §4, implemented in
`src/features/shared/imageShare.ts`/`ShareSheet.tsx` on the
`claude/unified-share-phase1` branch):

```ts
// caller (a new "Share Match Insights" sheet, see §9)
openShareMenu({ // or ShareSheet's `input` prop
  getBlob: () => renderShareableReportCard({ cardId: "match-summary", ...ctx }),
  filename: `${home}-${away}-match-summary.png`,
  title: `${home} v ${away} · Match Summary`,
});
```

For multi-select ("Share Selected," §9), Phase 1's `imageShare.ts` currently
only has a single-file `shareImageFile(file, meta)` — this audit recommends
one small, additive sibling function `shareImageFiles(files: File[], meta)`
(same shape, `navigator.share({ files, ... })` with more than one file) —
not a redesign of the Phase 1 utility, one function alongside the existing
one.

---

## 6. Privacy boundary

**Confirmed**: all five cards contain only team-level and match-level
information — scores, shot/kickout/turnover counts, zone colouring, pitch
markers — with **one exception found and documented above**:

> **"Where the Points Went," half-time variant only** (`makePointsLedgerPage`
> called with `variant: "HT"`, which renders under the title "The Ledger So
> Far") **includes a real player's name** in a "TOP INFLUENCE SO FAR" tile,
> whenever the coach has entered a name for at least one tagged event
> (`reviewPdfExport.ts:12409-12438`; name resolution confirmed in
> `src/stats/player-display.ts:17-26` — falls back to `#<number>` only when
> no name, or a recognised demo placeholder, was entered).

**Recommendation** (pick one, not both — (a) is preferred):

- **(a) Redact for the share card, keep the PDF untouched.** Give
  `makePointsLedgerPage` one new optional parameter, e.g.
  `includeInfluenceTile: boolean = true`. Every existing call site
  (`exportReviewPdf`, `exportSnapshotPdf`) omits the argument and gets
  **byte-identical output to today** (default `true` preserves current
  behaviour exactly). Only the new share-card path passes `false`. This is
  the smallest possible change that fully closes the leak without touching
  a single existing call site or pixel of PDF output.
- **(b) Exclude, don't redact.** Only allow `"where-points-went"` to be
  requested with `half` implying the `"FULL"` variant (i.e., disallow
  sharing this specific card while a half-time-scoped `report` is active).
  Simpler, zero new parameters, but removes a card the coach might
  reasonably want to share at the break.

Either way, **do not ship the HT variant's player-tile as shareable
as-is** — that would be a real, user-facing privacy regression relative to
the product principle ("Share the story. Keep the intelligence").

**Recommended confirmation notice**, shown once per share action (not a
one-time app-level dismissal, since the risk is per-share, not per-session):

> These images may contain team and match information. Only share content
> you are authorised to distribute.

This should sit in the same `ShareSheet`/"Share Match Insights" UI Phase 1
already established a visual language for (§9), not as a new modal.

---

## 7. Output sizing

- **Dimensions**: keep the existing 1920×1080 (16:9) landscape as-is. The
  brief explicitly rules out a portrait social-media redesign in this
  phase, and 16:9 is already comfortably legible when viewed full-width in
  WhatsApp/Telegram/Instagram DMs (none of those clients require portrait;
  only Instagram *Stories* prefers 9:16, and Stories-specific redesign is
  explicitly out of scope here).
- **Export scale**: no 2× render is necessary. The canvases are already
  built at 1920×1080 physical pixels (not CSS pixels needing a
  device-pixel-ratio multiplier) — this is already a high-resolution
  source, well above what WhatsApp/social re-compression will preserve
  anyway. A 2× (3840×2160) render would roughly quadruple canvas memory and
  PNG encode time for no visible gain once the destination app
  re-compresses the image, which every major share target does.
- **PNG file size**: not measured directly in this audit (no code was run),
  but Phase 1's comparable full-detail Canvas2D card exports
  (`docs/unified-share-audit.md` §2.1, `statsShareCard.ts`, 1080×1640) were
  measured in the wild at roughly 250–350KB per PNG for a similarly
  text/line-dense card. These five cards are larger (1920×1080, ~2× the
  pixel count) and some (Restart Battle, Turnover & Territory) include a
  rendered pitch background with many markers — a reasonable estimate is
  **~400KB–1MB per card**, i.e. **up to ~5MB if all five are generated and
  held in memory at once**. This is the basis for the lazy-generation
  recommendation below.
- **Memory impact / lazy generation**: **yes, generate lazily, one card at a
  time**, not all five up front when "Share Match Insights" opens. Each
  canvas is a full 1920×1080×4-byte RGBA surface (~8.3MB of raw GPU/CPU
  memory) before PNG encoding even starts; holding five canvases plus five
  PNG Blobs simultaneously in a page that a lower-end Android device may
  already have under memory pressure (mid-tagging a live match, per the
  existing app's own architecture) is an avoidable risk for zero benefit —
  the coach previews/selects cards well before any of them needs to exist
  as pixels. Render on selection or on "Share Selected"/"Save Selected"
  tap, not on sheet-open. This mirrors Phase 1's own blob-caching design
  (`createCachedBlobFileResolver` in `imageShare.ts`) — reuse that exact
  pattern per-card rather than inventing a new one.

---

## 8. PDF-regression risk assessment

**Risk: very low, if the recommendation in this document is followed
literally.**

- Zero changes to `buildMatchReport`, `buildScoreLedger`, any chain engine,
  event classification, or report-fact computation — the new code only
  *calls* existing builder functions, it does not touch what they compute.
- Zero changes to page ordering or page content in either
  `exportReviewPdf` or `exportSnapshotPdf` — neither function is edited.
- The only edits to `reviewPdfExport.ts` itself would be: adding the
  `export` keyword to five names (`makeSummaryPage`,
  `makePointsLedgerPage`, `makeRestartBattlePage`, `makeQuadPitchMapPage`,
  `selectPdfEvents`) and adding one optional, default-`true` parameter to
  `makePointsLedgerPage` for the influence-tile redaction (§6a). Both
  categories of edit are additive and behaviour-preserving for every
  existing caller by construction (adding `export` cannot change runtime
  behaviour at all; an optional parameter with a default that matches
  today's implicit behaviour cannot change existing call sites' output).
- Because the canonical `report` continues to be built exactly once by the
  existing PDF-export functions and simply passed through, there is no
  possibility of the share card and the PDF disagreeing on a number — they
  are, by construction, drawing from the same object.
- **Automatic NO-GO trigger, restated for implementers**: if a future PR
  touches `buildMatchReport`, `buildScoreLedger`, any chain engine, event
  classification, report facts, PDF page ordering/content, existing report
  dimensions, or existing snapshot/export outputs *in the course of building
  this feature*, that PR should be rejected and redone — none of that should
  be necessary for this feature as scoped.

---

## 9. UX audit

Smallest honest UI, following Phase 1's established visual language and
"no platform logos" rule (`docs/unified-share-audit.md` §3, §7 — unchanged
rationale: a web PWA cannot guarantee any named destination receives the
file):

```
Share Match Insights
────────────────────────
☐ Match Summary
☐ Where the Points Went
☐ Turnover & Territory
☐ Restart Battle
☐ Shot Pitch Maps
────────────────────────
[ Share This Card ]   (shown only while one card is being previewed)
[ Share Selected ]
[ Save Selected ]
```

- **Share Selected** — builds a `File[]` from the selected cards (lazily
  rendering each on selection, per §7), then calls
  `navigator.canShare({ files })` with the *full* array.
- **Multi-file support on Android**: Chrome for Android supports
  `navigator.share({ files })` with multiple files, and `canShare({files})`
  correctly reports `false` if the destination app set can't handle
  multiple files or that many files — this must be feature-detected per
  attempt, exactly as Phase 1 already does for single files, never assumed.
  Desktop browsers and iOS Safari have historically been more inconsistent
  about multi-file Web Share than Android Chrome; feature-detect, don't
  special-case by platform.
- **Fallback when multi-file sharing is unsupported**: fall back to
  **Save Selected**, which downloads each selected PNG individually (same
  anchor-download primitive Phase 1's `saveImageFile` already uses, looped)
  — never a silent partial share, and never invoke `navigator.share` with a
  subset of files it didn't actually offer to share. This mirrors Phase 1's
  fix to Intelligence Pack's previously-misleading fallback
  (`docs/unified-share-audit.md` §2.3.6) — the same anti-pattern must not
  be reintroduced here.
- **Share This Card**: appears only in a single-card preview state (analogous
  to Intelligence Pack's existing "Share This Card," now powered by Phase
  1's `ShareSheet`) and shares/copies/saves that one card through the exact
  same three-row sheet Phase 1 already built — no new sharing mechanism,
  just a new `capture` adapter feeding the existing UI.
- No Instagram/TikTok/WhatsApp/X/Facebook-specific buttons, consistent with
  Phase 1.

---

## 10. Browser/device support

Identical to Phase 1's matrix (`docs/unified-share-audit.md` §8) for the
single-card path, since it reuses the same `ShareSheet`. For multi-file
`Share Selected` specifically:

| Environment | Multi-file `navigator.share` |
|---|---|
| Android Chrome (tab or installed PWA) | Supported, feature-detect via `canShare({files})` with the full array |
| Desktop Chrome/Edge | No file sharing at all (per Phase 1's matrix) — falls to Save Selected |
| Desktop Firefox / Safari | No file sharing at all — falls to Save Selected |
| iOS Safari | Web Share Level 2 file support exists but multi-file has been less consistent than Android in practice; feature-detect, do not assume parity |

---

## 11. Test plan

Proposed tests (none exist yet; this audit did not write them):

1. **Allowlist enforcement** — `renderShareableReportCard` only accepts the
   five literal `ShareableReportCardId` strings; TypeScript rejects any
   other string at compile time (a `.ts`-level type test, e.g.
   `// @ts-expect-error`), and a runtime test confirms the exhaustive
   `switch`'s `never`-typed default throws/rejects for an unexpected value
   smuggled in via `as unknown as ShareableReportCardId`.
2. **No page-number path exists** — grep-based or structural test asserting
   the new module contains no `pageNumber`/numeric-index parameter feeding
   into a canvas selection.
3. **Same canonical data as the PDF** — build one `MatchReport` from a fixed
   fixture (reuse `src/stats/reporting/golden-fixture.ts`, already used by
   `snapshotExport.test.ts`), render `"match-summary"` via the new function
   and separately render `exportReviewPdf`'s page 1 canvas via
   `makeSummaryPage` directly; assert the two canvases are pixel-identical
   (or, more cheaply, that both were called with the identical `report`
   object reference and identical arguments — a spy-based test is cheaper
   and just as conclusive given both paths call the same function).
4. **PDF output unchanged** — run `exportReviewPdf` and `exportSnapshotPdf`
   before/after the `export`-keyword and optional-parameter changes against
   the same fixture and assert byte-identical (or structurally identical,
   given JPEG encoding is deterministic for identical canvas pixels) PDF
   output. This is a regression test, not a new feature test — it exists to
   prove §8's "very low risk" claim, not merely assert it.
5. **Existing PDF parity tests still pass** — run the existing suite
   unmodified (`pdfMapMarkers.test.ts`, `surfaceParity.test.ts`,
   `watchLabelPopulation.test.ts`, `snapshotExport.test.ts`, etc.) — all
   should pass with zero changes, since no page builder's internals change.
6. **Long team names render safely** — feed a 40+ character team name
   through each of the five cards; assert no thrown error and (where the
   builder already truncates, e.g. `truncTeam(homeTeam, 22)` in
   `makeSummaryPage`) that truncation still applies for the share-card path
   exactly as it does for the PDF path.
7. **Empty-data states** — zero-event fixture through all five; assert each
   renders its existing "No data recorded"-style fallback text rather than
   throwing (each builder already has such a branch for the PDF; confirm it
   still fires when called from the new path).
8. **Maps/legends match their PDF equivalents** — for Restart Battle and
   Turnover & Territory specifically, assert marker colours/positions from
   the share-card render match a same-fixture PDF-path render (same
   argument, same output — a spy/pixel-diff test as in #3).
9. **Multi-select share/fallback** — mock `navigator.share`/`canShare` in
   each supported/unsupported combination (as Phase 1's
   `imageShare.test.ts` already does for the single-file case) and assert
   `Share Selected` picks the right branch, and that `Save Selected` never
   silently substitutes for a failed multi-file share.
10. **No player-analysis page accidentally exposed** — a test asserting
    `renderShareableReportCard` has no branch reaching
    `makePlayerInfluencePage`, `makePlayerPages`, or any other
    player-named-page builder; and a specific regression test for §6 —
    rendering `"where-points-went"` in HT context produces a canvas whose
    pixel data does not contain the injected test player's name region
    (or, more practically, a spy asserting `includeInfluenceTile: false`
    is passed whenever the share-card path calls `makePointsLedgerPage`).
11. **Cleanup** — `URL.revokeObjectURL` is called for every object URL
    created during a preview session, and no canvas element created solely
    for a share-card render is left attached to the DOM or retained after
    the sheet closes (mirrors Phase 1's own cache-invalidation tests).

---

## 12. Exact smallest file set

| File | Status | Purpose |
|---|---|---|
| `src/stats/reviewPdfExport.ts` | **Edit** | Add `export` to `makeSummaryPage`, `makePointsLedgerPage`, `makeRestartBattlePage`, `makeQuadPitchMapPage`, `selectPdfEvents`. Add one optional parameter (`includeInfluenceTile: boolean = true`) to `makePointsLedgerPage`. No other change. |
| `src/stats/shareableReportCards.ts` | **New** | `ShareableReportCardId`, `RenderShareableReportCardInput`, `renderShareableReportCard()` — the allowlisted switch + `toBlob` |
| `src/features/shared/imageShare.ts` | **Edit** | Add one small sibling function, `shareImageFiles(files: File[], meta)`, alongside the existing `shareImageFile` (Phase 1, not yet merged) |
| A new "Share Match Insights" sheet component | **New** | Multi-select checklist UI described in §9; thin wrapper around Phase 1's `ShareSheet` primitives |
| Test files per §11 | **New** | `src/stats/shareableReportCards.test.ts` (+ reuse of `golden-fixture.ts`) |

No changes to `buildMatchReport`, `buildScoreLedger`, any chain engine, event
classification, PDF page order/content, canvas dimensions, or existing
export outputs.

---

## 13. Estimated implementation time

| Task | Estimate |
|---|---|
| `export` keyword additions + `makePointsLedgerPage` optional parameter | 0.5 day (mostly regression-test writing, the edit itself is trivial) |
| `shareableReportCards.ts` (5-card switch + `toBlob`) | 1 day |
| `shareImageFiles()` addition to `imageShare.ts` | 0.5 day |
| "Share Match Insights" multi-select sheet | 1–1.5 days |
| Test suite (§11, all 11 items) | 1–1.5 days |
| **Total** | **~4–5 engineer-days** |

Not weeks, and smaller than Phase 1 — this feature reuses five already-correct
renderers and one already-built Share UI; it adds no new rendering engine.

---

## 14. GO / NO-GO verdict

**GO**, scoped exactly as this document describes: five allowlisted cards,
Option B (call-existing-builder-then-`toBlob`) for all five, one additive
parameter to close the half-time player-name leak, reuse of Phase 1's
`ShareSheet`/`imageShare.ts` extended with one multi-file function.

**NO-GO** would apply only if an implementation actually touched canonical
calculations, PDF page order/content, or introduced a `sharePage(pageNumber)`-
style generic API — none of which this recommendation requires.

---

## 15. Proposed implementation sequence

- **Phase 1A — one-card rendering proof.** Ship `renderShareableReportCard`
  for `"match-summary"` only (simplest card: no variants, no player-name
  risk, single canvas, already receives `report` directly). Wire it to a
  single "Share This Card" affordance reusing Phase 1's existing
  `ShareSheet`. Validates the `export`-and-`toBlob` pattern end-to-end
  before touching the trickier four.
- **Phase 1B — all five allowlisted cards.** Add the remaining four,
  including the `makePointsLedgerPage` influence-tile parameter (§6) and
  the Restart Battle half-count decision (§9/§3). Full test suite from §11.
- **Phase 1C — multi-select sharing and fallbacks.** "Share Match Insights"
  checklist UI, `shareImageFiles()`, lazy per-card generation (§7), Save
  Selected fallback, confirmation notice (§6).

---

## 16. Open questions for the requester

1. **Where the Points Went at half-time**: prefer §6's option (a) (add
   `includeInfluenceTile` param, keep the card shareable at HT minus the
   named tile) or option (b) (simply don't offer this card while a
   half-time-scoped report is active)? This audit leans (a) as strictly
   more useful with equal safety, but it is a product call, not a technical
   one.
2. **Restart Battle at full-time**: share it as **two** images (1st half,
   2nd half — matching the FT Snapshot PDF's own two-page treatment
   exactly), or invest in a small new compositing step to produce **one**
   combined image? This audit recommends two images for Phase 1B (zero new
   rendering code, matches the PDF's own choice) and treats a combined
   version as a Phase 2/optional enhancement, not a blocker.
3. **Entry point**: should "Share Match Insights" be reachable from wherever
   "Export Review PDF"/"HT or FT Snapshot PDF" already live today
   (`StatsModeSurface.tsx`, `ProTaggerLiveScreen.tsx`,
   `ProTaggerReviewScreen.tsx`, `RapidReviewScreen.tsx` — the same four
   surfaces Phase 1 already touched for the unified Share Button), or is a
   single canonical location preferred? Not assumed either way in this
   document.
