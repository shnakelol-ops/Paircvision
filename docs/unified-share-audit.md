# Unified Share Button — Audit & Implementation Plan

**Status:** Audit only. No production code was changed to produce this document.
**Scope:** PáircVision is a web/PWA product today (React + TypeScript, PixiJS canvases,
Vite + `vite-plugin-pwa`). This document audits every existing share/export path,
recommends one reusable architecture, and gives an honest verdict on what a
"Share" button can and cannot do from a PWA.

---

## 1. Executive summary

PáircVision already has **five independent, hand-rolled implementations** of
"turn a canvas into an image and hand it to `navigator.share`, or fall back to a
download link." They are inconsistent in naming, dimensions, fallback UX, and
branding, but the underlying primitives are sound: every surface that needs to
share already produces (or can trivially produce) a clean `Blob`/`File` with no
browser chrome baked in. **No new capture library is needed anywhere in the app.**

The biggest real gap is not capture — it's that the app cannot promise to open
Instagram Stories, TikTok, or any other named destination directly. It can only
open the OS/browser's native share sheet and let the user pick. The current UX
copy doesn't claim otherwise (buttons just say "Share"), but the brief's proposed
five-logo menu would claim otherwise, and that would be dishonest for a pure web
PWA. See §7.

**Verdict: GO for Phase 1** (one reusable `openShareMenu()`, existing exporters
as `capture` adapters, no platform logos, ~3–5 engineer-days). **NO-GO** for the
five-named-platform-logo menu as originally sketched; adopt the requester's own
simplified honest version instead (§7).

---

## 2. Current-state audit

### 2.1 Every existing share / export / clipboard entry point

| # | Surface / Component | Trigger & files | Content | Clean capture or DOM screenshot? | Dimensions / format / filename | Mobile fallback |
|---|---|---|---|---|---|---|
| 1 | **Tactical Slate — "Share Board" PNG** | `TacticalPadLiteClean.tsx:3318` (`handleQuickShareSnapshot`), `:3576` (`openQuickShareEntry`), `:5616-5820` menu | Board setup PNG via `exportBoardSetupAsPng()` (`src/features/quickboard/export/board-png-export.ts:38`) | **Clean** — calls `surface.exportImageCanvas()` which uses `app.renderer.extract.canvas(app.stage)` (`createTacticalPadLiteSurface.ts:4212-4253`); editing-only overlays (Shape Lock guide, drag-origin line) are explicitly hidden before extraction | Native canvas resolution (device-pixel-ratio aware, capped at 2×); PNG; **fixed filename** `paircvision-board.png` (no team names, no timestamp); "PáircVision" text watermark baked on at export time, bottom-right, 42% white opacity (`board-png-export.ts:97-106`) | `canShare({files})` check → `navigator.share` → else `<a download>` |
| 2 | **Tactical Slate / Tactical Play — Record → Share (video)** | `TacticalPadLiteClean.tsx:5990-5992`; `TacticalPlaySurface.tsx:2128-2130,3034-3041` (`shareClip`) | Live canvas video clip via `useCanvasRecorder.ts` (`canvas.captureStream(30)` + `MediaRecorder`) | Clean (canvas-only stream; DOM chrome is never part of the captured frames) | mp4 (H.264+AAC preferred) or WebM fallback (`src/features/shared/mediaClipExport.ts:22-81`); filename `${prefix}-${Date.now()}.{ext}` (`:85,107`) | **No watermark baked in** — the export-time "PáircVision" text added to PNG exports is applied by `board-png-export.ts` at export time, not inside the live Pixi scene, so it never reaches the video stream. Inconsistent with entry #1. |
| 3 | **CoachingClipPanel "📤 Share"** | `src/features/quickboard/clips/CoachingClipPanel.tsx:458-461` | Same video clip, reuses `shareClipBlob()` | Same as #2 | Same as #2 | Same as #2 |
| 4 | **ProTaggerLiveScreen "Share Summary PNG"** | `src/pro-tagger/ProTaggerLiveScreen.tsx:678-724,1298-1299` (`handleShare`) | Stats summary card PNG via `buildStatsShareCardPng()` (`src/stats/statsShareCard.ts:70`) | **Clean** — pure Canvas2D drawing, no live UI captured | 1080 × 1640+ (dynamic height); PNG; `${home}-${away}-${stage}-summary.png` slugified (`statsShareCard.ts:135-136`); "PáircVision Stats Summary" footer text baked in (`:133`, full opacity, not a subtle watermark) | `navigator.share`/`canShare` → else `<a download>` |
| 5 | **ProTaggerLiveScreen / StatsModeSurface — Full Review PDF, HT/FT Snapshot PDF** | `reviewPdfExport.ts` — `exportReviewPdf()` (`:7254`), `exportSnapshotPdf()` (`:12490`) | Multi-page (24+N pages) landscape A4 PDF. Each page is an independent `1920×1080` `HTMLCanvasElement` (Canvas2D), rasterized via `canvas.toDataURL("image/jpeg", 0.88)` then `pdf.addImage()` (`:7315-7328`) | Clean per-page canvases, but **never exposed as standalone images** — the only output is `pdf.save(filename)` (`:7650`, `:12781`); no `Blob`/`File`, no `navigator.share` integration for the PDF at all | A4 landscape mm; JPEG-in-PDF; filename `${home}_v_${away}_review.pdf` / `${...}_${suffix}.pdf` | Browser's native "Save PDF" download only — no share sheet involvement today |
| 6 | **StatsModeSurface "Share Summary PNG"** | `StatsModeSurface.tsx:5159-5205` (`shareOrExportMatch`), button at `:6862` | Same `buildStatsShareCardPng()` as #4, plus a text fallback (`buildMatchShareSummaryText`) passed as `ShareData.text` | Clean (same card) | Same as #4 | `canShare` check → `navigator.share({files,title,text})` → else `<a download>` |
| 7 | **"Generate Intelligence Pack"** (StatsModeSurface `:6850`, RapidReviewScreen) → `IntelligencePackPreview.tsx` | `src/stats/intelligencePack.ts` (`buildIntelligencePack`) builds 3 cards in parallel: `buildRestartOutcomesCardPng`, `buildTurnoverFreeOutcomesCardPng`, `buildMatchIntelligenceCardPng` | 3 independent PNG cards, previewed in a swipeable UI with "Share Intelligence Pack" (all 3 files, `IntelligencePackPreview.tsx:96,99`) and "Share This Card" (single file, `:123,126`) | Clean (pure Canvas2D, same family as #4) | Each 1080 × 1920 (native 9:16 — already Stories-ready aspect ratio); filenames per card, e.g. `${home}-${away}-match-impact-${stage}.png` (`matchIntelligenceCard.ts`) | **No Copy Image / Save Image fallback UI exists.** When `canShare`/file-share is unsupported (every desktop browser), the code silently auto-triggers sequential `<a download>` clicks with **no visible change to the button label** — the button still says "Share Intelligence Pack" even though it is about to download 3 files instead |
| 8 | **PitchFlowSettingsShell — "Copy" (support email)** | `src/pages/PitchFlowSettingsShell.tsx:1684` | Plain text via `navigator.clipboard.writeText()` | n/a (text, not image) | n/a | n/a — but see §2.3, this already contradicts the privacy policy's "no clipboard access" claim |
| — | **StatsModeSurface "Export Review" (JSON), RapidCaptureLitePage "Export JSON", BackupRestoreView backup download** | Various | JSON / `.pvbackup` data files via `<a download>` | n/a — data export, not an image | n/a | Plain download only |

### 2.2 Surfaces with no image-export capability today

| Surface | Rendering tech | Finding |
|---|---|---|
| **Tactical Play** (formation/movement board) | Single PixiJS `Application` per `createMovementCanvasShell.ts`, same engine family as Tactical Slate | Has full video Record→Share (row 2/3 above) but **no still-image PNG export**. `MovementCanvasShellHandle` exposes `getCanvas()` but not `exportImageCanvas()`/`extract`. All toolbar/panel chrome is DOM, positioned as `position: fixed` siblings outside the canvas host — so a Pixi-extract-based PNG export would exclude them automatically, exactly as Tactical Slate's already does. |
| **Match Stats pitch/map review & Event Stats maps** (`src/core/pitch/create-pixi-pitch-surface.ts`, used by `RapidReviewScreen.tsx` and the live stats pitch view) | PixiJS `Application`; markers/heatmap/zone overlays are Pixi `Graphics` layers (`draw-stats-heatmap.ts`, `draw-stats-markers.ts`, `draw-stats-zone-overlay.ts`) | **No snapshot/share capability at all.** The visually-similar pitch/zone pages inside the PDF pipeline (`makeZoneAnalysisPage`, etc.) are a **second, independent Canvas2D drawing implementation** of roughly the same content — not a snapshot of this live Pixi surface. Two parallel rendering engines for the same conceptual view is a duplication worth resolving eventually, but not a blocker for Phase 1. |
| **Team/formation setup screens** (ProTagger squad/setup) | DOM | No image export exists (`exportTeamAsSquad` in `ProTaggerSquadScreen.tsx` is a data transform, not an image). No existing "card" to share. **Recommend treating this as out of scope for Phase 1** until a specific shareable visual is designed — flagged as an open question, not assumed. |

### 2.3 Duplication and inconsistency found

1. **Five separate hand-rolled share/fallback implementations** (rows 1, 2/3, 4, 6, 7 above) each reimplement: feature-detecting `canShare`, calling `navigator.share`, swallowing the user-cancelled rejection, and building an `<a download>` fallback. No shared `shareImageFile()` helper exists anywhere. `mediaClipExport.ts`'s `shareClipBlob`/`downloadClipBlob` is the closest thing to an extracted helper, but it's video-only and not reused by any image flow.
2. **Four near-identical Canvas2D card builders** — `matchIntelligenceCard.ts`, `turnoverFreeOutcomesCard.ts`, `restartOutcomesCard.ts`, `possessionOutcomesCard.ts` — each reimplement the same panel/gradient/header/`toBlob→File` primitives already written once in `statsShareCard.ts`. Worth consolidating onto shared drawing helpers as a follow-up cleanup; not required to ship Phase 1.
3. **Two parallel pitch-drawing engines** for conceptually the same zone/heatmap view (live Pixi layers vs. the PDF's internal Canvas2D page builders) — noted above.
4. **Watermark inconsistency**: PNG board exports get a "PáircVision" text watermark baked on at export time (`board-png-export.ts`); video clip exports of the same board do not, because the watermark is applied post-hoc to the PNG canvas, not inside the live Pixi scene that `captureStream()` reads from.
5. **Stale/unimplemented UI references**: `RapidHalfBreakPanel.tsx` and `RapidMatchHubFab.tsx` contain comments referencing a "Share Report" menu item that is not actually wired up in those files. `PitchFlowCoachShell.tsx:1598` has a card heading "Share your session" with no confirmed handler in the read range. These read as either dead copy or an already-planned-but-unbuilt feature — worth a quick look before Phase 1 ships, so nothing gets silently duplicated.
6. **Intelligence Pack's fallback UX is silently misleading** (§2.1 row 7): the button text never changes to reflect "this will download 3 files" vs. "this will open your share sheet." This is exactly the kind of dishonest-implication problem the brief asks us to avoid, and it already exists in shipped code — Phase 1 should fix it as part of consolidation, not just for new surfaces.

### 2.4 Privacy / PII exposure

- The **PNG share cards** (`statsShareCard.ts`, and the three Intelligence Pack cards) only aggregate **team-level** stats. No player names or numbers appear on them.
- The **Full/HT/FT Review PDF** does embed real player names: `collectPlayerStats()` (`reviewPdfExport.ts:1349`) reads `p.name` from squad rosters and feeds `makePlayerInfluencePage()` — individual player performance breakdowns are part of the exported document. This is pre-existing behavior (PDF export already exists and is coach-initiated), but it's worth flagging explicitly because a unified "Share" affordance sitting next to it could make it easier to accidentally hand a PDF with player names to the wrong audience (e.g. a parent group chat) than the coach intended. No code change is proposed here — just a note for the "Save/Share" copy to keep PDF and image-share visually distinct so a coach doesn't confuse the two.
- **Tactical Slate/Play boards** show jersey numbers and (optionally) short player initials/names typed in by the coach as annotations — low sensitivity, coach-controlled, no roster data pulled in automatically.

### 2.5 A pre-existing documentation gap

`docs/privacy-policy.md:170` currently states: *"PáircVision does not request camera access, location data, notifications, or clipboard access."* This is already slightly inaccurate today — `PitchFlowSettingsShell.tsx:1684` calls `navigator.clipboard.writeText()` for the support-email copy button. If Phase 1 adds **Copy Image** (`navigator.clipboard.write` with `ClipboardItem`), this line must be corrected regardless — it would otherwise be a false statement in a legal document. This is a documentation task to bundle with Phase 1, not a code change made now.

---

## 3. Platform-limitation assessment (must-read before designing the UI)

The brief's proposed menu:

```
Share
────────────
Share Image…
Instagram Stories
TikTok
WhatsApp
X
Facebook
────────────
Copy Image
Save Image
```

**This cannot be built honestly as a pure web PWA.** `navigator.share()` opens
the operating system's native share sheet; the OS decides which installed apps
appear as targets for `image/png`, and the web app has no ability to specify or
guarantee that "Instagram Stories" or "TikTok" specifically receives the file,
nor to skip straight to that app's compose screen. There is no public Web API
for "open this specific installed app with this image" — that capability exists
only via native platform SDKs (Instagram's app-to-app URL scheme, TikTok's
share intent, etc.), none of which a browser tab or installed PWA has access to.

So a menu with five named platform rows, if each row just calls the same
`navigator.share()`, is **decorative** — it implies direct integration that
isn't there. That fails the brief's own explicit constraint ("Do not build
decorative buttons that all secretly perform the same action while implying
guaranteed direct integration") and would also read as an unauthorized
suggestion of partnership with Meta/TikTok/X, which their brand guidelines
prohibit.

**Recommended UX** — the requester's own instinct, confirmed correct by this audit:

```
Share
────────────
Share Image…
  Share to Instagram, TikTok, WhatsApp, X,
  Facebook and other installed apps
────────────
Copy Image
Save Image
```

One primary action, one generic share glyph, one line of accurate subtext, plus
the two guaranteed-to-work fallbacks. This is completely honest and produces
the identical real-world result (Android's/iOS's share sheet, with whatever
apps the user has installed) as five fake named buttons would — with no risk
of misrepresenting integration that doesn't exist.

---

## 4. Recommended architecture

One reusable function, one small UI component. No backend, no native SDKs.

```ts
// src/features/shared/openShareMenu.ts
type ShareSource =
  | "tactical-slate" | "tactical-play"
  | "stats-pitch-map" | "intelligence-card" | "match-summary-card";

type OpenShareMenuOptions = {
  source: ShareSource;       // for logging/analytics only, not behavior branching
  title: string;
  text?: string;             // optional caption, passed to navigator.share
  filename: string;          // e.g. "ballyboden-nafianna-half-time-summary.png"
  capture: () => Promise<Blob | File | null>; // the ONLY per-surface adapter
};

export async function openShareMenu(opts: OpenShareMenuOptions): Promise<void>;
```

Internal flow (mirrors the pattern already used correctly in 4 of the 5
existing call sites — this is consolidation, not invention):

1. Show a lightweight loading state; call `capture()`.
2. If `capture()` resolves `null`/rejects → show one inline error line
   ("Couldn't create image to share") and stop. No dead buttons.
3. Wrap the result in a `File` named per `filename`.
4. `navigator.canShare?.({ files: [file] })` — only if **true**, attempt
   `navigator.share({ files: [file], title, text })`. Catch and silently
   ignore user cancellation (existing convention, keep it).
5. Always render **Copy Image** and **Save Image** as explicit, always-visible
   actions underneath — not hidden behind a "share failed" state:
   - **Copy Image**: feature-detect `navigator.clipboard?.write` +
     `window.ClipboardItem`; on failure, show "Couldn't copy — try Save Image"
     inline and leave Save Image intact.
   - **Save Image**: `URL.createObjectURL` + synthetic `<a download>` click —
     works in every browser, online or offline, with or without file-share
     support. This is the one guaranteed universal action and must never be
     hidden or removed.

A small companion component (`ShareSheet.tsx`) renders the three-row menu with
loading/error states; `openShareMenu()` mounts it. This is the entire net-new
surface area.

---

## 5. Exact smallest file set

| File | Status | Purpose |
|---|---|---|
| `src/features/shared/openShareMenu.ts` | **New** | The state machine described in §4 |
| `src/features/shared/ShareSheet.tsx` | **New** | Minimal bottom-sheet/modal UI: Share Image… / Copy Image / Save Image, loading + error states |
| `src/movement-board/shell/createMovementCanvasShell.ts` (or equivalent Tactical Play shell file) | **Edit** | Add `exportImageCanvas()` mirroring `createTacticalPadLiteSurface.ts:4212-4253` (~20-30 lines) — the only missing still-image capture in the whole app |
| `src/core/pitch/create-pixi-pitch-surface.ts` | **Edit** | Same addition, for Match/Event Stats pitch-map view (~20-30 lines) |
| `TacticalPadLiteClean.tsx`, `TacticalPlaySurface.tsx`, `StatsModeSurface.tsx`, `ProTaggerLiveScreen.tsx`, `IntelligencePackPreview.tsx`, `RapidReviewScreen.tsx` | **Edit** | Replace each bespoke inline share/fallback block with a call to `openShareMenu({ source, title, text, filename, capture })`, reusing each surface's *existing* exporter as `capture`. No new buttons — the existing Share button in each toolbar becomes the caller. |
| `docs/privacy-policy.md` | **Edit** | Correct the "no clipboard access" line once Copy Image ships (§2.5) |

No new npm dependencies. `jspdf` (existing) stays untouched — PDFs remain a
separate "Download PDF" affordance, not merged into the image-share sheet
(different content type; merging them would be a scope-creepy redesign the
brief explicitly warns against).

---

## 6. Per-surface adapter table

| Surface | Capture adapter needed? | Effort | Notes |
|---|---|---|---|
| Tactical Slate (board PNG) | **None** — reuse `exportBoardSetupAsPng()` | 0 | Already clean, already `File` |
| Tactical Play (still image) | **Small** — new `exportImageCanvas()` | ~20-30 lines | Mirrors Tactical Slate exactly; same Pixi `Application` family |
| Tactical Play / Tactical Slate (video clip) | None — already shipped | 0 | Stays its own Record→Share flow, not merged into image-share sheet (per brief: no video-export work) |
| Match Stats pitch/map review, Event Stats maps | **Small** — new extract method on `create-pixi-pitch-surface.ts` | ~20-30 lines | One adapter covers both, since both consume the same shared component |
| HT/FT Intelligence cards (`statsShareCard.ts` + 3 Intelligence Pack cards) | **None** — reuse existing builders | 0 | Optional follow-up: consolidate the 4 duplicated Canvas2D drawing files onto shared primitives (separate cleanup task, not a Phase 1 blocker) |
| Team/formation setup screens | **Not scoped** | — | No existing visual "card" to capture; open question, see §9 |
| Full/HT/FT Review PDF | **Out of scope** | — | Different content type (multi-page document); stays a "Download PDF" action, untouched |

---

## 7. Legal / trademark recommendation

- **Phase 1: no platform logos.** Use a generic system share glyph (the same
  icon already implied by the app's existing Share buttons) plus the plain-text
  line from §3. This sidesteps every trademark question entirely because no
  platform mark is used.
- The repo currently contains **zero** third-party platform brand assets
  (`public/` was searched — only PáircVision's own marks exist:
  `pv-logo-icon.svg`, `pv-logo-primary.svg`, favicons, `android-chrome-*.png`).
  Adding named-platform icons would require a fresh sourcing pass regardless.
- If named platform buttons are ever reconsidered (Phase 2, see §10):
  download marks only from each platform's official brand-resource page (Meta
  for Instagram/WhatsApp/Facebook, TikTok's brand resource site, X's brand
  toolkit); never substitute a generic icon pack; never recolor, redraw,
  distort, or combine a mark with PáircVision branding; respect minimum size
  and clear-space rules; use a mark only on a button whose action **genuinely
  and verifiably** routes to that platform (which, per §3, is not possible from
  a pure web PWA today); keep a dated source-URL record for every asset used.
  If any of that can't be satisfied for a given button, use neutral text or the
  generic share icon instead — never a logo standing in for an integration that
  doesn't exist.

---

## 8. Browser / device support matrix (honest, feature-detected — nothing assumed)

| Environment | `navigator.share` w/ files | `canShare({files})` | Clipboard image write | Save (download) |
|---|---|---|---|---|
| Desktop Chrome / Edge | Supported | Supported | Supported (`ClipboardItem` + `image/png`) | Always works |
| Desktop Firefox | Not supported (no file share) | N/A | Historically inconsistent for images — must feature-detect, do not assume | Always works |
| Desktop Safari | Not supported (no file share) | N/A | Supported since Safari 13.1+, but the `clipboard.write` call must happen synchronously in the click handler or wrapped in a `ClipboardItem(Promise)` — async gaps before the call can silently fail | Always works |
| Android Chrome (browser tab) | Supported | Supported | Supported | Always works |
| Android Chrome (installed PWA / TWA) | Supported (same Chromium engine) | Supported | Supported | Always works |
| iOS Safari (browser tab, iOS 15+) | Supported (Web Share Level 2) | Supported | Supported since iOS 13.4+, PNG only, same synchronous-gesture caveat as desktop Safari | Always works |
| iOS Safari (installed / Home Screen PWA) | Historically less reliable than the in-browser-tab case — must feature-detect at runtime, do not assume parity with the browser tab | Same caveat | Same caveat as above, sometimes worse in standalone mode | Always works |

**Design implication**: never gate the whole Share menu on a single browser
check. Feature-detect each capability independently every time the sheet
opens, and always keep **Save Image** visible and working regardless of what
else is or isn't supported — it's the only row with 100% real-world coverage.

---

## 9. Fallback behaviour, loading, cancellation, offline

- **Loading**: capture is typically <200ms (Pixi extract) to ~1s (large
  Canvas2D card redraw for the Intelligence Pack). Show a disabled/spinner
  state on the triggering button during this window; no full-screen blocking
  spinner needed.
- **User cancels the native share sheet**: resolve silently, no error shown —
  matches existing app convention (all 4 correctly-behaving current call sites
  already catch and ignore this).
- **`capture()` fails or returns `null`**: one inline line, "Couldn't create
  image to share," Share/Copy/Save all disabled for that attempt (nothing to
  act on) — never a silent no-op with no feedback, which is what Intelligence
  Pack's current desktop fallback does today (§2.3.6).
- **Copy Image fails** (clipboard permission denied, browser lacks
  `ClipboardItem`, secure-context issue): inline "Couldn't copy — try Save
  Image instead," Save Image stays available.
- **`navigator.share` exists but `canShare({files})` is false**: skip straight
  to the Copy/Save fallback tier — do not attempt `navigator.share` with files
  it has already said it can't handle. (Already correct in 4/5 existing call
  sites; §5's edits bring the fifth — Intelligence Pack — in line.)
- **Offline**: works fully. Capture, Canvas2D/Pixi extraction, clipboard write,
  and native share are all client-side/OS-level; no network call is involved in
  PáircVision's half of the flow. The app already has offline app-shell caching
  via `vite-plugin-pwa` (`vite.config.ts` — Workbox `navigateFallback`, asset
  globs for js/css/html/svg/json/webmanifest). Whether the *destination* app
  (WhatsApp, etc.) can actually send while offline is outside PáircVision's
  control and outside this scope.
- **Image size**: keep every surface's existing native export resolution — no
  reason to change any current dimensions. Where a new adapter is added
  (Tactical Play, stats pitch-map), match the sibling surface's existing
  convention (native canvas resolution, same as Tactical Slate) rather than
  inventing a new size rule.
- **Button placement**: no new UI chrome anywhere. Every surface listed in §6
  already has a Share button in its toolbar today — Phase 1 swaps what that
  existing button calls, it does not add a new one.

---

## 10. Test plan

**Manual cross-browser/device pass** (once per surface pairing — Tactical Slate
board + one Intelligence card is sufficient to cover both adapter shapes):
Desktop Chrome, Desktop Firefox, Desktop Safari, Android Chrome (tab),
Android Chrome (installed PWA), iOS Safari (tab), iOS Safari (installed). For
each: Share Image opens the correct native sheet with the right file/title;
cancel does nothing bad; Copy Image either works or shows the graceful failure
message; Save Image always produces a correctly-named file; verify no browser
chrome/toolbar/overlay leaks into the exported image; verify watermark/branding
presence matches expectation; verify airplane-mode (offline) still produces an
image and Save Image still works.

**Automated unit tests** (Vitest, matching the repo's existing `*.test.ts`
convention, e.g. `snapshotExport.test.ts`): mock `navigator.share`,
`navigator.canShare`, and `navigator.clipboard.write` in every combination of
presence/absence; assert `openShareMenu()` picks the correct branch each time;
assert cancellation is swallowed silently; assert a `capture()` rejection or
`null` result shows the failure state without throwing; assert Save Image's
`<a download>` path is always reachable regardless of the other two branches.

**Regression note**: no existing test exercises any of the 5 current share
call sites' *mechanism* (only PDF/card *content* is tested today — e.g.
`pdfMapMarkers.test.ts`, `watchLabelPopulation.test.ts`). Phase 1 will be the
first time the share mechanism itself is under test.

---

## 11. Estimated implementation size

| Task | Estimate |
|---|---|
| `openShareMenu()` + `ShareSheet.tsx` + unit tests | 1–2 days |
| Two small capture adapters (Tactical Play still image, stats pitch-map extract) | 0.5–1 day |
| Rewire 6 existing call sites onto the shared function, delete duplicated inline logic, fix Intelligence Pack's misleading fallback copy | 1 day |
| Manual cross-browser/device pass | 0.5–1 day |
| `docs/privacy-policy.md` correction | trivial, bundle with above |
| **Total, Phase 1** | **~3–5 engineer-days** |

Not weeks. The reason it's small: every surface already produces (or is one
small, mechanical addition away from producing) a clean image `Blob`, and the
share/fallback state machine already exists correctly in 4 of 5 places — this
is consolidation of proven code, not new capture engineering.

---

## 12. GO / NO-GO verdict

- **GO** for Phase 1 as re-scoped in this document: one `openShareMenu()`,
  reused across every visual surface via existing exporters, generic share
  icon + honest subtext, Copy Image + Save Image as explicit fallbacks, no
  platform logos, no new dependencies, no backend.
- **NO-GO** for the originally-sketched five-named-platform-logo menu, exactly
  as specified — it cannot be made honest on a pure web PWA (§3) and would
  require sourcing/legal work (§7) for a UX that performs identically to the
  simpler honest version underneath.

---

## 13. Phase split

**Phase 1 — launch-safe minimum** (this document's recommendation):
`openShareMenu()` + `ShareSheet.tsx`; two small Pixi-extract adapters
(Tactical Play, stats pitch-map); rewire the 6 existing bespoke share buttons
onto the shared function; generic share icon + "Share to Instagram, TikTok,
WhatsApp, X, Facebook and other installed apps" subtext; Copy Image; Save
Image; fix Intelligence Pack's misleading fallback labeling; correct the
privacy-policy clipboard line.

**Phase 2 — optional, post-native-packaging only**: revisit named-platform
buttons **only if and when** an Android (or iOS) native wrapper exists with
real per-platform share intents that a browser tab cannot access. At that
point, and only then, source official unmodified brand assets per §7 and wire
each button to an action that is verifiably that specific platform. Until
native packaging exists, Phase 2 remains theoretical and is not recommended.

---

## 14. Open question for the requester

Team/formation setup screens (ProTagger squad/setup) currently have no
shareable visual card at all — no export, no canvas, nothing to capture. The
brief says "where appropriate." Recommend explicitly deciding whether a new
shareable card should be *designed* for these screens (which would be new
visual-design work, out of this audit's scope per the guardrails) or whether
these screens are simply excluded from Phase 1. No assumption has been made
either way.
