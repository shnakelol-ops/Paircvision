import { describe, expect, it } from "vitest";
import type { CoverImage } from "./matchday-cover-assets";
import { COVER_SCENARIOS } from "./matchday-cover-fixtures";
import {
  COVER_HEIGHT,
  COVER_WIDTH,
  CREDIT_SIZE,
  DETAIL_LABEL_SIZE,
  SPONSOR_CAPTION_SIZE,
  MAX_JERSEY_HEIGHT,
  VENUE_MIN_SIZE,
  computeCoverLayout,
  coverDetailColumns,
  detailColumnWidths,
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

  it("draws a padded uploaded kit at the same apparent size as a tight preset", () => {
    // Preset: 300×356, jersey fills it. Upload: Kit Builder 600×738 frame with
    // the jersey (same 300×356 shape) centred in a transparent margin.
    const preset: CoverImage = { ...jersey("preset"), width: 300, height: 356, crop: { x: 0, y: 0, width: 300, height: 356 } };
    const upload: CoverImage = { ...jersey("upload"), width: 600, height: 738, crop: { x: 150, y: 191, width: 300, height: 356 } };
    const { images } = render(scenario("championship"), { homeJersey: preset, awayJersey: upload });
    const [home, away] = images;
    expect(away.crop).toEqual(upload.crop); // only the visible jersey is sampled
    expect(away.w).toBeCloseTo(home.w, 5);
    expect(away.h).toBeCloseTo(home.h, 5);
  });

  it("keeps a jersey's aspect ratio when containing it", () => {
    const wide: CoverImage = { ...jersey("wide"), width: 600, height: 738, crop: { x: 20, y: 300, width: 560, height: 200 } };
    const { images } = render(scenario("championship"), { homeJersey: wide, awayJersey: null });
    expect(images[0].w / images[0].h).toBeCloseTo(560 / 200, 5);
  });

  it("sets small print at phone-legible sizes", () => {
    expect(DETAIL_LABEL_SIZE).toBeGreaterThanOrEqual(24);
    expect(SPONSOR_CAPTION_SIZE).toBeGreaterThanOrEqual(22);
    expect(CREDIT_SIZE).toBeGreaterThanOrEqual(22);
    const { texts } = render(scenario("championship"));
    const smallest = Math.min(...texts.map((t) => t.size));
    expect(smallest).toBeGreaterThanOrEqual(22);
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

describe("venue fitting in the details panel", () => {
  const withVenue = (venue: string) => {
    const base = scenario("missing-kit");
    return { ...base, fixture: { ...base.fixture, venue } };
  };
  const venueLines = (venue: string) => {
    const { texts } = render(withVenue(venue));
    // The venue value is drawn in the right-hand column, below its label.
    return texts.filter((t) => t.text.length > 1 && t.x > 560 && t.y > 1150 && t.y < 1260);
  };

  it.each([
    "Bruff",
    "Castletown Ballyagran",
    "Kilmallock GAA Grounds",
    "TUS Gaelic Grounds, Limerick",
    "Páirc Uí Chaoimh, Baile an Chollaigh, Corcaigh",
    "Páirc Mhic Diarmada, Cora Droma Rúisc, Co. Liatroma",
    "Ballinagarde Ballinvreena Kilteely Dromkeen Hospital Herbertstown Memorial Park",
  ])("%s stays inside its column at a readable size", (venue) => {
    const lines = venueLines(venue);
    expect(lines.length).toBeGreaterThan(0);
    expect(lines.length).toBeLessThanOrEqual(2);
    for (const l of lines) {
      expect(l.size).toBeGreaterThanOrEqual(VENUE_MIN_SIZE);
      expect(l.left).toBeGreaterThan(560);
      expect(l.right).toBeLessThanOrEqual(COVER_WIDTH - 56);
    }
    if (lines.length === 2) expect(lines[1].y - lines[0].y).toBeGreaterThanOrEqual(lines[0].size * 0.99); // roomy line gap
  });

  it("keeps the DATE / THROW-IN / VENUE order and drops the venue column when empty", () => {
    expect(coverDetailColumns(withVenue("Bruff")).map((c) => c.label)).toEqual(["Date", "Throw-in", "Venue"]);
    expect(coverDetailColumns(withVenue("")).map((c) => c.label)).toEqual(["Date", "Throw-in"]);
  });

  it("gives the venue the width DATE and THROW-IN don't need", () => {
    const cols = coverDetailColumns(withVenue("Castletown Ballyagran"));
    const widths = detailColumnWidths(cols, 968, (c) => (c.label === "Venue" ? 0 : 150));
    expect(widths.slice(0, 2)).toEqual([210, 210]);
    expect(widths[2]).toBe(968 - 420);
    expect(widths.reduce((a, b) => a + b)).toBeCloseTo(968, 6);
  });

  it("never squeezes the venue below 45% of the panel", () => {
    const cols = coverDetailColumns(withVenue("X"));
    const widths = detailColumnWidths(cols, 1000, () => 400);
    expect(widths[2]).toBeCloseTo(450, 6);
  });

  it("keeps the original proportions when there is no venue", () => {
    const cols = coverDetailColumns(withVenue(""));
    expect(detailColumnWidths(cols, 900, () => 1)).toEqual([500, 400]);
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
