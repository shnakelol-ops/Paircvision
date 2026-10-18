// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

vi.mock("../features/shared/imageShare", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../features/shared/imageShare")>();
  return { ...actual, saveImageFile: vi.fn(async () => ({ status: "saved" as const })) };
});

import { saveImageFile } from "../features/shared/imageShare";
import { TEAM_SHEET_KITS_STORAGE_KEY, createMemoryKitImageBackend } from "../internal-team-sheet/team-sheet-kit-store";
import InternalLauncherPage from "../pages/InternalLauncherPage";
import MatchdayPackScreen, { type RenderedCover } from "./MatchdayPackScreen";
import type { CoverImage, CoverJerseySource } from "./matchday-cover-assets";
import type { CoverAssets } from "./matchday-cover-renderer";
import { MATCHDAY_PACK_STORAGE_KEY, loadMatchdayPack } from "./matchday-pack-storage";
import type { MatchdayPackV1 } from "./matchday-pack-types";

const TEAM_SHEET_KEY = "paircvision_internal_team_sheet_v1";

function setup() {
  const renders: { pack: MatchdayPackV1; assets: CoverAssets }[] = [];
  const renderCover = vi.fn(async (pack: MatchdayPackV1, assets: CoverAssets): Promise<RenderedCover> => {
    renders.push({ pack, assets });
    return { canvas: document.createElement("canvas"), blob: new Blob(["png"], { type: "image/png" }) };
  });
  const loadJersey = vi.fn(async (source: CoverJerseySource): Promise<CoverImage | null> =>
    source.kind === "none" ? null : ({ source: { kitId: source.kitId } as unknown as CanvasImageSource, width: 600, height: 738 }),
  );
  const backend = createMemoryKitImageBackend();
  render(<MatchdayPackScreen renderCover={renderCover} loadJersey={loadJersey} kitImageBackend={backend} />);
  return { renders, renderCover, loadJersey, last: () => renders[renders.length - 1] };
}

const ready = () => waitFor(() => expect(screen.getByTestId("cover-status").getAttribute("data-phase")).toBe("ready"));
const field = (label: string, index = 0) => screen.getAllByLabelText(label)[index] as HTMLInputElement;
const jerseyGroup = (club: "Home" | "Away") => screen.getByRole("radiogroup", { name: `${club} club jersey` });

beforeEach(() => {
  window.localStorage.clear();
  URL.createObjectURL = vi.fn(() => "blob:test");
  URL.revokeObjectURL = vi.fn();
  vi.mocked(saveImageFile).mockClear();
});
afterEach(() => cleanup());

describe("Matchday Cover screen", () => {
  it("renders the real cover component with sensible defaults and enables Save/Share once ready", async () => {
    const { last } = setup();
    const save = screen.getByRole("button", { name: "Save Image" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    await ready();
    expect(save.disabled).toBe(false);
    expect((screen.getByRole("button", { name: "Share" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByTestId("matchday-cover-canvas")).toBeTruthy();
    expect(last().pack.home.name).toBe("Ballylanders");
    expect(last().pack.away.name).toBe("Opposition");
    // Ballylanders' yellow preset is resolved and passed to the renderer.
    expect((last().assets.homeJersey?.source as unknown as { kitId: string }).kitId).toBe("preset:ballylanders-yellow");
    expect(last().assets.awayJersey).toBeNull();
  });

  it("feeds every fixture field into the cover and persists it locally", async () => {
    const { last } = setup();
    await ready();
    fireEvent.change(field("Competition"), { target: { value: "Limerick Senior Football Championship" } });
    fireEvent.change(field("Round"), { target: { value: "Quarter-Final" } });
    fireEvent.change(field("Date"), { target: { value: "2026-10-25" } });
    fireEvent.change(field("Throw-in"), { target: { value: "15:30" } });
    fireEvent.change(field("Venue"), { target: { value: "Kilmallock" } });
    fireEvent.change(field("Club name", 1), { target: { value: "Cnoc Áine" } });
    const expected = {
      competition: "Limerick Senior Football Championship",
      round: "Quarter-Final",
      date: "2026-10-25",
      throwIn: "15:30",
      venue: "Kilmallock",
    };
    await waitFor(() => expect(last().pack.fixture).toEqual(expected));
    expect(last().pack.away).toMatchObject({ name: "Cnoc Áine", teamId: "team:cnoc-aine" });
    await waitFor(() => expect(loadMatchdayPack()?.fixture).toEqual(expected));
    expect(loadMatchdayPack()?.away.name).toBe("Cnoc Áine");
  });

  it("restores saved details when reopened", async () => {
    setup();
    await ready();
    fireEvent.change(field("Venue"), { target: { value: "Bruff" } });
    await waitFor(() => expect(loadMatchdayPack()?.fixture.venue).toBe("Bruff"));
    cleanup();
    setup();
    expect(field("Venue").value).toBe("Bruff");
  });

  it("doesn't save without both club names, and says why", async () => {
    setup();
    await ready();
    fireEvent.change(field("Venue"), { target: { value: "Bruff" } });
    await waitFor(() => expect(loadMatchdayPack()?.fixture.venue).toBe("Bruff"));
    fireEvent.change(field("Club name", 1), { target: { value: "" } });
    fireEvent.change(field("Venue"), { target: { value: "Elsewhere" } });
    expect(await screen.findByRole("alert")).toHaveProperty("textContent", "Enter both club names to save these details.");
    expect(loadMatchdayPack()?.fixture.venue).toBe("Bruff");
  });

  it("offers each club only its own jerseys, including Kit Builder uploads", async () => {
    window.localStorage.setItem(
      TEAM_SHEET_KITS_STORAGE_KEY,
      JSON.stringify([
        { id: "user:bl-green", teamId: "ballylanders", name: "Green photo", role: "outfield", createdAt: 1 },
        { id: "user:galtee", teamId: "team:galtee-rovers", name: "Galtee home", role: "outfield", createdAt: 2 },
        { id: "user:galtee-gk", teamId: "team:galtee-rovers", name: "Galtee GK", role: "gk", createdAt: 3 },
      ]),
    );
    const { last } = setup();
    await ready();
    const names = (club: "Home" | "Away") => within(jerseyGroup(club)).getAllByRole("radio").map((r) => r.textContent);
    expect(names("Home")).toEqual(["Yellow", "Green", "White", "Green photo (image missing)", "Club colours"]);
    expect(names("Away")).toEqual(["Club colours"]); // no Ballylanders kit offered to the opposition

    fireEvent.change(field("Club name", 1), { target: { value: "Galtee Rovers" } });
    await waitFor(() => expect(names("Away")).toEqual(["Galtee home", "Club colours"]));
    await waitFor(() => expect((last().assets.awayJersey?.source as unknown as { kitId: string })?.kitId).toBe("user:galtee"));

    fireEvent.click(within(jerseyGroup("Home")).getByRole("radio", { name: /Green photo/ }));
    await waitFor(() => expect(last().pack.home.outfieldKitId).toBe("user:bl-green"));
    fireEvent.click(within(jerseyGroup("Home")).getByRole("radio", { name: "Club colours" }));
    await waitFor(() => expect(last().assets.homeJersey).toBeNull());
  });

  it("saves the rendered PNG through the shared Save Image helper", async () => {
    setup();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Save Image" }));
    await waitFor(() => expect(saveImageFile).toHaveBeenCalledTimes(1));
    const file = vi.mocked(saveImageFile).mock.calls[0][0];
    expect(file.name).toBe("matchday-ballylanders-v-opposition.png");
    expect(file.type).toBe("image/png");
    expect(await screen.findByText("Image saved.")).toBeTruthy();
  });

  it("opens the shared Share sheet", async () => {
    setup();
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    expect(await screen.findByText("Share matchday cover")).toBeTruthy();
  });

  it("never writes Team Sheet data", async () => {
    window.localStorage.setItem(TEAM_SHEET_KEY, "sentinel");
    setup();
    await ready();
    fireEvent.change(field("Venue"), { target: { value: "Bruff" } });
    await waitFor(() => expect(window.localStorage.getItem(MATCHDAY_PACK_STORAGE_KEY)).toContain("Bruff"));
    expect(window.localStorage.getItem(TEAM_SHEET_KEY)).toBe("sentinel");
  });
});

describe("Internal launcher", () => {
  it("links to the Matchday Cover screen", () => {
    render(<InternalLauncherPage />);
    expect(screen.getByText("Matchday Cover")).toBeTruthy();
  });
});
