// @vitest-environment jsdom
// Club Crest V1, Checkpoint 4 — the six PDF buttons (Live and Review) look
// the crests up by the match's Saved Team ids, hand them to the exporter,
// release them afterwards, and export unchanged when there are no ids.
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const release = vi.fn();
const loadCalls: Array<{ home?: string; away?: string }> = [];
vi.mock("./crest-artwork", async (orig) => ({
  ...(await orig<typeof import("./crest-artwork")>()),
  loadMatchCrests: vi.fn(async (ids: { home?: string; away?: string }) => {
    loadCalls.push(ids);
    const art = (key: string) => ({ image: { width: 10, height: 10 }, width: 10, height: 10, needsBacking: false, key });
    return { crests: { home: ids.home ? art(`${ids.home}:1`) : null, away: ids.away ? art(`${ids.away}:1`) : null }, release };
  }),
}));
vi.mock("../../stats/reviewPdfExport", async (orig) => ({
  ...(await orig<typeof import("../../stats/reviewPdfExport")>()),
  exportReviewPdf: vi.fn(async () => {}),
  exportSnapshotPdf: vi.fn(async () => {}),
}));

import { exportReviewPdf, exportSnapshotPdf, type ReviewPdfExportInput, type SnapshotPdfExportInput } from "../../stats/reviewPdfExport";
import { ProTaggerLiveScreen } from "../ProTaggerLiveScreen";
import { ProTaggerReviewScreen } from "../ProTaggerReviewScreen";
import { buildDefaultSquad, type ProTaggerSession } from "../pro-tagger-session";
import { ftFixtureMatch } from "../dashboard/matchMapTestFixtures";

beforeEach(() => {
  window.localStorage.clear();
  loadCalls.length = 0;
  release.mockClear();
  vi.mocked(exportReviewPdf).mockClear();
  vi.mocked(exportSnapshotPdf).mockClear();
  window.matchMedia ??= ((q: string) => ({ matches: false, media: q, onchange: null, addListener: () => {}, removeListener: () => {}, addEventListener: () => {}, removeEventListener: () => {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as unknown as typeof ResizeObserver;
});
afterEach(() => cleanup());

const linkedMatch = () => {
  const m = ftFixtureMatch();
  return { ...m, homeSquad: { ...m.homeSquad, savedTeamId: "t-bally", primaryColour: "#16a34a" }, awaySquad: { ...m.awaySquad, savedTeamId: "t-galb" } };
};
const lastInput = (fn: typeof exportReviewPdf | typeof exportSnapshotPdf) =>
  (vi.mocked(fn).mock.calls.at(-1) as unknown as [ReviewPdfExportInput & Partial<SnapshotPdfExportInput>])[0];

describe("Review screen PDF buttons", () => {
  it.each([
    ["Full Review PDF", exportReviewPdf, undefined],
    ["HT Snapshot PDF", exportSnapshotPdf, "HALF_TIME_SNAPSHOT"],
    ["FT Snapshot PDF", exportSnapshotPdf, "FULL_TIME_SNAPSHOT"],
  ] as const)("%s: crests by Saved Team id, passed to the exporter, released after", async (label, fn, mode) => {
    render(<ProTaggerReviewScreen match={linkedMatch()} onBack={() => {}} onMatchUpdate={() => {}} />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: new RegExp(label) })); });
    await waitFor(() => expect(fn).toHaveBeenCalledTimes(1));
    expect(loadCalls).toEqual([{ home: "t-bally", away: "t-galb" }]);
    const input = lastInput(fn);
    expect(input.scoreCrests).toMatchObject({ home: { key: "t-bally:1" }, away: { key: "t-galb:1" }, homeName: "Ballylanders", awayName: "Galbally" });
    if (mode) expect(input.snapshotMode).toBe(mode);
    await waitFor(() => expect(release).toHaveBeenCalledTimes(1));
  });

  it("an older match without Saved Team ids exports exactly as before (no lookup, no crests)", async () => {
    render(<ProTaggerReviewScreen match={ftFixtureMatch()} onBack={() => {}} onMatchUpdate={() => {}} />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Full Review PDF/ })); });
    await waitFor(() => expect(exportReviewPdf).toHaveBeenCalledTimes(1));
    expect(loadCalls).toEqual([]);
    expect(lastInput(exportReviewPdf).scoreCrests).toBeUndefined();
  });
});

describe("Live screen PDF actions", () => {
  const session: ProTaggerSession = {
    id: "live", sport: "gaelic", homeTeamName: "Ballylanders", awayTeamName: "Galbally", venue: "", matchType: "league",
    attackDirection: "right", halfDurationMinutes: 30, createdAt: 1,
    homeSquad: { ...buildDefaultSquad("HOME"), savedTeamId: "t-bally" }, awaySquad: { ...buildDefaultSquad("AWAY"), savedTeamId: "t-galb" },
  };
  const m = ftFixtureMatch();

  it.each([
    ["HT Snapshot PDF", exportSnapshotPdf, "HALF_TIME_SNAPSHOT"],
    ["Full Review PDF", exportReviewPdf, undefined],
    ["FT Snapshot PDF", exportSnapshotPdf, "FULL_TIME_SNAPSHOT"],
  ] as const)("%s at Full Time: crests by the session's Saved Team ids", async (label, fn, mode) => {
    render(
      <ProTaggerLiveScreen session={session} onEnd={() => {}}
        restoreState={{ events: m.events, homeSquadLiveState: session.homeSquad.players, awaySquadLiveState: session.awaySquad.players, matchState: "FULL_TIME", half: 2, clockSeconds: 3600 }} />,
    );
    fireEvent.click(screen.getAllByRole("button", { name: /Options/ })[0]);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: label })); });
    await waitFor(() => expect(fn).toHaveBeenCalledTimes(1));
    expect(loadCalls).toEqual([{ home: "t-bally", away: "t-galb" }]);
    const input = lastInput(fn);
    expect(input.scoreCrests).toMatchObject({ home: { key: "t-bally:1" }, away: { key: "t-galb:1" } });
    if (mode) expect(input.snapshotMode).toBe(mode);
    await waitFor(() => expect(release).toHaveBeenCalledTimes(1));
  });
});
