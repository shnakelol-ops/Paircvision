// @vitest-environment jsdom
// Club Crest V1, Checkpoint 2 — the Match Analysis screen uses one crest
// snapshot per session, gives each page the right club's crest, never blocks
// on a slow or failed crest, and exports exactly the image it previews.
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const shareInputs: Array<{ getBlob: () => Promise<Blob> }> = [];
vi.mock("../../features/shared/ShareSheet", () => ({
  ShareSheet: (props: { open: boolean; input: { getBlob: () => Promise<Blob> } }) => {
    if (props.open) shareInputs.push(props.input);
    return null;
  },
}));

import type { CrestArtwork, LoadedMatchCrests, MatchCrests } from "../crest/crest-artwork";
import { CREST_SNAPSHOT_TIMEOUT_MS, MatchAnalysisPreview, analysisPageJob, type MatchAnalysisRenderers } from "./MatchAnalysisPreview";
import type { HtFtDashboardView } from "./htFtDashboardView";
import { mapSourceFromSavedMatch, type MatchMapSource } from "./matchMapPerspective";
import { mapFilename } from "./matchMapRenderer";
import { ftFixtureMatch, savedMatch, HT_FIXTURE } from "./matchMapTestFixtures";
import type { ScoringMapView } from "./scoringMapView";
import type { TurnoverMapView } from "./turnoverMapView";

const art = (tag: string): CrestArtwork => ({
  image: { tag, width: 100, height: 120 } as unknown as CanvasImageSource, width: 100, height: 120, needsBacking: false, key: `${tag}:1`,
});
const BALLY = art("bally");
const GALB = art("galb");

let n = 0;
const png = (name: string) => new File([new Uint8Array([137, 80, 78, 71, ++n])], name, { type: "image/png" });

function renderers() {
  return {
    dashboard: vi.fn(async (v: HtFtDashboardView, _doc?: Document, _c?: MatchCrests) => png(`dash-${v.period}.png`)),
    scoring: vi.fn(async (v: ScoringMapView, _doc?: Document, _c?: CrestArtwork | null) => png(mapFilename(v, "scoring"))),
    turnovers: vi.fn(async (v: TurnoverMapView, _doc?: Document, _c?: CrestArtwork | null) => png(mapFilename(v, "turnovers"))),
  } satisfies MatchAnalysisRenderers;
}

function linkedSource(home = "t-bally", away = "t-galb"): MatchMapSource {
  const m = ftFixtureMatch();
  return mapSourceFromSavedMatch(
    savedMatch({
      events: m.events,
      homeSquad: { ...HT_FIXTURE.homeSquad, savedTeamId: home },
      awaySquad: { ...HT_FIXTURE.awaySquad, savedTeamId: away },
    }),
  );
}

function loader(crests: MatchCrests = { home: BALLY, away: GALB }) {
  const release = vi.fn();
  const load = vi.fn(async (_ids: { home?: string; away?: string }): Promise<LoadedMatchCrests> => ({ crests, release }));
  return { load, release };
}

const tab = (name: string) => screen.getByRole("tab", { name });
const inGroup = (group: string, name: string) =>
  within(screen.getByRole("group", { name: group })).getByRole("button", { name }) as HTMLButtonElement;
const click = async (el: HTMLElement) => { await act(async () => { fireEvent.click(el); }); };

const urlFiles = new Map<string, Blob>();
beforeEach(() => {
  let u = 0;
  urlFiles.clear();
  shareInputs.length = 0;
  URL.createObjectURL = vi.fn((b: Blob) => { const url = `blob:${++u}`; urlFiles.set(url, b); return url; }) as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn() as typeof URL.revokeObjectURL;
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("crest snapshot", () => {
  it("looks crests up by the match's Saved Team ids, once per session, before the first render", async () => {
    const r = renderers();
    const { load } = loader();
    let resolve!: (v: LoadedMatchCrests) => void;
    load.mockImplementationOnce(() => new Promise((res) => (resolve = res)));
    render(<MatchAnalysisPreview source={linkedSource()} onClose={() => {}} renderers={r} loadCrests={load} />);
    expect(load).toHaveBeenCalledWith({ home: "t-bally", away: "t-galb" });
    expect(r.dashboard).not.toHaveBeenCalled(); // waits for the crests
    expect(screen.getByText("Creating dashboard…")).toBeTruthy();
    await act(async () => resolve({ crests: { home: BALLY, away: GALB }, release: vi.fn() }));
    await screen.findByAltText(/FT Dashboard/);
    expect(r.dashboard.mock.calls[0][2]).toEqual({ home: BALLY, away: GALB });

    await click(tab("Scoring"));
    await click(inGroup("Half", "HT"));
    await click(tab("Turnovers"));
    await click(inGroup("Team", "Galbally"));
    await screen.findByAltText("Turnover Map, Galbally, Half-Time");
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("an older match without Saved Team ids never opens the crest store and uses monograms", async () => {
    const r = renderers();
    const { load } = loader();
    render(<MatchAnalysisPreview source={mapSourceFromSavedMatch(ftFixtureMatch())} onClose={() => {}} renderers={r} loadCrests={load} />);
    await screen.findByAltText(/FT Dashboard/);
    expect(load).not.toHaveBeenCalled();
    expect(r.dashboard.mock.calls[0][2]).toEqual({ home: null, away: null });
  });

  it("a failing crest loader never blocks Match Analysis", async () => {
    const r = renderers();
    const load = vi.fn(async () => { throw new Error("IndexedDB unavailable"); });
    render(<MatchAnalysisPreview source={linkedSource()} onClose={() => {}} renderers={r} loadCrests={load} />);
    await screen.findByAltText(/FT Dashboard/);
    expect(r.dashboard.mock.calls[0][2]).toEqual({ home: null, away: null });
  });

  it("a hanging crest loader falls back to monograms after the timeout; a late result is released, not applied", async () => {
    vi.useFakeTimers();
    const r = renderers();
    let resolve!: (v: LoadedMatchCrests) => void;
    const load = vi.fn(() => new Promise<LoadedMatchCrests>((res) => (resolve = res)));
    render(<MatchAnalysisPreview source={linkedSource()} onClose={() => {}} renderers={r} loadCrests={load} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(CREST_SNAPSHOT_TIMEOUT_MS + 1); });
    expect(r.dashboard).toHaveBeenCalledTimes(1);
    expect(r.dashboard.mock.calls[0][2]).toEqual({ home: null, away: null });
    const late = vi.fn();
    await act(async () => { resolve({ crests: { home: BALLY, away: GALB }, release: late }); await vi.advanceTimersByTimeAsync(0); });
    expect(late).toHaveBeenCalledTimes(1);
    expect(r.dashboard).toHaveBeenCalledTimes(1); // never redrawn with crests mid-session
  });

  it("closing the screen releases the decoded crests", async () => {
    const { load, release } = loader();
    const { unmount } = render(<MatchAnalysisPreview source={linkedSource()} onClose={() => {}} renderers={renderers()} loadCrests={load} />);
    await screen.findByAltText(/FT Dashboard/);
    unmount();
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("a result that arrives after the screen closed is released immediately", async () => {
    let resolve!: (v: LoadedMatchCrests) => void;
    const load = vi.fn(() => new Promise<LoadedMatchCrests>((res) => (resolve = res)));
    const { unmount } = render(<MatchAnalysisPreview source={linkedSource()} onClose={() => {}} renderers={renderers()} loadCrests={load} />);
    unmount();
    const release = vi.fn();
    await act(async () => resolve({ crests: { home: BALLY, away: GALB }, release }));
    expect(release).toHaveBeenCalledTimes(1);
  });
});

describe("each page gets the right club's crest", () => {
  it("Dashboard: both crests; Scoring and Turnovers: the selected team's crest; HT and FT alike", async () => {
    const r = renderers();
    const { load } = loader();
    render(<MatchAnalysisPreview source={linkedSource()} onClose={() => {}} renderers={r} loadCrests={load} />);
    await screen.findByAltText(/FT Dashboard/);
    expect(r.dashboard.mock.calls.at(-1)![2]).toEqual({ home: BALLY, away: GALB });

    await click(tab("Scoring"));
    await screen.findByAltText("Scoring Map, Ballylanders, Full-Time");
    expect(r.scoring.mock.calls.at(-1)![0].team.name).toBe("Ballylanders");
    expect(r.scoring.mock.calls.at(-1)![2]).toBe(BALLY);

    await click(inGroup("Team", "Galbally"));
    await screen.findByAltText("Scoring Map, Galbally, Full-Time");
    expect(r.scoring.mock.calls.at(-1)![2]).toBe(GALB);

    await click(tab("Turnovers"));
    await screen.findByAltText("Turnover Map, Galbally, Full-Time");
    expect(r.turnovers.mock.calls.at(-1)![2]).toBe(GALB);

    await click(inGroup("Half", "HT"));
    await screen.findByAltText("Turnover Map, Galbally, Half-Time");
    expect(r.turnovers.mock.calls.at(-1)![2]).toBe(GALB);

    await click(inGroup("Team", "Ballylanders"));
    await screen.findByAltText("Turnover Map, Ballylanders, Half-Time");
    expect(r.turnovers.mock.calls.at(-1)![2]).toBe(BALLY);
  });

  it("only one side linked: that side's crest, the other side's monogram", async () => {
    const r = renderers();
    const { load } = loader({ home: null, away: GALB });
    render(<MatchAnalysisPreview source={linkedSource("unknown-id", "t-galb")} onClose={() => {}} renderers={r} loadCrests={load} />);
    await screen.findByAltText(/FT Dashboard/);
    await click(tab("Scoring"));
    await screen.findByAltText("Scoring Map, Ballylanders, Full-Time");
    expect(r.scoring.mock.calls.at(-1)![2]).toBeNull();
  });

  it("job keys include the crest snapshot, so a different crest is never served from cache", () => {
    const src = linkedSource();
    const r = renderers();
    const none = analysisPageJob(src, "scoring", "FT", "FOR", r);
    const withCrest = analysisPageJob(src, "scoring", "FT", "FOR", r, { home: BALLY, away: GALB });
    const replaced = analysisPageJob(src, "scoring", "FT", "FOR", r, { home: { ...BALLY, key: "bally:2" }, away: GALB });
    expect(new Set([none.key, withCrest.key, replaced.key]).size).toBe(3);
  });
});

describe("rapid switching and exports", () => {
  it("rapid tab and team changes: the shown image is always the last request's, never a slower earlier one", async () => {
    const r = renderers();
    const pending: Array<() => void> = [];
    r.scoring.mockImplementation((v) => new Promise<File>((res) => pending.push(() => res(png(mapFilename(v, "scoring"))))));
    const { load } = loader();
    render(<MatchAnalysisPreview source={linkedSource()} onClose={() => {}} renderers={r} loadCrests={load} />);
    await screen.findByAltText(/FT Dashboard/);
    await click(tab("Scoring")); // Ballylanders (slow)
    await click(inGroup("Team", "Galbally")); // Galbally (slow)
    await click(tab("Turnovers"));
    await screen.findByAltText("Turnover Map, Galbally, Full-Time");
    await act(async () => { pending.forEach((p) => p()); });
    expect(screen.getByRole("img").getAttribute("alt")).toBe("Turnover Map, Galbally, Full-Time");
    expect(r.turnovers.mock.calls.at(-1)![2]).toBe(GALB);
  });

  it("the preview and the shared PNG are the same file, every time (repeated exports reuse it)", async () => {
    const r = renderers();
    const { load } = loader();
    render(<MatchAnalysisPreview source={linkedSource()} onClose={() => {}} renderers={r} loadCrests={load} />);
    await click(tab("Scoring"));
    await screen.findByAltText("Scoring Map, Ballylanders, Full-Time");
    for (let i = 0; i < 3; i++) {
      await click(screen.getByRole("button", { name: "Share or Save Image" }));
      const shown = urlFiles.get(screen.getByRole("img").getAttribute("src")!);
      expect(await shareInputs.at(-1)!.getBlob()).toBe(shown);
    }
    expect(r.scoring).toHaveBeenCalledTimes(1);
  });
});
