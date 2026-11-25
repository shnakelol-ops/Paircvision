# Saved-match protection: implementation plan (read-only, awaiting approval)

Main is `edb72de` (PR #379 merged). No code has been changed for this plan.

## Current behaviour

All references are on main `edb72de`.

| # | Risk | Where | Evidence |
|---|---|---|---|
| 1 | **Silent deletion of the oldest match when a 21st is created.** `saveProTaggerMatchFull` prepends the new match and applies `.slice(0, MAX_PRO_TAGGER_MATCHES = 20)`. The match dropped is the last in array order (oldest created), whether or not it is finished. No warning is shown. | `pro-tagger-storage.ts` `saveProTaggerMatchFull` | `PERSISTENCE-INVESTIGATION.md` §2.8 (reproduced in the browser) |
| 2a | **Unreadable store treated as empty, then overwritten.** `readProTaggerMatchesRaw` returns `[]` when the key's value does not parse or is not an array. The next save writes `[thisMatch]` and every stored match is gone. | `pro-tagger-storage.ts` | §2.9 (reproduced) |
| 2b | **Individual malformed records are dropped on the next write.** Records failing `isValidProMatch` are filtered out on read, so any save rewrites the array without them. | same | code |
| 2c | **Event Stats can overwrite the *Match Stats* archive.** `saveProTaggerMatch` (Save Match / Save & Finish) reads `pitchflow_matches_v1` with the same "unreadable → `[]`" rule and writes it back. Match Stats itself refuses this: `StatsModeSurface` shows "Save blocked — saved matches storage is corrupted." | `pro-tagger-storage.ts` `readExisting` | code |
| 2d | **`deleteProTaggerMatch` on an unreadable store** reads `[]`, finds nothing to delete and returns `false`. It does not write, so it is harmless today, but it must stay that way. | same | code |
| 3 | **Capacity.** One origin quota holds about 5 M characters, which is about 17 full 306-event matches, because each finished match is stored twice. When the quota is exceeded, `setItem` throws and `safeWrite` returns `false`. The live screen shows "Save failed — storage unavailable." (P0). These paths ignore the result and say nothing: saved-match Review edits (`ProTaggerPage` `onMatchUpdate`), file import (`ProTaggerOptionsScreen`), coordinate repair, and the shared-archive write in Save & Finish. | several | `PERSISTENCE-INVESTIGATION.md` §2.7 |
| 3b | **Hidden capacity consumer:** coordinate repair keeps up to 40 full-match copies in `pitchflow_pro_tagger_matches_backup_v1`. | `pro-tagger-coordinate-repair.ts` | code |

**What already exists and will be reused:**
- The **Settings → Backup** export (`backup/backup-build.ts`) includes every domain's raw value, **including an unreadable one, verbatim**, and labels it "unreadable". That gives coaches a recovery path without any new control.
- The live screen's persistent warning slot.

## Proposed change

The change is in two files, plus small wiring.

### A. `pro-tagger-storage.ts` (storage format and keys unchanged)

1. **One read result that tells "empty" from "unreadable".** `readProTaggerStore()` returns `{ status: "empty" | "ok" | "unreadable", matches, preserved }`.
   - `preserved` holds the stored records that fail `isValidProMatch`, kept **verbatim**.
   - `readProTaggerMatches()` keeps its current signature for every reader, returning only valid matches as now.
2. **`saveProTaggerMatchFull`:**
   - **Remove `.slice(0, 20)`.** Nothing is ever deleted by a save.
   - **`unreadable` → do not write.** Return `{ ok: false, reason: "unreadable" }`.
   - **Write `[...valid (upserted), ...preserved]`,** so malformed records survive every save. This uses the same array and the same record shape.
   - **Quota or other `setItem` failure** → `{ ok: false, reason: "full" | "unavailable" }`. `QuotaExceededError` is detected by name/code.
   - The result is exposed as a small object. The existing boolean callers keep working through a `…Full(record).ok`-style wrapper, so the call-site diff stays minimal.
3. **`deleteProTaggerMatch`:** refuse (`{ ok: false, reason: "unreadable" }`) when the store is unreadable, and keep preserved records when it writes.
4. **`saveProTaggerMatch` (shared Match Stats archive):** apply Match Stats' own rule. If `pitchflow_matches_v1` is unreadable, **skip that write** and report it; never write `[]`-based content over it. **The archive copy itself is kept.**
5. **No automatic backups and no quarantine copies.** A full routine backup would halve capacity, from about 17 to about 8 matches, so it is rejected. An unreadable value is protected by **leaving it exactly where it is**; the existing Backup export already saves it verbatim.

### B. Coach-facing warnings (existing text slots only; no new buttons or screens)

| Situation | Where | Text (proposed) |
|---|---|---|
| Live save refused, store unreadable | live screen's existing warning slot and pitch footer | "Save blocked — saved matches storage is corrupted." (same wording Match Stats uses) |
| Live save failed, storage full | same slot | "Save failed — storage full. Back up and delete old matches." |
| Other write failure | same slot | existing "Save failed — storage unavailable." |
| Saved Matches opened with an unreadable store | Saved Matches header line, where the count is today | "Saved matches can't be read. Nothing has been overwritten. Use Settings → Backup to export them." |
| Storage nearly full (estimated ≥ 80 % of 5 M chars across the app's keys) | same header line | "Storage nearly full — back up and delete old matches." |
| Review edit, import or coordinate repair write fails | each screen's existing message/alert | the same three texts |

The capture flow, buttons, taps, Quick Review, Snapshot, PDFs and statistics are **not touched**.

### C. Tests

| ID | Test |
|---|---|
| S1 | With 20 saved matches, creating a 21st keeps all 21. With 40, all are kept. Order is unchanged and the update stays in place. |
| S2 | An unparseable store value is **byte-identical** after a live save, Save Match, Save & Finish, Review edit, import, repair and delete. Each reports `unreadable`, and the live screen shows the "Save blocked" text. |
| S3 | A store with one malformed record plus valid ones: every save keeps the malformed record verbatim, and readers still see only the valid ones. |
| S4 | An unreadable `pitchflow_matches_v1` is never overwritten by Event Stats' Save Match or Save & Finish. The Event Stats record still saves to its own key. |
| S5 | A quota failure (`QuotaExceededError`) gives the "storage full" text. A later successful save clears it, as P0 already does for the warning. In-memory events are never dropped. |
| S6 | The near-full estimate appears only above the threshold, and never blocks saving. |
| S7 | Unchanged:<br>• P0 persistence tests (17);<br>• storage tests;<br>• the 636-event regression (ledger results identical to main);<br>• the Backup export of an unreadable domain still contains the raw value;<br>• the existing saved-match fixtures load and save byte-identically, apart from `updatedAt`. |
| S8 | Browser probe: rerun `matchCap` and `corruptStore` from `persistence/probe.mjs`. Expect **0 evicted** and **corrupt value preserved** (main: 1 evicted, value replaced). |

## Explicitly out of scope (needs separate approval)

- Removing or capping the duplicate Match Stats archive copy.
- One-key-per-match storage, or any migration.
- Changing the 40-copy coordinate-repair backup.
- A new control to export or reset only the unreadable data (the existing Backup covers export).
- Review Edit, discipline, PDFs, placed-ball wording, restart-reporting investigation.

## Risk to existing saved matches

- **None from the format:** keys, shape and order are unchanged, and no migration is involved.
- **The only behavioural changes are refusals.** A save that would have deleted or overwritten data now fails visibly.
- **One consequence for the coach to accept:** if storage is genuinely unreadable or full, new saves fail visibly until the coach backs up and deletes matches. Today, existing matches are silently destroyed instead.
