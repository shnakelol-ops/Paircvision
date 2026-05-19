import { useEffect, useRef, useState, type CSSProperties } from "react";

import OrientationGate from "../components/OrientationGate";
import {
  createMovementCanvasShell,
} from "../movement-board/shell/createMovementCanvasShell";
import type { MovementCanvasShellHandle } from "../movement-board/shell/types";

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
  const hostRef = useRef<HTMLDivElement | null>(null);
  const shellRef = useRef<MovementCanvasShellHandle | null>(null);
  const [lastTap, setLastTap] = useState<{ x: number; y: number } | null>(null);
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
        onPitchTap: ({ point }) => setLastTap({ x: point.x, y: point.y }),
      }).then((shell) => {
        if (disposed) {
          shell.destroy();
          return;
        }
        shellRef.current = shell;
        setTokenCount(shell.getTokens().length);
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

  const tapLabel = lastTap
    ? `Tap ${lastTap.x.toFixed(1)} / ${lastTap.y.toFixed(1)} • ${tokenCount} tokens`
    : `Drag tokens to set shape • ${tokenCount} tokens`;

  return (
    <OrientationGate modeLabel="Movement Board Canvas Shell">
      <div style={ROOT_STYLE}>
        <div ref={hostRef} style={BOARD_STYLE} />
        <div style={INFO_STYLE}>{tapLabel}</div>
      </div>
    </OrientationGate>
  );
}

