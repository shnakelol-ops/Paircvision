import { useEffect, useRef, useState, type CSSProperties } from "react";

import OrientationGate, { usePortraitOrientation } from "../components/OrientationGate";
import { createMovementCanvasShell } from "../movement-board/shell/createMovementCanvasShell";
import type {
  MovementBoardMode,
  MovementBoardToken,
  MovementCanvasShellHandle,
  MovementPlaybackSpeed,
  MovementRouteEditState,
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

const BACK_BUTTON_STYLE: CSSProperties = {
  position: "fixed",
  left: "max(10px, calc(env(safe-area-inset-left, 0px) + 8px))",
  top: "max(10px, calc(env(safe-area-inset-top, 0px) + 8px))",
  zIndex: 13,
  height: "34px",
  minWidth: "58px",
  borderRadius: "999px",
  border: "1px solid rgba(214, 245, 225, 0.3)",
  background: "rgba(8, 20, 15, 0.74)",
  color: "#e6f4eb",
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: "10px",
  fontWeight: 700,
  letterSpacing: "0.03em",
  textTransform: "uppercase",
  padding: "0 12px",
  cursor: "pointer",
  backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)",
  boxShadow: "0 8px 18px rgba(0, 0, 0, 0.28), inset 0 1px 0 rgba(255, 255, 255, 0.12)",
};

const CTRL_BUBBLE_STYLE: CSSProperties = {
  position: "fixed",
  left: "max(10px, calc(env(safe-area-inset-left, 0px) + 8px))",
  bottom: "max(10px, calc(env(safe-area-inset-bottom, 0px) + 8px))",
  zIndex: 22,
  height: "38px",
  minWidth: "68px",
  borderRadius: "999px",
  border: "1px solid rgba(220, 236, 228, 0.28)",
  background: "rgba(9, 22, 18, 0.62)",
  color: "#f2fff5",
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: "11px",
  fontWeight: 800,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  padding: "0 14px",
  cursor: "pointer",
  backdropFilter: "blur(14px)",
  WebkitBackdropFilter: "blur(14px)",
  boxShadow: "0 12px 26px rgba(1, 7, 4, 0.42), inset 0 1px 0 rgba(255, 255, 255, 0.2)",
};

const PV_BADGE_STYLE: CSSProperties = {
  position: "fixed",
  left: "max(12px, calc(env(safe-area-inset-left, 0px) + 10px))",
  bottom: "max(56px, calc(env(safe-area-inset-bottom, 0px) + 54px))",
  zIndex: 21,
  height: "22px",
  minWidth: "32px",
  borderRadius: "999px",
  border: "1px solid rgba(220, 236, 228, 0.2)",
  background: "rgba(9, 22, 18, 0.5)",
  color: "rgba(232, 245, 238, 0.92)",
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: "9px",
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  padding: "0 8px",
  backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)",
};

const CONTROL_PANEL_STYLE: CSSProperties = {
  position: "fixed",
  left: "max(10px, calc(env(safe-area-inset-left, 0px) + 8px))",
  bottom: "max(56px, calc(env(safe-area-inset-bottom, 0px) + 54px))",
  zIndex: 21,
  width: "max-content",
  maxWidth: "min(520px, calc(100vw - 20px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px)))",
  display: "grid",
  gap: "3px",
};

const PANEL_ROW_STYLE: CSSProperties = {
  borderRadius: "999px",
  border: "1px solid rgba(220, 236, 228, 0.26)",
  background: "rgba(9, 22, 18, 0.62)",
  backdropFilter: "blur(14px)",
  WebkitBackdropFilter: "blur(14px)",
  boxShadow: "0 10px 22px rgba(1, 7, 4, 0.34), inset 0 1px 0 rgba(255, 255, 255, 0.16)",
  padding: "2px",
  display: "flex",
  alignItems: "center",
  justifyContent: "flex-start",
  gap: "2px",
  flexWrap: "nowrap",
  overflowX: "auto",
  scrollbarWidth: "none",
  msOverflowStyle: "none",
};

const MODE_BUTTON_STYLE: CSSProperties = {
  minWidth: "52px",
  height: "28px",
  borderRadius: "999px",
  border: "1px solid rgba(212, 229, 222, 0.26)",
  background: "rgba(14, 30, 24, 0.66)",
  color: "rgba(230, 244, 236, 0.9)",
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: "9px",
  fontWeight: 640,
  letterSpacing: "0.12px",
  textTransform: "uppercase",
  padding: "0 9px",
  cursor: "pointer",
  whiteSpace: "nowrap",
  boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.14)",
};

const MODE_BUTTON_ACTIVE_STYLE: CSSProperties = {
  ...MODE_BUTTON_STYLE,
  border: "1px solid rgba(124, 255, 114, 0.56)",
  background: "linear-gradient(180deg, rgba(34, 112, 66, 0.82) 0%, rgba(14, 42, 27, 0.94) 100%)",
  color: "#f4fff6",
  boxShadow: "0 0 0 1px rgba(124, 255, 114, 0.22), inset 0 1px 0 rgba(255, 255, 255, 0.2)",
};

const TOOL_BUTTON_STYLE: CSSProperties = {
  height: "31px",
  minWidth: "68px",
  borderRadius: "999px",
  border: "1px solid rgba(255, 255, 255, 0.25)",
  background: "rgba(20, 25, 30, 0.65)",
  color: "rgba(255, 255, 255, 0.95)",
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: "9px",
  fontWeight: 600,
  letterSpacing: "0.1px",
  padding: "0 10px",
  cursor: "pointer",
  textTransform: "uppercase",
  whiteSpace: "nowrap",
  backdropFilter: "blur(12px)",
  WebkitBackdropFilter: "blur(12px)",
  boxShadow: "0 6px 16px rgba(0, 0, 0, 0.28), inset 0 1px 2px rgba(255, 255, 255, 0.18)",
};

const TOOL_ACTIVE_STYLE: CSSProperties = {
  ...TOOL_BUTTON_STYLE,
  border: "1px solid rgba(124, 255, 114, 0.58)",
  background: "rgba(22, 67, 44, 0.78)",
  color: "#f4fff6",
};

const TOOL_DISABLED_STYLE: CSSProperties = {
  ...TOOL_BUTTON_STYLE,
  opacity: 0.45,
  boxShadow: "inset 0 1px 1px rgba(255, 255, 255, 0.08)",
  cursor: "not-allowed",
};

const COLLAPSE_BUTTON_STYLE: CSSProperties = {
  ...TOOL_BUTTON_STYLE,
  minWidth: "62px",
};

const PLAYBACK_SIDE_STYLE: CSSProperties = {
  position: "fixed",
  right: "max(10px, calc(env(safe-area-inset-right, 0px) + 8px))",
  bottom: "max(84px, calc(env(safe-area-inset-bottom, 0px) + 82px))",
  zIndex: 21,
  display: "grid",
  gap: "3px",
};

const PLAYBACK_SIDE_BUTTON_STYLE: CSSProperties = {
  ...TOOL_BUTTON_STYLE,
  minWidth: "76px",
  height: "29px",
  padding: "0 8px",
};

export default function MovementBoardCanvasShellPage() {
  type MovementMenuMode = "move" | "route" | "ball" | "play";

  const toShellMode = (menuMode: MovementMenuMode): MovementBoardMode =>
    menuMode === "route"
      ? "route"
      : menuMode === "play"
        ? "play"
        : menuMode === "ball"
          ? "ball"
          : "setup";

  const toMenuMode = (shellMode: MovementBoardMode): MovementMenuMode =>
    shellMode === "route"
      ? "route"
      : shellMode === "play"
        ? "play"
        : shellMode === "ball"
          ? "ball"
          : "move";

  const isPortrait = usePortraitOrientation();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const shellRef = useRef<MovementCanvasShellHandle | null>(null);
  const [menuMode, setMenuMode] = useState<MovementMenuMode>("move");
  const [playbackSpeed, setPlaybackSpeed] = useState<MovementPlaybackSpeed>("normal");
  const [selectedToken, setSelectedToken] = useState<MovementBoardToken | null>(null);
  const [routeCount, setRouteCount] = useState(0);
  const [routeEditState, setRouteEditState] = useState<MovementRouteEditState>({
    waypointCount: 0,
    selectedWaypointIndex: null,
    canRemoveSelectedWaypoint: false,
  });
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isControlsOpen, setIsControlsOpen] = useState(false);

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

  useEffect(() => {
    if (isPlaying) {
      setIsControlsOpen(false);
    }
  }, [isPlaying]);

  const modeLabelByMenu: Record<MovementMenuMode, string> = {
    move: "Move Mode",
    route: "Route Mode",
    ball: "Ball Mode",
    play: "Play Mode",
  };
  const coachInfoLabel = selectedToken
    ? `Selected P${selectedToken.number} • Routes ${routeCount}`
    : `${modeLabelByMenu[menuMode]} • Routes ${routeCount}`;

  const onPlayRoutesPress = () => {
    const shell = shellRef.current;
    if (!shell) return;
    setIsControlsOpen(false);
    shell.playAll();
    setMenuMode("play");
  };

  const onPlayAllPress = () => {
    const shell = shellRef.current;
    if (!shell) return;
    setIsControlsOpen(false);
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
      return;
    }
    shell.playAll();
  };

  const onPausePress = () => {
    if (!isPlaying) return;
    shellRef.current?.pausePlayback();
  };

  const onPlayResumePress = () => {
    const shell = shellRef.current;
    if (!shell) return;
    if (isPaused) {
      shell.resumePlayback();
      return;
    }
    if (!isPlaying) {
      shell.playAll();
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

  const goBack = () => {
    if (typeof window === "undefined") return;
    const referrer = document.referrer;
    const hasSameOriginReferrer = (() => {
      if (!referrer) return false;
      try {
        return new URL(referrer).origin === window.location.origin;
      } catch {
        return false;
      }
    })();
    if (hasSameOriginReferrer || window.history.length > 1) {
      window.history.back();
      return;
    }
    window.location.assign("/vision-board");
  };

  const modeIsPlaybackLocked = isPlaying || isPaused;
  const clearRouteDisabled = menuMode !== "route" || routeEditState.waypointCount < 2 || isPlaying;
  const removePointDisabled = menuMode !== "route" || !routeEditState.canRemoveSelectedWaypoint || isPlaying;
  const playRoutesDisabled = isPortrait || isPlaying || isPaused;
  const playAllDisabled = isPortrait || isPlaying || isPaused;
  const pauseResumeDisabled = !isPlaying && !isPaused;
  const playbackFloatingVisible = isPlaying || isPaused;

  return (
    <OrientationGate modeLabel="Movement Board Playback Core">
      <div style={ROOT_STYLE}>
        <div ref={hostRef} style={BOARD_STYLE} />
        <button type="button" style={BACK_BUTTON_STYLE} onClick={goBack}>
          Back
        </button>
        <div style={INFO_PILL_STYLE}>{coachInfoLabel}</div>

        <div style={PV_BADGE_STYLE}>PV</div>
        <button type="button" style={CTRL_BUBBLE_STYLE} onClick={() => setIsControlsOpen((prev) => !prev)}>
          CTRL
        </button>

        {isControlsOpen ? (
          <div style={CONTROL_PANEL_STYLE}>
            <div style={PANEL_ROW_STYLE}>
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
              <button type="button" style={COLLAPSE_BUTTON_STYLE} onClick={() => setIsControlsOpen(false)}>
                Hide
              </button>
            </div>

            <div style={PANEL_ROW_STYLE}>
              {menuMode === "move" ? (
                <>
                  <button type="button" style={TOOL_DISABLED_STYLE} disabled>
                    Set Start
                  </button>
                  <button type="button" style={TOOL_DISABLED_STYLE} disabled>
                    Add Phase
                  </button>
                  <button type="button" style={TOOL_BUTTON_STYLE} onClick={resetBoard}>
                    Reset
                  </button>
                </>
              ) : null}

              {menuMode === "route" ? (
                <>
                  <button
                    type="button"
                    style={isPlaying ? TOOL_DISABLED_STYLE : TOOL_BUTTON_STYLE}
                    onClick={() => cycleSelectedEntity("prev")}
                    disabled={isPlaying}
                  >
                    Prev
                  </button>
                  <button
                    type="button"
                    style={isPlaying ? TOOL_DISABLED_STYLE : TOOL_BUTTON_STYLE}
                    onClick={() => cycleSelectedEntity("next")}
                    disabled={isPlaying}
                  >
                    Next
                  </button>
                  <button
                    type="button"
                    style={removePointDisabled ? TOOL_DISABLED_STYLE : TOOL_BUTTON_STYLE}
                    onClick={() => shellRef.current?.removeSelectedWaypoint()}
                    disabled={removePointDisabled}
                  >
                    Remove
                  </button>
                  <button
                    type="button"
                    style={clearRouteDisabled ? TOOL_DISABLED_STYLE : TOOL_BUTTON_STYLE}
                    onClick={clearRoute}
                    disabled={clearRouteDisabled}
                  >
                    Clear Route
                  </button>
                  <button
                    type="button"
                    style={playRoutesDisabled ? TOOL_DISABLED_STYLE : TOOL_BUTTON_STYLE}
                    onClick={onPlayRoutesPress}
                    disabled={playRoutesDisabled}
                  >
                    Play Routes
                  </button>
                </>
              ) : null}

              {menuMode === "play" ? (
                <>
                  <button
                    type="button"
                    style={playAllDisabled ? TOOL_DISABLED_STYLE : TOOL_BUTTON_STYLE}
                    onClick={onPlayAllPress}
                    disabled={playAllDisabled}
                  >
                    Play All
                  </button>
                  <button
                    type="button"
                    style={pauseResumeDisabled ? TOOL_DISABLED_STYLE : TOOL_BUTTON_STYLE}
                    onClick={onPauseResumePress}
                    disabled={pauseResumeDisabled}
                  >
                    {isPlaying ? "Pause" : "Resume"}
                  </button>
                  <button type="button" style={TOOL_BUTTON_STYLE} onClick={resetBoard}>
                    Reset
                  </button>
                  <button
                    type="button"
                    style={playbackSpeed === "slow" ? TOOL_ACTIVE_STYLE : TOOL_BUTTON_STYLE}
                    onClick={() => setPlaybackSpeed("slow")}
                  >
                    Slow
                  </button>
                  <button
                    type="button"
                    style={playbackSpeed === "normal" ? TOOL_ACTIVE_STYLE : TOOL_BUTTON_STYLE}
                    onClick={() => setPlaybackSpeed("normal")}
                  >
                    Normal
                  </button>
                  <button
                    type="button"
                    style={playbackSpeed === "fast" ? TOOL_ACTIVE_STYLE : TOOL_BUTTON_STYLE}
                    onClick={() => setPlaybackSpeed("fast")}
                  >
                    Fast
                  </button>
                </>
              ) : null}

              {menuMode === "ball" ? (
                <>
                  <button type="button" style={TOOL_DISABLED_STYLE} disabled>
                    Attach
                  </button>
                  <button type="button" style={TOOL_DISABLED_STYLE} disabled>
                    Pass
                  </button>
                  <button type="button" style={TOOL_BUTTON_STYLE} onClick={() => shellRef.current?.freeBall()}>
                    Free
                  </button>
                </>
              ) : null}
            </div>
          </div>
        ) : null}

        {playbackFloatingVisible ? (
          <div style={PLAYBACK_SIDE_STYLE}>
            <button
              type="button"
              style={isPlaying ? TOOL_DISABLED_STYLE : PLAYBACK_SIDE_BUTTON_STYLE}
              onClick={onPlayResumePress}
              disabled={isPlaying}
            >
              {isPaused ? "Resume" : "Play/Resume"}
            </button>
            <button
              type="button"
              style={!isPlaying ? TOOL_DISABLED_STYLE : PLAYBACK_SIDE_BUTTON_STYLE}
              onClick={onPausePress}
              disabled={!isPlaying}
            >
              Pause
            </button>
            <button type="button" style={PLAYBACK_SIDE_BUTTON_STYLE} onClick={resetBoard}>
              Reset
            </button>
          </div>
        ) : null}
      </div>
    </OrientationGate>
  );
}

