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

const INFO_PILL_STYLE: CSSProperties = {
  position: "fixed",
  top: "max(10px, calc(env(safe-area-inset-top, 0px) + 8px))",
  left: "50%",
  transform: "translateX(-50%)",
  zIndex: 12,
  color: "#e6f4eb",
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: "11px",
  fontWeight: 600,
  letterSpacing: "0.02em",
  padding: "6px 10px",
  borderRadius: "999px",
  border: "1px solid rgba(214, 245, 225, 0.24)",
  background: "rgba(8, 20, 15, 0.74)",
  backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)",
};

const MODE_PILL_STYLE: CSSProperties = {
  position: "fixed",
  left: "50%",
  transform: "translateX(-50%)",
  bottom: "max(56px, calc(env(safe-area-inset-bottom, 0px) + 54px))",
  display: "inline-flex",
  alignItems: "center",
  gap: "4px",
  padding: "4px",
  borderRadius: "999px",
  border: "1px solid rgba(220, 236, 228, 0.26)",
  background: "rgba(9, 22, 18, 0.56)",
  backdropFilter: "blur(14px)",
  WebkitBackdropFilter: "blur(14px)",
  boxShadow: "0 12px 26px rgba(1, 7, 4, 0.42), inset 0 1px 0 rgba(255, 255, 255, 0.2)",
  zIndex: 20,
};

const MODE_BUTTON_STYLE: CSSProperties = {
  minWidth: "56px",
  height: "30px",
  borderRadius: "999px",
  border: "1px solid rgba(212, 229, 222, 0.26)",
  background: "rgba(14, 30, 24, 0.66)",
  color: "rgba(230, 244, 236, 0.9)",
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: "10px",
  fontWeight: 640,
  letterSpacing: "0.2px",
  textTransform: "uppercase",
  padding: "0 10px",
  cursor: "pointer",
  boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.14)",
};

const MODE_BUTTON_ACTIVE_STYLE: CSSProperties = {
  ...MODE_BUTTON_STYLE,
  border: "1px solid rgba(124, 255, 114, 0.56)",
  background: "linear-gradient(180deg, rgba(34, 112, 66, 0.82) 0%, rgba(14, 42, 27, 0.94) 100%)",
  color: "#f4fff6",
  boxShadow: "0 0 0 1px rgba(124, 255, 114, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.2)",
};

const DOCK_STYLE: CSSProperties = {
  position: "fixed",
  left: "50%",
  bottom: "max(10px, calc(env(safe-area-inset-bottom, 0px) + 8px))",
  transform: "translateX(-50%)",
  zIndex: 20,
  display: "grid",
  gap: "6px",
  width: "min(94vw, 620px)",
};

const DOCK_CARD_STYLE: CSSProperties = {
  borderRadius: "12px",
  border: "1px solid rgba(211, 224, 217, 0.3)",
  background: "rgba(10, 20, 16, 0.74)",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.16), 0 10px 24px rgba(0, 0, 0, 0.35)",
  padding: "8px",
};

const DOCK_ROW_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "6px",
  flexWrap: "wrap",
};

const CONTROL_BUTTON_STYLE: CSSProperties = {
  height: "34px",
  minWidth: "84px",
  borderRadius: "10px",
  border: "1px solid rgba(255, 255, 255, 0.25)",
  background: "rgba(20, 25, 30, 0.65)",
  color: "rgba(255, 255, 255, 0.95)",
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: "11px",
  fontWeight: 600,
  letterSpacing: "0.2px",
  padding: "0 11px",
  cursor: "pointer",
  textTransform: "uppercase",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  boxShadow: "0 6px 18px rgba(0, 0, 0, 0.3), inset 0 1px 2px rgba(255, 255, 255, 0.2)",
};

const BUTTON_ACTIVE_STYLE: CSSProperties = {
  ...CONTROL_BUTTON_STYLE,
  border: "1px solid rgba(124, 255, 114, 0.58)",
  background: "rgba(22, 67, 44, 0.78)",
  color: "#f4fff6",
};

const BUTTON_DISABLED_STYLE: CSSProperties = {
  ...CONTROL_BUTTON_STYLE,
  opacity: 0.45,
  boxShadow: "inset 0 1px 1px rgba(255, 255, 255, 0.08)",
  cursor: "not-allowed",
};

const ROUTE_INFO_STYLE: CSSProperties = {
  textAlign: "center",
  color: "rgba(228, 243, 236, 0.84)",
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: "10px",
  fontWeight: 600,
  letterSpacing: "0.16px",
};

export default function MovementBoardCanvasShellPage() {
  type MovementMenuMode = "move" | "route" | "ball" | "play";

  const toShellMode = (menuMode: MovementMenuMode): MovementBoardMode =>
    menuMode === "route"
      ? "route"
      : menuMode === "play"
        ? "play"
        : "setup";

  const toMenuMode = (shellMode: MovementBoardMode): MovementMenuMode =>
    shellMode === "route"
      ? "route"
      : shellMode === "play"
        ? "play"
        : "move";

  const isPortrait = usePortraitOrientation();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const shellRef = useRef<MovementCanvasShellHandle | null>(null);
  const [menuMode, setMenuMode] = useState<MovementMenuMode>("move");
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
        mode: toShellMode(menuMode),
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
        setMenuMode(toMenuMode(shell.getMode()));
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
    shellRef.current?.setMode(toShellMode(menuMode));
  }, [menuMode]);

  useEffect(() => {
    shellRef.current?.setPlaybackSpeed(playbackSpeed);
  }, [playbackSpeed]);

  const selectedLabel = selectedToken
    ? `P${selectedToken.number} • X ${selectedToken.position.x.toFixed(1)} • Y ${selectedToken.position.y.toFixed(1)}`
    : `${menuMode.toUpperCase()} • ${tokenCount} players`;

  const routeLabel = `Routes ${routeCount} • Selected bends ${Math.max(0, routeEditState.waypointCount - 2)}`;

  const onPlayRoutesPress = () => {
    const shell = shellRef.current;
    if (!shell) return;
    shell.playAll();
    setMenuMode("play");
  };

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

  const resetBoard = () => {
    shellRef.current?.reset();
  };

  const clearRoute = () => {
    shellRef.current?.clearSelectedRoute();
  };

  const modeIsPlaybackLocked = isPlaying || isPaused;
  const clearRouteDisabled = menuMode !== "route" || routeEditState.waypointCount < 2 || isPlaying;
  const removePointDisabled = menuMode !== "route" || !routeEditState.canRemoveSelectedWaypoint || isPlaying;
  const playRoutesDisabled = isPortrait || isPlaying || isPaused;
  const playAllDisabled = isPortrait || isPlaying || isPaused;
  const pauseResumeDisabled = !isPlaying && !isPaused;

  return (
    <OrientationGate modeLabel="Movement Board Playback Core">
      <div style={ROOT_STYLE}>
        <div ref={hostRef} style={BOARD_STYLE} />
        <div style={INFO_PILL_STYLE}>{selectedLabel} • {routeLabel}</div>

        <div style={MODE_PILL_STYLE} role="group" aria-label="Movement mode">
          {([
            { id: "move", label: "Move" },
            { id: "route", label: "Route" },
            { id: "ball", label: "Ball" },
            { id: "play", label: "Play" },
          ] as const).map((item) => (
            <button
              key={item.id}
              type="button"
              style={menuMode === item.id ? MODE_BUTTON_ACTIVE_STYLE : MODE_BUTTON_STYLE}
              disabled={modeIsPlaybackLocked}
              onClick={() => setMenuMode(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div style={DOCK_STYLE}>
          <div style={DOCK_CARD_STYLE}>
            {menuMode === "move" ? (
              <div style={DOCK_ROW_STYLE}>
                <button type="button" style={BUTTON_DISABLED_STYLE} disabled>
                  Set Start
                </button>
                <button type="button" style={BUTTON_DISABLED_STYLE} disabled>
                  Add Phase
                </button>
                <button type="button" style={CONTROL_BUTTON_STYLE} onClick={resetBoard}>
                  Reset
                </button>
              </div>
            ) : null}

            {menuMode === "route" ? (
              <>
                <div style={DOCK_ROW_STYLE}>
                  <button
                    type="button"
                    style={isPlaying ? BUTTON_DISABLED_STYLE : CONTROL_BUTTON_STYLE}
                    onClick={() => cycleSelectedEntity("prev")}
                    disabled={isPlaying}
                  >
                    Prev Player
                  </button>
                  <button
                    type="button"
                    style={isPlaying ? BUTTON_DISABLED_STYLE : CONTROL_BUTTON_STYLE}
                    onClick={() => cycleSelectedEntity("next")}
                    disabled={isPlaying}
                  >
                    Next Player
                  </button>
                  <button
                    type="button"
                    style={removePointDisabled ? BUTTON_DISABLED_STYLE : CONTROL_BUTTON_STYLE}
                    onClick={() => shellRef.current?.removeSelectedWaypoint()}
                    disabled={removePointDisabled}
                  >
                    Remove Point
                  </button>
                </div>
                <div style={DOCK_ROW_STYLE}>
                  <button
                    type="button"
                    style={clearRouteDisabled ? BUTTON_DISABLED_STYLE : CONTROL_BUTTON_STYLE}
                    onClick={clearRoute}
                    disabled={clearRouteDisabled}
                  >
                    Clear Route
                  </button>
                  <button
                    type="button"
                    style={playRoutesDisabled ? BUTTON_DISABLED_STYLE : CONTROL_BUTTON_STYLE}
                    onClick={onPlayRoutesPress}
                    disabled={playRoutesDisabled}
                  >
                    Play Routes
                  </button>
                </div>
                <div style={ROUTE_INFO_STYLE}>
                  {selectedToken ? `Selected P${selectedToken.number}` : "No player selected"}
                </div>
              </>
            ) : null}

            {menuMode === "play" ? (
              <>
                <div style={DOCK_ROW_STYLE}>
                  <button
                    type="button"
                    style={playAllDisabled ? BUTTON_DISABLED_STYLE : CONTROL_BUTTON_STYLE}
                    onClick={onPlayAllPress}
                    disabled={playAllDisabled}
                  >
                    Play All
                  </button>
                  <button
                    type="button"
                    style={pauseResumeDisabled ? BUTTON_DISABLED_STYLE : CONTROL_BUTTON_STYLE}
                    onClick={onPauseResumePress}
                    disabled={pauseResumeDisabled}
                  >
                    {isPlaying ? "Pause" : "Resume"}
                  </button>
                  <button type="button" style={CONTROL_BUTTON_STYLE} onClick={resetBoard}>
                    Reset
                  </button>
                </div>
                <div style={DOCK_ROW_STYLE}>
                  <button
                    type="button"
                    style={playbackSpeed === "slow" ? BUTTON_ACTIVE_STYLE : CONTROL_BUTTON_STYLE}
                    onClick={() => setPlaybackSpeed("slow")}
                  >
                    Slow
                  </button>
                  <button
                    type="button"
                    style={playbackSpeed === "normal" ? BUTTON_ACTIVE_STYLE : CONTROL_BUTTON_STYLE}
                    onClick={() => setPlaybackSpeed("normal")}
                  >
                    Normal
                  </button>
                  <button
                    type="button"
                    style={playbackSpeed === "fast" ? BUTTON_ACTIVE_STYLE : CONTROL_BUTTON_STYLE}
                    onClick={() => setPlaybackSpeed("fast")}
                  >
                    Fast
                  </button>
                </div>
              </>
            ) : null}

            {menuMode === "ball" ? (
              <div style={DOCK_ROW_STYLE}>
                <button type="button" style={BUTTON_DISABLED_STYLE} disabled>
                  Attach
                </button>
                <button type="button" style={BUTTON_DISABLED_STYLE} disabled>
                  Pass
                </button>
                <button type="button" style={BUTTON_DISABLED_STYLE} disabled>
                  Free Ball
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </OrientationGate>
  );
}

