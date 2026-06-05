import { useEffect, useRef, useState, type CSSProperties } from "react";

import OrientationGate, { usePortraitOrientation } from "../../components/OrientationGate";
import VisionStadiumBackground from "../../components/VisionStadiumBackground";
import { createMovementCanvasShell } from "../../movement-board/shell/createMovementCanvasShell";
import type {
  BallType,
  MovementBoardMode,
  MovementBoardRoute,
  MovementBoardToken,
  MovementCanvasShellHandle,
  MovementConcept,
  MovementPlaybackSpeed,
  MovementRouteEditState,
  PremiumPlayerTokenColor,
  TokenRendererName,
  TokenSize,
} from "../../movement-board/shell/types";
import { TACTICAL_TEMPLATES, applyTemplatePositions, type TacticalTemplate, type TacticalTemplateCategory } from "./tacticalTemplates";
import {
  deleteScenario,
  duplicateScenario,
  listScenarios,
  renameScenario,
  saveScenario,
  type TacticalScenario,
} from "./tacticalPlayStorage";

const SETUP_CATEGORIES: Array<{ id: TacticalTemplateCategory; label: string }> = [
  { id: "KICKOUT", label: "Kickout" },
  { id: "ATTACK", label: "Attack" },
  { id: "DEFENCE", label: "Defence" },
  { id: "PRESS", label: "Press" },
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
  color: "#e8f0ff",
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: "11px",
  fontWeight: 600,
  letterSpacing: "0.02em",
  padding: "6px 10px",
  borderRadius: "999px",
  border: "1px solid rgba(180, 210, 255, 0.20)",
  background: "rgba(6, 12, 26, 0.82)",
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

const SEQ_PANEL_STYLE: CSSProperties = {
  position: "fixed",
  left: "max(10px, calc(env(safe-area-inset-left, 0px) + 8px))",
  bottom: "max(56px, calc(env(safe-area-inset-bottom, 0px) + 54px))",
  zIndex: 21,
  width: "max-content",
  maxWidth: "min(420px, calc(100vw - 20px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px)))",
  display: "grid",
  gap: "3px",
};

const SEQ_CHIP_STYLE: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "4px",
  height: "22px",
  borderRadius: "999px",
  border: "1px solid rgba(180, 210, 255, 0.20)",
  background: "rgba(8, 18, 40, 0.72)",
  color: "rgba(200, 230, 255, 0.88)",
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: "9px",
  fontWeight: 600,
  letterSpacing: "0.06em",
  padding: "0 8px",
  whiteSpace: "nowrap",
};

const SCENARIO_INPUT_STYLE: CSSProperties = {
  height: "31px",
  minWidth: "120px",
  maxWidth: "160px",
  borderRadius: "999px",
  border: "1px solid rgba(180, 210, 255, 0.22)",
  background: "rgba(8, 18, 38, 0.72)",
  color: "rgba(220, 235, 255, 0.95)",
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: "9px",
  fontWeight: 500,
  padding: "0 10px",
  outline: "none",
};

const MOVEMENT_PANEL_STYLE: CSSProperties = {
  position: "fixed",
  left: "50%",
  transform: "translateX(-50%)",
  bottom: "max(58px, calc(env(safe-area-inset-bottom, 0px) + 56px))",
  zIndex: 23,
  width: "min(500px, calc(100vw - 176px - env(safe-area-inset-left, 0px) - env(safe-area-inset-right, 0px)))",
  background: "rgba(4, 10, 22, 0.95)",
  backdropFilter: "blur(20px)",
  WebkitBackdropFilter: "blur(20px)",
  border: "1px solid rgba(180, 210, 255, 0.15)",
  borderRadius: "16px",
  boxShadow: "0 20px 50px rgba(0, 0, 0, 0.65), 0 6px 16px rgba(0, 0, 0, 0.40)",
  padding: "10px 12px",
  display: "grid",
  gap: "7px",
};

const MP_HEADER_STYLE: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
};

const MP_TITLE_STYLE: CSSProperties = {
  color: "rgba(180, 210, 255, 0.55)",
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: "9px",
  fontWeight: 700,
  letterSpacing: "0.10em",
  textTransform: "uppercase",
  userSelect: "none",
};

const MP_CLOSE_STYLE: CSSProperties = {
  width: "26px",
  height: "26px",
  borderRadius: "50%",
  border: "1px solid rgba(180, 210, 255, 0.18)",
  background: "rgba(10, 20, 42, 0.60)",
  color: "rgba(180, 210, 255, 0.60)",
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: "15px",
  fontWeight: 300,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  lineHeight: "1",
  padding: "0",
  flexShrink: 0,
};

const MP_SECTION_LABEL_STYLE: CSSProperties = {
  color: "rgba(180, 210, 255, 0.36)",
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: "8px",
  fontWeight: 700,
  letterSpacing: "0.10em",
  textTransform: "uppercase",
  userSelect: "none",
  marginBottom: "4px",
};

const MP_BUTTON_ROW: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "5px",
};

const MP_BTN: CSSProperties = {
  height: "40px",
  minWidth: "60px",
  borderRadius: "10px",
  border: "1px solid rgba(180, 210, 255, 0.18)",
  background: "rgba(14, 24, 50, 0.80)",
  color: "rgba(210, 230, 255, 0.88)",
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: "10px",
  fontWeight: 600,
  letterSpacing: "0.04em",
  padding: "0 14px",
  cursor: "pointer",
  whiteSpace: "nowrap",
  flex: "1 1 auto",
};

const MP_BTN_ACTIVE: CSSProperties = {
  ...MP_BTN,
  border: "1px solid rgba(124, 255, 114, 0.65)",
  background: "rgba(22, 67, 44, 0.90)",
  color: "#e6fff0",
};

const MP_BTN_SECONDARY: CSSProperties = {
  ...MP_BTN,
  flex: "0 0 auto",
  background: "rgba(10, 16, 32, 0.70)",
  color: "rgba(180, 210, 255, 0.60)",
  border: "1px solid rgba(180, 210, 255, 0.14)",
};

const MP_BTN_PRIMARY: CSSProperties = {
  ...MP_BTN,
  flex: "1 1 auto",
  height: "44px",
  border: "1px solid rgba(124, 255, 114, 0.45)",
  background: "rgba(18, 58, 36, 0.90)",
  color: "#cdffc8",
  fontWeight: 700,
  fontSize: "11px",
};

const CONCEPT_LABELS: Record<MovementConcept, string> = {
  "support-run": "Support Run",
  "overlap": "Overlap",
  "shadow-run": "Shadow Run",
  "rotation": "Rotation",
  "custom": "Custom Run",
};

const CONCEPT_OPTIONS: Array<{ id: MovementConcept | null; label: string }> = [
  { id: null, label: "—" },
  { id: "support-run", label: "Support" },
  { id: "overlap", label: "Overlap" },
  { id: "shadow-run", label: "Shadow" },
  { id: "rotation", label: "Rotation" },
  { id: "custom", label: "Custom" },
];

const DELAY_PRESETS_MS = [0, 1000, 2000, 3000, 4000];

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
  const [tokenSize, setTokenSizeState] = useState<TokenSize>("medium");
  const [tokenRenderer, setTokenRendererState] = useState<TokenRendererName>("jersey");
  const [primaryColor, setPrimaryColorState] = useState<PremiumPlayerTokenColor>("blue");
  const [secondaryColor, setSecondaryColorState] = useState<PremiumPlayerTokenColor>("red");
  const [routes, setRoutes] = useState<MovementBoardRoute[]>([]);
  const [tokenNumberById, setTokenNumberById] = useState<Record<string, number>>({});
  const [sequenceOpen, setSequenceOpen] = useState(false);
  const [scenariosOpen, setScenariosOpen] = useState(false);
  const [scenarios, setScenarios] = useState<TacticalScenario[]>([]);
  const [scenarioNameDraft, setScenarioNameDraft] = useState("");
  const [movementsOpen, setMovementsOpen] = useState(false);
  const [movementsSelectedPlayerId, setMovementsSelectedPlayerId] = useState<string | null>(null);

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
        onRoutesChange: (nextRoutes) => {
          setRouteCount(nextRoutes.length);
          setRoutes(nextRoutes);
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
        const initialRoutes = shell.getRoutes();
        setRouteCount(initialRoutes.length);
        setRoutes(initialRoutes);
        const nums: Record<string, number> = {};
        for (const t of shell.getTokens()) nums[t.id] = t.number;
        setTokenNumberById(nums);
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
        setScenarios(listScenarios());
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
      setMovementsOpen(false);
    }
  }, [isPlaying]);

  useEffect(() => {
    if (!isControlsOpen) {
      setBallMenuStep(null);
    }
  }, [isControlsOpen]);

  const selectedRoute = routes.find((r) => r.playerId === selectedToken?.id) ?? null;
  const selectedRouteConcept = selectedRoute?.concept ?? null;
  const sortedSequence = [...routes].sort((a, b) => {
    const aOrd = a.triggeredBy != null ? Infinity : (a.delayMs ?? 0);
    const bOrd = b.triggeredBy != null ? Infinity : (b.delayMs ?? 0);
    return aOrd - bOrd;
  });

  const movementsRoute = movementsSelectedPlayerId
    ? routes.find((r) => r.playerId === movementsSelectedPlayerId) ?? null
    : null;
  const movementsRouteConcept = movementsRoute?.concept ?? null;
  const movementsRouteDelay = movementsRoute?.delayMs ?? null;
  const movementsRouteTrigger = movementsRoute?.triggeredBy ?? null;
  const movementsRoutedPlayers = routes
    .map((r) => ({ playerId: r.playerId, number: tokenNumberById[r.playerId] ?? 0 }))
    .sort((a, b) => a.number - b.number);
  const movementsOtherPlayers = routes
    .filter((r) => r.playerId !== movementsSelectedPlayerId)
    .map((r) => ({ playerId: r.playerId, number: tokenNumberById[r.playerId] ?? 0 }))
    .sort((a, b) => a.number - b.number);

  const modeLabelByMenu: Record<MovementMenuMode, string> = {
    move: "Move",
    route: "Route",
    play: "Play",
  };

  const selectedHasBall = selectedToken != null && selectedToken.id === ballCarrierId;
  const conceptSuffix = selectedRouteConcept ? ` · ${CONCEPT_LABELS[selectedRouteConcept]}` : "";
  const coachInfoLabel = selectedToken
    ? `P${selectedToken.number}${selectedHasBall ? " · Ball" : ""}${conceptSuffix} · Moves ${routeCount}`
    : ballCarrierId
      ? `Ball Assigned · Moves ${routeCount}`
      : ballOnPitch
        ? `Ball on Pitch · Moves ${routeCount}`
        : `${modeLabelByMenu[menuMode]} · Moves ${routeCount}`;

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

  const onMovementsSetConcept = (concept: MovementConcept | null) => {
    const shell = shellRef.current;
    if (!shell || !movementsSelectedPlayerId) return;
    shell.setRouteMeta(movementsSelectedPlayerId, { concept: concept ?? undefined });
  };

  const onMovementsSetDelay = (delayMs: number) => {
    const shell = shellRef.current;
    if (!shell || !movementsSelectedPlayerId) return;
    shell.setRouteMeta(movementsSelectedPlayerId, { delayMs, triggeredBy: undefined });
  };

  const onMovementsSetTrigger = (triggeredBy: string | null) => {
    const shell = shellRef.current;
    if (!shell || !movementsSelectedPlayerId) return;
    shell.setRouteMeta(movementsSelectedPlayerId, { triggeredBy: triggeredBy ?? undefined, delayMs: undefined });
  };

  const onSaveScenario = () => {
    const shell = shellRef.current;
    if (!shell) return;
    const saved = saveScenario(
      scenarioNameDraft.trim() || "Scenario",
      shell.getTokens(),
      shell.getRoutes(),
      shell.getBallState(),
    );
    void saved;
    setScenarios(listScenarios());
    setScenarioNameDraft("");
  };

  const onLoadScenario = (scenario: TacticalScenario) => {
    const shell = shellRef.current;
    if (!shell) return;
    shell.setTokens(scenario.tokens);
    shell.setRoutes(scenario.routes);
    if (scenario.ballState.carrierId) {
      shell.giveBall(scenario.ballState.carrierId);
    } else if (scenario.ballState.position) {
      shell.placeBall(scenario.ballState.ballType ?? "footballSmall", scenario.ballState.position);
    } else {
      shell.removeBall();
    }
    shell.setStartPositions();
    setScenariosOpen(false);
  };

  const onDeleteScenario = (id: string) => {
    deleteScenario(id);
    setScenarios(listScenarios());
  };

  const onDuplicateScenario = (id: string) => {
    duplicateScenario(id);
    setScenarios(listScenarios());
  };

  const onRenameScenario = (id: string, name: string) => {
    renameScenario(id, name);
    setScenarios(listScenarios());
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

        <div style={PV_BADGE_STYLE}>PV</div>
        <button
          type="button"
          style={CTRL_BUBBLE_STYLE}
          onClick={() => { setIsControlsOpen((prev) => !prev); setSetupOpen(false); setSequenceOpen(false); setScenariosOpen(false); setMovementsOpen(false); }}
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
          Setup
        </button>

        {!isControlsOpen && !setupOpen && !isPlaying && !isPaused ? (
          <div style={HINT_PILL_STYLE}>Move players → Set Start → Draw Movements → Play</div>
        ) : null}

        {sequenceOpen && !isControlsOpen && routes.length > 0 ? (
          <div style={SEQ_PANEL_STYLE}>
            <div style={PANEL_ROW_STYLE}>
              <span style={SETUP_SECTION_LABEL_STYLE}>Movement Chain</span>
              {sortedSequence.map((r, idx) => {
                const num = tokenNumberById[r.playerId] ?? "?";
                const conceptText = r.concept ? CONCEPT_LABELS[r.concept] : "Run";
                let timingText = "";
                if (r.triggeredBy) {
                  const trigNum = tokenNumberById[r.triggeredBy] ?? "?";
                  timingText = `after P${trigNum}`;
                } else if (r.delayMs != null && r.delayMs > 0) {
                  timingText = `${(r.delayMs / 1000).toFixed(1)}s`;
                } else {
                  timingText = "0s";
                }
                return (
                  <span key={r.playerId} style={SEQ_CHIP_STYLE}>
                    <span style={{ opacity: 0.50 }}>{idx + 1}.</span>
                    <span>P{num}</span>
                    <span style={{ opacity: 0.65 }}>{conceptText}</span>
                    <span style={{ opacity: 0.45 }}>{timingText}</span>
                  </span>
                );
              })}
              <button type="button" style={{ ...COLLAPSE_BUTTON_STYLE, minWidth: "44px" }} onClick={() => setSequenceOpen(false)}>
                ×
              </button>
            </div>
          </div>
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
              {routes.length > 0 ? (
                <>
                  <button
                    type="button"
                    style={sequenceOpen ? MODE_BUTTON_ACTIVE_STYLE : MODE_BUTTON_STYLE}
                    onClick={() => setSequenceOpen((prev) => !prev)}
                  >
                    Seq
                  </button>
                  <button
                    type="button"
                    style={movementsOpen ? MODE_BUTTON_ACTIVE_STYLE : MODE_BUTTON_STYLE}
                    onClick={() => { setMovementsOpen((prev) => !prev); setIsControlsOpen(false); }}
                  >
                    Movements
                  </button>
                </>
              ) : null}
              <button type="button" style={COLLAPSE_BUTTON_STYLE} onClick={() => setIsControlsOpen(false)}>
                Hide
              </button>
            </div>

            {sequenceOpen && routes.length > 0 ? (
              <div style={PANEL_ROW_STYLE}>
                <span style={SETUP_SECTION_LABEL_STYLE}>Sequence</span>
                {sortedSequence.map((r, idx) => {
                  const num = tokenNumberById[r.playerId] ?? "?";
                  const conceptText = r.concept ? CONCEPT_LABELS[r.concept] : "Run";
                  let timingText = "";
                  if (r.triggeredBy) {
                    const trigNum = tokenNumberById[r.triggeredBy] ?? "?";
                    timingText = `after P${trigNum}`;
                  } else if (r.delayMs != null && r.delayMs > 0) {
                    timingText = `${(r.delayMs / 1000).toFixed(1)}s`;
                  } else {
                    timingText = "0s";
                  }
                  return (
                    <span key={r.playerId} style={SEQ_CHIP_STYLE}>
                      <span style={{ opacity: 0.50 }}>{idx + 1}.</span>
                      P{num} {conceptText}
                      <span style={{ opacity: 0.45 }}>{timingText}</span>
                    </span>
                  );
                })}
              </div>
            ) : null}

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

        {movementsOpen && routes.length > 0 ? (
          <div style={MOVEMENT_PANEL_STYLE}>
            <div style={MP_HEADER_STYLE}>
              <span style={MP_TITLE_STYLE}>Movements</span>
              <button
                type="button"
                style={MP_CLOSE_STYLE}
                onClick={() => setMovementsOpen(false)}
              >
                ×
              </button>
            </div>

            <div>
              <div style={MP_SECTION_LABEL_STYLE}>Player</div>
              <div style={MP_BUTTON_ROW}>
                {movementsRoutedPlayers.map((p) => (
                  <button
                    key={p.playerId}
                    type="button"
                    style={movementsSelectedPlayerId === p.playerId ? MP_BTN_ACTIVE : MP_BTN}
                    onClick={() => setMovementsSelectedPlayerId(
                      movementsSelectedPlayerId === p.playerId ? null : p.playerId
                    )}
                  >
                    P{p.number}
                  </button>
                ))}
              </div>
            </div>

            {movementsSelectedPlayerId ? (
              <>
                <div>
                  <div style={MP_SECTION_LABEL_STYLE}>Movement Type</div>
                  <div style={MP_BUTTON_ROW}>
                    {([
                      { id: "support-run" as MovementConcept, label: "Support" },
                      { id: "overlap" as MovementConcept, label: "Overlap" },
                      { id: "shadow-run" as MovementConcept, label: "Shadow" },
                      { id: "rotation" as MovementConcept, label: "Rotation" },
                      { id: "custom" as MovementConcept, label: "Custom" },
                    ] as const).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        style={movementsRouteConcept === opt.id ? MP_BTN_ACTIVE : MP_BTN}
                        onClick={() => onMovementsSetConcept(movementsRouteConcept === opt.id ? null : opt.id)}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div style={MP_SECTION_LABEL_STYLE}>Timing</div>
                  <div style={MP_BUTTON_ROW}>
                    {([
                      { ms: 0, label: "Now" },
                      { ms: 1000, label: "+1s" },
                      { ms: 2000, label: "+2s" },
                      { ms: 3000, label: "+3s" },
                      { ms: 4000, label: "+4s" },
                    ] as const).map((opt) => (
                      <button
                        key={opt.ms}
                        type="button"
                        style={
                          movementsRouteTrigger == null &&
                          (movementsRouteDelay === opt.ms || (opt.ms === 0 && movementsRouteDelay == null))
                            ? MP_BTN_ACTIVE
                            : MP_BTN
                        }
                        onClick={() => onMovementsSetDelay(opt.ms)}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                  {movementsOtherPlayers.length > 0 ? (
                    <div style={{ ...MP_BUTTON_ROW, marginTop: "5px" }}>
                      <span
                        style={{
                          ...MP_SECTION_LABEL_STYLE,
                          marginBottom: 0,
                          alignSelf: "center",
                          flexShrink: 0,
                          paddingRight: "2px",
                        }}
                      >
                        After
                      </span>
                      {movementsRouteTrigger != null ? (
                        <button type="button" style={MP_BTN_SECONDARY} onClick={() => onMovementsSetTrigger(null)}>
                          Clear
                        </button>
                      ) : null}
                      {movementsOtherPlayers.map((p) => (
                        <button
                          key={p.playerId}
                          type="button"
                          style={movementsRouteTrigger === p.playerId ? MP_BTN_ACTIVE : MP_BTN}
                          onClick={() => onMovementsSetTrigger(p.playerId)}
                        >
                          P{p.number}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </>
            ) : null}

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                style={{ ...MP_BTN_PRIMARY, flex: "0 0 auto", minWidth: "80px" }}
                onClick={() => setMovementsOpen(false)}
              >
                Done
              </button>
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
                style={TOOL_BUTTON_STYLE}
                onClick={() => {
                  const demo = TACTICAL_TEMPLATES.find((t) => t.id === "demo");
                  if (demo) onLoadTemplate(demo);
                }}
              >
                Demo
              </button>
              <button
                type="button"
                style={playersOpen ? TOOL_ACTIVE_STYLE : TOOL_BUTTON_STYLE}
                onClick={() => setPlayersOpen((prev) => !prev)}
              >
                Players
              </button>
              <button
                type="button"
                style={scenariosOpen ? TOOL_ACTIVE_STYLE : TOOL_BUTTON_STYLE}
                onClick={() => setScenariosOpen((prev) => !prev)}
              >
                Scenarios
              </button>
            </div>

            {activeSetupCategory !== null ? (
              <div style={PANEL_ROW_STYLE}>
                {TACTICAL_TEMPLATES.filter((t) => t.category === activeSetupCategory).map((tmpl) => (
                  <button
                    key={tmpl.id}
                    type="button"
                    style={TOOL_BUTTON_STYLE}
                    onClick={() => onLoadTemplate(tmpl)}
                  >
                    {tmpl.name}
                  </button>
                ))}
              </div>
            ) : null}


            {scenariosOpen ? (
              <>
                <div style={PANEL_ROW_STYLE}>
                  <span style={SETUP_SECTION_LABEL_STYLE}>Save</span>
                  <input
                    style={SCENARIO_INPUT_STYLE}
                    type="text"
                    placeholder="Scenario name…"
                    value={scenarioNameDraft}
                    maxLength={40}
                    onChange={(e) => setScenarioNameDraft(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") onSaveScenario(); }}
                  />
                  <button type="button" style={TOOL_BUTTON_STYLE} onClick={onSaveScenario}>
                    Save
                  </button>
                </div>
                {scenarios.length > 0 ? (
                  scenarios.map((s) => (
                    <div key={s.id} style={PANEL_ROW_STYLE}>
                      <span
                        style={{
                          ...SETUP_SECTION_LABEL_STYLE,
                          maxWidth: "130px",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          fontSize: "9px",
                          color: "rgba(200, 230, 255, 0.72)",
                          letterSpacing: "0.02em",
                          textTransform: "none",
                        }}
                        title={s.name}
                      >
                        {s.name}
                      </span>
                      <button type="button" style={TOOL_BUTTON_STYLE} onClick={() => onLoadScenario(s)}>
                        Load
                      </button>
                      <button
                        type="button"
                        style={TOOL_BUTTON_STYLE}
                        onClick={() => onDuplicateScenario(s.id)}
                      >
                        Copy
                      </button>
                      <button
                        type="button"
                        style={{ ...TOOL_BUTTON_STYLE, color: "rgba(255, 160, 160, 0.88)" }}
                        onClick={() => onDeleteScenario(s.id)}
                      >
                        Del
                      </button>
                    </div>
                  ))
                ) : (
                  <div style={PANEL_ROW_STYLE}>
                    <span style={SETUP_SECTION_LABEL_STYLE}>No saved scenarios yet</span>
                  </div>
                )}
              </>
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
