import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

type OrientationGateProps = {
  modeLabel?: string;
  children: ReactNode;
};

const ORIENTATION_SETTLE_DEBOUNCE_MS = 140;

function isIphoneViewportDevice(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent ?? "";
  const platform = navigator.platform ?? "";
  const uaPlatform = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ?? "";
  return /iphone/i.test(ua) || /iphone/i.test(platform) || /iphone/i.test(uaPlatform);
}

const ROOT_STYLE: CSSProperties = {
  position: "fixed",
  top: "max(52px, calc(env(safe-area-inset-top, 0px) + 50px))",
  left: "50%",
  transform: "translateX(-50%)",
  width: "min(86vw, 360px)",
  zIndex: 30,
  pointerEvents: "none",
};

const BANNER_STYLE: CSSProperties = {
  display: "grid",
  gap: "4px",
  textAlign: "center",
  borderRadius: "14px",
  border: "1px solid rgba(231, 243, 255, 0.18)",
  background: "linear-gradient(165deg, rgba(7, 15, 22, 0.42) 0%, rgba(10, 22, 34, 0.34) 100%)",
  boxShadow: "0 8px 20px rgba(3, 9, 14, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.11)",
  backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)",
  padding: "8px 12px",
  color: "#edf4fa",
};

const HEADING_STYLE: CSSProperties = {
  margin: 0,
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: "clamp(13px, 2.9vw, 14px)",
  fontWeight: 700,
  letterSpacing: "0.08em",
  textTransform: "uppercase",
  color: "rgba(243, 249, 255, 0.92)",
};

const BODY_STYLE: CSSProperties = {
  margin: 0,
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: "clamp(11px, 2.4vw, 12px)",
  fontWeight: 500,
  lineHeight: 1.35,
  letterSpacing: "0.01em",
  color: "rgba(220, 233, 244, 0.86)",
};

export function usePortraitOrientation(): boolean {
  const getValue = () => window.matchMedia("(orientation: portrait)").matches || window.innerHeight > window.innerWidth;
  const [isPortrait, setIsPortrait] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return getValue();
  });
  const settleTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const media = window.matchMedia("(orientation: portrait)");
    const settleMs = isIphoneViewportDevice() ? ORIENTATION_SETTLE_DEBOUNCE_MS : 0;
    const applyUpdate = () => setIsPortrait(getValue());
    const scheduleUpdate = () => {
      if (settleTimerRef.current != null) {
        window.clearTimeout(settleTimerRef.current);
        settleTimerRef.current = null;
      }
      if (settleMs <= 0) {
        applyUpdate();
        return;
      }
      settleTimerRef.current = window.setTimeout(() => {
        settleTimerRef.current = null;
        applyUpdate();
      }, settleMs);
    };
    applyUpdate();

    if (typeof media.addEventListener === "function") {
      media.addEventListener("change", scheduleUpdate);
    } else {
      media.addListener(scheduleUpdate);
    }
    window.addEventListener("resize", scheduleUpdate);
    window.addEventListener("orientationchange", scheduleUpdate);
    const viewport = window.visualViewport;
    viewport?.addEventListener("resize", scheduleUpdate);

    return () => {
      if (typeof media.removeEventListener === "function") {
        media.removeEventListener("change", scheduleUpdate);
      } else {
        media.removeListener(scheduleUpdate);
      }
      if (settleTimerRef.current != null) {
        window.clearTimeout(settleTimerRef.current);
        settleTimerRef.current = null;
      }
      window.removeEventListener("resize", scheduleUpdate);
      window.removeEventListener("orientationchange", scheduleUpdate);
      viewport?.removeEventListener("resize", scheduleUpdate);
    };
  }, []);

  return isPortrait;
}

export default function OrientationGate({ modeLabel = "PáircVision Board", children }: OrientationGateProps) {
  const isPortrait = usePortraitOrientation();

  return (
    <>
      {children}
      {isPortrait ? (
        <div style={ROOT_STYLE} role="status" aria-live="polite" aria-label={`${modeLabel} viewing mode notice`}>
          <div style={BANNER_STYLE}>
            <p style={HEADING_STYLE}>VIEWING MODE</p>
            <p style={BODY_STYLE}>Rotate to landscape to create your vision.</p>
          </div>
        </div>
      ) : null}
    </>
  );
}
