// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import type { ReviewPdfExportInput } from "../../stats/reviewPdfExport";
import type { CrestArtwork, LoadedMatchCrests } from "./crest-artwork";
import { PDF_CREST_WAIT_MS, exportWithClubCrests } from "./pdf-crests";

const art = (key: string): CrestArtwork => ({ image: { width: 10, height: 10 } as unknown as CanvasImageSource, width: 10, height: 10, needsBacking: false, key });
const input: ReviewPdfExportInput = { events: [], homeTeamName: "Ballylanders", awayTeamName: "Galbally" };
const loaded = (home: CrestArtwork | null, away: CrestArtwork | null) => {
  const release = vi.fn();
  return { result: { crests: { home, away }, release } as LoadedMatchCrests, release };
};

afterEach(() => vi.useRealTimers());

describe("exportWithClubCrests", () => {
  it("no Saved Team ids (older matches, unlinked squads): the loader is never called and the export gets the input unchanged", async () => {
    const load = vi.fn();
    const exportPdf = vi.fn(async () => {});
    await exportWithClubCrests(input, { home: {}, away: { savedTeamId: "  " } }, exportPdf, load);
    expect(load).not.toHaveBeenCalled();
    expect(exportPdf).toHaveBeenCalledWith(input);
  });

  it("looks crests up by the squads' Saved Team ids — never by name — and passes them with names and colours", async () => {
    const { result, release } = loaded(art("t-bally:1"), art("t-galb:1"));
    const load = vi.fn(async () => result);
    const exportPdf = vi.fn(async () => {});
    await exportWithClubCrests(
      input,
      { home: { savedTeamId: "t-bally", primaryColour: "#16a34a" }, away: { savedTeamId: "t-galb", primaryColour: "#7c3aed", secondaryColour: "#fff" } },
      exportPdf,
      load,
    );
    expect(load).toHaveBeenCalledWith({ home: "t-bally", away: "t-galb" });
    const passed = (exportPdf.mock.calls[0] as unknown as [ReviewPdfExportInput])[0];
    expect(passed.scoreCrests).toMatchObject({
      home: { key: "t-bally:1" }, away: { key: "t-galb:1" }, homeName: "Ballylanders", awayName: "Galbally",
      homeColours: { primary: "#16a34a" }, awayColours: { primary: "#7c3aed", secondary: "#fff" },
    });
    expect({ ...passed, scoreCrests: undefined }).toEqual({ ...input, scoreCrests: undefined }); // nothing else changes
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("two clubs with the same name but different Saved Team ids are looked up separately by id", async () => {
    const { result } = loaded(art("id-1:1"), art("id-2:1"));
    const load = vi.fn(async () => result);
    await exportWithClubCrests({ ...input, homeTeamName: "St Mary's", awayTeamName: "St Mary's" },
      { home: { savedTeamId: "id-1" }, away: { savedTeamId: "id-2" } }, vi.fn(async () => {}), load);
    expect(load).toHaveBeenCalledWith({ home: "id-1", away: "id-2" });
  });

  it("only one side linked: only that id is requested", async () => {
    const { result } = loaded(null, art("t-galb:1"));
    const load = vi.fn(async () => result);
    const exportPdf = vi.fn(async () => {});
    await exportWithClubCrests(input, { home: undefined, away: { savedTeamId: "t-galb" } }, exportPdf, load);
    expect(load).toHaveBeenCalledWith({ home: undefined, away: "t-galb" });
    expect((exportPdf.mock.calls[0] as unknown as [ReviewPdfExportInput])[0].scoreCrests).toMatchObject({ home: null, away: { key: "t-galb:1" } });
  });

  it("unknown ids / no crests found (incl. storage unavailable, deleted crest): the export gets the input unchanged, resources released", async () => {
    const { result, release } = loaded(null, null);
    const exportPdf = vi.fn(async () => {});
    await exportWithClubCrests(input, { home: { savedTeamId: "a" }, away: { savedTeamId: "b" } }, exportPdf, async () => result);
    expect(exportPdf).toHaveBeenCalledWith(input);
    expect(release).toHaveBeenCalledTimes(1);
  });

  it("a loader that throws or rejects: the PDF is still exported, without crests", async () => {
    for (const load of [vi.fn(() => { throw new Error("boom"); }), vi.fn(async () => { throw new Error("IndexedDB unavailable"); })]) {
      const exportPdf = vi.fn(async () => {});
      await exportWithClubCrests(input, { home: { savedTeamId: "a" } }, exportPdf, load as never);
      expect(exportPdf).toHaveBeenCalledWith(input);
    }
  });

  it("a loader that never answers: exported without crests after the wait limit; a late result is released, never used", async () => {
    vi.useFakeTimers();
    let resolveLate!: (v: LoadedMatchCrests) => void;
    const load = vi.fn(() => new Promise<LoadedMatchCrests>((r) => (resolveLate = r)));
    const exportPdf = vi.fn(async () => {});
    const done = exportWithClubCrests(input, { home: { savedTeamId: "a" } }, exportPdf, load);
    await vi.advanceTimersByTimeAsync(PDF_CREST_WAIT_MS + 1);
    await done;
    expect(exportPdf).toHaveBeenCalledWith(input);
    const late = loaded(art("a:1"), null);
    resolveLate(late.result);
    await vi.advanceTimersByTimeAsync(0);
    expect(late.release).toHaveBeenCalledTimes(1);
    expect(exportPdf).toHaveBeenCalledTimes(1);
  });

  it("a failing export still releases the crests, and the export's error reaches the caller ('Export failed')", async () => {
    const { result, release } = loaded(art("a:1"), null);
    const exportPdf = vi.fn(async () => { throw new Error("pdf failed"); });
    await expect(exportWithClubCrests(input, { home: { savedTeamId: "a" } }, exportPdf, async () => result)).rejects.toThrow("pdf failed");
    expect(release).toHaveBeenCalledTimes(1);
  });
});
