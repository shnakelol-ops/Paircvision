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

// The real canvas recorder needs MediaRecorder/captureStream (absent in
// jsdom). This stand-in keeps the hook's contract — React state for the
// phase/blob, the same onBeforeCountdown/onComplete callbacks — so the page's
// wiring to the existing recording system is exercised, not a copy of it.
type RecorderParams = { onBeforeCountdown?: () => void; onComplete?: () => void };
const recorder = vi.hoisted(() => ({
  initialPhase: "idle" as string,
  setPhase: null as null | ((phase: string) => void),
  setBlob: null as null | ((blob: Blob | null) => void),
  params: null as null | RecorderParams,
  startCountdown: null as null | ReturnType<typeof vi.fn>,
  stopRecording: null as null | ReturnType<typeof vi.fn>,
  dismissRecord: null as null | ReturnType<typeof vi.fn>,
}));

vi.mock("../features/shared/useCanvasRecorder", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../features/shared/useCanvasRecorder")>();
  const React = await import("react");
  return {
    ...actual,
    useCanvasRecorder: (params: RecorderParams) => {
      const [recordPhase, setRecordPhase] = React.useState(recorder.initialPhase);
      const [recordBlob, setRecordBlob] = React.useState<Blob | null>(null);
      recorder.setPhase = setRecordPhase;
      recorder.setBlob = setRecordBlob;
      recorder.params = params;
      return {
        recordPhase,
        setRecordPhase,
        recordCountdown: 3,
        recordElapsed: 0,
        recordBlob,
        recordBlobUrl: null,
        recordHasAudio: false,
        recordMimeType: "video/webm",
        micStatus: "off",
        isSharing: false,
        canRecord: () => true,
        startCountdown: recorder.startCountdown,
        startCountdownWithVoice: vi.fn(async () => {}),
        stopRecording: recorder.stopRecording,
        dismissRecord: recorder.dismissRecord,
        saveClip: vi.fn(),
        shareClip: vi.fn(async () => {}),
      };
    },
  };
});

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
  recorder.initialPhase = "idle";
  recorder.startCountdown = vi.fn(() => {
    recorder.params?.onBeforeCountdown?.();
    recorder.setPhase?.("countdown");
  });
  recorder.stopRecording = vi.fn(() => {
    recorder.setBlob?.(new Blob(["clip"], { type: "video/webm" }));
    recorder.setPhase?.("done");
    recorder.params?.onComplete?.();
  });
  recorder.dismissRecord = vi.fn(() => recorder.setPhase?.("idle"));
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
  });

  it("does not block Pixi pointer input: nothing interactive covers the board host", async () => {
    await renderSlate();
    vi.spyOn(window.history, "back").mockImplementation(() => {});
    await enterFullView();
    const content = document.querySelector("[data-slate-board-content]") as HTMLElement;
    const host = engine.hosts[0]!;
    expect(content.querySelector('[aria-hidden="true"]')).toBeNull();
    for (const child of Array.from(content.children) as HTMLElement[]) {
      if (child === host) continue;
      // Watermark and the (inactive) label overlay never take pointer events.
      expect(child.style.pointerEvents).toBe("none");
    }
    expect(host.style.pointerEvents).not.toBe("none");
  });

  it("runs the board on the Move tool in Full View and restores the editor tool on exit", async () => {
    await renderSlate();
    vi.spyOn(window.history, "back").mockImplementation(() => {});
    const surface = engine.surface!;
    // Coach left the arrow tool active in the editor.
    fireEvent.click(screen.getByRole("button", { name: "Open tools" }));
    fireEvent.click(screen.getByRole("button", { name: "Straight" }));
    const closeTools = screen.queryByRole("button", { name: "Close tools" });
    if (closeTools) fireEvent.click(closeTools);
    const toolBefore = surface.setWhiteboardDrawTool.mock.calls.at(-1)?.[0];
    expect(toolBefore).toBe("arrow");

    await enterFullView();
    expect(surface.setWhiteboardDrawTool.mock.calls.at(-1)?.[0]).toBe("move");
    expect(surface.setFreeDrawCaptureMode).toHaveBeenCalledWith(false);
    expect(surface.setPracticeAreaEditingSuspended.mock.calls.at(-1)?.[0]).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Exit Full View" }));
    expect(surface.setWhiteboardDrawTool.mock.calls.at(-1)?.[0]).toBe(toolBefore);
    expect(surface.setPracticeAreaEditingSuspended.mock.calls.at(-1)?.[0]).toBe(false);
  });

  it("does not force items/equipment to locked: item mode follows the normal editor rules", async () => {
    await renderSlate();
    vi.spyOn(window.history, "back").mockImplementation(() => {});
    const surface = engine.surface!;
    const modeBefore = surface.setItemMode.mock.calls.at(-1)?.[0];
    await enterFullView();
    expect(surface.setItemMode.mock.calls.at(-1)?.[0]).toBe(modeBefore);
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

describe("Tactical Slate Full View — recording (existing recorder)", () => {
  it("blocks entering Full View while a recording is already running", async () => {
    recorder.initialPhase = "recording";
    await renderSlate();
    const push = vi.spyOn(window.history, "pushState");
    fireEvent.click(screen.getByRole("button", { name: "Open actions" }));
    const entry = screen.getByRole("button", { name: "⛶ Full View" }) as HTMLButtonElement;
    expect(entry.disabled).toBe(true);
    fireEvent.click(entry);
    expect(screen.queryByRole("toolbar", { name: "Full View controls" })).toBeNull();
    expect(push).not.toHaveBeenCalled();
  });

  it("starts recording from the controller after entering, without leaving Full View", async () => {
    await renderSlate();
    vi.spyOn(window.history, "back").mockImplementation(() => {});
    await enterFullView();
    fireEvent.click(screen.getByRole("button", { name: "Start recording" }));
    expect(recorder.startCountdown).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("toolbar", { name: "Full View controls" })).toBeTruthy();
    // Countdown and REC come from the existing recorder state.
    expect(screen.getByRole("button", { name: "Recording starts soon" })).toBeTruthy();
    act(() => recorder.setPhase?.("recording"));
    expect(screen.getByRole("button", { name: "Stop recording" })).toBeTruthy();
    expect(screen.getByText("REC")).toBeTruthy();
    expect(screen.getByRole("toolbar", { name: "Full View controls" })).toBeTruthy();
  });

  it("stops normally in Full View and shows the existing clip result without exiting", async () => {
    await renderSlate();
    vi.spyOn(window.history, "back").mockImplementation(() => {});
    await enterFullView();
    fireEvent.click(screen.getByRole("button", { name: "Start recording" }));
    act(() => recorder.setPhase?.("recording"));
    fireEvent.click(screen.getByRole("button", { name: "Stop recording" }));
    expect(recorder.stopRecording).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("toolbar", { name: "Full View controls" })).toBeTruthy();
    expect(screen.getByText("Clip Ready")).toBeTruthy();
    // Only the clip result — not the rest of the Share menu.
    expect(screen.queryByText("📸 Snapshot")).toBeNull();
    // Escape closes the clip result first rather than leaving Full View.
    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByRole("toolbar", { name: "Full View controls" })).toBeTruthy();
  });

  it("finishes an in-progress recording before exiting (exit resizes the canvas)", async () => {
    await renderSlate();
    vi.spyOn(window.history, "back").mockImplementation(() => {});
    await enterFullView();
    fireEvent.click(screen.getByRole("button", { name: "Start recording" }));
    act(() => recorder.setPhase?.("recording"));
    fireEvent.click(screen.getByRole("button", { name: "Exit Full View" }));
    expect(recorder.stopRecording).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("toolbar", { name: "Full View controls" })).toBeNull();
  });

  it("cancels a countdown when leaving via browser back", async () => {
    await renderSlate();
    vi.spyOn(window.history, "back").mockImplementation(() => {});
    await enterFullView();
    fireEvent.click(screen.getByRole("button", { name: "Start recording" }));
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(recorder.dismissRecord).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("toolbar", { name: "Full View controls" })).toBeNull();
  });
});
