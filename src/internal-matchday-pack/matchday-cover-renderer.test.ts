import { describe, expect, it } from "vitest";
import type { CoverImage } from "./matchday-cover-assets";
import { COVER_SCENARIOS } from "./matchday-cover-fixtures";
import {
  COVER_HEIGHT,
  COVER_WIDTH,
  MAX_JERSEY_HEIGHT,
  computeCoverLayout,
  coverDetailColumns,
  glowColour,
  planHeader,
  renderMatchdayCover,
} from "./matchday-cover-renderer";
import { createRecordingContext } from "./matchday-cover-test-canvas";
import type { MatchdayPackV1 } from "./matchday-pack-types";

const scenario = (key: string) => COVER_SCENARIOS.find((s) => s.key === key)!.pack;
const jersey = (tag: string): CoverImage => ({ source: { tag } as unknown as CanvasImageSource, width: 300, height: 369 });

function render(pack: MatchdayPackV1, assets = { homeJersey: null as CoverImage | null, awayJersey: null as CoverImage | null }) {
  const rec = createRecordingContext();
  renderMatchdayCover(rec.ctx, pack, assets);
  return rec;
}

describe("renderMatchdayCover", () => {
  it.each(COVER_SCENARIOS.map((s) => [s.key, s.pack] as const))("keeps every line of text inside the 1080×1350 frame (%s)", (_key, pack) => {
    const { texts } = render(pack);
    expect(texts.length).toBeGreaterThan(0);
    for (const t of texts) {
      expect(t.left).toBeGreaterThanOrEqual(0);
      expect(t.right).toBeLessThanOrEqual(COVER_WIDTH);
      expect(t.y).toBeGreaterThan(0);
      expect(t.y).toBeLessThanOrEqual(COVER_HEIGHT);
    }
  });

  it("sets both club names, the round headline and the competition", () => {
    const words = render(scenario("championship")).joinedText();
    expect(words).toContain("BALLYLANDERS");
    expect(words).toContain("GALTEE ROVERS");
    expect(words).toContain("QUARTER-FINAL");
    expect(words).toContain("LIMERICK SENIOR FOOTBALL CHAMPIONSHIP");
  });

  it("names the fixture details with GAA formatting", () => {
    const words = render(scenario("championship")).joinedText();
    expect(words).toEqual(expect.arrayContaining(["DATE", "SUN 25 OCT", "THROW-IN", "3.30PM", "VENUE"]));
    // The venue may wrap onto two lines depending on font metrics.
    expect(words.join(" ")).toContain("KILMALLOCK GAA GROUNDS");
  });

  it("preserves fadas in upper case", () => {
    const words = render(scenario("long-names")).joinedText().join(" ");
    expect(words).toContain("NAOMH MEARNÓG");
    expect(words).toContain("Ó SÚILLEABHÁIN");
    expect(words).toContain("CIARÁIN");
    expect(words).toContain("RÁTH DUBH");
  });

  it("draws the supplied jersey images, one per side", () => {
    const home = jersey("home");
    const away = jersey("away");
    const { images } = render(scenario("championship"), { homeJersey: home, awayJersey: away });
    expect(images.map((i) => i.source)).toEqual([home.source, away.source]);
  });

  it("draws no image at all for a side without one (club-colour jersey instead)", () => {
    const home = jersey("home");
    const { images } = render(scenario("missing-kit"), { homeJersey: home, awayJersey: null });
    expect(images.map((i) => i.source)).toEqual([home.source]);
  });

  it("sets sponsor names in type when no logo is available", () => {
    const words = render(scenario("championship")).joinedText();
    expect(words).toEqual(expect.arrayContaining(["PROUDLY SUPPORTED BY", "HANLEY'S HARDWARE", "RYAN'S FOODSTORE"]));
  });

  it("draws a sponsor's logo instead of its name when one is supplied", () => {
    const logo = jersey("logo");
    const rec = createRecordingContext();
    renderMatchdayCover(rec.ctx, scenario("championship"), {
      homeJersey: null,
      awayJersey: null,
      sponsorLogos: { "sponsor:hanleys": logo },
    });
    expect(rec.images.map((i) => i.source)).toEqual([logo.source]);
    expect(rec.joinedText()).not.toContain("HANLEY'S HARDWARE");
    expect(rec.joinedText()).toContain("RYAN'S FOODSTORE");
  });

  it("omits the sponsor band and details panel cleanly when they are empty", () => {
    const words = render(scenario("minimal")).joinedText();
    expect(words).not.toContain("PROUDLY SUPPORTED BY");
    expect(words).not.toContain("DATE");
    expect(words).not.toContain("VENUE");
    expect(words).toContain("CHALLENGE MATCH");
    expect(words).toContain("MADE WITH PÁIRCVISION");
  });

  it("falls back to a MATCHDAY headline when even the competition is blank", () => {
    const pack = { ...scenario("minimal"), fixture: { competition: "", round: "", venue: "", date: "", throwIn: "" } };
    expect(render(pack).joinedText()).toContain("MATCHDAY");
  });

  it("shows only the detail columns that have data", () => {
    const base = scenario("championship");
    expect(coverDetailColumns({ ...base, fixture: { ...base.fixture, date: "", throwIn: "" } }).map((c) => c.label)).toEqual(["Venue"]);
    expect(coverDetailColumns({ ...base, fixture: { ...base.fixture, venue: "" } }).map((c) => c.label)).toEqual(["Date", "Throw-in"]);
  });
});

describe("computeCoverLayout", () => {
  const combos = [true, false].flatMap((hasSponsors) =>
    [true, false].flatMap((hasDetails) => [150, 230, 300].map((headerBottom) => ({ hasSponsors, hasDetails, headerBottom }))),
  );

  it.each(combos)("stacks header → jerseys → names → details → sponsors without overlap (%o)", (input) => {
    const l = computeCoverLayout(input);
    expect(l.jerseyTop).toBeGreaterThan(input.headerBottom);
    expect(l.jerseyHeight).toBeLessThanOrEqual(MAX_JERSEY_HEIGHT);
    expect(l.jerseyTop + l.jerseyHeight).toBeLessThan(l.nameTop);
    if (input.hasDetails) expect(l.nameTop + l.nameHeight).toBeLessThan(l.panelTop);
    expect(l.panelTop + (input.hasDetails ? l.panelHeight : 0)).toBeLessThanOrEqual(l.sponsorTop);
    expect(l.sponsorTop).toBe(input.hasSponsors ? 1168 : COVER_HEIGHT);
  });

  it("gives the jerseys more room when there are no sponsors", () => {
    const withSponsors = computeCoverLayout({ hasSponsors: true, hasDetails: true, headerBottom: 230 });
    const without = computeCoverLayout({ hasSponsors: false, hasDetails: true, headerBottom: 230 });
    expect(without.jerseyHeight).toBeGreaterThan(withSponsors.jerseyHeight);
  });

  it("pushes the jerseys below a two-line competition header", () => {
    const rec = createRecordingContext();
    const plan = planHeader(rec.ctx, scenario("long-names"));
    expect(plan.eyebrow?.lines.length).toBe(2);
    const layout = computeCoverLayout({ hasSponsors: true, hasDetails: true, headerBottom: plan.bottom });
    expect(layout.jerseyTop).toBeGreaterThan(plan.bottom);
  });
});

describe("glowColour", () => {
  it("uses the secondary colour when the primary is near-black", () => {
    expect(glowColour({ primary: "#111111", secondary: "#f59e0b" })).toBe("#f59e0b");
  });
  it("mutes a white primary so it doesn't flood the poster", () => {
    expect(glowColour({ primary: "#ffffff", secondary: "#1d4ed8" })).toBe("#cbd5e1");
  });
  it("uses the primary otherwise", () => {
    expect(glowColour({ primary: "#7a1f2b", secondary: "#ffffff" })).toBe("#7a1f2b");
  });
});
