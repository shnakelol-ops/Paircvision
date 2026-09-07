// P1-B regression coverage: Quick Review Page 1 used bare "Won" / "Lost" /
// "Restart won" / "Restart lost" labels for the Restarts/Turnovers
// consequence rows, violating CLAUDE.md's coaching-insight attribution rule
// (every line must make sense read alone). The fix reuses this same file's
// own already-established "Our"/"Their" shorthand (already used for "Our
// kickouts"/"Their kickouts", justified in the file's header comment because
// the score line at the top of this same page already names both teams) —
// no new terminology invented.
//
// QuickReviewPage1.tsx has no React rendering harness in this repo, so this
// suite scans the component's source text directly for the exact label
// strings, the same way reportLanguageGuard.test.ts scans generated
// narrative text for forbidden phrases.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = readFileSync(fileURLToPath(new URL("./QuickReviewPage1.tsx", import.meta.url)), "utf8");

describe("QuickReviewPage1 — Restarts/Turnovers labels name a team (P1-B)", () => {
  it("no longer uses the bare, team-less 'Restart won' / 'Restart lost' labels", () => {
    expect(source).not.toContain('label="Restart won"');
    expect(source).not.toContain('label="Restart lost"');
  });

  it("no longer uses the bare, team-less 'Won' / 'Lost' turnover subtitles", () => {
    expect(source).not.toContain(">Won<");
    expect(source).not.toContain(">Lost<");
  });

  it("uses the file's own established 'Our' shorthand instead — not invented terminology", () => {
    expect(source).toContain('label="Our restart won"');
    expect(source).toContain('label="Our restart lost"');
    expect(source).toContain("Our turnovers won");
    expect(source).toContain("Our turnovers lost");
  });
});
