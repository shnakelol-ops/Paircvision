# Ledgers before the PR #382 fixture correction

These are the match B ledgers exactly as they stood before the owner-approved B-176 correction (7 November 2026). They are kept as the historical record and are not used by any comparison.

| File | Copy of |
|---|---|
| `expected/ledger-B.json`, `expected/ledger-B-live.json` | `../../expected/` |
| `expected-authoritative/ledger-B.json`, `expected-authoritative/ledger-B-live.json` | `../../expected-authoritative/` |

## Why the old expectation was wrong for the corrected edit

- **Fixture B-176:** our kickout (owner Ballyboden), captured as won by Ballyboden and caught by Ballyboden #8.
- **Review edit:** the restart was actually won by Na Fianna.
- **Old reference:** changed only the winner and kept #8 attached. So #8 was credited with a kickout **lost** (KO 8–1, 17 actions).
  - Nothing in the record says #8 lost anything. #8 was recorded only as the Ballyboden player who caught the ball.
  - Live capture cannot produce that combination: when Na Fianna win our kickout, the player picker shows only Na Fianna players.
  - The old app (before PR #382) also kept #8 attached, which is why its output matched the old ledger.
- **PR #382:** a restart winner can only be changed once the player is cleared.

## What changed

The change was approved by the owner.
- **Fixture:** the B-176 review op carries `clearPlayer: true`, in `fixtures/match-B.json` and in `scripts/gen-fixtures.mjs`, which reproduces all three fixtures byte-for-byte.
- **Reference:** `scripts/reference.mjs` drops the player when an op flips a restart winner with `clearPlayer`.
- **UI harness:** `scripts/run-match.mjs` clears the player number and name before saving that edit.
- **Regenerated ledgers:** produced by the unchanged generators. Exactly three fields differ, in both `expected/ledger-B.json` and `expected-authoritative/ledger-B.json`:

  | Field | Before | After |
  |---|---|---|
  | `facts[173].player` (B-176) | FOR #8 | none |
  | `players` FOR #8 `koLost` | 1 | **0** |
  | `players` FOR #8 `actions` | 17 | **16** |

  The `actions` change follows from the same correction: the cleared restart is no longer one of #8's actions.
- **Unchanged:** `ledger-B-live.json`, ledgers A and C, and `VALIDATION.json` are byte-identical.
