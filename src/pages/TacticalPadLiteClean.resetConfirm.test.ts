// P2 (approved for release) regression coverage: Reset Board must always
// require confirmation before a destructive reset, even on a "clean" board
// (nothing changed since the last save/open) — the board is still visibly
// populated and about to be wiped with no undo. Standard Slate previously
// diverged from Game Timing's own Reset Board (TacticalPlaySurface.tsx),
// which always confirms unconditionally: withDiscardConfirm skipped its
// confirm sheet entirely whenever hasUnsavedBoardChanges() was false,
// permitting a one-tap wipe of a saved board's whole visible layout.
//
// shouldConfirmDiscard is the extracted, exported, pure decision the fix
// applies. A live createTacticalPadLiteSurface() instance cannot be
// constructed in this test environment (no jsdom/canvas — same documented
// limitation as TacticalPadLiteClean.kitEditor.test.ts and
// TacticalPadLiteClean.tacticalSequenceEntry.test.ts), so this is the direct,
// framework-free way to lock the fix without rendering the whole screen.
import { describe, expect, it } from "vitest";
import { shouldConfirmDiscard } from "./TacticalPadLiteClean";

describe("shouldConfirmDiscard (P2 — Slate Reset confirmation parity)", () => {
  it("reset on a dirty board requires confirmation (unchanged pre-fix behaviour)", () => {
    expect(shouldConfirmDiscard("reset", true)).toBe(true);
  });

  it("reset on a 'clean' but visibly populated board ALSO requires confirmation — the fix", () => {
    expect(shouldConfirmDiscard("reset", false)).toBe(true);
  });

  it("load on a dirty board requires confirmation (unchanged — there is something unsaved to discard)", () => {
    expect(shouldConfirmDiscard("load", true)).toBe(true);
  });

  it("load on a clean board does NOT require confirmation (unchanged — nothing unsaved to discard, Load is unaffected by this fix)", () => {
    expect(shouldConfirmDiscard("load", false)).toBe(false);
  });
});
