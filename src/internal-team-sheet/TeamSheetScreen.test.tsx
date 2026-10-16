// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import TeamSheetScreen from "./TeamSheetScreen";
import { PRESET_KITS } from "./team-sheet-kits";
import { loadTeamSheet } from "./team-sheet-storage";
import { TEAM_SHEET_KITS_STORAGE_KEY, createMemoryKitImageBackend, loadUserKitRecords } from "./team-sheet-kit-store";
import type { KitImageCodec } from "./kit-image-codec";
import type { PixelImage } from "./kit-image-processing";

const KEY = "paircvision_internal_team_sheet_v1";
const GK_SRC = "/internal/ballylanders-gk-jersey.webp";
const srcOf = (name: string) => PRESET_KITS.find((k) => k.role === "outfield" && k.name === name)!.src!;

function pitchJerseySrcs(): string[] {
  return screen.getAllByAltText(/^#\d+ jersey$/).map((img) => img.getAttribute("src") ?? "");
}
const outfieldPicker = () => screen.getByRole("radiogroup", { name: "Outfield jersey" });
const gkPicker = () => screen.getByRole("radiogroup", { name: "Goalkeeper jersey" });

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
});

describe("Team Sheet kit selection", () => {
  it("renders the team name and the yellow/black defaults", () => {
    render(<TeamSheetScreen />);
    expect(screen.getByText("Ballylanders")).toBeTruthy();
    expect(within(outfieldPicker()).getAllByRole("radio").map((o) => o.textContent)).toEqual(["Yellow", "Green", "White"]);
    expect(within(outfieldPicker()).getByRole("radio", { name: "Yellow" }).getAttribute("aria-checked")).toBe("true");
    expect(within(gkPicker()).getAllByRole("radio").map((o) => o.textContent)).toEqual(["Black"]);
    expect(within(gkPicker()).getByRole("radio", { name: "Black" }).getAttribute("aria-checked")).toBe("true");
    const srcs = pitchJerseySrcs();
    expect(srcs.filter((s) => s === GK_SRC)).toHaveLength(1);
    expect(srcs.filter((s) => s === srcOf("Yellow"))).toHaveLength(14);
  });

  it("switches all 14 outfield players at once and leaves the GK kit alone", () => {
    render(<TeamSheetScreen />);
    for (const name of ["Green", "White", "Yellow"]) {
      fireEvent.click(within(outfieldPicker()).getByRole("radio", { name }));
      const srcs = pitchJerseySrcs();
      expect(srcs).toHaveLength(15);
      expect(srcs.filter((s) => s === GK_SRC)).toHaveLength(1);
      expect(srcs.filter((s) => s === srcOf(name))).toHaveLength(14);
    }
  });

  it("applies the selected kits to substitutes (#1 sub gets the GK kit)", () => {
    render(<TeamSheetScreen />);
    fireEvent.click(within(outfieldPicker()).getByRole("radio", { name: "White" }));
    fireEvent.click(screen.getByText("+ Add Subs"));
    expect(pitchJerseySrcs().filter((s) => s === srcOf("White"))).toHaveLength(15);
    fireEvent.change(screen.getByDisplayValue("16"), { target: { value: "1" } });
    expect(pitchJerseySrcs().filter((s) => s === GK_SRC)).toHaveLength(2);
  });

  it("hides both pickers in Screenshot Mode but keeps the chosen kits", () => {
    render(<TeamSheetScreen />);
    fireEvent.click(within(outfieldPicker()).getByRole("radio", { name: "Green" }));
    fireEvent.click(screen.getByText("Screenshot Mode"));
    expect(screen.queryAllByRole("radiogroup")).toHaveLength(0);
    expect(pitchJerseySrcs().filter((s) => s === srcOf("Green"))).toHaveLength(14);
    expect(pitchJerseySrcs().filter((s) => s === GK_SRC)).toHaveLength(1);
  });

  it("persists kit ids and team identity so reopening restores them", () => {
    const first = render(<TeamSheetScreen />);
    fireEvent.click(within(outfieldPicker()).getByRole("radio", { name: "White" }));
    expect(loadTeamSheet().kits).toEqual({ outfieldKitId: "preset:ballylanders-white", gkKitId: "preset:ballylanders-gk-black" });
    expect(loadTeamSheet().team).toEqual({ id: "ballylanders", name: "Ballylanders" });
    first.unmount();

    render(<TeamSheetScreen />);
    expect(within(outfieldPicker()).getByRole("radio", { name: "White" }).getAttribute("aria-checked")).toBe("true");
    expect(pitchJerseySrcs().filter((s) => s === srcOf("White"))).toHaveLength(14);
  });

  it("opens a sheet saved by the previous jersey selector with the same jersey", () => {
    const players = loadTeamSheet().players;
    window.localStorage.setItem(KEY, JSON.stringify({ players, substitutes: [], outfieldJersey: "green" }));
    render(<TeamSheetScreen />);
    expect(within(outfieldPicker()).getByRole("radio", { name: "Green" }).getAttribute("aria-checked")).toBe("true");
    expect(pitchJerseySrcs().filter((s) => s === srcOf("Green"))).toHaveLength(14);
  });

  it("falls back to the default presets when a selected user kit is missing", () => {
    const players = loadTeamSheet().players;
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ players, substitutes: [], kits: { outfieldKitId: "user:gone", gkKitId: "user:gone-too" } }),
    );
    render(<TeamSheetScreen />);
    const srcs = pitchJerseySrcs();
    expect(srcs.filter((s) => s === srcOf("Yellow"))).toHaveLength(14);
    expect(srcs.filter((s) => s === GK_SRC)).toHaveLength(1);
  });

  it("lists saved user kit metadata in the right picker for the team", () => {
    window.localStorage.setItem(
      TEAM_SHEET_KITS_STORAGE_KEY,
      JSON.stringify([
        { id: "user:gk2", teamId: "ballylanders", name: "Green GK", role: "gk", createdAt: 1 },
        { id: "user:other", teamId: "another-club", name: "Other", role: "outfield", createdAt: 1 },
      ]),
    );
    render(<TeamSheetScreen />);
    expect(within(gkPicker()).getAllByRole("radio").map((o) => o.textContent)).toEqual(["Black", "Green GK"]);
    expect(within(outfieldPicker()).getAllByRole("radio")).toHaveLength(3);
  });
});

// ── Kit Builder (upload) ───────────────────────────────────────────────

describe("Team Sheet Kit Builder", () => {
  // jsdom has no canvas or object URLs: a fake codec feeds a synthetic
  // green-on-white photo through the real processing, and object URLs are
  // stubbed so tiles show which saved image they render.
  let urls: Map<Blob, string>;
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  beforeEach(() => {
    urls = new Map();
    URL.createObjectURL = (blob: Blob | MediaSource) => {
      const url = `blob:kit/${urls.size + 1}`;
      urls.set(blob as Blob, url);
      return url;
    };
    URL.revokeObjectURL = () => undefined;
  });
  afterEach(() => {
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
  });

  function greenOnWhite(): PixelImage {
    const width = 120;
    const height = 150;
    const data = new Uint8ClampedArray(width * height * 4);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const inside = x >= 20 && x < 100 && y >= 20 && y < 130;
        data.set(inside ? [40, 140, 70, 255] : [255, 255, 255, 255], (y * width + x) * 4);
      }
    }
    return { data, width, height };
  }
  const codec: KitImageCodec = {
    decode: async () => greenOnWhite(),
    paint: () => undefined,
    encodeKit: async () => new Blob(["kit"], { type: "image/png" }),
    encodeOriginal: async () => new Blob(["orig"], { type: "image/jpeg" }),
  };

  async function uploadAndSave(role: "Outfield" | "Goalkeeper" = "Outfield", name?: string) {
    fireEvent.change(screen.getByTestId("kit-file-input"), {
      target: { files: [new File([new Uint8Array(8)], "kit.jpg", { type: "image/jpeg" })] },
    });
    const sheet = await screen.findByRole("dialog");
    await within(sheet).findByText(/Background removed/);
    if (name) fireEvent.change(within(sheet).getByRole("textbox"), { target: { value: name } });
    fireEvent.click(within(sheet).getByRole("radio", { name: role }));
    fireEvent.click(within(sheet).getByRole("button", { name: "Save jersey" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  }

  it("keeps the preset pickers unchanged and offers + Add jersey only in edit mode", () => {
    render(<TeamSheetScreen kitImageBackend={createMemoryKitImageBackend()} kitImageCodec={codec} />);
    expect(within(outfieldPicker()).getAllByRole("radio").map((o) => o.textContent)).toEqual(["Yellow", "Green", "White"]);
    expect(within(gkPicker()).getAllByRole("radio").map((o) => o.textContent)).toEqual(["Black"]);
    expect(screen.getByText("+ Add jersey")).toBeTruthy();
    fireEvent.click(screen.getByText("Screenshot Mode"));
    expect(screen.queryByText("+ Add jersey")).toBeNull();
  });

  it("an uploaded outfield kit is selected immediately for all 14 outfield players and persists after reload", async () => {
    const backend = createMemoryKitImageBackend();
    const first = render(<TeamSheetScreen kitImageBackend={backend} kitImageCodec={codec} />);
    await uploadAndSave("Outfield", "Away");

    expect(within(outfieldPicker()).getByRole("radio", { name: "Away" }).getAttribute("aria-checked")).toBe("true");
    await waitFor(() => expect(pitchJerseySrcs().filter((s) => s.startsWith("blob:kit/"))).toHaveLength(14));
    expect(pitchJerseySrcs().filter((s) => s === GK_SRC)).toHaveLength(1);
    first.unmount();

    render(<TeamSheetScreen kitImageBackend={backend} kitImageCodec={codec} />);
    expect(within(outfieldPicker()).getByRole("radio", { name: "Away" }).getAttribute("aria-checked")).toBe("true");
    await waitFor(() => expect(pitchJerseySrcs().filter((s) => s.startsWith("blob:kit/"))).toHaveLength(14));
  });

  it("an uploaded goalkeeper kit applies to #1 only (and a #1 substitute)", async () => {
    const backend = createMemoryKitImageBackend();
    render(<TeamSheetScreen kitImageBackend={backend} kitImageCodec={codec} />);
    await uploadAndSave("Goalkeeper", "Keeper");
    expect(within(gkPicker()).getByRole("radio", { name: "Keeper" }).getAttribute("aria-checked")).toBe("true");
    await waitFor(() => expect(pitchJerseySrcs().filter((s) => s.startsWith("blob:kit/"))).toHaveLength(1));
    expect(pitchJerseySrcs().filter((s) => s === srcOf("Yellow"))).toHaveLength(14);
    fireEvent.click(screen.getByText("+ Add Subs"));
    fireEvent.change(screen.getByDisplayValue("16"), { target: { value: "1" } });
    await waitFor(() => expect(pitchJerseySrcs().filter((s) => s.startsWith("blob:kit/"))).toHaveLength(2));
  });

  it("warns clearly when a saved kit's image is missing, never in Screenshot Mode, and Remove kit falls back to the preset", async () => {
    // Metadata survives but the IndexedDB image is gone (e.g. Safari cleared site data).
    window.localStorage.setItem(
      TEAM_SHEET_KITS_STORAGE_KEY,
      JSON.stringify([{ id: "user:lost", teamId: "ballylanders", name: "Lost Kit", role: "outfield", createdAt: 1 }]),
    );
    window.localStorage.setItem(
      KEY,
      JSON.stringify({ players: loadTeamSheet().players, substitutes: [], kits: { outfieldKitId: "user:lost", gkKitId: "preset:ballylanders-gk-black" } }),
    );
    render(<TeamSheetScreen kitImageBackend={createMemoryKitImageBackend()} kitImageCodec={codec} />);

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/saved image for “Lost Kit” is missing on this device/);
    expect(pitchJerseySrcs().filter((s) => s === srcOf("Yellow"))).toHaveLength(14); // default shown, never blank

    fireEvent.click(screen.getByText("Screenshot Mode"));
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(screen.getByText("Ballylanders")); // tap anywhere to exit Screenshot Mode

    fireEvent.click(within(await screen.findByRole("alert")).getByRole("button", { name: "Remove kit" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(within(outfieldPicker()).getByRole("radio", { name: "Yellow" }).getAttribute("aria-checked")).toBe("true");
    expect(within(outfieldPicker()).queryByRole("radio", { name: "Lost Kit" })).toBeNull();
    await waitFor(() => expect(loadUserKitRecords()).toEqual([]));
    expect(loadTeamSheet().kits.outfieldKitId).toBe("preset:ballylanders-yellow");
  });

  it("closes the upload sheet with Cancel and changes nothing", async () => {
    render(<TeamSheetScreen kitImageBackend={createMemoryKitImageBackend()} kitImageCodec={codec} />);
    fireEvent.change(screen.getByTestId("kit-file-input"), {
      target: { files: [new File([new Uint8Array(8)], "kit.jpg", { type: "image/jpeg" })] },
    });
    const sheet = await screen.findByRole("dialog");
    fireEvent.click(within(sheet).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(loadUserKitRecords()).toEqual([]);
    expect(within(outfieldPicker()).getAllByRole("radio")).toHaveLength(3);
  });
});
