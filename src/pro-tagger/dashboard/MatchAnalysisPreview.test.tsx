// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HtFtDashboardView } from "./htFtDashboardView";
import { mapSourceFromSavedMatch } from "./matchMapPerspective";
import { MatchAnalysisPreview, analysisPageJob, type MatchAnalysisRenderers } from "./MatchAnalysisPreview";
import { deepFreeze, ftFixtureMatch, htFixtureMatch, savedMatch } from "./matchMapTestFixtures";
import type { ScoringMapView } from "./scoringMapView";
import type { TurnoverMapView } from "./turnoverMapView";
import { mapFilename } from "./matchMapRenderer";

const png = (name: string) => new File([new Uint8Array([137, 80, 78, 71])], name, { type: "image/png" });

function fakeRenderers() {
  return {
    dashboard: vi.fn(async (v: HtFtDashboardView) => png(`dash-${v.period}.png`)),
    scoring: vi.fn(async (v: ScoringMapView) => png(mapFilename(v, "scoring"))),
    turnovers: vi.fn(async (v: TurnoverMapView) => png(mapFilename(v, "turnovers"))),
  } satisfies MatchAnalysisRenderers;
}

const tab = (name: string) => screen.getByRole("tab", { name });
const inGroup = (group: string, name: string) =>
  within(screen.getByRole("group", { name: group })).getByRole("button", { name }) as HTMLButtonElement;
const click = async (el: HTMLElement) => { await act(async () => { fireEvent.click(el); }); };

beforeEach(() => {
  let n = 0;
  URL.createObjectURL = vi.fn(() => `blob:${++n}`) as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn() as typeof URL.revokeObjectURL;
  window.localStorage.clear();
});
afterEach(() => cleanup());

describe("Match Analysis screen", () => {
  it("opens on the FT dashboard at Full Time; no team selector on the dashboard", async () => {
    const r = fakeRenderers();
    render(<MatchAnalysisPreview source={mapSourceFromSavedMatch(ftFixtureMatch())} onClose={() => {}} renderers={r} />);
    expect(await screen.findByAltText(/FT Dashboard/)).toBeTruthy();
    expect(tab("Dashboard").getAttribute("aria-selected")).toBe("true");
    expect(screen.queryByRole("group", { name: "Team" })).toBeNull();
    expect(inGroup("Half", "FT").getAttribute("aria-pressed")).toBe("true");
    expect(r.dashboard.mock.calls[0][0].period).toBe("FT");
  });

  it("team selector shows the real names, and the choice is kept between Scoring and Turnovers", async () => {
    const r = fakeRenderers();
    render(<MatchAnalysisPreview source={mapSourceFromSavedMatch(ftFixtureMatch())} onClose={() => {}} renderers={r} />);
    await click(tab("Scoring"));
    await screen.findByAltText("Scoring Map, Ballylanders, Full-Time");
    expect(inGroup("Team", "Ballylanders").getAttribute("aria-pressed")).toBe("true");

    await click(inGroup("Team", "Galbally"));
    await screen.findByAltText("Scoring Map, Galbally, Full-Time");
    const scoring = r.scoring.mock.calls.at(-1)![0];
    expect(scoring.team.name).toBe("Galbally");
    expect(scoring.shooting).toMatchObject({ totalShots: 10, scoringShots: 8 });

    await click(tab("Turnovers"));
    await screen.findByAltText("Turnover Map, Galbally, Full-Time");
    expect(inGroup("Team", "Galbally").getAttribute("aria-pressed")).toBe("true");
    const turnovers = r.turnovers.mock.calls.at(-1)![0];
    expect(turnovers.team.name).toBe("Galbally");
    expect(turnovers.totals).toMatchObject({ won: 10, lost: 6 });

    // Back to the dashboard and on to Scoring again: still Galbally.
    await click(tab("Dashboard"));
    await click(tab("Scoring"));
    await screen.findByAltText("Scoring Map, Galbally, Full-Time");
  });

  it("HT / FT switch updates the page; already-built images are reused, not redrawn", async () => {
    const r = fakeRenderers();
    render(<MatchAnalysisPreview source={mapSourceFromSavedMatch(ftFixtureMatch())} onClose={() => {}} renderers={r} />);
    await click(tab("Turnovers"));
    await screen.findByAltText("Turnover Map, Ballylanders, Full-Time");
    await click(inGroup("Half", "HT"));
    await screen.findByAltText("Turnover Map, Ballylanders, Half-Time");
    expect(r.turnovers.mock.calls.at(-1)![0].totals).toMatchObject({ won: 3, lost: 5 });
    await click(inGroup("Half", "FT"));
    await screen.findByAltText("Turnover Map, Ballylanders, Full-Time");
    expect(r.turnovers).toHaveBeenCalledTimes(2);
  });

  it("before Full Time, FT is disabled and HT is used", async () => {
    const r = fakeRenderers();
    render(<MatchAnalysisPreview source={mapSourceFromSavedMatch(htFixtureMatch())} onClose={() => {}} renderers={r} />);
    await screen.findByAltText(/HT Dashboard/);
    expect(inGroup("Half", "FT").disabled).toBe(true);
    expect(inGroup("Half", "HT").getAttribute("aria-pressed")).toBe("true");
  });

  it("before the first half is complete, nothing is rendered", () => {
    const m = savedMatch({ events: [] });
    const src = mapSourceFromSavedMatch({ ...m, restoreContext: { ...m.restoreContext, matchState: "FIRST_HALF" } });
    const r = fakeRenderers();
    render(<MatchAnalysisPreview source={src} onClose={() => {}} renderers={r} />);
    expect(screen.getByText("Match Analysis is available once the first half is complete.")).toBeTruthy();
    expect(r.dashboard).not.toHaveBeenCalled();
  });

  it("Share opens the ShareSheet with the already-built file", async () => {
    const r = fakeRenderers();
    render(<MatchAnalysisPreview source={mapSourceFromSavedMatch(ftFixtureMatch())} onClose={() => {}} renderers={r} />);
    await click(tab("Scoring"));
    await click(inGroup("Team", "Galbally"));
    await screen.findByAltText("Scoring Map, Galbally, Full-Time");
    await click(screen.getByRole("button", { name: "Share or Save Image" }));
    expect(screen.getByText("Share Scoring Map")).toBeTruthy();
    // The sheet's own Save Image fallback is offered alongside Share.
    expect(screen.getAllByRole("button", { name: /Save Image/ }).length).toBeGreaterThan(1);
  });

  it("a render failure is shown, and Share stays disabled", async () => {
    const r = { ...fakeRenderers(), dashboard: vi.fn(async () => { throw new Error("Canvas is not available on this device."); }) };
    render(<MatchAnalysisPreview source={mapSourceFromSavedMatch(ftFixtureMatch())} onClose={() => {}} renderers={r} />);
    expect(await screen.findByText("Canvas is not available on this device.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Share or Save Image" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("Back closes; the match and storage are never touched; object URLs are released", async () => {
    const onClose = vi.fn();
    const match = deepFreeze(ftFixtureMatch());
    const before = JSON.stringify(match);
    window.localStorage.setItem("pitchflow_pro_tagger_matches_v1", "[]");
    const storage = JSON.stringify({ ...window.localStorage });
    const { unmount } = render(<MatchAnalysisPreview source={mapSourceFromSavedMatch(match)} onClose={onClose} renderers={fakeRenderers()} />);
    await screen.findByAltText(/FT Dashboard/);
    await click(tab("Scoring"));
    await screen.findByAltText(/Scoring Map/);
    fireEvent.click(screen.getByRole("button", { name: "← Back" }));
    expect(onClose).toHaveBeenCalled();
    unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(match)).toBe(before);
    expect(JSON.stringify({ ...window.localStorage })).toBe(storage);
  });
});

describe("analysisPageJob", () => {
  it("names every page's file by match, scope, page and (for maps) team", () => {
    const src = mapSourceFromSavedMatch(ftFixtureMatch());
    const r = fakeRenderers();
    expect(analysisPageJob(src, "dashboard", "FT", "OPP", r).filename).toBe("ballylanders-v-galbally-ft-dashboard.png");
    expect(analysisPageJob(src, "scoring", "HT", "OPP", r).filename).toBe("ballylanders-v-galbally-ht-scoring-map-galbally.png");
    expect(analysisPageJob(src, "turnovers", "FT", "FOR", r).filename).toBe("ballylanders-v-galbally-ft-turnover-map-ballylanders.png");
    // The dashboard is two-team: its key ignores the team selection.
    expect(analysisPageJob(src, "dashboard", "FT", "FOR", r).key).toBe(analysisPageJob(src, "dashboard", "FT", "OPP", r).key);
  });
});
