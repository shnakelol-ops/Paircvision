import { useEffect, useRef, useState, type CSSProperties } from "react";

import OrientationGate, { usePortraitOrientation } from "../components/OrientationGate";
import {
  createMovementCanvasShell,
} from "../movement-board/shell/createMovementCanvasShell";
import type {
  MovementBoardMode,
  MovementBoardToken,
  MovementCanvasShellHandle,
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
  top: "12px",
  left: "50%",
  transform: "translateX(-50%)",
  zIndex: 14,
  display: "grid",
  gap: "8px",
};

const ROW_STYLE: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "6px",
  padding: "6px",
  borderRadius: "999px",
  border: "1px solid rgba(214, 245, 225, 0.24)",
  background: "rgba(8, 20, 15, 0.74)",
  backdropFilter: "blur(8px)",
  WebkitBackdropFilter: "blur(8px)",
};

const BUTTON_STYLE: CSSProperties = {
  border: "none",
  borderRadius: "999px",
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: "11px",
  fontWeight: 700,
  letterSpacing: "0.02em",
  padding: "7px 11px",
  background: "rgba(255, 255, 255, 0.09)",
  color: "#d7fbe7",
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

export default function MovementBoardCanvasShellPage() {
  const isPortrait = usePortraitOrientation();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const shellRef = useRef<MovementCanvasShellHandle | null>(null);
  const [mode, setMode] = useState<MovementBoardMode>("setup");
  const [selectedToken, setSelectedToken] = useState<MovementBoardToken | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [routeCount, setRouteCount] = useState(0);
  const [tokenCount, setTokenCount] = useState(0);

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
        dragEnabled: !isPortrait,
        onSelectedTokenChange: (token) => setSelectedToken(token),
        onRoutesChange: (routes) => setRouteCount(routes.length),
        onPlaybackStateChange: (state) => setIsPlaying(state.isPlaying),
        onTokenMove: (token) => {
          setSelectedToken((previous) => (previous && previous.id === token.id ? token : previous));
        },
      }).then((shell) => {
        if (disposed) {
          shell.destroy();
          return;
        }
        shellRef.current = shell;
        setTokenCount(shell.getTokens().length);
        setSelectedToken(shell.getSelectedToken());
        setRouteCount(shell.getRoutes().length);
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
    const shell = shellRef.current;
    if (!shell) return;
    shell.setMode(mode);
  }, [mode]);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    shell.setDragEnabled(!isPortrait);
  }, [isPortrait]);

  const infoLabel = selectedToken
    ? `P${selectedToken.number} • X ${selectedToken.position.x.toFixed(1)} • Y ${selectedToken.position.y.toFixed(1)}`
    : mode === "setup"
      ? `Setup Mode • ${tokenCount} players`
      : `Route Mode • ${routeCount} routes`;

  return (
    <OrientationGate modeLabel="Movement Board Labs">
      <div style={ROOT_STYLE}>
        <div ref={hostRef} style={BOARD_STYLE} />
        <div style={HUD_STYLE}>
          <div style={ROW_STYLE}>
            <button
              type="button"
              style={{
                ...BUTTON_STYLE,
                background: mode === "setup" ? "rgba(113, 242, 162, 0.26)" : BUTTON_STYLE.background,
              }}
              onClick={() => setMode("setup")}
              disabled={isPlaying}
            >
              Setup
            </button>
            <button
              type="button"
              style={{
                ...BUTTON_STYLE,
                background: mode === "route" ? "rgba(56, 189, 248, 0.24)" : BUTTON_STYLE.background,
              }}
              onClick={() => setMode("route")}
              disabled={isPlaying}
            >
              Route
            </button>
          </div>
          <div style={ROW_STYLE}>
            <button
              type="button"
              style={BUTTON_STYLE}
              onClick={() => shellRef.current?.play("selected")}
              disabled={isPortrait || isPlaying || !selectedToken}
            >
              Play Selected
            </button>
            <button
              type="button"
              style={BUTTON_STYLE}
              onClick={() => shellRef.current?.play("all")}
              disabled={isPortrait || isPlaying}
            >
              Play All
            </button>
            <button
              type="button"
              style={BUTTON_STYLE}
              onClick={() => shellRef.current?.reset()}
            >
              Reset
            </button>
          </div>
        </div>
        <div style={INFO_STYLE}>{infoLabel}</div>
      </div>
    </OrientationGate>
  );
}

