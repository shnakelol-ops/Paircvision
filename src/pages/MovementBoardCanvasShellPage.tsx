import { useEffect, useRef, useState, type CSSProperties } from "react";

import OrientationGate, { usePortraitOrientation } from "../components/OrientationGate";
import {
  createMovementCanvasShell,
} from "../movement-board/shell/createMovementCanvasShell";
import type {
  MovementBoardMode,
  MovementRouteEditState,
  MovementBoardToken,
  MovementCanvasShellHandle,
  MovementPlaybackSpeed,
} from "../movement-board/shell/types";

const ROOT_STYLE: CSSProperties = {
  position: "fixed",
  inset: 0,
  margin: 0,
  background: "#0b1210",
  display: "grid",
  placeItems: "center",
};

const BOARD_STYLE: CSSProperties = {
  width: "min(98vw, 1400px)",
  height: "min(92vh, 840px)",
  borderRadius: "14px",
  overflow: "hidden",
  boxShadow: "0 20px 44px rgba(0, 0, 0, 0.38)",
  background: "#12241e",
};

const MENU_TOGGLE_STYLE: CSSProperties = {
  position: "fixed",
  left: "max(10px, calc(env(safe-area-inset-left, 0px) + 8px))",
  bottom: "max(10px, calc(env(safe-area-inset-bottom, 0px) + 8px))",
  zIndex: 21,
  width: "44px",
  height: "44px",
  borderRadius: "999px",
  border: "1px solid rgba(214, 245, 225, 0.38)",
  background: "rgba(8, 20, 15, 0.82)",
  color: "#e5fff0",
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: "18px",
  fontWeight: 700,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  boxShadow: "0 8px 18px rgba(0, 0, 0, 0.34), inset 0 1px 0 rgba(255, 255, 255, 0.12)",
};

const MENU_PANEL_STYLE: CSSProperties = {
  position: "fixed",
  left: "max(10px, calc(env(safe-area-inset-left, 0px) + 8px))",
  bottom: "max(62px, calc(env(safe-area-inset-bottom, 0px) + 60px))",
  zIndex: 20,
  width: "min(320px, calc(100vw - 20px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px)))",
  maxHeight: "min(76vh, 560px)",
  overflowY: "auto",
  borderRadius: "16px",
  border: "1px solid rgba(214, 245, 225, 0.3)",
  background: "rgba(8, 20, 15, 0.8)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  boxShadow: "0 14px 30px rgba(0, 0, 0, 0.36), inset 0 1px 0 rgba(255, 255, 255, 0.08)",
  padding: "10px",
  display: "grid",
  gap: "10px",
};

const MENU_HEADER_STYLE: CSSProperties = {
  display: "grid",
  gap: "4px",
  padding: "4px 2px 6px",
};

const MENU_TITLE_STYLE: CSSProperties = {
  color: "#eafff2",
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: "12px",
  fontWeight: 800,
  letterSpacing: "0.05em",
  textTransform: "uppercase",
};

const MENU_SUBTITLE_STYLE: CSSProperties = {
  color: "rgba(226, 249, 236, 0.86)",
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: "11px",
  fontWeight: 600,
  letterSpacing: "0.01em",
};

const SECTION_STYLE: CSSProperties = {
  borderRadius: "12px",
  border: "1px solid rgba(214, 245, 225, 0.2)",
  background: "rgba(12, 26, 19, 0.72)",
  padding: "8px",
  display: "grid",
  gap: "8px",
};

const SECTION_TITLE_STYLE: CSSProperties = {
  color: "rgba(226, 249, 236, 0.9)",
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: "10px",
  fontWeight: 800,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
};

const BUTTON_GRID_STYLE: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
  gap: "6px",
};

const MODE_GRID_STYLE: CSSProperties = {
  ...BUTTON_GRID_STYLE,
  gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
};

const CONTROL_BUTTON_STYLE: CSSProperties = {
  border: "none",
  borderRadius: "10px",
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: "10px",
  fontWeight: 700,
  letterSpacing: "0.02em",
  textTransform: "uppercase",
  padding: "8px 8px",
  minHeight: "34px",
  color: "#e5fff0",
  background: "rgba(255, 255, 255, 0.1)",
  boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.08)",
  cursor: "pointer",
};

const ACTIVE_BUTTON_STYLE: CSSProperties = {
  ...CONTROL_BUTTON_STYLE,
  background: "rgba(113, 242, 162, 0.25)",
};

const ENTITY_LABEL_STYLE: CSSProperties = {
  color: "#e8fff2",
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: "10px",
  fontWeight: 700,
  letterSpacing: "0.03em",
  textTransform: "uppercase",
  minWidth: "68px",
  textAlign: "center",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};

const DISABLED_BUTTON_STYLE: CSSProperties = {
  ...CONTROL_BUTTON_STYLE,
  opacity: 0.44,
  cursor: "not-allowed",
};

export default function MovementBoardCanvasShellPage() {
  const isPortrait = usePortraitOrientation();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const shellRef = useRef<MovementCanvasShellHandle | null>(null);
  const [mode, setMode] = useState<MovementBoardMode>("setup");
  const [playbackSpeed, setPlaybackSpeed] = useState<MovementPlaybackSpeed>("normal");
  const [selectedToken, setSelectedToken] = useState<MovementBoardToken | null>(null);
  const [tokenCount, setTokenCount] = useState(0);
  const [routeCount, setRouteCount] = useState(0);
  const [routeEditState, setRouteEditState] = useState<MovementRouteEditState>({
    waypointCount: 0,
    selectedWaypointIndex: null,
    canRemoveSelectedWaypoint: false,
  });
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(true);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    let destroyShell: (() => void) | null = null;
    let mountFrameA = 0;
    let mountFrameB = 0;
    let resizeFrameA = 0;
    let resizeFrameB = 0;

    const mountShell = () => {
      void createMovementCanvasShell(host, {
        mode,
        playbackSpeed,
        dragEnabled: !isPortrait,
        onTokenMove: (token) => {
          setSelectedToken((previous) => (previous?.id === token.id ? token : previous));
        },
        onSelectedTokenChange: (token) => {
          setSelectedToken(token);
        },
        onRoutesChange: (routes) => {
          setRouteCount(routes.length);
        },
        onPlaybackStateChange: (state) => {
          setIsPlaying(state.isPlaying);
          setIsPaused(state.isPaused);
        },
        onRouteEditStateChange: (state) => {
          setRouteEditState(state);
        },
      }).then((shell) => {
        if (disposed) {
          shell.destroy();
          return;
        }
        shellRef.current = shell;
        setTokenCount(shell.getTokens().length);
        setMode(shell.getMode());
        setPlaybackSpeed(shell.getPlaybackSpeed());
        setRouteCount(shell.getRoutes().length);
        const selected = shell.getSelectedToken();
        setSelectedToken(selected);
        setRouteEditState(shell.getRouteEditState());
        const playbackState = shell.getPlaybackState();
        setIsPlaying(playbackState.isPlaying);
        setIsPaused(playbackState.isPaused);
        shell.setDragEnabled(!isPortrait);
        destroyShell = shell.destroy;
      });
    };

    const scheduleReflow = () => {
      window.cancelAnimationFrame(resizeFrameA);
      window.cancelAnimationFrame(resizeFrameB);
      resizeFrameA = window.requestAnimationFrame(() => {
        resizeFrameB = window.requestAnimationFrame(() => {
          if (disposed) return;
          shellRef.current?.reflow();
        });
      });
    };

    const handleResize = () => {
      scheduleReflow();
    };
    window.addEventListener("resize", handleResize);

    mountFrameA = window.requestAnimationFrame(() => {
      mountFrameB = window.requestAnimationFrame(() => {
        if (disposed) return;
        mountShell();
      });
    });

    return () => {
      disposed = true;
      window.removeEventListener("resize", handleResize);
      window.cancelAnimationFrame(mountFrameA);
      window.cancelAnimationFrame(mountFrameB);
      window.cancelAnimationFrame(resizeFrameA);
      window.cancelAnimationFrame(resizeFrameB);
      shellRef.current = null;
      destroyShell?.();
    };
  }, []);

  useEffect(() => {
    shellRef.current?.setDragEnabled(!isPortrait);
  }, [isPortrait]);

  useEffect(() => {
    shellRef.current?.setMode(mode);
  }, [mode]);

  useEffect(() => {
    shellRef.current?.setPlaybackSpeed(playbackSpeed);
  }, [playbackSpeed]);

  const selectedLabel = selectedToken
    ? `P${selectedToken.number} • X ${selectedToken.position.x.toFixed(1)} • Y ${selectedToken.position.y.toFixed(1)}`
    : `${mode.toUpperCase()} • ${tokenCount} players`;

  const routeLabel = `Routes ${routeCount} • Selected bends ${Math.max(0, routeEditState.waypointCount - 2)}`;

  const onPlayAllPress = () => {
    const shell = shellRef.current;
    if (!shell) return;
    shell.playAll();
  };

  const onPauseResumePress = () => {
    const shell = shellRef.current;
    if (!shell) return;
    if (isPlaying) {
      shell.pausePlayback();
      return;
    }
    if (isPaused) {
      shell.resumePlayback();
    }
  };

  const cycleSelectedEntity = (direction: "prev" | "next") => {
    const shell = shellRef.current;
    if (!shell) return;
    const tokens = shell.getTokens();
    if (tokens.length <= 0) return;
    const selectedId = shell.getSelectedToken()?.id ?? null;
    const selectedIndex = tokens.findIndex((token) => token.id === selectedId);
    const baseIndex = selectedIndex >= 0 ? selectedIndex : 0;
    const delta = direction === "next" ? 1 : -1;
    const nextIndex = (baseIndex + delta + tokens.length) % tokens.length;
    const nextToken = tokens[nextIndex];
    if (!nextToken) return;
    shell.setSelectedToken(nextToken.id);
  };

  const onClearRoutePress = () => {
    shellRef.current?.clearSelectedRoute();
  };

  return (
    <OrientationGate modeLabel="Movement Board Playback Core">
      <div style={ROOT_STYLE}>
        <div ref={hostRef} style={BOARD_STYLE} />
        <button
          type="button"
          style={MENU_TOGGLE_STYLE}
          onClick={() => setIsMenuOpen((previous) => !previous)}
          aria-label={isMenuOpen ? "Close movement controls" : "Open movement controls"}
        >
          {isMenuOpen ? "×" : "≡"}
        </button>
        {isMenuOpen ? (
          <aside style={MENU_PANEL_STYLE}>
            <div style={MENU_HEADER_STYLE}>
              <div style={MENU_TITLE_STYLE}>Movement Board</div>
              <div style={MENU_SUBTITLE_STYLE}>{selectedLabel}</div>
              <div style={MENU_SUBTITLE_STYLE}>{routeLabel}</div>
            </div>

            <section style={SECTION_STYLE}>
              <div style={SECTION_TITLE_STYLE}>Mode</div>
              <div style={MODE_GRID_STYLE}>
                <button
                  type="button"
                  style={mode === "setup" ? ACTIVE_BUTTON_STYLE : CONTROL_BUTTON_STYLE}
                  onClick={() => setMode("setup")}
                  disabled={isPlaying || isPaused}
                >
                  Move
                </button>
                <button
                  type="button"
                  style={mode === "route" ? ACTIVE_BUTTON_STYLE : CONTROL_BUTTON_STYLE}
                  onClick={() => setMode("route")}
                  disabled={isPlaying || isPaused}
                >
                  Route
                </button>
                <button type="button" style={DISABLED_BUTTON_STYLE} disabled>
                  Ball
                </button>
                <button
                  type="button"
                  style={mode === "play" ? ACTIVE_BUTTON_STYLE : CONTROL_BUTTON_STYLE}
                  onClick={() => setMode("play")}
                >
                  Play
                </button>
              </div>
            </section>

            <section style={SECTION_STYLE}>
              <div style={SECTION_TITLE_STYLE}>Route</div>
              <div style={BUTTON_GRID_STYLE}>
                <button
                  type="button"
                  style={CONTROL_BUTTON_STYLE}
                  onClick={() => cycleSelectedEntity("prev")}
                  disabled={isPlaying}
                >
                  Prev Player
                </button>
                <button
                  type="button"
                  style={CONTROL_BUTTON_STYLE}
                  onClick={() => cycleSelectedEntity("next")}
                  disabled={isPlaying}
                >
                  Next Player
                </button>
                <button
                  type="button"
                  style={mode === "route" ? CONTROL_BUTTON_STYLE : DISABLED_BUTTON_STYLE}
                  onClick={() => shellRef.current?.removeSelectedWaypoint()}
                  disabled={mode !== "route" || !routeEditState.canRemoveSelectedWaypoint || isPlaying}
                >
                  Remove Point
                </button>
                <button
                  type="button"
                  style={mode === "route" ? CONTROL_BUTTON_STYLE : DISABLED_BUTTON_STYLE}
                  onClick={onClearRoutePress}
                  disabled={mode !== "route" || routeEditState.waypointCount < 2 || isPlaying}
                >
                  Clear Route
                </button>
              </div>
              <div style={ENTITY_LABEL_STYLE}>
                {selectedToken ? `Selected P${selectedToken.number}` : "No player selected"}
              </div>
            </section>

            <section style={SECTION_STYLE}>
              <div style={SECTION_TITLE_STYLE}>Playback</div>
              <div style={BUTTON_GRID_STYLE}>
                <button
                  type="button"
                  style={CONTROL_BUTTON_STYLE}
                  onClick={onPlayAllPress}
                  disabled={isPortrait || isPlaying || isPaused}
                >
                  Play Routes / All
                </button>
                <button
                  type="button"
                  style={isPlaying || isPaused ? CONTROL_BUTTON_STYLE : DISABLED_BUTTON_STYLE}
                  onClick={onPauseResumePress}
                  disabled={!isPlaying && !isPaused}
                >
                  {isPlaying ? "Pause" : "Resume"}
                </button>
                <button
                  type="button"
                  style={CONTROL_BUTTON_STYLE}
                  onClick={() => shellRef.current?.reset()}
                >
                  Reset
                </button>
              </div>
            </section>

            <section style={SECTION_STYLE}>
              <div style={SECTION_TITLE_STYLE}>Timing</div>
              <div style={BUTTON_GRID_STYLE}>
                <button
                  type="button"
                  style={playbackSpeed === "slow" ? ACTIVE_BUTTON_STYLE : CONTROL_BUTTON_STYLE}
                  onClick={() => setPlaybackSpeed("slow")}
                >
                  Slow
                </button>
                <button
                  type="button"
                  style={playbackSpeed === "normal" ? ACTIVE_BUTTON_STYLE : CONTROL_BUTTON_STYLE}
                  onClick={() => setPlaybackSpeed("normal")}
                >
                  Normal
                </button>
                <button
                  type="button"
                  style={playbackSpeed === "fast" ? ACTIVE_BUTTON_STYLE : CONTROL_BUTTON_STYLE}
                  onClick={() => setPlaybackSpeed("fast")}
                >
                  Fast
                </button>
              </div>
            </section>

            <section style={SECTION_STYLE}>
              <div style={SECTION_TITLE_STYLE}>Phase</div>
              <div style={BUTTON_GRID_STYLE}>
                <button type="button" style={DISABLED_BUTTON_STYLE} disabled>
                  Set Start
                </button>
                <button type="button" style={DISABLED_BUTTON_STYLE} disabled>
                  Add Phase
                </button>
                <button type="button" style={DISABLED_BUTTON_STYLE} disabled>
                  Undo Phase
                </button>
              </div>
            </section>
          </aside>
        ) : null}
      </div>
    </OrientationGate>
  );
}

