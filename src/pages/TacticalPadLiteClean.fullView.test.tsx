// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";

// A live Pixi surface cannot be constructed under jsdom (no WebGL), so the
// engine is replaced by a recording fake. Everything else is the real page.
type FakeOptions = Record<string, ((...args: unknown[]) => void) | undefined>;
const engine = vi.hoisted(() => ({
  hosts: [] as HTMLElement[],
  options: null as null | Record<string, ((...args: unknown[]) => void) | undefined>,
  surface: null as null | Record<string, ReturnType<typeof vi.fn>>,
  destroyCount: 0,
}));

vi.mock("../engine/pixi/createTacticalPadLiteSurface", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../engine/pixi/createTacticalPadLiteSurface")>()),
  createTacticalPadLiteSurface: vi.fn(async (host: HTMLElement, options: FakeOptions) => {
    engine.hosts.push(host);
    engine.options = options;
    const methods: Record<string, ReturnType<typeof vi.fn>> = {
      exportBoardState: vi.fn(() => ({
        players: [],
        items: [],
        drawings: [],
        phases: [],
        movementPaths: [],
      })),
      getTacticalPlayer: vi.fn((playerId: string) => ({ id: playerId, number: 7, team: "BLUE" })),
      getShapeLockState: vi.fn(() => ({ mode: "off", memberIds: [] })),
      getShapeLinksState: vi.fn(() => ({
        isSelectMode: false,
        selectedCount: 0,
        isSelectionClosed: false,
        showShapeLinks: true,
        links: [],
      })),
      hasFreeDrawContent: vi.fn(() => false),
      getCanvas: vi.fn(() => null),
      exportImageCanvas: vi.fn(() => null),
      importBoardState: vi.fn(() => true),
      destroy: vi.fn(() => {
        engine.destroyCount += 1;
      }),
    };
    const surface = new Proxy(methods, {
      get(target, key) {
        if (typeof key !== "string" || key === "then") return undefined;
        if (!target[key]) target[key] = vi.fn();
        return target[key];
      },
    });
    engine.surface = surface;
    return surface;
  }),
}));

import TacticalPadLiteClean from "./TacticalPadLiteClean";
import { OverlayPortalProvider } from "../overlay/OverlayPortalContext";

async function renderSlate() {
  const view = render(
    <OverlayPortalProvider>
      <TacticalPadLiteClean />
    </OverlayPortalProvider>,
  );
  // Let the (fake) async surface creation resolve.
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  return view;
}

async function enterFullView() {
  fireEvent.click(screen.getByRole("button", { name: "Open actions" }));
  fireEvent.click(screen.getByRole("button", { name: "⛶ Full View" }));
  await act(async () => {
    await Promise.resolve();
  });
}

const fire = (name: string, ...args: unknown[]) =>
  act(() => {
    engine.options?.[name]?.(...args);
  });

beforeEach(() => {
  engine.hosts = [];
  engine.options = null;
  engine.surface = null;
  engine.destroyCount = 0;
  window.localStorage.clear();
  window.history.replaceState(null, "", "/vision-board");
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: query.includes("landscape"),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    })),
  );
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280 });
  Object.defineProperty(window, "innerHeight", { configurable: true, value: 800 });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("Tactical Slate Full View", () => {
  it("hides editor chrome and shows the controller, keeping watermark + board", async () => {
    await renderSlate();
    expect(screen.getByRole("button", { name: "Open phases" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Open tools" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Toggle phases tray" })).toBeTruthy();

    await enterFullView();

    for (const name of ["Open actions", "Open phases", "Open tools", "Toggle phases tray"]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
    expect(screen.queryByText("Share Board")).toBeNull();
    expect(screen.getByRole("toolbar", { name: "Full View controls" })).toBeTruthy();
    expect(screen.getByText("PáircVision")).toBeTruthy();
    const shield = document.querySelector('[data-slate-input-shield="full-view"]') as HTMLElement;
    expect(shield).toBeTruthy();
    expect(shield.style.touchAction).toBe("none");
  });

  it("keeps the same host element and engine instance across enter/exit (no remount)", async () => {
    await renderSlate();
    expect(engine.hosts).toHaveLength(1);
    const host = engine.hosts[0]!;
    const content = document.querySelector("[data-slate-board-content]");
    expect(content?.firstElementChild).toBe(host);

    vi.spyOn(window.history, "back").mockImplementation(() => {});
    await enterFullView();
    expect(host.isConnected).toBe(true);
    expect(document.querySelector("[data-slate-board-content]")).toBe(content);
    expect(content?.firstElementChild).toBe(host);

    fireEvent.click(screen.getByRole("button", { name: "Exit Full View" }));
    expect(host.isConnected).toBe(true);
    expect(content?.firstElementChild).toBe(host);
    expect(engine.hosts).toHaveLength(1);
    expect(engine.destroyCount).toBe(0);
  });

  it("swaps only the content-box style to the aspect-locked Full View box", async () => {
    await renderSlate();
    const content = document.querySelector("[data-slate-board-content]") as HTMLElement;
    vi.spyOn(window.history, "back").mockImplementation(() => {});
    await enterFullView();
    expect(content.style.aspectRatio).toBe("16 / 10");
    expect(content.style.maxWidth).toBe("none");
    fireEvent.keyDown(window, { key: "Escape" });
    expect(content.style.maxWidth).toBe("calc(100vw - 24px)");
  });

  it("entry closes popovers/editors, cancels interaction and exits Shape Lock/Links selection", async () => {
    await renderSlate();
    fireEvent.click(screen.getByRole("button", { name: "Toggle phases tray" }));
    fire("onTacticalPlayerDoubleTap", { playerId: "p1", clientX: 100, clientY: 100 });
    fire("onShapeLockChange", { mode: "select", memberIds: [] });
    fire("onShapeLinksChange", {
      isSelectMode: true,
      selectedCount: 0,
      isSelectionClosed: false,
      showShapeLinks: true,
      links: [],
    });
    expect(screen.getByRole("dialog", { name: "Player kit editor" })).toBeTruthy();
    expect(screen.getByText("No phases")).toBeTruthy();

    vi.spyOn(window.history, "back").mockImplementation(() => {});
    await enterFullView();
    const surface = engine.surface!;
    expect(surface.cancelActiveInteraction).toHaveBeenCalled();
    expect(surface.setShapeLockMode).toHaveBeenCalledWith("off");
    expect(surface.setShapeLinkSelectMode).toHaveBeenCalledWith(false);

    fireEvent.click(screen.getByRole("button", { name: "Exit Full View" }));
    expect(screen.queryByRole("dialog", { name: "Player kit editor" })).toBeNull();
    expect(screen.queryByText("No phases")).toBeNull();
    expect(screen.queryByText("Share Board")).toBeNull();
  });

  it("blocks the kit editor (double-tap) while presenting", async () => {
    await renderSlate();
    vi.spyOn(window.history, "back").mockImplementation(() => {});
    await enterFullView();
    fire("onTacticalPlayerDoubleTap", { playerId: "p1", clientX: 100, clientY: 100 });
    fireEvent.click(screen.getByRole("button", { name: "Exit Full View" }));
    expect(screen.queryByRole("dialog", { name: "Player kit editor" })).toBeNull();
  });

  it("Escape exits and removes the Full View history entry", async () => {
    await renderSlate();
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    const push = vi.spyOn(window.history, "pushState");
    await enterFullView();
    expect(push).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("toolbar", { name: "Full View controls" })).toBeNull();
    expect(screen.getByRole("button", { name: "Open actions" })).toBeTruthy();
    expect(back).toHaveBeenCalledTimes(1);
  });

  it("✕ exits and removes the Full View history entry", async () => {
    await renderSlate();
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    await enterFullView();
    fireEvent.click(screen.getByRole("button", { name: "Exit Full View" }));
    expect(screen.queryByRole("toolbar", { name: "Full View controls" })).toBeNull();
    expect(screen.getByRole("button", { name: "Open phases" })).toBeTruthy();
    expect(back).toHaveBeenCalledTimes(1);
  });

  it("browser/Android back (popstate) exits without a second history.back()", async () => {
    await renderSlate();
    const back = vi.spyOn(window.history, "back").mockImplementation(() => {});
    await enterFullView();
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(screen.queryByRole("toolbar", { name: "Full View controls" })).toBeNull();
    expect(back).not.toHaveBeenCalled();
  });

  it("controller reflects the engine cursor and drives existing surface methods", async () => {
    await renderSlate();
    vi.spyOn(window.history, "back").mockImplementation(() => {});
    fire("onPhaseCountChange", 3);
    fire("onPhaseCursorChange", 1);
    await enterFullView();
    expect(screen.getByText("Phase 2/3")).toBeTruthy();
    const surface = engine.surface!;
    fireEvent.click(screen.getByRole("button", { name: "Next phase" }));
    expect(surface.goToPhase).toHaveBeenCalledWith(2);
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(surface.play).toHaveBeenCalledTimes(1);
    fire("onPlaybackStateChange", { isPlaying: true, isPaused: false });
    fireEvent.click(screen.getByRole("button", { name: "Pause" }));
    expect(surface.pausePlayback).toHaveBeenCalledTimes(1);
    fire("onPlaybackStateChange", { isPlaying: false, isPaused: true });
    fireEvent.click(screen.getByRole("button", { name: "Play" }));
    expect(surface.resumePlayback).toHaveBeenCalledTimes(1);
    fire("onPhaseCursorChange", -1);
    expect(screen.getByText("Start")).toBeTruthy();
  });

  it("never mutates board state on enter/exit (no import/reset/phase calls)", async () => {
    await renderSlate();
    vi.spyOn(window.history, "back").mockImplementation(() => {});
    const surface = engine.surface!;
    await enterFullView();
    fireEvent.click(screen.getByRole("button", { name: "Exit Full View" }));
    for (const method of ["importBoardState", "reset", "goToPhase", "addPhase", "undoPhase", "setStart", "newBoard"]) {
      expect(surface[method]).not.toHaveBeenCalled();
    }
  });
});
