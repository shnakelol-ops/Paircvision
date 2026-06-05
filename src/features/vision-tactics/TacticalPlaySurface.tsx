import { useEffect, useRef, useState, type CSSProperties } from "react";

import OrientationGate, { usePortraitOrientation } from "../../components/OrientationGate";
import VisionStadiumBackground from "../../components/VisionStadiumBackground";
import { createMovementCanvasShell } from "../../movement-board/shell/createMovementCanvasShell";
import type {
  BallType,
  MovementBoardMode,
  MovementBoardToken,
  MovementCanvasShellHandle,
  MovementPlaybackSpeed,
  MovementRouteEditState,
  PremiumPlayerTokenColor,
  TokenRendererName,
  TokenSize,
} from "../../movement-board/shell/types";
import { TACTICAL_TEMPLATES, applyTemplatePositions, type TacticalTemplate, type TacticalTemplateCategory } from "./tacticalTemplates";

const SETUP_CATEGORIES: Array<{ id: TacticalTemplateCategory; label: string }> = [
  { id: "KICKOUT", label: "Kickout" },
  { id: "ATTACK", label: "Attack" },
  { id: "DEFENCE", label: "Defence" },
  { id: "PRESS", label: "Press" },
  { id: "DEMO", label: "Demo" },
];

const _CAN_DVW = typeof window !== "undefined" && typeof window.CSS !== "undefined" && window.CSS.supports("width: 100dvw");
const _VW = _CAN_DVW ? "100dvw" : "100vw";
const TP_HEIGHT_VAR = "--tp-app-height";
const TP_H = `var(${TP_HEIGHT_VAR}, 100dvh)`;
const TP_CONTENT_WIDTH = `min(calc(${_VW} - 24px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px)), calc((${TP_H} - 10px) * 1.6), 1360px)`;

function getTPViewportHeight(): number {
  if (typeof window === "undefined") return 0;
  const vp = window.visualViewport;
  const vpH = vp && Number.isFinite(vp.height) ? Math.round(vp.height) : 0;
  return Math.max(0, vpH || (Number.isFinite(window.innerHeight) ? Math.round(window.innerHeight) : 0));
}

const ROOT_STYLE: CSSProperties = {
  position: "fixed",
  inset: 0,
  width: "100vw",
  height: TP_H,
  minHeight: TP_H,
  margin: 0,
  background: "radial-gradient(ellipse at 50% 50%, #0f1e35 0%, #080f1d 55%, #040b16 100%)",
  paddingTop: "max(4px, calc(env(safe-area-inset-top, 0px) + 2px))",
  paddingRight: "max(4px, calc(env(safe-area-inset-right, 0px) + 2px))",
  paddingBottom: "max(4px, calc(env(safe-area-inset-bottom, 0px) + 2px))",
  paddingLeft: "max(4px, calc(env(safe-area-inset-left, 0px) + 2px))",
  boxSizing: "border-box",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  overflow: "hidden",
};

const CONTENT_STYLE: CSSProperties = {
  width: TP_CONTENT_WIDTH,
  maxWidth: "calc(100vw - 24px)",
  aspectRatio: "16 / 10",
  maxHeight: `calc(${TP_H} - 10px)`,
  boxSizing: "border-box",
  position: "relative",
  zIndex: 1,
  display: "flex",
  alignItems: "stretch",
};

const PITCH_STYLE: CSSProperties = {
  width: "100%",
  height: "100%",
  borderRadius: "12px",
  overflow: "hidden",
  boxShadow: "0 50px 110px rgba(0, 0, 0, 0.55), 0 18px 45px rgba(0, 0, 0, 0.35)",
  background: "#0c1829",
};

const INFO_PILL_STYLE: CSSProperties = {
  position: "fixed",
  top: "max(10px, calc(env(safe-area-inset-top, 0px) + 8px))",
  left: "50%",
  transform: "translateX(-50%)",
  zIndex: 12,
  color: "rgba(220, 235, 255, 0.72)",
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: "10px",
  fontWeight: 500,
  letterSpacing: "0.02em",
  padding: "4px 9px",
  borderRadius: "999px",
  border: "1px solid rgba(180, 210, 255, 0.14)",
  background: "rgba(6, 12, 26, 0.72)",
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
  border: "1px solid rgba(180, 210, 255, 0.22)",
  background: "rgba(6, 12, 26, 0.82)",
  color: "#e8f0ff",
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: "10px",
  fontWeight: 700,
  letterSpacing: "0.03em",
  textTransform: "uppercase",
  padding: "0 12px",
  cursor: "pointer",
  backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)",
  boxShadow: "0 8px 20px rgba(0, 0, 0, 0.38), inset 0 1px 0 rgba(255, 255, 255, 0.10)",
};

const CTRL_BUBBLE_STYLE: CSSProperties = {
  position: "fixed",
  left: "max(10px, calc(env(safe-area-inset-left, 0px) + 8px))",
  bottom: "max(10px, calc(env(safe-area-inset-bottom, 0px) + 8px))",
  zIndex: 22,
  height: "38px",
  minWidth: "68px",
  borderRadius: "999px",
  border: "1px solid rgba(180, 210, 255, 0.20)",
  background: "rgba(6, 14, 30, 0.72)",
  color: "#eef4ff",
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: "11px",
  fontWeight: 800,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  padding: "0 14px",
  cursor: "pointer",
  backdropFilter: "blur(14px)",
  WebkitBackdropFilter: "blur(14px)",
  boxShadow: "0 12px 28px rgba(0, 4, 14, 0.50), inset 0 1px 0 rgba(255, 255, 255, 0.18)",
};

const SETUP_BUBBLE_STYLE: CSSProperties = {
  position: "fixed",
  right: "max(10px, calc(env(safe-area-inset-right, 0px) + 8px))",
  bottom: "max(10px, calc(env(safe-area-inset-bottom, 0px) + 8px))",
  zIndex: 22,
  height: "38px",
  minWidth: "68px",
  borderRadius: "999px",
  border: "1px solid rgba(180, 210, 255, 0.20)",
  background: "rgba(6, 14, 30, 0.72)",
  color: "#eef4ff",
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: "11px",
  fontWeight: 800,
  letterSpacing: "0.04em",
  textTransform: "uppercase",
  padding: "0 14px",
  cursor: "pointer",
  backdropFilter: "blur(14px)",
  WebkitBackdropFilter: "blur(14px)",
  boxShadow: "0 12px 28px rgba(0, 4, 14, 0.50), inset 0 1px 0 rgba(255, 255, 255, 0.18)",
};

const SETUP_PANEL_STYLE: CSSProperties = {
  position: "fixed",
  right: "max(10px, calc(env(safe-area-inset-right, 0px) + 8px))",
  bottom: "max(56px, calc(env(safe-area-inset-bottom, 0px) + 54px))",
  zIndex: 21,
  width: "max-content",
  maxWidth: "min(520px, calc(100vw - 20px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px)))",
  display: "grid",
  gap: "3px",
};

const SETUP_SECTION_LABEL_STYLE: CSSProperties = {
  fontSize: "8px",
  fontWeight: 700,
  letterSpacing: "0.10em",
  textTransform: "uppercase",
  color: "rgba(180, 210, 255, 0.40)",
  padding: "0 6px",
  pointerEvents: "none",
  userSelect: "none",
};

const PV_BADGE_STYLE: CSSProperties = {
  position: "fixed",
  left: "max(12px, calc(env(safe-area-inset-left, 0px) + 10px))",
  bottom: "max(56px, calc(env(safe-area-inset-bottom, 0px) + 54px))",
  zIndex: 21,
  height: "22px",
  minWidth: "32px",
  borderRadius: "999px",
  border: "1px solid rgba(180, 210, 255, 0.16)",
  background: "rgba(6, 14, 30, 0.58)",
  color: "rgba(220, 235, 255, 0.88)",
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
  border: "1px solid rgba(180, 210, 255, 0.18)",
  background: "rgba(6, 14, 30, 0.72)",
  backdropFilter: "blur(14px)",
  WebkitBackdropFilter: "blur(14px)",
  boxShadow: "0 10px 24px rgba(0, 4, 14, 0.46), inset 0 1px 0 rgba(255, 255, 255, 0.12)",
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
  border: "1px solid rgba(180, 210, 255, 0.18)",
  background: "rgba(8, 18, 38, 0.72)",
  color: "rgba(220, 235, 255, 0.88)",
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: "9px",
  fontWeight: 640,
  letterSpacing: "0.12px",
  textTransform: "uppercase",
  padding: "0 9px",
  cursor: "pointer",
  whiteSpace: "nowrap",
  boxShadow: "inset 0 1px 0 rgba(255, 255, 255, 0.10)",
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
  border: "1px solid rgba(180, 210, 255, 0.22)",
  background: "rgba(10, 18, 38, 0.72)",
  color: "rgba(220, 235, 255, 0.95)",
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
  boxShadow: "0 6px 18px rgba(0, 4, 14, 0.36), inset 0 1px 2px rgba(255, 255, 255, 0.14)",
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

const HINT_PILL_STYLE: CSSProperties = {
  position: "fixed",
  bottom: "max(54px, calc(env(safe-area-inset-bottom, 0px) + 52px))",
  left: "50%",
  transform: "translateX(-50%)",
  zIndex: 20,
  color: "rgba(198, 228, 210, 0.44)",
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: "9px",
  fontWeight: 500,
  letterSpacing: "0.05em",
  whiteSpace: "nowrap",
  pointerEvents: "none",
  userSelect: "none",
};

const ACTIVE_TEMPLATE_PILL_STYLE: CSSProperties = {
  position: "fixed",
  top: "max(48px, calc(env(safe-area-inset-top, 0px) + 46px))",
  left: "50%",
  transform: "translateX(-50%)",
  zIndex: 12,
  color: "rgba(200, 230, 255, 0.72)",
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: "10px",
  fontWeight: 500,
  letterSpacing: "0.02em",
  padding: "5px 11px",
  borderRadius: "999px",
  border: "1px solid rgba(180, 210, 255, 0.14)",
  background: "rgba(6, 12, 26, 0.68)",
  backdropFilter: "blur(10px)",
  WebkitBackdropFilter: "blur(10px)",
  whiteSpace: "nowrap",
  pointerEvents: "none",
  userSelect: "none",
};

const TEMPLATE_DRAWER_STYLE: CSSProperties = {
  borderRadius: "16px",
  border: "1px solid rgba(180, 210, 255, 0.16)",
  background: "rgba(6, 14, 30, 0.88)",
  backdropFilter: "blur(18px)",
  WebkitBackdropFilter: "blur(18px)",
  boxShadow: "0 18px 44px rgba(0, 4, 14, 0.54), inset 0 1px 0 rgba(255, 255, 255, 0.09)",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
};

const TOKEN_COLOR_BG: Record<PremiumPlayerTokenColor, string> = {
  blue:   "rgba(37, 99, 235, 0.78)",
  red:    "rgba(220, 38, 38, 0.78)",
  yellow: "rgba(242, 201, 76, 0.88)",
  black:  "rgba(17, 24, 39, 0.90)",
  green:  "rgba(22, 163, 74, 0.78)",
  orange: "rgba(234, 88, 12, 0.78)",
  purple: "rgba(124, 58, 237, 0.78)",
  white:  "rgba(241, 245, 249, 0.88)",
};

const TOKEN_COLOR_BORDER: Record<PremiumPlayerTokenColor, string> = {
  blue:   "rgba(147, 197, 253, 0.60)",
  red:    "rgba(252, 165, 165, 0.60)",
  yellow: "rgba(253, 224, 71, 0.60)",
  black:  "rgba(107, 114, 128, 0.40)",
  green:  "rgba(74, 222, 128, 0.60)",
  orange: "rgba(251, 146, 60, 0.60)",
  purple: "rgba(167, 139, 250, 0.60)",
  white:  "rgba(203, 213, 225, 0.60)",
};

const TOKEN_COLOR_IS_LIGHT = new Set<PremiumPlayerTokenColor>(["yellow", "white"]);

const ALL_TOKEN_COLORS: PremiumPlayerTokenColor[] = [
  "blue", "red", "green", "yellow", "orange", "purple", "black", "white",
];

export default function TacticalPlaySurface() {
  type MovementMenuMode = "move" | "route" | "play";

  const toShellMode = (menuMode: MovementMenuMode): MovementBoardMode =>
    menuMode === "route"
      ? "route"
      : menuMode === "play"
        ? "play"
        : "setup";

  const toMenuMode = (shellMode: MovementBoardMode): MovementMenuMode =>
    shellMode === "route" ? "route" : shellMode === "play" ? "play" : "move";

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
  const [ballCarrierId, setBallCarrierId] = useState<string | null>(null);
  const [ballOnPitch, setBallOnPitch] = useState(false);
  type BallMenuStep = "root" | "football-size" | "sliotar-size" | "existing";
  const [ballMenuStep, setBallMenuStep] = useState<BallMenuStep | null>(null);
  const [appViewportHeight, setAppViewportHeight] = useState(() => getTPViewportHeight());
  const [startFlash, setStartFlash] = useState(false);
  const [setupOpen, setSetupOpen] = useState(false);
  const [playersOpen, setPlayersOpen] = useState(false);
  const [activeSetupCategory, setActiveSetupCategory] = useState<TacticalTemplateCategory | null>(null);
  const [activeTemplate, setActiveTemplate] = useState<TacticalTemplate | null>(null);
  const [tokenSize, setTokenSizeState] = useState<TokenSize>("medium");
  const [tokenRenderer, setTokenRendererState] = useState<TokenRendererName>("jersey");
  const [primaryColor, setPrimaryColorState] = useState<PremiumPlayerTokenColor>("blue");
  const [secondaryColor, setSecondaryColorState] = useState<PremiumPlayerTokenColor>("red");

  useEffect(() => {
    if (typeof window === "undefined") return;
    let rafId = 0;
    let timeoutId: number | null = null;
    const clearScheduled = () => {
      if (timeoutId != null) { window.clearTimeout(timeoutId); timeoutId = null; }
      if (rafId) { window.cancelAnimationFrame(rafId); rafId = 0; }
    };
    const syncHeight = () => {
      rafId = 0;
      const next = getTPViewportHeight();
      setAppViewportHeight((prev) => Math.abs(prev - next) <= 1 ? prev : next);
    };
    const schedule = (defer: boolean) => {
      clearScheduled();
      if (defer) { timeoutId = window.setTimeout(() => { rafId = window.requestAnimationFrame(syncHeight); }, 180); return; }
      rafId = window.requestAnimationFrame(syncHeight);
    };
    schedule(false);
    const vp = window.visualViewport;
    const onResize = () => schedule(false);
    const onOrient = () => schedule(true);
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onOrient);
    vp?.addEventListener("resize", onResize);
    vp?.addEventListener("scroll", onResize);
    return () => {
      clearScheduled();
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onOrient);
      vp?.removeEventListener("resize", onResize);
      vp?.removeEventListener("scroll", onResize);
    };
  }, []);

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
        onBallStateChange: (state) => {
          setBallCarrierId(state.carrierId ?? null);
          setBallOnPitch(!!(state.carrierId || state.position));
        },
      }).then((shell) => {
        if (disposed) {
          shell.destroy();
          return;
        }
        shellRef.current = shell;
        setMenuMode(toMenuMode(shell.getMode()));
        setPlaybackSpeed(shell.getPlaybackSpeed());
        setTokenSizeState(shell.getTokenSize());
        setRouteCount(shell.getRoutes().length);
        const selected = shell.getSelectedToken();
        setSelectedToken(selected);
        setRouteEditState(shell.getRouteEditState());
        const playbackState = shell.getPlaybackState();
        setIsPlaying(playbackState.isPlaying);
        setIsPaused(playbackState.isPaused);
        const initialBallState = shell.getBallState();
        setBallCarrierId(initialBallState.carrierId ?? null);
        setBallOnPitch(!!(initialBallState.carrierId || initialBallState.position));
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

    window.addEventListener("resize", scheduleReflow);

    mountFrameA = window.requestAnimationFrame(() => {
      mountFrameB = window.requestAnimationFrame(() => {
        if (disposed) return;
        mountShell();
      });
    });

    return () => {
      disposed = true;
      window.removeEventListener("resize", scheduleReflow);
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
      setSetupOpen(false);
      setBallMenuStep(null);
    }
  }, [isPlaying]);

  useEffect(() => {
    if (!isControlsOpen) {
      setBallMenuStep(null);
    }
  }, [isControlsOpen]);

  const modeLabelByMenu: Record<MovementMenuMode, string> = {
    move: "Move",
    route: "Route",
    play: "Play",
  };

  const selectedHasBall = selectedToken != null && selectedToken.id === ballCarrierId;
  const coachInfoLabel = selectedToken
    ? `P${selectedToken.number}${selectedHasBall ? " · Ball" : ""}`
    : ballOnPitch
      ? "Ball on Pitch"
      : modeLabelByMenu[menuMode];

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

  const onSetStart = () => {
    shellRef.current?.setStartPositions();
    setStartFlash(true);
    setTimeout(() => { setStartFlash(false); }, 700);
  };

  const clearRoute = () => {
    shellRef.current?.clearSelectedRoute();
  };

  const giveSelectedPlayerBall = () => {
    const shell = shellRef.current;
    const token = selectedToken;
    if (!shell || !token) return;
    shell.giveBall(token.id);
  };

  const onBallButtonPress = () => {
    if (ballOnPitch) {
      setBallMenuStep((prev) => (prev === "existing" ? null : "existing"));
    } else {
      setBallMenuStep((prev) => (prev === null ? "root" : null));
    }
  };

  const onSetupPress = () => {
    setIsControlsOpen(false);
    setSetupOpen((prev) => !prev);
  };

  const onSetTokenSize = (size: TokenSize) => {
    shellRef.current?.setTokenSize(size);
    setTokenSizeState(size);
  };

  const onSetTokenRenderer = (name: TokenRendererName) => {
    shellRef.current?.setTokenRenderer(name);
    setTokenRendererState(name);
  };

  const onLoadTemplate = (template: TacticalTemplate) => {
    const shell = shellRef.current;
    if (!shell) return;
    for (const token of shell.getTokens()) {
      shell.setSelectedToken(token.id);
      shell.clearSelectedRoute();
    }
    shell.setSelectedToken(null);
    shell.setTokens(applyTemplatePositions(shell.getTokens(), template));
    if (template.routes) {
      const tokens = shell.getTokens();
      const routes = template.routes.flatMap((r) => {
        const token = tokens.find((t) => t.number === r.jerseyNumber);
        return token ? [{ playerId: token.id, points: r.points }] : [];
      });
      shell.setRoutes(routes);
    }
    shell.setStartPositions();
    setActiveTemplate(template);
    setSetupOpen(false);
  };

  const onSetPrimaryColor = (color: PremiumPlayerTokenColor) => {
    const shell = shellRef.current;
    if (!shell) return;
    shell.setTokens(shell.getTokens().map((t) => ({ ...t, color })));
    setPrimaryColorState(color);
  };

  const onSetSecondaryColor = (color: PremiumPlayerTokenColor) => {
    const shell = shellRef.current;
    if (!shell) return;
    shell.setTokens(shell.getTokens().map((t) => ({ ...t, secondaryColor: color })));
    setSecondaryColorState(color);
  };

  const onSelectBallType = (ballType: BallType) => {
    shellRef.current?.placeBall(ballType);
    setBallMenuStep(null);
  };

  const onFreeBall = () => {
    shellRef.current?.freeBall();
    setBallMenuStep(null);
  };

  const onRemoveBall = () => {
    shellRef.current?.removeBall();
    setBallMenuStep(null);
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
    window.location.assign("/vision-tactics");
  };

  const modeIsPlaybackLocked = isPlaying || isPaused;
  const clearRouteDisabled = menuMode !== "route" || routeEditState.waypointCount < 2 || isPlaying;
  const removePointDisabled = menuMode !== "route" || !routeEditState.canRemoveSelectedWaypoint || isPlaying;
  const playRoutesDisabled = isPortrait || isPlaying || isPaused;
  const playAllDisabled = isPortrait || isPlaying || isPaused;
  const pauseResumeDisabled = !isPlaying && !isPaused;
  const playbackFloatingVisible = isPlaying || isPaused;

  const rootStyle: CSSProperties = {
    ...ROOT_STYLE,
    [TP_HEIGHT_VAR]: `${Math.max(0, Math.floor(appViewportHeight))}px`,
  } as CSSProperties;

  return (
    <OrientationGate modeLabel="Tactical Play">
      <div style={rootStyle}>
        <VisionStadiumBackground variant="board" />
        <div style={CONTENT_STYLE}>
          <div ref={hostRef} style={PITCH_STYLE} />
        </div>

        <button type="button" style={BACK_BUTTON_STYLE} onClick={goBack}>
          Vision Tactics
        </button>

        <div style={INFO_PILL_STYLE}>{coachInfoLabel}</div>

        {activeTemplate !== null ? (
          <div style={ACTIVE_TEMPLATE_PILL_STYLE}>
            {activeTemplate.category.charAt(0) + activeTemplate.category.slice(1).toLowerCase()} • {activeTemplate.name}
          </div>
        ) : null}

        <div style={PV_BADGE_STYLE}>PV</div>
        <button
          type="button"
          style={CTRL_BUBBLE_STYLE}
          onClick={() => { setIsControlsOpen((prev) => !prev); setSetupOpen(false); }}
        >
          CTRL
        </button>
        <button
          type="button"
          style={setupOpen
            ? { ...SETUP_BUBBLE_STYLE, border: "1px solid rgba(124, 255, 114, 0.40)", background: "rgba(14, 32, 22, 0.82)" }
            : SETUP_BUBBLE_STYLE}
          disabled={modeIsPlaybackLocked}
          onClick={onSetupPress}
        >
          {activeTemplate !== null
            ? (SETUP_CATEGORIES.find((c) => c.id === activeTemplate.category)?.label ?? "Setup")
            : "Setup"}
        </button>

        {!isControlsOpen && !setupOpen && !isPlaying && !isPaused ? (
          <div style={HINT_PILL_STYLE}>Move players → Set Start → Draw Movements → Play</div>
        ) : null}

        {isControlsOpen ? (
          <div style={CONTROL_PANEL_STYLE}>
            <div style={PANEL_ROW_STYLE}>
              {([
                { id: "move", label: "Move" },
                { id: "route", label: "Route" },
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
              <button
                type="button"
                style={ballOnPitch ? MODE_BUTTON_ACTIVE_STYLE : MODE_BUTTON_STYLE}
                disabled={modeIsPlaybackLocked}
                onClick={onBallButtonPress}
              >
                Ball
              </button>
              <button type="button" style={COLLAPSE_BUTTON_STYLE} onClick={() => setIsControlsOpen(false)}>
                Hide
              </button>
            </div>

            {ballMenuStep !== null ? (
              <div style={PANEL_ROW_STYLE}>
                {ballMenuStep === "root" ? (
                  <>
                    <button type="button" style={TOOL_BUTTON_STYLE} onClick={() => setBallMenuStep("football-size")}>
                      ⚽ Football
                    </button>
                    <button type="button" style={TOOL_BUTTON_STYLE} onClick={() => setBallMenuStep("sliotar-size")}>
                      🥎 Sliotar
                    </button>
                  </>
                ) : null}
                {ballMenuStep === "football-size" ? (
                  <>
                    <button type="button" style={TOOL_BUTTON_STYLE} onClick={() => setBallMenuStep("root")}>
                      ← Back
                    </button>
                    <button type="button" style={TOOL_BUTTON_STYLE} onClick={() => onSelectBallType("footballSmall")}>
                      ⚽ Small
                    </button>
                    <button type="button" style={TOOL_BUTTON_STYLE} onClick={() => onSelectBallType("footballMedium")}>
                      ⚽ Medium
                    </button>
                  </>
                ) : null}
                {ballMenuStep === "sliotar-size" ? (
                  <>
                    <button type="button" style={TOOL_BUTTON_STYLE} onClick={() => setBallMenuStep("root")}>
                      ← Back
                    </button>
                    <button type="button" style={TOOL_BUTTON_STYLE} onClick={() => onSelectBallType("sliotarSmall")}>
                      🥎 Small
                    </button>
                    <button type="button" style={TOOL_BUTTON_STYLE} onClick={() => onSelectBallType("sliotarMedium")}>
                      🥎 Medium
                    </button>
                  </>
                ) : null}
                {ballMenuStep === "existing" ? (
                  <>
                    {ballCarrierId ? (
                      <button type="button" style={TOOL_BUTTON_STYLE} onClick={onFreeBall}>
                        Free Ball
                      </button>
                    ) : null}
                    <button type="button" style={TOOL_BUTTON_STYLE} onClick={onRemoveBall}>
                      Remove Ball
                    </button>
                  </>
                ) : null}
              </div>
            ) : null}

            <div style={PANEL_ROW_STYLE}>
              {menuMode === "move" ? (
                <>
                  <button
                    type="button"
                    style={modeIsPlaybackLocked ? TOOL_DISABLED_STYLE : startFlash ? TOOL_ACTIVE_STYLE : TOOL_BUTTON_STYLE}
                    disabled={modeIsPlaybackLocked}
                    onClick={onSetStart}
                  >
                    Set Start
                  </button>
                  <button type="button" style={TOOL_DISABLED_STYLE} disabled>
                    Phases Soon
                  </button>
                  <button type="button" style={TOOL_BUTTON_STYLE} onClick={resetBoard}>
                    Reset
                  </button>
                  {selectedToken && !modeIsPlaybackLocked ? (
                    <button
                      type="button"
                      style={selectedHasBall ? TOOL_ACTIVE_STYLE : TOOL_BUTTON_STYLE}
                      onClick={giveSelectedPlayerBall}
                    >
                      {selectedHasBall ? "Has Ball" : "Give Ball"}
                    </button>
                  ) : null}
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
                  {selectedToken && !isPlaying ? (
                    <button
                      type="button"
                      style={selectedHasBall ? TOOL_ACTIVE_STYLE : TOOL_BUTTON_STYLE}
                      onClick={giveSelectedPlayerBall}
                    >
                      {selectedHasBall ? "Has Ball" : "Give Ball"}
                    </button>
                  ) : null}
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
            </div>
          </div>
        ) : null}

        {setupOpen ? (
          <div style={SETUP_PANEL_STYLE}>
            <div style={PANEL_ROW_STYLE}>
              {SETUP_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  style={activeSetupCategory === cat.id ? TOOL_ACTIVE_STYLE : TOOL_BUTTON_STYLE}
                  onClick={() => setActiveSetupCategory((prev) => prev === cat.id ? null : cat.id)}
                >
                  {cat.label}
                </button>
              ))}
              <button
                type="button"
                style={playersOpen ? TOOL_ACTIVE_STYLE : TOOL_BUTTON_STYLE}
                onClick={() => setPlayersOpen((prev) => !prev)}
              >
                Players
              </button>
            </div>

            {activeSetupCategory !== null ? (
              <div style={TEMPLATE_DRAWER_STYLE}>
                {TACTICAL_TEMPLATES.filter((t) => t.category === activeSetupCategory).map((tmpl, idx, arr) => (
                  <button
                    key={tmpl.id}
                    type="button"
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      width: "100%",
                      padding: "10px 16px",
                      border: "none",
                      borderBottom: idx < arr.length - 1 ? "1px solid rgba(180, 210, 255, 0.08)" : "none",
                      background: "transparent",
                      color: "rgba(220, 235, 255, 0.95)",
                      fontFamily: "Inter, system-ui, sans-serif",
                      textAlign: "left",
                      cursor: "pointer",
                    }}
                    onClick={() => onLoadTemplate(tmpl)}
                  >
                    <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: "3px" }}>{tmpl.name}</span>
                    <span style={{ fontSize: "9px", fontWeight: 400, opacity: 0.52, letterSpacing: "0.01em", lineHeight: 1.3 }}>{tmpl.description}</span>
                  </button>
                ))}
              </div>
            ) : null}


            {playersOpen ? (
              <>
                <div style={PANEL_ROW_STYLE}>
                  {([
                    { id: "pixi", label: "Pixi" },
                    { id: "phosphor", label: "Phosphor" },
                    { id: "jersey", label: "Jersey" },
                  ] as const).map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      style={tokenRenderer === r.id ? TOOL_ACTIVE_STYLE : TOOL_BUTTON_STYLE}
                      onClick={() => onSetTokenRenderer(r.id)}
                    >
                      {r.label}
                    </button>
                  ))}
                  {([
                    { id: "small", label: "Small" },
                    { id: "medium", label: "Medium" },
                    { id: "large", label: "Large" },
                  ] as const).map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      style={tokenSize === s.id ? TOOL_ACTIVE_STYLE : TOOL_BUTTON_STYLE}
                      onClick={() => onSetTokenSize(s.id)}
                    >
                      {s.label}
                    </button>
                  ))}
                </div>
                <div style={PANEL_ROW_STYLE}>
                  <span style={SETUP_SECTION_LABEL_STYLE}>Primary</span>
                  {ALL_TOKEN_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      style={
                        primaryColor === c
                          ? {
                              ...TOOL_BUTTON_STYLE,
                              minWidth: "44px",
                              padding: "0 8px",
                              background: TOKEN_COLOR_BG[c],
                              border: `1px solid ${TOKEN_COLOR_BORDER[c]}`,
                              color: TOKEN_COLOR_IS_LIGHT.has(c) ? "#0f172a" : "#f8fafc",
                            }
                          : { ...TOOL_BUTTON_STYLE, minWidth: "44px", padding: "0 8px" }
                      }
                      onClick={() => onSetPrimaryColor(c)}
                    >
                      {c.charAt(0).toUpperCase() + c.slice(1)}
                    </button>
                  ))}
                </div>
                <div style={PANEL_ROW_STYLE}>
                  <span style={SETUP_SECTION_LABEL_STYLE}>2nd</span>
                  {ALL_TOKEN_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      style={
                        secondaryColor === c
                          ? {
                              ...TOOL_BUTTON_STYLE,
                              minWidth: "44px",
                              padding: "0 8px",
                              background: TOKEN_COLOR_BG[c],
                              border: `1px solid ${TOKEN_COLOR_BORDER[c]}`,
                              color: TOKEN_COLOR_IS_LIGHT.has(c) ? "#0f172a" : "#f8fafc",
                            }
                          : { ...TOOL_BUTTON_STYLE, minWidth: "44px", padding: "0 8px" }
                      }
                      onClick={() => onSetSecondaryColor(c)}
                    >
                      {c.charAt(0).toUpperCase() + c.slice(1)}
                    </button>
                  ))}
                </div>
              </>
            ) : null}
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
