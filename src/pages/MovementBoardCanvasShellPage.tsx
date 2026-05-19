import { useEffect, useRef, useState, type CSSProperties } from "react";

import OrientationGate, { usePortraitOrientation } from "../components/OrientationGate";
import {
  createMovementCanvasShell,
} from "../movement-board/shell/createMovementCanvasShell";
import type {
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

const MODE_PILL_STYLE: CSSProperties = {
  position: "fixed",
  top: "10px",
  left: "50%",
  transform: "translateX(-50%)",
  zIndex: 12,
  display: "inline-flex",
  alignItems: "center",
  gap: "8px",
  color: "#ecfff4",
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: "12px",
  fontWeight: 700,
  letterSpacing: "0.03em",
  textTransform: "uppercase",
  padding: "7px 11px",
  borderRadius: "999px",
  border: "1px solid rgba(214, 245, 225, 0.32)",
  background: "rgba(8, 20, 15, 0.74)",
  backdropFilter: "blur(8px)",
  WebkitBackdropFilter: "blur(8px)",
};

const MODE_DOT_STYLE: CSSProperties = {
  width: "8px",
  height: "8px",
  borderRadius: "999px",
  background: "#71f2a2",
  boxShadow: "0 0 0 3px rgba(113, 242, 162, 0.2)",
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
  const [selectedToken, setSelectedToken] = useState<MovementBoardToken | null>(null);
  const [tokenCount, setTokenCount] = useState(0);
  const [tokens, setTokens] = useState<MovementBoardToken[]>([]);

  const upsertToken = (nextToken: MovementBoardToken) => {
    setTokens((previous) => {
      const index = previous.findIndex((token) => token.id === nextToken.id);
      if (index < 0) return [...previous, nextToken];
      const updated = previous.slice();
      updated[index] = nextToken;
      return updated;
    });
  };

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
        dragEnabled: !isPortrait,
        onTokenMove: (token) => {
          upsertToken(token);
          setSelectedToken((currentSelected) =>
            currentSelected?.id === token.id ? token : currentSelected,
          );
        },
        onSelectedTokenChange: (token) => {
          setSelectedToken(token);
        },
      }).then((shell) => {
        if (disposed) {
          shell.destroy();
          return;
        }
        shellRef.current = shell;
        const initialTokens = shell.getTokens();
        setTokenCount(initialTokens.length);
        setTokens(initialTokens);
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
    setTokenCount(tokens.length);
  }, [tokens]);

  const selectedLabel = selectedToken
    ? `P${selectedToken.number} • X ${selectedToken.position.x.toFixed(1)} • Y ${selectedToken.position.y.toFixed(1)}`
    : isPortrait
      ? `Rotate to landscape • ${tokenCount} players`
      : `Tap a player • ${tokenCount} players`;

  return (
    <OrientationGate modeLabel="Movement Board Setup Mode">
      <div style={ROOT_STYLE}>
        <div ref={hostRef} style={BOARD_STYLE} />
        <div style={MODE_PILL_STYLE} role="status" aria-live="polite">
          <span style={MODE_DOT_STYLE} aria-hidden />
          Setup Mode
        </div>
        <div style={INFO_STYLE}>{selectedLabel}</div>
      </div>
    </OrientationGate>
  );
}

