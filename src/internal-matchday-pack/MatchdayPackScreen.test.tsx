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
import { defaultMatchdayPack } from "./matchday-pack-form";

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

const toEdit = () => fireEvent.click(screen.getByRole("button", { name: /Edit details/ }));
const toCover = () => fireEvent.click(screen.getByRole("button", { name: "View cover" }));
const tab = (name: "Cover" | "Edit details") => screen.getByRole("tab", { name });
const hour = () => screen.getByLabelText("Throw-in hour") as HTMLSelectElement;
const minutes = () => screen.getByLabelText("Throw-in minutes") as HTMLSelectElement;
const period = (p: "AM" | "PM") => within(screen.getByRole("radiogroup", { name: "AM or PM" })).getByRole("radio", { name: p });
/** Lets the debounced save + render run, so "nothing happened" is a real observation. */
const settle = () => new Promise((r) => setTimeout(r, 700));

describe("Matchday Cover screen", () => {
  it("opens on the cover with sensible defaults; Save/Share enable once it's drawn", async () => {
    const { last } = setup();
    expect(tab("Cover").getAttribute("aria-selected")).toBe("true");
    const save = screen.getByRole("button", { name: "Save Image" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    await ready();
    expect(save.disabled).toBe(false);
    expect((screen.getByRole("button", { name: "Share" }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByRole("button", { name: /Edit details/ })).toBeTruthy();
    expect(screen.getByTestId("matchday-cover-canvas")).toBeTruthy();
    expect(last().pack.home.name).toBe("Ballylanders");
    expect(last().pack.away.name).toBe("Opposition");
    expect((last().assets.homeJersey?.source as unknown as { kitId: string }).kitId).toBe("preset:ballylanders-yellow");
    expect(last().assets.awayJersey).toBeNull();
  });

  it("feeds every fixture field into the cover and persists it locally", async () => {
    const { last } = setup();
    await ready();
    toEdit();
    fireEvent.change(field("Competition"), { target: { value: "Limerick Senior Football Championship" } });
    fireEvent.change(field("Round"), { target: { value: "Quarter-Final" } });
    fireEvent.change(field("Date"), { target: { value: "2026-10-25" } });
    fireEvent.change(hour(), { target: { value: "3" } });
    fireEvent.change(minutes(), { target: { value: "15" } });
    fireEvent.change(field("Venue"), { target: { value: "Castletown Ballyagran" } });
    fireEvent.change(field("Club name", 1), { target: { value: "Cnoc Áine" } });
    const expected = {
      competition: "Limerick Senior Football Championship",
      round: "Quarter-Final",
      date: "2026-10-25",
      throwIn: "15:15", // a fresh pick defaults to PM
      venue: "Castletown Ballyagran",
    };
    await waitFor(() => expect(loadMatchdayPack()?.fixture).toEqual(expected)); // saved while editing
    toCover();
    await waitFor(() => expect(last().pack.fixture).toEqual(expected));
    expect(last().pack.away).toMatchObject({ name: "Cnoc Áine", teamId: "team:cnoc-aine" });
  });

  it("restores saved details when reopened", async () => {
    setup();
    await ready();
    toEdit();
    fireEvent.change(field("Venue"), { target: { value: "Bruff" } });
    await waitFor(() => expect(loadMatchdayPack()?.fixture.venue).toBe("Bruff"));
    cleanup();
    setup();
    expect(field("Venue").value).toBe("Bruff");
  });

  it("doesn't save without both club names, and says why", async () => {
    setup();
    await ready();
    toEdit();
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
    toEdit();
    const names = (club: "Home" | "Away") => within(jerseyGroup(club)).getAllByRole("radio").map((r) => r.textContent);
    expect(names("Home")).toEqual(["Yellow", "Green", "White", "Green photo (image missing)", "Club colours"]);
    expect(names("Away")).toEqual(["Club colours"]);
    fireEvent.change(field("Club name", 1), { target: { value: "Galtee Rovers" } });
    await waitFor(() => expect(names("Away")).toEqual(["Galtee home", "Club colours"]));
    fireEvent.click(within(jerseyGroup("Home")).getByRole("radio", { name: /Green photo/ }));
    toCover();
    await waitFor(() => expect(last().pack.home.outfieldKitId).toBe("user:bl-green"));
    expect((last().assets.awayJersey?.source as unknown as { kitId: string }).kitId).toBe("user:galtee");
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
    toEdit();
    fireEvent.change(field("Venue"), { target: { value: "Bruff" } });
    await waitFor(() => expect(window.localStorage.getItem(MATCHDAY_PACK_STORAGE_KEY)).toContain("Bruff"));
    expect(window.localStorage.getItem(TEAM_SHEET_KEY)).toBe("sentinel");
  });
});

describe("Preview / Edit modes", () => {
  it("switches with the tabs, the Edit details button and the View cover button", async () => {
    setup();
    await ready();
    expect(screen.getByRole("tabpanel", { name: "Cover" }).hidden).toBe(false);
    expect(document.getElementById("mp-panel-edit")!.hidden).toBe(true);
    toEdit();
    expect(tab("Edit details").getAttribute("aria-selected")).toBe("true");
    expect(document.getElementById("mp-panel-preview")!.hidden).toBe(true);
    expect(screen.getByRole("button", { name: "View cover" })).toBeTruthy();
    toCover();
    expect(tab("Cover").getAttribute("aria-selected")).toBe("true");
    fireEvent.click(tab("Edit details"));
    expect(document.getElementById("mp-panel-edit")!.hidden).toBe(false);
    fireEvent.click(tab("Cover"));
    expect(document.getElementById("mp-panel-preview")!.hidden).toBe(false);
  });

  it("never redraws the cover just for switching modes", async () => {
    const { renderCover, loadJersey } = setup();
    await ready();
    await settle();
    const renders = renderCover.mock.calls.length;
    const jerseyLoads = loadJersey.mock.calls.length;
    for (let i = 0; i < 3; i++) {
      toEdit();
      toCover();
    }
    await settle();
    expect(renderCover.mock.calls.length).toBe(renders);
    expect(loadJersey.mock.calls.length).toBe(jerseyLoads);
    expect(screen.getByTestId("cover-status").getAttribute("data-phase")).toBe("ready");
  });

  it("doesn't draw while editing, then draws once on View cover", async () => {
    const { renderCover, last } = setup();
    await ready();
    await settle();
    const before = renderCover.mock.calls.length;
    toEdit();
    for (const v of ["K", "Ki", "Kil", "Kilmallock"]) fireEvent.change(field("Venue"), { target: { value: v } });
    await settle();
    expect(renderCover.mock.calls.length).toBe(before);
    toCover();
    await ready();
    await settle();
    expect(renderCover.mock.calls.length).toBe(before + 1);
    expect(last().pack.fixture.venue).toBe("Kilmallock");
  });

  it("keeps every edit and kit choice across mode switches", async () => {
    setup();
    await ready();
    toEdit();
    fireEvent.change(field("Venue"), { target: { value: "Bruff" } });
    fireEvent.click(within(jerseyGroup("Home")).getByRole("radio", { name: "Green" }));
    toCover();
    toEdit();
    expect(field("Venue").value).toBe("Bruff");
    expect(within(jerseyGroup("Home")).getByRole("radio", { name: "Green" }).getAttribute("aria-checked")).toBe("true");
  });
});

describe("Throw-in picker (12-hour with explicit AM/PM)", () => {
  async function editTime() {
    setup();
    await ready();
    toEdit();
  }
  const stored = () => loadMatchdayPack()?.fixture.throwIn;

  it("starts empty and leaves the time off the cover", async () => {
    await editTime();
    expect(hour().value).toBe("");
    expect(minutes().disabled).toBe(true);
    expect(period("PM").hasAttribute("disabled")).toBe(true);
    expect(screen.getByTestId("throwin-note").textContent).toBe("No throw-in time on the cover");
  });

  it("defaults a fresh pick to PM and shows exactly what the cover will say", async () => {
    await editTime();
    fireEvent.change(hour(), { target: { value: "3" } });
    fireEvent.change(minutes(), { target: { value: "15" } });
    expect(period("PM").getAttribute("aria-checked")).toBe("true");
    expect(screen.getByTestId("throwin-note").textContent).toBe("On the cover: 3.15PM");
    await waitFor(() => expect(stored()).toBe("15:15"));
  });

  it("flags a morning time clearly", async () => {
    await editTime();
    fireEvent.change(hour(), { target: { value: "3" } });
    fireEvent.click(period("AM"));
    expect(screen.getByTestId("throwin-note").textContent).toBe("On the cover: 3AM — a morning throw-in");
    await waitFor(() => expect(stored()).toBe("03:00"));
  });

  it.each([
    ["12", "AM", "00:00", "12AM"],
    ["12", "PM", "12:00", "12PM"],
    ["11", "AM", "11:00", "11AM"],
    ["1", "PM", "13:00", "1PM"],
    ["11", "PM", "23:00", "11PM"],
  ])("%s %s → stored %s, cover %s", async (h, p, hhmm, cover) => {
    await editTime();
    fireEvent.change(hour(), { target: { value: h } });
    fireEvent.click(period(p as "AM" | "PM"));
    expect(screen.getByTestId("throwin-note").textContent).toContain(`On the cover: ${cover}`);
    await waitFor(() => expect(stored()).toBe(hhmm));
  });

  it("clears the time when the hour is set back to --", async () => {
    await editTime();
    fireEvent.change(hour(), { target: { value: "2" } });
    await waitFor(() => expect(stored()).toBe("14:00"));
    fireEvent.change(hour(), { target: { value: "" } });
    await waitFor(() => expect(stored()).toBe(""));
  });

  it.each([
    ["03:15", "3", "15", "AM"],
    ["15:30", "3", "30", "PM"],
    ["00:05", "12", "5", "AM"],
    ["12:45", "12", "45", "PM"],
    ["19:07", "7", "7", "PM"], // off the 5-minute grid: kept, not rounded
  ])("loads a saved legacy %s unchanged", async (hhmm, h, m, p) => {
    const pack = { ...defaultMatchdayPack(), fixture: { ...defaultMatchdayPack().fixture, throwIn: hhmm } };
    window.localStorage.setItem(MATCHDAY_PACK_STORAGE_KEY, JSON.stringify(pack));
    const { last } = setup();
    await ready();
    expect(last().pack.fixture.throwIn).toBe(hhmm);
    toEdit();
    expect([hour().value, minutes().value]).toEqual([h, m]);
    expect(period(p as "AM" | "PM").getAttribute("aria-checked")).toBe("true");
    await settle();
    expect(stored()).toBe(hhmm); // opening the editor never rewrites it
  });
});

describe("Internal launcher", () => {
  it("links to the Matchday Cover screen", () => {
    render(<InternalLauncherPage />);
    expect(screen.getByText("Matchday Cover")).toBeTruthy();
  });
});
