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

const HUD_STYLE: CSSProperties = {
  position: "fixed",
  top: "10px",
  left: "50%",
  transform: "translateX(-50%)",
  zIndex: 14,
  display: "grid",
  gap: "8px",
};

const CONTROL_ROW_STYLE: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "6px",
  padding: "6px",
  borderRadius: "999px",
  border: "1px solid rgba(214, 245, 225, 0.32)",
  background: "rgba(8, 20, 15, 0.74)",
  backdropFilter: "blur(8px)",
  WebkitBackdropFilter: "blur(8px)",
};

const CONTROL_BUTTON_STYLE: CSSProperties = {
  border: "none",
  borderRadius: "999px",
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: "11px",
  fontWeight: 700,
  letterSpacing: "0.02em",
  textTransform: "uppercase",
  padding: "7px 10px",
  color: "#e5fff0",
  background: "rgba(255, 255, 255, 0.1)",
};

const ACTIVE_BUTTON_STYLE: CSSProperties = {
  ...CONTROL_BUTTON_STYLE,
  background: "rgba(113, 242, 162, 0.25)",
};

const INFO_STYLE: CSSProperties = {
  position: "fixed",
  left: "50%",
  bottom: "14px",
  transform: "translateX(-50%)",
  zIndex: 10,
  color: "#e6f4eb",
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: "13px",
  fontWeight: 600,
  letterSpacing: "0.01em",
  padding: "8px 12px",
  borderRadius: "10px",
  border: "1px solid rgba(214, 245, 225, 0.24)",
  background: "rgba(8, 20, 15, 0.74)",
  backdropFilter: "blur(8px)",
  WebkitBackdropFilter: "blur(8px)",
};

const ENTITY_LABEL_STYLE: CSSProperties = {
  color: "#e8fff2",
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: "11px",
  fontWeight: 700,
  letterSpacing: "0.03em",
  textTransform: "uppercase",
  minWidth: "84px",
  textAlign: "center",
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

  const onPlayControlPress = () => {
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

  return (
    <OrientationGate modeLabel="Movement Board Playback Core">
      <div style={ROOT_STYLE}>
        <div ref={hostRef} style={BOARD_STYLE} />
        <div style={HUD_STYLE}>
          <div style={CONTROL_ROW_STYLE}>
            <button
              type="button"
              style={mode === "setup" ? ACTIVE_BUTTON_STYLE : CONTROL_BUTTON_STYLE}
              onClick={() => setMode("setup")}
              disabled={isPlaying || isPaused}
            >
              Setup
            </button>
            <button
              type="button"
              style={mode === "route" ? ACTIVE_BUTTON_STYLE : CONTROL_BUTTON_STYLE}
              onClick={() => setMode("route")}
              disabled={isPlaying || isPaused}
            >
              Route
            </button>
            <button
              type="button"
              style={mode === "play" ? ACTIVE_BUTTON_STYLE : CONTROL_BUTTON_STYLE}
              onClick={() => setMode("play")}
            >
              Play
            </button>
          </div>
          <div style={CONTROL_ROW_STYLE}>
            <button
              type="button"
              style={CONTROL_BUTTON_STYLE}
              onClick={() => cycleSelectedEntity("prev")}
              disabled={isPlaying}
            >
              Prev
            </button>
            <span style={ENTITY_LABEL_STYLE}>
              {selectedToken ? `P${selectedToken.number}` : "No player"}
            </span>
            <button
              type="button"
              style={CONTROL_BUTTON_STYLE}
              onClick={() => cycleSelectedEntity("next")}
              disabled={isPlaying}
            >
              Next
            </button>
            <button
              type="button"
              style={CONTROL_BUTTON_STYLE}
              onClick={() => shellRef.current?.removeSelectedWaypoint()}
              disabled={mode !== "route" || !routeEditState.canRemoveSelectedWaypoint || isPlaying}
            >
              Remove Point
            </button>
          </div>
          <div style={CONTROL_ROW_STYLE}>
            <button
              type="button"
              style={CONTROL_BUTTON_STYLE}
              onClick={onPlayControlPress}
              disabled={isPortrait}
            >
              {isPlaying ? "Pause" : isPaused ? "Resume" : "Play All"}
            </button>
            <button
              type="button"
              style={CONTROL_BUTTON_STYLE}
              onClick={() => shellRef.current?.reset()}
            >
              Reset
            </button>
          </div>
          <div style={CONTROL_ROW_STYLE}>
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
        </div>
        <div style={INFO_STYLE}>{selectedLabel} • {routeLabel}</div>
      </div>
    </OrientationGate>
  );
}

