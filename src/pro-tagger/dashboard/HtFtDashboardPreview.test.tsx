// @vitest-environment jsdom
// Preview → Share / Save flow for the HT / FT dashboard PNG, using the real
// ShareSheet and imageShare primitives (navigator.share, download fallback).
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { HtFtDashboardPreview } from "./HtFtDashboardPreview";
import { buildHtFtDashboardView } from "./htFtDashboardView";

const view = buildHtFtDashboardView(
  {
    events: [],
    matchState: "HALF_TIME",
    sport: "gaelic",
    homeTeamName: "Ballylanders",
    awayTeamName: "Galbally",
    homeColours: {},
    awayColours: {},
  },
  "HT",
);

const pngFile = () => new File([new Uint8Array([137, 80, 78, 71])], "ballylanders-v-galbally-ht-dashboard.png", { type: "image/png" });

const nav = navigator as Navigator & { share?: unknown; canShare?: unknown };

beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:dashboard") as typeof URL.createObjectURL;
  URL.revokeObjectURL = vi.fn() as typeof URL.revokeObjectURL;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  delete (navigator as unknown as Record<string, unknown>).share;
  delete (navigator as unknown as Record<string, unknown>).canShare;
});

async function openReadyPreview(renderFn = vi.fn(async () => pngFile())) {
  render(<HtFtDashboardPreview view={view} onClose={() => {}} render={renderFn} />);
  await screen.findByAltText(/HT Dashboard/);
  return renderFn;
}

describe("HtFtDashboardPreview", () => {
  it("renders once on open and previews the image", async () => {
    const renderFn = await openReadyPreview();
    expect(renderFn).toHaveBeenCalledTimes(1);
    expect(renderFn).toHaveBeenCalledWith(view);
    expect(screen.getByAltText(/HT Dashboard: Ballylanders v Galbally · Half-Time/).getAttribute("src")).toBe("blob:dashboard");
  });

  it("disables sharing until the image exists", () => {
    render(<HtFtDashboardPreview view={view} onClose={() => {}} render={() => new Promise(() => {})} />);
    expect(screen.getByText("Creating dashboard…")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Share or Save Image" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows a clear error and never offers sharing when rendering fails", async () => {
    render(<HtFtDashboardPreview view={view} onClose={() => {}} render={async () => { throw new Error("Canvas is not available on this device."); }} />);
    expect(await screen.findByText("Canvas is not available on this device.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Share or Save Image" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shares the already-built PNG through the native share sheet when files can be shared", async () => {
    const share = vi.fn(async () => undefined);
    nav.share = share;
    nav.canShare = vi.fn(() => true);
    const renderFn = await openReadyPreview();
    fireEvent.click(screen.getByRole("button", { name: "Share or Save Image" }));
    await act(async () => { fireEvent.click(screen.getByText("Share Image…")); });
    await waitFor(() => expect(share).toHaveBeenCalledTimes(1));
    const data = (share.mock.calls[0] as unknown[])[0] as ShareData;
    expect(data.files?.[0].name).toBe("ballylanders-v-galbally-ht-dashboard.png");
    expect(data.files?.[0].type).toBe("image/png");
    expect(renderFn).toHaveBeenCalledTimes(1); // the preview's image, not a re-render
  });

  it("falls back honestly when native file sharing is unavailable, and Save Image downloads the PNG", async () => {
    await openReadyPreview();
    fireEvent.click(screen.getByRole("button", { name: "Share or Save Image" }));
    await act(async () => { fireEvent.click(screen.getByText("Share Image…")); });
    expect(await screen.findByText(/can't share image files directly — use Save Image instead/)).toBeTruthy();

    const clicks: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicks.push(this.download);
    });
    await act(async () => { fireEvent.click(screen.getByText("Save Image")); });
    await waitFor(() => expect(clicks).toEqual(["ballylanders-v-galbally-ht-dashboard.png"]));
  });

  it("Back closes the preview", async () => {
    const onClose = vi.fn();
    render(<HtFtDashboardPreview view={view} onClose={onClose} render={async () => pngFile()} />);
    fireEvent.click(screen.getByRole("button", { name: "← Back" }));
    expect(onClose).toHaveBeenCalled();
  });
});
