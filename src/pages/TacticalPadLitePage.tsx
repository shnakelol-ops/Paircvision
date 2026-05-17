import { useEffect, useRef, useState, type CSSProperties } from "react";

import {
  createTacticalPadLiteSurface,
  type TacticalPadLiteSurface,
} from "../engine/pixi/createTacticalPadLiteSurface";
import OrientationGate from "../components/OrientationGate";

const ROOT_STYLE: CSSProperties = {
  position: "fixed",
  inset: 0,
  margin: 0,
  background: "#0b1110",
  display: "grid",
  placeItems: "center",
};

const BOARD_STYLE: CSSProperties = {
  width: "min(96vw, 1200px)",
  height: "min(88vh, 760px)",
  borderRadius: "12px",
  overflow: "hidden",
  boxShadow: "0 20px 44px rgba(0, 0, 0, 0.38)",
  background: "#13221d",
};

const CONTROLS_STYLE: CSSProperties = {
  position: "fixed",
  left: "50%",
  bottom: "22px",
  transform: "translateX(-50%)",
  display: "flex",
  gap: "10px",
  zIndex: 5,
};

const BUTTON_STYLE: CSSProperties = {
  border: "1px solid rgba(225, 243, 235, 0.48)",
  borderRadius: "10px",
  background: "rgba(10, 22, 18, 0.88)",
  color: "#e7f6ee",
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: "13px",
  fontWeight: 600,
  padding: "8px 13px",
  cursor: "pointer",
};

const PHASE_COUNT_STYLE: CSSProperties = {
  border: "1px solid rgba(225, 243, 235, 0.3)",
  borderRadius: "10px",
  background: "rgba(10, 22, 18, 0.72)",
  color: "#e7f6ee",
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: "13px",
  fontWeight: 600,
  padding: "8px 13px",
};

const HOME_BUTTON_STYLE: CSSProperties = {
  position: "fixed",
  top: "max(12px, calc(env(safe-area-inset-top, 0px) + 10px))",
  right: "max(12px, calc(env(safe-area-inset-right, 0px) + 10px))",
  width: "34px",
  height: "34px",
  borderRadius: "10px",
  border: "1px solid rgba(129, 192, 151, 0.34)",
  background: "rgba(14, 25, 19, 0.74)",
  color: "#dff3e6",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "16px",
  lineHeight: 1,
  padding: 0,
  cursor: "pointer",
  backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)",
  boxShadow: "0 0 0 1px rgba(34, 197, 94, 0.16), inset 0 1px 0 rgba(255,255,255,0.08)",
  zIndex: 21,
};

export default function TacticalPadLitePage() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const surfaceRef = useRef<TacticalPadLiteSurface | null>(null);
  const [phaseCount, setPhaseCount] = useState(0);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    let disposed = false;
    let destroySurface: (() => void) | null = null;
    let mountFrameA = 0;
    let mountFrameB = 0;
    let resizeFrameA = 0;
    let resizeFrameB = 0;

    const mountSurface = () => {
      void createTacticalPadLiteSurface(host, {
        onPhaseCountChange: (count) => {
          if (!disposed) {
            setPhaseCount(count);
          }
        },
      }).then((surface) => {
        if (disposed) {
          surface.destroy();
          return;
        }
        surfaceRef.current = surface;
        destroySurface = surface.destroy;
      });
    };

    const scheduleSurfaceReflow = () => {
      window.cancelAnimationFrame(resizeFrameA);
      window.cancelAnimationFrame(resizeFrameB);
      resizeFrameA = window.requestAnimationFrame(() => {
        resizeFrameB = window.requestAnimationFrame(() => {
          if (disposed) return;
          surfaceRef.current?.reflow();
        });
      });
    };

    const handleResize = () => {
      scheduleSurfaceReflow();
    };
    window.addEventListener("resize", handleResize);

    mountFrameA = window.requestAnimationFrame(() => {
      mountFrameB = window.requestAnimationFrame(() => {
        if (disposed) return;
        mountSurface();
      });
    });

    return () => {
      disposed = true;
      window.removeEventListener("resize", handleResize);
      window.cancelAnimationFrame(mountFrameA);
      window.cancelAnimationFrame(mountFrameB);
      window.cancelAnimationFrame(resizeFrameA);
      window.cancelAnimationFrame(resizeFrameB);
      surfaceRef.current = null;
      destroySurface?.();
    };
  }, []);

  return (
    <OrientationGate modeLabel="PáircVision Board">
      <div style={ROOT_STYLE}>
        <button type="button" style={HOME_BUTTON_STYLE} aria-label="Go to home" onClick={() => window.location.assign("/board")}>
          {"\u2302"}
        </button>
        <div ref={hostRef} style={BOARD_STYLE} />
        <div style={CONTROLS_STYLE}>
          <button type="button" style={BUTTON_STYLE} onClick={() => surfaceRef.current?.setStart()}>
            Set Start
          </button>
          <button type="button" style={BUTTON_STYLE} onClick={() => surfaceRef.current?.addPhase()}>
            Add Phase
          </button>
          <button type="button" style={BUTTON_STYLE} onClick={() => surfaceRef.current?.play()}>
            Play
          </button>
          <button type="button" style={BUTTON_STYLE} onClick={() => surfaceRef.current?.reset()}>
            Reset
          </button>
          <div style={PHASE_COUNT_STYLE}>Phases: {phaseCount}</div>
        </div>
      </div>
    </OrientationGate>
  );
}
