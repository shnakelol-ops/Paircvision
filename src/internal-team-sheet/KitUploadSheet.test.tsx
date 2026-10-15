// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import { KitUploadSheet } from "./KitUploadSheet";
import type { KitImageCodec } from "./kit-image-codec";
import type { PixelImage } from "./kit-image-processing";
import { createMemoryKitImageBackend, loadUserKitRecords, loadUserKitImage, loadUserKitOriginal } from "./team-sheet-kit-store";

// Real processing (kit-image-processing.ts) runs; only the canvas codec is faked.

type RGB = [number, number, number];
function photo(backdrop: RGB, body: (x: number, y: number) => RGB, alpha = 255): PixelImage {
  const width = 120;
  const height = 150;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const inside = x >= 20 && x < 100 && y >= 20 && y < 130;
      const c = inside ? body(x, y) : backdrop;
      data.set([...c, inside ? 255 : alpha], (y * width + x) * 4);
    }
  }
  return { data, width, height };
}
const greenOnWhite = () => photo([255, 255, 255], () => [40, 140, 70]);
const whiteOnGrey = () =>
  photo([233, 233, 233], (x) => {
    const v = Math.round(250 - Math.abs(x - 60) * 0.65);
    return [v, v, v];
  });
const cutOut = () => photo([0, 0, 0], () => [200, 30, 30], 0);

function fakeCodec(img: PixelImage) {
  const encoded: Uint8ClampedArray[] = [];
  const codec: KitImageCodec = {
    decode: vi.fn(async () => img),
    paint: vi.fn(),
    encodeKit: vi.fn(async (_img, alpha) => {
      encoded.push(new Uint8ClampedArray(alpha));
      return new Blob(["kit"], { type: "image/png" });
    }),
    encodeOriginal: vi.fn(async (_img, transparent) => new Blob(["orig"], { type: transparent ? "image/png" : "image/jpeg" })),
  };
  return { codec, encoded };
}

const jpeg = (type = "image/jpeg") => new File([new Uint8Array(10)], "kit.jpg", { type });
const alphaAt = (alpha: Uint8ClampedArray, img: PixelImage, x: number, y: number) => alpha[y * img.width + x];

function renderSheet(img: PixelImage, overrides: Partial<Parameters<typeof KitUploadSheet>[0]> = {}) {
  const { codec, encoded } = fakeCodec(img);
  const backend = createMemoryKitImageBackend();
  const onSaved = vi.fn();
  const onClose = vi.fn();
  render(
    <KitUploadSheet
      file={jpeg()}
      teamId="ballylanders"
      defaultName="Kit 1"
      codec={codec}
      backend={backend}
      onSaved={onSaved}
      onClose={onClose}
      {...overrides}
    />,
  );
  return { codec, encoded, backend, onSaved, onClose };
}

const dialog = () => screen.getByRole("dialog");
const removeSwitch = () => within(dialog()).getByRole("switch") as HTMLInputElement;
const saveBtn = () => within(dialog()).getByRole("button", { name: /Save jersey|Saving/ });

// jsdom has no PointerEvent, so fireEvent.pointer* would drop clientX/clientY.
if (typeof window.PointerEvent === "undefined") {
  class PointerEventStandIn extends MouseEvent {
    pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
    }
  }
  (window as unknown as { PointerEvent: typeof PointerEventStandIn }).PointerEvent = PointerEventStandIn;
}

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

describe("KitUploadSheet", () => {
  it("removes a plain background automatically and saves processed + original images", async () => {
    const img = greenOnWhite();
    const { encoded, backend, onSaved } = renderSheet(img);
    await screen.findByText(/Background removed/);
    expect(removeSwitch().checked).toBe(true);

    fireEvent.click(saveBtn());
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    const alpha = encoded[0];
    expect(alphaAt(alpha, img, 2, 2)).toBe(0); // backdrop removed
    expect(alphaAt(alpha, img, 60, 75)).toBe(255); // jersey kept

    const record = onSaved.mock.calls[0][0];
    expect(record).toMatchObject({ teamId: "ballylanders", name: "Kit 1", role: "outfield", hasOriginal: true });
    expect(loadUserKitRecords()).toEqual([record]);
    expect(await loadUserKitImage(record.id, backend)).not.toBeNull();
    expect(await loadUserKitOriginal(record.id, backend)).not.toBeNull();
  });

  it("asks the coach to check white parts after removing a light background, and Show original paints the untouched photo", async () => {
    const img = greenOnWhite();
    const { codec } = renderSheet(img);
    await screen.findByText(/Check white parts of the jersey that touch its outline/);
    const paint = codec.paint as ReturnType<typeof vi.fn>;
    const lastPreviewAlpha = () => paint.mock.calls.filter((c) => c.length === 3 || c[3] === undefined).at(-1)![2] as Uint8ClampedArray;
    expect(lastPreviewAlpha().some((a) => a === 0)).toBe(true);
    fireEvent.click(within(dialog()).getByRole("button", { name: "Show original" }));
    expect(lastPreviewAlpha().every((a) => a === 255)).toBe(true);
    fireEvent.click(within(dialog()).getByRole("button", { name: "Showing original photo" }));
    expect(lastPreviewAlpha().some((a) => a === 0)).toBe(true);
  });

  it("does not show the white-parts warning on a dark backdrop", async () => {
    renderSheet(photo([25, 25, 25], () => [40, 140, 70]));
    await screen.findByText("Background removed. Check the edges, then use Erase or Restore to fix anything missed.");
  });

  it("never removes any part of a white jersey on a light background automatically", async () => {
    const img = whiteOnGrey();
    const { encoded, onSaved } = renderSheet(img);
    await screen.findByText(/too close to the jersey's colours/);
    expect(removeSwitch().checked).toBe(false);

    fireEvent.click(saveBtn());
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    // Every jersey pixel (and the backdrop) is still fully opaque: nothing was cut.
    expect(encoded[0].every((a) => a === 255)).toBe(true);
  });

  it("lets the coach erase the background by hand without touching the jersey", async () => {
    const img = whiteOnGrey();
    const { encoded, onSaved } = renderSheet(img);
    await screen.findByText(/too close to the jersey's colours/);
    const canvas = screen.getByTestId("kit-preview");
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 120, height: 150, right: 120, bottom: 150, x: 0, y: 0, toJSON: () => ({}) });

    fireEvent.click(within(dialog()).getByRole("button", { name: "Erase" }));
    fireEvent.pointerDown(canvas, { clientX: 6, clientY: 6, pointerId: 1 });
    fireEvent.pointerMove(canvas, { clientX: 6, clientY: 60, pointerId: 1 });
    fireEvent.pointerUp(canvas, { pointerId: 1 });

    fireEvent.click(saveBtn());
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(alphaAt(encoded[0], img, 6, 6)).toBe(0);
    expect(alphaAt(encoded[0], img, 6, 60)).toBe(0);
    expect(alphaAt(encoded[0], img, 60, 75)).toBe(255);
  });

  it("Restore brings back an area the automatic removal took", async () => {
    const img = greenOnWhite();
    const { encoded, onSaved } = renderSheet(img);
    await screen.findByText(/Background removed/);
    const canvas = screen.getByTestId("kit-preview");
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 120, height: 150, right: 120, bottom: 150, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.click(within(dialog()).getByRole("button", { name: "Restore" }));
    fireEvent.pointerDown(canvas, { clientX: 5, clientY: 5, pointerId: 1 });
    fireEvent.pointerUp(canvas, { pointerId: 1 });
    fireEvent.click(saveBtn());
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(alphaAt(encoded[0], img, 5, 5)).toBeGreaterThan(0);
  });

  it("Clear fixes undoes hand-painted corrections", async () => {
    const img = whiteOnGrey();
    const { encoded, onSaved } = renderSheet(img);
    await screen.findByText(/too close to the jersey's colours/);
    const canvas = screen.getByTestId("kit-preview");
    canvas.getBoundingClientRect = () => ({ left: 0, top: 0, width: 120, height: 150, right: 120, bottom: 150, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.click(within(dialog()).getByRole("button", { name: "Erase" }));
    fireEvent.pointerDown(canvas, { clientX: 6, clientY: 6, pointerId: 1 });
    fireEvent.pointerUp(canvas, { pointerId: 1 });
    fireEvent.click(within(dialog()).getByRole("button", { name: "Clear fixes" }));
    fireEvent.click(saveBtn());
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(encoded[0].every((a) => a === 255)).toBe(true);
  });

  it("detects an already-transparent image and keeps its transparency without removing anything", async () => {
    const img = cutOut();
    const { encoded, codec, onSaved } = renderSheet(img);
    await screen.findByText(/already has a transparent background/);
    expect(removeSwitch().checked).toBe(false);
    fireEvent.click(saveBtn());
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(alphaAt(encoded[0], img, 2, 2)).toBe(0);
    expect(alphaAt(encoded[0], img, 60, 75)).toBe(255);
    expect(codec.encodeOriginal).toHaveBeenCalledWith(img, true); // PNG keeps the original's transparency
  });

  it("tolerance changes the automatic result", async () => {
    const img = photo([255, 255, 255], (x) => (x < 30 ? [235, 235, 235] : [40, 140, 70])); // pale strip at the jersey's edge
    const { encoded, onSaved } = renderSheet(img);
    await screen.findByText(/Background removed|too close/);
    if (!removeSwitch().checked) fireEvent.click(removeSwitch());
    fireEvent.change(within(dialog()).getByRole("slider", { name: "Tolerance" }), { target: { value: "8" } });
    fireEvent.click(saveBtn());
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(1));
    expect(alphaAt(encoded[0], img, 25, 75)).toBe(255); // pale strip kept at low tolerance
  });

  it("saves name and goalkeeper role", async () => {
    const { onSaved } = renderSheet(greenOnWhite());
    await screen.findByText(/Background removed/);
    fireEvent.change(within(dialog()).getByRole("textbox"), { target: { value: "Away GK" } });
    fireEvent.click(within(dialog()).getByRole("radio", { name: "Goalkeeper" }));
    fireEvent.click(saveBtn());
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(onSaved.mock.calls[0][0]).toMatchObject({ name: "Away GK", role: "gk" });
  });

  it("shows a clear error and saves nothing when storage fails", async () => {
    const failing = {
      ...createMemoryKitImageBackend(),
      put: () => Promise.reject(new DOMException("full", "QuotaExceededError")),
    };
    const { onSaved } = renderSheet(greenOnWhite(), { backend: failing });
    await screen.findByText(/Background removed/);
    fireEvent.click(saveBtn());
    expect(await within(dialog()).findByRole("alert")).toHaveProperty(
      "textContent",
      expect.stringContaining("Nothing was saved"),
    );
    expect(onSaved).not.toHaveBeenCalled();
    expect(loadUserKitRecords()).toEqual([]);
    expect(saveBtn()).toHaveProperty("disabled", false); // can retry
  });

  it("rejects unsupported files before decoding", async () => {
    const { codec } = renderSheet(greenOnWhite(), { file: jpeg("image/heic") });
    expect((await screen.findByRole("alert")).textContent).toMatch(/JPG, PNG or WebP/);
    expect(codec.decode).not.toHaveBeenCalled();
  });

  it("explains a photo that can't be decoded", async () => {
    const { codec } = fakeCodec(greenOnWhite());
    codec.decode = vi.fn(async () => {
      throw new Error("This photo couldn't be opened. Try a different JPG, PNG or WebP image.");
    });
    render(
      <KitUploadSheet file={jpeg()} teamId="t" defaultName="Kit 1" codec={codec} onSaved={vi.fn()} onClose={vi.fn()} />,
    );
    expect((await screen.findByRole("alert")).textContent).toMatch(/couldn't be opened/);
  });

  it("Cancel closes without saving", async () => {
    const { onClose, onSaved } = renderSheet(greenOnWhite());
    await screen.findByText(/Background removed/);
    await act(async () => fireEvent.click(within(dialog()).getByRole("button", { name: "Cancel" })));
    expect(onClose).toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
    expect(loadUserKitRecords()).toEqual([]);
  });
});
