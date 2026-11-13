// @vitest-environment jsdom
// Jersey Designer V2 — the shared jersey renderer, rendered for real.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { ProTaggerJersey } from "./ProTaggerJersey";
import { ProTaggerMiniJersey } from "./ProTaggerMiniJersey";
import { ProTaggerLineupJerseyTile } from "./ProTaggerLineupJerseyTile";
import { ProTaggerLineupFormation } from "./ProTaggerLineupFormation";
import { JERSEY_PATTERNS, type JerseyKit, type JerseyTrim } from "./jersey-kit";
import { JERSEY_PATTERN_PATHS } from "./ProTaggerJersey";
import type { ProTaggerSquadPlayer } from "./pro-tagger-session";

afterEach(cleanup);

const PRIMARY = "#15803d";
const SECONDARY = "#ffffff";

function layers(svg: Element, name: string): Element[] {
  return [...svg.querySelectorAll(`[data-layer="${name}"]`)];
}

describe("ProTaggerJersey — every pattern × sleeves × collar combination", () => {
  const trims: JerseyTrim[] = ["primary", "secondary"];
  const combos: JerseyKit[] = JERSEY_PATTERNS.flatMap((pattern) =>
    trims.flatMap((sleeves) => trims.map((collar) => ({ pattern, sleeves, collar }))),
  );

  it("covers all 24 combinations (6 patterns × 2 sleeves × 2 collars)", () => {
    expect(combos).toHaveLength(24);
  });

  it.each(combos)("%o renders with the right fills", (kit) => {
    const { container } = render(<ProTaggerJersey primary={PRIMARY} secondary={SECONDARY} kit={kit} size={26} />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("data-jersey-pattern")).toBe(kit.pattern);
    expect(layers(svg, "body")[0].getAttribute("fill")).toBe(PRIMARY);

    const pattern = layers(svg, "pattern");
    if (kit.pattern === "plain") expect(pattern).toHaveLength(0);
    else expect(pattern.map((p) => p.getAttribute("fill"))).toEqual([SECONDARY]);

    const sleeveFill = kit.sleeves === "secondary" ? SECONDARY : PRIMARY;
    expect(layers(svg, "sleeve").map((p) => p.getAttribute("fill"))).toEqual([sleeveFill, sleeveFill]);

    const trimFill = kit.collar === "secondary" ? SECONDARY : PRIMARY;
    expect(layers(svg, "collar").map((p) => p.getAttribute("fill"))).toEqual([trimFill]);
    expect(layers(svg, "cuff").map((p) => p.getAttribute("fill"))).toEqual([trimFill, trimFill]);
  });
});

describe("ProTaggerJersey — defaults and size", () => {
  it.each([undefined, null, { pattern: "bogus" } as unknown as JerseyKit])("kit %s renders the default (plain, secondary sleeves and collar)", (kit) => {
    const { container } = render(<ProTaggerJersey primary={PRIMARY} secondary={SECONDARY} kit={kit} size={26} />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("data-jersey-pattern")).toBe("plain");
    expect(svg.getAttribute("data-jersey-sleeves")).toBe("secondary");
    expect(svg.getAttribute("data-jersey-collar")).toBe("secondary");
  });

  it.each([[26, 29], [22, 24], [18, 20], [32, 35]])("size %i renders %ipx tall — the same outer size as the previous 20x22 jersey", (size, height) => {
    const { container } = render(<ProTaggerJersey primary={PRIMARY} secondary={SECONDARY} size={size} />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("width")).toBe(String(size));
    expect(svg.getAttribute("height")).toBe(String(height));
    expect(Math.round((size * 22) / 20)).toBe(height);
  });
});

describe("ProTaggerJersey — unique internal SVG ids", () => {
  it("40 jerseys on one screen each own a distinct clipPath and gradient, and reference only their own", () => {
    const { container } = render(
      <div>
        {Array.from({ length: 40 }, (_, i) => (
          <ProTaggerJersey key={i} primary={PRIMARY} secondary={SECONDARY} kit={{ pattern: "hoop", sleeves: "primary", collar: "secondary" }} size={26} />
        ))}
      </div>,
    );
    const svgs = [...container.querySelectorAll("svg")];
    expect(svgs).toHaveLength(40);
    const ids = [...container.querySelectorAll("[id]")].map((el) => el.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(80); // one clipPath + one gradient per jersey

    for (const svg of svgs) {
      const clipId = svg.querySelector("clipPath")!.id;
      const gradId = svg.querySelector("linearGradient")!.id;
      expect(clipId).toMatch(/^[a-zA-Z0-9_-]+$/); // safe inside url(#…)
      expect(svg.querySelector("g")!.getAttribute("clip-path")).toBe(`url(#${clipId})`);
      expect(layers(svg, "shade")[0].getAttribute("fill")).toBe(`url(#${gradId})`);
    }
  });
});

describe("ProTaggerMiniJersey — header icon uses the same renderer and kit", () => {
  it("draws the shared jersey with the given kit at its size", () => {
    const { container } = render(<ProTaggerMiniJersey primary={PRIMARY} secondary={SECONDARY} kit={{ pattern: "stripes", sleeves: "primary", collar: "primary" }} size={18} />);
    const svg = container.querySelector("svg")!;
    expect(svg.getAttribute("width")).toBe("18");
    expect(svg.getAttribute("data-jersey-pattern")).toBe("stripes");
  });
});

const player = (number: number, name = ""): ProTaggerSquadPlayer => ({ id: `p${number}`, number, name });

describe("Six patterns stay distinguishable", () => {
  it("every pattern has its own geometry; only Plain has none", () => {
    const paths = JERSEY_PATTERNS.map((p) => JERSEY_PATTERN_PATHS[p]);
    expect(paths.filter((d) => d === null)).toHaveLength(1);
    const drawn = paths.filter((d): d is string => d !== null);
    expect(new Set(drawn).size).toBe(drawn.length);
  });

  it("Hoop is one narrow band, Chest Band one broad band, Hoops four bands", () => {
    const bands = (d: string) => [...d.matchAll(/M0,([\d.]+) H40 V([\d.]+)/g)].map((m) => Number(m[2]) - Number(m[1]));
    const hoop = bands(JERSEY_PATTERN_PATHS.hoop!);
    const chestBand = bands(JERSEY_PATTERN_PATHS.chestBand!);
    const hoops = bands(JERSEY_PATTERN_PATHS.hoops!);
    expect(hoop).toHaveLength(1);
    expect(chestBand).toHaveLength(1);
    expect(hoops).toHaveLength(4);
    // A broad panel at least twice the single hoop's depth.
    expect(chestBand[0]).toBeGreaterThanOrEqual(hoop[0] * 2);
    // Each hoop at least 2px deep on the 22px subs jersey (44-unit viewBox).
    for (const h of hoops) expect((h * 24) / 44).toBeGreaterThanOrEqual(2);
  });
});


describe("ProTaggerLineupJerseyTile — number below the jersey", () => {
  function parts(container: HTMLElement) {
    const tile = container.firstElementChild as HTMLElement;
    const [jerseyWrap, numberEl, nameEl] = [...tile.children] as HTMLElement[];
    return { tile, jerseyWrap, numberEl, nameEl };
  }

  it.each(["#16a34a", "#facc15", "#ffffff", "#111827"])("on a %s kit: the number is centred below the shirt, not on it", (primary) => {
    const { container } = render(<ProTaggerLineupJerseyTile player={player(7, "Seán")} primary={primary} secondary="#166534" size={26} numberFontSize={13} />);
    const { jerseyWrap, numberEl, nameEl } = parts(container);
    expect(jerseyWrap.querySelector("svg")).not.toBeNull();
    expect(jerseyWrap.textContent).toBe(""); // nothing printed on the shirt
    expect(numberEl.textContent).toBe("7");
    expect(numberEl.style.position).toBe(""); // in flow below the jersey, not overlaid
    expect(numberEl.style.textAlign).toBe("center");
    expect(nameEl.textContent).toBe("Seán");
  });

  it("one readable treatment on every kit: bold white with a subtle dark outline, no badge", () => {
    for (const primary of ["#16a34a", "#facc15", "#ffffff"]) {
      const { container, unmount } = render(<ProTaggerLineupJerseyTile player={player(11)} primary={primary} secondary="#000000" size={26} numberFontSize={14} />);
      const { numberEl } = parts(container);
      expect(numberEl.style.color).toBe("rgb(255, 255, 255)");
      expect(numberEl.style.fontWeight).toBe("900");
      expect(numberEl.style.fontSize).toBe("14px");
      expect(numberEl.style.getPropertyValue("-webkit-text-stroke")).toBe("0.5px rgba(6, 10, 16, 0.85)");
      expect(numberEl.style.background).toBe("");
      expect(numberEl.style.borderRadius).toBe("");
      unmount();
    }
  });

  it("an empty formation slot shows a ghost jersey with no number", () => {
    const { container } = render(<ProTaggerLineupJerseyTile player={null} primary="#16a34a" secondary="#ffffff" size={26} />);
    expect(container.textContent).toBe("");
  });
});

describe("ProTaggerLineupFormation — kit reaches starters, subs, empty slots and the goalkeeper", () => {
  it("every jersey on the team sheet uses the kit; #1 is drawn like every outfield player", () => {
    const players = Array.from({ length: 18 }, (_, i) => player(i + 1));
    const kit: JerseyKit = { pattern: "chestV", sleeves: "primary", collar: "secondary" };
    const { container } = render(<ProTaggerLineupFormation players={players} primary={PRIMARY} secondary={SECONDARY} kit={kit} />);
    const svgs = [...container.querySelectorAll("svg[data-jersey-pattern]")];
    expect(svgs).toHaveLength(18); // 15 starters + 3 subs
    for (const svg of svgs) {
      expect(svg.getAttribute("data-jersey-pattern")).toBe("chestV");
      expect(svg.getAttribute("data-jersey-sleeves")).toBe("primary");
    }
  });

  it("empty formation slots render dimmed ghost jerseys without a number", () => {
    const { container } = render(<ProTaggerLineupFormation players={[player(1)]} primary={PRIMARY} secondary={SECONDARY} />);
    const svgs = [...container.querySelectorAll("svg[data-jersey-pattern]")];
    expect(svgs).toHaveLength(15);
    const ghostBodies = svgs.slice(1).map((s) => s.querySelector('[data-layer="body"]')!.getAttribute("fill"));
    expect(new Set(ghostBodies)).toEqual(new Set(["#17324a"]));
  });
});
